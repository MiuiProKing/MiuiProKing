import test from 'node:test';import assert from 'node:assert/strict';
import {RoundArchive,loadFullArchive,syncLatest} from '../archive.js';
const row=i=>({id:String(i),coefficient:i%19+1,feed_order:i,round_timestamp:i%11?new Date(1800000000000+i*1000).toISOString():null,estimated:i%11===0});
test('five visible results do not truncate the full archive; pagination goes beyond2000',async()=>{
 const all=Array.from({length:5007},(_,i)=>row(i+1)).reverse(),archive=new RoundArchive(),requests=[];
 await loadFullArchive(async({before,limit})=>{requests.push(before);return all.filter(r=>before==null||r.feed_order<before).slice(0,limit)},archive);
 assert.equal(archive.size,5007);assert.equal(archive.complete,true);assert.equal(archive.latest.length,5);assert.equal(archive.latest[0].id,'5007');assert.equal(requests.length,6);
});
test('same coefficients in distinct rounds survive; conflicting IDs are quarantined; unknown time stays unknown',()=>{
 const a=new RoundArchive();a.ingest([row(1),row(2),{...row(3),coefficient:2},row(11)]);assert.equal(a.size,4);assert.equal(a.latest[0].timestamp,null);
 a.ingest([{...row(2),coefficient:999}]);assert(!a.latest.some(r=>r.id==='2'));assert.equal(a.rows.has('2'),false);
});
test('archive restarts at a failed keyset boundary and never declares incomplete data complete',async()=>{
 const a=new RoundArchive();let calls=0;
 await assert.rejects(loadFullArchive(async()=>{if(calls++)throw Error('offline');return Array.from({length:1000},(_,i)=>row(2000-i))},a));assert.equal(a.complete,false);assert.equal(a.cursor,1001);
 await loadFullArchive(async({before})=>{assert.equal(before,1001);return [row(1000)]},a);assert.equal(a.complete,true);assert.equal(a.size,1001);
});
test('cold start reads the latest five first, not the oldest1000 ascending records',async()=>{
 const a=new RoundArchive(),requests=[];await syncLatest(async options=>{requests.push(options);return [row(90005),row(90004),row(90003),row(90002),row(90001)]},a);
 assert.equal(requests[0].limit,5);assert.equal(requests[0].after,undefined);assert.equal(a.latest[0].id,'90005');
 await syncLatest(async options=>{assert.equal(options.after,90005);return [row(90006)]},a);assert.equal(a.latest[0].id,'90006');assert.equal(a.size,6);
});
test('quarantined IDs are absent from the accepted batch sent to persistent cache',()=>{
 const a=new RoundArchive(),accepted=a.ingest([row(2),{...row(2),coefficient:999}]);assert.equal(accepted.length,0);assert(a.conflicts.has('2'));
});
