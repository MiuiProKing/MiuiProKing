/* REALITY COLLAPSE X — lightweight cinematic Canvas 2D effects.
   No external dependencies, no network, no app data access.
   This is a stylized 2.5D illusion, not a true 3D model.
*/
(()=>{'use strict';
const ok=location.hostname==='miuiproking.github.io'&&location.pathname.startsWith('/luckyjet-telegram-mini-app/god-preditor-pro-vip/');
if(!ok||window.__rcxInstalled)return;window.__rcxInstalled=true;
const start=()=>{
if(!document.body||document.getElementById('rcx-scene'))return;
const root=document.createElement('div');root.id='rcx-scene';root.setAttribute('aria-label','Reality Collapse X decorative visual effects');
const canvas=document.createElement('canvas');root.append(canvas);
const caption=document.createElement('div');caption.className='rcx-caption';caption.textContent='REALITY COLLAPSE X';root.append(caption);
const ui=document.createElement('div');ui.className='rcx-ui';
const replay=document.createElement('button');replay.textContent='↻ REPLAY';
const toggle=document.createElement('button');toggle.textContent='⏸ 5D';
ui.append(replay,toggle);root.append(ui);document.body.append(root);
const ctx=canvas.getContext('2d',{alpha:true});if(!ctx){root.remove();return}
let w=0,h=0,dpr=1,raf=0,paused=false,t0=performance.now(),last=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
resize();addEventListener('resize',resize,{passive:true});
const rand=(n)=>{let x=Math.sin(n*127.1+42.2)*43758.5453;return x-Math.floor(x)};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
function glow(x,y,r,c,a=1){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c.replace('ALPHA',String(.5*a)));g.addColorStop(.42,c.replace('ALPHA',String(.15*a)));g.addColorStop(1,c.replace('ALPHA','0'));ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill()}
function line(points,width,color,shadow=0){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.lineWidth=width;ctx.strokeStyle=color;ctx.shadowBlur=shadow;ctx.shadowColor=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.shadowBlur=0}
function brain(cx,cy,scale,t,alpha){ctx.save();ctx.globalAlpha=alpha;ctx.translate(cx,cy);ctx.scale(scale,scale);const breathe=1+.045*Math.sin(t*3.4);ctx.scale(breathe,breathe);ctx.rotate(.055*Math.sin(t*.8));
glow(0,0,145,'rgba(196,76,255,ALPHA)',.75);
ctx.beginPath();ctx.moveTo(0,-65);ctx.bezierCurveTo(-32,-94,-91,-78,-95,-30);ctx.bezierCurveTo(-121,-10,-110,28,-83,39);ctx.bezierCurveTo(-85,77,-35,89,-8,65);ctx.bezierCurveTo(15,92,51,79,69,61);ctx.bezierCurveTo(113,63,123,14,96,-11);ctx.bezierCurveTo(106,-64,49,-94,0,-65);ctx.closePath();
const g=ctx.createRadialGradient(-35,-43,4,0,0,130);g.addColorStop(0,'#ffe7d5');g.addColorStop(.3,'#e99cb5');g.addColorStop(.68,'#9d588f');g.addColorStop(1,'#211329');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#ffc5e7';ctx.lineWidth=2;ctx.stroke();
for(let i=0;i<22;i++){const side=i%2?-1:1;const x=side*(15+rand(i)*65),y=-48+rand(i+70)*100;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+side*20,y-15,x-side*18,y+20,x+side*8,y+25);ctx.strokeStyle='rgba(75,25,73,.65)';ctx.lineWidth=3+rand(i+9)*2;ctx.stroke()}
for(let i=0;i<11;i++){let a=i*.66+t*2.3;const x=Math.cos(a)*65,y=Math.sin(a*1.3)*42;glow(x,y,15,'rgba(255,229,150,ALPHA)',.6);ctx.fillStyle='#fff6ca';ctx.beginPath();ctx.arc(x,y,1.5,0,7);ctx.fill()}
ctx.restore()}
function spider(cx,cy,s,t,a){ctx.save();ctx.globalAlpha=a;ctx.translate(cx,cy);ctx.scale(s,s);ctx.rotate(.08*Math.sin(t*1.4));glow(0,10,125,'rgba(255,174,33,ALPHA)',.45);
for(let side of [-1,1])for(let i=0;i<4;i++){const p=i/3,wiggle=Math.sin(t*7+i*1.8+side)*9;const x=side*(32+i*3),y=-12+i*15;const knee=[side*(76+i*8),-65+i*35+wiggle];const foot=[side*(120-i*7),-77+i*58+wiggle*1.6];line([[x,y],knee,foot],9,'#24170e',8);line([[x,y],knee,foot],4,'#b98b47',4);line([[x,y],knee,foot],1.4,'#ffe0a2')}
const abdomen=ctx.createRadialGradient(-16,-34,1,0,10,85);abdomen.addColorStop(0,'#ffe4a1');abdomen.addColorStop(.25,'#ab7a32');abdomen.addColorStop(.7,'#352016');abdomen.addColorStop(1,'#070505');
ctx.fillStyle=abdomen;ctx.beginPath();ctx.ellipse(0,20,44,57,0,0,7);ctx.fill();ctx.strokeStyle='#d4a453';ctx.lineWidth=2;ctx.stroke();
ctx.fillStyle=abdomen;ctx.beginPath();ctx.ellipse(0,-40,31,30,0,0,7);ctx.fill();ctx.stroke();
for(let i=0;i<4;i++){const x=(i-1.5)*13;glow(x,-50,11,'rgba(255,194,48,ALPHA)',1);ctx.fillStyle='#fff1b0';ctx.beginPath();ctx.arc(x,-50,3.3,0,7);ctx.fill()}
ctx.restore()}
function crack(cx,cy,power){ctx.save();ctx.globalAlpha=power;for(let i=0;i<10;i++){const ang=i*2.399;let pts=[[cx,cy]];for(let j=1;j<=5;j++){const r=j*(18+rand(i)*11);pts.push([cx+Math.cos(ang+.13*Math.sin(j*3+i))*r,cy+Math.sin(ang+.13*Math.sin(j*3+i))*r])}line(pts,2,'rgba(255,217,138,.83)',12);line(pts,.6,'rgba(255,255,230,.92)');}ctx.restore()}
function portal(cx,cy,t,p){ctx.save();ctx.translate(cx,cy);ctx.globalAlpha=p;for(let i=0;i<8;i++){const r=28+i*15+Math.sin(t*3+i)*4;ctx.beginPath();ctx.ellipse(0,0,r,r*.58,t*.5+i*.17,0,Math.PI*1.7);ctx.strokeStyle=i%2?'rgba(255,186,57,.58)':'rgba(183,78,255,.62)';ctx.lineWidth=3-i*.2;ctx.shadowColor='#ffbb40';ctx.shadowBlur=18;ctx.stroke()}ctx.shadowBlur=0;glow(0,0,110,'rgba(255,183,65,ALPHA)',.8);ctx.restore()}
function number(cx,cy,v,progress){ctx.save();const s=.3+progress*1.3;ctx.translate(cx,cy);ctx.scale(s,s);ctx.rotate(-.1+progress*.12);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 55px system-ui';ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle='#4a2709';ctx.shadowBlur=15;ctx.shadowColor='#ffba39';ctx.strokeText(v,0,8);ctx.fillStyle='#9c5c15';ctx.fillText(v,0,8);ctx.fillStyle='#fff0b5';ctx.fillText(v,0,0);ctx.restore()}
function draw(now){if(paused)return;const t=(now-t0)/1000;const cycle=t%24;ctx.clearRect(0,0,w,h);
const cx=w*.5,cy=h*.48,unit=Math.min(w/390,h/760,1.25);
const intro=smooth(cycle/3);const awake=smooth((cycle-2)/3)*(1-smooth((cycle-13)/3));
const fracture=smooth((cycle-5)/2)*(1-smooth((cycle-12)/2));
const emerge=smooth((cycle-7)/3)*(1-smooth((cycle-15)/3));
const collapse=smooth((cycle-16)/3)*(1-smooth((cycle-22)/2));
if(cycle<23){glow(cx,cy,Math.min(w*.65,260),'rgba(242,160,35,ALPHA)',.13+intro*.35);if(awake>0)brain(cx,cy+95*unit,1.03*unit,t,awake*.92);
if(fracture>0)crack(cx,cy-60*unit,fracture*.8);
if(emerge>0)spider(cx,cy-85*unit,unit*(.35+emerge*.85),t,emerge);
if(cycle>10&&cycle<20){const k=smooth((cycle-10)/3)*(1-smooth((cycle-17)/3));['10×','50×','100×'].forEach((v,i)=>{const q=clamp((cycle-10-i*.9)/3);if(q>0)number(cx+Math.sin(i*2.3)*90*unit*q,cy+(i-1)*75*unit*q,v,q*k)})}
if(collapse>0)portal(cx,cy,t,collapse);
for(let i=0;i<36;i++){const a=rand(i)*6.28+t*(.15+rand(i+4)*.3),r=30+rand(i+10)*Math.min(w*.5,230);const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.9;const al=.15+.6*rand(i+30);ctx.fillStyle='rgba(255,210,119,'+(al*(.4+intro*.6))+')';ctx.beginPath();ctx.arc(x,y,.6+rand(i+80)*1.6,0,7);ctx.fill()}}
if(now-last>300){caption.textContent=cycle<5?'NEURAL CORE AWAKENING':cycle<10?'GLASS FRACTURE':cycle<16?'SPIDER BREAKOUT':cycle<21?'DIMENSION COLLAPSE':'REALITY RESTORED';last=now}
raf=requestAnimationFrame(draw)}
function play(){cancelAnimationFrame(raf);paused=false;t0=performance.now();toggle.textContent='⏸ 5D';raf=requestAnimationFrame(draw)}
replay.addEventListener('click',play);
toggle.addEventListener('click',()=>{paused=!paused;toggle.textContent=paused?'▶ 5D':'⏸ 5D';if(paused){cancelAnimationFrame(raf);ctx.clearRect(0,0,w,h)}else{t0=performance.now();raf=requestAnimationFrame(draw)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf)}else if(!paused){t0=performance.now();raf=requestAnimationFrame(draw)}});
if(reduced){caption.textContent='5D READY · MOTION REDUCED';toggle.textContent='▶ 5D';paused=true}else raf=requestAnimationFrame(draw);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
