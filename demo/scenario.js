import { fixtures, referees, teams, defaultFixtureId, dataProvenance } from './data.js';
import { recommend } from './engine.js';
import { findNextMeeting, validatePlanningDate } from './football-context.js';

const findReferee = id => {
  if (!referees.some(referee => referee.id === id)) throw new Error(`Unknown referee: ${id}`);
};

export function compareReferees(result, ids) {
  if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('Choose two different referees.');
  ids.forEach(findReferee);
  const candidates = ids.map(id => [...result.ranked, ...result.excluded].find(referee => referee.id === id));
  const [left, right] = candidates;
  const factors = left.eligible && right.eligible ? left.components.map((factor, index) => ({
    label: factor.label, weight: factor.weight, left: factor.points, right: right.components[index].points,
    difference: Math.round((factor.points - right.components[index].points) * 10) / 10,
  })) : [];
  let explanation;
  if (!left.eligible || !right.eligible) {
    explanation = candidates.map(referee => referee.eligible
      ? `${referee.name} is included in this analysis at ${referee.score}% fit.`
      : `${referee.name} is excluded: ${referee.exclusions.map(reason => reason.text).join(' ')} No fit score is assigned.`).join(' ');
  } else {
    const leader = left.score === right.score
      ? ([left.id, right.id].sort()[0] === left.id ? left : right)
      : left.score > right.score ? left : right;
    const other = leader === left ? right : left;
    const gap = Math.abs(left.score - right.score);
    const sorted = [...factors].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
    const differences = sorted.filter(factor => factor.difference !== 0).slice(0, 2).map(factor => {
      const favored = factor.difference > 0 ? left : right;
      return `${factor.label} contributes ${Math.abs(factor.difference).toFixed(1)} more points for ${favored.name}.`;
    });
    explanation = gap
      ? `${leader.name} leads ${other.name} by ${gap} fit points (${leader.score}% vs ${other.score}%).`
      : `Both score ${left.score}% fit. The model breaks rounded-score ties by referee ID.`;
    explanation += ` ${differences.join(' ')} Factor points are rounded separately from the final fit score.`;
  }
  return { candidates, factors, explanation };
}

export function createScenarioStore() {
  let fixtureId = defaultFixtureId;
  let planningDate = fixtures.find(fixture => fixture.id === fixtureId).date.slice(0, 10);
  const availabilityByFixture = {};
  let comparisonIds = recommend(fixtureId).ranked.slice(0, 2).map(referee => referee.id);
  let revision = 0;
  let lastChange = null;
  let undoAvailability = null;
  let proposal = null;
  let cachedRevision = -1, cachedResult;
  const listeners = new Set();
  const overrides = () => availabilityByFixture[fixtureId] ?? {};
  const result = () => {
    if (cachedRevision !== revision) { cachedResult = recommend(fixtureId, overrides(), undefined, planningDate); cachedRevision = revision; }
    return cachedResult;
  };
  const getSnapshot = () => {
    const current = result();
    return {
      fixtureId, planningDate, proposal, revision, availability: { ...overrides() }, comparisonIds: [...comparisonIds],
      result: current, comparison: compareReferees(current, comparisonIds), lastChange,
      canUndo: undoAvailability !== null,
    };
  };
  const notify = () => { for (const listener of listeners) listener(getSnapshot()); };
  const guard = expectedRevision => {
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw new Error('The scenario changed while the assistant was working. Please send the request again for the current fixture.');
    }
  };
  function updateAvailability(next, label, expectedRevision) {
    guard(expectedRevision);
    const before = result();
    undoAvailability = { ...overrides() };
    availabilityByFixture[fixtureId] = next;
    revision += 1;
    proposal = null;
    const after = result();
    lastChange = {
      label, before: before.recommended, after: after.recommended,
      rows: referees.map(referee => {
        const oldRank = before.ranked.findIndex(item => item.id === referee.id);
        const newRank = after.ranked.findIndex(item => item.id === referee.id);
        return { id: referee.id, name: referee.name, before: oldRank < 0 ? 'Excluded' : `#${oldRank + 1}`, after: newRank < 0 ? 'Excluded' : `#${newRank + 1}` };
      }).filter(row => row.before !== row.after),
    };
    notify();
    return getSnapshot();
  }
  return {
    getSnapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setAvailability(changes, expectedRevision) {
      if (!Array.isArray(changes) || changes.length === 0 || changes.length > referees.length) throw new Error(`Provide between one and ${referees.length} candidate changes.`);
      const seen = new Set();
      const next = { ...overrides() };
      for (const { refereeId, available } of changes) {
        findReferee(refereeId);
        if (typeof available !== 'boolean' || seen.has(refereeId)) throw new Error('Each referee needs one true or false availability value.');
        seen.add(refereeId);
        next[refereeId] = available;
      }
      return updateAvailability(next, changes.map(change => `${referees.find(referee => referee.id === change.refereeId).name} ${change.available ? 'included in scenario' : 'excluded from scenario'}`).join('; '), expectedRevision);
    },
    resetAvailability(expectedRevision) { return updateAvailability({}, 'Default candidate pool restored', expectedRevision); },
    undo(expectedRevision) {
      guard(expectedRevision);
      if (undoAvailability === null) throw new Error('There is no availability change to undo.');
      const previous = undoAvailability;
      const snapshot = updateAvailability(previous, 'Previous candidate pool restored', expectedRevision);
      undoAvailability = null;
      notify();
      return { ...snapshot, canUndo: false };
    },
    selectFixture(id, expectedRevision, asOf) {
      guard(expectedRevision);
      if (!fixtures.some(fixture => fixture.id === id)) throw new Error(`Unknown fixture: ${id}`);
      const date = asOf ?? fixtures.find(fixture => fixture.id === id).date.slice(0, 10);
      validatePlanningDate(date, fixtures.find(fixture => fixture.id === id));
      if (id !== fixtureId || date !== planningDate) {
        fixtureId = id;
        planningDate = date;
        revision += 1;
        proposal = null;
        lastChange = null;
        undoAvailability = null;
        const eligibleIds = result().ranked.map(referee => referee.id);
        comparisonIds = [...eligibleIds, ...referees.map(referee => referee.id).filter(refereeId => !eligibleIds.includes(refereeId))].slice(0, 2);
        notify();
      }
      return getSnapshot();
    },
    planNextMeeting(first, second, date, expectedRevision) {
      guard(expectedRevision);
      const fixture = findNextMeeting(fixtures, first, second, date);
      return this.selectFixture(fixture.id, expectedRevision, date);
    },
    propose(refereeId, expectedRevision) {
      guard(expectedRevision);
      const candidate = result().ranked.find(referee => referee.id === refereeId);
      if (!candidate) throw new Error('Only a ranked, included referee can be proposed.');
      proposal = { fixtureId, planningDate, refereeId, referee: candidate.name, score: candidate.score, status: 'Draft proposal',
        note: 'Availability, conflicts and official eligibility require confirmation before any real appointment.' };
      notify();
      return getSnapshot();
    },
    compare(ids, expectedRevision) {
      guard(expectedRevision);
      compareReferees(result(), ids);
      comparisonIds = [...ids];
      notify();
      return getSnapshot();
    },
  };
}

export function assistantFacts(snapshot) {
  return {
    dataStatus: 'Next-match assignment planning in a Premier League 2017/18 historical replay. Only earlier evidence is available. The selected match result and actual referee are withheld. Fit is an experimental recommendation; availability and conflicts are unknown.',
    sources: Object.values(dataProvenance.sources).map(source => source.article),
    refereeCatalog: referees,
    teamCatalog: Object.values(teams),
    evidence: { ...snapshot.result.evidence, table: undefined, teamProfiles: snapshot.result.evidence.teamProfiles.map(({ matchIds, ...profile }) => profile) },
    operationalStatus: snapshot.result.operationalStatus,
    fixtureMatches: snapshot.fixtureMatches,
    fixture: snapshot.result.fixture,
    planningDate: snapshot.planningDate,
    proposal: snapshot.proposal,
    revision: snapshot.revision,
    scenarioInclusion: Object.fromEntries(referees.map(referee => [referee.id, snapshot.availability[referee.id] ?? true])),
    risk: snapshot.result.risk,
    ranked: snapshot.result.ranked.map(({ id, name, score, components, flag, neutrality, history }, index) => ({ id, name, score, ...(index < 3 ? { components, flag, neutrality, history: { sample: history.sample, comparableCount: history.comparableCount, comparableMatches: history.comparableMatches.slice(0, 2), latestMatchDate: history.latestMatchDate, observedGapDays: history.observedGapDays } } : {}) })),
    excluded: snapshot.result.excluded,
    comparison: snapshot.comparison.explanation,
    lastChange: snapshot.lastChange && {
      label: snapshot.lastChange.label,
      before: snapshot.lastChange.before && { name: snapshot.lastChange.before.name, score: snapshot.lastChange.before.score },
      after: snapshot.lastChange.after && { name: snapshot.lastChange.after.name, score: snapshot.lastChange.after.score },
      rows: snapshot.lastChange.rows,
    },
  };
}
