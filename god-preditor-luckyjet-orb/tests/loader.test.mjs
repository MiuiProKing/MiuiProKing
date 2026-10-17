import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=()=>fs.readFileSync(new URL('../loader.js',import.meta.url),'utf8');
function page(preReady=false){
 let now=0,seq=0;const queue=new Map(),listeners=new Map(),state={busy:'true',removed:false,done:false};
 const overlay={classList:{add(){state.done=true}},remove(){state.removed=true}};
 const context={document:{getElementById:()=>overlay,body:{setAttribute(k,v){state.busy=v}}},window:{__luckyReady:preReady,addEventListener(k,f){listeners.set(k,f)}},performance:{now:()=>now},setTimeout(f,delay){const id=++seq;queue.set(id,{f,at:now+delay});return id},clearTimeout(id){queue.delete(id)}};
 vm.runInNewContext(source(),context);
 return {state,ready(){listeners.get('lucky-ready')?.()},advance(ms){const end=now+ms;while(true){const next=[...queue].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;queue.delete(next[0]);next[1].f()}now=end}};
}
test('loader follows the first response and removes busy state',()=>{const p=page();p.advance(100);assert.equal(p.state.removed,false);p.ready();p.advance(1000);assert.equal(p.state.removed,true);assert.equal(p.state.busy,'false')});
test('an unresponsive source cannot trap the user behind the animation',()=>{const p=page();p.advance(9000);assert.equal(p.state.removed,true);assert.equal(p.state.busy,'false')});
test('a response which arrived before the loader script also dismisses it',()=>{const p=page(true);p.advance(1000);assert.equal(p.state.removed,true)});
