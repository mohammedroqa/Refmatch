import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStandings, findNextMeeting } from './football-context.js';
import { fixtures, teams, historicalMatches, defaultFixtureId } from './data.js';
import { recommend } from './engine.js';
import { createScenarioStore, assistantFacts } from './scenario.js';

test('pre-match table, recent form and previous meeting explain the next assignment', () => {
  const result = recommend(defaultFixtureId);
  const [spurs, arsenal] = result.evidence.teamProfiles;
  assert.deepEqual([spurs.standing.rank, spurs.standing.points, spurs.standing.played], [5, 49, 26]);
  assert.deepEqual([arsenal.standing.rank, arsenal.standing.points, arsenal.standing.played], [6, 45, 26]);
  assert.deepEqual(spurs.form, ['D', 'W', 'D', 'W', 'D']);
  assert.deepEqual(arsenal.form, ['D', 'L', 'W', 'L', 'W']);
  assert.equal(spurs.recentMatches.at(-1).referee, 'Not recorded in source');
  assert.equal(result.evidence.matchContext.phase, 'Mid-season');
  assert.deepEqual(result.evidence.matchContext.tags, ['Top-four proximity', 'Close table rivals']);
  assert.equal(result.evidence.headToHead.length, 1);
  assert.deepEqual(result.evidence.headToHead[0].score, { home: 2, away: 0 });
  assert.equal(result.evidence.headToHead[0].referee, 'Mike Dean');
  assert.ok(spurs.tendencies.every(trait => trait.percentile >= 0 && trait.percentile <= 100));
});

test('table reconstruction matches season totals and preserves exact tied positions', () => {
  const table = buildStandings(historicalMatches, teams);
  assert.deepEqual(table.slice(0, 3).map(row => [row.name, row.points, row.goalDifference]), [
    ['Manchester City', 100, 79], ['Manchester United', 81, 40], ['Tottenham Hotspur', 77, 38],
  ]);
  assert.ok(table.every(row => row.played === 38 && row.won + row.drawn + row.lost === 38));
  assert.equal(table.reduce((sum, row) => sum + row.goalsFor, 0), table.reduce((sum, row) => sum + row.goalsAgainst, 0));
  const tied = buildStandings([{ home: 'a', away: 'b', score: { home: 1, away: 1 } }], { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' } });
  assert.deepEqual(tied.map(row => [row.rank, row.points]), [[1, 1], [1, 1]]);
});

test('planning from an earlier date excludes results between that date and kickoff', () => {
  const before = recommend(defaultFixtureId, {}, undefined, '2018-02-01');
  assert.equal(before.evidence.leagueMatches, 250);
  assert.deepEqual(before.evidence.teamProfiles.map(team => team.standing.points), [48, 42]);
  const modified = structuredClone(historicalMatches);
  for (const match of modified.filter(match => match.date >= before.evidence.cutoff)) {
    match.score = { home: 100, away: 0 }; match.refereeId = 'r384965';
    for (const stats of Object.values(match.stats)) for (const key of Object.keys(stats)) stats[key] = 100000;
  }
  assert.deepEqual(recommend(defaultFixtureId, {}, { fixtures, teams, matches: modified, referees: before.ranked.concat(before.excluded).map(({ id, name }) => ({ id, name })) }, '2018-02-01').evidence, before.evidence);
  assert.throws(() => recommend(defaultFixtureId, {}, undefined, '2018-02-11'), /before/);
  assert.throws(() => recommend(defaultFixtureId, {}, undefined, '2018-02-31'), /valid planning date/);
});

test('next-meeting search is chronological and failed plans are atomic', () => {
  assert.equal(findNextMeeting(fixtures, 't1624', 't1609', '2017-08-11').id, 'm2499830');
  assert.equal(findNextMeeting(fixtures, 't1609', 't1624', '2017-11-19').id, defaultFixtureId);
  const store = createScenarioStore();
  store.planNextMeeting('t1624', 't1609', '2018-02-01');
  const before = store.getSnapshot();
  assert.equal(before.planningDate, '2018-02-01');
  assert.throws(() => store.planNextMeeting('t1624', 't1609', '2018-05-14'), /No next meeting/);
  assert.throws(() => store.planNextMeeting('t1624', 't1624', '2018-02-01'), /different/);
  assert.deepEqual(store.getSnapshot(), before);
  const facts = assistantFacts(before);
  assert.equal('score' in facts.fixture, false);
  assert.equal('refereeId' in facts.fixture, false);
  assert.ok(facts.evidence.teamProfiles.flatMap(team => team.recentMatches).every(match => match.id !== before.fixtureId && match.date < before.planningDate));
});

test('draft proposal records an included candidate and is invalidated by changing the plan', () => {
  const store = createScenarioStore();
  const original = store.getSnapshot(), lead = original.result.recommended;
  assert.equal(store.propose(lead.id).proposal.referee, 'Michael Oliver');
  assert.equal(store.getSnapshot().proposal.status, 'Draft proposal');
  store.setAvailability([{ refereeId: lead.id, available: false }]);
  assert.equal(store.getSnapshot().proposal, null);
  assert.throws(() => store.propose(lead.id), /ranked, included/);
  assert.throws(() => store.propose(store.getSnapshot().result.recommended.id, original.revision), /scenario changed/);
  store.propose(store.getSnapshot().result.recommended.id);
  store.planNextMeeting('t1624', 't1609', '2018-02-01');
  assert.equal(store.getSnapshot().proposal, null);
  store.propose(store.getSnapshot().result.recommended.id);
  store.selectFixture('m2499830');
  assert.equal(store.getSnapshot().proposal, null);
});
