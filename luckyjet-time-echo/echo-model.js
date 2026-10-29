// Experimental calendar recurrence. No random targets or claimed predictive accuracy.
const HOUR=3600000, DAY=24*HOUR;
const civilFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function civil(t){return Object.fromEntries(civilFormatter.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function stamp(c){return Date.UTC(c.year,c.month-1,c.day,c.hour,c.minute,c.second);}
export function nextKyivDay(t){
 const wanted=stamp(civil(t))+DAY;let guess=wanted;
 for(let i=0;i<4;i++)guess+=wanted-stamp(civil(guess));
 const matches=[guess-HOUR,guess,guess+HOUR].filter(x=>stamp(civil(x))===wanted);
 return matches.length===1?matches[0]:null; // skip nonexistent/ambiguous DST times
}
export function validRound(r){return !!r.id&&!r.estimated&&Number.isFinite(r.timestamp)&&Number.isFinite(r.coefficient)&&r.coefficient>=1&&Number.isSafeInteger(r.order);}
export function makeWindow(anchor,kind){
 const center=kind==='hour'?anchor.timestamp+HOUR:nextKyivDay(anchor.timestamp);
 if(center===null)return null;
 return {id:`echo-v1:${kind}:${anchor.id}`,kind,anchorId:anchor.id,anchorAt:anchor.timestamp,center,start:center-60000,end:center+60000,target:anchor.coefficient};
}
export function candidates(rows,now,min=10){
 const out=[];
 for(const r of rows){
  if(!validRound(r)||r.coefficient<Math.max(10,min)||r.timestamp>now||r.timestamp<now-27*HOUR)continue;
  for(const kind of ['hour','day']){
   if(kind==='hour'&&r.timestamp<now-HOUR)continue;
   const w=makeWindow(r,kind);
   if(w&&w.start>now&&w.start<=now+HOUR)out.push(w);
  }
 }
 return out.sort((a,b)=>a.start-b.start||b.target-a.target||a.id.localeCompare(b.id));
}
export function makeIndex(rows){
 const sorted=rows.filter(validRound).sort((a,b)=>a.timestamp-b.timestamp||a.order-b.order),gaps=[0];
 for(let i=1;i<sorted.length;i++)gaps[i]=gaps[i-1]+(sorted[i].order!==sorted[i-1].order+1||sorted[i].timestamp-sorted[i-1].timestamp>180000?1:0);
 return {rows:sorted,gaps};
}
function lower(rows,t){let a=0,b=rows.length;while(a<b){const m=(a+b)>>>1;if(rows[m].timestamp<t)a=m+1;else b=m;}return a;}
export function evaluate(w,index,now){
 const rows=index.rows,a=lower(rows,w.start),b=lower(rows,Math.min(now,w.end)+1);
 for(let i=a;i<b;i++)if(rows[i].timestamp>w.issuedAt&&rows[i].coefficient>=w.target)return {status:'hit',actual:rows[i].coefficient,roundId:rows[i].id,resultAt:rows[i].timestamp};
 if(now<=w.end)return {status:'pending'};
 const left=a>0?a-1:a,right=lower(rows,w.end);
 const covered=rows[left]?.timestamp<=w.start&&rows[right]?.timestamp>=w.end&&rows[right].timestamp<=now&&index.gaps[right]===index.gaps[left];
 const observed=rows.slice(a,b),maximum=observed.reduce((v,r)=>Math.max(v,r.coefficient),0);
 return {status:covered?'miss':'unknown',actual:maximum||null,roundId:null,resultAt:null};
}
export function backtest(rows,now,min=10){
 const index=makeIndex(rows),stats={hour:{hit:0,miss:0,unknown:0,baseHit:0,baseMiss:0,baseUnknown:0},day:{hit:0,miss:0,unknown:0,baseHit:0,baseMiss:0,baseUnknown:0}};
 for(const r of index.rows){
  if(r.coefficient<Math.max(10,min)||r.timestamp<now-30*DAY||r.timestamp>=now)continue;
  for(const kind of ['hour','day']){
   const w=makeWindow(r,kind);if(!w||w.end+30*60000>=now)continue;
   w.issuedAt=r.timestamp;
   const outcome=evaluate(w,index,now).status,base=evaluate({...w,start:w.start+30*60000,end:w.end+30*60000},index,now).status;
   stats[kind][outcome]++;stats[kind]['base'+base[0].toUpperCase()+base.slice(1)]++;
  }
 }
 return stats;
}
