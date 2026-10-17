import {CLOUD} from './config.js';
export class LuckyAPI{
 async request(path,body){const start=performance.now(),response=await fetch(CLOUD.url+'/rest/v1/'+path,{method:body?'POST':'GET',headers:{apikey:CLOUD.anonKey,Authorization:'Bearer '+CLOUD.anonKey,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Источник недоступен');return {data:await response.json(),sent:start,received:performance.now()}}
 async page({before=null,after=null,limit=1000}={}){const q=new URLSearchParams({select:'id,coefficient,round_timestamp,estimated,feed_order',order:'feed_order.'+(after!=null?'asc':'desc'),limit:String(limit)});if(before!=null)q.set('feed_order','lt.'+before);if(after!=null)q.set('feed_order','gt.'+after);const {data}=await this.request('luckyjet_classic_history?'+q);if(!Array.isArray(data))throw Error('Некорректный ответ истории');return data}
 async status(){return this.request('rpc/luckyjet_cloud_status',{})}
 async report(){return (await this.request('rpc/lucky_lab_report',{})).data}
 async journal(cursor=null){return (await this.request('rpc/lucky_orb_journal',{p_limit:50,p_before:cursor?.at||null,p_before_id:cursor?.id||null})).data}
}
