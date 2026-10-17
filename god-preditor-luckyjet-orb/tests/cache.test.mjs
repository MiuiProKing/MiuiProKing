import test from 'node:test';import assert from 'node:assert/strict';import {ArchiveCache} from '../cache.js';
test('a failed archive write cannot be followed by a persistent complete marker',async()=>{
 const cache=new ArchiveCache(),metadata=[];let fail=true;
 cache.db={transaction(){const tx={objectStore(name){return {put(row){if(name==='meta')metadata.push(row)}}}};queueMicrotask(()=>{if(fail){fail=false;tx.onerror?.()}else tx.oncomplete?.()});return tx}};
 await assert.rejects(cache.put([{id:'1'}]));try{await cache.put([],true)}catch{}
 assert.equal(metadata.some(x=>x.key==='complete'&&x.value===true),false);
});
test('quarantine deletions and the full keyset cursor survive a reload',async()=>{
 const cache=new ArchiveCache(),rounds=new Map([['bad',{id:'bad'}]]),meta=new Map();
 cache.db={transaction(){const tx={objectStore(name){const map=name==='rounds'?rounds:meta;return {put(row){map.set(name==='rounds'?row.id:row.key,row)},delete(id){map.delete(id)},get(key){return {result:map.get(key)}},getAll(){return {result:[...map.values()]}}}}};queueMicrotask(()=>tx.oncomplete?.());return tx}};
 await cache.put([{id:'ok'}],false,{cursor:70001,conflicts:new Set(['bad'])});
 const saved=await cache.read();assert.deepEqual(saved.rows,[{id:'ok'}]);assert.equal(saved.cursor,70001);assert.deepEqual(saved.conflicts,['bad']);assert.equal(saved.complete,false);
 await cache.put([],true,{cursor:1,conflicts:new Set(['bad'])});assert.equal((await cache.read()).complete,true);
});
test('a queued delta cannot advance the cursor after an earlier full-page write fails',async()=>{
 const cache=new ArchiveCache(),transactions=[];cache.db={transaction(){const tx={objectStore(){return {put(){},delete(){}}}};transactions.push(tx);return tx}};
 const first=cache.put([{id:'full-page'}],false,{cursor:9000}),firstResult=first.catch(e=>e),second=cache.put([{id:'delta'}],true,{cursor:9000}),secondResult=second.catch(e=>e);
 await new Promise(queueMicrotask);assert.equal(transactions.length,1);transactions[0].error=Error('quota');transactions[0].onerror();await firstResult;
 assert.equal((await secondResult).message,'CACHE_INCOMPLETE');assert.equal(transactions.length,1);
});
