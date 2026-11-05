/** Records real browser interactions. Run narration first; FFPROBE may name a binary. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createStaticServer } from './server.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const work=resolve(root,'video/.render/walkthrough');
const out=resolve(root,'video/walkthrough');
const probe=process.env.FFPROBE||'ffprobe';
const live=process.env.REFMATCH_WALKTHROUGH_URL||'https://mohammedroqa.github.io/Refmatch/demo/eval.html';
const scenes=JSON.parse(await readFile(resolve(out,'scenes.json'),'utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir(resolve(work,'raw'),{recursive:true});
await mkdir(resolve(out,'evidence'),{recursive:true});
const server=createStaticServer(root);
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
const resume=process.argv.includes('--resume');
let savedState;
if(resume)try{savedState=JSON.parse(await readFile(resolve(work,'storage.json'),'utf8'));}catch{}
const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1,...(savedState?{storageState:savedState}:{}),recordVideo:{dir:resolve(work,'raw'),size:{width:1600,height:900}}});
const errors=[],timeline=resume?JSON.parse(await readFile(resolve(work,'timeline.json'),'utf8')):[],verification={url:live,recordedAt:new Date().toISOString(),source:'simulation',checks:[]};
let total=timeline.reduce((n,s)=>n+s.duration,0);

async function scroll(page,selector,smooth=true){
  await page.locator(selector).first().evaluate((e,smooth)=>window.scrollTo({top:scrollY+e.getBoundingClientRect().top-80,behavior:smooth?'smooth':'instant'}),smooth);
  if(smooth)await wait(800);
}
async function focus(page,selector){
  await page.evaluate(selector=>{
    document.querySelectorAll('.wt-focus').forEach(e=>e.classList.remove('wt-focus'));
    document.querySelector(selector.replace('blockquote','.source'))?.classList.add('wt-focus');
  },selector);
}
async function click(page,selector){
  const target=page.locator(selector).first();
  const box=await target.boundingBox();
  if(box){await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:18});await wait(170);}
  await target.click();
}
async function download(page,selector,filename){
  const pending=page.waitForEvent('download');
  await click(page,selector);
  const d=await pending;
  await d.saveAs(resolve(out,'evidence',filename));
}
async function checkMetrics(page,expected,name){
  const metrics=JSON.parse(await page.locator('#metrics-json').textContent()).selectedTrial;
  for(const [key,value] of Object.entries(expected)){
    const actual=key.split('.').reduce((v,k)=>v[k],metrics);
    if(actual!==value)throw new Error(`${name}: ${key}: expected ${value}, received ${actual}`);
  }
  verification.checks.push({name,passed:true,metrics});
}
async function decorate(page,scene,index){
  await page.addStyleTag({content:`
    #wt-bar{position:fixed;z-index:2147483646;left:0;top:0;right:0;height:58px;background:#05131bf7;border-bottom:1px solid #31515d;display:flex;align-items:center;justify-content:space-between;padding:0 42px;font:600 16px Manrope,Arial;color:#f3f5ef;letter-spacing:.02em}
    #wt-bar span{color:#65d8ca;font-size:13px;letter-spacing:.08em}
    #wt-bottom{position:fixed;z-index:2147483645;bottom:0;left:0;right:0;height:92px;background:linear-gradient(transparent,#05131bf7 28%,#05131b);pointer-events:none}
    #wt-pointer{position:fixed;z-index:2147483647;width:24px;height:24px;border:2px solid #b6f36a;background:#b6f36a22;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 4px #081c2677;display:none}
    .wt-focus{outline:3px solid #b6f36a!important;outline-offset:5px;box-shadow:0 0 22px #b6f36a1a!important}
  `});
  await page.evaluate(({title,index,kind})=>{
    const bar=document.createElement('div');bar.id='wt-bar';
    const left=document.createElement('b');left.textContent=title;
    const right=document.createElement('span');right.textContent=kind==='app'?'LIVE APP WALKTHROUGH · SIMULATED RESULTS':`REFMATCH / EVALUATION LAB · ${String(index+1).padStart(2,'0')} / 12`;
    bar.append(left,right);document.body.append(bar);
    const bottom=document.createElement('div');bottom.id='wt-bottom';document.body.append(bottom);
    const pointer=document.createElement('div');pointer.id='wt-pointer';document.body.append(pointer);
    document.addEventListener('mousemove',e=>{pointer.style.display='block';pointer.style.left=e.clientX+'px';pointer.style.top=e.clientY+'px';});
  },{title:scene.title,index,kind:scene.kind});
}

try{
  for(const [index,scene] of scenes.entries()){
    if(timeline.some(s=>s.id===scene.id))continue;
    const audioDuration=Number(execFileSync(probe,['-v','error','-show_entries','format=duration','-of','csv=p=0',resolve(work,scene.id+'.wav')],{encoding:'utf8'}).trim());
    const duration=Math.ceil((audioDuration+.45+(scene.id==='credits'?2.8:.9))*25)/25;
    const page=await context.newPage();page.on('pageerror',e=>errors.push({scene:scene.id,error:e.message}));
    await page.goto(scene.kind==='app'?live:`${local}/video/walkthrough/cards.html?scene=${scene.id}`,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    if(scene.kind==='app')await page.waitForFunction(()=>document.querySelector('#reference-status').textContent.includes('136/136'));
    if(scene.id==='dataset')await scroll(page,'#dataset-heading',false);
    if(['configure','control'].includes(scene.id))await scroll(page,'#run-heading',false);
    if(['results','exports'].includes(scene.id))await scroll(page,'#results-heading',false);
    if(scene.id==='results'){
      await download(page,'#export-report','overconfident-batch.json');
      await scroll(page,'#results-heading',false);
    }
    if(scene.id==='uncertain')await scroll(page,'#failure-filter',false);
    if(scene.id==='withdrawal'){
      await page.locator('#case-select').selectOption('note-coordinator-thread-valid-01-1');
      await scroll(page,'#case-heading',false);
    }
    if(scene.id==='control'){
      await page.locator('#stage').selectOption('evidence');
      await page.locator('#split').selectOption('validation');
    }
    if(scene.id==='exports')await page.locator('#batch-select').selectOption({index:1});
    await decorate(page,scene,index);
    await page.mouse.move(1550,780);
    await page.evaluate(()=>document.querySelector('#wt-pointer').style.display='none');
    const started=performance.now();
    const at=async(seconds,fn)=>{await wait(Math.max(0,seconds*1000-(performance.now()-started)));await fn();};
    console.log(`Recording ${index+1}/${scenes.length}: ${scene.id} (${duration.toFixed(2)}s)`);
    if(scene.id==='problem'){
      await at(4,()=>focus(page,'.lead'));
      await at(14,()=>focus(page,'.notice'));
    }else if(scene.id==='dataset'){
      await at(1,()=>click(page,'#check-corpus'));
      await at(3,()=>focus(page,'#reference-status'));
      await at(8,()=>focus(page,'#development-count'));
      await at(11,()=>focus(page,'#validation-count'));
      await at(15,()=>focus(page,'#dataset-summary'));
    }else if(scene.id==='configure'){
      await at(1,()=>page.locator('#stage').selectOption('evidence'));
      await at(2.6,()=>page.locator('#split').selectOption('validation'));
      await at(4.2,()=>page.locator('#profile').selectOption('overconfident'));
      await at(5.3,()=>focus(page,'#profile'));
      await at(7,()=>click(page,'#run-batch'));
      await page.waitForFunction(()=>document.querySelector('#run-status').textContent.startsWith('Finished'));
      await checkMetrics(page,{completed:8,errors:0,unrun:0,'unsafeClearance.numerator':3,'unsafeClearance.denominator':5,'endToEndAccuracy.value':.625},'overconfident batch');
      await at(11,()=>focus(page,'#run-status'));
    }else if(scene.id==='results'){
      await at(1,()=>focus(page,'#results > p:nth-last-child(2)'));
      await at(4,()=>focus(page,'.metric:nth-child(4)'));
      await at(9,()=>focus(page,'.metric:nth-child(1)'));
      await at(15,()=>focus(page,'.metric:nth-child(2)'));
      await at(18,()=>focus(page,'.metric:nth-child(3)'));
      await at(22,()=>focus(page,'#results > p:nth-last-child(2)'));
    }else if(scene.id==='uncertain'){
      await at(.5,()=>page.locator('#failure-filter').selectOption('unsafe'));
      await at(2,()=>click(page,'#attempts button'));
      await scroll(page,'#case-heading');
      if(await page.locator('#case-select').inputValue()!=='note-attendance-query-valid-01-0')throw new Error('Unexpected first unsafe case');
      await at(5,()=>focus(page,'#evidence blockquote:nth-child(1)'));
      await at(8,()=>focus(page,'#evidence blockquote:nth-child(2)'));
      await at(13,()=>focus(page,'#evidence blockquote:nth-child(3)'));
      await at(16,()=>focus(page,'#evidence blockquote:nth-child(4)'));
      await at(19,()=>focus(page,'#reference-verdict'));
      await at(23,()=>focus(page,'#stage-diagnosis'));
    }else if(scene.id==='withdrawal'){
      await at(2,()=>focus(page,'#evidence blockquote:nth-child(2)'));
      await at(7,()=>focus(page,'#reference-verdict'));
      await at(10,()=>focus(page,'#model-response'));
    }else if(scene.id==='control'){
      await at(1,()=>page.locator('#profile').selectOption('reference'));
      await at(2,()=>focus(page,'#profile'));
      await at(3,()=>click(page,'#run-batch'));
      await page.waitForFunction(()=>document.querySelector('#run-status').textContent.startsWith('Finished'));
      await checkMetrics(page,{completed:8,'unsafeClearance.numerator':0,'unsafeClearance.denominator':5,'endToEndAccuracy.value':1,'extraction.value':1,'citations.value':1},'reference-assisted control');
      await at(5,()=>scroll(page,'#results-heading'));
      await at(8,()=>focus(page,'.metric:nth-child(4)'));
      await at(12,()=>focus(page,'#results .status-badge'));
    }else if(scene.id==='exports'){
      await at(1,()=>download(page,'#export-report','reference-batch.json'));
      await at(4,()=>download(page,'#export-csv','reference-scores.csv'));
      await at(7,()=>scroll(page,'#review-heading'));
      await at(10,()=>download(page,'#export-blind','blind-review-pack.json'));
      await at(14,()=>focus(page,'#review-role'));
    }
    await at(duration-1,async()=>{
      await page.evaluate(()=>document.querySelector('#wt-pointer').style.display='none');
      await page.screenshot({path:resolve(work,scene.id+'.png')});
    });
    await wait(Math.max(0,duration*1000-(performance.now()-started)));
    const video=page.video();await page.close();const raw=await video.path();
    const rawDuration=Number(execFileSync(probe,['-v','error','-show_entries','format=duration','-of','csv=p=0',raw],{encoding:'utf8'}).trim());
    timeline.push({...scene,start:total,duration,audioDuration,audioLead:.45,raw,trimStart:Math.max(0,rawDuration-duration)});
    total+=duration;
    await context.storageState({path:resolve(work,'storage.json')});
    await writeFile(resolve(work,'timeline.json'),JSON.stringify(timeline,null,2));
  }
  if(total>300)throw new Error(`Walkthrough exceeds five minutes: ${total}`);
  if(errors.length)throw new Error(JSON.stringify(errors));
  verification.duration=total;verification.browserErrors=errors;
  await writeFile(resolve(out,'evidence/verification.json'),JSON.stringify(verification,null,2));
  console.log(`Captured ${total.toFixed(2)}s; all recorded result checks passed.`);
}finally{
  await context.close();await browser.close();await new Promise(r=>server.close(r));
}
