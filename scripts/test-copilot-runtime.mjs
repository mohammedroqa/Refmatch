// Test-only model: exercises real CopilotKit transport/tool execution without a
// provider account. This server is never used by npm run preview.
import { createStaticServer } from './server.mjs';
process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';
const { createAssistantApi } = await import('./copilot-runtime.mjs');
const useStudio = process.argv.includes('--studio');
const { CopilotStudioAgent } = await import('./copilot-studio.mjs');
const { createStudioTestFetch, studioTestConfig } = await import('./test-studio-transport.mjs');

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const testModel = {
  specificationVersion: 'v3', provider: 'refmatch-test', modelId: 'scripted-tools', supportedUrls: {},
  async doGenerate() { throw new Error('Test model supports streaming only.'); },
  async doStream({ prompt }) {
    const latest = prompt.filter(message => message.role !== 'system').at(-1);
    const chunks = [{ type: 'stream-start', warnings: [] }];
    let finish = 'stop';
    if (latest.role === 'tool') {
      const output = latest.content.at(-1).output;
      const facts = typeof output.value === 'string' ? JSON.parse(output.value) : output.value;
      const text = facts.ok === false ? facts.error : latest.content.at(-1).toolName === 'compare_referees'
        ? facts.comparison
        : `${facts.fixture.label}: ${facts.ranked[0] ? `${facts.ranked[0].name} leads at ${facts.ranked[0].score}% fit.` : 'No eligible referee remains.'}`;
      chunks.push({ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: text }, { type: 'text-end', id: 'answer' });
    } else {
      const text = latest.content.filter(part => part.type === 'text').map(part => part.text).join(' ');
      if (/slow/i.test(text)) await new Promise(resolve => setTimeout(resolve, 1500));
      const toolName = /unavailable|exclude/i.test(text) ? 'set_availability' : /compare|lead Mike Dean/i.test(text) ? 'compare_referees' : 'inspect_fixture';
      const args = toolName === 'set_availability' ? { changes: [{ refereeId: 'r384965', available: false }] } : toolName === 'compare_referees' ? { first: 'r384965', second: 'r385909' } : {};
      const id = crypto.randomUUID();
      const input = JSON.stringify(args);
      chunks.push({ type: 'tool-input-start', id, toolName }, { type: 'tool-input-delta', id, delta: input }, { type: 'tool-input-end', id }, { type: 'tool-call', toolCallId: id, toolName, input });
      finish = 'tool-calls';
    }
    chunks.push({ type: 'finish', finishReason: { unified: finish, raw: finish }, usage });
    return { stream: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }) };
  },
};
const port = Number(process.env.REFMATCH_TEST_PORT || 4181);
const apiHandler = createAssistantApi(useStudio ? { testAgent: new CopilotStudioAgent(studioTestConfig, { fetchImpl: createStudioTestFetch() }) } : { testModel });
const server = createStaticServer(process.cwd(), { apiHandler });
server.listen(port, '127.0.0.1', () => console.log(`TEST ONLY: ${useStudio ? 'mock Studio transport' : 'scripted model'} with CopilotKit at http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
