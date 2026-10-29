import {candidates,makeIndex,evaluate} from './echo-model.js';
import {formatClock} from './model.js?v=orb-1';
const KEY='luckyjet-time-echo-v1',labels={hit:'Зашло',miss:'Промах',unknown:'Нет полной проверки',pending:'В процессе'};
const date=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric'}).format(t);
const x=v=>Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'×';
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
export class EchoUI{
 constructor(archive,clock){
  this.archive=archive;this.clock=clock;this.rows=[];this.signature='';this.min=10;this.tab='rounds';this.shown=100;this.mode='echo';this.journal=[];this.visible=null;this.lastSave='';this.lastTest=0;
  try{const data=JSON.parse(localStorage.getItem(KEY)||'{}');this.journal=(data.journal||[]).filter(w=>w.id&&w.issuedAt<w.start&&w.start<w.end&&Number.isFinite(w.target)&&w.target>=10);this.mode=data.mode==='cloud'?'cloud':'echo';}catch{}
  this.build();
  try{this.worker=new Worker(new URL('./echo-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{if(data.id!==this.testId)return;this.stats=data.stats;this.testError=data.error;this.testPending=false;if(this.tab==='echo')this.render();};this.worker.onerror=()=>{this.testPending=false;this.testError=true;};}catch{this.testError=true;}
 }
 build(){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./echo.css',import.meta.url);document.head.append(link);
  const button=el('button','БАЗА · КОЭФФИЦИЕНТЫ','archive-tab');button.setAttribute('aria-label','Открыть базу коэффициентов и окна повторов');button.setAttribute('aria-controls','archiveDialog');document.body.append(button);
  this.toggle=el('button','','mode-toggle');this.caption=el('p','','echo-caption');document.querySelector('main').append(this.toggle,this.caption);
  this.toggle.onclick=()=>{this.mode=this.mode==='cloud'?'echo':'cloud';this.updateToggle();this.persist();};this.updateToggle();
  const d=document.createElement('dialog');d.id='archiveDialog';d.setAttribute('aria-labelledby','archiveTitle');
  // Static markup only; round and model values below use textContent.
  d.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">GOD PREDITOR · TIME ECHO</span><h2 id="archiveTitle">База коэффициентов</h2></div><button class="close" aria-label="Закрыть базу">×</button></div><div class="archive-controls"><button data-tab="rounds">Все раунды</button><button data-tab="echo">Окна повторов</button><button data-tab="journal">Результаты</button></div><div class="archive-controls"><label>Минимум <select id="archiveMinimum"><option value="0">Все коэффициенты</option><option value="10">10× и выше</option><option value="100">100× и выше</option><option value="500">500× и выше</option><option value="1000">1 000× и выше</option><option value="50000">50 000× и выше</option></select></label><button id="spiderToggle" aria-pressed="true">Паук: вкл.</button><a href="https://github.com/fredfokan/web-crawler" target="_blank" rel="noopener">Паук · fredfokan</a></div><div id="archiveMeta" role="status"></div><div class="archive-scroll" id="archiveScroll"><div id="archiveContent"></div><button class="more" id="archiveMore">Показать ещё 100</button></div>`;
  document.body.append(d);this.dialog=d;this.content=d.querySelector('#archiveContent');this.meta=d.querySelector('#archiveMeta');this.more=d.querySelector('#archiveMore');this.filter=d.querySelector('#archiveMinimum');
  button.onclick=()=>{this.shown=100;d.showModal();this.render();};d.querySelector('.close').onclick=()=>d.close();
  d.addEventListener('click',e=>{if(e.target===d&&e.clientX<d.getBoundingClientRect().left)d.close();});
  d.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{this.tab=b.dataset.tab;this.shown=100;this.render();});
  this.filter.onchange=()=>{this.min=Math.max(10,Number(this.filter.value));this.stats=null;this.lastTest=0;this.shown=100;this.render();this.runTest();};
  this.more.onclick=()=>{this.shown+=100;this.render();};
  d.querySelector('#archiveScroll').addEventListener('scroll',e=>{const s=e.target;if(s.scrollTop+s.clientHeight>=s.scrollHeight-80&&!this.more.hidden){this.shown+=100;this.render();}});
  d.querySelector('#spiderToggle').onclick=async e=>{const b=e.currentTarget;const active=!!window.__webCrawler;if(active)window.__webCrawler.stop();else window.startLuckySpider?.();b.textContent=active?'Паук: выкл.':'Паук: вкл.';b.setAttribute('aria-pressed',String(!active));};
 }
 updateToggle(){this.toggle.textContent=this.mode==='cloud'?'Режим: основной · перейти к повторам':'Режим: повторы времени · основной расчёт';this.toggle.setAttribute('aria-pressed',String(this.mode==='echo'));}
 persist(){try{const text=JSON.stringify({mode:this.mode,journal:this.journal});if(text!==this.lastSave){localStorage.setItem(KEY,text);this.lastSave=text;}}catch{this.storageError=true;}}
 sync(){
  const sig=`${this.archive.size}:${this.archive.maxOrder}:${this.archive.complete}:${this.archive.conflicts.size}`;if(sig===this.signature)return;
  this.signature=sig;this.rows=[...this.archive.rows.values()].sort((a,b)=>b.order-a.order);this.index=makeIndex(this.rows);this.runTest();if(this.dialog.open)this.render();
 }
 runTest(){if(!this.archive.complete||!this.worker||Date.now()-this.lastTest<600000)return;this.lastTest=Date.now();this.testId=(this.testId||0)+1;this.testPending=true;this.worker.postMessage({id:this.testId,rows:this.rows,now:this.clock.now(),min:this.min});}
 frame(cloudFrame,now,source){
  this.sync();const checked=Date.parse(source?.checked_at),fresh=source?.fresh&&source?.source_connected&&!source?.error&&Number.isFinite(checked)&&now-checked<=45000&&checked<=now+10000;
  if(this.archive.complete&&fresh){
   const existing=new Set(this.journal.map(w=>w.id));
   for(const w of candidates(this.rows,now,10))if(!existing.has(w.id))this.journal.push({...w,issuedAt:now,status:'pending'});
  }
  let changed=false;
  for(const w of this.journal){if(w.status==='hit'||w.status==='miss')continue;const result=evaluate(w,this.index||{rows:[],gaps:[]},now);if(JSON.stringify(result)!==JSON.stringify(w.lastEvaluation)){Object.assign(w,result,{lastEvaluation:result});changed=true;}}
  this.persist();if(changed&&this.dialog.open&&this.tab==='journal')this.render();
  if(this.mode!=='echo'){this.caption.textContent='';return cloudFrame;}
  this.caption.textContent=this.storageError?'Журнал не сохраняется: память браузера недоступна.':'Гипотеза повторов · окно ±1 минута · точность не доказана';
  if(!this.archive.complete)return {phase:'reasoning',signal:null,result:null,remaining:0,ratio:0};
  const old=this.journal.find(w=>w.id===this.visible);
  if(old&&old.status!=='pending'&&now<=(old.status==='hit'?old.resultAt:old.end)+12000){return {phase:'result',signal:null,result:{...old,result:old.actual},remaining:0,ratio:old.status==='hit'?1:0};}
  if(!fresh)return {phase:'offline',signal:null,result:null,remaining:0,ratio:0};
  let w=old?.status==='pending'&&old.end>=now?old:null;
  if(!w)w=this.journal.filter(w=>w.status==='pending'&&w.end>=now&&w.target>=this.min).sort((a,b)=>a.start-b.start||b.target-a.target)[0];
  if(!w)return {phase:'searching',signal:null,result:null,remaining:0,ratio:0};
  this.visible=w.id;return {phase:now<w.start?'scheduled':'checking',signal:w,result:null,remaining:w.end-now,ratio:Math.max(0,Math.min(1,(w.end-now)/(w.end-w.start)))};
 }
 render(){
  const minimum=Number(this.filter.value),now=this.clock.now();this.dialog.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===this.tab)));
  this.meta.textContent=`${this.rows.length.toLocaleString('ru-RU')} раундов · ${this.archive.complete?'архив загружен':'загрузка архива…'} · Киев · верхней границы X нет`;
  const nodes=[];
  if(this.tab==='rounds'){
   const rows=this.rows.filter(r=>r.coefficient>=minimum);for(const r of rows.slice(0,this.shown)){
    const card=el('article',null,'archive-row'+(r.coefficient>=10?' big':''));card.append(el('b',x(r.coefficient),'spider-food'),el('time',r.estimated?'—':formatClock(r.timestamp)),el('small',(r.estimated?'Точное время неизвестно':date(r.timestamp)+' · время записи раунда')+' · ID '+r.id));nodes.push(card);
   }this.more.hidden=rows.length<=this.shown;
  }else if(this.tab==='journal'){
   nodes.push(el('p','Окна зафиксированы до их начала в этом браузере. Зашло — цель достигнута внутри окна. Промах — окно полностью проверено. При пробелах в данных результат остаётся непроверенным.','echo-note'));
   const rows=this.journal.filter(w=>w.target>=this.min).sort((a,b)=>b.start-a.start);const c={hit:0,miss:0,unknown:0,pending:0};rows.forEach(w=>c[w.status]++);nodes.push(el('p',`Зашло ${c.hit} · Промах ${c.miss} · Нет данных ${c.unknown} · В процессе ${c.pending}`,'echo-note'));
   for(const w of rows.slice(0,this.shown))nodes.push(this.windowCard(w,true));this.more.hidden=rows.length<=this.shown;
  }else{
   nodes.push(el('p','Проверяем вашу гипотезу: крупный раунд → те же минуты и секунды через час или на следующий день по Киеву. Цель равна прошлому коэффициенту, окно ±60 секунд. Это не известный заранее краш и не гарантия входа.','echo-note'));
   nodes.push(el('h3','Ближайшие окна · следующий час'));
   const upcoming=this.journal.filter(w=>w.end>=now&&w.target>=this.min).sort((a,b)=>a.start-b.start||b.target-a.target);
   upcoming.slice(0,this.shown).forEach(w=>nodes.push(this.windowCard(w,false)));this.more.hidden=upcoming.length<=this.shown;
   if(!upcoming.length)nodes.push(el('p',this.archive.complete?'Нет будущих окон для выбранного порога.':'Сначала загружаем архив.','echo-note'));
   nodes.push(el('h3','Проверка на прошлых данных · до 30 дней'));
   if(this.stats)for(const kind of ['hour','day']){const s=this.stats[kind],n=s.hit+s.miss,b=s.baseHit+s.baseMiss,box=el('div',null,'echo-stat');box.append(el('b',kind==='hour'?'Повтор через час':'Повтор на следующий день'),el('span',`Зашло ${s.hit} из ${n} проверенных; без полной проверки ${s.unknown}. Контроль со сдвигом +30 минут: ${s.baseHit} из ${b}; без полной проверки ${s.baseUnknown}.`));nodes.push(box);}
   else nodes.push(el('p',this.testError?'Проверка истории недоступна в этом браузере.':this.testPending?'Считаем в фоне…':'Ожидаем полного архива…','echo-note'));
   nodes.push(el('p','Историческая проверка отдельно от новых окон. Цели берутся только из предшествовавших раундов. Пересекающиеся окна зависимы; эти числа не подтверждают преимущество или прибыль. Пропуски и неизвестное время не считаются промахами.','echo-note'));
  }
  if(!nodes.length)nodes.push(el('p','Пока нет раундов с таким коэффициентом.','echo-note'));this.content.replaceChildren(...nodes);
 }
 windowCard(w,journal){const card=el('article',null,'archive-row '+w.status);card.append(el('b','Цель '+x(w.target)),el('time',formatClock(w.center)),el('strong',journal?labels[w.status]:(w.kind==='hour'?'Через час':'Следующий день')),el('small',date(w.start)+' · окно '+formatClock(w.start)+' — '+formatClock(w.end)),el('small','Было '+x(w.target)+' · '+date(w.anchorAt)+' '+formatClock(w.anchorAt)),el('small','Фиксация: '+date(w.issuedAt)+' '+formatClock(w.issuedAt)));if(journal)card.append(el('small',w.actual!=null?'Факт '+x(w.actual)+(w.resultAt?' · '+formatClock(w.resultAt):' · максимум наблюдённых раундов'):'Фактический коэффициент пока неизвестен'),el('small',w.roundId?'Раунд '+w.roundId:''));return card;}
}
