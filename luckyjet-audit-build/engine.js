import {forecastBasic} from './extracted/basic-forecast.mjs';
import {resolveWindow} from './extracted/signal-validation.mjs';
const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n?n%2?b[n>>1]:(b[n/2-1]+b[n/2])/2:null;};
export const valid=r=>r.id&&!r.estimated&&Number.isFinite(r.timestamp)&&Number.isFinite(r.coefficient)&&r.coefficient>=1;
export function thresholdStats(input,now){
 const rows=input.filter(r=>valid(r)&&r.timestamp<=now).sort((a,b)=>b.timestamp-a.timestamp).slice(0,10000);
 return [40,200,500].map(threshold=>{
  const hits=rows.filter(r=>r.coefficient>=threshold),gaps=[];for(let i=1;i<hits.length;i++)gaps.push(hits[i-1].timestamp-hits[i].timestamp);
  const gap=median(gaps),estimated=hits.length>=3&&gap>0?hits[0].timestamp+gap:null;
  return {threshold,count:hits.length,sampleSize:rows.length,frequencyPct:rows.length?100*hits.length/rows.length:0,medianGapMs:gap,lastId:hits[0]?.id,lastAt:hits[0]?.timestamp,estimatedNextAt:null,overdue:estimated!=null&&estimated<=now};
 });
}
export function verifyWindow(w,rows,now){
 const usable=rows.filter(r=>valid(r)&&r.timestamp<=now),result=resolveWindow(w,usable,now,30);
 if(result?.status==='validated'){
  const r=usable.find(r=>r.timestamp===result.at&&r.coefficient===result.coefficient&&r.timestamp>w.createdAt);
  if(r)return {status:'hit',actual:r.coefficient,roundId:r.id,resultAt:r.timestamp};
 }
 if(now<=w.end)return {status:'pending'};
 if(result?.status==='failed'){
  const sorted=usable.sort((a,b)=>a.timestamp-b.timestamp),left=sorted.findLastIndex(r=>r.timestamp<=w.start),right=sorted.findIndex(r=>r.timestamp>=w.end);
  const covered=left>=0&&right>=left&&sorted.slice(left+1,right+1).every((r,i)=>Number.isSafeInteger(r.order)&&r.order===sorted[left+i].order+1);
  if(covered)return {status:'miss',actual:result.coefficient,resultAt:w.end,roundId:null};
 }
 return {status:'unknown',actual:null,resultAt:null,roundId:null};
}
export class AnalysisEngine{
 constructor(journal=[]){this.journal=journal.filter(w=>w&&w.id&&w.createdAt<w.start&&w.end>w.start&&Number.isFinite(w.target)&&w.target>=1);this.previous=null;this.lastBasicId=null;}
 update(input,now,fresh,full=false){
  const rows=input.filter(r=>valid(r)&&r.timestamp<=now).sort((a,b)=>b.timestamp-a.timestamp),latest=rows[0];
  const ascending=[...rows].reverse();
  const lower=t=>{let a=0,b=ascending.length;while(a<b){const m=(a+b)>>>1;if(ascending[m].timestamp<t)a=m+1;else b=m;}return a;};
  for(const w of this.journal)if(!['hit','miss'].includes(w.status))Object.assign(w,verifyWindow(w,ascending.slice(Math.max(0,lower(w.start)-1),lower(w.end)+2),now));
  if(!fresh||!latest||now-latest.timestamp>180000)return;
  const pending=kind=>this.journal.some(w=>w.kind===kind&&w.end>now);
  if(!pending('basic')&&this.lastBasicId!==latest.id){
   const p=forecastBasic(rows.slice(0,2000),this.previous,now);
   if(p&&p.estimatedAt>now&&!this.journal.some(w=>w.id==='basic:'+p.generatedAt)){
    this.previous=p;this.lastBasicId=latest.id;this.journal.push({id:'basic:'+p.generatedAt,kind:'basic',target:p.estimatedCoef,start:p.estimatedAt,end:p.estimatedAt+p.windowMs,createdAt:now,status:'pending',heuristicScore:p.reliability,pattern:p.pattern,basis:p.basis});
    const b=p.bigOpportunity;if(b&&b.expectedAt>now&&!this.journal.some(w=>w.kind==='opportunity'&&w.end>now))this.journal.push({id:'opportunity:'+p.generatedAt,kind:'opportunity',target:b.estimatedCoef,start:b.expectedAt,end:b.expectedAt+b.windowMs,createdAt:now,status:'pending',heuristicScore:b.confidence});
   }
  }

 }
}
