// GOD PREDITOR Multi-X: analytical port of the user-supplied prediction.ts and userscript v1.3.
// The two uploaded .user.js files are byte-identical; their casino automation is intentionally
// not run inside a standalone GitHub Pages dashboard. Historical observations are not forecasts.
const MIN=60000, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const median=a=>{if(!a.length)return 0;const s=[...a].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const mad=a=>{const m=median(a);return median(a.map(v=>Math.abs(v-m)))};
const geo=a=>a.length?Math.exp(mean(a.map(v=>Math.log(Math.max(1.001,v))))):0;
const ema=(a,alpha)=>a.reduce((v,x,i)=>i?alpha*x+(1-alpha)*v:x,0);
const gap=(rows,t)=>{const hits=rows.filter(r=>r.x>=t);const d=hits.slice(1).map((r,i)=>r.t-hits[i].t);return {count:hits.length,last:hits.at(-1)?.t??null,median:median(d),mad:mad(d),avg:mean(d)}};
export function analyzeMultiX(rows,now=Date.now(),low=10,high=500){
 const valid=rows.filter(r=>Number.isFinite(r.x)&&Number.isFinite(r.t)&&r.x>=1&&r.t<=now).sort((a,b)=>a.t-b.t);
 const coefs=valid.map(r=>r.x),recent=valid.slice(-80),last50=coefs.slice(-50),last20=coefs.slice(-20);
 const stats={rounds:valid.length,median50:median(last50),mad50:mad(last50),ema20:ema(last20,.25),ema50:ema(last50,.12),geometricMean:geo(coefs),big20:recent.filter(r=>r.x>=20).length,big50:recent.filter(r=>r.x>=50).length};
 if(valid.length<20)return {stats,signals:[],diagnostics:[],reason:'Недостаточно данных: нужно минимум 20 завершённых раундов'};
 const thresholds=[10,20,30,50,75,100,120,150,200,250,300,400,500].filter(t=>t>=low&&t<=high);
 const signals=[],diagnostics=[];
 for(const target of thresholds){
  const g=gap(valid,target),since=g.last===null?Infinity:now-g.last,span=valid.at(-1).t-valid[0].t;
  const lambda=span>0?g.count/span:0;
  const overdue=lambda>0?1-Math.exp(-lambda*Math.max(0,since)):0;
  const stable=g.count>=5&&g.median>0&&g.mad>0&&g.mad<g.median*.5;
  const tolerance=clamp(g.mad*1.4826+g.median*.35,2*MIN,12*MIN);
  const expected=g.last===null?null:g.last+g.median;
  const cycle=stable&&expected!==null&&(Math.abs(expected-now)<=tolerance*.7||since>=g.median*.9);
  const density20=stats.big20,density50=stats.big50;
  // The uploaded source's cluster condition is defined for BIG 100x/120x;
  // do not pretend it was originally trained for every threshold.
  const cluster=target>=100&&target<=120&&density50>=3&&density20>=6;
  const hazard=g.count>=4&&valid.length>=80&&overdue>=.75;
  const evidence=[cycle,cluster,hazard].filter(Boolean).length;
  const cycleScore=cycle?clamp(55+Math.min(10,g.count)+12*(1-Math.abs(expected-now)/Math.max(1,tolerance)),55,82):0;
  const clusterScore=cluster?clamp(55+density50*5+density20,55,82):0;
  const hazardScore=hazard?clamp(50+overdue*30,50,80):0;
  const score=Math.round(Math.min(92,Math.max(cycleScore,clusterScore,hazardScore)+(evidence>=2?5:0)));
  const accepted=evidence>=2||(evidence===1&&score>=75);
  const suggestedAt=cycle?Math.max(now+90_000,expected):cluster?now+3*MIN:lambda>0?now+clamp(1/lambda,90_000,8*MIN):expected!==null?Math.max(now+90_000,expected):null;
  const reasons=[];
  if(g.count<4)reasons.push('Мало событий: '+g.count+'/4');
  if(!cycle)reasons.push('Цикл не подтверждён');
  if(!cluster)reasons.push(target>=100&&target<=120?'Кластер ниже порога 6/3':'Кластерный метод только для 100–120×');
  if(!hazard)reasons.push('Hazard ниже порога 75% или мало данных');
  if(evidence===1&&score<75)reasons.push('Один сигнал: баллы ниже 75');
  diagnostics.push({target,events:g.count,medianGapMs:g.median,madGapMs:g.mad,lastAt:g.last,elapsedMs:since,overdue,cycle,cluster,hazard,score,accepted,suggestedAt,reasons});
  if(!accepted)continue;
  let at=cycle?Math.max(now+90_000,expected):cluster?now+3*MIN:now+clamp(1/lambda,90_000,8*MIN);
  let duration=cycle?clamp(tolerance,3*MIN,10*MIN):cluster?6*MIN:clamp(.8/lambda,3*MIN,7*MIN);
  signals.push({target,at,end:at+duration,score,cycle,cluster,hazard,events:g.count,medianGapMs:g.median,overdue});
 }
 return {stats,diagnostics,signals:signals.sort((a,b)=>b.score-a.score||a.at-b.at),reason:'Баллы — эвристика, не калиброванная вероятность. Для доказательства преимущества нужен walk-forward backtest против базовой модели.'};
}
