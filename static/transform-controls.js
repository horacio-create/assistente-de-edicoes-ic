'use strict';

let transformControlsVisible=true,transformDrag=null;
try{transformControlsVisible=localStorage.getItem('indoor-transform-controls')!=='hidden';}catch{}
const transformShell=document.querySelector('#editor .canvas-shell');
const transformOverlay=document.createElement('div');transformOverlay.className='media-transform-overlay';
const transformBox=document.createElement('div');transformBox.id='media-transform-box';transformBox.className='media-transform-box';transformBox.setAttribute('role','group');transformBox.hidden=true;
for(const [handle,label] of [['nw','canto superior esquerdo'],['n','borda superior'],['ne','canto superior direito'],['e','borda direita'],['se','canto inferior direito'],['s','borda inferior'],['sw','canto inferior esquerdo'],['w','borda esquerda'],['rotate','rotação']]){
 const button=document.createElement('button');button.type='button';button.className='media-transform-handle '+handle;button.dataset.transformHandle=handle;button.setAttribute('aria-label',handle==='rotate'?'Girar mídia selecionada':'Redimensionar '+label);button.dataset.help=handle==='rotate'?'Arraste para girar. Shift encaixa em passos de 15°. As setas ajustam 1° por vez.':'Arraste para ajustar a escala mantendo a proporção. As setas também ajustam a escala.';
 if(handle==='rotate')button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6"/></svg>';
 button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const m=transformMedia();if(!m||transformLocked())return;const sign=['ArrowLeft','ArrowDown'].includes(e.key)?-1:1;if(handle==='rotate')change({rotation:(m.settings.rotation+sign*(e.shiftKey?15:1)+360)%360});else if(!m.settings.lockSize)change({zoom:Math.max(.1,Math.min(5,m.settings.zoom+sign*.01))});};transformBox.append(button);
}
transformOverlay.append(transformBox);transformShell.append(transformOverlay);
const transformToggle=document.createElement('button');transformToggle.id='toggle-transform-controls';transformToggle.type='button';transformToggle.className='transform-visibility-toggle';transformToggle.setAttribute('aria-label','Mostrar ou ocultar controles de transformação');transformToggle.dataset.help='Mostrar ou ocultar a caixa e as alças de posição, escala e rotação da mídia selecionada.';transformToggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14"/><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z"/></svg>';transformShell.append(transformToggle);
transformToggle.onclick=()=>{transformControlsVisible=!transformControlsVisible;try{localStorage.setItem('indoor-transform-controls',transformControlsVisible?'visible':'hidden');}catch{}syncTransformBox();};
function transformMedia(){return editorKind==='video'?(projectClip()?current():null):current();}
function transformLocked(){return busy||(editorKind==='video'&&clipLocked(projectClip()));}
function transformFrameVisible(){
 if(editorKind!=='video')return true;
 const c=projectClip(),time=Math.min(compositionCursor,Math.max(0,projectDuration()-1/3000));
 return !!c&&time>=c.at-.00001&&time<c.at+c.duration&&projectTrack(c)?.previewVisible!==false;
}
function syncTransformBox(){
 const m=transformMedia(),visible=m&&m.kind!=='audio'&&transformFrameVisible()&&!$('studio').hidden;
 const scaleLabel=m?.role==='logo'?'Escala':'Zoom',label=$('zoom-value').parentElement;label.firstChild.textContent=scaleLabel+' ';$('zoom').setAttribute('aria-label',scaleLabel);$('number-zoom').setAttribute('aria-label',scaleLabel+' em porcentagem');
 transformToggle.disabled=!m||m.kind==='audio'||busy;transformToggle.setAttribute('aria-pressed',String(transformControlsVisible));
 transformBox.hidden=!transformControlsVisible||!visible;if(transformBox.hidden)return;
 const s=m.settings,g=mediaGeometry(m),stage=$('stage').getBoundingClientRect(),shell=transformShell.getBoundingClientRect(),scale=stage.width/s.width;
 Object.assign(transformBox.style,{left:(stage.left-shell.left+(g.x+g.rw/2)*scale)+'px',top:(stage.top-shell.top+(g.y+g.rh/2)*scale)+'px',width:g.drawW*scale+'px',height:g.drawH*scale+'px',transform:`translate(-50%,-50%) rotate(${s.rotation}deg)`,pointerEvents:editorKind!=='video'&&s.logoId?'none':'auto'});
 transformBox.setAttribute('aria-label','Transformar '+m.name);transformBox.classList.toggle('locked',!!transformLocked());
 for(const button of transformBox.children)button.disabled=!!transformLocked()||(button.dataset.transformHandle!=='rotate'&&!!s.lockSize);
}
// Pick the visible layer under the pointer, including transparent logo pixels.
const transformHitCanvas=document.createElement('canvas');transformHitCanvas.width=transformHitCanvas.height=1;
function hitVisualClip(e){
 if(editorKind!=='video'||!project())return null;
 const p=project(),r=$('stage').getBoundingClientRect(),time=Math.min(compositionCursor,Math.max(0,projectDuration()-1/3000)),x=(e.clientX-r.left)/r.width*p.settings.width,y=(e.clientY-r.top)/r.height*p.settings.height;
 const rank=new Map(p.tracks.map((t,i)=>[t.id,i]));
 const candidates=p.clips.filter(c=>time>=c.at&&time<c.at+c.duration&&projectMedia(c)?.kind!=='audio'&&projectTrack(c)?.previewVisible!==false).sort((a,b)=>rank.get(b.track)-rank.get(a.track));
 for(const c of candidates){const m=projectMedia(c),g=mediaGeometry({...m,settings:{...c.settings,width:p.settings.width,height:p.settings.height}}),a=c.settings.rotation*Math.PI/180,dx=x-g.x-g.rw/2,dy=y-g.y-g.rh/2,lx=dx*Math.cos(a)+dy*Math.sin(a),ly=-dx*Math.sin(a)+dy*Math.cos(a);let u=(lx+g.drawW/2)/g.drawW,v=(ly+g.drawH/2)/g.drawH;if(u<0||u>1||v<0||v>1)continue;
  if(m.kind==='image'){const im=asset('/media/'+m.id);if(im){if(c.settings.flipH)u=1-u;if(c.settings.flipV)v=1-v;const ctx=transformHitCanvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,1,1);ctx.drawImage(im,Math.min(m.width-1,Math.floor(u*m.width)),Math.min(m.height-1,Math.floor(v*m.height)),1,1,0,0,1,1);if(ctx.getImageData(0,0,1,1).data[3]<16)continue;}}
  return c;
 }return null;
}
function beginTransformDrag(e,handle='move',capture=transformBox){
 if(e.button!==0||busy)return;
 if(handle==='move'&&editorKind==='video'){const hit=hitVisualClip(e);if(!hit||hit.id!==compositionSelected)return;}
 const m=transformMedia();if(!m||m.kind==='audio'||transformLocked()||!transformFrameVisible()||(handle!=='move'&&handle!=='rotate'&&m.settings.lockSize))return;
 e.preventDefault();e.stopPropagation();if(editorKind==='video')stopComposition();undoGesture=++undoGestureSerial;
 const stage=$('stage').getBoundingClientRect(),g=mediaGeometry(m),s=structuredClone(m.settings),cx=stage.left+(g.x+g.rw/2)/s.width*stage.width,cy=stage.top+(g.y+g.rh/2)/s.height*stage.height;
 transformDrag={pointer:e.pointerId,capture,handle,s,g,stage,x:e.clientX,y:e.clientY,cx,cy,startAngle:Math.atan2(e.clientY-cy,e.clientX-cx)};capture.setPointerCapture(e.pointerId);transformBox.classList.add('dragging');
}
transformBox.onpointerdown=e=>beginTransformDrag(e,e.target.closest('[data-transform-handle]')?.dataset.transformHandle||'move');
const transformStagePointerDown=$('stage').onpointerdown;
$('stage').onpointerdown=e=>{if(current()?.kind==='audio')return;if(editorKind==='video')beginTransformDrag(e,'move',$('stage'));else if(pointerOnSelectedMedia(e))transformStagePointerDown(e);};
function pointerOnSelectedMedia(e){const m=transformMedia();if(!m)return false;const r=$('stage').getBoundingClientRect(),g=mediaGeometry(m),a=m.settings.rotation*Math.PI/180,dx=(e.clientX-r.left)/r.width*m.settings.width-g.x-g.rw/2,dy=(e.clientY-r.top)/r.height*m.settings.height-g.y-g.rh/2;return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=g.drawW/2&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=g.drawH/2;}
window.addEventListener('keydown',e=>{
 if(e.key!=='Home'||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.isComposing||busy||$('studio').hidden||document.querySelector('dialog[open]')||e.target.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="separator"]'))return;
 const m=transformMedia();if(!m||m.kind==='audio'||transformLocked())return;e.preventDefault();e.stopImmediatePropagation();if(editorKind==='video')stopComposition();
 const source=editorKind==='video'?projectMedia():m;change({x:0,y:0,rotation:0,zoom:m.role==='logo'?(source.settings.zoom??.12):1,flipH:false,flipV:false,lockSize:false});toast('Posição, rotação e escala restauradas.');
},true);
window.addEventListener('pointermove',e=>{
 const d=transformDrag;if(!d||e.pointerId!==d.pointer)return;
 const m=transformMedia();if(!m||transformLocked()){finishTransformDrag();return;}
 const dx=e.clientX-d.x,dy=e.clientY-d.y,s=d.s;let patch;
 if(d.handle==='move')patch={x:s.lockX?0:snap(Math.max(-1,Math.min(1,s.x+dx/d.stage.width)),0,8/d.stage.width),y:s.lockY?0:snap(Math.max(-1,Math.min(1,s.y+dy/d.stage.height)),0,8/d.stage.height)};
 else if(d.handle==='rotate'){
  let angle=(s.rotation+(Math.atan2(e.clientY-d.cy,e.clientX-d.cx)-d.startAngle)*180/Math.PI+720)%360;if(e.shiftKey)angle=Math.round(angle/15)*15%360;angle=Number(angle.toFixed(2));patch={rotation:angle};
  if(!s.lockSize){const base=mediaGeometry({...m,settings:{...s,rotation:angle,zoom:1}});patch.zoom=Math.max(.1,Math.min(5,d.g.factor/base.factor));}
 }else{
  const hx=d.handle.includes('e')?1:d.handle.includes('w')?-1:0,hy=d.handle.includes('s')?1:d.handle.includes('n')?-1:0,a=s.rotation*Math.PI/180,k=d.stage.width/s.width,lx=(dx*Math.cos(a)+dy*Math.sin(a))/k,ly=(-dx*Math.sin(a)+dy*Math.cos(a))/k,vx=hx*d.g.drawW,vy=hy*d.g.drawH;
  const ratio=Math.max(.1/s.zoom,Math.min(5/s.zoom,1+(lx*vx+ly*vy)/(vx*vx+vy*vy)));
  const shiftX=hx*d.g.drawW*(ratio-1)/2,shiftY=hy*d.g.drawH*(ratio-1)/2;
  patch={zoom:s.zoom*ratio,x:s.lockX?0:Math.max(-1,Math.min(1,s.x+(shiftX*Math.cos(a)-shiftY*Math.sin(a))/s.width)),y:s.lockY?0:Math.max(-1,Math.min(1,s.y+(shiftX*Math.sin(a)+shiftY*Math.cos(a))/s.height))};
 }change(patch);
});
function finishTransformDrag(){const d=transformDrag;if(!d)return;transformDrag=null;transformBox.classList.remove('dragging');if(d.capture.hasPointerCapture(d.pointer))d.capture.releasePointerCapture(d.pointer);undoGesture=null;syncTransformBox();}
window.addEventListener('pointerup',finishTransformDrag);window.addEventListener('pointercancel',finishTransformDrag);
const transformDrawLive=drawLive;drawLive=function(){transformDrawLive();syncTransformBox();};
const transformRenderComposition=renderCompositionCanvas;renderCompositionCanvas=function(...args){const result=transformRenderComposition(...args);if(!args[2])syncTransformBox();return result;};
const transformSyncVideo=syncVideo;syncVideo=function(){transformSyncVideo();syncTransformBox();};
const transformFitStage=fitStage;fitStage=function(){transformFitStage();syncTransformBox();};
new ResizeObserver(syncTransformBox).observe(transformShell);syncTransformBox();
