import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {parseHTML} from 'linkedom';
import {RoundArchive} from '../archive.js';import {EchoUI} from '../echo-ui.js';
test('drawer, all-X filter, fixed windows, evidence and mode switching work together',()=>{
 const {window,document}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));globalThis.window=window;globalThis.document=document;
 const values=new Map([['luckyjet-time-echo-v1',JSON.stringify({mode:'cloud'})]]);globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 globalThis.Worker=class{postMessage(data){this.request=data;}};
 const now=Date.parse('2026-10-29T10:36:38Z'),archive=new RoundArchive();let time=now;
 archive.ingest([{id:'large',coefficient:70001.25,feed_order:1,estimated:false,round_timestamp:new Date(now-1000).toISOString()}]);archive.complete=true;
 const ui=new EchoUI(archive,{now:()=>time});
 ui.dialog.showModal=()=>{ui.dialog.open=true;};ui.dialog.close=()=>{ui.dialog.open=false;};
 // Linkedom does not implement the browser select.value setter.
 Object.defineProperty(ui.filter,'value',{value:'0',writable:true});
 const source={checked_at:new Date(now).toISOString(),fresh:true,source_connected:true,error:''},cloud={phase:'searching'};
 assert.equal(ui.frame(cloud,now,source),cloud);assert.equal(ui.journal.length,1);
 document.querySelector('.archive-tab').click();assert(ui.dialog.open);assert.match(ui.content.textContent,/70\s?001,25/);assert.match(ui.content.textContent,/12:36:37/);
 ui.filter.value='50000';ui.filter.onchange();assert.equal(ui.content.querySelectorAll('article').length,1);
 ui.toggle.click();assert.equal(ui.mode,'echo');const signal=ui.frame(cloud,now,source).signal;assert.equal(signal.target,70001.25);assert(signal.issuedAt<signal.start);
 const start=signal.start;ui.frame(cloud,now+5000,source);assert.equal(ui.journal[0].start,start);assert.equal(ui.journal.length,1);
 assert.equal(ui.frame(cloud,now+50000,source).phase,'offline');
 time=signal.center;archive.ingest([{id:'actual',coefficient:80000,feed_order:2,estimated:false,round_timestamp:new Date(time).toISOString()}]);ui.frame(cloud,time,{...source,checked_at:new Date(time).toISOString()});
 assert.equal(ui.journal[0].status,'hit');assert.equal(ui.journal[0].actual,80000);assert.equal(ui.journal[0].roundId,'actual');
 ui.tab='journal';ui.render();assert.match(ui.content.textContent,/Зашло/);assert.match(ui.content.textContent,/actual/);assert.match(ui.content.textContent,/Цель/);
 assert.equal(JSON.parse(values.get('luckyjet-time-echo-v1')).journal[0].status,'hit');
 ui.dialog.querySelector('.close').click();assert(!ui.dialog.open);
});
