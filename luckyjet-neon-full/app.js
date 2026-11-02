import {LuckyAPI} from './api.js';
import {RoundArchive,loadFullArchive,syncLatest} from './archive.js';
import {ArchiveCache} from './cache.js';
import {ServerClock,formatClock,countdown} from './model.js';
import {FullPredictionEngine,sourceFresh,frequencies} from './engine.js';
import {NeuralVisual} from './visual.js';
const $=id=>document.getElementById(id),api=new LuckyAPI(),archive=new RoundArchive(),cache=new ArchiveCache(),clock=new ServerClock();
const KEY='neural-full-journal-v1';let stored=[];try{stored=JSON.parse(localStorage.getItem(KEY)||'[]');}catch{}if(!Array.isArray(stored))stored=[];
const engine=new FullPredictionEngine(stored);let visual=null;try{visual=new NeuralVisual();}catch(e){console.warn('Анимация недоступна',e.name);}
let rows=[],source=null,pollBusy=false,archiveBusy=false,retryAt=0,lastOrder=0,drawerMode='signals',shown=40,initial=true,saved='',born=0;
const money=n=>Number(n).toFixed(2)+'×',esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric'}).format(t);
const labels={hit:'Зашло',miss:'Промах',pending:'В процессе',unknown:'Нет данных'};
function persist(){try{const s=JSON.stringify(engine.journal);if(s!==saved){localStorage.setItem(KEY,s);saved=s;}}catch{$('archiveCount').title='Журнал не сохранён: хранилище браузера недоступно';}}
function dataChanged(){rows=[...archive.rows.values()].sort((a,b)=>b.order-a.order);const newest=rows[0]?.order??0;if(newest!==lastOrder){visual?.enqueue(initial?rows.slice(0,5):rows.filter(r=>r.order>lastOrder));initial=false;lastOrder=newest;
 $('feed').innerHTML=rows.slice(0,5).map(r=>`<div class="chip ${r.coefficient>=2?'high':''}" data-id="${esc(r.id)}"><strong>${money(r.coefficient)}</strong><time>${r.estimated?'~ ':''}${formatClock(r.timestamp)}</time></div>`).join('');
 const stats=frequencies(rows);for(let i=0;i<2;i++)$(['frequency2','frequency10'][i]).textContent=stats[i].n?Math.round(stats[i].hits/stats[i].n*100)+'%':'—';
 document.querySelector('.frequency').title=`Частота в последних ${stats[0].n} раундах, не точность прогноза`;
 }$('archiveCount').textContent=`${archive.size.toLocaleString('ru-RU')} раундов${archive.complete?' · база загружена':' · загружаем архив'}`;tick();if($('drawer').open)renderDrawer();}
function tick(){const now=clock.now(),fresh=sourceFresh(source,now)&&!!rows[0]&&now-rows[0].timestamp<=180000;
 $('kyivClock').textContent=formatClock(now);document.querySelector('.connection').classList.toggle('live',fresh);$('connectionText').textContent=fresh?'LIVE · Supabase':source?'Задержка данных':'Подключение к базе';
 const created=engine.update(rows,now,fresh&&archive.complete);if(created){born=performance.now();visual?.reset();visual?.enqueue(rows.slice(0,5));}persist();
 const w=engine.journal.findLast(x=>x.kind==='basic'),active=w&&now<=w.end;let phase='reasoning',text='Собираем историю для анализа';
 if(!fresh){phase='offline';text='Ждём свежие коэффициенты. Новые окна приостановлены.';}
 else if(!archive.complete){text='Загружаем всю доступную историю для расчёта';}
 else if(w){if(performance.now()-born<5500){phase='reasoning';text='Паук переносит коэффициенты · анализ истории';}else if(w.status==='hit'||w.status==='miss'){phase=w.status;text=w.status==='hit'?`Цель ${money(w.target)} достигнута: ${money(w.actual)} в ${formatClock(w.resultAt)}`:`Цель ${money(w.target)} не достигнута в окне`;}else if(active){phase=now<w.start?'scheduled':'checking';text=now<w.start?'Окно закреплено. Ожидаем указанное время.':'Окно открыто. Проверяем новые завершённые раунды.';}else{phase='searching';text='Ожидаем следующий анализ';}}
 document.body.dataset.phase=phase;$('phaseText').textContent=({reasoning:'АНАЛИЗ ИСТОРИИ',offline:'ОЖИДАНИЕ ДАННЫХ',scheduled:'ОКНО НАЙДЕНО',checking:'ПРОВЕРКА СИГНАЛА',hit:'ЦЕЛЬ ДОСТИГНУТА',miss:'ПРОМАХ',searching:'ПОИСК ОКНА'})[phase];$('statusText').textContent=text;
 $('basis').textContent=w?`${w.pattern} · ${w.basis}`:'Ждём историю для исходного алгоритма.';
 const visible=w&&phase!=='reasoning';$('target').innerHTML=visible?`${w.target.toFixed(2)}<small>×</small>`:'—<small>×</small>';$('targetCaption').textContent=phase==='hit'?'ПОДТВЕРЖДЁННАЯ ЦЕЛЬ':'ЦЕЛЬ ОКНА';
 $('timeLabel').textContent=!visible?'АНАЛИЗИРУЕМ КОЭФФИЦИЕНТЫ':!fresh?'СИГНАЛ ПРИОСТАНОВЛЕН':now<w.start?'ПЛАНИРУЕМОЕ ОКНО ВХОДА · КИЕВ':'ОКНО СИГНАЛА · КИЕВ';$('windowTime').textContent=visible?`${formatClock(w.start)} — ${formatClock(w.end)}`:'--:--:--';
 const remaining=w?(now<w.start?w.start-now:w.end-now):0;$('countdownLabel').textContent=w&&now<w.start?'До открытия':'До закрытия';$('countdown').textContent=visible?countdown(remaining):'--:--';$('progress').style.width=visible?Math.max(0,Math.min(100,100*remaining/(now<w.start?w.start-w.createdAt:w.end-w.start)))+'%':'0%';
 $('resultBadge').hidden=!visible||!['hit','miss'].includes(w.status);$('resultBadge').textContent=w?.status==='hit'?`✓ ЗАШЛО · ФАКТ ${money(w.actual)}`:'✕ ПРОМАХ';
 renderOpportunity(now,fresh);
 if($('drawer').open&&drawerMode==='signals')renderDrawer();
}
async function save(batch){await cache.put(batch,archive.complete,{cursor:archive.cursor,conflicts:archive.conflicts}).catch(()=>{});dataChanged();}
async function full(){if(archiveBusy||archive.complete||Date.now()<retryAt)return;archiveBusy=true;try{await loadFullArchive(o=>api.page(o),archive,save);}catch{retryAt=Date.now()+30000;}finally{archiveBusy=false;dataChanged();}}
async function poll(){if(pollBusy||document.hidden)return;pollBusy=true;try{const r=await api.status();source=r.data;clock.sync(source.server_now||r.serverDate,r.sent,r.received);if(!archive.size)await save(archive.ingest(await api.page({limit:1000})));else await syncLatest(o=>api.page(o),archive,save);dataChanged();void full();}catch{source={fresh:false};tick();}finally{pollBusy=false;}}
function renderDrawer(){const list=drawerMode==='rounds'?rows:[...engine.journal].reverse();$('drawerTitle').textContent=drawerMode==='rounds'?'База коэффициентов':'История окон';$('signalsTab').classList.toggle('selected',drawerMode==='signals');$('roundsTab').classList.toggle('selected',drawerMode==='rounds');$('summary').textContent=drawerMode==='rounds'?`${archive.size.toLocaleString('ru-RU')} раундов`:`Зашло: ${engine.journal.filter(w=>w.status==='hit').length} · Промах: ${engine.journal.filter(w=>w.status==='miss').length} · Нет данных: ${engine.journal.filter(w=>w.status==='unknown').length}`;
 $('entries').innerHTML=list.slice(0,shown).map(w=>drawerMode==='rounds'?`<article><div class="row"><strong>${money(w.coefficient)}</strong><span>${w.estimated?'≈ ':''}${formatClock(w.timestamp)}</span></div><p>${w.timestamp?date(w.timestamp):'Время неизвестно'} · Киев</p><small>Раунд ${esc(w.id)}</small></article>`:`<article class="${esc(w.status)}"><div class="row"><strong>${money(w.target)}</strong><span class="badge">${labels[w.status]||'Нет данных'}</span></div><p>${w.kind==='opportunity'?'Блок 100×+':'Основной прогноз'}<br>Предлагали: ${money(w.target)}<br>Окно: ${formatClock(w.start)} — ${formatClock(w.end)}<br>${w.actual!=null?`Факт: ${money(w.actual)} · ${formatClock(w.resultAt)}<br>`:''}${date(w.start)} · Киев</p><small>${w.roundId?'Раунд '+esc(w.roundId):'Ожидаем полную проверку окна'}</small></article>`).join('')||'<p class="empty">Здесь появятся результаты новых окон.</p>';$('more').hidden=list.length<=shown;}
function openDrawer(kind){drawerMode=kind;shown=40;renderDrawer();$('drawer').showModal();}
const motion=()=>{$('motionButton').textContent=visual?.motion?'Эффекты вкл.':'Эффекты выкл.';$('motionButton').setAttribute('aria-pressed',String(!!visual?.motion));};motion();$('motionButton').onclick=()=>{visual?.setMotion(!visual.motion);motion();};
 $('historyButton').onclick=()=>openDrawer('signals');$('archiveButton').onclick=()=>openDrawer('rounds');$('closeDrawer').onclick=()=>$('drawer').close();$('signalsTab').onclick=()=>{drawerMode='signals';shown=40;renderDrawer();};$('roundsTab').onclick=()=>{drawerMode='rounds';shown=40;renderDrawer();};$('more').onclick=()=>{shown+=40;renderDrawer();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();});
async function boot(){try{await cache.open();const s=await cache.read();archive.conflicts=new Set(s.conflicts||[]);archive.ingest(s.rows);archive.cursor=s.cursor;archive.complete=s.complete;}catch{}dataChanged();await poll();setInterval(poll,5000);setInterval(tick,1000);}void boot();

function renderOpportunity(now,fresh){
 const w=engine.journal.findLast(x=>x.kind==='opportunity');
 $('opportunity').hidden=!w;
 if(!w)return;
 $('bigTarget').textContent=money(w.target);
 $('bigTime').textContent=`${formatClock(w.start)} — ${formatClock(w.end)} · Киев`;
 $('bigScore').textContent=`Баллы правила: ${w.heuristicScore}/100 · не вероятность`;
 $('bigReason').textContent=w.reason||'';
 $('bigStatus').textContent=w.status==='hit'?`Зашло · факт ${money(w.actual)} · ${formatClock(w.resultAt)}`:w.status==='miss'?'Промах':!fresh?'Задержка данных':w.status==='unknown'?'Нет данных для полной проверки':now<w.start?`До открытия ${countdown(w.start-now)}`:`Проверка · до закрытия ${countdown(w.end-now)}`;
 $('opportunity').dataset.status=w.status;
}
