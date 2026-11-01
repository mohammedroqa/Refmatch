/** RefMatch motion system. Pure, deterministic Canvas rendering at any timestamp. */
const canvas = document.querySelector('#film');
const c = canvas.getContext('2d', { alpha: false });
const tokens = await fetch('../brand/tokens.json').then(r => r.json());
const P = tokens.colors;
const W = tokens.video.width, H = tokens.video.height;
const { duration: DURATION, sceneStarts: SCENES, transition: TRANSITION, closingWipe: WIPE } = tokens.video;
const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
const ease = v => 1 - Math.pow(1-clamp(v), 3);
const D = 'Space Grotesk', B = 'Manrope';
const asset = async file => { const i = new Image(); i.src = file; await i.decode(); return i; };
const [logo, darkLogo, mark] = await Promise.all([
  asset('../brand/logos/refmatch-primary.svg'), asset('../brand/logos/refmatch-dark.svg'), asset('../brand/logos/mark-primary.svg'),
  document.fonts.load('600 100px "Space Grotesk"'), document.fonts.load('700 32px Manrope'), document.fonts.load('500 24px Manrope')
]);
await document.fonts.ready;

function rgba(hex,a) { const v=parseInt(hex.slice(1),16);return `rgba(${v>>16},${v>>8&255},${v&255},${a})`; }
function rect(x,y,w,h,r=0,fill,stroke,lw=1){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function line(x1,y1,x2,y2,color,width=1){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function circle(x,y,r,fill,stroke,lw=1){c.beginPath();c.arc(x,y,Math.max(0,r),0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function text(value,x,y,size=24,color=P.chalk,weight=500,font=B,spacing=0,align='left'){
  c.font=`${weight} ${size}px "${font}"`;c.fillStyle=color;c.textAlign=align;c.textBaseline='alphabetic';c.letterSpacing=`${spacing}px`;c.fillText(value,x,y);c.letterSpacing='0px';
}
function image(img,x,y,w){c.drawImage(img,x,y,w,w*img.height/img.width);}
function check(x,y,color=P.mint,size=18){c.beginPath();c.moveTo(x,y+size*.5);c.lineTo(x+size*.34,y+size*.84);c.lineTo(x+size,y);c.strokeStyle=color;c.lineWidth=3;c.lineCap='round';c.lineJoin='round';c.stroke();}
function chip(label,x,y,w,{accent=false,checked=false}={}){
  rect(x,y,w,44,22,accent?P.mint:P.surface,accent?null:P.line);
  if(checked)check(x+17,y+15,accent?P.ink:P.mint,13);
  text(label,x+(checked?41:20),y+29,17,accent?P.ink:P.muted,650);
}
function reveal(a,dx,fn){c.save();c.globalAlpha*=clamp(a);c.translate(dx,0);fn();c.restore();}
function heading(number,label,line1,line2,caption1,caption2,t){
  const e=ease((t+.15)/.65);
  c.save();c.translate(0,24*(1-e));
  text(`${number}  /  ${label}`,104,282,20,P.muted,700,B,2.6);
  text(line1,96,422,116,P.chalk,600,D,-5);
  text(line2,96,552,116,P.mint,600,D,-5);
  rect(104,600,58,4,2,P.mint);
  text(caption1,104,665,27,P.muted,450);
  if(caption2)text(caption2,104,707,27,P.muted,450);
  c.restore();
}

function background(t){
  c.fillStyle=P.ink;c.fillRect(0,0,W,H);
  const g=c.createRadialGradient(1500,470,50,1350,400,1050);g.addColorStop(0,'#153C45');g.addColorStop(.55,'#0C2834');g.addColorStop(1,P.ink);c.fillStyle=g;c.fillRect(0,0,W,H);
  c.save();c.globalAlpha=.10;
  for(let x=900;x<2200;x+=100)line(x,160,x-280,940,P.line);
  for(let y=230;y<940;y+=100)line(880,y,W,y,P.line);
  c.restore();
  const pulse=(t*.065)%1;
  c.save();c.globalAlpha=.1;
  circle(1430,535,430+70*pulse,null,P.teal,1);
  circle(1430,535,520+70*pulse,null,P.teal,1);c.restore();
}
function chrome(t){
  image(logo,100,64,242);
  circle(1477,93,5,P.mint);
  text('PRE-MATCH INTELLIGENCE',1500,101,19,P.muted,650,B,2.1);
  line(100,151,1820,151,rgba(P.muted,.18));
  const active=t<SCENES.rank+TRANSITION/2?0:t<SCENES.explain+TRANSITION/2?1:2;
  ['PROFILE','RANK','EXPLAIN'].forEach((label,i)=>{
    const x=104+i*225;
    text(`0${i+1}`,x,982,18,i===active?P.mint:P.muted,600,D);
    text(label,x+38,982,17,i===active?P.chalk:P.muted,700,B,1.5);
    if(i<2)line(x+156,975,x+189,975,P.line,1);
  });
  circle(1573,975,4,P.teal);text('SYNTHETIC DEMO',1590,982,17,P.muted,600,B,1.3);
  rect(100,1023,1720,2,0,rgba(P.muted,.12));rect(100,1023,1720*(t/DURATION),2,0,P.mint);
}

function pitch(t){
  const x=1000,y=300,w=800,h=490;
  rect(x,y,w,h,24,rgba(P.deep,.28),rgba(P.teal,.25),1.5);
  c.save();c.beginPath();c.roundRect(x,y,w,h,24);c.clip();
  for(let i=0;i<8;i++)rect(x+i*w/8,y,w/8,h,0,i%2?rgba(P.teal,.025):rgba(P.teal,.05));
  const fx=x+34,fy=y+32,fw=w-68,fh=h-64;
  rect(fx,fy,fw,fh,1,null,rgba(P.teal,.24),2);
  line(x+w/2,fy,x+w/2,fy+fh,rgba(P.teal,.24),2);
  circle(x+w/2,y+h/2,83,null,rgba(P.teal,.24),2);
  rect(fx,fy+112,100,202,0,null,rgba(P.teal,.24),2);
  rect(fx+fw-100,fy+112,100,202,0,null,rgba(P.teal,.24),2);
  const dots=[[.13,.27],[.21,.74],[.35,.21],[.32,.65],[.48,.44],[.61,.72],[.65,.24],[.81,.57],[.88,.29],[.78,.83]];
  dots.forEach(([u,v],i)=>{
    let px=fx+fw*u+Math.sin(t*.9+i*1.5)*9,py=fy+fh*v+Math.cos(t*.7+i)*12;
    const col=i<5?P.mint:P.teal;
    circle(px,py,14,rgba(col,.1));circle(px,py,5,col);
    if(i===2||i===7){c.setLineDash([5,8]);line(px,py,px+70*(i<5?1:-1),py+25,rgba(col,.2),1);c.setLineDash([]);}
  });
  // Gentle analysis scan moves behind the risk card.
  let sx=fx+fw*clamp(t/(SCENES.rank-.2));
  const scan=c.createLinearGradient(sx-90,0,sx,0);scan.addColorStop(0,rgba(P.mint,0));scan.addColorStop(1,rgba(P.mint,.11));rect(sx-90,y,90,h,0,scan);line(sx,y,sx,y+h,rgba(P.mint,.35),1);
  c.restore();
}
function profile(t){
  heading('01','PROFILE THE FIXTURE','Read the','match.','Team style. Fixture stakes.','Referee profiles.',t);
  text('NORTH FC',1018,256,25,P.chalk,650,D);text('×',1234,256,24,P.muted,400,D);text('SOUTH FC',1280,256,25,P.chalk,650,D);
  text('DERBY / HIGH STAKES',1798,256,16,P.muted,600,B,1.2,'right');
  pitch(t);
  const v=ease((t-.25)/.8);
  c.save();c.globalAlpha=v;c.translate(0,(1-v)*28);
  c.shadowBlur=50;c.shadowColor='#0005';rect(1105,458,590,200,18,P.surface);c.shadowBlur=0;
  rect(1105,458,590,200,18,null,rgba(P.mint,.6),1.5);
  circle(1136,491,4,P.mint);text('MATCH RISK PROFILE',1153,498,16,P.mint,700,B,2);
  const metrics=[['AGGRESSION',78],['TEMPO',84],['CARD RISK',68]];
  metrics.forEach(([label,n],i)=>{
    const x=1136+i*185;
    text(String(Math.round(n*ease((t-.4-i*.08)/.8))),x,572,52,P.chalk,500,D,-2);
    text('/100',x+66,568,17,P.muted,500);
    text(label,x,610,14,P.muted,700,B,1.6);
    rect(x,627,152,3,1,P.line);rect(x,627,152*n/100*v,3,1,i===1?P.teal:P.mint);
  });
  c.restore();
  chip('TEAM PROFILES',1010,827,220);chip('REFEREES',1246,827,177);chip('CONTEXT',1439,827,166);chip('CONSTRAINTS',1621,827,184);
}

function rank(t){
  heading('02','SCORE & RANK','Find the','right fit.','Match referee strengths','to the fixture’s demands.',t);
  const e=ease(t/.65);
  text('ELIGIBLE REFEREES',1026,258,18,P.muted,700,B,2);
  chip('CONSTRAINTS CHECKED',1515,225,285,{checked:true});
  const entries=[['A',87,310],['B',81,505],['C',76,690]];
  entries.forEach(([name,score,y],i)=>{
    const a=ease((t-i*.1)/.6),xx=1010+(i?28:0)+(1-a)*110,ww=i?744:800;
    c.save();c.globalAlpha=a;
    rect(xx,y,ww,158,20,i===0?P.surfaceRaised:rgba(P.surface,.85),i===0?P.mint:P.line,i===0?2:1);
    if(i===0)rect(xx,y+27,5,104,2,P.mint);
    circle(xx+60,y+79,29,i===0?P.mint:P.surfaceRaised);
    text(`0${i+1}`,xx+60,y+87,22,i===0?P.ink:P.muted,650,D,0,'center');
    text(i===0?'BEST FIT':'ALTERNATIVE',xx+110,y+44,14,i===0?P.mint:P.muted,700,B,1.9);
    text(`Referee ${name}`,xx+110,y+96,42,P.chalk,550,D,-1.4);
    rect(xx+111,y+120,298,3,1,P.line);rect(xx+111,y+120,298*score/100*e,3,1,i===0?P.mint:P.teal);
    const value=Math.round(score*ease((t-.14-i*.07)/.65));
    text(String(value),xx+ww-82,y+94,66,i===0?P.mint:P.chalk,550,D,-3,'right');
    text('%',xx+ww-70,y+91,26,i===0?P.mint:P.muted,500,D);
    text('FIT SCORE',xx+ww-38,y+124,13,P.muted,650,B,1.2,'right');
    c.restore();
  });
  chip('Available',104,789,150,{checked:true});chip('Neutral',269,789,142,{checked:true});chip('Rest checked',426,789,195,{checked:true});
}

function explain(t){
  heading('03','EXPLAIN THE RECOMMENDATION','Know','the why.','Clear reasons.','Relevant law context.',t);
  const a=ease(t/.5);
  c.save();c.translate(0,20*(1-a));
  rect(1006,253,800,593,24,P.surface,P.line,1);
  rect(1006,253,800,6,3,P.mint);
  circle(1063,313,19,P.mint);check(1055,306,P.ink,17);
  text('Referee A',1100,324,39,P.chalk,550,D,-1.2);
  text('87',1699,326,62,P.mint,550,D,-2,'right');text('% FIT',1711,324,18,P.mint,650);
  line(1044,360,1768,360,P.line);
  const rows=[['42','High-intensity matches','Experience for an intense fixture'],['92/100','Consistency','Steady decisions under pressure']];
  rows.forEach(([n,label,detail],i)=>{
    const v=ease((t-.12-i*.2)/.5),y=404+i*132;
    c.save();c.globalAlpha=v;c.translate(24*(1-v),0);
    rect(1045,y,135,88,12,P.surfaceRaised);
    text(n,1112,y+54,i?31:43,P.mint,550,D,-1,'center');
    text(label,1207,y+29,28,P.chalk,650,D,-.4);
    text(detail,1207,y+66,19,P.muted,450);
    c.restore();
  });
  line(1044,665,1768,665,P.line);
  text('LAW CONTEXT',1045,703,13,P.teal,700,B,1.8);
  text('Referee responsibilities & match control',1045,742,25,P.chalk,500,D,-.4);
  chip('Neutrality checked',1044,774,235,{checked:true});
  text('WATCH: 4-DAY REST',1767,805,16,P.amber,600,B,1,'right');
  c.restore();
}

function ending(t){
  const wipe=ease((t-SCENES.ending)/WIPE);
  c.save();c.beginPath();c.arc(1820,540,2050*wipe,0,Math.PI*2);c.clip();
  c.fillStyle=P.mint;c.fillRect(0,0,W,H);
  c.save();c.translate(960,540);c.rotate(-.17);c.strokeStyle=rgba(P.ink,.065);c.lineWidth=2;
  c.beginPath();c.roundRect(-1150,-650,2300,1300,220);c.stroke();
  circle(0,0,400,null,rgba(P.ink,.065),2);line(0,-650,0,650,rgba(P.ink,.065),2);
  c.restore();
  const a=ease((t-SCENES.ending-.26)/.52);
  c.save();c.globalAlpha=a;c.translate(0,30*(1-a));
  text('EXPLAINABLE REFEREE ASSIGNMENT',960,254,19,P.ink,700,B,3,'center');
  const w=1020*(.97+.03*a);image(darkLogo,(W-w)/2,353,w);
  text('The right fit. Before kickoff.',960,689,47,P.ink,500,D,-1.5,'center');
  line(736,750,1184,750,rgba(P.ink,.25));
  text('PROFILE.   RANK.   EXPLAIN.',960,811,20,P.ink,700,B,2.8,'center');
  c.restore();
  text('REFMATCH',104,978,17,rgba(P.ink,.65),700,B,2);
  text('SYNTHETIC CONCEPT DEMO',1816,978,16,rgba(P.ink,.65),600,B,1.6,'right');
  c.restore();
}

export function renderAt(seconds){
  const t=clamp(seconds,0,DURATION);
  c.resetTransform();c.globalAlpha=1;c.lineCap='butt';c.lineJoin='miter';
  background(t);
  const a=ease((t-SCENES.rank)/TRANSITION),b=ease((t-SCENES.explain)/TRANSITION);
  if(t<SCENES.rank+TRANSITION)reveal(1-a,-60*a,()=>profile(t));
  if(t>SCENES.rank&&t<SCENES.explain+TRANSITION)reveal(a*(1-b),60*(1-a)-60*b,()=>rank(t-SCENES.rank));
  if(t>SCENES.explain)reveal(b,60*(1-b),()=>explain(t-SCENES.explain));
  chrome(t);
  if(t>=SCENES.ending)ending(t);
}

window.renderAt=renderAt;
window.filmReady=true;
const renderMode=new URLSearchParams(location.search).has('render');
if(renderMode)document.body.classList.add('render');
renderAt(renderMode?0:.8);

if(!renderMode){
  const play=document.querySelector('#play'),scrub=document.querySelector('#scrub'),out=document.querySelector('#time'),sound=document.querySelector('#sound');
  let playing=false,start=0,current=.8,handle;
  scrub.max=String(DURATION);
  const position=t=>{current=clamp(t,0,DURATION);renderAt(current);scrub.value=current;out.textContent=`${current.toFixed(1)} / ${DURATION} s`;};
  const stop=()=>{playing=false;play.textContent='Play film';sound.pause();cancelAnimationFrame(handle);};
  const tick=now=>{position((now-start)/1000);if(current>=DURATION){stop();return;}handle=requestAnimationFrame(tick);};
  play.disabled=false;
  play.addEventListener('click',()=>{
    if(playing){stop();return;}
    if(current>=DURATION-.01||current===.8)current=0;
    playing=true;play.textContent='Pause';start=performance.now()-current*1000;
    sound.currentTime=current;sound.play().catch(()=>{});handle=requestAnimationFrame(tick);
  });
  scrub.addEventListener('input',()=>{stop();position(Number(scrub.value));sound.currentTime=current;});
  position(current);
}
