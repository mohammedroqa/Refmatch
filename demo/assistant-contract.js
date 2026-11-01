import { z } from 'zod';
import { referees, fixtures, teams } from './data.js';

const refereeId = z.enum(referees.map(referee => referee.id));
const teamId = z.enum(Object.keys(teams));
// Shared by the browser tools and the Studio bridge. A provider cannot add actions.
export const actionSchemas = {
  search_fixtures: z.object({ query: z.string().trim().min(2).max(100) }).strict(),
  inspect_fixture: z.object({}).strict(),
  compare_referees: z.object({ first: refereeId, second: refereeId }).strict()
    .refine(value => value.first !== value.second, 'Choose two distinct referees.'),
  set_availability: z.object({
    changes: z.array(z.object({ refereeId, available: z.boolean() }).strict()).min(1).max(referees.length)
      .refine(changes => new Set(changes.map(change => change.refereeId)).size === changes.length, 'Use each referee once.'),
  }).strict(),
  reset_availability: z.object({}).strict(),
  undo_change: z.object({}).strict(),
  select_fixture: z.object({ fixtureId: z.string().regex(/^m\d+$/).refine(id => fixtures.some(fixture => fixture.id === id), 'Unknown historical fixture ID.') }).strict(),
  plan_next_meeting: z.object({ firstTeam: teamId, secondTeam: teamId, planningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().refine(value => value.firstTeam !== value.secondTeam, 'Choose two different teams.'),
};

export function validateAction(action) {
  if (!action || typeof action !== 'object' || !Object.hasOwn(actionSchemas, action.tool)) throw new Error('Unknown RefMatch action.');
  return { tool: action.tool, arguments: actionSchemas[action.tool].parse(action.arguments) };
}
