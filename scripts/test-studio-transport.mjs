// Test-only Direct Line service. No network or Microsoft account is used.
import { setTimeout as delay } from 'node:timers/promises';

export const studioTestConfig = { tokenEndpoint: 'https://studio.test/token', directLineUrl: 'https://studio.test/v3/directline', secret: '' };

export function createStudioTestFetch({ reply, calls = [] } = {}) {
  const conversations = new Map();
  const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  return async (url, options = {}) => {
    calls.push({ url, ...options });
    if (url.endsWith('/token') || url.endsWith('/tokens/generate')) return json({ token: 'test-token' });
    if (url.endsWith('/conversations')) {
      const conversationId = crypto.randomUUID();
      conversations.set(conversationId, {});
      return json({ conversationId, token: 'test-token' });
    }
    const id = new URL(url).pathname.split('/').at(-2);
    const conversation = conversations.get(id);
    if (!conversation) throw new Error('Unknown test conversation');
    if (options.method === 'POST') {
      const activity = JSON.parse(options.body);
      conversation.input = JSON.parse(activity.text.split('\n\n').at(-1));
      conversation.userId = activity.from.id;
      return json({ id: 'user-activity' });
    }
    const { requestId, latestUserRequest } = conversation.input;
    if (/slow/i.test(latestUserRequest)) await delay(1500, undefined, { signal: options.signal });
    const tool = /unavailable|exclude/i.test(latestUserRequest) ? 'set_availability' : /compare|lead Mike Dean/i.test(latestUserRequest) ? 'compare_referees' : 'inspect_fixture';
    const args = tool === 'set_availability' ? { changes: [{ refereeId: 'r384965', available: false }] } : tool === 'compare_referees' ? { first: 'r384965', second: 'r385909' } : {};
    const botReply = reply ? reply(conversation.input)
      : /simulate required sign-in/i.test(latestUserRequest) ? { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.oauth' }] }
      : /simulate invalid agent response/i.test(latestUserRequest) ? { type: 'endOfConversation' }
      : { type: 'message', text: JSON.stringify({ requestId, tool, arguments: args }) };
    return json({ watermark: '1', activities: [
      { type: 'message', from: { id: conversation.userId }, text: 'user echo' },
      { from: { id: 'test-agent' }, replyToId: 'user-activity', ...botReply },
    ] });
  };
}
