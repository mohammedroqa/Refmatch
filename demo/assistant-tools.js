import { actionSchemas } from './assistant-contract.js';
import { fixtures } from './data.js';
import { assistantFacts } from './scenario.js';

export function createAssistantTools(store, session) {
  const define = (name, description, execute) => ({
    name, description, parameters: actionSchemas[name],
    handler(args, context) {
      try {
        if (!session.active() || context?.signal?.aborted) throw new Error('This request has stopped. No further changes were applied.');
        if (session.revision() !== store.getSnapshot().revision) throw new Error('The fixture or availability changed during this request. Please ask again for the current scenario.');
        const snapshot = execute(actionSchemas[name].parse(args), session.revision());
        session.updated(snapshot.revision);
        session.completed(name, snapshot);
        return { ok: true, ...assistantFacts(snapshot) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
  });
  return [
    define('search_fixtures', 'Find real 2017/18 fixtures by team name or ISO date before selecting a different fixture. Returns at most ten matches; refine the query if needed.', ({ query }) => {
      const words = query.toLowerCase().replace(/[^a-z0-9 -]/g, '').split(/\s+/).filter(word => !['vs', 'v', 'versus', 'and'].includes(word));
      const fixtureMatches = fixtures.filter(fixture => words.every(word => `${fixture.label} ${fixture.date}`.toLowerCase().includes(word))).slice(0, 10);
      return { ...store.getSnapshot(), fixtureMatches };
    }),
    define('inspect_fixture', 'Read the current calculated ranking, historical match profile, factor contributions and exclusion reasons. Use before explaining a recommendation.', () => store.getSnapshot()),
    define('compare_referees', 'Display live comparison cards for two distinct referees and return the calculated explanation, including sample and scenario exclusions.', ({ first, second }, revision) => store.compare([first, second], revision)),
    define('set_availability', 'Include or exclude candidates in the CURRENT historical scenario. The available argument controls scenario inclusion only; actual availability is unknown. Accept multiple referees in one atomic change. Minimum historical samples cannot be overridden.', ({ changes }, revision) => store.setAvailability(changes, revision)),
    define('reset_availability', 'Restore the default hypothetical candidate pool for the current fixture when the user asks to reset. Actual availability remains unknown.', (_, revision) => store.resetAvailability(revision)),
    define('undo_change', 'Undo the most recent hypothetical candidate inclusion change for the current fixture.', (_, revision) => store.undo(revision)),
    define('select_fixture', 'Select a real historical fixture using its ID returned by search_fixtures.', ({ fixtureId }, revision) => store.selectFixture(fixtureId, revision)),
    define('plan_next_meeting', 'Plan for the next meeting of two teams from a specified YYYY-MM-DD planning date in the 2017/18 replay. Use team IDs from teamCatalog. Evidence is cut off at the planning date, even if kickoff is later.', ({ firstTeam, secondTeam, planningDate }, revision) => store.planNextMeeting(firstTeam, secondTeam, planningDate, revision)),
  ];
}
