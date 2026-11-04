import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createWeeklyApi } from './weekly-api.mjs';
import { createEvalApi } from './eval-api.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(resolve(root,'.env'))) {
  const localEnv=parseEnv(readFileSync(resolve(root,'.env'),'utf8'));
  for(const key of ['ANTHROPIC_API_KEY','REFMATCH_EVAL_OPENAI_MODEL','REFMATCH_EVAL_ANTHROPIC_MODEL','REFMATCH_EVAL_GOOGLE_MODEL','OPENAI_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY','REFMATCH_MODEL','REFMATCH_PORT','REFMATCH_PROVIDER','COPILOT_STUDIO_TOKEN_ENDPOINT','COPILOT_STUDIO_DIRECT_LINE_SECRET','COPILOT_STUDIO_DIRECT_LINE_URL']) if(localEnv[key]) process.env[key]=localEnv[key];
}
process.env.COPILOTKIT_TELEMETRY_DISABLED ??= 'true';
const { createAssistantApi } = await import('./copilot-runtime.mjs');
const portArg=process.argv.indexOf('--port');
const port=Number(portArg>=0 ? process.argv[portArg+1] : process.env.REFMATCH_PORT||4173);
const assistantApi=createAssistantApi(), weeklyApi=createWeeklyApi(root), evalApi=createEvalApi(root);
const server=createStaticServer(root,{apiHandler:(req,res)=>req.url.startsWith('/api/eval/') ? evalApi(req,res) : new URL(req.url,'http://localhost').pathname==='/api/weekly-refresh' ? weeklyApi(req,res) : assistantApi(req,res)});
server.listen(port,'127.0.0.1',()=>console.log(`RefMatch landing page: http://127.0.0.1:${port}/\nInteractive demo: http://127.0.0.1:${port}/demo/\nBrand identity: http://127.0.0.1:${port}/brand/\nEditable film: http://127.0.0.1:${port}/video/`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
