/** Reproducible 1080p/60 fps renderer. Requires Chromium, FFmpeg, and Python 3. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createStaticServer } from './server.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(resolve(root,'brand/tokens.json'),'utf8')).video;
const stillsOnly=process.argv.includes('--stills');
const server=createStaticServer(root);
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const systemChrome=['/usr/bin/google-chrome','/usr/bin/chromium','/snap/bin/chromium'].find(existsSync);
let browser,encoder;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||systemChrome,args:['--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${url}/video/?render`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.filmReady===true);
  await mkdir(resolve(root,'video/stills'),{recursive:true});
  const stills=[['01-profile',config.sceneStarts.rank*.6],['02-rank',(config.sceneStarts.rank+config.sceneStarts.explain)/2],['03-explain',(config.sceneStarts.explain+config.sceneStarts.ending)/2],['04-brand',config.duration-1]];
  for(const [name,time] of stills){
    await page.evaluate(t=>window.renderAt(t),time);
    await page.screenshot({path:resolve(root,`video/stills/${name}.png`)});
  }
  await page.evaluate(t=>window.renderAt(t),config.duration-1);
  await page.screenshot({path:resolve(root,'video/refmatch-poster.png')});

  // Transparent, high-resolution raster versions of the portable vector assets.
  const logoAssets=['primary','dark','white','black'].flatMap(v=>[`refmatch-${v}`,`mark-${v}`]).concat('app-icon');
  for(const name of logoAssets){
    const data=await page.evaluate(async name=>{
      const img=new Image();img.src=`../brand/logos/${name}.svg`;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=name.startsWith('refmatch')?2000:1024;canvas.height=Math.round(canvas.width*img.height/img.width);
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png').split(',')[1];
    },name);
    await writeFile(resolve(root,`brand/logos/${name}.png`),Buffer.from(data,'base64'));
  }
  if(errors.length)throw new Error(errors.join('\n'));
  if(!stillsOnly){
    execFileSync('python3',[resolve(root,'scripts/soundtrack.py')],{stdio:'inherit'});
    const out=resolve(root,`video/refmatch-${config.duration}s.mp4`);
    await mkdir(resolve(root,'video/.render'),{recursive:true});
    const pending=resolve(root,`video/.render/refmatch-${config.duration}s.pending.mp4`);
    encoder=spawn('ffmpeg',['-y','-hide_banner','-loglevel','warning','-f','image2pipe','-framerate',String(config.fps),'-vcodec','png','-i','pipe:0','-i',resolve(root,'video/refmatch-soundtrack.wav'),'-map','0:v:0','-map','1:a:0','-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p','-r',String(config.fps),'-c:a','aac','-b:a','192k','-ar','48000','-t',String(config.duration),'-movflags','+faststart','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-metadata','title=RefMatch — The right fit. Before kickoff.','-metadata','comment=Original motion graphics and sound. Illustrative synthetic concept demo.',pending],{stdio:['pipe','inherit','inherit']});
    const completed=new Promise((ok,fail)=>{encoder.on('error',fail);encoder.on('close',code=>code===0?ok():fail(new Error(`FFmpeg exited with ${code}`)));});
    // Prevent an encoder failure from being lost while frames are still rendering.
    let encodeFailure;completed.catch(e=>{encodeFailure=e;});encoder.stdin.on('error',e=>{encodeFailure=e;});
    for(let frame=0;frame<config.fps*config.duration;frame++){
      if(encodeFailure)throw encodeFailure;
      const encoded=await page.evaluate(t=>{
        window.renderAt(t);
        return document.querySelector('#film').toDataURL('image/png').split(',')[1];
      },frame/config.fps);
      const png=Buffer.from(encoded,'base64');
      if(!encoder.stdin.write(png))await once(encoder.stdin,'drain');
      if(frame%config.fps===0)console.log(`Rendered ${(frame/config.fps).toFixed(0)} / ${config.duration}s`);
    }
    encoder.stdin.end();await completed;
    if(errors.length)throw new Error(errors.join('\n'));
    const report=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,nb_frames,width,height','-of','json',pending],{encoding:'utf8'}));
    const stream=report.streams.find(s=>s.codec_type==='video');
    if(Number(report.format.duration)!==config.duration||Number(stream?.nb_frames)!==config.fps*config.duration||stream.width!==config.width||stream.height!==config.height)throw new Error('Export validation failed; pending file retained for inspection.');
    await rename(pending,out);
    console.log(`Saved ${out}`);
  }
  console.log('Saved scene stills, poster, and transparent logo PNGs. No browser errors.');
} finally {
  if(encoder&&!encoder.killed&&encoder.exitCode===null)encoder.kill();
  await browser?.close();await new Promise(r=>server.close(r));
}
