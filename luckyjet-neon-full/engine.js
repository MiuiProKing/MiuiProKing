import {generatePrediction} from './prediction.js';
export const valid=r=>r.id&&!r.estimated&&Number.isFinite(r.timestamp)&&Number.isFinite(r.coefficient)&&r.coefficient>=1&&Number.isSafeInteger(r.order);
export function sourceFresh(s,now){const at=Date.parse(s?.checked_at);return !!s?.fresh&&!!s.source_connected&&!s.error&&Number.isFinite(at)&&now-at<=45000&&at<=now+10000;}
export function frequencies(rows){const a=rows.filter(valid).slice(0,2000);return [2,10].map(target=>({target,n:a.length,hits:a.filter(r=>r.coefficient>=target).length}));}
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

export class FullPredictionEngine {
 constructor(journal=[]){
  this.journal=journal.filter(w=>w&&w.version===2&&['basic','opportunity'].includes(w.kind)&&Number.isFinite(w.target)&&w.target>=1&&Number.isFinite(w.createdAt)&&w.createdAt<w.start&&w.start<w.end&&w.end-w.start<=600000&&Number.isSafeInteger(w.anchorOrder)).map(w=>({...w}));
  this.lastAnchor=null;
 }
 update(input,now,fresh){
  const rows=input.filter(r=>valid(r)&&r.timestamp<=now).sort((a,b)=>b.timestamp-a.timestamp),latest=rows[0];
  // Bound result checking to each window, while analysis receives all loaded history.
  const asc=[...rows].reverse();
  const lower=t=>{let a=0,b=asc.length;while(a<b){const m=(a+b)>>>1;if(asc[m].timestamp<t)a=m+1;else b=m;}return a;};
  for(const w of this.journal)if(!['hit','miss'].includes(w.status))Object.assign(w,verify(w,asc.slice(Math.max(0,lower(w.start)-1),lower(w.end)+2),now));
  if(this.journal.some(w=>w.kind==='basic'&&w.end>=now)||!fresh||!latest||now-latest.timestamp>180000||this.lastAnchor===latest.id)return null;
  const p=generatePrediction(rows,null,now);
  if(!p||p.estimatedAt<=now||!Number.isFinite(p.estimatedCoef)||!Number.isFinite(p.windowMs))return null;
  const w={version:2,id:'basic:'+now,kind:'basic',target:p.estimatedCoef,start:p.estimatedAt,end:p.estimatedAt+p.windowMs,createdAt:now,anchorOrder:latest.order,status:'pending',pattern:p.pattern,basis:p.basis,heuristicScore:p.reliability,confidence:p.confidence,sampleSize:rows.length};
  this.journal.push(w);this.lastAnchor=latest.id;
  const b=p.bigOpportunity;
  if(b&&b.expectedAt>now&&!this.journal.some(x=>x.kind==='opportunity'&&x.end>=now))this.journal.push({version:2,id:'opportunity:'+now,kind:'opportunity',target:b.estimatedCoef,start:b.expectedAt,end:b.expectedAt+b.windowMs,createdAt:now,anchorOrder:latest.order,status:'pending',reason:b.reason,heuristicScore:b.confidence,sampleSize:rows.length});
  return w;
 }
}
