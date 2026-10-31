const finite=Number.isFinite;
export const formatClock=t=>finite(t)?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(t)):'—';
export const countdown=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`};
export class ServerClock{
 constructor(performanceNow=()=>performance.now()){this.performanceNow=performanceNow;this.base=Date.now();this.at=performanceNow()}
 sync(value,sent,received=this.performanceNow()){const t=Date.parse(value),rtt=received-sent;if(!finite(t)||rtt<0||rtt>15000)return false;this.base=t+rtt/2;this.at=received;return true}
 now(){return this.base+this.performanceNow()-this.at}
}
function timely(value,now,limit){const t=Date.parse(value);return finite(t)&&t<=now+10000&&now-t<=limit}
export function ready(source,report,now){return !!source?.fresh&&!!source.source_connected&&!source.error&&timely(source.checked_at,now,45000)&&!!report?.enabled&&!!report.fresh&&!report.error&&timely(report.checked_at,now,90000)}
export function registeredSignal(report,source,now){
 if(!ready(source,report,now))return null;
 const p=report.prediction;if(!p||![p.generatedAt,p.estimatedAt,p.windowMs,p.estimatedCoef].every(finite)||p.estimatedCoef<1||p.windowMs<=0||p.windowMs>1800000||p.generatedAt>now+10000)return null;
 const w=report.windows?.find(w=>w.id==='cloud:rules:'+p.generatedAt&&w.kind==='rules');
 if(!w||w.status!=='pending'||![w.start,w.end,w.createdAt,w.target].every(finite)||Math.abs(w.target-p.estimatedCoef)>1e-9||Math.abs(w.end-p.estimatedAt-p.windowMs)>1||w.start>=w.end||w.createdAt>w.end||w.createdAt>now+10000||w.end<=now)return null;
 return {...w};
}
export function deriveFrame({now,source,report,pinned=null,loading=false}={}){
 const signal=registeredSignal(report,source,now),record=pinned&&report?.windows?.find(w=>w.id===pinned.id);
 if(record&&['target','start','end','createdAt','kind'].some(key=>record[key]!==pinned[key]))return {phase:'offline',signal:null,result:null,remaining:null,ratio:0};
 if(record&&['hit','miss','unknown'].includes(record.status)&&!signal){
  const hitValid=record.status!=='hit'||finite(record.result)&&record.result>=record.target&&record.roundId&&finite(record.resultAt)&&record.resultAt>record.createdAt&&record.resultAt>=record.start&&record.resultAt<=Math.min(now,record.end);
  if(hitValid&&(record.status!=='miss'||now>record.end))return {phase:'result',signal:null,result:record,remaining:0,ratio:record.status==='hit'?1:0};
 }
 if(!signal){const phase=loading?'reasoning':ready(source,report,now)?'searching':'offline';return {phase,signal:null,result:null,remaining:null,ratio:0}}
 return {phase:now<signal.start?'scheduled':'checking',signal,result:null,remaining:Math.max(0,signal.end-now),ratio:Math.max(0,Math.min(1,(signal.end-now)/(signal.end-signal.start)))};
}
