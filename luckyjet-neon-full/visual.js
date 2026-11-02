import {electricLayer} from './electric.js';
export class NeuralVisual{
 constructor(){
  this.canvas=document.getElementById('courier');this.ctx=this.canvas.getContext('2d');this.electric=electricLayer(document.getElementById('electric'));this.queue=[];this.active=null;this.delivered=0;this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.p={x:innerWidth*.2,y:innerHeight*.5};this.last=0;this.time=0;this.angle=0;this.job=0;
  this.resize=()=>{const d=Math.min(devicePixelRatio||1,2);this.canvas.width=innerWidth*d;this.canvas.height=innerHeight*d;this.ctx.setTransform(d,0,0,d,0,0);};this.resize();addEventListener('resize',this.resize);
  const g=document.getElementById('neurons');for(let i=0;i<22;i++){const n=document.createElementNS('http://www.w3.org/2000/svg','circle');const side=i%2?-1:1;n.setAttribute('cx',180+side*(32+(i*37%95)));n.setAttribute('cy',65+(i*29%145));n.setAttribute('r',i%4===0?2.5:1.5);n.style.animationDelay=`${i*.19}s`;g.append(n);}
  this.frame=this.frame.bind(this);this.frame(0);
 }
 enqueue(rows){for(const r of rows.slice(0,5).reverse())if(!this.queue.some(x=>x.id===r.id)&&this.active?.row.id!==r.id)this.queue.push(r);this.queue=this.queue.slice(-20);}
 reset(){this.delivered=0;this.grow();}
 grow(){document.getElementById('brain').style.setProperty('--growth',String(.85+Math.min(this.delivered,5)*.035));document.getElementById('absorbed').textContent=this.delivered;}
 setMotion(v){this.motion=v;if(!v){this.electric.clear();this.ctx.clearRect(0,0,innerWidth,innerHeight);}return v;}
 frame(ms){this.job=requestAnimationFrame(this.frame);const dt=Math.min(.04,Math.max(0,(ms-this.last)/1000));this.last=ms;if(document.hidden||!this.motion)return;this.time+=dt;const t=this.time,c=this.ctx,box=document.getElementById('brainArea').getBoundingClientRect(),center={x:box.x+box.width/2,y:box.y+box.height*.5};
  if(!this.active&&this.queue.length){const row=this.queue.shift(),el=[...document.querySelectorAll('.chip')].find(e=>e.dataset.id===row.id),r=el?.getBoundingClientRect();this.active={row,at:t,from:{...this.p},chip:r?{x:r.x+r.width/2,y:r.y+r.height/2}:{x:Math.max(35,center.x-box.width*.45),y:box.y+15}};}
  let goal,carrying=false;
  if(this.active){const a=this.active,u=t-a.at;if(u<1.5){const f=u/1.5;goal={x:a.from.x+(a.chip.x-a.from.x)*f,y:a.from.y+(a.chip.y-a.from.y)*f};}else if(u<3.8){carrying=true;const f=(u-1.5)/2.3;goal={x:a.chip.x+(center.x-a.chip.x)*f+Math.sin(f*Math.PI)*60,y:a.chip.y+(center.y-a.chip.y)*f};}else{this.delivered++;this.grow();this.active=null;goal={x:center.x+120,y:center.y+75};}}
  else{goal={x:center.x+Math.cos(t*.7)*Math.min(box.width*.48,180),y:center.y+Math.sin(t*.7)*145};}
  goal.x=Math.max(24,Math.min(innerWidth-24,goal.x));goal.y=Math.max(95,Math.min(innerHeight-24,goal.y));const dx=goal.x-this.p.x,dy=goal.y-this.p.y;this.p.x+=dx*.12;this.p.y+=dy*.12;if(Math.hypot(dx,dy)>1)this.angle=Math.atan2(dy,dx);
  this.electric.draw(t,this.p);c.clearRect(0,0,innerWidth,innerHeight);c.save();c.translate(this.p.x,this.p.y);c.rotate(this.angle);const size=innerWidth<500?.8:1;c.scale(size,size);c.lineWidth=1.2;c.strokeStyle='#83fff5';c.shadowColor='#31e9e0';c.shadowBlur=7;
  for(let side of [-1,1])for(let i=0;i<4;i++){const phase=t*9+i*1.8+side*1.5,stride=Math.sin(phase)*7,rootX=(i-1.5)*4,kneeX=(i-1.5)*15+stride,kneeY=side*(18+Math.cos(phase)*4),footX=(i-1.5)*23+stride,footY=side*(36+Math.sin(phase)*5);c.beginPath();c.moveTo(rootX,side*4);c.lineTo(kneeX,kneeY);c.lineTo(footX,footY);c.stroke();c.beginPath();c.arc(kneeX,kneeY,1.4,0,7);c.fillStyle='#d0ffff';c.fill();}
  c.fillStyle='#061b25';c.beginPath();c.ellipse(-5,0,11,7,0,0,7);c.fill();c.stroke();c.beginPath();c.ellipse(8,0,6,5,0,0,7);c.fill();c.stroke();c.fillStyle='#fff';for(const y of [-2,2]){c.beginPath();c.arc(11,y,1.4,0,7);c.fill();}c.restore();
  if(carrying&&this.active){c.save();c.font='bold 14px monospace';c.textAlign='center';c.shadowBlur=15;c.shadowColor='#a855ff';c.fillStyle='#f3d6ff';c.fillText(this.active.row.coefficient.toFixed(2)+'×',this.p.x,this.p.y-33);c.strokeStyle='#c7acff80';c.beginPath();c.moveTo(this.p.x,this.p.y-25);c.lineTo(this.p.x,this.p.y-7);c.stroke();c.restore();}
 }
}
