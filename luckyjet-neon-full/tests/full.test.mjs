import test from 'node:test';import assert from 'node:assert/strict';
import {FullPredictionEngine,verify,sourceFresh} from '../engine.js';
import {generatePrediction} from '../prediction.js';
import {forecastBasic} from '../extracted/basic-forecast.mjs';
import {RoundArchive} from '../archive.js';
const now=1793530000000;
const row=(i,c=1.2,t=now+i*1000)=>({id:'r'+i,coefficient:c,timestamp:t,estimated:false,order:i});
const history=Array.from({length:100},(_,i)=>row(100-i,i%2?2.5:1.2,now-i*20000));
const w={version:2,id:'test',kind:'basic',target:1.5,start:now+10000,end:now+40000,createdAt:now,anchorOrder:0,status:'pending'};
test('stale feed and insufficient data cannot create a signal',()=>{assert.equal(new FullPredictionEngine().update(history,now,false),null);assert.equal(new FullPredictionEngine().update(history.slice(0,5),now,true),null);assert.equal(new FullPredictionEngine().update(history,now+200000,true),null);});
test('fresh status requires connected recent successful source',()=>{const s={fresh:true,source_connected:true,checked_at:new Date(now).toISOString()};assert.ok(sourceFresh(s,now));assert.ok(!sourceFresh(s,now+46000));assert.ok(!sourceFresh({...s,error:'failed'},now));assert.ok(!sourceFresh({...s,checked_at:new Date(now+20000).toISOString()},now));});
test('hit includes actual coefficient, ID and second',()=>{const r=row(1,1.8,now+10000);assert.deepEqual(verify(w,[r],now+12000),{status:'hit',actual:1.8,roundId:'r1',resultAt:r.timestamp,resultOrder:1});});
test('first hit is reported, not highest later crash',()=>{const r=verify(w,[row(1,1.7,now+12000),row(2,50,now+30000)],now+35000);assert.equal(r.actual,1.7);assert.equal(r.roundId,'r1');});
test('past, estimated, future and out-of-window results cannot win',()=>{const a=[row(1,20,now-1000),{...row(2,20,now+12000),estimated:true},row(3,20,now+45000),row(4,20,now+30000)];assert.equal(verify(w,a,now+20000).status,'pending');});
test('miss needs complete feed-order coverage after close',()=>{const a=[row(0,1.1,now+9000),row(1,1.2,now+18000),row(2,1.3,now+28000),row(3,1.1,now+42000)];assert.equal(verify(w,a,now+43000).status,'miss');assert.equal(verify(w,a.filter(r=>r.order!==1),now+43000).status,'unknown');assert.equal(verify(w,a,now+35000).status,'pending');});
test('recheck repairs unknown when missing coverage arrives',()=>{const a=[row(0,1.1,now+9000),row(2,1.3,now+28000),row(3,1.1,now+42000)];const e=new FullPredictionEngine([w]);e.update(a,now+43000,false);assert.equal(e.journal[0].status,'unknown');e.update([...a,row(1,1.6,now+18000)],now+43000,false);assert.equal(e.journal[0].status,'hit');});
test('archive keeps 1.00 exact and deduplicates round IDs',()=>{const a=new RoundArchive();a.ingest([row(1,1),row(1,1)]);assert.equal(a.size,1);assert.equal(a.latest[0].coefficient,1);a.ingest([row(1,2)]);assert.equal(a.size,0);});
test('original formula matches audited implementation across 120 histories',()=>{
 let seed=1993;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let j=0;j<120;j++){const a=Array.from({length:20+j*7},(_,i)=>row(2000-i,Math.max(1,Math.floor(97/Math.max(.001,random()))/100),now-i*(11000+j*370)));assert.deepEqual(generatePrediction(a,null,now),forecastBasic(a,null,now));}
});
test('full target and timing kept exactly, no 1.5 / 2 restriction',()=>{
 const a=Array.from({length:100},(_,i)=>row(100-i,1.2,now-i*20000));const p=generatePrediction(a,null,now),e=new FullPredictionEngine(),s=e.update(a,now,true);
 assert.equal(s.target,p.estimatedCoef);assert.ok(s.target>2);assert.equal(s.start,p.estimatedAt);assert.equal(s.end,p.estimatedAt+p.windowMs);assert.equal(s.heuristicScore,p.reliability);
});
test('120x opportunity is independent and retained on reload',()=>{
 const a=Array.from({length:100},(_,i)=>row(100-i,i<3?60:i<6?25:1.3,now-i*20000));const p=generatePrediction(a,null,now);assert.equal(p.bigOpportunity.estimatedCoef,120);
 const e=new FullPredictionEngine();e.update(a,now,true);const b=e.journal.find(x=>x.kind==='opportunity');assert.equal(b.target,120);assert.equal(b.start,p.bigOpportunity.expectedAt);assert.equal(b.end,b.start+p.bigOpportunity.windowMs);
 const saved=e.journal.map(x=>({...x})),f=new FullPredictionEngine(saved);f.update(a,now+1000,true);assert.equal(f.journal.length,2);assert.deepEqual(f.journal,saved);
});
test('both windows validate separately against their own targets',()=>{
 const e=new FullPredictionEngine([{...w,target:3},{...w,id:'big',kind:'opportunity',target:120}]);e.update([row(1,5,now+12000)],now+15000,false);assert.equal(e.journal[0].status,'hit');assert.equal(e.journal[1].status,'pending');e.update([row(1,5,now+12000),row(2,140,now+20000)],now+25000,false);assert.equal(e.journal[1].actual,140);assert.equal(e.journal[1].roundId,'r2');
});
test('live window survives reload and early win does not change promised time',()=>{
 const e=new FullPredictionEngine();e.update(history,now,true);const a=e.journal[0],f=new FullPredictionEngine(e.journal);f.update([row(101,50,a.start+1000),...history],a.start+2000,true);assert.equal(f.journal.filter(x=>x.kind==='basic').length,1);assert.equal(f.journal[0].start,a.start);assert.equal(f.journal[0].target,a.target);assert.equal(f.journal[0].status,'hit');
});
test('source locks previous prediction until close',()=>{const p=generatePrediction(history,null,now);assert.equal(generatePrediction(history,p,now+1000),p);});
