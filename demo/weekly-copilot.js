import { z } from 'zod';
import { mountCopilot } from './copilot-client.js';

export function weeklyFacts(snapshot) {
  const result = snapshot.result;
  return { mode: 'committee', season: result.season, gameweek: result.gameweek, planningDate: result.planningDate,
    revision: snapshot.revision, evidence: result.evidence, filled: result.filled, totalFit: result.total,
    assignments: result.assignments,
    fixtures: result.analyses.map(a=>({id:a.fixture.id,home:a.teams[0].name,away:a.teams[1].name,kickoff:a.fixture.kickoff})),
    approval: snapshot.approval ? { reviewer: snapshot.approval.reviewer, status: snapshot.approval.status } : null,
    limitations: 'Experimental fit, not quality or probability. Names retain source abbreviations. Operational declarations need committee confirmation. Original publication times are not archived.' };
}

export function createWeeklyTools(store, session, data, callbacks) {
  const referee=z.enum(data.referees.map(r=>r.id)), fixture=z.enum(data.fixtures.map(f=>f.id));
  const define=(name,description,parameters,execute)=>({name,description,parameters,handler(args,context){
    try{
      if(!session.active()||context?.signal?.aborted)throw new Error('This request was stopped.');
      if(session.revision()!==store.getSnapshot().revision)throw new Error('The weekly plan changed. Ask again for the current plan.');
      const extra=execute(parameters.parse(args))||{}, snapshot=store.getSnapshot();
      session.updated(snapshot.revision);session.completed(name,snapshot);
      return {ok:true,...weeklyFacts(snapshot),...extra};
    }catch(error){return {ok:false,error:error.message};}
  }});
  const analysis=id=>{const a=store.getSnapshot().result.analyses.find(a=>a.fixture.id===id);if(!a)throw new Error('Choose a fixture in the selected matchweek.');return a;};
  return [
    define('inspect_week','Read the weekly assignments, evidence coverage, pending checks and calculated results.',z.object({}).strict(),()=>{}),
    define('inspect_match','Read team profiles, previous meetings, table stakes, candidate factors and exclusions for a fixture in the selected week.',z.object({fixtureId:fixture}).strict(),({fixtureId})=>{
      const a=analysis(fixtureId);callbacks.inspect(fixtureId);
      return {match:{fixture:a.fixture,teams:a.teams,matchContext:a.matchContext,headToHead:a.headToHead,ranked:a.ranked.slice(0,5),excluded:a.excluded}};
    }),
    define('compare_weekly_referees','Compare two referees using returned factor points, and display their comparison.',z.object({fixtureId:fixture,first:referee,second:referee}).strict().refine(v=>v.first!==v.second,'Choose different referees.'),({fixtureId,first,second})=>{
      const a=analysis(fixtureId), candidates=[first,second].map(id=>a.ranked.find(r=>r.id===id)||a.excluded.find(r=>r.id===id));
      callbacks.compare(fixtureId,first,second);return {comparison:candidates};
    }),
    define('select_matchweek','Select a scheduled matchweek only when requested.',z.object({gameweek:z.number().int().min(1).max(38)}).strict(),({gameweek})=>{store.selectWeek(gameweek);}),
    define('exclude_weekly_referee','Include or exclude a referee in the weekly hypothetical pool when requested. Does not confirm actual availability or checks; invalidates approval.',z.object({refereeId:referee,excluded:z.boolean()}).strict(),({refereeId,excluded})=>{store.setReferee(refereeId,{excluded});}),
  ];
}

export async function mountWeeklyCopilot(store, data, callbacks) {
  await mountCopilot(store,{facts:weeklyFacts,makeTools:(s,session)=>createWeeklyTools(s,session,data,callbacks),agentId:'weekly',
    onToolResult:(name,snapshot)=>['select_matchweek','exclude_weekly_referee'].includes(name)?`Matchweek ${snapshot.gameweek}: ${snapshot.result.filled} fixtures filled, ${snapshot.result.total} total fit points. Committee checks and approval remain manual.`:null});
}
