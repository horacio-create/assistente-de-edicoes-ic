'use strict';

// Definitions are hoisted so timeline rendering can call them after this script loads.
const clipClockIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
let clipClickPrevious=null,clipTimeDraft=null;
function appendClipClock(controls,track,name){
 const clips=project().clips.filter(c=>c.track===track.id),chosen=clips.find(c=>c.id===compositionSelected)||clips.find(c=>compositionCursor>=c.at&&compositionCursor<c.at+c.duration)||clips[0];
 const button=document.createElement('button');button.type='button';button.className='track-property clip-clock';button.innerHTML=clipClockIcon;button.dataset.property='speed';button.setAttribute('aria-label','Alterar velocidade ou duração de '+name);button.dataset.help='Alterar a porcentagem ou a duração do trecho selecionado nesta faixa. Abaixo de 100% acelera; acima desacelera.';button.disabled=busy||!chosen||clipLocked(chosen);button.onclick=()=>openClipSpeed(chosen?.id);controls.append(button);
}
function handleClipClick(e,c){
 if(compositionDrag)return;
 const now=performance.now(),twice=e.detail===2||(clipClickPrevious?.id===c.id&&now-clipClickPrevious.time<400);
 clipClickPrevious={id:c.id,time:now};
 if(twice){clipClickPrevious=null;openClipTrim(c.id);}else if(compositionSelected!==c.id)selectProjectClip(c.id);
}
function makeClipDialog(id,title,body){
 const dialog=document.createElement('dialog');dialog.id=id;dialog.className='clip-time-dialog';dialog.setAttribute('aria-labelledby',id+'-title');
 dialog.innerHTML=`<div class="dialog-head"><h2 id="${id}-title">${title}</h2><button type="button" class="close" aria-label="Fechar">×</button></div>${body}<p class="clip-time-error" role="alert" hidden></p><div class="dialog-footer"><button type="button" class="secondary clip-time-cancel">Cancelar</button><button type="button" class="primary clip-time-apply">Aplicar</button></div>`;
 document.body.append(dialog);dialog.querySelector('.close').onclick=dialog.querySelector('.clip-time-cancel').onclick=()=>dialog.close();return dialog;
}
const clipSpeedDialog=makeClipDialog('clip-speed-dialog','Velocidade e duração',`<p class="clip-time-name"></p><p>Duração do trecho a 100%: <strong id="clip-speed-original"></strong></p><div class="two-columns"><label id="clip-speed-percent-label">Duração relativa (%)<input id="clip-speed-percent" type="number" min="25" max="400" step="0.01"></label><label>Nova duração (s)<input id="clip-speed-duration" type="number" min="0.04" max="3600" step="0.01"></label></div><p id="clip-speed-explanation">100% mantém a duração original do corte. 50% reduz a duração à metade (2× mais rápido); 200% dobra a duração (0,5×).</p><p id="clip-speed-rate"></p>`);
const clipTrimDialog=makeClipDialog('clip-trim-dialog','Ajustar trecho',`<p class="clip-time-name"></p><p>Arquivo original: <strong id="clip-trim-original"></strong></p><div class="two-columns"><label>Início no original (s)<input id="clip-trim-in" type="number" min="0" step="0.01"></label><label>Fim no original (s)<input id="clip-trim-out" type="number" min="0.1" step="0.01"></label></div><div class="trim-track clip-trim-track"><div id="clip-trim-selection" class="trim-selection"></div><input id="clip-trim-in-range" aria-label="Início do trecho" type="range" min="0" step="0.01"><input id="clip-trim-out-range" aria-label="Fim do trecho" type="range" min="0" step="0.01"></div><div class="timeline-scale"><span>0 s do original</span><span id="clip-trim-end"></span></div><p id="clip-trim-duration"></p><p>O corte mantém a velocidade atual. Use o relógio da faixa para alterar a duração.</p>`);
function timeDialogContext(id){
 const c=project()?.clips.find(c=>c.id===id);if(!c||busy)return null;
 if(clipLocked(c)){toast('Desbloqueie o trecho para alterar seu tempo.');return null;}
 selectProjectClip(id,false);stopComposition();return {id,job:job.id,timeline:job.meta.activeTimeline,clip:structuredClone(c),media:projectMedia(c)};
}
function draftClip(){if(!clipTimeDraft||job?.id!==clipTimeDraft.job||job.meta.activeTimeline!==clipTimeDraft.timeline)return null;return project().clips.find(c=>c.id===clipTimeDraft.id);}
function timeError(dialog,text=''){const error=dialog.querySelector('.clip-time-error');error.textContent=text;error.hidden=!text;}
function openClipSpeed(id){
 if(clipSpeedDialog.open)return;const draft=timeDialogContext(id);if(!draft)return;clipTimeDraft=draft;
 const timed=timedMedia(draft.media),span=timed?draft.clip.out-draft.clip.in:draft.clip.duration;
 draft.span=span;draft.duration=draft.clip.duration;
 clipSpeedDialog.querySelector('.clip-time-name').textContent=draft.media.name;
 $('clip-speed-dialog-title').textContent=timed?'Velocidade e duração':'Duração da imagem';
 $('clip-speed-original').textContent=seconds(span);$('clip-speed-percent-label').hidden=$('clip-speed-explanation').hidden=!timed;
 $('clip-speed-duration').value=Number(draft.duration.toFixed(2));$('clip-speed-percent').value=Number((draft.duration/span*100).toFixed(2));
 timeError(clipSpeedDialog);syncSpeedDraft();clipSpeedDialog.showModal();$('clip-speed-duration').focus();$('clip-speed-duration').select();
}
function syncSpeedDraft(){if(!clipTimeDraft)return;$('clip-speed-rate').textContent=timedMedia(clipTimeDraft.media)?'Velocidade: '+(clipTimeDraft.span/clipTimeDraft.duration).toFixed(2).replace('.',',')+'× · duração ajustada aos quadros do vídeo.':'';}
$('clip-speed-percent').oninput=()=>{const n=Number($('clip-speed-percent').value);if(!Number.isFinite(n)||n<=0)return;clipTimeDraft.duration=clipTimeDraft.span*n/100;$('clip-speed-duration').value=Number(clipTimeDraft.duration.toFixed(2));syncSpeedDraft();};
$('clip-speed-duration').oninput=()=>{const n=Number($('clip-speed-duration').value);if(!Number.isFinite(n)||n<=0)return;clipTimeDraft.duration=n;$('clip-speed-percent').value=Number((n/clipTimeDraft.span*100).toFixed(2));syncSpeedDraft();};
clipSpeedDialog.querySelector('.clip-time-apply').onclick=()=>{
 const c=draftClip(),d=clipTimeDraft;if(!c||busy||clipLocked(c)){timeError(clipSpeedDialog,'O trecho não está disponível para edição.');return;}
 if($('clip-speed-duration').value===''||timedMedia(d.media)&&($('clip-speed-percent').value===''||Number($('clip-speed-percent').value)<25||Number($('clip-speed-percent').value)>400)){timeError(clipSpeedDialog,'Preencha uma duração válida e uma porcentagem entre 25% e 400%.');return;}
 const duration=snapFrame(d.duration),rate=d.span/duration;
 if(!Number.isFinite(d.duration)||duration<1/30||duration>3600||timedMedia(d.media)&&(rate<.25-.001||rate>4+.001)){timeError(clipSpeedDialog,'Use de 25% a 400% (velocidade entre 0,25× e 4×), com duração de até uma hora.');return;}
 if(editProject(()=>resizeClip(c,duration))){clipSpeedDialog.close();}else timeError(clipSpeedDialog,'Não foi possível alterar a duração. Verifique os bloqueios e o limite da montagem.');
};
function openClipTrim(id){
 if(clipTrimDialog.open||clipSpeedDialog.open)return;const c=project()?.clips.find(c=>c.id===id);if(!c)return;if(!timedMedia(projectMedia(c)))return openClipSpeed(id);
 const draft=timeDialogContext(id);if(!draft)return;clipTimeDraft=draft;draft.start=c.in;draft.end=c.out;
 clipTrimDialog.querySelector('.clip-time-name').textContent=draft.media.name;$('clip-trim-original').textContent=seconds(draft.media.duration);$('clip-trim-end').textContent=seconds(draft.media.duration);
 for(const key of ['in','out']){const field=$('clip-trim-'+key),range=$('clip-trim-'+key+'-range');field.max=Number(draft.media.duration.toFixed(2));range.max=draft.media.duration;field.value=Number(c[key].toFixed(2));range.value=c[key];}
 timeError(clipTrimDialog);syncTrimDraft();clipTrimDialog.showModal();
}
function syncTrimDraft(){const d=clipTimeDraft;if(!d)return;const rate=(d.clip.out-d.clip.in)/d.clip.duration;$('clip-trim-selection').style.left=d.start/d.media.duration*100+'%';$('clip-trim-selection').style.width=Math.max(0,(d.end-d.start)/d.media.duration*100)+'%';$('clip-trim-duration').textContent='Duração do corte: '+seconds(Math.max(0,(d.end-d.start)/rate));}
for(const key of ['in','out'])for(const suffix of ['', '-range'])$('clip-trim-'+key+suffix).oninput=()=>{const d=clipTimeDraft,field=$('clip-trim-'+key+suffix),n=Number(field.value);if(!Number.isFinite(n)||field.value==='')return;let value=key==='out'&&n===Number(d.media.duration.toFixed(2))?d.media.duration:n;if(suffix){value=key==='in'?Math.max(0,Math.min(value,d.end-.1)):Math.min(d.media.duration,Math.max(value,d.start+.1));field.value=value;}d[key==='in'?'start':'end']=value;$('clip-trim-'+key+(suffix?'':'-range')).value=suffix?Number(value.toFixed(2)):value;syncTrimDraft();};
clipTrimDialog.querySelector('.clip-time-apply').onclick=()=>{
 const c=draftClip(),d=clipTimeDraft;if(!c||busy||clipLocked(c)){timeError(clipTrimDialog,'O trecho não está disponível para edição.');return;}
 if($('clip-trim-in').value===''||$('clip-trim-out').value===''||!Number.isFinite(d.start)||!Number.isFinite(d.end)||d.start<0||d.end>d.media.duration||d.end-d.start<.1-.000001){timeError(clipTrimDialog,'Escolha início e fim dentro do original, com pelo menos 0,1 segundo.');return;}
 const rate=(c.out-c.in)/c.duration,duration=snapFrame((d.end-d.start)/rate);
 if(duration<1/30||(d.end-d.start)/duration>4+.001||(d.end-d.start)/duration<.25-.001){timeError(clipTrimDialog,'O corte precisa manter a velocidade entre 0,25× e 4×.');return;}
 if(editProject(()=>{c.in=d.start;c.out=d.end;resizeClip(c,duration);})){clipTrimDialog.close();}else timeError(clipTrimDialog,'Não foi possível ajustar o trecho. Verifique os bloqueios.');
};
// Keep legacy IDs for existing shortcuts and project loading, outside the sidebar.
const hiddenTimeControls=document.createElement('div');hiddenTimeControls.hidden=true;hiddenTimeControls.append($('clip-properties'));document.body.append(hiddenTimeControls);
const sizeOptions=$('video-options');$('export-dialog').querySelector('.dialog-head').after(sizeOptions);
const speedShortcut=document.querySelector('.video-shortcuts .shortcut-list');for(const entry of speedShortcut.children)if(entry.textContent.includes('Duração da montagem'))entry.innerHTML='<kbd>T</kbd> Velocidade e duração do trecho';
window.addEventListener('keydown',e=>{if(!['t','p'].includes(e.key.toLowerCase())||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||busy||editorKind!=='video'||$('studio').hidden||document.querySelector('dialog[open]')||e.target.closest?.('input,select,textarea,[contenteditable]'))return;e.preventDefault();e.stopImmediatePropagation();if(e.key.toLowerCase()==='p'){guard(async()=>{await openExport();if($('export-dialog').open){$('video-size').focus();$('video-size').select();}});}else openClipSpeed(compositionSelected);},true);
$('apply-all').parentElement.classList.add('timeline-model-action');
const originalApplyCaption=$('apply-all').textContent;
const clipDialogSyncKind=syncEditorKind;syncEditorKind=function(){clipDialogSyncKind();$('apply-selected').hidden=editorKind==='video';$('apply-all').textContent=editorKind==='video'?'Aplicar modelo às demais timelines':originalApplyCaption;};

// Pixel fields use the same geometry as the canvas; Cartesian Y points upwards.
const pixelGeometry=document.createElement('section');pixelGeometry.id='pixel-geometry';pixelGeometry.innerHTML='<h3>Transformação</h3><div class="two-columns"><label>Posição X (px)<input id="clip-position-x" type="number" step="0.01"></label><label>Posição Y (px)<input id="clip-position-y" type="number" step="0.01"></label></div><p>Origem no centro · X → direita · Y ↑ acima</p><label>Rotação (°)<input id="clip-rotation" type="number" step="0.01"></label><div class="two-columns"><label>Largura da mídia (px)<input id="clip-scale-width" type="number" min="1" step="0.01"></label><label>Altura da mídia (px)<input id="clip-scale-height" type="number" min="1" step="0.01"></label></div><p>Escala proporcional: largura e altura permanecem ligadas.</p>';
$('zoom-value').parentElement.before(pixelGeometry);$('zoom-value').parentElement.classList.add('legacy-geometry-field');$('zoom').closest('.value-control').classList.add('legacy-geometry-field');$('pos-x').closest('.two-columns').classList.add('legacy-geometry-field');
function syncPixelGeometry(){
 const m=current(),visual=editorKind==='video'&&m&&m.kind!=='audio'&&projectClip();pixelGeometry.hidden=!visual;if(!visual)return;
 const s=m.settings,g=mediaGeometry(m),values={'clip-position-x':s.x*s.width,'clip-position-y':-s.y*s.height,'clip-rotation':s.rotation,'clip-scale-width':g.drawW,'clip-scale-height':g.drawH};
 for(const [id,value] of Object.entries(values)){const input=$(id);if(document.activeElement!==input)input.value=Number(value.toFixed(2));input.disabled=!!transformLocked()||(id.includes('scale')&&s.lockSize)||(id.endsWith('-x')&&s.lockX)||(id.endsWith('-y')&&s.lockY);}
 $('clip-position-x').min=-s.width;$('clip-position-x').max=s.width;$('clip-position-y').min=-s.height;$('clip-position-y').max=s.height;
 const base=mediaGeometry({...m,settings:{...s,zoom:1,lockSize:false}});for(const [id,dimension] of [['clip-scale-width',m.width],['clip-scale-height',m.height]]){$(id).min=Number((dimension*base.factor*.1).toFixed(2));$(id).max=Number((dimension*base.factor*5).toFixed(2));}
}
for(const axis of ['x','y'])$('clip-position-'+axis).onchange=()=>{const m=current(),n=Number($('clip-position-'+axis).value);if(!m||!Number.isFinite(n)||transformLocked())return;const size=axis==='x'?m.settings.width:m.settings.height;change({[axis]:Math.max(-1,Math.min(1,n/size*(axis==='y'?-1:1)))});};
$('clip-rotation').onchange=()=>{const n=Number($('clip-rotation').value);if(Number.isFinite(n)&&!transformLocked())change({rotation:(n%360+360)%360});};
for(const dimension of ['width','height'])$('clip-scale-'+dimension).onchange=()=>{const m=current(),n=Number($('clip-scale-'+dimension).value);if(!m||!Number.isFinite(n)||n<=0||transformLocked()||m.settings.lockSize)return;const base=mediaGeometry({...m,settings:{...m.settings,zoom:1,lockSize:false}}),zoom=n/(m[dimension]*base.factor);if(zoom<.1||zoom>5){toast('A escala precisa ficar dentro dos limites mostrados neste campo.');syncPixelGeometry();return;}change({zoom});};
const pixelSyncTransform=syncTransformBox;syncTransformBox=function(){pixelSyncTransform();syncPixelGeometry();};
syncEditorKind();syncPixelGeometry();
