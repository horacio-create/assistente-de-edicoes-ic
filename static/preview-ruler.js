 'use strict';

// Native range keeps keyboard seeking; the canvas only paints ruler ticks.
const previewRuler=document.createElement('div');previewRuler.className='preview-ruler';
const previewTicks=document.createElement('canvas');previewTicks.setAttribute('aria-hidden','true');
const previewCursor=document.createElement('span');previewCursor.className='preview-ruler-cursor';previewCursor.setAttribute('aria-hidden','true');
$('montage-scrub').before(previewRuler);previewRuler.append(previewTicks,$('montage-scrub'),previewCursor);
const previewMarks=document.createElement('div');previewMarks.className='preview-cut-marks';
previewMarks.innerHTML='<button id="preview-mark-in" class="secondary" type="button" aria-label="Marcar início do trecho selecionado" data-help="Cortar o início do trecho selecionado no ponto atual da reprodução.">{</button><button id="preview-mark-out" class="secondary" type="button" aria-label="Marcar fim do trecho selecionado" data-help="Cortar o fim do trecho selecionado no ponto atual da reprodução.">}</button>';
previewRuler.after(previewMarks);
const currentTime=$('montage-position');timelineToolbar.prepend(currentTime);
currentTime.querySelector('span').textContent='s';$('montage-total-time').hidden=true;
let previewRulerKey='';
function drawPreviewRuler(){
 const total=projectDuration(),width=previewRuler.clientWidth,dpr=window.devicePixelRatio||1,key=[width,total,dpr].join(':');
 if(key!==previewRulerKey&&width){
  previewRulerKey=key;previewTicks.width=Math.round(width*dpr);previewTicks.height=Math.round(24*dpr);const ctx=previewTicks.getContext('2d');ctx.scale(dpr,dpr);ctx.strokeStyle='#9da6b9';ctx.lineWidth=1;
  const step=[1,2,5,10,20,30,60,120,300,600].find(s=>width*s/Math.max(total,1)>=4)||600;
  const major=Math.max(10,step);ctx.beginPath();ctx.moveTo(0,22.5);ctx.lineTo(width,22.5);
  for(let t=0;t<=total+.00001;t+=step){const x=Math.min(width-1,Math.round(t/Math.max(total,.01)*(width-1)))+.5;ctx.moveTo(x,t%major<.00001?6:15);ctx.lineTo(x,23);}
  ctx.stroke();
 }
 previewCursor.style.left=(total?Math.min(1,compositionCursor/total)*100:0)+'%';
 const c=projectClip(),m=projectMedia(c),eligible=!busy&&timedMedia(m)&&!clipLocked(c)&&compositionCursor>=c.at-.00001&&compositionCursor<=c.at+c.duration+.00001;
 const source=eligible?c.in+(compositionCursor-c.at)*(c.out-c.in)/c.duration:0;
 $('preview-mark-in').disabled=!eligible||c.out-source<.1-.000001;
 $('preview-mark-out').disabled=!eligible||source-c.in<.1-.000001;
 $('montage-scrub').disabled=busy||!pHasClips();
}
for(const which of ['in','out'])$('preview-mark-'+which).onclick=()=>{
 const c=projectClip(),m=projectMedia(c);if(busy||!timedMedia(m)||clipLocked(c))return;
 if(compositionCursor<c.at||compositionCursor>c.at+c.duration){toast('Posicione o cursor dentro do trecho selecionado.');return;}
 const source=c.in+(compositionCursor-c.at)*(c.out-c.in)/c.duration;
 if(setClipRange(which,source))seekComposition(which==='in'?c.at:c.at+c.duration);
};
const rulerPosition=syncCompositionPosition;syncCompositionPosition=function(){rulerPosition();drawPreviewRuler();};
new ResizeObserver(drawPreviewRuler).observe(previewRuler);drawPreviewRuler();
