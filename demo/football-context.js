// Match results become evidence only after the planning cutoff.
export const dayOf = value => value.slice(0, 10);
export const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export const total = (match, metric) => Object.values(match.stats).reduce((sum, stats) => sum + stats[metric], 0);

export function validatePlanningDate(date, fixture) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Choose a valid planning date.');
  if (fixture && date > dayOf(fixture.date)) throw new Error('The planning date must be on or before the fixture day.');
  return `${date}T00:00:00Z`;
}

export function findNextMeeting(fixtures, first, second, date) {
  validatePlanningDate(date);
  if (first === second) throw new Error('Choose two different teams.');
  const fixture = fixtures.filter(match => dayOf(match.date) >= date && [match.home, match.away].includes(first) && [match.home, match.away].includes(second))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  if (!fixture) throw new Error('No next meeting is in the 2017/18 schedule from that date. Choose an earlier date or another pair. Your current plan has not changed.');
  return fixture;
}

export function buildStandings(matches, teams) {
  const rows = Object.fromEntries(Object.values(teams).map(team => [team.id, { id: team.id, name: team.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]));
  for (const match of matches) {
    for (const [side, opponent] of [['home', 'away'], ['away', 'home']]) {
      const row = rows[match[side]], scored = match.score[side], conceded = match.score[opponent];
      row.played++; row.goalsFor += scored; row.goalsAgainst += conceded;
      if (scored > conceded) { row.won++; row.points += 3; }
      else if (scored === conceded) { row.drawn++; row.points++; }
      else row.lost++;
      row.goalDifference = row.goalsFor - row.goalsAgainst;
    }
  }
  const table = Object.values(rows).sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name));
  table.forEach((row, index) => {
    const previous = table[index - 1];
    const tied = previous && row.points === previous.points && row.goalDifference === previous.goalDifference && row.goalsFor === previous.goalsFor;
    row.rank = matches.length ? tied ? previous.rank : index + 1 : null;
  });
  return table;
}

export function stageFor(gameweek) {
  return gameweek <= 10 ? 'Opening rounds' : gameweek <= 28 ? 'Mid-season' : 'Run-in';
}

export function tableContext(fixture, table) {
  const home = table.find(team => team.id === fixture.home), away = table.find(team => team.id === fixture.away);
  const ready = home.played >= 5 && away.played >= 5;
  const tags = [];
  const fourthPoints = table[3]?.points ?? 0, safetyPoints = table[16]?.points ?? 0;
  if (ready) {
    if ([home, away].some(team => team.rank <= 4 && table[0].points - team.points <= 6)) tags.push('Title-race proximity');
    if ([home, away].some(team => team.rank <= 8 && Math.abs(team.points - fourthPoints) <= 6)) tags.push('Top-four proximity');
    if ([home, away].some(team => team.rank >= 14 && (team.rank >= 18 || Math.abs(team.points - safetyPoints) <= 6))) tags.push('Safety-line proximity');
    if (Math.abs(home.rank - away.rank) <= 4 && Math.abs(home.points - away.points) <= 6) tags.push('Close table rivals');
  }
  return { phase: stageFor(fixture.gameweek), gameweek: fixture.gameweek, competition: 'Premier League', format: 'League · 38 rounds',
    tags, ready, pointsGap: Math.abs(home.points - away.points), rankGap: ready ? Math.abs(home.rank - away.rank) : null,
    fourthPoints, safetyPoints, home, away,
    note: ready ? 'Context tags use six-point windows and table positions. They describe the table situation, not emotions or a forecast.' : 'Too little prior league history to classify table stakes.' };
}

export function contextSimilarity(first, second) {
  if (!first.ready || !second.ready) return 0;
  const phase = first.phase === second.phase ? 35 : 0;
  const shared = first.tags.filter(tag => second.tags.includes(tag));
  const union = new Set([...first.tags, ...second.tags]);
  const stakes = union.size ? 30 * shared.length / union.size : 30;
  return Math.round(phase + stakes + 20 * Math.max(0, 1 - Math.abs(first.rankGap - second.rankGap) / 10) + 15 * Math.max(0, 1 - Math.abs(first.pointsGap - second.pointsGap) / 12));
}

export function appointmentContexts(history, teams) {
  const contexts = new Map(), completed = [];
  const dates = [...new Set(history.map(match => dayOf(match.date)))].sort();
  for (const date of dates) {
    const table = buildStandings(completed, teams);
    const today = history.filter(match => dayOf(match.date) === date);
    for (const match of today) contexts.set(match.id, tableContext(match, table));
    completed.push(...today);
  }
  return contexts;
}

export function matchEvidence(match, referees) {
  return { id: match.id, date: dayOf(match.date), label: match.label, home: match.home, away: match.away,
    score: { ...match.score }, refereeId: match.refereeId, referee: referees.find(referee => referee.id === match.refereeId)?.name ?? 'Not recorded in source' };
}

export function enrichTeam(team, history, table, referees) {
  const games = history.filter(match => [match.home, match.away].includes(team.id)).sort((a, b) => a.date.localeCompare(b.date));
  const recent = games.slice(-5);
  const measures = ['passes', 'shots', 'duels', 'fouls', 'cards'];
  const rates = Object.fromEntries(measures.map(metric => [metric, mean(games.map(match => match.stats[team.id][metric]))]));
  const recentRates = Object.fromEntries(measures.map(metric => [metric, mean(recent.map(match => match.stats[team.id][metric]))]));
  const passes = games.reduce((sum, match) => sum + match.stats[team.id].passes, 0);
  const accurate = games.reduce((sum, match) => sum + match.stats[team.id].accuratePasses, 0);
  const tendencies = measures.filter(metric => ['passes', 'shots', 'fouls'].includes(metric)).map(metric => {
    const values = history.flatMap(match => Object.values(match.stats).map(stats => stats[metric]));
    const percentile = recent.length >= 5 ? Math.round(100 * values.filter(value => value <= recentRates[metric]).length / values.length) : null;
    const labels = { passes: ['Higher pass volume', 'Lower pass volume', 'Typical pass volume'], shots: ['More shot attempts', 'Fewer shot attempts', 'Typical shot volume'], fouls: ['More recorded fouls', 'Fewer recorded fouls', 'Typical foul count'] };
    return { metric, percentile, label: percentile === null ? 'More history needed' : labels[metric][percentile >= 75 ? 0 : percentile <= 25 ? 1 : 2] };
  });
  const recentMatches = recent.map(match => {
    const side = match.home === team.id ? 'home' : 'away', other = side === 'home' ? 'away' : 'home';
    const diff = match.score[side] - match.score[other];
    return { ...matchEvidence(match, referees), outcome: diff > 0 ? 'W' : diff < 0 ? 'L' : 'D' };
  });
  const standing = table.find(row => row.id === team.id);
  return { ...team, standing, rates: { ...team.rates, ...rates }, recentRates, passAccuracy: passes ? 100 * accurate / passes : null,
    tendencies, form: recentMatches.map(match => match.outcome), recentPoints: recentMatches.reduce((sum, match) => sum + (match.outcome === 'W' ? 3 : match.outcome === 'D' ? 1 : 0), 0), recentMatches };
}
