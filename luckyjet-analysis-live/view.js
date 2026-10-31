import {formatClock,countdown} from './model.js';
const statuses={hit:'Зашло',miss:'Промах',unknown:'Нет полной проверки',pending:'В процессе'};
const number=v=>Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'×';
const date=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric'}).format(t);
const kind=w=>w.kind==='basic'?'Базовый алгоритм':w.kind==='opportunity'?'Крупная цель · базовый алгоритм':'Медианный интервал · наша модель';
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
export class LiveView{
 constructor(){this.$=id=>document.getElementById(id);this.tab='rounds';this.limit=100;this.rows=[];this.journal=[];const $=this.$;
  $('openHistory').onclick=()=>{this.limit=100;$('historyDialog').showModal();this.history();};$('closeHistory').onclick=()=>$('historyDialog').close();
  $('roundsTab').onclick=()=>{this.tab='rounds';this.limit=100;this.history();};$('signalsTab').onclick=()=>{this.tab='signals';this.limit=100;this.history();};$('moreHistory').onclick=()=>{this.limit+=100;this.history();};
 }
 data(rows,journal,stats,complete){this.rows=rows;this.journal=journal;this.stats=stats;this.complete=complete;const $=this.$;
  $('feed').replaceChildren(...rows.slice(0,5).map(r=>{const d=el('article',null,'chip '+(r.coefficient>=10?'high':r.coefficient>=2?'mid':''));d.dataset.roundId=r.id;d.append(el('b',number(r.coefficient)),el('time',r.estimated?'—':formatClock(r.timestamp)));return d;}));
  $('archiveProgress').textContent=(complete?'Архив: ':'Загружаем архив: ')+rows.length.toLocaleString('ru-RU')+' раундов';
  $('sampleSize').textContent=complete?((stats[0]?.sampleSize||0).toLocaleString('ru-RU')+' раундов'):'Загрузка архива…';
  if($('historyDialog').open)this.history();
 }
 tick(now,fresh){const $=this.$;$('connectionDot').className=fresh?'live':'offline';$('connectionText').textContent=fresh?'Supabase LIVE · время по Киеву':'Нет свежих данных · расчёт новых окон приостановлен';
  const active=this.journal.filter(w=>w.kind==='basic'&&w.status==='pending'&&w.end>now).sort((a,b)=>a.start-b.start)[0];
  const result=this.journal.filter(w=>['hit','miss'].includes(w.status)&&w.resultAt<=now&&now-w.resultAt<40000).sort((a,b)=>b.resultAt-a.resultAt)[0];
  const w=result||active;$('phase').textContent=result?'РЕЗУЛЬТАТ ОКНА':!fresh?'ОЖИДАЕМ СВЕЖИЕ ДАННЫЕ':active?(now<active.start?'РАСЧЁТНОЕ ОКНО · КИЕВ':'ПРОВЕРКА ЦЕЛИ'):'АНАЛИЗ ИСТОРИИ';
  $('target').textContent=w?number(w.target):'—';$('windowTime').textContent=w?formatClock(w.start)+' — '+formatClock(w.end):'—';
  $('windowDetail').textContent=w?kind(w)+(active&&!result?' · '+(now<active.start?'до окна ':'до конца ')+countdown((now<active.start?active.start:active.end)-now):''):'Ожидаем данные для расчёта';
  $('result').textContent=result?statuses[result.status]+' · факт '+number(result.actual):'';
  const basic=[...this.journal].reverse().find(w=>w.kind==='basic');$('basicDetail').textContent=basic?`Цель ${number(basic.target)} · оценка правил ${basic.heuristicScore}/100 · окно ${formatClock(basic.start)}–${formatClock(basic.end)}. Время и цель закреплены до проверки.`:'Нужно минимум 20 свежих раундов с известным временем.';
  $('thresholds').replaceChildren(...(this.stats?.length?this.stats:[40,200,500].map(threshold=>({threshold,count:0}))).map(s=>{const active=this.journal.find(w=>w.kind==='median:'+s.threshold&&w.end>now),d=el('article',null,'threshold'+(active&&now>=active.start?' active':''));d.append(el('b',s.threshold+'×+'),el('time',active?formatClock(active.start):!this.complete?'Загрузка…':s.estimatedNextAt?formatClock(s.estimatedNextAt):'—'),el('small',active?statuses[active.status]+' · до '+formatClock(active.end):s.overdue?'Ориентир прошёл':s.count<3?'Мало наблюдений':'Ожидаем новое окно'),el('small',`Событий: ${s.count||0} · частота ${(s.frequencyPct||0).toFixed(2)}%`),el('small',s.medianGapMs?'Медиана '+(s.medianGapMs/60000).toFixed(1)+' мин':'Интервал неизвестен'));return d;}));
 }
 history(){const $=this.$;$('roundsTab').setAttribute('aria-pressed',String(this.tab==='rounds'));$('signalsTab').setAttribute('aria-pressed',String(this.tab==='signals'));
  const rows=this.tab==='rounds'?this.rows:[...this.journal].sort((a,b)=>b.createdAt-a.createdAt);
  $('historyNote').textContent=this.tab==='rounds'?'Наши коэффициенты · дата и время записи до секунды по Киеву.':`Локальный журнал этого браузера. Зашло: ${rows.filter(w=>w.status==='hit').length} · Промах: ${rows.filter(w=>w.status==='miss').length} · Нет данных: ${rows.filter(w=>w.status==='unknown').length}. Неполная проверка не считается промахом.`;
  const nodes=rows.slice(0,this.limit).map(r=>{const d=el('article',null,'history-row '+(r.status||''));if(this.tab==='rounds'){d.append(el('strong',number(r.coefficient)),el('time',r.estimated?'—':formatClock(r.timestamp)),el('small',(r.estimated?'Точное время неизвестно':date(r.timestamp))+' · ID '+r.id));}else{d.append(el('strong','Цель '+number(r.target)),el('time',statuses[r.status]),el('small',kind(r)+' · '+date(r.start)+' · '+formatClock(r.start)+' — '+formatClock(r.end)),el('small','Создано '+date(r.createdAt)+' '+formatClock(r.createdAt)),el('small',r.actual!=null?'Факт '+number(r.actual)+(r.resultAt?' · '+formatClock(r.resultAt):''):'Результат пока не подтверждён'));if(r.roundId)d.append(el('small','Раунд '+r.roundId));}return d;});
  if(!nodes.length)nodes.push(el('p','Пока нет записей.','empty'));$('historyList').replaceChildren(...nodes);$('moreHistory').hidden=this.limit>=rows.length;
 }
}
