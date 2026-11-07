/* GOD VIP REALITY BREAKOUT — isolated decorative overlay only.
   URL guard: applies ONLY on the GOD PREDITOR VIP path.
   No network requests, Supabase calls, DOM scraping, coefficient reads or app mutations.
*/
(function(){
'use strict';
if(location.hostname!=='miuiproking.github.io'||!location.pathname.startsWith('/luckyjet-telegram-mini-app/god-preditor-pro-vip/'))return;
if(document.getElementById('godvip-reality-breakout'))return;
function mount(){
if(document.getElementById('godvip-reality-breakout')||!document.body)return;
const root=document.createElement('div');root.id='godvip-reality-breakout';root.setAttribute('aria-hidden','true');
const stage=document.createElement('div');stage.className='gv-stage';
const aura=document.createElement('div');aura.className='gv-aura';stage.appendChild(aura);
const spider=document.createElement('div');spider.className='gv-spider';
spider.innerHTML=`<svg viewBox="0 0 260 205" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gvMetal"><stop stop-color="#fff0aa"/><stop offset=".28" stop-color="#bd832d"/><stop offset=".8" stop-color="#352012"/><stop offset="1" stop-color="#070606"/></radialGradient><linearGradient id="gvLeg" x2="0" y2="1"><stop stop-color="#fff0a6"/><stop offset=".5" stop-color="#a87326"/><stop offset="1" stop-color="#27170c"/></linearGradient></defs><g fill="none" stroke="url(#gvLeg)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path class="gv-leg" d="M107 93 62 60 18 80 4 124"/><path class="gv-leg" d="M105 104 55 91 16 113 7 155"/><path class="gv-leg" d="M108 116 65 131 32 162 29 198"/><path class="gv-leg" d="M116 124 87 157 74 182 76 201"/><path class="gv-leg" d="M153 93 198 60 242 80 256 124"/><path class="gv-leg" d="M155 104 205 91 244 113 253 155"/><path class="gv-leg" d="M152 116 195 131 228 162 231 198"/><path class="gv-leg" d="M144 124 173 157 186 182 184 201"/></g><ellipse cx="130" cy="113" rx="44" ry="50" fill="url(#gvMetal)" stroke="#f5c66b" stroke-width="2"/><ellipse cx="130" cy="67" rx="30" ry="28" fill="url(#gvMetal)" stroke="#f5c66b" stroke-width="2"/><g fill="#ffcb4a" stroke="#fff6cb" stroke-width="1"><circle cx="116" cy="57" r="5"/><circle cx="144" cy="57" r="5"/><circle cx="127" cy="47" r="4"/><circle cx="134" cy="47" r="4"/></g><path d="M106 105 Q130 78 154 105" fill="none" stroke="#ffe6a5" stroke-width="3" opacity=".7"/><ellipse cx="115" cy="95" rx="7" ry="12" fill="#fff4ba" opacity=".2"/></svg>`;
stage.appendChild(spider);
const brain=document.createElement('div');brain.className='gv-brain';
brain.innerHTML=`<svg viewBox="0 0 220 175" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gvBrainFill"><stop stop-color="#ffe5d7"/><stop offset=".42" stop-color="#d17da9"/><stop offset=".8" stop-color="#653e8d"/><stop offset="1" stop-color="#211530"/></radialGradient></defs><path d="M109 28C80 4 41 20 35 51 9 58 13 95 34 107 25 138 52 159 80 150 93 170 110 162 112 145 131 169 155 157 161 147 192 157 207 132 189 111 216 85 203 56 180 50 174 18 132 7 109 28Z" fill="url(#gvBrainFill)" stroke="#ffbfe6" stroke-width="3"/><path d="M110 29Q99 51 112 75T110 146M51 49Q74 42 66 69T50 96Q82 83 84 112T69 140M164 47Q139 49 153 73T175 97Q145 90 141 118T160 144M81 28Q89 43 77 56M138 29Q128 45 141 58" fill="none" stroke="#502a65" stroke-width="6" stroke-linecap="round"/><g class="gv-neuron" fill="none" stroke="#fff2c0" stroke-width="3" opacity=".9"><path d="M45 92Q77 79 82 111T110 145"/><path d="M169 55Q139 70 151 91T176 126"/><path d="M92 38Q115 62 113 91T130 139"/></g></svg>`;
stage.appendChild(brain);
['10×','50×','100×'].forEach((v,i)=>{const x=document.createElement('div');x.className='gv-x gv-x'+(i+1);x.textContent=v;stage.appendChild(x)});
for(let i=0;i<16;i++){const p=document.createElement('i');p.className='gv-particle';p.style.left=(8+(i*37)%84)+'%';p.style.top=(25+(i*19)%64)+'%';p.style.animationDelay=(-(i*.37))+'s';stage.appendChild(p)}
root.appendChild(stage);
const toggle=document.createElement('button');toggle.type='button';toggle.className='gv-control';toggle.textContent='5D ⏸';toggle.setAttribute('aria-label','Pause or resume 5D animation');
toggle.addEventListener('click',()=>{const paused=root.classList.toggle('gv-paused');toggle.textContent=paused?'5D ▶':'5D ⏸'});
root.appendChild(toggle);document.body.appendChild(root);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
