import {feed,startFeed,refresh,fullHistory} from './supabase-v15.js';
import {analyze,number,percent} from './model-v15.js';
const $=id=>document.getElementById(id), kyiv=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const showTime=t=>Number.isFinite(t)?kyiv.format(new Date(t)):'—';
let snapshot=null,renderTimer=0,seenCount=-1;const HISTORY_KEY='god_v15_forecast_checks';
let signals=[];try{const s=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(Array.isArray(s))signals=s.slice(-150)}catch{}
function save(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(signals.slice(-150)))}catch{}}
function schedule(){clearTimeout(renderTimer);renderTimer=setTimeout(render,320)}
function applyChecks(){let changed=false;const data=feed.rows;for(const s of signals){if(s.status!=='pending')continue;const next=data.filter(r=>r.seq>s.seq).sort((a,b)=>a.seq-b.seq).slice(0,s.horizon);if(!next.length)continue;const max=Math.max(...next.map(r=>r.x));if(max>=s.threshold){s.status='hit';s.max=max;s.seen=next.length;s.completedAt=next[next.length-1].t;changed=true}else if(next.length>=s.horizon){s.status='miss';s.max=max;s.seen=next.length;s.completedAt=next.at(-1).t;changed=true}}if(changed)save()}
function setTxt(id,value){const e=$(id);if(e)e.textContent=String(value)}
function modelInfo(m){const t=m.test;const good=t.count>=50&&t.improved;return good?'На тесте модель минут лучше базовой':'Нет доказанного улучшения относительно базовой частоты'}
function render(){const data=feed.rows,latest=data.at(-1),age=latest?Date.now()-latest.t:Infinity,fresh=age>=-30000&&age<=180000&&feed.live;
setTxt('sourceStatus',feed.lastError?'ОШИБКА API':fresh?'LIVE · SUPABASE':feed.loading?'ПОДКЛЮЧЕНИЕ':latest?'ДАННЫЕ УСТАРЕЛИ':'ОЖИДАНИЕ');
$('sourceStatus').className=feed.lastError?'bad':fresh?'':'wait';
setTxt('progressText',data.length.toLocaleString('ru-RU')+' подтверждённых раундов'+(feed.more?' · история загружается / доступна частично':' · история загружена'));
setTxt('connectionError',feed.lastError||'');
setTxt('lastUpdate',latest?'Последний раунд '+showTime(latest.t)+' (Киев)': 'Данные пока не получены');
if(!data.length){setTxt('dataCount','0');return}
const x=Number($('threshold').value),h=Number($('horizon').value);const m=analyze(data,x,h);if(!m)return;const changed=seenCount!==data.length;seenCount=data.length;snapshot=m;
setTxt('dataCount',m.N.toLocaleString('ru-RU'));setTxt('heroTarget',number(m.v6)+'×');setTxt('heroTime',showTime(m.eta));setTxt('heroNote','Target V6 · среднее 3 последних ×1.10, максимум 2.40×');
setTxt('base',percent(m.baseline));setTxt('survival',percent(m.survival));setTxt('weibull',percent(m.weibull));setTxt('gap',number(m.gapMedian,0)+' р.');
setTxt('ema20',number(m.ema20)+'×');setTxt('ema50',number(m.ema50)+'×');setTxt('median50',number(m.median50)+'×');setTxt('mad50',number(m.mad50));
setTxt('thresholdLabel','≥'+x+'× за '+h+' раунда');setTxt('gapContext',m.gapMedian?'Последний ≥'+x+'×: '+number(m.dist,0)+' раундов назад; MAD интервалов '+number(m.gapMad,0):'Для выбранного X событий пока недостаточно');
setTxt('riskText',m.risk>=20?'По '+m.risk+' сопоставимым историческим интервалам':'Мало подходящих исторических интервалов ('+m.risk+')');
setTxt('weibullText','Weibull k='+number(m.shape)+'; параметр масштаба '+number(m.scale,0)+' раундов');
setTxt('clusterText','≥20×: '+m.cluster20+' · ≥50×: '+m.cluster50+' · ≥100×: '+m.cluster100+' (80 последних)');
setTxt('ciText','Bootstrap 95% для частоты ≥'+x+'× на последних ≤5000 раундах: '+percent(m.ci[0])+' – '+percent(m.ci[1]));
setTxt('qualityText',modelInfo(m));
setTxt('brierText',m.test.count?number(m.test.modelBrier,5)+' / '+number(m.test.baselineBrier,5):'—');
setTxt('brierSub',m.test.count?m.test.count+' проверочных окон; Brier: модель минут / случайная базовая частота':'Недостаточно данных для бэктеста');
setTxt('lastX',number(latest.x)+'×');setTxt('maxX',number(m.max)+'×');
const feedEl=$('feed');feedEl.replaceChildren();for(const r of data.slice(-5).reverse()){const div=document.createElement('div');div.className='chip'+(r.x>=20?' high':r.x>=2?' mid':'');const b=document.createElement('b');b.textContent=number(r.x)+'×';const small=document.createElement('time');small.textContent=showTime(r.t).split(', ').at(-1);div.append(b,small);feedEl.append(div)}
$('minutes').replaceChildren();for(const b of m.minute){const tr=document.createElement('tr');for(const v of [':'+String(b.i).padStart(2,'0'),b.hit+' / '+b.all,percent(b.rate)]){const td=document.createElement('td');td.textContent=v;tr.append(td)}$('minutes').append(tr)}
$('seconds').replaceChildren();for(const b of m.second){const tr=document.createElement('tr');for(const v of [':'+String(b.i).padStart(2,'0'),b.hit+' / '+b.all,percent(b.rate)]){const td=document.createElement('td');td.textContent=v;tr.append(td)}$('seconds').append(tr)}
$('roundHistory').replaceChildren();for(const r of m.recent){const tr=document.createElement('tr');const d=document.createElement('td');d.textContent=showTime(r.t);const val=document.createElement('td');val.textContent=number(r.x)+'×';if(r.x>=x)val.className='big';const seq=document.createElement('td');seq.textContent=String(r.seq);tr.append(d,val,seq);$('roundHistory').append(tr)}
const points=data.slice(-80).map((r,i)=>[8+i*(744/79),114- Math.min(1,Math.log2(Math.max(1,r.x))/Math.log2(100))*96]);$('chartPath').setAttribute('d',points.map(([a,b],i)=>(i?'L':'M')+a.toFixed(1)+','+b.toFixed(1)).join(' '));
if(changed)applyChecks();setTxt('signalsCount',signals.length+' записей');}
function openHistory(){applyChecks();const container=$('checks');container.replaceChildren();for(const s of [...signals].reverse()){const tr=document.createElement('tr');for(const v of [showTime(s.created), '≥'+s.threshold+'× / '+s.horizon+'р.',s.status==='hit'?'WIN · '+number(s.max)+'×':s.status==='miss'?'LOSE · '+number(s.max)+'×':'Ожидание']){const td=document.createElement('td');td.textContent=v;tr.append(td)}container.append(tr)}if(!signals.length){const p=document.createElement('p');p.className='v15-meta';p.textContent='Контрольных прогнозов пока нет. Нажми «Зафиксировать прогноз» — результат будет проверяться по новым раундам.';container.append(p)}$('historyDialog').showModal()}
$('openHistory').addEventListener('click',openHistory);$('closeHistory').addEventListener('click',()=>$('historyDialog').close());
$('threshold').addEventListener('change',schedule);$('horizon').addEventListener('change',schedule);
$('reload').addEventListener('click',()=>void refresh(schedule));$('loadAll').addEventListener('click',()=>void fullHistory(schedule));
$('saveSignal').addEventListener('click',()=>{const m=snapshot,latest=feed.rows.at(-1);if(!m||!latest)return;signals.push({seq:latest.seq,created:Date.now(),threshold:m.x,horizon:m.h,status:'pending',probability:m.baseline});signals=signals.slice(-150);save();setTxt('signalsCount',signals.length+' записей');$('saveSignal').textContent='Прогноз зафиксирован ✓';setTimeout(()=>$('saveSignal').textContent='Зафиксировать прогноз',1300)});
startFeed(schedule);setInterval(()=>{if(feed.rows.length)schedule()},60000);
