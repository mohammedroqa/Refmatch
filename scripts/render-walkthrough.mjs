/** Encode the recorded walkthrough with narration, captions and chapter metadata. */
import { readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const work=resolve(root,'video/.render/walkthrough');
const output=resolve(root,'video/walkthrough');
const ffmpeg=process.env.FFMPEG||'ffmpeg',probe=process.env.FFPROBE||'ffprobe';
const scenes=JSON.parse(await readFile(resolve(output,'scenes.json'),'utf8'));
const timeline=JSON.parse(await readFile(resolve(work,'timeline.json'),'utf8')).map(s=>({...s,...scenes.find(c=>c.id===s.id)}));
if(timeline.length!==12)throw new Error('Expected all twelve recorded scenes.');
const duration=timeline.reduce((n,s)=>n+s.duration,0);
if(duration>300)throw new Error('Video must be five minutes or less.');
const stamp=(n,separator='.')=>{
  const ms=Math.round(n*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`;
};
const assTime=n=>{const cs=Math.round(n*100);return `${Math.floor(cs/360000)}:${String(Math.floor(cs/6000)%60).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;};
const run=args=>new Promise((ok,fail)=>{
  const p=spawn(ffmpeg,['-y','-hide_banner','-loglevel','warning',...args],{cwd:root,stdio:['ignore','ignore','pipe']});
  let error='';p.stderr.on('data',b=>error+=b);p.on('error',fail);p.on('close',code=>code?fail(new Error(error)):ok());
});
const cues=[],chapters=[];
let metadata=';FFMETADATA1\ntitle=RefMatch Evaluation Lab — Video Walkthrough\nartist=Mohammed Roqa\ncopyright=Copyright 2026 Mohammed Roqa. All rights reserved.\ncomment=Made with ❤️ By Mohammed Roqa. Live app walkthrough with explicitly labelled simulated evaluation results.\n';
for(const scene of timeline){
  const words=JSON.parse((await readFile(resolve(work,scene.id+'-words.json'),'utf8')).replace(/^\uFEFF/,''));
  const unique=words.filter((w,i)=>i===0||w.Position!==words[i-1].Position);
  const local=[];
  for(let i=0;i<unique.length;){
    let j=i+1;
    while(j<unique.length){
      const candidate=scene.text.slice(unique[i].Position,unique[j].Position).trim();
      if(candidate.length>=80||unique[j].Seconds-unique[i].Seconds>=5||(/[.!?]$/.test(candidate)&&candidate.length>35))break;
      j++;
    }
    const start=scene.audioLead+unique[i].Seconds;
    const end=Math.max(start+.4,j<unique.length?scene.audioLead+unique[j].Seconds-.06:scene.audioLead+scene.audioDuration-.15);
    const text=scene.text.slice(unique[i].Position,j<unique.length?unique[j].Position:undefined).trim();
    local.push({start,end,text});cues.push({start:scene.start+start,end:scene.start+end,text});
    i=j;
  }
  const ass=`[Script Info]\nScriptType: v4.00+\nPlayResX: 1600\nPlayResY: 900\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Segoe UI,27,&H00F3F5EF,&H000000FF,&H0005131B,&H0005131B,0,0,0,0,100,100,0,0,1,2,0,2,90,90,25,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`+local.map(c=>`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.text.replaceAll('{','\\{').replaceAll('}','\\}')}`).join('\n');
  await writeFile(resolve(work,scene.id+'.ass'),ass);
  await run(['-ss',scene.trimStart.toFixed(3),'-i',scene.raw,'-i',resolve(work,scene.id+'.wav'),'-vf',`subtitles=video/.render/walkthrough/${scene.id}.ass:fontsdir=brand/fonts,scale=1920:1080:flags=lanczos,setsar=1`,'-af','loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,adelay=450:all=1,apad','-map','0:v:0','-map','1:a:0','-t',scene.duration.toFixed(3),'-r','25','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','160k','-movflags','+faststart',resolve(work,scene.id+'.mp4')]);
  chapters.push({id:scene.id,title:scene.title,start:Number(scene.start.toFixed(2)),duration:scene.duration});
  metadata+=`\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(scene.start*1000)}\nEND=${Math.round((scene.start+scene.duration)*1000)}\ntitle=${scene.title}\n`;
  console.log(`Encoded ${scene.id}`);
}
await writeFile(resolve(work,'concat.txt'),timeline.map(s=>`file '${s.id}.mp4'`).join('\n'));
await writeFile(resolve(work,'metadata.txt'),metadata);
await run(['-f','concat','-safe','0','-i',resolve(work,'concat.txt'),'-i',resolve(work,'metadata.txt'),'-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',resolve(output,'refmatch-evaluation-walkthrough.mp4')]);
await copyFile(resolve(work,'intro.png'),resolve(output,'poster.png'));
await writeFile(resolve(output,'captions.vtt'),'WEBVTT\n\n'+cues.map(c=>`${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));
await writeFile(resolve(output,'chapters.vtt'),'WEBVTT\n\n'+chapters.map(c=>`${stamp(c.start)} --> ${stamp(c.start+c.duration)}\n${c.title}\n`).join('\n'));
await writeFile(resolve(output,'chapters.json'),JSON.stringify(chapters,null,2));
await writeFile(resolve(output,'transcript.md'),'# RefMatch Evaluation Lab — Video walkthrough\n\n'+timeline.map(s=>`## ${stamp(s.start).slice(3,8)} — ${s.title}\n\n${s.text}\n`).join('\n')+'\nProject owner: Mohammed Roqa.\n\n© 2026 Mohammed Roqa. All rights reserved.\n\nMade with ❤️ By Mohammed Roqa\n');
const report=JSON.parse(execFileSync(probe,['-v','error','-show_format','-show_streams','-show_chapters','-of','json',resolve(output,'refmatch-evaluation-walkthrough.mp4')],{encoding:'utf8'}));
const v=report.streams.find(s=>s.codec_type==='video'),a=report.streams.find(s=>s.codec_type==='audio');
if(!a||a.codec_name!=='aac'||v.codec_name!=='h264'||v.width!==1920||v.height!==1080||Number(report.format.duration)>300||Math.abs(Number(report.format.duration)-duration)>.3||report.chapters.length!==12)throw new Error('Final media validation failed.');
const info={duration:Number(report.format.duration),width:v.width,height:v.height,fps:v.avg_frame_rate,audio:a.codec_name,audioSampleRate:a.sample_rate,bytes:(await stat(resolve(output,'refmatch-evaluation-walkthrough.mp4'))).size,chapters:report.chapters.length,owner:'Mohammed Roqa',tagline:'Made with ❤️ By Mohammed Roqa',source:'Labelled simulations recorded in the live Evaluation Lab',voice:'Microsoft Zira Desktop / Windows speech synthesis',captions:'Burned-in English captions; standalone WebVTT also provided'};
await writeFile(resolve(output,'media.json'),JSON.stringify(info,null,2));
console.log(JSON.stringify(info,null,2));
