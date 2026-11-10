// GOD PREDITOR V15 — независимая реализация статистических идей из предоставленных материалов.
// Ни одна сторонняя закрытая AI/VIP модель не включена.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:NaN;
const med=a=>{if(!a.length)return NaN;const v=[...a].sort((x,y)=>x-y),h=v.length>>1;return v.length%2?v[h]:(v[h-1]+v[h])/2};
const mad=a=>{const m=med(a);return med(a.map(v=>Math.abs(v-m)))};
const std=a=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)))};
const pct=x=>Number.isFinite(x)?(x*100).toFixed(2)+'%':'—';
export const number=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—';
export const percent=pct;
export function v6Target(rounds){const a=rounds.slice(-3);if(a.length<3||a.some(v=>!(v.x>0)))return NaN;return Math.min(2.4,1.1*mean(a.map(v=>v.x)))}
function ema(a,alpha){if(!a.length)return NaN;let v=a[0];for(let i=1;i<a.length;i++)v=alpha*a[i]+(1-alpha)*v;return v}
function gamma(z){const p=[.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];if(z<.5)return Math.PI/(Math.sin(Math.PI*z)*gamma(1-z));z-=1;let x=p[0];for(let i=1;i<p.length;i++)x+=p[i]/(z+i);let t=z+7.5;return Math.sqrt(2*Math.PI)*Math.pow(t,z+.5)*Math.exp(-t)*x}
function bootstrapRate(hits){const a=hits.slice(-5000),N=a.length;if(N<200)return [NaN,NaN];let state=0x12345678;const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};let vals=[];const blocks=Math.ceil(N/25);for(let b=0;b<140;b++){let count=0,total=0;for(let i=0;i<blocks;i++){const start=Math.floor(rand()*Math.max(1,N-25));for(let j=start;j<Math.min(N,start+25);j++){count+=a[j];total++}}vals.push(count/total)}vals.sort((x,y)=>x-y);return [vals[Math.floor(.025*vals.length)],vals[Math.floor(.975*vals.length)]]}
function testModel(rows,x,horizon){const N=rows.length,cut=Math.floor(N*.7),trainBins=Array.from({length:60},()=>({n:0,y:0}));let trainN=0,trainY=0;
for(let i=0;i+horizon<cut;i+=horizon){let y=0;for(let j=1;j<=horizon;j++)if(rows[i+j].x>=x){y=1;break}const b=trainBins[new Date(rows[i].t).getUTCMinutes()];b.n++;b.y+=y;trainN++;trainY+=y}
if(trainN<50)return {count:0};const base=(trainY+1)/(trainN+2);let bs=0,ms=0,actual=0,k=0;for(let i=cut;i+horizon<N;i+=horizon){let y=0;for(let j=1;j<=horizon;j++)if(rows[i+j].x>=x){y=1;break}let b=trainBins[new Date(rows[i].t).getUTCMinutes()];const model=(b.y+120*base)/(b.n+120);bs+=(base-y)**2;ms+=(model-y)**2;actual+=y;k++}return {count:k,base,actual:actual/(k||1),baselineBrier:bs/(k||1),modelBrier:ms/(k||1),improved:ms<bs}}
export function analyze(rows,threshold=100,horizon=3){
const N=rows.length;if(N<40)return null;const x=+threshold,h=+horizon;
const hits=new Uint8Array(N),pos=[],minute=Array.from({length:60},()=>({all:0,hit:0})),second=Array.from({length:60},()=>({all:0,hit:0}));let max=0;
for(let i=0;i<N;i++){const r=rows[i],v=r.x>=x?1:0;hits[i]=v;if(v)pos.push(i);max=Math.max(max,r.x);const d=new Date(r.t);const m=minute[d.getUTCMinutes()],s=second[d.getUTCSeconds()];m.all++;m.hit+=v;s.all++;s.hit+=v}
const p=(pos.length+.5)/(N+1),baseline=1-(1-p)**h,dist=pos.length?(N-1-pos[pos.length-1]):NaN,gaps=pos.slice(1).map((v,i)=>v-pos[i]);const gapMedian=med(gaps),gapMad=mad(gaps),gapMean=mean(gaps);
let risk=0,event=0;for(let i=0;i<gaps.length;i++){const g=gaps[i];if(g>dist){risk++;if(g<=dist+h)event++}}
const survival=risk>=20?(event+1)/(risk+2):NaN,cv=gapMean>0?std(gaps)/gapMean:NaN,k=Number.isFinite(cv)&&cv>0?clamp(Math.pow(cv,-1.086),.35,5):NaN,scale=Number.isFinite(k)?gapMean/gamma(1+1/k):NaN;
const weibull=Number.isFinite(scale)&&scale>0?1-Math.exp(-(Math.pow((dist+h)/scale,k)-Math.pow(dist/scale,k))):NaN;
const tail=rows.slice(-80),cluster20=tail.filter(r=>r.x>=20).length,cluster50=tail.filter(r=>r.x>=50).length,cluster100=tail.filter(r=>r.x>=100).length;
const recent=rows.slice(-50).map(r=>r.x),ema20=ema(rows.slice(-20).map(r=>r.x),.25),ema50=ema(recent,.12);
const median50=med(recent),mad50=mad(recent),nextLast=rows.slice(-3),v6=v6Target(rows);
const mins=minute.map((b,i)=>({...b,i,rate:b.all?b.hit/b.all:0,score:(b.hit+10*p)/(b.all+10)})).filter(b=>b.all>=Math.max(30,N/250)).sort((a,b)=>b.score-a.score).slice(0,6);
const secs=second.map((b,i)=>({...b,i,rate:b.all?b.hit/b.all:0,score:(b.hit+10*p)/(b.all+10)})).filter(b=>b.all>=Math.max(30,N/250)).sort((a,b)=>b.score-a.score).slice(0,5);
const since=pos.length?rows[N-1].t-rows[pos[pos.length-1]].t:NaN;
const eta=Number.isFinite(gapMedian)&&pos.length?Math.max(Date.now()+15000,rows[pos[pos.length-1]].t+gapMedian*Math.max(1000,med(rows.slice(-200).map((r,i,a)=>i?a[i].t-a[i-1].t:NaN).filter(v=>Number.isFinite(v)&&v>0)))):null;
const test=testModel(rows,x,h);
const allHits=Array.from(hits);const ci=bootstrapRate(allHits);
return {N,x,h,p,baseline,survival,weibull,dist,risk,event,gapMedian,gapMad,gapMean,shape:k,scale,cluster20,cluster50,cluster100,median50,mad50,ema20,ema50,v6,max,minute:mins,second:secs,since,eta,ci,test,last:rows[N-1],recent:rows.slice(-25).reverse(),ge10:rows.filter(r=>r.x>=10).length,ge100:pos.length};
}
