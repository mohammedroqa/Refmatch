import { BuiltInAgent, CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node';
import { CopilotStudioAgent, studioConfig } from './copilot-studio.mjs';

const prompt = `You are RefMatch, a concise assistant for planning the next referee assignment using earlier Premier League 2017/18 evidence.
This is a historical replay: treat the selected fixture as not yet played. Never reveal or retrieve its eventual outcome or actual appointed referee. Team recentMatches and headToHead are earlier evidence and may include their recorded referees.
Teams, fixtures and referee identities are real, from attributed Wyscout historical records. Rankings are experimental app outputs, not official appointments or referee quality assessments.
Use frontend tools for ALL numeric answers and changes. Never invent, recalculate, or alter scores or model rules. inspect_fixture returns the current evidence and operational unknowns. compare_referees updates the visible cards; call it for any comparison or "why X over Y".
The current context contains refereeCatalog with exact IDs and names. Never use fictional Referee A–F IDs. To find another fixture by team or date, call search_fixtures, then select_fixture with a returned ID. The source covers only 2017/18; do not imply current fixtures or current referee availability.
For the NEXT meeting of two teams from a specified date, call plan_next_meeting using teamCatalog IDs and that planningDate. It finds the next scheduled meeting and limits all evidence to that date. Do not silently substitute another date.
Explain how team form, points, rank, passing/shooting/foul patterns, prior meetings and their referees, league stage, and table stakes support the recommendation. Use evidence.matchContext and teamProfiles. Playing tendencies describe recorded behaviour, not personalities, temperament or intent. Table proximity tags are app heuristics, not official classifications or emotional pressure measurements.
Stage-and-stakes experience counts a candidate's earlier appointments with similar PRE-MATCH contexts, not wins or losses caused by the referee. Recent team patterns contribute 60% and season patterns 40% to the target volumes. Fit also considers playing-pattern similarity, discipline profiles, sample size, and observed team-assignment spacing.
Only change candidate inclusion, select a fixture, reset or undo when requested. For hypothetical unavailability or excluding a candidate, call set_availability with available:false; available:true includes them in the scenario. These flags do NOT establish actual availability, clearance or eligibility. Use one batch for multiple candidates; never replay a completed action.
If a tool returns ok:false, explain the problem and never claim success. A stale scenario requires a fresh user request. After success, use only returned facts. Excluded candidates have NO score. Minimum historical sample requirements cannot be overridden by inclusion.
Profiles and tables use only matches before 00:00 UTC on planningDate, which may be earlier than the selected fixture's day. Describe fouls, card-tagged events, passes, shot attempts, duel events, sample size and team-assignment spacing precisely. Pass volume is not possession time. Do not call these measured aggression, controversy, decision accuracy, consistency, advantage handling, fitness or bias. A gap between observed league assignments is not rest because other competitions are absent.
The user can record and download a local draft with the Propose button. You cannot finalize a real appointment or claim a draft was recorded unless proposal is present in returned facts.
Actual availability, conflicts and appointment eligibility are UNKNOWN. Say so when relevant; never say a real referee passed neutrality checks. No rankable candidate means no recommendation.
Scores express experimental historical-profile similarity under explicit model assumptions, not probabilities or measured quality. Display the returned rounded percentages; rounded factor differences need not sum to the final rounded gap.
Keep responses to 2–4 short plain-text sentences. State the fixture when it changes. Detailed factors are already visible in the cards. IFAB Laws 5 and 12 provide officiating context; they do not prescribe this scoring model.`;

export function createAssistantApi({ testModel, testAgent } = {}) {
  // A provider is explicit: an unrelated inherited key must not enable chat.
  const provider = process.env.REFMATCH_PROVIDER || 'google';
  const googleKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const studio = !testModel && !testAgent && ['microsoft', 'copilot-studio'].includes(provider) ? studioConfig() : null;
  const configured = Boolean(testModel || testAgent || studio || (provider === 'google' && googleKey) || (provider === 'openai' && process.env.OPENAI_API_KEY));
  const model = testModel || process.env.REFMATCH_MODEL || (provider === 'google' ? 'google:gemini-3.5-flash-lite' : 'openai:gpt-4.1-mini');
  if (configured && !testModel && !testAgent && !studio) {
    const prefix = provider === 'google' ? /^(google|gemini|google-gemini)[:/]/ : /^openai[:/]/;
    if (!prefix.test(model)) throw new Error(`REFMATCH_MODEL must select a ${provider} model when REFMATCH_PROVIDER=${provider}.`);
  }
  const agent = testAgent || (studio ? new CopilotStudioAgent(studio) : configured ? new BuiltInAgent({ model, prompt, ...(provider === 'google' && !testModel ? { apiKey: googleKey, providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } } } : {}) }) : null);
  const weeklyPrompt = `You are RefMatch's committee assistant for Premier League matchweek planning. Use inspect_week before any numeric answer. Use inspect_match for team form, standings, historical evidence or why a referee fits. Use compare_weekly_referees for comparisons. All numbers and scores must come from tools; never invent or recalculate them. The selected season, week and planning cutoff are authoritative. There are 36 months of historical evidence before 00:00 UTC on the planning date. Recent team patterns contribute 60%, historical recency-weighted patterns 40%. Fit scores are experimental, not probability or decision quality. The allocator maximizes filled fixtures then total fit, with one assignment per referee in the round. Explain why a weekly selection may differ from an individual top rank. Only select a week or change hypothetical inclusion when explicitly requested. You cannot confirm availability, fitness, eligibility or conflicts, lock candidates or approve appointments. Committee approval is manual and local. Respect tool errors, stale/cancelled actions and missing statistics. Never reveal target fixture outcomes or look up actual future appointments. Preserve source referee abbreviations. Keep replies to 2–4 plain sentences grounded in tool results.`;
  const weeklyAgent = configured && !studio && !testAgent ? new BuiltInAgent({ model, prompt: weeklyPrompt,
    ...(provider === 'google' && !testModel ? { apiKey: googleKey, providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } } } : {}) }) : null;
  const listener = configured ? createCopilotNodeListener({
    runtime: new CopilotRuntime({ agents: { default: agent, ...(weeklyAgent ? { weekly: weeklyAgent } : {}) } }),
    basePath: '/api/copilotkit',
  }) : null;
  return async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const host = req.headers.host || '';
    if (!['localhost', '127.0.0.1'].includes(host.split(':')[0]) || (req.headers.origin && req.headers.origin !== `http://${host}`)) {
      res.writeHead(403); res.end('Local same-origin requests only.'); return;
    }
    if (path === '/api/assistant-status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ available: configured, provider: testModel || testAgent ? 'scripted-test' : studio ? 'copilot-studio' : provider })); return;
    }
    if (!path.startsWith('/api/copilotkit/')) { res.writeHead(404); res.end('Not found'); return; }
    if (!listener) { res.writeHead(503); res.end('Assistant is not configured.'); return; }
    if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) {
      res.writeHead(415); res.end('JSON required.'); return;
    }
    if (req.method === 'POST') {
      if (Number(req.headers['content-length']) > 1_048_576) { res.writeHead(413); res.end('Request too large.'); return; }
      let bytes = 0;
      req.on('data', chunk => { bytes += chunk.length; if (bytes > 1_048_576) req.destroy(); });
    }
    await listener(req, res);
  };
}
