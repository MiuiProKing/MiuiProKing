import {normalize} from '../engine.js';
import {predictionDue,largeDue,planRun} from './plan.js';
const credential=()=>Deno.env.get('LUCKYJET_MIRROR_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
async function db(path:string,body?:unknown){
 const key=credential();
 const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{
  method:body===undefined?'GET':'POST',headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('DATABASE_HTTP_'+response.status);
 return response.json();
}
async function history(min=0){
 const q=new URLSearchParams({select:'id,coefficient,round_timestamp,estimated,source_seq,origin,feed_order',order:'feed_order.desc',limit:'1000'});
 if(min)q.set('coefficient','gte.'+min);
 const first=await db('luckyjet_classic_history?'+q);
 if(!min&&first.length===1000){q.set('offset','1000');return first.concat(await db('luckyjet_classic_history?'+q)).map(normalize)}
 return first.map(normalize);
}
async function run(){
 const snapshot=await db('rpc/lucky_lab_claim',{});if(!snapshot)return;
 let plan;
 try{
  const good=snapshot.source?.fresh&&snapshot.source?.source_connected&&!snapshot.source?.error&&snapshot.warmup>=20;
  const rows=good&&predictionDue(snapshot)?await history():[];
  const large=good&&largeDue(snapshot)?await history(10):[];
  plan=planRun(snapshot,rows,large);
 }catch{plan={prediction:null,large:snapshot.large||[],windows:[],error:'WORKER_READ_FAILED'}}
 await db('rpc/lucky_lab_finish',{p_token:snapshot.token,p_prediction:plan.prediction,p_large:plan.large,
  p_windows:plan.windows,p_cursor:snapshot.latest_order,p_big_id:snapshot.latest_big_id,p_error:plan.error});
}
Deno.serve((request:Request)=>{
 const token=Deno.env.get('LUCKYJET_COLLECTOR_TOKEN');
 if(!token||request.method!=='POST'||request.headers.get('x-collector-token')!==token)return new Response('Forbidden',{status:403});
 EdgeRuntime.waitUntil(run().catch(()=>console.error('LUCKY_LAB_RUN_FAILED')));
 return Response.json({accepted:true},{status:202});
});
