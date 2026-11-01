import { planWeek, WEEK_RULES } from './weekly-engine.js';
import { validatePlanningDate } from './football-context.js';

export function createWeeklyStore(data, { today = new Date().toISOString().slice(0,10), storage = null } = {}) {
  const storageKey = `refmatch-committee-v2-${data.season}`;
  const weeks = [...new Set(data.fixtures.map(f => f.gameweek).filter(Number.isInteger))].sort((a,b) => a-b);
  const next = weeks.find(week => data.fixtures.filter(f => f.gameweek === week).every(f => f.kickoff && f.kickoff.slice(0,10)>=today && !f.started));
  let state = { gameweek: next || weeks.at(-1), planningDate: today, roster: {}, locks: {}, minimumGapDays: 3,
    approval: null, revision: 0, approvedWeeks: {}, snapshotId: data.snapshotId };
  let persistenceError = '', result;
  const listeners = new Set();
  if (storage) {
    try {
      const saved = JSON.parse(storage.getItem(storageKey) || 'null');
      if (saved) {
        validatePlanningDate(saved.planningDate);
        if (!weeks.includes(saved.gameweek) || saved.planningDate>today || !saved.roster || !Number.isInteger(saved.minimumGapDays)) throw new Error('Invalid saved plan');
        state = { ...state, ...saved, revision: 0 };
        if (saved.snapshotId !== data.snapshotId) { state.approval = null; state.locks = {}; state.approvedWeeks = {}; }
        state.snapshotId = data.snapshotId;
      }
    } catch { persistenceError = 'Saved settings could not be restored. Starting a fresh plan.'; }
  }
  function effectiveRoster(s) {
    const roster = structuredClone(s.roster);
    for (const [week, approval] of Object.entries(s.approvedWeeks)) {
      if (Number(week) === s.gameweek) continue;
      for (const duty of approval.duties) {
        roster[duty.refereeId] ??= {};
        roster[duty.refereeId].commitments = [...(roster[duty.refereeId].commitments || []), duty.date];
      }
    }
    return roster;
  }
  function calculate(s) { return planWeek(data, { ...s, roster: effectiveRoster(s) }); }
  try { result = calculate(state); }
  catch { state.locks = {}; state.roster = {}; state.approvedWeeks = {}; state.approval = null; result = calculate(state); }
  function save() {
    if (!storage) return;
    try { storage.setItem(storageKey, JSON.stringify(state)); }
    catch { persistenceError = 'Browser storage is unavailable. Download the evidence brief to keep this plan.'; }
  }
  const snapshot = () => ({ ...structuredClone(state), result, weeks, persistenceError });
  function update(changes, invalidate = true) {
    const nextState = { ...structuredClone(state), ...changes, approval: null, revision: state.revision+1 };
    // Editing an approved week retracts its local approval and its reserved duties.
    if (invalidate) delete nextState.approvedWeeks[String(nextState.gameweek)];
    const nextResult = calculate(nextState);
    state = nextState; result = nextResult; save(); listeners.forEach(fn => fn(snapshot()));
    return snapshot();
  }
  return {
    getSnapshot: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    selectWeek(gameweek) {
      if (!weeks.includes(Number(gameweek))) throw new Error('Choose a scheduled matchweek.');
      return update({ gameweek: Number(gameweek), locks: {} }, false);
    },
    setPlanningDate(planningDate) {
      validatePlanningDate(planningDate);
      if (planningDate>today) throw new Error('Evidence cannot be reconstructed from a future planning date.');
      if (planningDate<`${data.season}-07-01`) throw new Error('Choose a planning date in the selected season.');
      return update({ planningDate, locks: {} });
    },
    setGap(value) { return update({ minimumGapDays: Number(value), locks: {}, approvedWeeks: {} }); },
    setReferee(id, values) {
      if (!data.referees.some(r => r.id===id)) throw new Error('Unknown referee.');
      const allowed = ['availability', 'cleared', 'excluded', 'conflicts', 'commitments'];
      if (Object.keys(values).some(k => !allowed.includes(k))) throw new Error('Unknown referee setting.');
      if (values.availability && !['unknown','available','unavailable'].includes(values.availability)) throw new Error('Invalid availability.');
      if (['cleared','excluded'].some(k => k in values && typeof values[k] !== 'boolean')) throw new Error('Invalid confirmation.');
      if (values.conflicts && (!Array.isArray(values.conflicts) || values.conflicts.some(id => !data.teams[id]))) throw new Error('Unknown conflict team.');
      if (values.commitments) {
        if (!Array.isArray(values.commitments)) throw new Error('Provide commitment dates.');
        values.commitments.forEach(date => validatePlanningDate(date));
      }
      return update({ roster: { ...state.roster, [id]: { ...state.roster[id], ...values } }, locks: {}, approvedWeeks: {} });
    },
    lock(fixtureId, refereeId) {
      const locks = { ...state.locks };
      if (refereeId) locks[fixtureId] = refereeId; else delete locks[fixtureId];
      return update({ locks });
    },
    regenerate() { return update({ locks: {} }); },
    approve(reviewer) {
      if (!reviewer?.trim()) throw new Error('Enter the reviewer name to record local approval.');
      if (!result.approvable) throw new Error('Fill every fixture and confirm availability, eligibility, conflicts and other duties for all selected referees.');
      if (result.analyses.some(a => a.fixture.started || a.fixture.finished || a.fixture.kickoff.slice(0,10)<today || Date.parse(a.fixture.kickoff)<=Date.now())) throw new Error('A match in this week has already started. Choose an upcoming matchweek.');
      state.approval = { reviewer: reviewer.trim(), recordedAt: new Date().toISOString(), snapshotId: data.snapshotId,
        modelVersion: WEEK_RULES.version, status: 'Approved locally; not an official appointment',
        duties: result.assignments.map(a => ({ refereeId: a.refereeId, fixtureId: a.fixtureId,
          date: result.analyses.find(r => r.fixture.id===a.fixtureId).fixture.kickoff.slice(0,10) })) };
      state.approvedWeeks[String(state.gameweek)] = structuredClone(state.approval);
      save(); listeners.forEach(fn => fn(snapshot())); return snapshot();
    },
    exportBrief() {
      return { format: 'refmatch-weekly-evidence-v2', season: data.seasonLabel, ...snapshot(), rules: WEEK_RULES,
        effectiveRoster: effectiveRoster(state), sources: data.sources, sourceNotes: data.notes,
        evidenceMatches: data.matches.filter(m => m.date>=result.evidence.start && m.date<state.planningDate),
        contextSupportMatches: data.matches.filter(m => m.date<result.evidence.start && m.season>=data.season-3),
        interpretation: 'Scores measure experimental fit, not quality or probability. Historical publication times are not archived. Local approval does not submit appointments.' };
    },
  };
}
