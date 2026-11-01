import { dataProvenance, fixtures, referees, teams, historicalMatches } from './data.js';
import { createScenarioStore } from './scenario.js';
import { RULES } from './engine.js';

const fixtureSelect = document.querySelector('#fixture-select');
const riskGrid = document.querySelector('#risk-grid');
const rankingList = document.querySelector('#ranking-list');
const detailPanel = document.querySelector('#detail-panel');
const excludedList = document.querySelector('#excluded-list');
const availabilityList = document.querySelector('#availability-list');
const store = createScenarioStore();
let selectedId = null;

document.querySelector('#data-provenance').textContent = `${dataProvenance.competition} ${dataProvenance.season}: ${dataProvenance.match_count} real matches, ${dataProvenance.team_count} teams, ${dataProvenance.referee_count} referees, and ${dataProvenance.totals.events.toLocaleString()} events. Profiles use only records before the planning date. Snapshot built ${dataProvenance.built_on}; source files are fetched only during an explicit data refresh.`;

document.querySelector('#source-quality').textContent = `${dataProvenance.missing_referee_match_ids.length} fixtures have no recorded referee; those assignments remain unknown. ${dataProvenance.source_notes.join(' ')}`;

function element(tag, className = '', content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function addAll(parent, ...children) { parent.append(...children); return parent; }

for (const fixture of fixtures) {
  const option = element('option', '', `${fixture.date.slice(0, 10)} · ${fixture.label}`);
  option.value = fixture.id;
  fixtureSelect.append(option);
}

for (const select of [document.querySelector('#planning-first'), document.querySelector('#planning-second')]) {
  for (const team of Object.values(teams).sort((a, b) => a.name.localeCompare(b.name))) {
    const option = element('option', '', team.name); option.value = team.id; select.append(option);
  }
}
document.querySelector('#meeting-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    store.planNextMeeting(document.querySelector('#planning-first').value, document.querySelector('#planning-second').value, document.querySelector('#planning-date').value);
    document.querySelector('#planning-error').textContent = '';
  } catch (error) { document.querySelector('#planning-error').textContent = error.message; }
});

const number = value => value === null ? '—' : value.toFixed(1);
function matchLine(match) {
  return `${match.date.slice(0, 10)} · ${teams[match.home].name} ${match.score.home}–${match.score.away} ${teams[match.away].name}`;
}

function renderBrief(result) {
  const { matchContext: context, teamProfiles, headToHead, table } = result.evidence;
  const brief = document.querySelector('#match-brief');
  brief.replaceChildren(element('p', 'eyebrow', `Premier League · Matchweek ${context.gameweek} of 38 · ${context.phase}`),
    element('h3', '', result.fixture.label), element('p', '', `${result.fixture.date.slice(0, 10)} · ${result.fixture.venue || 'Venue not supplied'} · League fixture`));
  const tags = element('div', 'context-tags');
  for (const label of context.tags.length ? context.tags : [context.ready ? 'League points at stake' : 'Early-season evidence']) tags.append(element('span', '', label));
  brief.append(tags, element('p', 'table-stakes', context.ready
    ? `${context.pointsGap} points separate the teams. Fourth place: ${context.fourthPoints} points; 17th place: ${context.safetyPoints} points. A win adds 3 points, a draw 1. Other results can change positions.`
    : context.note));
  const profiles = document.querySelector('#team-profiles'); profiles.replaceChildren();
  for (const [index, team] of teamProfiles.entries()) {
    const card = element('article', 'team-card');
    card.append(element('p', 'eyebrow', index ? 'Away team' : 'Home team'), element('h3', '', team.name));
    const standing = team.standing;
    const facts = element('div', 'team-facts');
    for (const [label, value] of [['Position', standing.rank === null ? '—' : `#${standing.rank}`], ['Points', standing.points], ['Played', standing.played], ['Goal difference', `${standing.goalDifference > 0 ? '+' : ''}${standing.goalDifference}`]]) {
      facts.append(addAll(element('div'), element('strong', '', String(value)), element('span', '', label)));
    }
    card.append(facts, element('p', 'team-record', `${standing.won} wins · ${standing.drawn} draws · ${standing.lost} losses · ${standing.goalsFor} scored / ${standing.goalsAgainst} conceded`));
    const form = element('div', 'team-form'); form.append(element('span', '', 'Last five →'));
    for (const outcome of team.form) {
      const badge = element('span', `form-badge form-${outcome.toLowerCase()}`, outcome);
      badge.title = { W: 'Win', D: 'Draw', L: 'Loss' }[outcome]; form.append(badge);
    }
    if (!team.form.length) form.append(element('span', '', 'No earlier results'));
    else form.append(element('strong', '', `${team.recentPoints}/${team.form.length * 3} pts`));
    card.append(form, element('p', 'micro-note', 'Oldest on the left; most recent on the right.'));
    const traits = element('div', 'tendency-tags');
    if (team.sample >= 5) for (const tendency of team.tendencies) traits.append(element('span', '', tendency.label));
    else traits.append(element('span', '', 'Five earlier games needed for a playing profile'));
    card.append(traits, element('p', 'micro-note', 'Tendencies compare the latest five games with earlier league team-match volumes. These describe playing patterns, not personalities.'));
    const rates = element('dl', 'team-rates');
    for (const [key, label] of [['passes', 'Passes'], ['shots', 'Shot attempts'], ['duels', 'Duel events'], ['fouls', 'Fouls'], ['cards', 'Card-tagged events']]) {
      rates.append(element('dt', '', label), element('dd', '', `${number(team.recentRates[key])} / ${number(team.rates[key])}`));
    }
    card.append(element('p', 'rates-heading', 'Per match: latest five / season so far'), rates,
      element('p', 'micro-note', `${team.sample} earlier league matches · pass accuracy ${number(team.passAccuracy)}%. Pass volume is not possession time; duel records include paired events.`));
    const recent = element('details', 'team-history'); recent.append(element('summary', '', 'Recent results and who refereed them'));
    const list = element('ul');
    for (const match of [...team.recentMatches].reverse()) list.append(addAll(element('li'), element('strong', '', matchLine(match)), element('span', '', `Referee: ${match.referee} · source ${match.id}`)));
    if (!list.children.length) list.append(element('li', '', 'No earlier matches in this season.'));
    recent.append(list); card.append(recent); profiles.append(card);
  }
  const meetings = document.querySelector('#head-to-head'); meetings.replaceChildren();
  for (const match of [...headToHead].reverse()) meetings.append(addAll(element('p'), element('strong', '', matchLine(match)), element('span', '', `Referee: ${match.referee} · source ${match.id}`)));
  if (!headToHead.length) meetings.append(element('p', '', 'No earlier meeting between these teams is recorded before the planning date in this season.'));
  const demands = document.querySelector('#assignment-demands'); demands.replaceChildren();
  if (teamProfiles.every(team => team.sample >= 5)) {
    demands.append(element('p', '', `Playing pattern: ${number(result.evidence.target.passes)} passes and ${number(result.evidence.target.shots)} shot attempts per weighted earlier match. Compare candidates’ exposure to similar match volumes.`),
      element('p', '', `Discipline: ${number(result.evidence.target.fouls)} fouls and ${number(result.evidence.target.cards)} card-tagged events. These are historical volumes, not predicted incidents.`),
      element('p', '', `${context.phase}; ${context.tags.join(', ') || 'league points at stake'}. Relevant experience means earlier assignments with similar pre-match stage and table context.`));
  } else demands.append(element('p', '', 'The planner needs five earlier league matches per team before deriving match demands or recommending a referee.'));
  const tableNode = element('table');
  tableNode.append(element('caption', '', `Table as of ${result.evidence.cutoff.slice(0, 10)} at 00:00 UTC`));
  const head = element('tr');
  for (const name of ['Pos', 'Club', 'P', 'W', 'D', 'L', 'GD', 'Pts']) { const th = element('th', '', name); th.scope = 'col'; head.append(th); }
  tableNode.append(addAll(element('thead'), head));
  const body = element('tbody');
  for (const row of table) {
    const tr = element('tr', [result.fixture.home, result.fixture.away].includes(row.id) ? 'selected-team' : '');
    tr.dataset.team = row.id;
    for (const value of [row.rank ?? '—', row.name, row.played, row.won, row.drawn, row.lost, row.goalDifference, row.points]) tr.append(element('td', '', String(value)));
    body.append(tr);
  }
  tableNode.append(body); document.querySelector('#league-table').replaceChildren(tableNode);
}

function renderProposal(snapshot) {
  const panel = document.querySelector('#proposal-summary');
  const candidate = snapshot.result.ranked.find(referee => referee.id === selectedId);
  panel.replaceChildren(element('strong', '', snapshot.proposal ? `Draft proposal: ${snapshot.proposal.referee}` : 'No referee proposed yet'),
    element('p', '', snapshot.proposal ? `${snapshot.result.fixture.label} · ${snapshot.result.fixture.date.slice(0, 10)} · ${snapshot.proposal.score}% model fit · evidence before ${snapshot.planningDate}` : 'Inspect a shortlisted referee and record your preferred candidate here.'));
  const button = document.querySelector('#propose-referee'); button.disabled = !candidate;
  button.textContent = candidate ? `Propose ${candidate.name}` : 'No candidate can be proposed';
  document.querySelector('#download-proposal').disabled = !snapshot.proposal;
}

function renderAvailability() {
  const { availability } = store.getSnapshot();
  availabilityList.replaceChildren();
  for (const referee of referees) {
    const label = element('label', 'availability-row');
    const input = element('input');
    input.type = 'checkbox';
    input.dataset.referee = referee.id;
    input.checked = Object.hasOwn(availability, referee.id) ? availability[referee.id] : true;
    addAll(label, input, element('span', 'availability-name', referee.name), element('span', 'availability-state', input.checked ? 'In pool' : 'Excluded'));
    availabilityList.append(label);
  }
}

const comparisonSelects = [document.querySelector('#compare-left'), document.querySelector('#compare-right')];
for (const select of comparisonSelects) {
  for (const referee of referees) {
    const option = element('option', '', referee.name);
    option.value = referee.id;
    select.append(option);
  }
  select.addEventListener('change', () => store.compare(comparisonSelects.map(item => item.value)));
}

function renderComparison(snapshot) {
  comparisonSelects.forEach((select, index) => {
    select.value = snapshot.comparisonIds[index];
    for (const option of select.options) option.disabled = option.value === snapshot.comparisonIds[1 - index];
  });
  document.querySelector('#comparison-summary').textContent = snapshot.comparison.explanation;
  const cards = document.querySelector('#comparison-cards');
  cards.replaceChildren();
  for (const referee of snapshot.comparison.candidates) {
    const card = element('article', `comparison-card${referee.eligible ? '' : ' is-excluded'}`);
    const heading = element('div', 'detail-heading');
    addAll(heading, element('h3', '', referee.name), element('strong', 'detail-score', referee.eligible ? `${referee.score}%` : '—'));
    addAll(card, heading, element('p', 'comparison-status', referee.eligible ? 'Provisional fit · operational checks unknown' : 'Not ranked · no fit score'));
    if (referee.eligible) {
      card.append(element('p', '', referee.positive.map(reason => reason.text).join(' ')));
      card.append(element('p', 'flag', referee.flag.text));
    } else {
      for (const reason of referee.exclusions) card.append(addAll(element('p', 'flag'), element('span', 'reason-code', reason.code), document.createTextNode(reason.text)));
    }
    cards.append(card);
  }
  const factors = document.querySelector('#comparison-factors');
  factors.replaceChildren();
  if (snapshot.comparison.factors.length) {
    const table = element('table');
    const caption = element('caption', '', 'Contribution to fit · points after weighting');
    const head = element('thead');
    const headings = element('tr');
    for (const label of ['Factor', ...snapshot.comparison.candidates.map(referee => referee.name)]) {
      const th = element('th', '', label); th.scope = 'col'; headings.append(th);
    }
    head.append(headings);
    const body = element('tbody');
    for (const factor of snapshot.comparison.factors) {
      const row = element('tr');
      const label = element('th', '', `${factor.label} · ${Math.round(factor.weight * 100)}%`); label.scope = 'row';
      addAll(row, label, element('td', factor.left > factor.right ? 'factor-winner' : '', factor.left.toFixed(1)), element('td', factor.right > factor.left ? 'factor-winner' : '', factor.right.toFixed(1)));
      body.append(row);
    }
    addAll(table, caption, head, body); factors.append(table);
  } else factors.append(element('p', 'empty-message', 'Factor comparison is available when both referees have sufficient history and are included. Excluded referees are never scored.'));
}

function renderChange(snapshot) {
  const panel = document.querySelector('#scenario-change');
  panel.hidden = !snapshot.lastChange;
  if (!snapshot.lastChange) return;
  const { label, before, after, rows } = snapshot.lastChange;
  document.querySelector('#change-title').textContent = label;
  document.querySelector('#change-summary').textContent = `Before: ${before ? `${before.name} led at ${before.score}%` : 'no rankable candidate'}. Now: ${after ? `${after.name} leads at ${after.score}%` : 'no rankable candidate'}. Scenario changes affect inclusion and rank; remaining candidates keep their calculated scores. Actual availability stays unknown.`;
  const list = document.querySelector('#change-rows');
  list.replaceChildren(...rows.map(row => element('li', '', `${row.name}: ${row.before} → ${row.after}`)));
  if (!rows.length) list.append(element('li', '', 'The ranking did not change.'));
  document.querySelector('#undo-change').disabled = !snapshot.canUndo;
}

function renderRisk(risk) {
  riskGrid.replaceChildren();

  for (const [key, item] of Object.entries(risk)) {
    const card = element('article', 'risk-card');
    const top = element('div', 'risk-card-top');
    addAll(top, element('span', '', item.label), element('strong', '', item.score === null ? '—' : String(item.score)));
    const meter = element('div', 'risk-meter');
    const fill = element('div', 'risk-meter-fill');
    fill.style.width = `${item.score ?? 0}%`;
    meter.append(fill);
    addAll(card, top, meter, element('p', '', item.detail));
    riskGrid.append(card);
  }
}

function renderRankings(result) {
  rankingList.replaceChildren();
  document.querySelector('#eligible-count').textContent = `${result.ranked.length} with sufficient history`;
  if (!result.ranked.length) {
    rankingList.append(element('p', 'empty-message', 'No rankable candidate remains. Review the sample requirements or include a candidate below.'));
    return;
  }
  for (const [index, referee] of result.ranked.slice(0, 3).entries()) {
    const button = element('button', `ranked-row${referee.id === selectedId ? ' is-selected' : ''}`);
    button.type = 'button';
    button.dataset.referee = referee.id;
    button.setAttribute('aria-pressed', String(referee.id === selectedId));
    const identity = element('span', 'ranked-identity');
    addAll(identity, element('strong', '', referee.name), element('small', '', index === 0 ? 'Best fit under this model' : `${referee.history.comparableCount} comparable earlier assignments`));
    const score = element('span', 'ranked-score', `${referee.score}%`);
    addAll(button, element('span', 'rank-number', String(index + 1).padStart(2, '0')), identity, score, element('span', 'rank-arrow', '↗'));
    rankingList.append(button);
  }
  if (result.ranked.length > 3) rankingList.append(element('p', 'more-note', `${result.ranked.length - 3} more historical candidate${result.ranked.length - 3 === 1 ? '' : 's'} outside the top three.`));
}

function renderDetail(result) {
  detailPanel.replaceChildren();
  const referee = result.ranked.find(item => item.id === selectedId);
  if (!referee) {
    detailPanel.append(element('p', 'empty-message', 'No recommendation is available: insufficient prior history or all candidates excluded.'));
    return;
  }
  const title = element('div', 'detail-heading');
  const titleText = element('div');
  addAll(titleText, element('span', 'eyebrow', referee.id === result.recommended.id ? 'Provisional recommendation' : 'Historical candidate'), element('h3', '', referee.name));
  addAll(title, titleText, element('strong', 'detail-score', `${referee.score}%`));
  detailPanel.append(title);
  const opening = referee.id === result.recommended.id ? 'Recommended for this next match under the model' : 'An alternative for this next match under the model';
  detailPanel.append(element('p', 'detail-lead', `${opening}: ${referee.positive.map(item => item.text).join(' ')} Conflict status: ${referee.neutrality.toLowerCase()}.`));
  const reasons = element('div', 'reason-list');
  for (const reason of referee.positive) {
    const row = element('p');
    addAll(row, element('span', 'reason-code', reason.code), document.createTextNode(reason.text));
    reasons.append(row);
  }
  detailPanel.append(reasons);
  const breakdown = element('div', 'breakdown');
  breakdown.append(element('h4', '', 'Score breakdown'));
  for (const item of referee.components) {
    const row = element('div', 'factor-row');
    const labels = element('div', 'factor-labels');
    addAll(labels, element('span', '', `${item.label} · ${Math.round(item.weight * 100)}% weight`), element('strong', '', `${item.points.toFixed(1)} pts`));
    const bar = element('div', 'factor-bar');
    const fill = element('div');
    fill.style.width = `${item.score ?? 0}%`;
    bar.append(fill);
    addAll(row, labels, bar, element('small', '', item.evidence));
    breakdown.append(row);
  }
  detailPanel.append(breakdown);
  const flag = element('p', 'flag');
  addAll(flag, element('span', 'reason-code', referee.flag.code), document.createTextNode(referee.flag.text));
  detailPanel.append(flag);
  if (referee.penalties.length > 1) {
    for (const penalty of referee.penalties.slice(1)) {
      const row = element('p', 'secondary-penalty');
      addAll(row, element('span', 'reason-code', penalty.code), document.createTextNode(penalty.text));
      detailPanel.append(row);
    }
  }
  detailPanel.append(element('p', 'law-context', `${referee.history.sample} prior league appointments. Last observed assignment: ${referee.history.latestMatchDate.slice(0, 10)} (${referee.history.observedGapDays} calendar days before this fixture). Other competitions are absent, so this is not a measure of rest.`));
  const evidence = element('details', 'history-evidence');
  evidence.append(element('summary', '', 'Inspect the five most recent source matches'));
  const historyList = element('ul');
  for (const id of referee.history.matchIds.slice(-5)) {
    const match = historicalMatches.find(item => item.id === id);
    historyList.append(element('li', '', `${matchLine(match)} · source match ${match.sourceId}`));
  }
  evidence.append(historyList); detailPanel.append(evidence);
  const comparable = element('details', 'comparable-evidence');
  comparable.append(element('summary', '', `${referee.history.comparableCount} comparable assignments before the planning date`));
  const similarList = element('ul');
  for (const match of referee.history.comparableMatches) similarList.append(element('li', '', `${matchLine(match)} · ${match.phase} · ${match.tags.join(', ') || 'League points'} · context similarity ${match.similarity}/100`));
  if (!similarList.children.length) similarList.append(element('li', '', 'No previous assignment reaches the model’s context similarity threshold.'));
  comparable.append(similarList); detailPanel.append(comparable);
  const teamHistory = element('details', 'comparable-evidence'); teamHistory.append(element('summary', '', 'Earlier appointments with either team'));
  const assignments = element('ul');
  for (const match of referee.history.teamAssignments.slice(-5).reverse()) assignments.append(element('li', '', matchLine(match)));
  if (!assignments.children.length) assignments.append(element('li', '', 'None observed before the planning date in this season.'));
  teamHistory.append(assignments); detailPanel.append(teamHistory);
}

function renderExclusions(result) {
  excludedList.replaceChildren();
  document.querySelector('#excluded-count').textContent = `${result.excluded.length} excluded`;
  if (!result.excluded.length) {
    excludedList.append(element('p', 'empty-message', 'No candidate is excluded by the sample and scenario checks. Operational eligibility remains unknown.'));
    return;
  }
  for (const referee of result.excluded) {
    const item = element('div', 'excluded-row');
    item.append(element('strong', '', referee.name));
    for (const reason of referee.exclusions) {
      const row = element('p');
      addAll(row, element('span', 'reason-code', reason.code), document.createTextNode(reason.text));
      item.append(row);
    }
    excludedList.append(item);
  }
}

function render(announce = false) {
  const snapshot = store.getSnapshot();
  const result = snapshot.result;
  fixtureSelect.value = snapshot.fixtureId;
  document.querySelector('#planning-error').textContent = '';
  if (!result.ranked.some(item => item.id === selectedId && result.ranked.indexOf(item) < 3)) selectedId = result.recommended?.id ?? null;
  renderRisk(result.risk);
  document.querySelector('#fixture-evidence').textContent = `Planning as of ${snapshot.planningDate} at 00:00 UTC · ${result.evidence.leagueMatches} earlier league matches · Next fixture: ${result.fixture.date.slice(0, 10)}. The target result and actual appointed referee are withheld. This is a 2017/18 replay, not a current fixture feed.`;
  document.querySelector('#planning-first').value = result.fixture.home;
  document.querySelector('#planning-second').value = result.fixture.away;
  document.querySelector('#planning-date').value = snapshot.planningDate;
  renderBrief(result);
  const topNames = result.ranked.slice(0, 2).map(referee => referee.name);
  const compareSuggestion = document.querySelector('[data-suggestion=compare]');
  compareSuggestion.textContent = 'Compare the top two';
  compareSuggestion.dataset.prompt = topNames.length === 2 ? `Compare ${topNames[0]} and ${topNames[1]}.` : 'Explain why there is not enough history to rank candidates.';
  const changeSuggestion = document.querySelector('[data-suggestion=change]');
  changeSuggestion.textContent = 'Exclude the leading candidate';
  changeSuggestion.dataset.prompt = topNames.length ? `Exclude ${topNames[0]} from this scenario and show what changed.` : 'Explain why no candidate is ranked.';
  renderRankings(result);
  renderDetail(result);
  renderExclusions(result);
  renderAvailability();
  renderComparison(snapshot);
  renderChange(snapshot);
  renderProposal(snapshot);
  document.querySelector('#active-fixture').textContent = result.fixture.label;
  if (announce) document.querySelector('#ranking-status').textContent = result.recommended
    ? `${result.fixture.label}: ${result.recommended.name} leads at ${result.recommended.score}% fit. ${result.excluded.length} excluded.`
    : `${result.fixture.label}: no rankable candidate remains.`;
}

fixtureSelect.addEventListener('change', () => { selectedId = null; store.selectFixture(fixtureSelect.value); });
rankingList.addEventListener('click', event => {
  const button = event.target.closest('button[data-referee]');
  if (!button) return;
  selectedId = button.dataset.referee;
  render(false);
  rankingList.querySelector(`[data-referee="${selectedId}"]`)?.focus();
});
availabilityList.addEventListener('change', event => {
  const input = event.target.closest('input[data-referee]');
  if (!input) return;
  const id = input.dataset.referee;
  store.setAvailability([{ refereeId: id, available: input.checked }]);
  availabilityList.querySelector(`[data-referee="${id}"]`)?.focus();
});
document.querySelector('#reset-availability').addEventListener('click', () => store.resetAvailability());
document.querySelector('#undo-change').addEventListener('click', () => store.undo());
document.querySelector('#propose-referee').addEventListener('click', () => store.propose(selectedId));
document.querySelector('#download-proposal').addEventListener('click', () => {
  const snapshot = store.getSnapshot();
  if (!snapshot.proposal) return;
  const report = { version: '1.2', mode: 'Historical next-match planning replay', proposal: snapshot.proposal, fixture: snapshot.result.fixture,
    evidence: snapshot.result.evidence, candidate: snapshot.result.ranked.find(referee => referee.id === snapshot.proposal.refereeId),
    rules: RULES, sources: dataProvenance.sources, operationalStatus: snapshot.result.operationalStatus };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = `refmatch-${snapshot.fixtureId}-${snapshot.planningDate}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

store.subscribe(() => render(true));
render();

import('./build/copilot.js').then(({ mountCopilot }) => mountCopilot(store)).catch(() => {
  document.querySelector('#assistant-status').textContent = 'Assistant unavailable. Fixture controls and comparison cards are ready.';
});
