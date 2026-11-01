import { buildStandings, tableContext, contextSimilarity, validatePlanningDate } from './football-context.js';

export const WEEK_RULES = Object.freeze({ version: '2.0.0', windowMonths: 36, halfLifeDays: 365,
  minimumMatches: 5, recentWeight: 0.6, minimumGapDays: 3, capacityPerWeek: 1,
  weights: { fouls: 0.25, cards: 0.20, shots: 0.15, context: 0.20, experience: 0.10, spacing: 0.10 } });
const DAY = 86400000;
const metrics = ['fouls', 'cards', 'shots'];
const floors = { fouls: 4, cards: 2, shots: 8 };
const clamp = v => Math.max(0, Math.min(100, v));
const compare = (a, b) => a.localeCompare(b);
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const day = v => v?.slice(0, 10);
const days = (a, b) => (Date.parse(a) - Date.parse(b)) / DAY;
const totals = (m, metric) => Number.isFinite(m.stats?.[m.home]?.[metric]) && Number.isFinite(m.stats?.[m.away]?.[metric])
  ? m.stats[m.home][metric] + m.stats[m.away][metric] : null;
const validStats = m => metrics.every(metric => totals(m, metric) !== null);
const involves = (m, id) => m.home === id || m.away === id;
const sortMatches = (a, b) => compare(a.date, b.date) || compare(a.id, b.id);
const quantile = (a, p) => {
  const sorted = [...a].sort((x, y) => x-y), i = (sorted.length-1)*p;
  return sorted.length ? sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i%1) : 0;
};
export function windowStart(date) {
  validatePlanningDate(date);
  const d = new Date(`${date}T00:00:00Z`), month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear()-3);
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
function weighted(matches, metric, cutoff) {
  let sum = 0, weight = 0;
  for (const m of matches) {
    const value = totals(m, metric);
    if (value === null) continue;
    const w = 2 ** (-days(cutoff, m.date) / WEEK_RULES.halfLifeDays);
    sum += value*w; weight += w;
  }
  return weight ? sum/weight : null;
}
function tableFor(data, season, history) {
  const ids = data.seasonTeams[String(season)] || [];
  return buildStandings(history.filter(m => m.season === season), Object.fromEntries(ids.map(id => [id, data.teams[id]])));
}
function contextFor(fixture, table) {
  const appearances = [fixture.home, fixture.away].map(id => table.find(row => row.id === id)?.played || 0);
  return tableContext({ ...fixture, gameweek: fixture.gameweek || Math.floor(mean(appearances))+1 }, table);
}
function evidence(m, data) {
  return { id: m.id, date: m.date, season: m.season, home: data.teams[m.home].name, away: data.teams[m.away].name,
    score: m.score, referee: data.referees.find(r => r.id === m.refereeId)?.name || 'Not yet recorded', source: m.source };
}

export function prepareEvidence(data, planningDate) {
  validatePlanningDate(planningDate);
  const start = windowStart(planningDate);
  const allBefore = data.matches.filter(m => m.date < planningDate).sort(sortMatches);
  const history = allBefore.filter(m => m.date >= start);
  const table = tableFor(data, data.season, allBefore);
  // Prior appointment context uses that season's standings BEFORE its own day.
  const contexts = new Map(), completed = [];
  for (const date of [...new Set(allBefore.map(m => m.date))]) {
    const today = allBefore.filter(m => m.date === date);
    const tables = new Map();
    for (const match of today) {
      if (!tables.has(match.season)) tables.set(match.season, tableFor(data, match.season, completed));
      if (match.date >= start) contexts.set(match.id, contextFor(match, tables.get(match.season)));
    }
    completed.push(...today);
  }
  return { planningDate, start, history, table, contexts,
    scales: Object.fromEntries(metrics.map(metric => {
      const values = history.map(m => totals(m, metric)).filter(Number.isFinite);
      return [metric, Math.max(floors[metric], quantile(values, .9)-quantile(values, .1))];
    })) };
}

export function rankFixture(data, fixture, context, roster = {}, minimumGapDays = WEEK_RULES.minimumGapDays) {
  const { planningDate, history, table } = context;
  const teams = [fixture.home, fixture.away].map(id => {
    const games = history.filter(m => involves(m, id)), recent = games.slice(-5);
    return { ...data.teams[id], sample: games.length, statsSample: games.filter(validStats).length,
      standing: table.find(row => row.id === id), form: recent.map(m => {
        const home = m.home === id, diff = home ? m.score.home-m.score.away : m.score.away-m.score.home;
        return diff > 0 ? 'W' : diff < 0 ? 'L' : 'D';
      }), recent: recent.map(m => evidence(m, data)),
      rates: Object.fromEntries(metrics.map(metric => [metric, mean(games.map(m => m.stats?.[id]?.[metric]).filter(Number.isFinite))])) };
  });
  const relevant = history.filter(m => involves(m, fixture.home) || involves(m, fixture.away));
  const recentIds = new Set(teams.flatMap(t => t.recent.map(m => m.id)));
  const recent = relevant.filter(m => recentIds.has(m.id));
  const target = Object.fromEntries(metrics.map(metric => {
    const latest = mean(recent.map(m => totals(m, metric)).filter(Number.isFinite));
    const baseline = weighted(relevant, metric, planningDate);
    return [metric, latest === null || baseline === null ? null : .6*latest + .4*baseline];
  }));
  const matchContext = contextFor(fixture, table), ranked = [], excluded = [];
  const fixtureDay = day(fixture.kickoff);
  for (const referee of [...data.referees].sort((a,b) => compare(a.id,b.id))) {
    const settings = roster[referee.id] || {}, reasons = [];
    const games = history.filter(m => m.refereeId === referee.id), complete = games.filter(validStats);
    if (settings.availability === 'unavailable') reasons.push('Committee marked unavailable');
    if (settings.excluded) reasons.push('Removed from the candidate pool');
    if (!games.some(m => days(planningDate, m.date) <= 365) && !settings.cleared) reasons.push('No observed appointment in the preceding year; committee eligibility confirmation required');
    if ((settings.conflicts || []).some(id => [fixture.home, fixture.away].includes(id))) reasons.push('Declared team conflict');
    if (teams.some(t => t.statsSample < WEEK_RULES.minimumMatches)) reasons.push('Both teams need five earlier matches with foul, card and shot statistics');
    if (metrics.some(metric => target[metric] === null)) reasons.push('Recent match statistics are missing; the target profile cannot be calculated');
    if (complete.length < WEEK_RULES.minimumMatches) reasons.push('Fewer than five earlier appointments with complete statistics');
    const duties = [...games.map(m => ({ date: m.date, label: 'observed league appointment' })), ...(settings.commitments || []).map(date => ({ date, label: 'committee commitment' }))];
    const closeDuty = fixtureDay && duties.find(d => Math.abs(days(fixtureDay, d.date)) < minimumGapDays);
    if (closeDuty) reasons.push(`Within ${minimumGapDays} calendar days of ${closeDuty.label} on ${closeDuty.date}`);
    if (!fixtureDay) reasons.push('Kickoff date is not confirmed');
    if (fixtureDay && fixtureDay < planningDate) reasons.push('Fixture is before the planning cutoff');
    if (reasons.length) { excluded.push({ ...referee, reasons }); continue; }
    const components = metrics.map(metric => {
      const rate = weighted(complete, metric, planningDate);
      const score = Math.round(clamp(100*(1-Math.abs(rate-target[metric])/context.scales[metric])));
      return { key: metric, label: `${metric[0].toUpperCase()+metric.slice(1)} profile`, score, weight: WEEK_RULES.weights[metric],
        explanation: `${rate.toFixed(1)} per earlier appointment; target ${target[metric].toFixed(1)}; scale ${context.scales[metric].toFixed(1)}.` };
    });
    const comparable = games.filter(m => contextSimilarity(matchContext, context.contexts.get(m.id)) >= 70);
    const comparableWeight = comparable.reduce((s,m) => s + 2 ** (-days(planningDate,m.date)/365),0);
    const teamGames = games.filter(m => involves(m, fixture.home) || involves(m, fixture.away));
    const gap = teamGames.length ? days(fixtureDay, teamGames.at(-1).date) : null;
    components.push({ key: 'context', label: 'Similar table situations', score: Math.round(clamp(comparableWeight/8*100)), weight: .2,
      explanation: `${comparable.length} similar earlier appointments; ${comparableWeight.toFixed(1)} after recency weighting. Score reaches 100 at 8 weighted appointments.` },
    { key: 'experience', label: 'Evidence volume', score: Math.round(clamp(complete.length/30*100)), weight: .1,
      explanation: `${complete.length} appointments with complete statistics; reaches 100 at 30. Measures evidence volume.` },
    { key: 'spacing', label: 'Team assignment spacing', score: gap === null ? 100 : Math.round(clamp(gap/28*100)), weight: .1,
      explanation: gap === null ? 'No observed appointment with either team in the evidence window.' : `${gap} days since an observed appointment with either team; reaches 100 at 28 days.` });
    const score = Math.round(components.reduce((sum,c) => sum+c.score*c.weight,0));
    ranked.push({ ...referee, score, components, sample: games.length, statsSample: complete.length,
      comparable: comparable.slice(-3).reverse().map(m => evidence(m,data)),
      checksConfirmed: settings.availability === 'available' && settings.cleared === true,
      caveat: 'Experimental fit; committee must confirm panel eligibility, availability, conflicts and other duties.' });
  }
  ranked.sort((a,b) => b.score-a.score || compare(a.id,b.id));
  return { fixture, teams, matchContext, target, ranked, excluded,
    headToHead: relevant.filter(m => involves(m, fixture.home) && involves(m,fixture.away)).slice(-5).reverse().map(m => evidence(m,data)),
    evidence: { start: context.start, cutoff: `${planningDate}T00:00:00Z`, matches: history.length,
      statisticsThrough: history.filter(validStats).at(-1)?.date || null,
      missingStats: history.filter(m => !validStats(m)).length,
      sourceMatchIds: history.map(m => m.id) } };
}

// Rectangular Hungarian assignment: maximize filled fixtures, then total integer fit.
// Stable fixture/referee ordering and first-index tie selection make this reproducible.
export function allocateWeek(analyses, locks = {}) {
  const rows = [...analyses].sort((a,b) => compare(a.fixture.id,b.fixture.id));
  const ids = [...new Set(rows.flatMap(r => r.ranked.map(c => c.id)))].sort(compare);
  const usedLocks = new Set();
  for (const [fixtureId, rid] of Object.entries(locks)) {
    if (!rows.some(r => r.fixture.id === fixtureId && r.ranked.some(c => c.id === rid))) throw new Error('A locked referee is no longer eligible for this fixture. Unlock it to continue.');
    if (usedLocks.has(rid)) throw new Error('The same referee cannot be locked to two fixtures in this matchweek.');
    usedLocks.add(rid);
  }
  const n = rows.length, m = ids.length+n;
  if (!n) return { assignments: [], filled: 0, total: 0, complete: false };
  const cost = rows.map(row => [...ids.map(id => {
    const c = row.ranked.find(r => r.id === id), lock = locks[row.fixture.id];
    const reserved = usedLocks.has(id) && lock !== id;
    return !c || reserved || (lock && lock !== id) ? 1e8 : -10000-c.score;
  }), ...Array(n).fill(locks[row.fixture.id] ? 1e8 : 0)]);
  const u=Array(n+1).fill(0), v=Array(m+1).fill(0), p=Array(m+1).fill(0), way=Array(m+1).fill(0);
  for(let i=1;i<=n;i++) {
    p[0]=i; let j0=0; const min=Array(m+1).fill(Infinity), used=Array(m+1).fill(false);
    do {
      used[j0]=true; const i0=p[j0]; let delta=Infinity,j1=0;
      for(let j=1;j<=m;j++) if(!used[j]) {
        const cur=cost[i0-1][j-1]-u[i0]-v[j];
        if(cur<min[j]) { min[j]=cur; way[j]=j0; }
        if(min[j]<delta) { delta=min[j]; j1=j; }
      }
      for(let j=0;j<=m;j++) if(used[j]) { u[p[j]]+=delta; v[j]-=delta; } else min[j]-=delta;
      j0=j1;
    } while(p[j0]!==0);
    do { const j1=way[j0]; p[j0]=p[j1]; j0=j1; } while(j0);
  }
  const assigned=Array(n).fill(null);
  for(let j=1;j<=m;j++) if(p[j] && j<=ids.length && cost[p[j]-1][j-1]<0) assigned[p[j]-1]=ids[j-1];
  const assignments=rows.map((row,i) => {
    const candidate=row.ranked.find(c => c.id===assigned[i]) || null;
    return { fixtureId: row.fixture.id, refereeId: candidate?.id || null, referee: candidate?.name || null,
      score: candidate?.score ?? null, locked: Boolean(locks[row.fixture.id]),
      rank: candidate ? row.ranked.findIndex(c => c.id===candidate.id)+1 : null,
      checksConfirmed: candidate?.checksConfirmed || false,
      reason: !candidate ? 'No feasible referee remains in the weekly pool.' : locks[row.fixture.id] ? 'Committee selection retained.'
        : candidate.id===row.ranked[0].id ? 'Highest individual fit within a complete weekly allocation.'
        : 'Selected to maximize total weekly fit while using each referee at most once.' };
  });
  return { assignments, filled: assignments.filter(a => a.refereeId).length,
    complete: assignments.every(a => a.refereeId), total: assignments.reduce((s,a) => s+(a.score || 0),0) };
}

export function planWeek(data, { gameweek, planningDate, roster = {}, locks = {}, minimumGapDays = 3 }) {
  if (!Number.isInteger(minimumGapDays) || minimumGapDays<0 || minimumGapDays>14) throw new Error('Choose a calendar-day gap between 0 and 14.');
  const fixtures = data.fixtures.filter(f => f.gameweek === Number(gameweek));
  if (!fixtures.length) throw new Error('No fixtures in that matchweek.');
  const context = prepareEvidence(data, planningDate);
  const analyses = fixtures.map(f => rankFixture(data, f, context, roster, minimumGapDays));
  const allocation = allocateWeek(analyses, locks);
  const pendingDates = fixtures.filter(f => !f.kickoff || day(f.kickoff)<planningDate);
  return { season: data.season, gameweek: Number(gameweek), planningDate, snapshotId: data.snapshotId,
    modelVersion: WEEK_RULES.version, analyses, table: context.table, ...allocation,
    approvable: allocation.complete && !pendingDates.length && allocation.assignments.every(a => a.checksConfirmed),
    evidence: { start: context.start, cutoff: `${planningDate}T00:00:00Z`, matchCount: context.history.length,
      statisticsThrough: context.history.filter(validStats).at(-1)?.date || null,
      resultsThrough: context.history.at(-1)?.date || null, missingStats: context.history.filter(m => !validStats(m)).length } };
}
