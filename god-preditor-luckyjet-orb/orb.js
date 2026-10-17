import {mountOrb} from './vendor/thinking-orbs/orb-core.js';
import {squares,crosses} from './vendor/thinking-orbs/renders.js';
export function orbProfile(phase){return phase==='reasoning'?{state:'reasoning',size:320,render:squares}:['checking','result'].includes(phase)?{state:'compacting',size:259,render:crosses,speed:1.65,tilt:-16}:{state:'searching',size:259,render:crosses}}
class LuckyOrb extends HTMLElement{
 static get observedAttributes(){return ['phase']}
 draw(){this.animation?.destroy();const profile=orbProfile(this.getAttribute('phase'));this.style.setProperty('--orb-size',profile.size+'px');this.animation=mountOrb(this.svg,profile);this.update?.()}
 attributeChangedCallback(){if(this.animation)this.draw()}
 connectedCallback(){if(this.animation)return;this.svg=document.createElementNS('http://www.w3.org/2000/svg','svg');this.replaceChildren(this.svg);this.draw();this.visible=true;this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.update=()=>{if(document.hidden||!this.visible||this.motion.matches)this.animation?.pause();else this.animation?.play()};this.motionChanged=()=>this.draw();this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.update()});this.observer.observe(this);document.addEventListener('visibilitychange',this.update);this.motion.addEventListener('change',this.motionChanged);this.update()}
 disconnectedCallback(){queueMicrotask(()=>{if(this.isConnected)return;this.observer?.disconnect();document.removeEventListener('visibilitychange',this.update);this.motion?.removeEventListener('change',this.motionChanged);this.animation?.destroy();this.animation=null})}
}
if(!customElements.get('lucky-orb'))customElements.define('lucky-orb',LuckyOrb);
