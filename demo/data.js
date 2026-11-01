import { historicalSnapshot } from './historical.snapshot.js';

export const teams = historicalSnapshot.teams;
export const referees = historicalSnapshot.referees;
export const historicalMatches = historicalSnapshot.matches;
// A planning fixture contains only information known before kickoff.
// Never pass its eventual score or actual appointed referee to the model/UI.
export const fixtures = historicalMatches.map(({ stats, score, refereeId, ...fixture }) => fixture);
export const defaultFixtureId = 'm2499987'; // Tottenham Hotspur vs Arsenal, 10 February 2018.
export const dataProvenance = {
  ...historicalSnapshot,
  matches: undefined, teams: undefined, referees: undefined,
  match_count: historicalMatches.length, team_count: Object.keys(teams).length, referee_count: referees.length,
};
