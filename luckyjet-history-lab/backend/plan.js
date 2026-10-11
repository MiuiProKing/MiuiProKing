import {predict,readiness} from '../engine.js';
import {LARGE_TARGETS,largeHistory} from '../large-history.js';

export function predictionDue(snapshot){
 const p=snapshot.previous;
 return !p||!Number.isFinite(p.estimatedAt)||snapshot.now>=Math.max(p.estimatedAt+p.windowMs,p.generatedAt+60000);
}
export function largeDue(snapshot){return !snapshot.large?.length||snapshot.latest_big_id!==snapshot.last_big_id}
export function planRun(snapshot,rows=[],largeRows=[]){
 const now=snapshot.now,source=snapshot.source;
 const sourceError=!Number.isFinite(now)||!source?.fresh||!source?.source_connected||source.error||
  now-Date.parse(source.checked_at)>45000||Date.parse(source.checked_at)>now+10000||!Number.isFinite(Date.parse(source.checked_at));
 if(sourceError||snapshot.warmup<20)return {prediction:null,large:snapshot.large||[],windows:[],error:sourceError?'SOURCE_UNAVAILABLE':'WARMUP'};
 let prediction=snapshot.previous;
 if(predictionDue(snapshot)){
  const ready=readiness(rows,source,now);
  if(ready)return {prediction:null,large:snapshot.large||[],windows:[],error:'INPUT_NOT_READY'};
  const result=predict(rows,source,null,now);
  if(result.error)return {prediction:null,large:snapshot.large||[],windows:[],error:'CALCULATION_INVALID'};
  prediction=result.prediction;
 }
 const windows=[];
 if(prediction&&prediction.estimatedAt+prediction.windowMs>now){
  windows.push({id:'cloud:rules:'+prediction.generatedAt,kind:'rules',target:prediction.estimatedCoef,
   start:prediction.estimatedAt,end:prediction.estimatedAt+prediction.windowMs});
 }
 const large=largeDue(snapshot)?LARGE_TARGETS.map(target=>largeHistory(largeRows,target,now)):snapshot.large;
 for(const item of large){const w=item.window;if(w&&w.end>now)windows.push({id:'cloud:'+w.id,kind:'large-history',target:item.target,start:w.start,end:w.end})}
 return {prediction,large,windows,error:''};
}
