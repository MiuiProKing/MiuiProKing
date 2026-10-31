function normalize(r){const id=String(r.id??''),coefficient=Number(r.coefficient),order=Number(r.feed_order??r.order),t=r.round_timestamp?Date.parse(r.round_timestamp):r.timestamp??null;if(!id||!Number.isFinite(coefficient)||coefficient<1||!Number.isSafeInteger(order)||order<0)return null;return {id,coefficient,order,timestamp:Number.isFinite(t)?t:null,estimated:!!r.estimated||!Number.isFinite(t)}}
export class RoundArchive{
 constructor(){this.rows=new Map();this.conflicts=new Set();this.latest=[];this.cursor=null;this.complete=false;this.maxOrder=0}
 get size(){return this.rows.size}
 ingest(input){const accepted=new Map();for(const raw of input){const r=normalize(raw);if(!r||this.conflicts.has(r.id))continue;const old=this.rows.get(r.id);if(old&&old.coefficient!==r.coefficient){this.rows.delete(r.id);this.conflicts.add(r.id);this.latest=this.latest.filter(x=>x.id!==r.id);continue}this.rows.set(r.id,r);this.maxOrder=Math.max(this.maxOrder,r.order);this.latest=this.latest.filter(x=>x.id!==r.id);if(this.latest.length<5||r.order>=this.latest.at(-1).order){this.latest.push(r);this.latest.sort((a,b)=>b.order-a.order);this.latest.length=Math.min(5,this.latest.length)}accepted.set(r.id,r)}return [...accepted.values()].filter(r=>!this.conflicts.has(r.id))}
}
export async function loadFullArchive(fetchPage,archive,onBatch=async()=>{}){
 if(archive.complete)return;
 let before=archive.cursor;
 for(;;){const batch=await fetchPage({before,limit:1000}),accepted=archive.ingest(batch);
  if(batch.length){const next=Number(batch.at(-1).feed_order??batch.at(-1).order);if(!Number.isSafeInteger(next)||before!=null&&next>=before)throw Error('ARCHIVE_ORDER');before=next;archive.cursor=before}
  archive.complete=batch.length<1000;await onBatch(accepted);if(archive.complete)return;
 }
}
export async function syncLatest(fetchPage,archive,onBatch=async()=>{}){
 if(!archive.size){const rows=archive.ingest(await fetchPage({limit:5}));await onBatch(rows);return}
 let after=archive.maxOrder;
 for(let i=0;i<10;i++){const batch=await fetchPage({after,limit:1000});await onBatch(archive.ingest(batch));if(batch.length<1000)return;const next=Math.max(...batch.map(r=>Number(r.feed_order??r.order)));if(!Number.isSafeInteger(next)||next<=after)throw Error('ARCHIVE_ORDER');after=next}
}
