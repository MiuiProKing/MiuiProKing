import {formatClock,countdown} from './model.js';
const statuses={hit:'Зашло',miss:'Промах',unknown:'Нет полной проверки',pending:'В процессе'};
const number=v=>Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'×';
const date=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric'}).format(t);
const kind=w=>w.kind==='basic'?'Базовый алгоритм':w.kind==='opportunity'?'Крупная цель · базовый алгоритм':'Медианный интервал · наша модель';
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
export class LiveView{
 constructor(){this.$=id=>document.getElementById(id);this.tab='rounds';this.limit=100;this.rows=[];this.journal=[];const $=this.$;
  $('openHistory').onclick=()=>{this.limit=100;$('historyDialog').showModal();this.history();};$('closeHistory').onclick=()=>$('historyDialog').close();
  $('roundsTab').onclick=()=>{this.tab='rounds';this.limit=100;this.history();};$('signalsTab').onclick=()=>{this.tab='signals';this.limit=100;this.history();};$('moreHistory').onclick=()=>{this.limit+=100;this.history();};$('toggleAnalysis').onclick=()=>{const open=$('analysisDetails').hidden;$('analysisDetails').hidden=!open;$('toggleAnalysis').setAttribute('aria-expanded',String(open));$('toggleAnalysis').textContent=open?'Скрыть анализ ↑':'Показать анализ ↓';};
 }
 data(rows,journal,stats,complete){this.rows=rows;this.journal=journal;this.stats=stats;this.complete=complete;const $=this.$;
  $('feed').replaceChildren(...rows.slice(0,5).map(r=>{const d=el('article',null,'chip '+(r.coefficient>=10?'high':r.coefficient>=2?'mid':''));d.dataset.roundId=r.id;d.append(el('b',number(r.coefficient)),el('time',r.estimated?'—':formatClock(r.timestamp)));return d;}));
  $('archiveProgress').textContent=(complete?'Архив: ':'Загружаем архив: ')+rows.length.toLocaleString('ru-RU')+' раундов';
  $('sampleSize').textContent=complete?((stats[0]?.sampleSize||0).toLocaleString('ru-RU')+' раундов'):'Загрузка архива…';
  this.summary();if($('historyDialog').open)this.history();
 }
 tick(now,fresh){const $=this.$;$('connectionDot').className=fresh?'live':'offline';$('connectionText').textContent=fresh?'Supabase LIVE · время по Киеву':'Нет свежих данных · расчёт новых окон приостановлен';
  const active=this.journal.filter(w=>w.kind==='basic'&&w.status==='pending'&&w.end>now).sort((a,b)=>a.start-b.start)[0];
  const result=this.journal.filter(w=>['hit','miss'].includes(w.status)&&w.resultAt<=now&&now-w.resultAt<40000).sort((a,b)=>b.resultAt-a.resultAt)[0];
  const w=result||active;$('phase').textContent=result?'РЕЗУЛЬТАТ ОКНА':!fresh?'ОЖИДАЕМ СВЕЖИЕ ДАННЫЕ':active?(now<active.start?'РАСЧЁТНОЕ ОКНО · КИЕВ':'ПРОВЕРКА ЦЕЛИ'):'АНАЛИЗ ИСТОРИИ';
  $('target').textContent=w?number(w.target):'—';$('windowTime').textContent=w?formatClock(w.start)+' — '+formatClock(w.end):'—';
  $('windowDetail').textContent=w?kind(w)+(active&&!result?' · '+(now<active.start?'до окна ':'до конца ')+countdown((now<active.start?active.start:active.end)-now):''):'Ожидаем данные для расчёта';
  $('result').textContent=result?statuses[result.status]+' · факт '+number(result.actual):'';
  const basic=[...this.journal].reverse().find(w=>w.kind==='basic');$('basicDetail').textContent=basic?`Цель ${number(basic.target)} · оценка правил ${basic.heuristicScore}/100 · окно ${formatClock(basic.start)}–${formatClock(basic.end)}. Время и цель закреплены до проверки.`:'Нужно минимум 20 свежих раундов с известным временем.';
  $('thresholds').replaceChildren(...(this.stats?.length?this.stats:[40,200,500].map(threshold=>({threshold,count:0}))).map(s=>{const d=el('article',null,'threshold');d.append(el('b',s.threshold+'×+'),el('time',this.complete?'VIP-расчёт отсутствует':'Загрузка архива…'),el('small',`Событий: ${s.count||0} · частота ${(s.frequencyPct||0).toFixed(2)}%`),el('small',s.lastAt?'Последний '+formatClock(s.lastAt):'Нет наблюдений'),el('small',s.medianGapMs?'Медиана '+(s.medianGapMs/60000).toFixed(1)+' мин':'Интервал неизвестен'));return d;}));
  const score=basic?.heuristicScore;$('scoreValue').textContent=Number.isFinite(score)?score+'/100':'—';$('scoreBar').value=Number.isFinite(score)?Math.max(0,Math.min(100,score)):0;
  const patterns={'Cycle des cotes d’or détecté':'Обнаружен цикл крупных коэффициентов',"Cycle des cotes d'or détecté":'Обнаружен цикл крупных коэффициентов','Plage horaire favorable':'Повышенные исторические значения для этого часа','Plage horaire faible':'Пониженные исторические значения для этого часа','Analyse multi-signaux':'Анализ нескольких исторических признаков'};
  $('pattern').textContent=basic?(patterns[basic.pattern]||'Базовый анализ истории'):'Ожидаем свежие раунды';
  const facts=basic?[['Цель',number(basic.target)],['Окно',Math.round((basic.end-basic.start)/1000)+' сек'],['Сформировано',formatClock(basic.createdAt)],['Состояние',statuses[basic.status]]]:[];
  $('facts').replaceChildren(...facts.map(([label,value])=>{const d=el('div',null,'fact');d.append(el('small',label),el('strong',value));return d;}));
  const opportunity=[...this.journal].reverse().find(w=>w.kind==='opportunity'&&w.status==='pending'&&w.end>now);$('opportunity').hidden=!opportunity;$('opportunity').textContent=opportunity?`Крупная цель базового алгоритма: ${number(opportunity.target)} · ${formatClock(opportunity.start)}–${formatClock(opportunity.end)} · ${now<opportunity.start?'до окна':'до конца'} ${countdown((now<opportunity.start?opportunity.start:opportunity.end)-now)}`:'';

 }
 summary(){const rows=this.rows.filter(r=>!r.estimated&&Number.isFinite(r.timestamp)&&r.timestamp<=Date.now()).slice(0,2000),n=rows.length;const data=[['Средний коэффициент',n?number(rows.reduce((s,r)=>s+r.coefficient,0)/n):'—'],['Максимальный',n?number(Math.max(...rows.map(r=>r.coefficient))):'—'],['Частота ≥2×',n?(100*rows.filter(r=>r.coefficient>=2).length/n).toFixed(1)+'%':'—'],['Частота ≥10×',n?(100*rows.filter(r=>r.coefficient>=10).length/n).toFixed(1)+'%':'—']];this.$('summaryStats').replaceChildren(...data.map(([label,value])=>{const d=el('div',null,'summary-cell');d.append(el('small',label),el('strong',value));return d;}));}

 history(){const $=this.$;$('roundsTab').setAttribute('aria-pressed',String(this.tab==='rounds'));$('signalsTab').setAttribute('aria-pressed',String(this.tab==='signals'));
  const rows=this.tab==='rounds'?this.rows:[...this.journal].sort((a,b)=>b.createdAt-a.createdAt);
  $('historyNote').textContent=this.tab==='rounds'?'Наши коэффициенты · дата и время записи до секунды по Киеву.':`Локальный журнал этого браузера. Зашло: ${rows.filter(w=>w.status==='hit').length} · Промах: ${rows.filter(w=>w.status==='miss').length} · Нет данных: ${rows.filter(w=>w.status==='unknown').length}. Неполная проверка не считается промахом.`;
  const nodes=rows.slice(0,this.limit).map(r=>{const d=el('article',null,'history-row '+(r.status||''));if(this.tab==='rounds'){d.append(el('strong',number(r.coefficient)),el('time',r.estimated?'—':formatClock(r.timestamp)),el('small',(r.estimated?'Точное время неизвестно':date(r.timestamp))+' · ID '+r.id));}else{d.append(el('strong','Цель '+number(r.target)),el('time',statuses[r.status]),el('small',kind(r)+' · '+date(r.start)+' · '+formatClock(r.start)+' — '+formatClock(r.end)),el('small','Создано '+date(r.createdAt)+' '+formatClock(r.createdAt)),el('small',r.actual!=null?'Факт '+number(r.actual)+(r.resultAt?' · '+formatClock(r.resultAt):''):'Результат пока не подтверждён'));if(r.roundId)d.append(el('small','Раунд '+r.roundId));}return d;});
  if(!nodes.length)nodes.push(el('p','Пока нет записей.','empty'));$('historyList').replaceChildren(...nodes);$('moreHistory').hidden=this.limit>=rows.length;
 }
}
