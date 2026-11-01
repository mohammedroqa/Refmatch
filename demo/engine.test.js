import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from './engine.js';
import { fixtures, teams, referees, historicalMatches, defaultFixtureId } from './data.js';

const input = { fixtures, teams, referees, matches: historicalMatches };
test('historical golden fixture uses pre-match evidence and transparent scoring', () => {
  const result = recommend(defaultFixtureId);
  assert.equal(result.evidence.cutoff, '2018-02-10T00:00:00Z');
  assert.equal(result.evidence.leagueMatches, 260);
  assert.deepEqual(result.evidence.teamProfiles.map(team => team.sample), [26, 26]);
  // The clubs' previous head-to-head belongs to both team histories, but only
  // once in the fixture profile's combined match sample.
  assert.equal(result.evidence.relevantMatches, 51);
  const earlierClubMatches = historicalMatches.filter(match => match.date < result.evidence.cutoff &&
    [match.home, match.away].some(id => [result.fixture.home, result.fixture.away].includes(id)));
  const recentIds = new Set(result.evidence.teamProfiles.flatMap(team => team.recentMatches.map(match => match.id)));
  const recent = earlierClubMatches.filter(match => recentIds.has(match.id));
  const meanFouls = matches => matches.reduce((sum, match) => sum + Object.values(match.stats).reduce((total, stats) => total + stats.fouls, 0), 0) / matches.length;
  assert.equal(result.evidence.target.fouls, 0.4 * meanFouls(earlierClubMatches) + 0.6 * meanFouls(recent));
  assert.deepEqual(result.ranked.slice(0, 3).map(referee => [referee.name, referee.score]), [['Michael Oliver', 88], ['Mike Dean', 82], ['Martin Atkinson', 81]]);
  assert.equal(result.recommended.history.comparableCount, 9);
  for (const candidate of result.ranked) {
    assert.equal(candidate.components.length, 7);
    assert.equal(candidate.components.reduce((sum, part) => sum + part.weight, 0), 1);
    assert.equal(Math.round(candidate.components.reduce((sum, part) => sum + part.score * part.weight, 0)), candidate.score);
    assert.ok(candidate.history.matchIds.every(id => historicalMatches.find(match => match.id === id).date < result.evidence.cutoff));
    assert.match(candidate.neutrality, /Unknown/);
  }
  assert.equal(result.operationalStatus.availability, 'unknown');
  assert.equal(result.operationalStatus.conflicts, 'unknown');
});

test('target-day and future results cannot influence pre-match rankings or distributions', () => {
  const original = recommend(defaultFixtureId);
  const matches = structuredClone(historicalMatches);
  for (const match of matches.filter(match => match.date >= original.evidence.cutoff)) {
    match.refereeId = 'r384888';
    match.score = { home: 888, away: 777 };
    for (const stats of Object.values(match.stats)) for (const key of Object.keys(stats)) stats[key] = 999999;
  }
  assert.deepEqual(recommend(defaultFixtureId, {}, { ...input, matches }), original);
  const past = matches.find(match => match.date < original.evidence.cutoff && match.refereeId === original.recommended.id);
  past.stats[past.home].fouls += 300;
  assert.notDeepEqual(recommend(defaultFixtureId, {}, { ...input, matches }).ranked, original.ranked);
});

test('thin histories and unknown inputs do not receive invented scores', () => {
  const first = recommend(fixtures[0].id);
  assert.equal(first.recommended, null);
  assert.equal(first.evidence.leagueMatches, 0);
  assert.ok(Object.values(first.risk).every(metric => metric.score === null && metric.value === null));
  assert.ok(first.excluded.every(candidate => candidate.score === undefined && candidate.exclusions.some(reason => reason.code === 'INSUFFICIENT_TEAM_HISTORY')));
  const result = recommend(defaultFixtureId, { r385720: true });
  assert.ok(result.excluded.find(candidate => candidate.id === 'r385720').exclusions.some(reason => reason.code === 'INSUFFICIENT_REFEREE_HISTORY'));
});

test('scenario exclusion changes ranking without changing remaining scores or operational unknowns', () => {
  const original = recommend(defaultFixtureId);
  const result = recommend(defaultFixtureId, { [original.recommended.id]: false });
  assert.equal(result.recommended.id, original.ranked[1].id);
  assert.equal(result.recommended.score, original.ranked[1].score);
  assert.equal(result.excluded.find(candidate => candidate.id === original.recommended.id).exclusions[0].code, 'SCENARIO_EXCLUDED');
  const none = recommend(defaultFixtureId, Object.fromEntries(referees.map(referee => [referee.id, false])));
  assert.equal(none.recommended, null);
  assert.equal(none.operationalStatus.availability, 'unknown');
  assert.deepEqual(recommend(defaultFixtureId), original);
});
