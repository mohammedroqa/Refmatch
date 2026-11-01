import { CopilotKitCore } from '@copilotkit/core';
import { createAssistantTools } from './assistant-tools.js';
import { assistantFacts } from './scenario.js';

export async function mountCopilot(store, { facts = assistantFacts, makeTools = createAssistantTools, agentId = 'default', onToolResult = null } = {}) {
  const status = document.querySelector('#assistant-status');
  const messages = document.querySelector('#assistant-messages');
  const form = document.querySelector('#assistant-form');
  const input = document.querySelector('#assistant-input');
  const send = document.querySelector('#assistant-send');
  const stop = document.querySelector('#assistant-stop');
  const suggestions = [...document.querySelectorAll('[data-prompt]')];
  let busy = false;
  let active = false;
  let revision = 0;
  let runError = false;
  let authenticationError = false;
  let stopped = false;
  let providerMessage = '';
  let readyLabel = 'Ready · CopilotKit';
  let contextId;
  let agent;
  const rendered = new Map();

  function appendMessage(author, content, className = '') {
    const article = document.createElement('article');
    article.className = `chat-message ${className}`;
    const label = document.createElement('span');
    label.className = 'chat-author'; label.textContent = author;
    const body = document.createElement('p'); body.textContent = content;
    article.append(label, body); messages.append(article);
    messages.scrollTop = messages.scrollHeight;
    return { article, body };
  }
  function setWorking(value) {
    busy = value;
    input.disabled = value;
    send.disabled = value;
    suggestions.forEach(button => { button.disabled = value; });
    stop.hidden = !value;
    send.hidden = value;
    status.textContent = value ? 'Working on your scenario…' : readyLabel;
    form.setAttribute('aria-busy', String(value));
  }
  const configured = await fetch('/api/assistant-status', { signal: AbortSignal.timeout(8000) }).then(response => {
    if (!response.ok) throw new Error('Connection unavailable');
    return response.json();
  }).catch(() => null);
  if (!configured?.available) {
    status.textContent = ['microsoft', 'copilot-studio'].includes(configured?.provider)
      ? 'Assistant offline · Copilot Studio connection pending. Fixture and comparison controls are ready.'
      : 'Assistant offline. You can still use the fixture, candidate inclusion, and comparison controls below.';
    return;
  }
  if (configured.provider === 'copilot-studio') readyLabel = 'Ready · Microsoft Copilot Studio';
  if (agentId === 'weekly' && configured.provider === 'copilot-studio') {
    status.textContent = 'Weekly chat requires the Google or OpenAI adapter. Committee controls are ready.';
    return;
  }
  if (configured.provider === 'google') readyLabel = 'Ready · Google Gemini';

  const copilot = new CopilotKitCore({ runtimeUrl: `${location.origin}/api/copilotkit` });
  function refreshContext() {
    if (contextId) copilot.removeContext(contextId);
    contextId = copilot.addContext({ description: 'Current RefMatch scenario and authoritative deterministic results', value: JSON.stringify(facts(store.getSnapshot())) });
  }
  refreshContext();
  store.subscribe(refreshContext);
  const session = {
    active: () => active,
    revision: () => revision,
    updated: value => { revision = value; },
    completed(name, snapshot) {
      if (onToolResult) { const text = onToolResult(name, snapshot); if (text) appendMessage('Calculated result', text, 'chat-tool'); return; }
      if (['inspect_fixture', 'search_fixtures'].includes(name)) return;
      const text = name === 'compare_referees' ? snapshot.comparison.explanation
        : `${snapshot.result.fixture.label}: ${snapshot.lastChange?.label || 'fixture selected'}. ${snapshot.result.recommended ? `${snapshot.result.recommended.name} leads at ${snapshot.result.recommended.score}% fit.` : 'No rankable candidate remains.'}`;
      const { article } = appendMessage('Calculated result', text, 'chat-tool');
      const link = document.createElement('a');
      link.href = name === 'compare_referees' ? '#compare-title' : '#decision-title';
      link.textContent = name === 'compare_referees' ? 'View the comparison cards ↓' : 'Review the shortlist ↓';
      article.append(link);
    },
  };
  for (const tool of makeTools(store, session)) copilot.addTool(tool);
  function captureError(error) {
    if (!busy) return;
    runError = true;
    if (error?.code?.startsWith('COPILOT_STUDIO_')) providerMessage = error.message;
    if (/401|403|invalid_api_key|Incorrect API key|permission_denied|caller does not have permission|API key not valid/i.test(error?.message || '')) authenticationError = true;
  }
  copilot.subscribe({ onError({ error }) { captureError(error); } });
  try {
    agent = copilot.getAgent(agentId);
    if (!agent) agent = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { subscription.unsubscribe(); reject(new Error('Connection timed out')); }, 12000);
      const subscription = copilot.subscribe({ onAgentsChanged() {
        const found = copilot.getAgent(agentId);
        if (found) { clearTimeout(timer); subscription.unsubscribe(); resolve(found); }
      } });
    });
  } catch {
    status.textContent = 'Assistant could not connect. Reload to retry; the scenario controls are ready.';
    return;
  }
  agent.subscribe({
    onMessagesChanged({ messages: updated }) {
      for (const message of updated) {
        if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content) continue;
        let item = rendered.get(message.id);
        if (!item) {
          item = appendMessage(message.role === 'user' ? 'You' : 'RefMatch', '', message.role === 'user' ? 'user-message' : 'assistant-message');
          rendered.set(message.id, item);
        }
        item.body.textContent = message.content;
      }
      messages.scrollTop = messages.scrollHeight;
    },
    onRunError({ error }) { captureError(error); },
    onRunErrorEvent({ event }) { captureError(event); },
  });
  setWorking(false);

  async function submit(text) {
    const content = text.trim();
    if (busy || !content || content.length > 1200) return;
    active = true;
    runError = false;
    authenticationError = false;
    stopped = false;
    providerMessage = '';
    revision = store.getSnapshot().revision;
    setWorking(true);
    input.value = '';
    refreshContext();
    agent.addMessage({ id: crypto.randomUUID(), role: 'user', content });
    let timer;
    try {
      await Promise.race([
        copilot.runAgent({ agent }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Response timed out')), 60000); }),
      ]);
      if (runError) throw new Error('Assistant response failed');
    } catch {
      active = false;
      copilot.stopAgent({ agent });
      if (!stopped) appendMessage(authenticationError ? 'Assistant connection needs attention' : 'Connection interrupted', providerMessage || (authenticationError
        ? 'The assistant provider rejected the server connection. Check the local provider configuration and restart the preview. The manual scenario controls are still available.'
        : 'The assistant could not finish this response. Any completed changes are shown in the calculated result cards. Review or undo them, then try your request again.'), 'chat-error');
      agent.setMessages([]);
      agent.threadId = crypto.randomUUID();
    } finally {
      clearTimeout(timer);
      active = false;
      if (stopped) {
        agent.setMessages([]);
        agent.threadId = crypto.randomUUID();
      }
      setWorking(false);
      if (authenticationError) status.textContent = 'Model connection rejected · manual controls are ready';
      input.focus({ preventScroll: true });
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void submit(input.value); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(input.value); }
  });
  suggestions.forEach(button => button.addEventListener('click', () => { void submit(button.dataset.prompt); }));
  stop.addEventListener('click', () => {
    active = false;
    stopped = true;
    copilot.stopAgent({ agent });
    appendMessage('Stopped', 'The response was stopped. Any completed scenario changes remain visible and can be undone.', 'chat-tool');
  });
}
