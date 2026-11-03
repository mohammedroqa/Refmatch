import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocateWeek, planWeek, prepareEvidence, windowStart } from './weekly-engine.js';
import { createWeeklyStore } from './weekly-store.js';

const data=JSON.parse(readFileSync(new URL('./weekly.snapshot.json',import.meta.url),'utf8'));
const input={gameweek:9,planningDate:'2026-10-25'};
const row=(id, scores)=>({fixture:{id},ranked:Object.entries(scores).map(([id,score])=>({id,name:id,score,checksConfirmed:true})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))});

test('current snapshot has a full real schedule, four source seasons and no invented event metrics',()=>{
  assert.equal(data.season,2026);assert.equal(data.fixtures.length,380);assert.equal(new Set(data.fixtures.map(f=>f.id)).size,380);
  assert.equal(data.seasonTeams['2026'].length,20);
  for(const year of [2023,2024,2025]) assert.equal(data.matches.filter(m=>m.season===year).length,380);
  for(const m of data.matches){assert.ok(data.teams[m.home]&&data.teams[m.away]);assert.ok(!m.refereeId||data.referees.some(r=>r.id===m.refereeId));assert.equal('duels' in m.stats[m.home],false);}
  for(const f of data.fixtures){assert.equal('score' in f,false);assert.equal('refereeId' in f,false);}
  assert.ok(data.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)));
});

test('weekly optimizer avoids greedy choices, preserves locks and uses each referee once',()=>{
  const rows=[row('a',{r1:95,r2:94}),row('b',{r1:93,r2:40})];
  const result=allocateWeek(rows);
  assert.equal(result.total,187);assert.deepEqual(result.assignments.map(a=>a.refereeId),['r2','r1']);
  assert.equal(allocateWeek(rows,{a:'r1'}).total,135);
  assert.throws(()=>allocateWeek(rows,{a:'r1',b:'r1'}),/two fixtures/);
  assert.throws(()=>allocateWeek(rows,{a:'missing'}),/no longer eligible/);
  assert.deepEqual(allocateWeek([...rows].reverse()),result);
  const partial=allocateWeek([row('a',{r1:70}),row('b',{r1:90}),row('c',{})]);
  assert.equal(partial.filled,1);assert.equal(partial.complete,false);assert.equal(partial.total,90);
});

test('optimizer agrees with exhaustive assignment across small competing candidate pools',()=>{
  for(let seed=1;seed<=20;seed++){
    const rows=Array.from({length:4},(_,i)=>row(String(i),Object.fromEntries(Array.from({length:4},(_,j)=>[`r${j}`,(seed*(i+3)*(j+5)*17)%101]).filter((_,j)=>(seed+i+j)%5!==0))));
    let best=-Infinity;
    function visit(i,used,value){if(i===rows.length){best=Math.max(best,value);return;}visit(i+1,used,value);for(const r of rows[i].ranked)if(!used.has(r.id)){used.add(r.id);visit(i+1,used,value+10000+r.score);used.delete(r.id);}}
    visit(0,new Set(),0); const result=allocateWeek(rows);
    assert.equal(result.filled*10000+result.total,best);
  }
});

test('36-month cutoff excludes target-day and future results and resets the table each season',()=>{
  const context=prepareEvidence(data,input.planningDate), baseline=planWeek(data,input);
  assert.equal(context.start,'2023-10-25'); assert.equal(windowStart('2024-02-29'),'2021-02-28');
  assert.ok(context.history.every(m=>m.date>='2023-10-25'&&m.date<'2026-10-25'));
  assert.equal(context.table.reduce((s,t)=>s+t.played,0),data.matches.filter(m=>m.season===2026&&m.date<input.planningDate).length*2);
  const changed=structuredClone(data), example=structuredClone(data.matches.at(-1));
  example.id='future';example.date=input.planningDate;example.score={home:99,away:98};example.stats[example.home].fouls=9999;changed.matches.push(example);
  assert.deepEqual(planWeek(changed,input),baseline);
  assert.ok(baseline.analyses.every(a=>a.teams.every(t=>t.recent.every(m=>m.date<input.planningDate))));
  assert.ok(baseline.analyses.every(a=>a.ranked.every(r=>r.comparable.every(m=>m.date<input.planningDate))));
});

test('week constraints enforce exclusions, conflicts and other duties without changing remaining fit',()=>{
  const baseline=planWeek(data,input), first=baseline.assignments[0], fixture=baseline.analyses.find(a=>a.fixture.id===first.fixtureId).fixture;
  for(const settings of [{availability:'unavailable'},{conflicts:[fixture.home]},{commitments:[fixture.kickoff.slice(0,10)]}]){
    const result=planWeek(data,{...input,roster:{[first.refereeId]:settings}}), analysis=result.analyses.find(a=>a.fixture.id===fixture.id);
    assert.ok(!analysis.ranked.some(r=>r.id===first.refereeId));assert.ok(analysis.excluded.some(r=>r.id===first.refereeId));
    const other=analysis.ranked[0];assert.equal(other.score,baseline.analyses.find(a=>a.fixture.id===fixture.id).ranked.find(r=>r.id===other.id).score);
  }
  const depleted=planWeek(data,{...input,roster:Object.fromEntries(data.referees.map(r=>[r.id,{excluded:true}]))});
  assert.equal(depleted.filled,0);assert.equal(depleted.approvable,false);
});

test('missing team evidence yields no invented score and undated fixtures cannot be assigned',()=>{
  const changed=structuredClone(data), target=changed.fixtures.find(f=>f.gameweek===9);
  changed.matches=changed.matches.filter(m=>m.home!==target.home&&m.away!==target.home);
  const result=planWeek(changed,input), analysis=result.analyses.find(a=>a.fixture.id===target.id);
  assert.equal(analysis.ranked.length,0);assert.ok(analysis.excluded.every(r=>r.reasons.some(s=>s.includes('Both teams'))));
  const undated=structuredClone(data);undated.fixtures.find(f=>f.id===target.id).kickoff=null;
  assert.equal(planWeek(undated,input).assignments.find(a=>a.fixtureId===target.id).refereeId,null);
  const pending=structuredClone(data);
  for(const m of pending.matches) if(m.date>='2026-09-01') for(const stats of Object.values(m.stats)) for(const metric of ['fouls','cards','shots']) stats[metric]=null;
  const pendingPlan=planWeek(pending,input);
  assert.equal(pendingPlan.filled,0);
  assert.ok(pendingPlan.analyses.every(a=>a.excluded.some(r=>r.reasons.some(s=>s.includes('Recent match statistics')))));
});

test('local approval requires committee checks, invalidates after edits, persists and exports reproducible evidence',(t)=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-25T00:00:00Z')});
  const memory=new Map(), storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
  const store=createWeeklyStore(data,{today:input.planningDate,storage});
  assert.equal(store.getSnapshot().gameweek,9);
  assert.throws(()=>store.approve('Reviewer'),/confirm availability/);
  for(const {refereeId} of store.getSnapshot().result.assignments)store.setReferee(refereeId,{availability:'available',cleared:true});
  assert.equal(store.getSnapshot().result.approvable,true);
  store.approve('Reviewer');assert.equal(store.getSnapshot().approval.reviewer,'Reviewer');
  assert.equal(createWeeklyStore(data,{today:input.planningDate,storage}).getSnapshot().approval.reviewer,'Reviewer');
  const report=store.exportBrief();assert.ok(report.evidenceMatches.every(m=>m.date>=report.result.evidence.start&&m.date<input.planningDate));
  assert.equal(report.snapshotId,data.snapshotId);assert.equal(report.rules.version,'2.0.0');assert.equal(report.sources.length,6);
  store.setGap(4);assert.equal(store.getSnapshot().approval,null);assert.deepEqual(store.getSnapshot().approvedWeeks,{});
  const before=store.getSnapshot();assert.throws(()=>store.setPlanningDate('2027-01-01'),/future/);assert.deepEqual(store.getSnapshot(),before);
  assert.throws(()=>store.setReferee(data.referees[0].id,{commitments:['2026-02-30']}),/valid planning date/);
  t.mock.timers.setTime(new Date('2026-11-03T00:00:00Z').getTime());
  for(const {refereeId} of store.getSnapshot().result.assignments)store.setReferee(refereeId,{availability:'available',cleared:true});
  assert.throws(()=>store.approve('Reviewer'),/already started/);
});
