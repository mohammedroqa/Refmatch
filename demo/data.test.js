import test from 'node:test';
import assert from 'node:assert/strict';
import { dataProvenance, teams, referees, historicalMatches, fixtures } from './data.js';

test('real source records cover the complete season and retain known gaps', () => {
  assert.equal(historicalMatches.length, 380);
  assert.equal(Object.keys(teams).length, 20);
  assert.equal(referees.length, 21);
  assert.equal(referees.find(referee => referee.id === 'r384965').name, 'Michael Oliver');
  assert.equal(teams.t1609.name, 'Arsenal');
  assert.deepEqual(historicalMatches.filter(match => match.refereeId === null).map(match => match.id).sort(), ['m2499975', 'm2499985']);
  assert.deepEqual(dataProvenance.recovered_identity_ids, [384965]);
  assert.ok(Object.values(dataProvenance.sources).every(source => source.license === 'CC BY 4.0' && source.file_sha256.length === 64));
  assert.ok(referees.every(referee => !('consistency' in referee) && !('available' in referee) && !('conflict_team_ids' in referee)));
});

test('snapshot preserves source event totals and card tags, not booking minutes', () => {
  assert.deepEqual(dataProvenance.totals, { events: 643150, fouls: 8138, cards: 1221, yellowCards: 1180, redCards: 22, secondYellows: 19, duels: 176688, passes: 328657, accuratePasses: 271280, shots: 8881 });
  const games = new Map();
  for (const match of historicalMatches) {
    assert.equal(Object.keys(match.stats).length, 2);
    for (const [id, stats] of Object.entries(match.stats)) {
      games.set(id, (games.get(id) || 0) + 1);
      assert.ok(stats.cards <= stats.yellowCards + stats.redCards + stats.secondYellows);
      assert.ok(stats.cards < 15);
      assert.ok(stats.accuratePasses <= stats.passes && stats.shots >= 0);
    }
  }
  assert.ok([...games.values()].every(count => count === 38));
  assert.ok(fixtures.every(fixture => !('score' in fixture) && !('refereeId' in fixture) && !('stats' in fixture)));
});
