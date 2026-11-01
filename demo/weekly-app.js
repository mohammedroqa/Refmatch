import { createWeeklyStore } from './weekly-store.js';

const $ = selector => document.querySelector(selector);
const el = (tag, className = '', text = '') => { const n = document.createElement(tag); n.className = className; n.textContent = text; return n; };
const add = (node, ...children) => { node.append(...children); return node; };
const option = (value, text) => { const n = el('option', '', text); n.value = value; return n; };
const kickoff = value => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value)) + ' UK' : 'Date to be confirmed';
const historyLine = m => `${m.date} · ${m.home} ${m.score.home}–${m.score.away} ${m.away} · ${m.referee}`;
let data, store, selectedFixture, selectedReferee, comparison = [];

function failure(error) { $('#error').textContent = error.message || String(error); $('#error').hidden = false; }
function run(fn) { $('#error').hidden = true; try { fn(); } catch(error) { failure(error); render(); } }
function table(headers, rows) {
  const node = el('table'), head = el('tr');
  headers.forEach(h => { const th = el('th', '', h); th.scope = 'col'; head.append(th); });
  node.append(add(el('thead'), head)); const body = el('tbody');
  rows.forEach(values => body.append(add(el('tr'), ...values.map(v => el('td', '', String(v ?? '—'))))));
  return add(node, body);
}
function getAnalysis() { return store.getSnapshot().result.analyses.find(a => a.fixture.id === selectedFixture); }

function renderDecisionSummary(snapshot) {
  const a = getAnalysis();
  const assignment = a ? snapshot.result.assignments.find(r => r.fixtureId === a.fixture.id) : null;
  const lead = a?.ranked[0];
  const fixtureNode = $('#decision-fixture');
  const refereeNode = $('#decision-referee');
  const fitNode = $('#decision-fit');
  const evidenceNode = $('#decision-evidence');
  const reasonsNode = $('#decision-reasons');
  const riskNode = $('#decision-risk');
  if (!a || !assignment) {
    fixtureNode.textContent = 'No fixture selected';
    refereeNode.textContent = '—';
    fitNode.textContent = '—';
    evidenceNode.textContent = '—';
    reasonsNode.replaceChildren();
    riskNode.textContent = 'Choose a match from the weekly board to explain the recommendation.';
    return;
  }
  fixtureNode.textContent = `${a.teams[0].name} × ${a.teams[1].name}`;
  const leadName = lead && assignment.refereeId === lead.id ? lead.name : assignment.referee || 'Unassigned';
  refereeNode.textContent = leadName;
  fitNode.textContent = assignment.score === null ? '—' : `${assignment.score}/100`;
  evidenceNode.textContent = `${a.ranked.length} candidates · ${a.headToHead.length} prior meetings`;
  const reasons = [];
  if (lead) reasons.push(`${lead.name} leads because the model rewards recent team profile fit and comparable table situations.`);
  if (assignment.reason) reasons.push(assignment.reason);
  if (a.matchContext.tags?.length) reasons.push(`Context: ${a.matchContext.tags.join(' · ')}`);
  if (a.teams.some(team => team.standing)) {
    const standings = a.teams
      .map(team => `${team.name} ${team.standing?.rank ? `rank ${team.standing.rank}` : 'rank unavailable'}`)
      .join(' · ');
    reasons.push(`League context: ${standings}`);
  }
  reasonsNode.replaceChildren(...reasons.slice(0, 4).map(reason => el('li', '', reason)));
  const missingChecks = assignment.referee ? (assignment.checksConfirmed ? 'Checks are confirmed for the selected referee.' : 'Committee checks are still required before local approval.') : 'This fixture still needs a viable candidate and committee review.';
  riskNode.textContent = `${missingChecks} This score is an experimental fit indicator, not a probability or a quality rating.`;
}

function renderBoard(snapshot) {
  const { result } = snapshot, board = $('#fixture-board'); board.replaceChildren();
  const analyses = [...result.analyses].sort((a,b) => (a.fixture.kickoff || 'z').localeCompare(b.fixture.kickoff || 'z') || a.fixture.id.localeCompare(b.fixture.id));
  for (const a of analyses) {
    const assignment = result.assignments.find(r => r.fixtureId===a.fixture.id);
    const button = el('button', `fixture-card${selectedFixture===a.fixture.id ? ' is-selected' : ''}`);
    button.type = 'button'; button.dataset.fixture = a.fixture.id; button.setAttribute('aria-pressed', String(selectedFixture===a.fixture.id));
    const top = add(el('div','fixture-top'), el('span','',kickoff(a.fixture.kickoff)), el('span','',assignment.locked ? 'Committee lock' : `MW ${snapshot.gameweek}`));
    const fit = add(el('span','fit', assignment.score === null ? '—' : String(assignment.score)), el('small','',' /100'));
    add(button, top, el('h3','',`${a.teams[0].name} × ${a.teams[1].name}`),
      add(el('div','fixture-bottom'), el('strong','',assignment.referee || 'Unassigned'), fit),
      el('p','status', assignment.checksConfirmed ? `Checks confirmed · individual rank ${assignment.rank}` : assignment.referee ? `Committee checks pending · individual rank ${assignment.rank}` : 'Review excluded candidates'));
    button.addEventListener('click', () => { selectedFixture=a.fixture.id; selectedReferee=assignment.refereeId; comparison=[]; render(); });
    board.append(button);
  }
  $('#allocation-note').textContent = result.complete
    ? `All ${result.filled} fixtures have a distinct referee. Total fit: ${result.total}. Select and lock a different candidate to recalculate the remaining assignments.`
    : `${result.filled} of ${result.analyses.length} fixtures can be filled. Resolve the missing evidence or committee constraints before approval.`;
}

function renderEvidence(snapshot) {
  const a = getAnalysis(); if (!a) return;
  const assignment = snapshot.result.assignments.find(r => r.fixtureId === selectedFixture);
  const heading = $('#match-heading'); heading.replaceChildren(
    el('h3','',`${a.teams[0].name} × ${a.teams[1].name}`),
    el('p','',`${kickoff(a.fixture.kickoff)} · Evidence before ${snapshot.planningDate} · ${a.matchContext.phase}`),
    el('p','',a.matchContext.tags.join(' · ') || a.matchContext.note),
    el('p','allocation-reason', `${assignment.referee || 'No assignment'}: ${assignment.reason}`));
  const briefs = $('#team-briefs'); briefs.replaceChildren();
  for (const team of a.teams) {
    const card = add(el('article','team-card'), el('h3','',team.name));
    const line = el('div','team-statline');
    for (const [value,label] of [[team.standing?.rank,'position'],[team.standing?.points,'points'],[team.standing?.played,'played this season']]) line.append(add(el('div'),el('strong','',String(value ?? '—')),el('span','',label)));
    const form = el('div','form-strip'); form.setAttribute('aria-label',`Recent form: ${team.form.join(', ') || 'no earlier results'}`);
    team.form.forEach(value => form.append(el('span',`form-pill form-${value}`,value)));
    const recent = el('div','match-history'); team.recent.forEach(m => recent.append(el('p','',historyLine(m))));
    add(card,line,form,recent,el('p','sample',`${team.sample} earlier league matches · ${team.statsSample} with complete statistics`));
    briefs.append(card);
  }
  $('#previous-meetings').replaceChildren(...(a.headToHead.length ? a.headToHead.map(m => el('p','exclusion-item',historyLine(m))) : [el('p','empty-state','No earlier Premier League meeting in this 36-month window.')]));
  $('#candidate-count').textContent = `${a.ranked.length} rankable`;
  if (!a.ranked.some(r => r.id===selectedReferee)) selectedReferee = assignment.refereeId || a.ranked[0]?.id;
  const list = $('#weekly-rankings'); list.replaceChildren();
  a.ranked.forEach((candidate,index) => {
    const row = el('button',`ranked-row${candidate.id===selectedReferee ? ' is-selected' : ''}`); row.type='button'; row.dataset.referee=candidate.id;
    row.setAttribute('aria-pressed',String(candidate.id===selectedReferee));
    add(row,el('span','rank-number',String(index+1).padStart(2,'0')),
      add(el('span','ranked-identity'), el('strong','',candidate.name), el('small','', `${candidate.sample} earlier appointments${candidate.id===assignment.refereeId ? ' · weekly selection' : ''}`)),
      el('span','ranked-score',String(candidate.score)));
    row.addEventListener('click',() => { selectedReferee=candidate.id; renderEvidence(store.getSnapshot()); }); list.append(row);
  });
  if (!a.ranked.length) list.append(el('p','empty-state','No candidate meets the evidence and committee constraints. Inspect the exclusions below.'));
  const detail = $('#candidate-evidence'), candidate = a.ranked.find(r => r.id===selectedReferee); detail.replaceChildren();
  if (candidate) {
    add(detail, add(el('div','detail-heading'),add(el('div'),el('p','eyebrow','Selected candidate'),el('h3','',candidate.name)),el('span','detail-score',`${candidate.score}`)),
      el('p','detail-lead',`${candidate.statsSample} appointments with complete statistics in the evidence window. ${candidate.checksConfirmed ? 'Committee checks confirmed.' : 'Committee checks still required.'}`));
    for (const c of candidate.components) {
      const fill=el('div'); fill.style.width=`${c.score}%`;
      detail.append(add(el('div','factor-row'),add(el('div','factor-labels'),el('span','',`${c.label} · ${Math.round(c.weight*100)}% weight`),el('strong','',`${(c.score*c.weight).toFixed(1)} points`)),add(el('div','factor-bar'),fill),el('small','',c.explanation)));
    }
    const actions=el('div','candidate-actions'), lock=el('button','primary-action','Lock this referee for this match'); lock.type='button'; lock.id='lock-referee';
    lock.addEventListener('click',()=>run(()=>store.lock(selectedFixture,candidate.id))); actions.append(lock);
    if(snapshot.locks[selectedFixture]) { const unlock=el('button','secondary-action','Unlock'); unlock.type='button'; unlock.id='unlock-referee'; unlock.addEventListener('click',()=>run(()=>store.lock(selectedFixture,null))); actions.append(unlock); }
    add(actions,el('p','',assignment.refereeId===candidate.id ? 'This referee is already selected in the weekly draft.' : 'Locking this candidate may move another referee to a different fixture.')); detail.append(actions);
    const comparable=add(el('details','history-evidence'),el('summary','', 'Similar earlier assignments'));
    comparable.append(...(candidate.comparable.length ? candidate.comparable.map(m=>el('p','exclusion-item',historyLine(m))) : [el('p','muted','No earlier appointment meets the model’s context threshold.')])); detail.append(comparable);
  } else detail.append(el('p','empty-state','More evidence or a different candidate pool is needed for this match.'));
  $('#weekly-exclusions').replaceChildren(...a.excluded.map(r=>el('p','exclusion-item',`${r.name}: ${r.reasons.join('; ')}.`)));
  if(!a.ranked.some(r=>r.id===comparison[0])) comparison[0]=a.ranked[0]?.id;
  if(!a.ranked.some(r=>r.id===comparison[1]) || comparison[0]===comparison[1]) comparison[1]=a.ranked.find(r=>r.id!==comparison[0])?.id;
  ['#compare-a','#compare-b'].forEach((selector,i)=>{ $(selector).replaceChildren(...a.ranked.map(r=>option(r.id,`${r.name} · ${r.score}/100`))); $(selector).value=comparison[i]||''; $(selector).disabled=a.ranked.length<2; });
  renderComparison();
}

function renderComparison() {
  const a=getAnalysis(), left=a?.ranked.find(r=>r.id===comparison[0]), right=a?.ranked.find(r=>r.id===comparison[1]);
  if(!left||!right||left.id===right.id) { $('#weekly-comparison').replaceChildren(el('p','muted','Choose two different ranked referees to compare.')); return; }
  const rows=left.components.map((c,i)=>[c.label,`${(c.score*c.weight).toFixed(1)} pts`,`${(right.components[i].score*c.weight).toFixed(1)} pts`]);
  rows.push(['Rounded fit',`${left.score}/100`,`${right.score}/100`]);
  $('#weekly-comparison').replaceChildren(table(['Factor',left.name,right.name],rows));
}

function buildRoster() {
  const roster=$('#roster'); roster.replaceChildren();
  const recentIds=new Set(data.matches.filter(m=>m.date>=`${data.season}-07-01`).map(m=>m.refereeId));
  for(const r of [...data.referees].sort((a,b)=>Number(recentIds.has(b.id))-Number(recentIds.has(a.id))||a.name.localeCompare(b.name))) {
    const card=add(el('article','roster-card'),el('h3','',r.name)); card.dataset.referee=r.id;
    const fields=el('div','roster-fields'), availability=el('select'); availability.dataset.setting='availability'; availability.setAttribute('aria-label',`${r.name} availability`);
    availability.append(option('unknown','Availability unknown'),option('available','Available · confirmed'),option('unavailable','Unavailable'));
    const cleared=el('input'); cleared.type='checkbox'; cleared.dataset.setting='cleared'; cleared.setAttribute('aria-label',`${r.name} checks confirmed`);
    const excluded=el('input'); excluded.type='checkbox'; excluded.dataset.setting='excluded'; excluded.setAttribute('aria-label',`${r.name} excluded`);
    add(fields,availability,add(el('label','check-label'),cleared,el('span','','Checks confirmed')),add(el('label','check-label'),excluded,el('span','','Exclude from pool')));
    const details=add(el('details'),el('summary','','Team conflicts & other duties'));
    const conflicts=el('select'); conflicts.multiple=true; conflicts.dataset.setting='conflicts'; conflicts.setAttribute('aria-label',`${r.name} team conflicts`);
    conflicts.append(...data.seasonTeams[String(data.season)].map(id=>option(id,data.teams[id].name)));
    const duties=el('input'); duties.type='text'; duties.dataset.setting='commitments'; duties.placeholder='2026-10-29, 2026-11-03'; duties.setAttribute('aria-label',`${r.name} other duty dates`);
    add(details,add(el('label','', 'Declared team conflicts · Ctrl/Cmd to select'),conflicts),add(el('label','', 'Other duty dates · comma-separated YYYY-MM-DD'),duties));
    add(card,fields,details,el('p','roster-note',recentIds.has(r.id) ? 'Observed in this season’s results. Panel membership still needs confirmation.' : 'Earlier historical identity. Confirm current eligibility before including.')); roster.append(card);
  }
  roster.addEventListener('change',event=>{
    const input=event.target, setting=input.dataset.setting; if(!setting)return;
    let value=input.value;
    if(input.type==='checkbox') value=input.checked;
    if(setting==='conflicts') value=[...input.selectedOptions].map(o=>o.value);
    if(setting==='commitments') value=input.value.split(',').map(v=>v.trim()).filter(Boolean);
    run(()=>store.setReferee(input.closest('[data-referee]').dataset.referee,{[setting]:value}));
  });
}

function render() {
  if(!store)return;
  const snapshot=store.getSnapshot(),{result}=snapshot;
  if(!result.analyses.some(a=>a.fixture.id===selectedFixture)) { selectedFixture=result.analyses[0]?.fixture.id; selectedReferee=null; comparison=[]; }
  $('#week-select').value=String(snapshot.gameweek); $('#cutoff').value=snapshot.planningDate; $('#minimum-gap').value=snapshot.minimumGapDays;
  const pending=result.assignments.filter(a=>a.refereeId&&!a.checksConfirmed).length;
  $('#summary').replaceChildren(...[[`${result.filled}/${result.analyses.length}`,'fixtures assigned'],[result.evidence.matchCount.toLocaleString(),'matches in the 36-month window'],[`${pending}`,'selected referees need checks'],[snapshot.approval?'Approved':'Draft',`Matchweek ${snapshot.gameweek} · ${data.seasonLabel}`]].map(([v,l])=>add(el('div','summary-tile'),el('strong','',v),el('span','',l))));
  $('#source-status').textContent=`Evidence: ${result.evidence.start} to before ${snapshot.planningDate}. Results through ${result.evidence.resultsThrough||'none'}; statistics through ${result.evidence.statisticsThrough||'none'}. ${result.evidence.missingStats} results await complete statistics. Snapshot refreshed ${data.builtAt.slice(0,10)}.`;
  renderDecisionSummary(snapshot);
  renderBoard(snapshot); renderEvidence(snapshot);
  $('#weekly-table').replaceChildren(table(['Pos','Club','P','W','D','L','GF','GA','GD','Pts'],result.table.map(t=>[t.rank,t.name,t.played,t.won,t.drawn,t.lost,t.goalsFor,t.goalsAgainst,t.goalDifference,t.points])));
  for(const card of $('#roster').children) {
    const r=snapshot.roster[card.dataset.referee]||{};
    for(const input of card.querySelectorAll('[data-setting]')) {
      const key=input.dataset.setting;
      if(input.type==='checkbox') input.checked=Boolean(r[key]);
      else if(key==='conflicts') [...input.options].forEach(o=>{o.selected=(r.conflicts||[]).includes(o.value);});
      else input.value=key==='commitments'?(r.commitments||[]).join(', '):r[key]||'unknown';
    }
  }
  const started=result.analyses.some(a=>a.fixture.started||a.fixture.finished||(a.fixture.kickoff&&Date.parse(a.fixture.kickoff)<=Date.now()));
  $('#approve').disabled=!result.approvable||started||Boolean(snapshot.approval);
  $('#approval-status').textContent=snapshot.approval ? `Approved locally by ${snapshot.approval.reviewer}. Download the evidence brief to share this review.` : started ? 'This round has already started. Evidence can be reviewed, but approval is limited to upcoming rounds.'
    : result.approvable ? 'Every fixture is filled and all selected referees have confirmed committee checks. Ready for local review.'
    : `${result.analyses.length-result.filled} unfilled fixtures; ${pending} selected referees still need confirmed availability and committee checks.`;
  $('#storage-status').textContent=snapshot.persistenceError||'Saved in this browser. Source refreshes invalidate approvals. Date, policy, roster or selection changes require another review.';
}

async function start() {
  const response=await fetch('./weekly.snapshot.json',{cache:'no-cache'}); if(!response.ok)throw new Error('The current-season snapshot could not be loaded. Run npm run data:weekly to refresh it.');
  data=await response.json(); let storage=null;
  try { storage=window.localStorage; } catch {}
  store=createWeeklyStore(data,{storage});
  const today=new Date().toISOString().slice(0,10);
  $('#season-select').append(option(data.season,data.seasonLabel));
  for(const week of store.getSnapshot().weeks) {
    const fixtures=data.fixtures.filter(f=>f.gameweek===week), starts=fixtures.filter(f=>f.kickoff).map(f=>f.kickoff).sort();
    const status=fixtures.every(f=>f.finished)?'completed':fixtures.some(f=>f.started)?'in progress':'upcoming';
    $('#week-select').append(option(week,`Matchweek ${week} · ${starts[0]?.slice(0,10)||'TBC'} · ${status}`));
  }
  $('#cutoff').min=`${data.season}-07-01`; $('#cutoff').max=today;
  buildRoster(); store.subscribe(render); render();
  $('#loading').hidden=true; $('#workspace').hidden=false;
  $('#week-controls').addEventListener('submit',event=>event.preventDefault());
  $('#week-select').addEventListener('change',()=>run(()=>store.selectWeek(Number($('#week-select').value))));
  $('#cutoff').addEventListener('change',()=>run(()=>store.setPlanningDate($('#cutoff').value)));
  $('#minimum-gap').addEventListener('change',()=>run(()=>store.setGap($('#minimum-gap').value)));
  $('#generate').addEventListener('click',()=>run(()=>store.regenerate()));
  $('#focus-selected-match').addEventListener('click',()=>{
    const fixture = $('#decision-fixture').textContent;
    if (!fixture || fixture === 'No fixture selected') return;
    const card = document.querySelector(`.fixture-card[data-fixture="${selectedFixture}"]`);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); card.focus(); }
    const evidenceSection = document.querySelector('#evidence-title'); evidenceSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  ['#compare-a','#compare-b'].forEach((selector,i)=>$(selector).addEventListener('change',()=>{ comparison[i]=$(selector).value; renderComparison(); }));
  $('#approve').addEventListener('click',()=>run(()=>store.approve($('#reviewer').value)));
  $('#download-week').addEventListener('click',()=>{
    const report=store.exportBrief(), url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=el('a'); link.href=url; link.download=`refmatch-${data.season}-week-${report.gameweek}-${report.planningDate}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#refresh-data').addEventListener('click',async()=>{
    const button=$('#refresh-data'); button.disabled=true; button.textContent='Refreshing fixtures and statistics…';
    try { const response=await fetch('/api/weekly-refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); const result=await response.json(); if(!response.ok)throw new Error(result.error||'Refresh failed. The saved snapshot is still available.'); location.reload(); }
    catch(error){ failure(error); button.disabled=false; button.textContent='Retry source refresh'; }
  });
  import('./build/weekly-copilot.js').then(({mountWeeklyCopilot})=>mountWeeklyCopilot(store,data,{
    inspect(fixtureId){selectedFixture=fixtureId;render();},
    compare(fixtureId,first,second){selectedFixture=fixtureId;comparison=[first,second];render();},
  })).catch(()=>{$('#assistant-status').textContent='Assistant unavailable. Weekly planning controls are ready.';});
}
start().catch(error=>{ $('#loading').hidden=true; failure(error); });
