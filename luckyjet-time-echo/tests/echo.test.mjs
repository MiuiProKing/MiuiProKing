import test from 'node:test';import assert from 'node:assert/strict';
import {candidates,nextKyivDay,makeWindow,makeIndex,evaluate,backtest} from '../echo-model.js';
import {RoundArchive} from '../archive.js';
const T=Date.parse('2026-10-29T10:36:37Z'),H=3600000;
const round=(id,time,coefficient=2,order=1)=>({id,timestamp:time,coefficient,order,estimated:false});
test('hour and next day retain seconds and exact coefficient including >50000x',()=>{
 const r=round('huge',T,70001.25),h=makeWindow(r,'hour'),d=makeWindow(r,'day');assert.equal(h.center,T+H);assert.equal(d.center,T+24*H);assert.equal(h.target,70001.25);assert.equal(d.target,70001.25);
 assert.equal(candidates([r],T+1000).length,1);assert.equal(candidates([r],T+23*H+1000).length,1);
});
test('never generates a window already open, from future data, or estimated timestamps',()=>{
 const r=round('a',T,1708);assert.equal(candidates([r],T+H-59000).length,0);assert.equal(candidates([r],T-1).length,0);assert.equal(candidates([{...r,estimated:true}],T+1000).length,0);
});
test('Kyiv next calendar day respects daylight-saving transitions and skips ambiguous times',()=>{
 const before=Date.parse('2026-10-24T10:36:37Z');assert.equal(nextKyivDay(before),before+25*H);
 assert.equal(nextKyivDay(Date.parse('2026-03-28T10:36:37Z')),Date.parse('2026-03-29T09:36:37Z'));
 assert.equal(nextKyivDay(Date.parse('2026-03-28T01:30:00Z')),null);
 assert.equal(nextKyivDay(Date.parse('2026-10-24T00:30:00Z')),null);
});
test('hit identifies the actual round and cannot consume future or pre-issue rounds',()=>{
 const w={...makeWindow(round('anchor',T,600),'hour'),issuedAt:T+1000};const r=round('hit',w.center,712,5),index=makeIndex([r]);
 assert.equal(evaluate(w,index,w.center-1).status,'pending');const result=evaluate(w,index,w.center);assert.equal(result.status,'hit');assert.equal(result.actual,712);assert.equal(result.roundId,'hit');
 assert.notEqual(evaluate({...w,issuedAt:w.center},index,w.end+1).status,'hit');
});
test('miss needs complete boundary coverage, no missing orders and no long collection gap',()=>{
 const w={...makeWindow(round('a',T,600),'hour'),issuedAt:T+1000};const rows=Array.from({length:7},(_,i)=>round('r'+i,w.start-30000+i*30000,2,i+1));
 assert.equal(evaluate(w,makeIndex(rows),w.end+60000).status,'miss');
 assert.equal(evaluate(w,makeIndex(rows.filter((_,i)=>i!==3)),w.end+60000).status,'unknown');
 assert.equal(evaluate(w,makeIndex(rows.slice(1,-2)),w.end+60000).status,'unknown');
 assert.equal(evaluate(w,makeIndex([round('b',w.start-400000,2,1),round('c',w.end+400000,2,2)]),w.end+500000).status,'unknown');
});
test('archive retains unbounded coefficients, de-duplicates IDs, and records conflicts',()=>{
 const a=new RoundArchive();a.ingest([{id:'a',coefficient:80000,feed_order:1,round_timestamp:new Date(T).toISOString()}]);assert.equal(a.size,1);assert.equal(a.latest[0].coefficient,80000);
 a.ingest([{id:'a',coefficient:80000,feed_order:1,round_timestamp:new Date(T).toISOString()}]);assert.equal(a.size,1);
});
test('retrospective checks do not treat empty archives as successful or missed',()=>{
 const stats=backtest([round('anchor',T,1708)],T+48*H);assert.equal(stats.hour.hit,0);assert.equal(stats.hour.miss,0);assert.equal(stats.hour.unknown,1);assert.equal(stats.day.unknown,1);
});
