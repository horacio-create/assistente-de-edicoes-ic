 'use strict';

// Native range keeps keyboard seeking; the canvas only paints ruler ticks.
const previewRuler=document.createElement('div');previewRuler.className='preview-ruler';
const previewTicks=document.createElement('canvas');previewTicks.setAttribute('aria-hidden','true');
const previewCursor=document.createElement('span');previewCursor.className='preview-ruler-cursor';previewCursor.setAttribute('aria-hidden','true');
$('montage-scrub').before(previewRuler);previewRuler.append(previewTicks,$('montage-scrub'),previewCursor);
const previewMarks=document.createElement('div');previewMarks.className='preview-cut-marks';
previewMarks.innerHTML='<button id="preview-mark-in" class="secondary" type="button" aria-label="Marcar início do trecho selecionado" data-help="Cortar o início do trecho selecionado no ponto atual da reprodução.">'+icon('brace-open')+'</button><button id="preview-mark-out" class="secondary" type="button" aria-label="Marcar fim do trecho selecionado" data-help="Cortar o fim do trecho selecionado no ponto atual da reprodução.">'+icon('brace-close')+'</button>';
previewRuler.after(previewMarks);
const currentTime=$('montage-position');timelineToolbar.prepend(currentTime);
currentTime.querySelector('span').textContent='s';$('montage-total-time').hidden=true;
// Tempo total ao lado do atual, editável: muda só o tamanho da timeline. Os vídeos mantêm duração e velocidade;
// o que sobrar no fim fica sem informação (a exportação avisa).
const totalField=document.createElement('input');totalField.id='montage-total-field';totalField.type='text';totalField.inputMode='decimal';totalField.maxLength=12;
totalField.setAttribute('aria-label','Duração total da montagem em segundos');totalField.dataset.help='Digite o tempo total da timeline, como 30. Os vídeos não mudam; se sobrar espaço no fim, ele fica sem informação. Enter aplica; Esc cancela.';
const totalSep=document.createElement('span');totalSep.className='montage-total-sep';totalSep.textContent='/';
const totalUnit=document.createElement('span');totalUnit.textContent='s';
// ≅ arredonda a montagem para o tempo de veiculação mais próximo (15 s ou 30 s), acelerando ou desacelerando os vídeos.
const roundButton=document.createElement('button');roundButton.id='montage-arredondar';roundButton.type='button';roundButton.className='secondary montage-arredondar';
currentTime.append(totalSep,totalField,totalUnit,roundButton);
const alvoVeiculacao=total=>total>22.5?30:15;
function setMontageDuration(value){const field=$('duration-final');field.value=value;field.onchange();}
function setTimelineLength(value){
 const conteudo=contentDuration();
 if(value<conteudo-.004){toast(`A timeline não pode ter menos que o conteúdo (${seconds(conteudo)}). Corte os trechos ou use ≅ para acelerar.`);return;}
 editProject(()=>{project().settings.duracao=value>conteudo+.004?snapFrame(value):0;});
}
totalField.onfocus=()=>{stopComposition();totalField.select();};
totalField.onblur=()=>{
 const text=totalField.value.trim().replace(',','.'),total=projectDuration();
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)||!(Number(text)>0)){if(text)toast('Digite a duração em segundos, como 30.');syncTotalField(true);return;}
 if(Math.abs(Number(text)-total)>.004)setTimelineLength(Number(text));syncTotalField(true);
};
totalField.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();totalField.blur();}else if(e.key==='Escape'){e.preventDefault();syncTotalField(true);totalField.blur();}};
roundButton.onclick=()=>{
 const total=contentDuration(),alvo=alvoVeiculacao(total);if(!total||roundButton.disabled)return;
 const antes=total;setMontageDuration(alvo);
 if(Math.abs(contentDuration()-antes)>.004)toast(`Montagem em ${alvo} s: velocidade ${(antes/alvo).toFixed(2).replace('.',',')}× (${antes>alvo?'mais rápida':'mais lenta'}).`);
};
function syncTotalField(force=false){
 const total=projectDuration(),p=project(),bloqueada=busy||!pHasClips()||p.clips.some(clipLocked);
 if(force||document.activeElement!==totalField)totalField.value=total.toFixed(2).replace('.',',');
 totalField.disabled=bloqueada;
 // largura fixa do tempo atual, pelo maior tempo possível (o total): durante a reprodução o número muda de tamanho
 // (9,99 → 10,00) e, com largura automática, empurrava o "/", o total e os botões, que ficavam tremendo
 const casas=Math.max(4,total.toFixed(2).length);
 Object.assign($('montage-current-time').style,{fieldSizing:'fixed',width:`calc(${casas-1}ch + 0.4em)`});
 // o ≅ olha para o conteúdo (os vídeos), não para o vazio que sobrar no fim da timeline
 const conteudo=contentDuration(),alvo=alvoVeiculacao(conteudo),fator=conteudo/alvo;
 roundButton.innerHTML=icon('aproximado')+`<span>${alvo} s</span>`;
 roundButton.disabled=bloqueada||!conteudo||Math.abs(conteudo-alvo)<.02&&Math.abs(total-alvo)<.02;
 roundButton.dataset.help=roundButton.disabled&&!bloqueada&&conteudo?`A montagem já tem ${alvo} s.`:`Ajustar a montagem para ${alvo} s, o tempo de veiculação mais próximo: velocidade ${fator.toFixed(2).replace('.',',')}× (${fator>1?'acelera':'desacelera'} os vídeos).`;
 roundButton.title=roundButton.dataset.help;roundButton.setAttribute('aria-label',roundButton.dataset.help);
}
let previewRulerKey='';
function drawPreviewRuler(){
 const total=projectDuration(),width=previewRuler.clientWidth,dpr=window.devicePixelRatio||1,key=[width,total,dpr].join(':');
 if(key!==previewRulerKey&&width){
  previewRulerKey=key;previewTicks.width=Math.round(width*dpr);previewTicks.height=Math.round(24*dpr);const ctx=previewTicks.getContext('2d');ctx.scale(dpr,dpr);ctx.strokeStyle='#9da6b9';ctx.lineWidth=1;
  const step=[1,2,5,10,20,30,60,120,300,600].find(s=>width*s/Math.max(total,1)>=4)||600;
  const major=Math.max(10,step);ctx.beginPath();ctx.moveTo(0,22.5);ctx.lineTo(width,22.5);
  for(let t=0;t<=total+.00001;t+=step){const x=Math.min(width-1,Math.round(t/Math.max(total,.01)*(width-1)))+.5;ctx.moveTo(x,t%major<.00001?6:15);ctx.lineTo(x,23);}
  ctx.stroke();
  // tempos de veiculação (15 s e 30 s) em destaque
  ctx.strokeStyle='#fc4d22';ctx.lineWidth=2;ctx.beginPath();
  for(const t of VEICULACAO)if(t<=total+.001){const x=Math.min(width-1,Math.round(t/total*(width-1)))+.5;ctx.moveTo(x,2);ctx.lineTo(x,23);}
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
const rulerPosition=syncCompositionPosition;syncCompositionPosition=function(){rulerPosition();drawPreviewRuler();syncTotalField();};
new ResizeObserver(drawPreviewRuler).observe(previewRuler);drawPreviewRuler();
