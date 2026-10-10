/* Completed Lucky Jet rounds from the existing Supabase cloud collector. */
(function(root){
'use strict';
function create(config,options={}){
 const fetcher=options.fetcher||fetch,clock=options.now||Date.now;
 let status=null,statusAt=0,head=null,healthy=false;
 const headers={apikey:config.anonKey,Authorization:'Bearer '+config.anonKey};
 const epoch=t=>{const n=Date.parse(t);return Number.isFinite(n)?n:null};
 async function json(url,init={}){
  const response=await fetcher(config.url+url,{...init,headers:{...headers,...init.headers},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Supabase: HTTP '+response.status);
  return response.json();
 }
 function clean(data){
  if(!Array.isArray(data))throw Error('Некорректный ответ Supabase');
  const ids=new Map(),seqs=new Set();
  for(const r of data){
   const id=String(r.id||''),coef=Number(r.coefficient),seq=Number(r.source_seq),receivedAt=epoch(r.live_received_at);
   if(!id||!Number.isFinite(coef)||coef<1||!Number.isSafeInteger(seq)||seq<=0||r.origin!=='live'||r.collection_backend!=='cloud'||receivedAt==null)throw Error('Некорректный LIVE раунд');
   if(ids.has(id)){if(ids.get(id).coef!==coef||ids.get(id).seq!==seq)throw Error('Конфликт LIVE раунда');continue}
   if(seqs.has(seq))throw Error('Конфликт номеров LIVE');
   ids.set(id,{id,coef,seq,receivedAt,timestamp:epoch(r.round_timestamp)});seqs.add(seq);
  }
  const rows=[...ids.values()].sort((a,b)=>b.seq-a.seq),now=clock();
  for(let i=0;i<rows.length;i++){
   if(rows[i].receivedAt>now+30000)throw Error('Время LIVE не подтверждено');
   if(i&&rows[i].receivedAt>rows[i-1].receivedAt)throw Error('Порядок LIVE не подтверждён');
  }
  return rows;
 }
 function ready(){
  const now=clock();
  return healthy&&status?.source_connected===true&&status.fresh===true&&!status.error&&!status.gap&&!status.has_gap&&now-statusAt<20000&&head&&now-head.receivedAt<180000&&head.receivedAt<=now+30000;
 }
 async function query(since){
  const params=new URLSearchParams({select:'id,coefficient,source_seq,origin,collection_backend,live_received_at,round_timestamp',origin:'eq.live',collection_backend:'eq.cloud',order:'source_seq.desc',limit:since==null?'20':'100'});
  if(since!=null)params.set('source_seq','gt.'+since);
  return clean(await json('/rest/v1/luckyjet_rounds?'+params));
 }
 async function read(){
  try{
   const now=clock();
   if(!status||now-statusAt>=10000){status=await json('/rest/v1/rpc/luckyjet_cloud_status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});statusAt=clock();}
   if(status?.source_connected!==true||status.fresh!==true||status.error||status.gap||status.has_gap)throw Error('Источник Supabase не подключён или устарел');
   const previous=head;
   let data=await query(previous?.seq),reset=false;
   if(previous&&data.length>=100){data=await query(null);reset=true;}
   if(!previous||reset){
    if(!data.length)throw Error('В Supabase пока нет LIVE раундов');
    head=data[0];healthy=true;
    if(!ready())throw Error('Последний LIVE коэффициент устарел');
    return {seeded:true,reset,rows:data,rounds:[],head};
   }
   if(data.some(r=>r.id===previous.id))throw Error('Опорный LIVE раунд изменился');
   if(data.length){
    const ordered=data.slice().reverse();
    let prior=previous;
    for(const row of ordered){if(row.receivedAt<prior.receivedAt)throw Error('Порядок времени LIVE не подтверждён');if(row.receivedAt-prior.receivedAt>=180000)reset=true;prior=row}
    head=data[0];
   }
   healthy=true;if(!ready())throw Error('Последний LIVE коэффициент устарел');
   if(reset){const seed=await query(null);head=seed[0];return {seeded:true,reset:true,rows:seed,rounds:[],head};}
   return {seeded:false,reset:false,rows:[],rounds:data.slice().reverse(),head};
  }catch(error){healthy=false;statusAt=0;throw error;}
 }
 return Object.freeze({read,ready});
}
root.FixedCloudFeed=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
