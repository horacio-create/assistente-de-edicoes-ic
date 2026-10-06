'use strict';

// Keep the video workspace inside the window; only its panels scroll.
const adjustmentPanel=document.querySelector('.adjustments');
const clipProperties=document.createElement('section');
clipProperties.id='clip-properties';clipProperties.className='clip-properties';
const clipHeading=$('selected-segment').parentElement;
clipProperties.append(clipHeading,$('clip-cut-controls'),document.querySelector('.timeline-fields'),document.querySelector('.timeline-foot'),$('video-speed-warning'));
$('video-options').after(clipProperties);
const shortcuts=document.querySelector('.video-shortcuts');adjustmentPanel.append(shortcuts);
const timelineToolbar=document.createElement('div');timelineToolbar.className='timeline-toolbar';
timelineToolbar.append($('video-timeline').querySelector(':scope > .timeline-heading'),document.querySelector('.montage-tools'));
$('video-timeline').prepend(timelineToolbar);
const layoutPosition=syncCompositionPosition;
syncCompositionPosition=function(){layoutPosition();$('video-play').setAttribute('aria-label',compositionPlaying?'Pausar montagem':'Reproduzir montagem');$('video-play').textContent=compositionPlaying?'Ⅱ':'▶';};
const layoutTimeline=renderLayeredTimeline;
renderLayeredTimeline=function(){layoutTimeline();const row=document.querySelector('.new-track-drop');if(row){row.dataset.help=row.textContent;row.textContent='↑ Nova faixa';}};

function compactWorkspace(){
 const active=editorKind==='video'&&!$('studio').hidden;
 document.body.classList.toggle('video-workspace',active);
 clipProperties.hidden=shortcuts.hidden=editorKind!=='video';
 if(active){window.scrollTo(0,0);requestAnimationFrame(()=>{fitStage();if(project())renderLayeredTimeline();});}
}
new MutationObserver(compactWorkspace).observe($('studio'),{attributes:true,attributeFilter:['hidden']});
const layoutSyncKind=syncEditorKind;
syncEditorKind=function(){layoutSyncKind();compactWorkspace();};
const layoutFitStage=fitStage;
fitStage=function(){
 if(!document.body.classList.contains('video-workspace'))return layoutFitStage();
 const m=current(),shell=document.querySelector('.canvas-shell');if(!m||!shell.clientWidth)return;
 const ratio=m.settings.width/m.settings.height;
 const width=Math.max(30,Math.min(shell.clientWidth-64,(shell.clientHeight-16)*ratio));
 $('stage').style.width=width+'px';$('stage').style.height=width/ratio+'px';
 $('composition-position').style.width=width+'px';$('composition-position').classList.toggle('narrow-preview',width<250);
 $('canvas-size').textContent=`${m.settings.width} × ${m.settings.height} px`;positionLogo();drawSoon();
};
const previewObserver=new ResizeObserver(()=>{if(document.body.classList.contains('video-workspace'))fitStage();});
previewObserver.observe(document.querySelector('.canvas-shell'));
compactWorkspace();

// Explanations stay available without occupying the editing surface.
function helpFor(target,source){
 if(!target||!source)return;
 if(!source.id)source.id='help-'+crypto.randomUUID();
 source.classList.add('context-help');
 target.dataset.helpSource=[...new Set((target.dataset.helpSource||'').split(' ').filter(Boolean).concat(source.id))].join(' ');
 const described=(target.getAttribute('aria-describedby')||'').split(' ').filter(Boolean);
 target.setAttribute('aria-describedby',[...new Set([...described,source.id])].join(' '));
}
helpFor($('mode'),$('mode-help'));
helpFor($('video-size'),$('video-options').querySelector('.help'));
helpFor($('video-size'),$('video-size-warning'));
for(const id of ['clip-duration','duration-final','normal-speed'])helpFor($(id),document.querySelector('.timeline-foot .help'));
helpFor($('clip-duration'),$('video-speed-warning'));
helpFor($('add-segment'),$('video-timeline').querySelector(':scope > .help'));
helpFor($('layered-timeline'),$('video-timeline').querySelector(':scope > .help'));
helpFor($('library-add'),$('media-library').querySelector(':scope > .help'));
helpFor($('stage'),document.querySelector('.canvas-caption span'));
helpFor($('safe'),$('safe').closest('label').nextElementSibling);
helpFor($('add-logo'),document.querySelector('.logo-settings > .help'));
helpFor($('export-audio-action'),$('video-export-help'));
helpFor($('source-keep'),$('source-dialog').querySelector(':scope > .help'));
helpFor($('source-add'),$('source-dialog').querySelector(':scope > .help'));
helpFor(shortcuts.querySelector('summary'),shortcuts.querySelector('.help'));
// Remaining instructional paragraphs use a nearby action; output measurements stay visible.
for(const source of document.querySelectorAll('.help:not(.context-help)')){
 if(['final-notes','video-original-info'].includes(source.id))continue;
 const container=source.closest('section,dialog,.empty,.section-title')||source.parentElement;
 const target=container.querySelector('button,select,input:not([type=hidden]),summary');
 if(target)helpFor(target,source);
}
for(const source of document.querySelectorAll('.center-caption'))helpFor(source.closest('label')?.querySelector('input'),source);

const controlHelp={
 'video-play':'Reproduzir ou pausar a montagem (Espaço).',
 'montage-scrub':'Percorrer a montagem. O cursor da timeline acompanha a posição.',
 'split-segment':'Dividir o trecho selecionado na posição do cursor (C).',
 'remove-segment':'Remover o trecho selecionado e encaixar os demais (Delete).',
 'segment-left':'Mover o trecho para antes do vizinho na mesma faixa (Ctrl + ←).',
 'segment-right':'Mover o trecho para depois do vizinho na mesma faixa (Ctrl + →).',
 'save-composition':'Guardar a biblioteca, as faixas, os cortes e os ajustes desta edição (Ctrl + S).',
 'open-export':'Revisar e exportar a montagem (Ctrl + E).',
 'audio-action':'Remover ou restaurar o áudio de toda a montagem (M).',
 'export-audio-action':'Remover ou restaurar o áudio de toda a montagem.',
 'clip-duration':'Definir o tempo do trecho selecionado na montagem.',
 'duration-final':'Alterar proporcionalmente a duração de toda a montagem (T).',
 'number-zoom':'Ampliar ou reduzir a mídia. Digite a porcentagem desejada.',
 'pos-x':'Mover a mídia horizontalmente. Zero centraliza.',
 'pos-y':'Mover a mídia verticalmente. Zero centraliza.',
 'fit-image':'Ajustar a mídia à tela e centralizar (F).',
 'reset':'Restaurar os ajustes de enquadramento do trecho.',
 'normal-speed':'Voltar o trecho de vídeo à velocidade original (V).',
 'trim-start':'Definir onde começa o trecho no vídeo original.',
 'trim-end':'Definir onde termina o trecho no vídeo original.',
 'trim-start-handle':'Arrastar para ajustar o início no vídeo original.',
 'trim-end-handle':'Arrastar para ajustar o fim no vídeo original.',
 'media-prev':'Selecionar o trecho anterior.',
 'media-next':'Selecionar o próximo trecho.'
};
for(const [id,help] of Object.entries(controlHelp))if($(id))$(id).dataset.help=help;
for(const button of document.querySelectorAll('.format-button'))button.dataset.help=button.textContent.trim().replace(/\s+/g,' ');
$('layered-timeline').dataset.help='Arraste mídias da biblioteca para montar. Arraste um trecho para o espaço superior para criar uma faixa. A faixa de cima cobre a de baixo.';

// Native title tooltips cannot enforce a delay. Capture titles on dynamic clips and icons too.
function captureTitles(root=document){
 const nodes=[...(root instanceof Element&&root.hasAttribute('title')?[root]:[]),...root.querySelectorAll('[title]')];
 for(const element of nodes){const title=element.getAttribute('title');if(title){element.dataset.help=title;if(element.matches('button')&&!element.hasAttribute('aria-label')&&!element.textContent.replace(/[↶↷↔↕←→90°\s]/g,''))element.setAttribute('aria-label',title);}element.removeAttribute('title');}
 for(const control of root.querySelectorAll('button,input:not([type=hidden]),select,summary,[role=slider]')){
  if(control.dataset.help||control.dataset.helpSource)continue;
  const label=control.getAttribute('aria-label')||control.closest('label')?.textContent||control.textContent;
  if(label?.trim())control.dataset.help=label.trim().replace(/\s+/g,' ');
 }
}
captureTitles();
new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')captureTitles(record.target);else for(const node of record.addedNodes)if(node instanceof Element)captureTitles(node);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['title']});

const helpBubble=document.createElement('div');helpBubble.id='hover-help';helpBubble.className='hover-help';helpBubble.setAttribute('role','tooltip');helpBubble.setAttribute('popover','manual');helpBubble.hidden=true;document.body.append(helpBubble);
let helpTarget=null,helpTimer=0,helpOrigin=null,helpVisible=false,helpPointer=null;
function helpText(target){
 const parts=[];if(target?.dataset.help)parts.push(target.dataset.help);
 for(const id of (target?.dataset.helpSource||'').split(' ').filter(Boolean)){const source=$(id);if(source&&(!source.hidden||source.classList.contains('context-help')&&!source.classList.contains('video-warning'))&&source.textContent.trim())parts.push(source.textContent.trim());}
 return [...new Set(parts)].join(' ');
}
function hideHelp(){clearTimeout(helpTimer);if(helpVisible&&helpBubble.hidePopover)helpBubble.hidePopover();helpBubble.hidden=true;helpVisible=false;helpTarget=null;}
function showHelp(){
 if(!helpTarget?.isConnected||!helpTarget.getClientRects().length)return;
 const text=helpText(helpTarget);if(!text)return;
 helpBubble.textContent=text;helpBubble.hidden=false;if(helpBubble.showPopover)helpBubble.showPopover();helpVisible=true;
 const rect=helpTarget.getBoundingClientRect(),bubble=helpBubble.getBoundingClientRect();
 const left=Math.max(8,Math.min(window.innerWidth-bubble.width-8,rect.left+(rect.width-bubble.width)/2));
 const top=rect.bottom+bubble.height+12<=window.innerHeight?rect.bottom+8:Math.max(8,rect.top-bubble.height-8);
 helpBubble.style.left=left+'px';helpBubble.style.top=top+'px';
}
function hintedElement(target){return target instanceof Element?target.closest('[data-help],[data-help-source]'):null;}
function queueHelp(target,x,y){if(!target)return;clearTimeout(helpTimer);helpTarget=target;helpOrigin={x,y};helpTimer=setTimeout(showHelp,3000);}
document.addEventListener('pointerover',e=>{helpPointer={x:e.clientX,y:e.clientY};const target=hintedElement(e.target);if(target===helpTarget)return;hideHelp();queueHelp(target,e.clientX,e.clientY);});
document.addEventListener('pointerout',e=>{if(helpTarget&&!helpTarget.contains(e.relatedTarget)&&hintedElement(e.relatedTarget)!==helpTarget)hideHelp();});
document.addEventListener('pointermove',e=>{helpPointer={x:e.clientX,y:e.clientY};const target=hintedElement(e.target);if(!helpTarget&&target)queueHelp(target,e.clientX,e.clientY);else if(helpTarget&&!helpVisible&&helpOrigin&&Math.hypot(e.clientX-helpOrigin.x,e.clientY-helpOrigin.y)>4)queueHelp(helpTarget,e.clientX,e.clientY);});
document.addEventListener('focusin',e=>{const target=hintedElement(e.target);hideHelp();queueHelp(target,0,0);});
document.addEventListener('focusout',hideHelp);
document.addEventListener('pointerdown',hideHelp,true);
document.addEventListener('keydown',hideHelp,true);
document.addEventListener('scroll',()=>{hideHelp();if(helpPointer){const {x,y}=helpPointer;queueHelp(hintedElement(document.elementFromPoint(x,y)),x,y);}},true);
window.addEventListener('blur',hideHelp);
