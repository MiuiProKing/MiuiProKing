import test from 'node:test';import assert from 'node:assert/strict';
import {deriveFrame,registeredSignal,formatClock,ServerClock} from '../model.js';
const now=Date.parse('2026-10-18T12:00:00Z');
const prediction={estimatedCoef:4.06,generatedAt:now-5000,estimatedAt:now+30000,windowMs:150000};
const win={id:'cloud:rules:'+prediction.generatedAt,kind:'rules',target:4.06,start:now+31000,end:now+180000,createdAt:now-4000,status:'pending'};
const report={enabled:true,fresh:true,error:'',checked_at:new Date(now-1000).toISOString(),prediction,windows:[win]};
const source={fresh:true,source_connected:true,error:'',checked_at:new Date(now-1000).toISOString()};
test('main time comes from the immutable registered window, not a new candidate',()=>{const s=registeredSignal(report,source,now);assert.equal(s.start,win.start);assert.equal(s.target,4.06);assert.equal(s.end,win.end)});
test('never promotes unregistered, terminal, malformed, stale, future-checked or disconnected data',()=>{
 for(const r of [{...report,windows:[]},{...report,windows:[{...win,status:'hit'}]},{...report,prediction:{...prediction,estimatedCoef:10}},{...report,checked_at:new Date(now-91000).toISOString()},{...report,checked_at:new Date(now+20000).toISOString()}])assert.equal(registeredSignal(r,source,now),null);
 assert.equal(registeredSignal(report,{...source,fresh:false},now),null);
});
test('reasoning, searching, waiting and checking follow real state and countdown reaches zero',()=>{
 assert.equal(deriveFrame({now,loading:true}).phase,'reasoning');
 assert.equal(deriveFrame({now,source,report:{...report,prediction:null}}).phase,'searching');
 const a=deriveFrame({now,source,report});assert.equal(a.phase,'scheduled');assert.equal(a.remaining,180000);
 const b=deriveFrame({now:now+32000,source:{...source,checked_at:new Date(now+32000).toISOString()},report:{...report,checked_at:new Date(now+32000).toISOString()},pinned:a.signal});assert.equal(b.phase,'checking');assert(b.ratio<1&&b.ratio>0);
 const c=deriveFrame({now:win.end+1,source:{...source,checked_at:new Date(win.end).toISOString()},report:{...report,checked_at:new Date(win.end).toISOString()},pinned:a.signal});assert.equal(c.phase,'searching');assert.equal(c.remaining,null);
});
test('an unknown result never becomes a miss, a confirmed hit retains its evidence',()=>{
 const pinned=registeredSignal(report,source,now);
 for(const status of ['hit','miss','unknown']){const r={...report,windows:[{...win,status,result:status==='hit'?4.55:null,resultAt:win.start+1000,roundId:'actual-round'}]};const frame=deriveFrame({now:win.end+1000,source,report:r,pinned});assert.equal(frame.result.status,status);assert.equal(frame.phase,'result');assert.equal(frame.result.roundId,'actual-round')}
 assert.equal(deriveFrame({now,source:{...source,fresh:false},report,pinned}).signal,null);
});
test('Kyiv seconds and server-synchronized clock work independently of device date',()=>{
 assert.equal(formatClock(now),'15:00:00');assert.equal(formatClock(null),'—');let perf=100;const c=new ServerClock(()=>perf);c.sync(new Date(now).toISOString(),0,100);assert.equal(c.now(),now+50);perf+=1000;assert.equal(c.now(),now+1050);
});
test('a pinned same-ID window cannot change its original boundaries or registration time',()=>{
 const pinned=registeredSignal(report,source,now);
 for(const changed of [{...win,start:win.start+5000},{...win,createdAt:win.createdAt+1000}]){
  const frame=deriveFrame({now,source,report:{...report,windows:[changed]},pinned});assert.equal(frame.signal,null);assert.equal(frame.result,null);
 }
});
