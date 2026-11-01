import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

export function createWeeklyApi(root) {
  let refreshing=false;
  return async(req,res)=>{
    const host=req.headers.host||'';
    res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
    const send=(code,body)=>{res.writeHead(code);res.end(JSON.stringify(body));};
    if(!['localhost','127.0.0.1'].includes(host.split(':')[0]) || req.headers.origin!==`http://${host}`) return send(403,{error:'Local same-origin requests only.'});
    if(req.method!=='POST') return send(405,{error:'Use POST to refresh.'});
    if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'JSON required.'});
    if(refreshing)return send(409,{error:'A refresh is already running.'});
    refreshing=true;
    try {
      await execute('python3',['scripts/refresh-weekly.py','--season','2026'],{cwd:root,timeout:300000,maxBuffer:1024*1024});
      send(200,{ok:true});
    }catch { send(502,{error:'The sources could not be refreshed or validated. The last verified snapshot has been retained. Retry when the feeds are available.'}); }
    finally{refreshing=false;}
  };
}
