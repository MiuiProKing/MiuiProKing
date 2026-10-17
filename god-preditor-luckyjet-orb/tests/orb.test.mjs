import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
function harness(reduced=false){
 const squares=()=>{},crosses=()=>{},mounts=[],events=new Map(),media={matches:reduced,addEventListener(_,fn){this.change=fn},removeEventListener(){this.change=null}};let Element,observer;
 class Host{constructor(){this.attrs=new Map([['phase','reasoning']]);this.isConnected=true;this.style={setProperty(){}}}getAttribute(k){return this.attrs.get(k)}replaceChildren(){}}
 const document={hidden:false,createElementNS:()=>({}),addEventListener(t,fn){events.set(t,fn)},removeEventListener(t){events.delete(t)}};
 const context={HTMLElement:Host,document,matchMedia:()=>media,squares,crosses,queueMicrotask,IntersectionObserver:class{constructor(fn){this.fn=fn;observer=this}observe(){}disconnect(){this.disconnected=true}},customElements:{get:()=>undefined,define(_,Ctor){Element=Ctor}},mountOrb(_,options){const still=media.matches,orb={options,running:!still,destroyed:false,pause(){this.running=false},play(){if(!still)this.running=true},destroy(){this.destroyed=true;this.running=false}};mounts.push(orb);return orb}};
 vm.runInNewContext(fs.readFileSync(new URL('../orb.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export function','function'),context);
 const host=new Element();host.connectedCallback();return {host,media,mounts,document,events,observer,squares,crosses};
}
test('one official orb switches between the exact three requested profiles',()=>{
 const {host,mounts,squares,crosses}=harness();assert.equal(mounts[0].options.state,'reasoning');assert.equal(mounts[0].options.size,320);assert.equal(mounts[0].options.render,squares);
 host.attrs.set('phase','scheduled');host.attributeChangedCallback();assert(mounts[0].destroyed);assert.equal(mounts[1].options.state,'searching');assert.equal(mounts[1].options.size,259);assert.equal(mounts[1].options.render,crosses);
 host.attrs.set('phase','checking');host.attributeChangedCallback();assert(mounts[1].destroyed);assert.equal(mounts[2].options.state,'compacting');assert.equal(mounts[2].options.speed,1.65);assert.equal(mounts[2].options.tilt,-16);assert.equal(mounts.filter(m=>!m.destroyed).length,1);
});
test('motion preferences, hidden pages and detachment stop work and clean listeners',async()=>{
 const {host,media,mounts,document,events,observer}=harness(true);assert.equal(mounts[0].running,false);media.matches=false;media.change();assert(mounts[0].destroyed);assert(mounts[1].running);
 document.hidden=true;events.get('visibilitychange')();assert.equal(mounts[1].running,false);document.hidden=false;events.get('visibilitychange')();assert(mounts[1].running);
 observer.fn([{isIntersecting:false}]);assert.equal(mounts[1].running,false);host.isConnected=false;host.disconnectedCallback();await new Promise(queueMicrotask);assert(mounts[1].destroyed);assert(observer.disconnected);assert.equal(events.size,0);assert.equal(media.change,null);
});
