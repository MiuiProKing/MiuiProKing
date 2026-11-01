import {forecastBasic} from './extracted/basic-forecast.mjs';
export const TARGETS=[1.5,2];
export const valid=r=>r.id&&!r.estimated&&Number.isFinite(r.timestamp)&&Number.isFinite(r.coefficient)&&r.coefficient>=1&&Number.isSafeInteger(r.order);
export function sourceFresh(s,now){const at=Date.parse(s?.checked_at);return !!s?.fresh&&!!s.source_connected&&!s.error&&Number.isFinite(at)&&now-at<=45000&&at<=now+10000;}
export function frequencies(rows){const a=rows.filter(valid).slice(0,2000);return TARGETS.map(target=>({target,n:a.length,hits:a.filter(r=>r.coefficient>=target).length}));}
export function verify(w,input,now){
 const rows=input.filter(r=>valid(r)&&r.timestamp<=now).sort((a,b)=>a.order-b.order);
 const inside=rows.filter(r=>r.timestamp>=w.start&&r.timestamp<=w.end&&r.timestamp>w.createdAt&&r.order>w.anchorOrder);
 const hit=inside.find(r=>r.coefficient>=w.target);
 if(hit)return {status:'hit',actual:hit.coefficient,roundId:hit.id,resultAt:hit.timestamp,resultOrder:hit.order};
 if(now<=w.end)return {status:'pending'};
 const left=rows.findLastIndex(r=>r.timestamp<=w.start),right=rows.findIndex(r=>r.timestamp>=w.end);
 const covered=left>=0&&right>left&&rows.slice(left+1,right+1).every((r,i)=>r.order===rows[left+i].order+1&&r.timestamp>=rows[left+i].timestamp);
 if(!covered)return {status:'unknown',actual:null,roundId:null,resultAt:null};
 const best=inside.reduce((a,r)=>!a||r.coefficient>a.coefficient?r:a,null);
 return best?{status:'miss',actual:best.coefficient,roundId:best.id,resultAt:best.timestamp,resultOrder:best.order}:{status:'unknown',actual:null,roundId:null,resultAt:null};
}
export class LowTargetEngine{
 constructor(journal=[]){this.journal=journal.filter(w=>w&&w.version===1&&TARGETS.includes(w.target)&&Number.isFinite(w.createdAt)&&w.createdAt<w.start&&w.start<w.end&&w.end-w.start<=600000&&Number.isSafeInteger(w.anchorOrder));this.lastAnchor=null;}
 update(input,now,fresh,mode='auto'){
  const rows=input.filter(r=>valid(r)&&r.timestamp<=now).sort((a,b)=>b.order-a.order),latest=rows[0];
  for(const w of this.journal)if(!['hit','miss'].includes(w.status))Object.assign(w,verify(w,rows,now));
  // Keep the original window fixed, even when it has hit early. No overlapping auto-signals.
  if(this.journal.some(w=>w.end>=now)||!fresh||!latest||now-latest.timestamp>180000||this.lastAnchor===latest.id)return null;
  const recent=rows.slice(0,2000),p=forecastBasic(recent,null,now);
  if(!p||p.estimatedAt<=now||!Number.isFinite(p.windowMs))return null;
  // Preserve source timing/pattern selection. Only the target policy is adapted.
  // 50% here is a descriptive recent frequency cutoff, not a measured predictive advantage.
  const sample=recent.slice(0,50),twoRate=sample.filter(r=>r.coefficient>=2).length/sample.length;
  const target=mode==='1.5'?1.5:mode==='2'?2:p.estimatedCoef>=2&&twoRate>=.5?2:1.5;
  const w={version:1,id:'neon:'+now,kind:'basic-low',target,start:p.estimatedAt,end:p.estimatedAt+p.windowMs,createdAt:now,anchorOrder:latest.order,status:'pending',pattern:p.pattern,sourceTarget:p.estimatedCoef,sampleSize:recent.length};
  this.journal.push(w);this.lastAnchor=latest.id;return w;
 }
}
