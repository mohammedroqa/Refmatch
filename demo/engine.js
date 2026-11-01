import { fixtures, referees, teams, historicalMatches } from './data.js';
import { validatePlanningDate, buildStandings, tableContext, appointmentContexts, contextSimilarity, enrichTeam, matchEvidence } from './football-context.js';

export const RULES = Object.freeze({
  minimumTeamMatches: 5, minimumRefereeMatches: 5, experienceMatches: 20, teamSpacingDays: 28,
  comparableMatches: 8, contextThreshold: 70, recentWeight: 0.6,
  weights: Object.freeze({ fouls: 0.20, cards: 0.15, duels: 0.10, style: 0.15, context: 0.20, experience: 0.10, spacing: 0.10 }),
});
const DEFAULT_INPUT = { fixtures, referees, teams, matches: historicalMatches };
const metrics = ['fouls', 'cards', 'events', 'duels', 'passes', 'shots'];
const labels = { fouls: 'Foul-profile similarity', cards: 'Card-profile similarity', events: 'Event-volume similarity', duels: 'Duel-profile similarity' };
const volumeLabels = { fouls: 'Fouls', cards: 'Card-tagged events', events: 'Recorded events', duels: 'Duel events', passes: 'Passes', shots: 'Shot attempts' };
const spreadFloors = { fouls: 4, cards: 2, events: 200, duels: 80, passes: 120, shots: 8 };
const clamp = value => Math.max(0, Math.min(100, value));
const round = value => Math.round(clamp(value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const day = value => value.slice(0, 10);
const daysBetween = (later, earlier) => Math.round((Date.parse(`${day(later)}T00:00:00Z`) - Date.parse(`${day(earlier)}T00:00:00Z`)) / 86400000);
const total = (match, metric) => Object.values(match.stats).reduce((sum, stats) => sum + stats[metric], 0);
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * q, low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
};

export function historicalContext(fixture, input = DEFAULT_INPUT, planningDate = day(fixture.date)) {
  // Exclude the whole match day: a kickoff timestamp is not a completion time.
  const cutoff = validatePlanningDate(planningDate, fixture);
  const history = input.matches.filter(match => match.date < cutoff).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const table = buildStandings(history, input.teams);
  const teamProfiles = [fixture.home, fixture.away].map(id => {
    const matches = history.filter(match => Object.hasOwn(match.stats, id));
    return enrichTeam({
      id, name: input.teams[id].name, sample: matches.length, matchIds: matches.map(match => match.id),
      rates: Object.fromEntries(metrics.map(metric => [metric, mean(matches.map(match => match.stats[id][metric]))])),
    }, history, table, input.referees);
  });
  const enoughTeamHistory = teamProfiles.every(team => team.sample >= RULES.minimumTeamMatches);
  const relevantMatches = history.filter(match => [match.home, match.away].some(id => [fixture.home, fixture.away].includes(id)));
  const recentIds = new Set(teamProfiles.flatMap(team => team.recentMatches.map(match => match.id)));
  const recentMatches = relevantMatches.filter(match => recentIds.has(match.id));
  const target = Object.fromEntries(metrics.map(metric => {
    const season = mean(relevantMatches.map(match => total(match, metric)));
    const recent = mean(recentMatches.map(match => total(match, metric)));
    return [metric, season === null ? null : (1 - RULES.recentWeight) * season + RULES.recentWeight * recent];
  }));
  const distributions = Object.fromEntries(metrics.map(metric => [metric, history.map(match => total(match, metric))]));
  const risk = Object.fromEntries(['fouls', 'cards', 'passes', 'duels'].map(metric => {
    const value = target[metric];
    const score = enoughTeamHistory ? round(100 * distributions[metric].filter(item => item <= value).length / history.length) : null;
    return [metric, { label: volumeLabels[metric], score, value, detail: enoughTeamHistory
      ? `${value.toFixed(1)} weighted match total; 60% recent form and 40% season history. Percentile ${score} of earlier league totals.`
      : `At least ${RULES.minimumTeamMatches} earlier matches per team required; observed ${teamProfiles.map(team => team.sample).join(' and ')}.` }];
  }));
  const matchContext = tableContext(fixture, table);
  const earlierContexts = appointmentContexts(history, input.teams);
  const headToHead = history.filter(match => [match.home, match.away].includes(fixture.home) && [match.home, match.away].includes(fixture.away)).map(match => matchEvidence(match, input.referees));
  return { cutoff, history, teamProfiles, relevantMatches, recentMatches, enoughTeamHistory, target, distributions, risk, table, matchContext, earlierContexts, headToHead };
}

export function matchRisk(fixture, input = DEFAULT_INPUT) { return historicalContext(fixture, input).risk; }

function component(code, label, value, evidence) {
  const score = round(value), weight = RULES.weights[code];
  return { code, label, score, weight, points: Math.round(score * weight * 10) / 10, evidence };
}

export function recommend(fixtureId, inclusion = {}, input = DEFAULT_INPUT, planningDate) {
  const fixture = input.fixtures.find(item => item.id === fixtureId);
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureId}`);
  const context = historicalContext(fixture, input, planningDate);
  const ranked = [], excluded = [];
  for (const referee of input.referees) {
    const history = context.history.filter(match => match.refereeId === referee.id);
    const exclusions = [];
    if (inclusion[referee.id] === false) exclusions.push({ code: 'SCENARIO_EXCLUDED', text: 'Removed from this scenario by the user; actual availability is unknown.' });
    if (!context.enoughTeamHistory) exclusions.push({ code: 'INSUFFICIENT_TEAM_HISTORY', text: `Both teams need at least ${RULES.minimumTeamMatches} earlier league matches.` });
    if (history.length < RULES.minimumRefereeMatches) exclusions.push({ code: 'INSUFFICIENT_REFEREE_HISTORY', text: `${history.length} earlier league appointments; at least ${RULES.minimumRefereeMatches} required for this model.` });
    if (exclusions.length) {
      excluded.push({ ...referee, eligible: false, sample: history.length, exclusions });
      continue;
    }
    const rates = Object.fromEntries(metrics.map(metric => [metric, mean(history.map(match => total(match, metric)))]));
    const similarity = metric => {
      const spread = Math.max(spreadFloors[metric], quantile(context.distributions[metric], 0.9) - quantile(context.distributions[metric], 0.1));
      return { score: clamp(100 * (1 - Math.abs(rates[metric] - context.target[metric]) / spread)),
        evidence: `${rates[metric].toFixed(1)} ${volumeLabels[metric].toLowerCase()} per prior appointment vs ${context.target[metric].toFixed(1)} in the teams' weighted match profile; scale ${spread.toFixed(1)}.` };
    };
    const components = ['fouls', 'cards', 'duels'].map(metric => {
      const match = similarity(metric);
      return component(metric, labels[metric], match.score, match.evidence);
    });
    const passes = similarity('passes'), shots = similarity('shots');
    components.push(component('style', 'Playing-pattern experience', (passes.score + shots.score) / 2,
      `${passes.evidence} ${shots.evidence} Both similarities are weighted equally.`));
    const comparable = history.map(match => ({ ...matchEvidence(match, input.referees), similarity: contextSimilarity(context.matchContext, context.earlierContexts.get(match.id)),
      phase: context.earlierContexts.get(match.id).phase, tags: context.earlierContexts.get(match.id).tags }))
      .filter(match => match.similarity >= RULES.contextThreshold).sort((a, b) => b.similarity - a.similarity || b.date.localeCompare(a.date));
    components.push(component('context', 'Stage and stakes experience', comparable.length / RULES.comparableMatches * 100,
      `${comparable.length} earlier appointments with comparable pre-match stage and table context (${RULES.contextThreshold}/100 similarity minimum). Model component reaches 100 at ${RULES.comparableMatches}; experience is not proof of decision quality.`));
    const teamHistory = history.filter(match => [match.home, match.away].some(id => [fixture.home, fixture.away].includes(id)));
    const mostRecent = matches => [...matches].sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastTeamMatch = mostRecent(teamHistory), lastMatch = mostRecent(history);
    const teamGap = lastTeamMatch ? daysBetween(fixture.date, lastTeamMatch.date) : null;
    components.push(component('experience', 'Observed sample', history.length / RULES.experienceMatches * 100,
      `${history.length} prior league appointments in this season; model sample component reaches 100 at ${RULES.experienceMatches}. This is evidence volume, not ability.`));
    components.push(component('spacing', 'Team assignment spacing', teamGap === null ? 100 : teamGap / RULES.teamSpacingDays * 100,
      teamGap === null ? `No earlier assignment with either team in ${history.length} observed league matches.`
        : `${teamGap} calendar days since an observed assignment with either team; model spacing component reaches 100 at ${RULES.teamSpacingDays} days.`));
    const positive = [...components.slice(0, 5)].sort((a, b) => b.points - a.points).slice(0, 2).map(item => ({ code: `FIT_${item.code.toUpperCase()}`, text: item.evidence }));
    const penalties = [];
    if (history.length < RULES.experienceMatches) penalties.push({ code: 'LIMITED_SAMPLE', text: `${history.length} earlier appointments in this dataset; this is not a career-wide profile.` });
    if (teamGap !== null && teamGap < RULES.teamSpacingDays) penalties.push({ code: 'RECENT_TEAM_ASSIGNMENT', text: `Observed assignment with either team ${teamGap} days earlier. The spacing preference is an app assumption, not competition policy.` });
    ranked.push({ ...referee, eligible: true, score: round(components.reduce((sum, item) => sum + item.score * item.weight, 0)), components, positive, penalties,
      flag: penalties[0] || { code: 'OPERATIONAL_CHECKS_UNKNOWN', text: 'Availability, declared conflicts, and appointment eligibility are not supplied by this dataset.' },
      neutrality: 'Unknown — no declarations of interest are supplied',
      history: { sample: history.length, matchIds: history.map(match => match.id), latestMatchDate: lastMatch.date, observedGapDays: daysBetween(fixture.date, lastMatch.date), teamGapDays: teamGap, rates,
        comparableCount: comparable.length, comparableMatches: comparable.slice(0, 3), teamAssignments: teamHistory.map(match => matchEvidence(match, input.referees)) },
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { fixture, risk: context.risk, ranked, excluded, recommended: ranked[0] || null,
    evidence: { cutoff: context.cutoff, leagueMatches: context.history.length, teamProfiles: context.teamProfiles, relevantMatches: context.relevantMatches.length, recentMatches: context.recentMatches.length, target: context.target,
      table: context.table, matchContext: context.matchContext, headToHead: context.headToHead },
    operationalStatus: { availability: 'unknown', conflicts: 'unknown', appointmentEligibility: 'unknown', coverage: 'English league only; other competitions are not included' },
  };
}
