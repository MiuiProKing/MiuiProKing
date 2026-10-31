import {LuckyAPI} from './api.js';
import {RoundArchive,loadFullArchive,syncLatest} from './archive.js';
import {ArchiveCache} from './cache.js';
import {ServerClock} from './model.js';
import {AnalysisEngine,thresholdStats} from './engine.js';
import {LiveView} from './view.js';
const api=new LuckyAPI(),archive=new RoundArchive(),cache=new ArchiveCache(),clock=new ServerClock(),view=new LiveView();
const KEY='luckyjet-analysis-live-journal-v1';let saved=[];try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(v))saved=v;}catch{}
const engine=new AnalysisEngine(saved);let source=null,busy=false,archiveBusy=false,retryAt=0,rows=[],signature='',stats=[],savedText='',pulseAt=-Infinity,newest=null,stopAnimation=null,animationOn=true;
function fresh(){const now=clock.now(),at=Date.parse(source?.checked_at);return !!source?.fresh&&!!source?.source_connected&&!source?.error&&Number.isFinite(at)&&now-at<=45000&&at<=now+10000;}
function update(){const sig=`${archive.size}:${archive.maxOrder}:${archive.complete}:${archive.conflicts.size}`;if(sig!==signature){signature=sig;rows=[...archive.rows.values()].sort((a,b)=>b.order-a.order);stats=archive.complete?thresholdStats(rows,clock.now()):[];if(newest&&rows[0]?.id!==newest)pulseAt=performance.now();newest=rows[0]?.id;}
 engine.update(rows,clock.now(),fresh(),archive.complete);try{const text=JSON.stringify(engine.journal);if(text!==savedText){localStorage.setItem(KEY,text);savedText=text;}}catch{document.getElementById('archiveProgress').title='Журнал не удалось сохранить в браузере';}
 view.data(rows,engine.journal,stats,archive.complete);view.tick(clock.now(),fresh());
}
async function save(batch){try{await cache.put(batch,archive.complete,{cursor:archive.cursor,conflicts:archive.conflicts});}catch{}update();}
async function fullArchive(){if(archiveBusy||archive.complete||Date.now()<retryAt)return;archiveBusy=true;try{await loadFullArchive(o=>api.page(o),archive,save);}catch{retryAt=Date.now()+30000;}finally{archiveBusy=false;update();}}
async function poll(){if(busy||document.hidden)return;busy=true;try{const r=await api.status();source=r.data;clock.sync(source.server_now||r.serverDate,r.sent,r.received);if(!archive.size)await save(archive.ingest(await api.page({limit:1000})));else await syncLatest(o=>api.page(o),archive,save);update();void fullArchive();}catch{source={fresh:false,source_connected:false};update();}finally{busy=false;}}
async function animate(){if(stopAnimation||!animationOn||document.hidden)return;try{const {mountVortex}=await import('./extracted/vortex-local.mjs');if(!animationOn||document.hidden)return;stopAnimation=mountVortex(document.getElementById('vortex'),()=>performance.now()-pulseAt<2500?1:0);document.getElementById('fallback').hidden=true;}catch{document.getElementById('fallback').hidden=false;}}
function stop(){stopAnimation?.();stopAnimation=null;}
document.getElementById('animationToggle').onclick=()=>{animationOn=!animationOn;if(animationOn)void animate();else{stop();document.getElementById('fallback').hidden=true;const old=document.getElementById('vortex');old.replaceWith(old.cloneNode());}const b=document.getElementById('animationToggle');b.textContent=animationOn?'Анимация: вкл.':'Анимация: выкл.';b.setAttribute('aria-pressed',String(animationOn));};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else{void animate();void poll();}});
async function start(){void animate();try{await cache.open();const s=await cache.read();archive.conflicts=new Set(s.conflicts||[]);archive.ingest(s.rows);archive.cursor=s.cursor;archive.complete=s.complete;}catch{}update();await poll();setInterval(()=>void poll(),5000);setInterval(()=>view.tick(clock.now(),fresh()),1000);}void start();
