const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('fixed.html','utf8'),source=fs.readFileSync('fixed-cloud.js','utf8');
const sandbox={Date,URLSearchParams,AbortSignal};sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox);
const create=sandbox.FixedCloudFeed.create,now=1791615600000;
const row=(id,seq,coefficient=2,at=now)=>({id,source_seq:seq,coefficient,origin:'live',collection_backend:'cloud',live_received_at:new Date(at).toISOString(),round_timestamp:new Date(at).toISOString()});
let count=0;async function test(name,fn){await fn();console.log('PASS',name);count++;}
(async()=>{
 let time=now,reply=[row('r2',12),row('r1',4,1,now-1000)],status={source_connected:true,fresh:true},calls=[],fail=false;
 const feed=create({url:'https://example.supabase.co',anonKey:'public-key'},{now:()=>time,fetcher:async(url,init)=>{
  calls.push({url,init});if(fail)return {ok:false,status:503};return {ok:true,json:async()=>url.includes('/rpc/')?status:reply};
 }});
 await test('initial history seeds display without counting past outcomes',async()=>{const data=await feed.read();assert.equal(data.seeded,true);assert.equal(data.rounds.length,0);assert.equal(data.head.id,'r2');assert.equal(data.rows[1].coef,1);assert.equal(feed.ready(),true)});
 await test('SQL sequence holes are valid and newer equal coefficients keep distinct IDs',async()=>{reply=[row('r4',22,2,now+2000),row('r3',17,2,now+1000)];time+=2000;const data=await feed.read();assert.equal(data.seeded,false);assert.equal(data.rounds.map(r=>r.id).join(','),'r3,r4');assert.equal(data.rounds[0].coef,data.rounds[1].coef);assert.ok(calls.at(-1).url.includes('source_seq=gt.12'));});
 await test('unchanged head does not manufacture rounds',async()=>{reply=[];const data=await feed.read();assert.equal(data.rounds.length,0);assert.equal(data.head.id,'r4');});
 await test('authorization is public read-only Supabase configuration',async()=>{assert.equal(calls[0].init.headers.apikey,'public-key');assert.equal(calls[0].init.headers.Authorization,'Bearer public-key');assert.ok(calls.every(c=>!c.url.includes('100hp')&&!c.url.includes('firebase')));});
 await test('failed network disables readiness and recovery rereads health',async()=>{fail=true;await assert.rejects(feed.read());assert.equal(feed.ready(),false);fail=false;reply=[];time+=11000;assert.equal((await feed.read()).head.id,'r4');assert.equal(feed.ready(),true)});
 await test('stale server status is rejected',async()=>{time+=11000;status={source_connected:true,fresh:false};await assert.rejects(feed.read());assert.equal(feed.ready(),false);status={source_connected:true,fresh:true}});
 await test('missing updates beyond batch limit reset instead of silently skipping outcomes',async()=>{reply=Array.from({length:100},(_,i)=>row('new'+i,1000-i,3,time));const data=await feed.read();assert.equal(data.reset,true);assert.equal(data.seeded,true);assert.equal(data.rounds.length,0)});
 await test('conflicting rows are rejected',async()=>{reply=[row('dup',1010,2,time+1000),row('dup',1011,3,time+1000)];await assert.rejects(feed.read());assert.equal(feed.ready(),false)});
 await test('future received timestamp cannot enable a signal',async()=>{reply=[row('future',1030,2,time+31000)];await assert.rejects(feed.read());assert.equal(feed.ready(),false)});
 await test('all page scripts compile and legacy source lookup is removed',async()=>{for(const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(s[1].trim())new vm.Script(s[1]);assert.ok(!html.includes('firebasejs')&&!html.includes('WORKING_SESSION_ID'));assert.ok(html.includes('id="cloudConnection"'));assert.ok(html.includes('FixedCloudFeed.create'));});
 // Exercise the actual page controller with a minimal DOM and adapter stub.
 const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1],elements=new Map();
 function el(){return {textContent:'',innerHTML:'',value:'',disabled:false,style:{},children:[],events:{},className:'',classList:{add(){},remove(){},toggle(){}},addEventListener(k,f){this.events[k]=f},appendChild(x){this.children.push(x)}}}
 for(const id of [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]))elements.set(id,el());
 let batch={seeded:true,reset:false,rows:[{id:'seed',coef:1,receivedAt:now}],rounds:[],head:{id:'seed',coef:1,receivedAt:now}},good=true;
 const storage=new Map(),ui={Date,Intl,console,FixedCloudFeed:{create:()=>({read:async()=>batch,ready:()=>good})},document:{hidden:false,getElementById:id=>elements.get(id),createElement:el,addEventListener(){}},window:{},navigator:{},SpeechSynthesisUtterance:class{},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}};
 vm.createContext(ui);vm.runInContext(module+'\nglobalThis.fixedTest={poll:pollLatestRound,state:()=>({pending,counts,history,lastRoundId,lastCoefs:[...lastCoefs]}),setPending:(at)=>{pending={predictedOdds:10,currentRound:0,createdAt:at};verificationStarted=true;},stop:stopUnverifiedWindow};',ui);
 for(let i=0;i<30;i++)await Promise.resolve();
 await test('page shows the real Supabase seed including exact 1.00',async()=>{assert.equal(elements.get('lastCoef').textContent,'1.00X');assert.ok(elements.get('cloudConnection').textContent.includes('LIVE · Supabase'));assert.equal(ui.fixedTest.state().counts.ok,0)});
 await test('page consumes every caught-up round rather than only the head',async()=>{ui.fixedTest.setPending(now);batch={seeded:false,reset:false,rounds:[{id:'a',coef:2,receivedAt:now+1000,timestamp:now+1000},{id:'b',coef:3,receivedAt:now+2000,timestamp:now+2000}],head:{id:'b',coef:3,receivedAt:now+2000}};await ui.fixedTest.poll();assert.equal(ui.fixedTest.state().pending.currentRound,2);assert.equal(elements.get('lastCoef').textContent,'3.00X')});
 await test('duplicate completed IDs are not counted twice',async()=>{await ui.fixedTest.poll();assert.equal(ui.fixedTest.state().pending.currentRound,2)});
 await test('a completed round preceding registration cannot become a hit',async()=>{ui.fixedTest.setPending(now+5000);batch={seeded:false,reset:false,rounds:[{id:'past',coef:50,receivedAt:now+4000,timestamp:now+4000}],head:{id:'past',coef:50,receivedAt:now+4000}};await ui.fixedTest.poll();assert.equal(ui.fixedTest.state().pending,null);assert.equal(ui.fixedTest.state().counts.ok,0);assert.equal(ui.fixedTest.state().counts.ko,0);assert.equal(ui.fixedTest.state().history[0].status,'unknown')});
 await test('a feed reset makes pending window unknown without a false miss',async()=>{ui.fixedTest.setPending(now);batch={seeded:true,reset:true,rows:[{id:'reset',coef:2,receivedAt:now+10000}],rounds:[],head:{id:'reset',coef:2,receivedAt:now+10000}};await ui.fixedTest.poll();assert.equal(ui.fixedTest.state().pending,null);assert.equal(ui.fixedTest.state().counts.ko,0);assert.equal(ui.fixedTest.state().history[0].status,'unknown')});
 console.log(count+' fixed feed checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
