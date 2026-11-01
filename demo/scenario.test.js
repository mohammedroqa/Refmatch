import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenarioStore, compareReferees } from './scenario.js';
import { createAssistantTools } from './assistant-tools.js';
import { defaultFixtureId } from './data.js';

const leadId = 'r384965', secondId = 'r385909', thinId = 'r385720';
test('scenario changes preserve scores, use real names and support undo', () => {
  const store = createScenarioStore();
  const original = store.getSnapshot();
  const changed = store.setAvailability([{ refereeId: leadId, available: false }]);
  assert.equal(changed.result.recommended.id, secondId);
  assert.equal(changed.result.recommended.score, original.result.ranked[1].score);
  assert.deepEqual(changed.lastChange.rows.find(row => row.id === secondId), { id: secondId, name: 'Mike Dean', before: '#2', after: '#1' });
  assert.match(changed.lastChange.label, /Michael Oliver excluded/);
  assert.equal(store.undo().result.recommended.id, leadId);
  assert.equal(store.getSnapshot().canUndo, false);
});

test('scenario inclusion is fixture-specific and invalid batches are atomic', () => {
  const store = createScenarioStore();
  store.setAvailability([{ refereeId: leadId, available: false }]);
  store.selectFixture('m2499830');
  assert.ok(store.getSnapshot().result.ranked.some(referee => referee.id === leadId));
  const before = store.getSnapshot();
  assert.throws(() => store.setAvailability([{ refereeId: secondId, available: false }, { refereeId: 'unknown', available: false }]));
  assert.deepEqual(store.getSnapshot(), before);
  store.selectFixture(defaultFixtureId);
  assert.equal(store.getSnapshot().result.recommended.id, secondId);
});

test('comparison reports evidence and never scores a candidate with insufficient history', () => {
  const store = createScenarioStore();
  const comparison = store.compare([leadId, secondId]).comparison;
  assert.match(comparison.explanation, /6 fit points/);
  assert.equal(comparison.factors.length, 7);
  const excluded = store.compare([leadId, thinId]).comparison;
  assert.equal(excluded.factors.length, 0);
  assert.equal(excluded.candidates[1].score, undefined);
  assert.match(excluded.explanation, /earlier league appointments/);
  assert.throws(() => compareReferees(store.getSnapshot().result, [leadId, leadId]));
});

test('assistant validates real IDs, guards stale/cancelled actions and searches historical fixtures', () => {
  const store = createScenarioStore();
  let revision = 0, active = true;
  const tools = createAssistantTools(store, { revision: () => revision, active: () => active, updated: value => { revision = value; }, completed() {} });
  const inclusion = tools.find(tool => tool.name === 'set_availability');
  assert.equal(inclusion.handler({ changes: [{ refereeId: 'A', available: true }] }).ok, false);
  assert.equal(inclusion.handler({ changes: [{ refereeId: thinId, available: true }] }).ok, true);
  assert.ok(store.getSnapshot().result.excluded.some(referee => referee.id === thinId));
  const matches = tools.find(tool => tool.name === 'search_fixtures').handler({ query: 'Tottenham Arsenal 2018-02-10' });
  assert.equal(matches.fixtureMatches.length, 1);
  assert.equal(matches.fixtureMatches[0].id, defaultFixtureId);
  const plan = tools.find(tool => tool.name === 'plan_next_meeting').handler({ firstTeam: 't1624', secondTeam: 't1609', planningDate: '2018-02-01' });
  assert.equal(plan.ok, true);
  assert.equal(plan.evidence.leagueMatches, 250);
  assert.equal(plan.planningDate, '2018-02-01');
  store.selectFixture('m2499830');
  assert.equal(inclusion.handler({ changes: [{ refereeId: leadId, available: false }] }).ok, false);
  revision = store.getSnapshot().revision; active = false;
  assert.equal(inclusion.handler({ changes: [{ refereeId: leadId, available: false }] }).ok, false);
  assert.ok(store.getSnapshot().result.ranked.some(referee => referee.id === leadId));
});
