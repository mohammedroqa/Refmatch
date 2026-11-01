import test from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom, toArray } from 'rxjs';
import { CopilotStudioAgent, explainToolResult, parseStudioAction, requestStudioAction, studioConfig } from './copilot-studio.mjs';
import { createStudioTestFetch, studioTestConfig } from './test-studio-transport.mjs';
import { createScenarioStore, assistantFacts } from '../demo/scenario.js';

const input = (content = 'Compare Michael Oliver and Mike Dean') => ({ threadId: 'thread', runId: 'run', messages: [{ id: 'u', role: 'user', content }], context: [{ description: 'scenario', value: JSON.stringify(assistantFacts(createScenarioStore().getSnapshot())) }], tools: [{ name: 'compare_referees' }] });

test('Studio accepts only correlated, bounded actions with valid arguments', () => {
  const valid = { requestId: 'r', tool: 'set_availability', arguments: { changes: [{ refereeId: 'r384965', available: false }] } };
  assert.deepEqual(parseStudioAction(JSON.stringify(valid), 'r'), { tool: valid.tool, arguments: valid.arguments });
  for (const value of [
    { ...valid, requestId: 'old' }, { ...valid, tool: 'change_score' }, { ...valid, tool: 'constructor' },
    { ...valid, arguments: { changes: [{ refereeId: 'G', available: false }] } },
    { ...valid, arguments: { changes: [{ refereeId: 'r384965', available: 'false' }] } },
    { ...valid, arguments: { changes: [...valid.arguments.changes, ...valid.arguments.changes] } },
    { requestId: 'r', tool: 'compare_referees', arguments: { first: 'r384965', second: 'r384965' } },
    { ...valid, tool: 'inspect_fixture', arguments: { score: 100 } },
  ]) assert.equal(parseStudioAction(value, 'r'), null);
  assert.equal(parseStudioAction('Here is an answer with no action.', 'r'), null);
});

test('Studio exchanges token, starts a conversation, posts current context and receives action', async () => {
  const calls = [];
  const result = await requestStudioAction(input(), studioTestConfig, { fetchImpl: createStudioTestFetch({ calls }), pollMs: 0 });
  assert.deepEqual(result, { tool: 'compare_referees', arguments: { first: 'r384965', second: 'r385909' } });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].headers.Authorization, 'Bearer test-token');
  assert.match(calls[2].body, /currentScenario/);
  assert.match(calls[2].body, /latestUserRequest/);
  assert.equal(calls.length, 4);
});

test('Secured channels exchange secret only on server and support regional URL', async () => {
  const calls = [];
  const config = { ...studioTestConfig, tokenEndpoint: '', secret: 'test-secret', directLineUrl: 'https://region.test/v3/directline' };
  await requestStudioAction(input(), config, { fetchImpl: createStudioTestFetch({ calls }), pollMs: 0 });
  assert.equal(calls[0].url, `${config.directLineUrl}/tokens/generate`);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-secret');
  assert.ok(calls.slice(1).every(call => call.headers.Authorization === 'Bearer test-token'));
  assert.equal(studioConfig({}), null);
  assert.throws(() => studioConfig({ COPILOT_STUDIO_TOKEN_ENDPOINT: 'http://insecure.test' }), /HTTPS/);
});

test('Polling retains watermark, ignores greeting/old response, then accepts matching action', async () => {
  let poll = 0;
  let requestId;
  const original = createStudioTestFetch({ reply: value => {
    requestId = value.requestId;
    return { type: 'message', text: 'Welcome' };
  } });
  const urls = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/activities') && options.method === 'GET') {
      urls.push(url);
      poll++;
      if (poll === 2) return Response.json({ watermark: null, activities: [{ type: 'message', text: JSON.stringify({ requestId: 'stale', tool: 'reset_availability', arguments: {} }) }] });
      if (poll === 3) return Response.json({ activities: [{ type: 'event', name: 'refmatch.action', value: { requestId, tool: 'inspect_fixture', arguments: {} } }] });
    }
    return original(url, options);
  };
  assert.equal((await requestStudioAction(input(), studioTestConfig, { fetchImpl, pollMs: 0 })).tool, 'inspect_fixture');
  assert.ok(urls[1].endsWith('?watermark=1'));
  assert.ok(urls[2].endsWith('?watermark=1'));
});

test('Studio sign-in requests and failures are actionable without leaking provider content', async () => {
  await assert.rejects(requestStudioAction(input(), studioTestConfig, { fetchImpl: createStudioTestFetch({ reply: () => ({ type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.oauth' }] }) }) }), { code: 'COPILOT_STUDIO_SIGN_IN' });
  await assert.rejects(requestStudioAction(input(), studioTestConfig, { fetchImpl: async () => new Response('secret provider body', { status: 401 }) }), error => error.code === 'COPILOT_STUDIO_CONNECTION' && /401/.test(error.message) && !/secret provider body/.test(error.message));
  await assert.rejects(requestStudioAction(input(), studioTestConfig, { fetchImpl: createStudioTestFetch({ reply: () => ({ type: 'endOfConversation' }) }) }), { code: 'COPILOT_STUDIO_FORMAT' });
});

test('Cancellation aborts a pending Studio request', async () => {
  const controller = new AbortController();
  const result = requestStudioAction(input('Slow compare Michael Oliver and Mike Dean'), studioTestConfig, { fetchImpl: createStudioTestFetch(), signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(result, { name: 'AbortError' });
});

test('AG-UI bridge emits one tool call and then explains the actual engine result', async () => {
  const agent = new CopilotStudioAgent(studioTestConfig, { fetchImpl: createStudioTestFetch(), pollMs: 0 });
  const events = await firstValueFrom(agent.clone().run(input()).pipe(toArray()));
  assert.deepEqual(events.map(event => event.type), ['RUN_STARTED', 'TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'RUN_FINISHED']);
  assert.equal(events[1].toolCallName, 'compare_referees');
  const store = createScenarioStore();
  const facts = assistantFacts(store.setAvailability([{ refereeId: 'r384965', available: false }]));
  const result = { id: 't', role: 'tool', toolCallId: 'action', content: JSON.stringify({ ok: true, ...facts }) };
  assert.match(explainToolResult(result, []), /Mike Dean leads at 82%/);
  assert.match(explainToolResult(result, []), /Michael Oliver: Removed from this scenario/);
  const summaryEvents = await firstValueFrom(agent.run({ ...input(), messages: [result] }).pipe(toArray()));
  assert.match(summaryEvents.find(event => event.type === 'TEXT_MESSAGE_CONTENT').delta, /82%/);
  const stale = { ...result, content: JSON.stringify({ ok: false, error: 'The fixture changed. Please retry.' }) };
  assert.equal(explainToolResult(stale, []), 'The fixture changed. Please retry.');
});
