'use strict';

// Images keep the established editor. Video jobs own a project and a source library.
const compositionLegacy={current,renderGrid,updateCounts,syncVideo,syncAudio,syncEditorKind,change,drawLive,showPreview,upload,openExport,finalPreview,exportValues,setBusy};
let compositionJob=null,compositionSelected=null,compositionCursor=0,compositionPlaying=false,compositionFrame=0,compositionStart=0;
let compositionFinalTime=0,compositionFinalPlaying=false,compositionFinalFrame=0,compositionFinalStart=0;
let compositionDrag=null,compositionSnap=null,sourceMediaId=null;
let timelineZoom=1;
const timelineZoomByJob=new Map();
const sourceSelections=new Map(),compositionPlayers=new Map(),compositionFinalPlayers=new Map();
const freshId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const timedMedia=m=>m?.kind==='video'||m?.kind==='audio';
const mediaTrackKind=m=>m?.kind==='audio'?'audio':'video';
const visualDuration=()=>Math.max(0,...(project()?.clips||[]).filter(c=>projectMedia(c)?.kind!=='audio').map(c=>c.at+c.duration));
function trackForMedia(m,preferred=null,create=false){
 const kind=mediaTrackKind(m),p=project();let t=p.tracks.find(t=>t.id===preferred&&t.kind===kind);
 if(!t&&!create)t=p.tracks.find(t=>t.kind===kind&&!t.locked);
 if(!t||create){if(p.tracks.length>=10)throw new Error('A montagem aceita até dez faixas.');t={id:freshId(),kind,locked:false,muted:false,previewVisible:true};p.tracks.push(t);}
 if(t.locked)throw new Error('Desbloqueie esta faixa antes de adicionar uma mídia.');return t;
}
const snapFrame=t=>Math.round(Math.max(0,t)*30)/30;
function project(){return job?.meta?.composition;}
function projectDuration(p=project()){return Math.max(0,...(p?.clips||[]).map(c=>c.at+c.duration));}
function projectClip(){return project()?.clips.find(c=>c.id===compositionSelected);}
function projectMedia(c=projectClip()){return job?.media.find(m=>m.id===c?.mediaId);}
function projectTrack(c=projectClip()){return project()?.tracks.find(t=>t.id===c?.track);}
function clipLocked(c){return !!c?.locked||!!projectTrack(c)?.locked;}
function defaultClip(m,track,at=0,selection=null){
 const video=timedMedia(m),range=selection||sourceSelections.get(m.id);
 const start=video?(range?.in??0):0,audioFit=m.kind==='audio'&&!range&&visualDuration()>at?Math.min(m.duration,visualDuration()-at):null;
 const end=video?(range?.out??(audioFit===null?m.duration:Math.max(.1,audioFit))):0;
 const duration=video?Math.max(1/30,snapFrame(audioFit??(end-start))):snapFrame(range?.duration??(m.role==='logo'?Math.max(1/30,projectDuration()):(project()?.clips.length?5:15)));
 return {id:freshId(),mediaId:m.id,track,at:snapFrame(at),duration,in:start,out:video?end:duration,locked:false,
  settings:{...structuredClone(m.settings),width:project()?.settings.width??1280,height:project()?.settings.height??720}};
}
function ensureProject(){
 if(editorKind!=='video'||!job)return null;
 if(!job.meta)job.meta={editorKind:'video'};
 if(!job.meta.composition){
  const first=job.media[0],track={id:freshId(),kind:mediaTrackKind(first),locked:false,muted:false,previewVisible:first?.settings.previewVisible!==false};
  const savedOutput=first?Object.fromEntries(['width','height','screenPreset','aspectLocked','aspectRatio'].filter(key=>key in first.settings).map(key=>[key,first.settings[key]])):{};
  job.meta.composition={version:1,settings:{...defaults,...dimensions(),...savedOutput,mute:!!first?.settings.mute,targetMB:first?.settings.targetMB??4},tracks:[track],clips:[]};
  if(first){
   if(timedMedia(first)){let at=0;for(const range of (first.kind==='audio'?[{start:0,end:first.duration}]:videoSegments(first))){const c=defaultClip(first,track.id,at,{in:range.start,out:range.end});c.duration=Math.max(1/30,snapFrame((range.end-range.start)/(first.settings.speed||1)));c.locked=!!range.locked;job.meta.composition.clips.push(c);at+=c.duration;}}
   else job.meta.composition.clips.push(defaultClip(first,track.id));
   markDirty();
  }
 }
 for(const t of job.meta.composition.tracks){t.kind??=mediaTrackKind(job.media.find(m=>m.id===job.meta.composition.clips.find(c=>c.track===t.id)?.mediaId));t.muted??=false;}
 if(typeof ensureTimelines==='function')ensureTimelines();
 if(compositionJob!==job.id){stopComposition();stopCompositionFinal();compositionJob=job.id;timelineZoom=timelineZoomByJob.get(job.id)??1;compositionSelected=project().clips[0]?.id??null;compositionCursor=0;releasePlayers(compositionPlayers);releasePlayers(compositionFinalPlayers);sourceSelections.clear();for(const [id,selection] of Object.entries(job.meta.preparedSources||{}))sourceSelections.set(id,selection);}
 if(!project().clips.some(c=>c.id===compositionSelected))compositionSelected=project().clips.find(c=>c.mediaId===active)?.id??project().clips[0]?.id??null;
 return project();
}
current=function(){
 if(editorKind==='video'&&job){const c=projectClip(),m=projectMedia(c);if(c&&m){const output=project().settings;return {...m,settings:{...c.settings,...Object.fromEntries(['width','height','screenPreset','aspectLocked','aspectRatio','mute','targetMB'].filter(key=>key in output).map(key=>[key,output[key]]))}};}if(project()&&job.media[0])return {...job.media[0],settings:{...defaults,...project().settings}};}
 return compositionLegacy.current();
};
function editProject(mutate){if(busy||!ensureProject())return false;stopComposition();undoGesture=null;const before=structuredClone(job.meta);try{editSettings(job.media,()=>{mutate();closeGaps();if(projectDuration()>3600+.001)throw new Error('A montagem deve ter no máximo uma hora.');});}catch(error){job.meta=before;toast(error.message);syncVideo();return false;}markDirty();syncVideo();renderLibrary();drawSoon();return true;}
function closeGaps(){
 const p=project();let covered=0;
 for(const c of p.clips.filter(c=>projectMedia(c)?.kind!=='audio').sort((a,b)=>a.at-b.at)){
  if(c.at>covered+.001){const gap=c.at-covered;for(const later of p.clips.filter(other=>other.at>=c.at-.001)){if(clipLocked(later))throw new Error('Desbloqueie as faixas para encaixar os trechos.');later.at=snapFrame(later.at-gap);}}
  covered=Math.max(covered,c.at+c.duration);
 }
 compositionCursor=Math.min(compositionCursor,projectDuration());
}
function selectProjectClip(id,seek=true){const c=project()?.clips.find(c=>c.id===id);if(!c)return;stopComposition();compositionSelected=id;if(seek)compositionCursor=c.at;selected=new Set([c.mediaId]);activate(c.mediaId);}
function addProjectClip(mediaId,trackId=null,at=null,selection=null,newTrack=false){
 if(busy||!ensureProject())return;const m=job.media.find(m=>m.id===mediaId);if(!m)return;
 if(project().clips.length>=100){toast('A montagem aceita até 100 trechos.');return;}
 let clip;
 const ok=editProject(()=>{const track=trackForMedia(m,trackId,newTrack);clip=defaultClip(m,track.id,at??(m.kind==='audio'?0:visualDuration()),selection);insertClip(clip);compositionSelected=clip.id;compositionCursor=clip.at;});
 if(ok&&clip)selectProjectClip(clip.id);
}
function insertClip(clip,exclude=null){
 const others=project().clips.filter(c=>c.track===clip.track&&c.id!==exclude).sort((a,b)=>a.at-b.at);
 const overlapping=others.find(c=>clip.at<c.at+c.duration-.001&&clip.at+clip.duration>c.at+.001);
 if(overlapping){clip.at=overlapping.at;const moving=others.filter(c=>c.at>=clip.at-.001);if(moving.some(clipLocked))throw new Error('Desbloqueie os trechos desta faixa antes de inserir aqui.');for(const c of moving)c.at=snapFrame(c.at+clip.duration);}
 if(!exclude)project().clips.push(clip);
}
function splitProjectClip(){
 const c=projectClip(),m=projectMedia();if(!c||clipLocked(c))return;
 const minimum=timedMedia(m)?Math.max(1/30,.1*c.duration/(c.out-c.in)):1/30;
 const offset=snapFrame(compositionCursor-c.at);if(offset<minimum-.001||c.duration-offset<minimum-.001){toast('Posicione o cursor dentro do trecho para dividir.');return;}
 if(project().clips.length>=100){toast('Limite de 100 trechos.');return;}
 const id=freshId();editProject(()=>{const second=structuredClone(c),cut=c.in+offset/c.duration*(c.out-c.in);second.id=id;second.at=snapFrame(c.at+offset);second.duration=snapFrame(c.duration-offset);second.in=timedMedia(m)?cut:0;c.out=timedMedia(m)?cut:offset;c.duration=offset;project().clips.push(second);compositionSelected=id;});
 selectProjectClip(id,false);
}
function removeProjectClip(){const c=projectClip();if(!c||clipLocked(c))return;editProject(()=>{project().clips=project().clips.filter(part=>part.id!==c.id);compositionSelected=project().clips[0]?.id??null;project().tracks=project().tracks.filter((t,i)=>i===0||project().clips.some(part=>part.track===t.id));});}
function moveProjectClip(direction){
 const c=projectClip();if(!c||clipLocked(c))return;const row=project().clips.filter(p=>p.track===c.track).sort((a,b)=>a.at-b.at),index=row.findIndex(p=>p.id===c.id),other=row[index+direction];if(!other||clipLocked(other))return;
 editProject(()=>{const first=direction<0?other:c,second=direction<0?c:other,start=first.at;second.at=start;first.at=snapFrame(start+second.duration);});selectProjectClip(c.id,false);
}
function toggleTrack(trackId,property){const t=project()?.tracks.find(t=>t.id===trackId);if(!t)return;editProject(()=>t[property]=!t[property]);}
function setClipRange(which,value){
 const c=projectClip(),m=projectMedia();if(!c||!timedMedia(m)||clipLocked(c)||!Number.isFinite(value))return;
 const rate=(c.out-c.in)/c.duration;
 editProject(()=>{if(which==='in')c.in=Math.max(0,Math.min(c.out-.1,value));else c.out=Math.min(m.duration,Math.max(c.in+.1,value));resizeClip(c,snapFrame((c.out-c.in)/rate));});
}
function resizeClip(c,value){
 const delta=value-c.duration;
 const later=project().clips.filter(part=>part.id!==c.id&&part.track===c.track&&part.at>=c.at+c.duration-.001);
 if(later.some(clipLocked)&&Math.abs(delta)>.001)throw new Error('Desbloqueie a faixa antes de alterar sua duração.');
 for(const part of later)part.at=snapFrame(part.at+delta);c.duration=value;if(!timedMedia(projectMedia(c)))c.out=value;
}
function commitClipDuration(value){
 const c=projectClip(),m=projectMedia();if(!c||clipLocked(c)||!Number.isFinite(value)||value<1/30||value>3600)return;
 if(timedMedia(m)&&((c.out-c.in)/value<.25||(c.out-c.in)/value>4)){toast('Use velocidade entre 0,25× e 4× para este trecho.');syncVideo();return;}
 editProject(()=>resizeClip(c,snapFrame(value)));
}
change=function(patch){
 if(editorKind!=='video')return compositionLegacy.change(patch);
 const c=projectClip();if(busy)return;if(!c){if(project()){editSettings(job.media,()=>Object.assign(project().settings,patch));markDirty();syncVideo();fitStage();}return;}if(clipLocked(c)&&Object.keys(patch).some(k=>!['mute','targetMB'].includes(k))){toast('Desbloqueie a faixa para ajustar este trecho.');return;}
 editSettings(job.media,()=>{Object.assign(c.settings,patch);if(c.settings.lockX)c.settings.x=0;if(c.settings.lockY)c.settings.y=0;for(const key of ['width','height','screenPreset','aspectLocked','aspectRatio','mute','targetMB'])if(key in patch)project().settings[key]=patch[key];});
 markDirty();syncMode();syncLocks();syncLogo();syncVideo();drawSoon();
};

// Place the source library beside the preview; its files remain separate from clips.
const videoTop=document.createElement('div');videoTop.className='video-top';
const library=document.createElement('section');library.id='media-library';library.className='media-library';library.hidden=true;
library.innerHTML='<div class="library-heading"><h3>Suas mídias</h3><button id="library-add" class="secondary" type="button">+ Importar</button></div><p class="help">Arraste para a timeline. Duplo clique para preparar um trecho.</p><div id="library-items" class="library-items"></div><button id="save-composition" class="secondary" type="button">Salvar edição</button>';
const previewArea=document.createElement('div');previewArea.className='video-preview-area';
const canvasColumn=document.querySelector('.canvas-column');canvasColumn.prepend(videoTop);videoTop.append(library,previewArea);
for(const selector of ['.canvas-shell','.canvas-caption','#composition-position','#notes'])previewArea.append(canvasColumn.querySelector(selector));
$('library-add').onclick=()=>$('files').click();$('save-composition').onclick=()=>guard(save);
function renderLibrary(){
 if(editorKind!=='video')return;const list=$('library-items');list.replaceChildren();
 for(const m of job?.media||[]){
  const card=document.createElement('button');card.type='button';card.className='library-card';card.dataset.mediaId=m.id;card.draggable=true;
  const image=document.createElement('img');image.src='/media/'+m.id;image.alt='';image.draggable=false;
  const title=document.createElement('strong');title.textContent=m.name;const type=document.createElement('small');
  const selection=sourceSelections.get(m.id);type.textContent=(timedMedia(m)?seconds(m.duration):m.role==='logo'?'Logo':'Imagem')+(selection?' · seleção pronta':'');
  const badge=document.createElement('span');badge.className='media-type-badge';badge.innerHTML=mediaTypeIcon(m.kind);badge.setAttribute('aria-label',m.kind==='audio'?'Áudio':m.kind==='video'?'Vídeo':'Imagem');card.append(image,badge,title,type);card.title='Duplo clique para preparar; arraste para adicionar à montagem';
  card.onclick=()=>{sourceMediaId=m.id;list.querySelectorAll('.library-card').forEach(c=>c.classList.toggle('selected',c===card));};
  card.ondblclick=()=>openSource(m.id);
  card.ondragstart=e=>{if(busy){e.preventDefault();return;}stopComposition();e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-indoor-source',JSON.stringify({mediaId:m.id,selection:sourceSelections.get(m.id)||null}));};list.append(card);
 }
 $('save-composition').disabled=busy||!dirty;
}
renderGrid=function(){if(editorKind!=='video'){library.hidden=true;return compositionLegacy.renderGrid();}ensureProject();library.hidden=false;renderLibrary();updateCounts();syncVideo();};
updateCounts=function(){
 compositionLegacy.updateCounts();if(editorKind!=='video')return;
 const p=project();$('selection-count').textContent=`${p?.clips.length||0} trecho${p?.clips.length===1?'':'s'} · ${seconds(projectDuration())}`;
 $('open-export').disabled=busy||!p?.clips.length;$('save-composition').disabled=busy||!dirty;
};
syncEditorKind=function(){
 compositionLegacy.syncEditorKind();library.hidden=editorKind!=='video';document.body.classList.toggle('composition-editor',editorKind==='video');
 if(editorKind==='video'){
  $('files').accept='.mp4,.mov,.m4v,.mkv,.avi,.webm,.wmv,.mpg,.mpeg,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.opus,.wma,.aif,.aiff,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.pdf';
  $('empty').querySelector('h2').textContent='Traga seus vídeos, imagens ou áudios.';$('add-files').textContent='Escolher mídias';
  $('empty').querySelector('p:not(.help)').textContent='Adicione vídeos, imagens e áudios à biblioteca para montar seu vídeo.';
  $('empty').querySelector('.help').textContent='Vídeos, imagens, áudios e páginas de PDF · até 100 MB por arquivo';
  document.querySelector('.export-bar > div > span:last-child').textContent='Uma montagem em MP4 · confira o áudio antes de exportar';
 }
};

function pausePool(pool){for(const player of pool.values())player.pause();}
function releasePlayers(pool){for(const player of pool.values()){player.pause();player.removeAttribute('src');player.load();player.remove();}pool.clear();}
const compositionAsset=asset;
asset=function(url){const image=compositionAsset(url),pending=liveAssets.get(url);if(pending&&!pending.complete)pending.onload=()=>{drawSoon();if(editorKind==='video'&&project()&&$('export-dialog').open)renderCompositionCanvas($('final-video-canvas'),compositionFinalTime,true,compositionFinalPlayers,compositionFinalPlaying);};return image;};
function stopComposition(){compositionPlaying=false;cancelAnimationFrame(compositionFrame);pausePool(compositionPlayers);}
function stopCompositionFinal(){compositionFinalPlaying=false;cancelAnimationFrame(compositionFinalFrame);pausePool(compositionFinalPlayers);}
function clipPlayer(clip,m,pool){
 let player=pool.get(clip.id);if(!player){player=document.createElement(m.kind==='audio'?'audio':'video');player.hidden=true;player.playsInline=true;player.preload='auto';player.src=(m.kind==='audio'?'/audio/':'/video/')+m.id;player.frameReady=false;const refresh=()=>{player.frameReady=!player.seeking&&player.readyState>=2;if(pool===compositionPlayers)drawSoon();else if($('export-dialog').open)renderCompositionCanvas($('final-video-canvas'),compositionFinalTime,true,pool,compositionFinalPlaying);};player.onloadeddata=refresh;player.onseeked=refresh;player.onseeking=()=>{player.frameReady=false;};document.body.append(player);pool.set(clip.id,player);}
 return player;
}
const compositionBuffers=new WeakMap();
function renderCompositionCanvas(canvas,time,final=false,pool=compositionPlayers,playing=compositionPlaying){
 const p=final&&typeof exportProject==='function'?exportProject():project();if(!p)return;const s=p.settings,scale=Math.min(1,1280/s.width,1280/s.height),w=Math.round(s.width*scale),h=Math.round(s.height*scale);
 const activeClips=p.clips.filter(c=>time>=c.at-.00001&&time<c.at+c.duration-.00001),order=new Map(p.tracks.map((t,i)=>[t.id,i]));
 for(const [id,player] of pool){if(!activeClips.some(c=>c.id===id))player.pause();}
 const sources=[];let pending=false;
 for(const c of activeClips.sort((a,b)=>order.get(a.track)-order.get(b.track))){
  const m=projectMedia(c),track=p.tracks.find(t=>t.id===c.track);let source;
  if(m.kind!=='audio'&&!final&&track.previewVisible===false){pool.get(c.id)?.pause();continue;}
  if(timedMedia(m)){
   const player=clipPlayer(c,m,pool),rate=(c.out-c.in)/c.duration,sourceTime=Math.min(c.out-.001,c.in+Math.max(0,time-c.at)*rate);
   player.muted=!!s.mute||!m.has_audio||(m.kind==='audio'&&!!track.muted);player.playbackRate=Math.min(4,Math.max(.25,rate));
   if(player.readyState>=1&&!player.seeking&&Math.abs(player.currentTime-sourceTime)>(playing?.15:.0001)){player.frameReady=false;player.currentTime=sourceTime;}
   if(playing&&player.paused&&!player.ended)player.play().catch(()=>{});else if(!playing)player.pause();
   if(m.kind==='audio')continue;
   // A seek changes currentTime before the corresponding frame can be drawn.
   // Retain the committed canvas until every visible source finishes decoding.
   if(player.seeking||!player.frameReady||player.readyState<2)pending=true;
   else source=player;
  }else source=asset('/media/'+m.id);
  if(!source)pending=true;else sources.push({c,m,source});
 }
 if(!final){const c=projectClip();$('safe-guide').hidden=projectMedia(c)?.kind==='audio'||!c?.settings.safe||projectTrack(c)?.previewVisible===false;positionLogo();if(projectMedia(c)?.kind==='audio'||projectTrack(c)?.previewVisible===false)$('logo-handle').hidden=true;}
 if(pending)return;
 let buffer=compositionBuffers.get(canvas);if(!buffer){buffer=document.createElement('canvas');compositionBuffers.set(canvas,buffer);}
 if(buffer.width!==w||buffer.height!==h){buffer.width=w;buffer.height=h;}
 const ctx=buffer.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
 for(const {c,m,source} of sources)drawVideoCanvas({...m,settings:{...c.settings,width:s.width,height:s.height}},source,buffer,m.role==='logo');
 if(!sources.length&&activeClips.some(c=>projectMedia(c)?.kind!=='audio')){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#eeeef4';ctx.fillRect(0,0,w,h);ctx.fillStyle='#64647d';ctx.font=`${Math.max(14,w/40)}px Segoe UI`;ctx.textAlign='center';ctx.fillText('Prévia oculta pelo olho',w/2,h/2);ctx.textAlign='start';}
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const output=canvas.getContext('2d');output.setTransform(1,0,0,1,0,0);output.drawImage(buffer,0,0);
}
drawLive=function(){if(editorKind==='video')return renderCompositionCanvas($('live-preview'),Math.min(compositionCursor,Math.max(0,projectDuration()-1/3000)));compositionLegacy.drawLive();};
function tickComposition(){
 compositionCursor=Math.min(projectDuration(),(performance.now()-compositionStart)/1000);renderCompositionCanvas($('live-preview'),Math.min(compositionCursor,Math.max(0,projectDuration()-1/3000)));syncCompositionPosition();
 if(compositionCursor>=projectDuration())stopComposition();else if(compositionPlaying)compositionFrame=requestAnimationFrame(tickComposition);
}
function toggleCompositionPlayback(){if(!project()?.clips.length)return;if(compositionPlaying)stopComposition();else{if(compositionCursor>=projectDuration())compositionCursor=0;compositionPlaying=true;compositionStart=performance.now()-compositionCursor*1000;tickComposition();}syncCompositionPosition();}
function seekComposition(time){stopComposition();compositionCursor=Math.max(0,Math.min(projectDuration(),time));drawSoon();syncCompositionPosition();}
function syncCompositionPosition(){
 const total=projectDuration();$('montage-scrub').max=Math.max(1/30,total);$('montage-scrub').value=compositionCursor;
 const field=$('montage-current-time');if(document.activeElement!==field)field.value=compositionCursor.toFixed(2).replace('.',',');field.disabled=busy||!pHasClips();
 $('montage-total-time').textContent=seconds(total);$('video-play').textContent=compositionPlaying?'Ⅱ Pausar':'▶ Reproduzir';
 const host=$('layered-timeline'),head=$('montage-playhead');if(head){head.style.left=(126+compositionCursor*timelineScale())+'px';head.style.visibility=compositionCursor*timelineScale()<host.scrollLeft-.5?'hidden':'visible';head.setAttribute('aria-valuenow',compositionCursor);head.setAttribute('aria-valuetext',seconds(compositionCursor));}
 const timeBadge=$('playhead-time');if(timeBadge){timeBadge.textContent=seconds(compositionCursor);const host=$('layered-timeline'),x=126+compositionCursor*timelineScale()-host.scrollLeft;timeBadge.classList.toggle('left-side',x>host.clientWidth-90&&x>216);}
 const c=projectClip(),m=projectMedia(c),minimum=timedMedia(m)?.1*c.duration/(c.out-c.in):1/30;
 $('split-segment').disabled=busy||!c||clipLocked(c)||compositionCursor<c.at+minimum-.001||compositionCursor>c.at+c.duration-minimum+.001;
}
function pHasClips(){return !!project()?.clips.length;}
function timelineBaseScale(){const available=Math.max(350,$('layered-timeline').clientWidth-126);return Math.max(28,available/Math.max(15,projectDuration()));}
function timelineScale(){return Math.min(1200,timelineBaseScale()*timelineZoom);}
function timelineTickStep(scale=timelineScale()){
 const steps=[1/30,2/30,3/30,5/30,10/30,.5,1,2,5,10,15,30,60,120,300,600,1200,1800,3600];
 return steps.find(step=>step*scale>=90)??3600;
}
function renderTimelineRuler(){
 const host=$('layered-timeline'),inner=$('layered-inner'),ruler=inner?.querySelector('.layered-ruler');if(!ruler)return;
 const scale=timelineScale(),span=(parseFloat(inner.style.width)-126)/scale,step=timelineTickStep(),divisions=step<1?(Math.round(step*30)%5===0?5:Math.round(step*30)):5;
 const minor=step/divisions;inner.style.setProperty('--timeline-grid',(minor*scale)+'px');ruler.style.clipPath=`inset(0 0 0 ${host.scrollLeft}px)`;ruler.replaceChildren();
 // Render only the visible ruler plus a small margin, including at frame zoom.
 const first=Math.max(0,Math.floor((host.scrollLeft-126)/scale/step)-1),last=Math.min(Math.floor(span/step),Math.ceil((host.scrollLeft+host.clientWidth)/scale/step)+2);
 for(let i=first;i<=last;i++){
  const t=i*step,mark=document.createElement('span');mark.className='ruler-label';mark.style.left=t*scale+'px';mark.textContent=seconds(t);ruler.append(mark);
  for(let j=0;j<divisions&&t+j*minor<=span;j++){const tick=document.createElement('i');tick.className='ruler-tick'+(j===0?' major':'');tick.style.left=(t+j*minor)*scale+'px';ruler.append(tick);}
 }
}
function zoomTimeline(value,clientX=null){
 if(editorKind!=='video'||busy||!project()||compositionDrag)return;
 const host=$('layered-timeline'),rect=host.getBoundingClientRect(),oldScale=timelineScale();
 const x=Math.max(127,Math.min(host.clientWidth-5,clientX===null?126+compositionCursor*oldScale-host.scrollLeft:clientX-rect.left));
 const anchor=Math.max(0,(host.scrollLeft+x-126)/oldScale),top=host.scrollTop;
 const next=Math.max(1,Math.min(64,Math.max(1,1200/timelineBaseScale()),value));if(Math.abs(next-timelineZoom)<.000001)return;
 timelineZoom=next;timelineZoomByJob.set(job.id,timelineZoom);
 renderLayeredTimeline();host.scrollLeft=126+anchor*timelineScale()-x;host.scrollTop=top;renderTimelineRuler();syncCompositionPosition();
}
function timelinePointer(clientX){const inner=$('layered-inner'),rect=inner.getBoundingClientRect();return snapFrame((clientX-rect.left-126)/timelineScale());}
function snapToCuts(time,exclude=null){
 const edges=[0,...project().clips.filter(c=>c.id!==exclude).flatMap(c=>[c.at,c.at+c.duration])];
 const closest=edges.reduce((best,e)=>Math.abs(e-time)<Math.abs(best-time)?e:best,edges[0]);
 compositionSnap=Math.abs(closest-time)<=10/timelineScale()?closest:null;return compositionSnap??time;
}
function renderLayeredTimeline(){
 timelineZoom=Math.max(1,Math.min(timelineZoom,64,Math.max(1,1200/timelineBaseScale())));
 const p=project();if(!p)return;const host=$('layered-timeline'),scrollLeft=host.scrollLeft,scrollTop=host.scrollTop;host.replaceChildren();const inner=document.createElement('div');inner.id='layered-inner';inner.className='layered-inner';inner.style.width=Math.max(host.clientWidth,126+Math.max(15,projectDuration()+2)*timelineScale())+'px';
 const ruler=document.createElement('div');ruler.className='layered-ruler';ruler.onclick=e=>seekComposition(timelinePointer(e.clientX));
 inner.append(ruler);
 $('timeline-reset-zoom').textContent=Math.round(timelineZoom*100)+'%';
 const newRow=document.createElement('div');newRow.className='new-track-drop';newRow.dataset.newTrack='true';newRow.textContent='↑ Arraste um trecho ou mídia aqui para criar uma nova faixa';wireSourceDrop(newRow,null,true);inner.append(newRow);
 const orderedTracks=[...p.tracks.filter(t=>t.kind!=='audio').reverse(),...p.tracks.filter(t=>t.kind==='audio')];
 orderedTracks.forEach((track)=>{
  const audio=track.kind==='audio',rank=p.tracks.filter(t=>(t.kind==='audio')===audio).findIndex(t=>t.id===track.id)+1,trackName=(audio?'Áudio ':'Vídeo ')+String(rank).padStart(2,'0'),row=document.createElement('div');row.className='composition-track'+(audio?' audio-track':'')+(track.locked?' locked':'');row.dataset.track=track.id;
  const header=document.createElement('div');header.className='track-header';const name=document.createElement('strong');name.textContent=trackName;
  const controls=document.createElement('div');controls.className='track-icons';
  for(const [property,kind,on,label] of [['locked','lock',track.locked,track.locked?'Desbloquear':'Bloquear'],audio?['muted','speaker',track.muted,track.muted?'Tornar audível':'Silenciar']:['previewVisible','eye',track.previewVisible,track.previewVisible?'Ocultar prévia':'Mostrar prévia']]){
   const button=document.createElement('button');button.type='button';button.className='track-property';button.innerHTML=kind==='speaker'?audioIcon(on):propertyIcon(kind,on);button.dataset.property=property;button.setAttribute('aria-label',label+' de '+trackName);button.setAttribute('aria-pressed',String(on));button.dataset.help=property==='locked'?'Protege todos os trechos desta faixa (L)':audio?'Silenciar ou tornar audível esta faixa na prévia e na exportação (E).':'Oculta só a prévia desta faixa. A exportação é mantida (E)';button.onclick=()=>toggleTrack(track.id,property);controls.append(button);
  }header.append(name,controls);row.append(header);
  const lane=document.createElement('div');lane.className='track-lane';lane.dataset.track=track.id;wireSourceDrop(lane,track.id,false);row.append(lane);
  for(const c of p.clips.filter(c=>c.track===track.id)){
   const m=projectMedia(c),block=document.createElement('button');block.type='button';block.className='montage-block layer-clip'+(audio?' audio-clip':'')+(c.id===compositionSelected?' selected':'')+(clipLocked(c)?' locked':'');block.dataset.clip=c.id;block.dataset.mediaId=m.id;block.style.left=c.at*timelineScale()+'px';block.style.width=Math.max(6,c.duration*timelineScale())+'px';block.title=m.name+' · '+seconds(c.duration)+(clipLocked(c)?' · bloqueado':'');block.setAttribute('aria-label',m.name+' na faixa '+rank+', '+seconds(c.duration));block.setAttribute('aria-pressed',String(c.id===compositionSelected));
   const img=document.createElement('img');img.src='/media/'+m.id;img.alt='';img.draggable=false;if(m.kind==='video')segmentThumbnail(m,c.in).then(src=>img.src=src);
   const title=document.createElement('strong');title.textContent=(clipLocked(c)?'🔒 ':'')+m.name;const label=document.createElement('small');label.textContent=seconds(c.duration)+(timedMedia(m)?' · '+seconds(c.in)+' → '+seconds(c.out):m.role==='logo'?' · logo':' · imagem');block.append(audio?audioWaveform(m,c):img,title,label);block.onclick=()=>{if(!compositionDrag)selectProjectClip(c.id);};
   block.onpointerdown=e=>beginClipDrag(e,c);lane.append(block);
  }inner.append(row);
 });
 const bottom=document.createElement('div');bottom.className='timeline-bottom-space';bottom.textContent='As faixas de cima cobrem as de baixo; o olho altera só a prévia.';inner.append(bottom);
 const head=document.createElement('div');head.id='montage-playhead';head.className='montage-playhead';head.tabIndex=0;head.setAttribute('role','slider');head.setAttribute('aria-label','Cursor de reprodução');head.setAttribute('aria-valuemin','0');head.setAttribute('aria-valuemax',projectDuration());const grip=document.createElement('span');grip.className='playhead-grip';const badge=document.createElement('span');badge.id='playhead-time';badge.className='playhead-time';head.append(grip,badge);
 let dragging=false;head.onpointerdown=e=>{if(busy||e.button!==0)return;e.preventDefault();e.stopPropagation();stopComposition();dragging=true;head.setPointerCapture(e.pointerId);};head.onpointermove=e=>{if(dragging)seekComposition(timelinePointer(e.clientX));};head.onpointerup=head.onpointercancel=e=>{dragging=false;if(head.hasPointerCapture(e.pointerId))head.releasePointerCapture(e.pointerId);};inner.append(head);
 const marker=document.createElement('div');marker.id='composition-snap-line';marker.className='composition-snap-line';marker.hidden=true;inner.append(marker);host.append(inner);host.scrollLeft=scrollLeft;host.scrollTop=scrollTop;renderTimelineRuler();syncCompositionPosition();
}
function wireSourceDrop(element,track,newTrack){
 element.ondragover=e=>{if(!e.dataTransfer.types.includes('application/x-indoor-source'))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';element.classList.add('drop-active');const at=snapToCuts(timelinePointer(e.clientX));showSnap(at);};
 element.ondragleave=()=>element.classList.remove('drop-active');
 element.ondrop=e=>{if(!e.dataTransfer.types.includes('application/x-indoor-source'))return;e.preventDefault();e.stopPropagation();element.classList.remove('drop-active');try{const data=JSON.parse(e.dataTransfer.getData('application/x-indoor-source'));addProjectClip(data.mediaId,track,snapToCuts(timelinePointer(e.clientX)),data.selection,newTrack);}catch(error){toast(error.message);}compositionSnap=null;showSnap(null);};
}
function showSnap(time){const marker=$('composition-snap-line');if(!marker)return;marker.hidden=time===null||(time??0)*timelineScale()<$('layered-timeline').scrollLeft;marker.style.left=(126+(time??0)*timelineScale())+'px';}
function beginClipDrag(e,c){
 if(busy||e.button!==0||clipLocked(c))return;stopComposition();compositionDrag={id:c.id,startX:e.clientX,startY:e.clientY,originalAt:c.at,originalTrack:c.track,started:false,at:c.at,targetTrack:c.track,newTrack:false,element:e.currentTarget};e.currentTarget.setPointerCapture(e.pointerId);
}
window.addEventListener('pointermove',e=>{
 const d=compositionDrag;if(!d)return;
 if(!d.started&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<5)return;
 d.started=true;d.element.classList.add('clip-moving');d.element.style.transform=`translate(${e.clientX-d.startX}px,${e.clientY-d.startY}px)`;
 d.at=snapToCuts(snapFrame(d.originalAt+(e.clientX-d.startX)/timelineScale()),d.id);
 const target=[...$('layered-timeline').querySelectorAll('.composition-track,.new-track-drop')].find(row=>{const r=row.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom;});
 d.newTrack=!!target?.dataset.newTrack;d.targetTrack=target?.dataset.track||d.originalTrack;showSnap(d.at);
});
function finishClipDrag(cancel=false){
 const d=compositionDrag;if(!d)return;compositionDrag=null;d.element.classList.remove('clip-moving');d.element.style.transform='';compositionSnap=null;showSnap(null);
 if(d.started&&!cancel){
  const c=project().clips.find(c=>c.id===d.id),target=project().tracks.find(t=>t.id===d.targetTrack);
  if(!d.newTrack&&target?.kind!==mediaTrackKind(projectMedia(c))){toast('Mantenha áudio e vídeo em suas respectivas faixas.');renderLayeredTimeline();return;}
  if(target?.locked){toast('Esta faixa está bloqueada.');return;}if(d.newTrack&&project().tracks.length>=10){toast('Limite de dez faixas.');return;}
  editProject(()=>{if(d.newTrack){const track=trackForMedia(projectMedia(c),null,true);c.track=track.id;}else c.track=d.targetTrack;c.at=d.at;insertClip(c,c.id);project().tracks=project().tracks.filter((t,i)=>i===0||project().clips.some(part=>part.track===t.id));compositionSelected=c.id;compositionCursor=c.at;});
  setTimeout(()=>selectProjectClip(d.id,false),0);
 }
}
window.addEventListener('pointerup',()=>finishClipDrag());window.addEventListener('pointercancel',()=>finishClipDrag(true));

syncVideo=function(){
 if(editorKind!=='video'){stopComposition();$('composition-position').hidden=true;document.body.classList.remove('composition-editor');return compositionLegacy.syncVideo();}
 document.body.classList.add('composition-editor');document.body.classList.remove('video-preview-hidden');videoPlayer.pause();
 const p=ensureProject();$('video-timeline').hidden=!p;$('video-options').hidden=!p;$('composition-position').hidden=!p;library.hidden=false;
 if(!p){syncAudio();return;}
 const c=projectClip(),m=projectMedia(c),video=timedMedia(m),locked=clipLocked(c);
 document.body.classList.toggle('audio-selection',m?.kind==='audio');
 $('montage-summary').textContent=`${p.clips.length} trecho${p.clips.length===1?'':'s'} · ${seconds(projectDuration())}`;$('montage-end').textContent=seconds(projectDuration());
 $('selected-segment').textContent=c?'Ajustar trecho: '+m.name:'Arraste uma mídia da biblioteca para começar';
 $('video-original-info').textContent=m?(video?'Original: '+seconds(m.duration):'Imagem estática'):'';
 $('clip-cut-controls').hidden=!video;$('trim-start-label').hidden=$('trim-end-label').hidden=!video;
 for(const id of ['trim-start','trim-end','trim-start-handle','trim-end-handle']){const input=$(id),max=m?.duration??1;input.max=id.endsWith('handle')?max:Number(max.toFixed(2));input.disabled=!video||locked;const value=id.includes('start')?(c?.in??0):(c?.out??1);input.value=id.endsWith('handle')?value:Number(value.toFixed(2));}
 $('clip-duration').disabled=!c||locked;$('clip-duration').value=c?Number(c.duration.toFixed(2)):'';
 $('duration-final').disabled=!p.clips.length||p.clips.some(clipLocked);$('duration-final').value=Number(projectDuration().toFixed(2));
 $('normal-speed').disabled=!video||locked;$('video-speed').textContent=video?((c.out-c.in)/c.duration).toFixed(2).replace('.',',')+'×':'Imagem';
 $('video-size').value=Number(p.settings.targetMB.toFixed(2));$('video-size-warning').hidden=p.settings.targetMB*8e6/Math.max(.03,projectDuration())>=850000;
 $('video-speed-warning').hidden=!video||(c.out-c.in)/c.duration<=2;
 if(video){$('trim-selection').style.left=c.in/m.duration*100+'%';$('trim-selection').style.width=(c.out-c.in)/m.duration*100+'%';$('timeline-end').textContent=seconds(m.duration);}
 $('remove-segment').disabled=!c||locked;$('segment-left').disabled=!c||locked;$('segment-right').disabled=!c||locked;
 const ordered=[...p.clips].sort((a,b)=>a.at-b.at),index=ordered.findIndex(part=>part.id===c?.id);$('media-prev').disabled=index<=0;$('media-next').disabled=index<0||index>=ordered.length-1;$('media-position').textContent=`${index+1} / ${ordered.length}`;
 renderLayeredTimeline();syncAudio();renderCompositionCanvas($('live-preview'),Math.min(compositionCursor,Math.max(0,projectDuration()-1/3000)));
};
syncAudio=function(){
 if(editorKind!=='video')return compositionLegacy.syncAudio();
 const p=project(),hasAudio=!!p?.clips.some(c=>projectMedia(c)?.has_audio),mute=!!p?.settings.mute;
 for(const id of ['audio-action','export-audio-action']){const b=$(id);b.hidden=false;b.disabled=busy||!hasAudio;b.innerHTML=audioIcon(mute||!hasAudio)+`<span>${mute?'Restaurar áudio':'Remover áudio'}</span>`;b.setAttribute('aria-pressed',String(mute));}
 for(const id of ['audio-status','export-audio-status']){$(id).hidden=false;$(id).innerHTML=audioIcon(mute||!hasAudio)+`<span>${!hasAudio?'Sem faixa de áudio':mute?'Sem áudio':'Com áudio'}</span>`;}
 $('video-export-help').hidden=false;$('video-export-help').textContent='Áudio é uma escolha para toda a montagem. O olho oculta somente a prévia e não retira nenhuma faixa da exportação.';
};
toggleAudio=async function(){
 if(editorKind!=='video'||busy)return;const p=project();if(!p?.clips.some(c=>projectMedia(c)?.has_audio))return;
 editProject(()=>p.settings.mute=!p.settings.mute);
 if($('export-dialog').open){await save();await Promise.all([finalPreview(),refreshPlan()]);}
};
setBusy=function(value){compositionLegacy.setBusy(value);if(value){stopComposition();stopCompositionFinal();}if($('media-library'))$('media-library').inert=value;if(!value&&editorKind==='video')syncVideo();};
showPreview=async function(ticket){if(editorKind!=='video')return compositionLegacy.showPreview(ticket);fitStage();drawSoon();};
$('video-play').onclick=toggleCompositionPlayback;$('montage-scrub').oninput=()=>seekComposition(Number($('montage-scrub').value));
const timeField=$('montage-current-time');
timeField.onfocus=()=>{stopComposition();syncCompositionPosition();timeField.select();};
timeField.onblur=()=>{
 const text=timeField.value.trim().replace(',','.');
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)||!Number.isFinite(Number(text))){toast('Digite o tempo em segundos, como 14,22.');timeField.value=compositionCursor.toFixed(2).replace('.',',');return;}
 seekComposition(Number(text));syncCompositionPosition();
};
timeField.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();timeField.blur();}else if(e.key==='Escape'){e.preventDefault();timeField.value=compositionCursor.toFixed(2).replace('.',',');timeField.blur();}};
$('timeline-reset-zoom').onclick=()=>zoomTimeline(1);
const timelineHost=$('layered-timeline');
timelineHost.dataset.help='Alt + rolagem do mouse: aproximar ou afastar a timeline no ponto sob o mouse.';
timelineHost.addEventListener('wheel',e=>{
 if(!e.altKey||e.ctrlKey||e.metaKey||!e.deltaY||busy||!pHasClips()||compositionDrag||e.buttons)return;
 e.preventDefault();e.stopPropagation();
 const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?timelineHost.clientHeight:1);
 zoomTimeline(timelineZoom*Math.exp(-Math.max(-400,Math.min(400,delta))*.0025),e.clientX);
},{passive:false});
let timelineRulerFrame=0;
timelineHost.addEventListener('scroll',()=>{syncCompositionPosition();if(timelineRulerFrame)return;timelineRulerFrame=requestAnimationFrame(()=>{timelineRulerFrame=0;renderTimelineRuler();});},{passive:true});
$('split-segment').onclick=splitProjectClip;$('remove-segment').onclick=removeProjectClip;
$('add-segment').onclick=()=>{library.scrollIntoView({block:'nearest',behavior:'smooth'});$('library-add').focus();toast('Arraste uma mídia da biblioteca ou dê dois cliques para preparar um trecho.');};
$('segment-left').onclick=()=>moveProjectClip(-1);$('segment-right').onclick=()=>moveProjectClip(1);
for(const [id,key] of [['trim-start','in'],['trim-start-handle','in'],['trim-end','out'],['trim-end-handle','out']])$(id).onchange=()=>setClipRange(key,Number($(id).value));
for(const id of ['trim-start','trim-end','trim-start-handle','trim-end-handle'])$(id).oninput=null;
$('clip-duration').onchange=()=>commitClipDuration(Number($('clip-duration').value));
$('normal-speed').onclick=()=>{const c=projectClip();if(c&&timedMedia(projectMedia(c)))commitClipDuration(c.out-c.in);};
$('duration-final').onchange=()=>{
 const p=project(),total=projectDuration(),value=Number($('duration-final').value);if(!p||value<1/30||value>3600||p.clips.some(clipLocked)){syncVideo();return;}
 const factor=value/total;if(p.clips.some(c=>timedMedia(projectMedia(c))&&((c.out-c.in)/(c.duration*factor)<.25||(c.out-c.in)/(c.duration*factor)>4))){toast('A duração deve manter os vídeos entre 0,25× e 4×. Corte trechos para encurtar mais.');syncVideo();return;}
 editProject(()=>{for(const c of p.clips){c.at=snapFrame(c.at*factor);c.duration=Math.max(1/30,snapFrame(c.duration*factor));if(projectMedia(c).kind==='image')c.out=c.duration;}});
};
$('video-size').onchange=()=>{const value=Number($('video-size').value);if(Number.isFinite(value)&&value>=.1&&value<=1000)editProject(()=>project().settings.targetMB=value);else syncVideo();};
$('audio-action').onclick=$('export-audio-action').onclick=()=>toggleAudio().catch(e=>toast(e.message));

upload=async function(files){
 if(editorKind!=='video'){
  if(!files.length)return;const modal=$('media-import-dialog');$('import-modal-detail').textContent=files.length+' arquivo(s)';modal.showModal();try{await compositionLegacy.upload(files);}finally{modal.close();}return;
 }
 if(!files.length||busy)return;const modal=$('media-import-dialog');$('import-modal-detail').textContent='Preparando '+files.length+' arquivo(s)…';modal.showModal();
 try{await guard(async()=>{
  if(!job)job=await request('/api/jobs',{kind:'video'});ensureProject();markDirty();await save();const failures=[];let firstAdded=false;
  for(let i=0;i<files.length;i++){
   const f=files[i];$('import-modal-detail').textContent=`${i+1} de ${files.length}: ${f.name}`;
   if(f.size>100*1024*1024){failures.push(f.name+': acima de 100 MB.');continue;}
   const known=new Set(job.media.map(m=>m.id));
   try{
    const response=await fetch(`/api/upload?job=${job.id}&revision=${job.revision}&name=${encodeURIComponent(f.name)}`,{method:'POST',headers:{'X-Indoor':'1','Content-Type':'application/octet-stream'},body:f});const data=await response.json();if(!response.ok)throw new Error(data.error);job=data.job;
    if(data.unsupported){failures.push(f.name+': formato não suportado.');continue;}
    const imported=job.media.filter(m=>!known.has(m.id));
    for(const m of imported){if(m.kind==='audio'||(!project().clips.some(c=>projectMedia(c)?.kind!=='audio')&&!firstAdded&&m.kind!=='audio')){if(project().clips.length>=100)throw new Error('A biblioteca recebeu o arquivo; libere um trecho para colocá-lo na timeline.');const t=trackForMedia(m,null,m.kind==='audio'),c=defaultClip(m,t.id);project().clips.push(c);compositionSelected=c.id;active=m.id;selected=new Set([m.id]);if(m.kind!=='audio')firstAdded=true;}}
    markDirty();await save();
   }catch(error){failures.push(f.name+': '+error.message);}
  }
  ensureProject();if(projectClip())activate(projectClip().mediaId);renderGrid();$('unsupported').hidden=!failures.length;$('unsupported').textContent=failures.join('\n');
  if(failures.length)toast(failures.join('\n'));else toast('Mídias adicionadas à biblioteca. Arraste para a timeline ou dê dois cliques para preparar.');
 });}finally{modal.close();$('files').value='';}
};
$('media-import-dialog').addEventListener('cancel',e=>e.preventDefault());
function openSource(id){
 const m=job?.media.find(m=>m.id===id);if(!m||busy)return;stopComposition();sourceMediaId=id;const video=timedMedia(m),range=sourceSelections.get(id);
 $('source-video').classList.toggle('source-audio',m.kind==='audio');
 $('source-name').textContent=m.name;$('source-video').hidden=!video;$('source-image').hidden=video;
 $('source-cut-fields').hidden=!video;$('source-image-duration-label').hidden=video;document.querySelector('.source-markers').hidden=!video;
 if(video){$('source-video').src=(m.kind==='audio'?'/audio/':'/video/')+id;$('source-video').onloadedmetadata=()=>{$('source-video').currentTime=range?.in??0;};$('source-video').load();$('source-in').max=$('source-out').max=Number(m.duration.toFixed(2));$('source-in').value=Number((range?.in??0).toFixed(2));$('source-out').value=Number((range?.out??m.duration).toFixed(2));}
 else{$('source-image').src='/media/'+id;$('source-image-duration').value=Number((range?.duration??5).toFixed(2));}
 $('source-dialog').showModal();
}
function preparedSource(){
 const m=job.media.find(m=>m.id===sourceMediaId);if(timedMedia(m)){const start=Number($('source-in').value),entered=Number($('source-out').value),end=entered===Number(m.duration.toFixed(2))?m.duration:entered;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>m.duration||end-start<.1)throw new Error('Escolha início e fim dentro da mídia, com pelo menos 0,1 segundo.');return {in:start,out:end};}
 const duration=Number($('source-image-duration').value);if(!Number.isFinite(duration)||duration<1/30||duration>3600)throw new Error('Escolha uma duração entre um quadro e uma hora.');return {duration};
}
$('source-mark-in').onclick=()=>$('source-in').value=Number($('source-video').currentTime.toFixed(2));$('source-mark-out').onclick=()=>$('source-out').value=Number($('source-video').currentTime.toFixed(2));
function keepPreparedSource(selection){sourceSelections.set(sourceMediaId,selection);job.meta.preparedSources={...job.meta.preparedSources,[sourceMediaId]:selection};markDirty();renderLibrary();}
$('source-keep').onclick=()=>{try{keepPreparedSource(preparedSource());$('source-dialog').close();toast('Seleção pronta. Arraste esta mídia da biblioteca para a timeline.');}catch(error){toast(error.message);}};
$('source-add').onclick=()=>{try{const selection=preparedSource();keepPreparedSource(selection);$('source-dialog').close();addProjectClip(sourceMediaId,null,null,selection);}catch(error){toast(error.message);}};
$('source-dialog').addEventListener('close',()=>{$('source-video').pause();$('source-video').removeAttribute('src');$('source-video').load();});

openExport=async function(){
 if(editorKind!=='video')return compositionLegacy.openExport();stopComposition();const folder=await chooseFolder();if(!folder)return;await save();exportFolder=folder;exportIds=['composition'];previewIndex=0;
 $('export-name').value=job.meta.template||('VT - '+(job.title==='Nova edição'?'Cliente - Campanha '+dateName():job.title)).slice(0,85);$('format').value='mp4';$('folder-label').textContent=folder;$('overwrite').checked=false;$('overwrite-label').hidden=true;$('export-result').hidden=true;resetCompletion();
 $('export-dialog').showModal();await Promise.all([finalPreview(),refreshPlan()]);syncAudio();
};
exportValues=function(){return editorKind==='video'?{job:job.id,composition:true,template:$('export-name').value,folder:exportFolder,format:'mp4'}:compositionLegacy.exportValues();};
function tickCompositionFinal(){compositionFinalTime=Math.min(projectDuration(exportProject()),(performance.now()-compositionFinalStart)/1000);renderCompositionCanvas($('final-video-canvas'),Math.min(compositionFinalTime,Math.max(0,projectDuration(exportProject())-1/3000)),true,compositionFinalPlayers,compositionFinalPlaying);$('final-video-scrub').value=compositionFinalTime;if(compositionFinalTime>=projectDuration(exportProject()))stopCompositionFinal();else if(compositionFinalPlaying)compositionFinalFrame=requestAnimationFrame(tickCompositionFinal);$('final-video-play').textContent=compositionFinalPlaying?'Ⅱ Pausar':'▶ Reproduzir resultado';}
finalPreview=async function(){
 $('preview-prev').hidden=$('preview-next').hidden=editorKind==='video';
 if(editorKind!=='video')return compositionLegacy.finalPreview();stopCompositionFinal();compositionFinalTime=0;$('final-image').hidden=true;$('final-video-canvas').hidden=false;$('final-video-controls').hidden=false;
 $('preview-index').textContent='Montagem completa';$('final-video-scrub').min=0;$('final-video-scrub').max=projectDuration();$('final-video-scrub').value=0;
 const s=project().settings;$('final-notes').textContent=`${s.width} × ${s.height} px · ${seconds(projectDuration())} · até ${s.targetMB} MB · ${s.mute?'Sem áudio':'Áudio mantido quando presente'}. Todas as faixas participam da exportação, mesmo com o olho fechado.`;
 renderCompositionCanvas($('final-video-canvas'),0,true,compositionFinalPlayers,false);$('final-video-play').textContent='▶ Reproduzir resultado';
};
$('final-video-play').onclick=()=>{if(editorKind!=='video')return;if(compositionFinalPlaying)stopCompositionFinal();else{if(compositionFinalTime>=projectDuration(exportProject()))compositionFinalTime=0;compositionFinalPlaying=true;compositionFinalStart=performance.now()-compositionFinalTime*1000;tickCompositionFinal();}$('final-video-play').textContent=compositionFinalPlaying?'Ⅱ Pausar':'▶ Reproduzir resultado';};
$('final-video-scrub').oninput=()=>{if(editorKind!=='video')return;stopCompositionFinal();compositionFinalTime=Number($('final-video-scrub').value);renderCompositionCanvas($('final-video-canvas'),compositionFinalTime,true,compositionFinalPlayers,false);};
$('export-dialog').addEventListener('close',stopCompositionFinal);

window.addEventListener('keydown',e=>{
 if(e.target.closest?.('[role="separator"],.media-transform-box'))return;
 if(editorKind!=='video'||busy||$('studio').hidden||document.querySelector('dialog[open]')||e.altKey||e.isComposing)return;
 const key=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey,typing=e.target instanceof Element&&e.target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"])');
 if(typing&&!(ctrl&&['z','y'].includes(key)))return;
 let action=null;
 if(ctrl){if(key==='z'||key==='y')action=()=>{stopComposition();undoEdit(key==='y'||e.shiftKey);syncVideo();};else if(key==='s')action=()=>guard(save);else if(key==='e')action=()=>guard(openExport);else if(key==='arrowleft'||key==='arrowright')action=()=>moveProjectClip(key==='arrowleft'?-1:1);}
 else{
  const buttons={c:'split-segment',delete:'remove-segment',a:'add-segment',' ':'video-play',v:'normal-speed',f:'fit-image'};
  if(buttons[key])action=()=>$(buttons[key]).click();
  else if(key==='s')action=()=>{stopComposition();$('layered-timeline').querySelector(`[data-clip="${compositionSelected}"]`)?.focus();};
  else if(key==='l'||key==='e')action=()=>{const t=projectTrack();if(t)toggleTrack(t.id,key==='l'?'locked':t.kind==='audio'?'muted':'previewVisible');};
  else if(key==='m')action=()=>toggleAudio().catch(error=>toast(error.message));
  else if(key==='r'||key==='h')action=()=>document.querySelector(`[data-transform="${key==='r'?(e.shiftKey?'left':'right'):(e.shiftKey?'vertical':'horizontal')}"]`).click();
  else if(key==='g')action=()=>change({safe:!current()?.settings.safe});
  else if(key==='t'||key==='p')action=()=>{const field=$(key==='t'?'duration-final':'video-size');field.focus();field.select();};
  else if(['+','=','-','_'].includes(key))action=()=>change({zoom:Math.max(.1,Math.min(5,(current()?.settings.zoom??1)+(['+','='].includes(key)?.1:-.1)))});
  else if(key==='arrowleft'||key==='arrowright')action=()=>seekComposition(compositionCursor+(key==='arrowleft'?-1:1)*(e.shiftKey?1:1/30));
  else if(key==='i'||key==='o')action=()=>{const c=projectClip();if(c&&timedMedia(projectMedia(c)))setClipRange(key==='i'?'in':'out',c.in+(compositionCursor-c.at)*(c.out-c.in)/c.duration);};
 }
 if(action){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat||['arrowleft','arrowright','+','=','-','_'].includes(key))action();}
},true);
window.addEventListener('resize',()=>{if(editorKind==='video'&&project())renderLayeredTimeline();});
syncEditorKind();
document.querySelectorAll('.montage-tools .shortcut-hint,#normal-speed .shortcut-hint').forEach(el=>el.remove());

const legacyReset=$('reset').onclick,legacyApplySelected=$('apply-selected').onclick,legacyApplyAll=$('apply-all').onclick,legacyLogoFile=$('logo-file').onchange;
$('reset').onclick=()=>{if(editorKind!=='video')return legacyReset();const c=projectClip();if(!c||clipLocked(c))return;editProject(()=>c.settings={...defaults,...dimensions(),logoId:c.settings.logoId,logoScale:c.settings.logoScale??.12,logoX:c.settings.logoX??.97,logoY:c.settings.logoY??.03});activate(c.mediaId);};
function applyClipSettings(all){const c=projectClip();if(!c)return;const geometry=structuredClone(c.settings);editProject(()=>{for(const clip of project().clips.filter(clip=>!clipLocked(clip)&&(all||clip.id===c.id)))clip.settings=structuredClone(geometry);});activate(c.mediaId);toast('Enquadramento aplicado. Cortes e posições na timeline foram preservados.');}
$('apply-selected').onclick=()=>editorKind==='video'?applyClipSettings(false):legacyApplySelected();$('apply-all').onclick=()=>editorKind==='video'?applyClipSettings(true):legacyApplyAll();
$('logo-file').onchange=()=>{
 if(editorKind!=='video')return legacyLogoFile();const file=$('logo-file').files[0],c=projectClip();if(!file||!c||clipLocked(c))return;
 guard(async()=>{
  if(file.size>100*1024*1024)throw new Error('Limite de 100 MB por arquivo.');
  if(project().tracks.length>=10||project().clips.length>=100)throw new Error('Libere uma faixa e um trecho antes de adicionar outra logo.');
  await save();const response=await fetch(`/api/logo?job=${job.id}&revision=${job.revision}&composition=1&name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'X-Indoor':'1','Content-Type':'application/octet-stream'},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);job=result.job;
  const media=job.media.find(m=>m.id===result.mediaId);undoGesture=null;
  editSettings(job.media,()=>{const track={id:freshId(),locked:false,previewVisible:true};project().tracks.push(track);const clip=defaultClip(media,track.id,0);project().clips.push(clip);compositionSelected=clip.id;compositionCursor=0;});
  markDirty();await save();selected=new Set([media.id]);activate(media.id);timelineHost.scrollLeft=timelineHost.scrollTop=0;toast('Logo adicionada à biblioteca e à faixa superior.');
 }).finally(()=>$('logo-file').value='');
};
for(const [id,step] of [['media-prev',-1],['media-next',1]]){const old=$(id).onclick;$(id).onclick=()=>{if(editorKind!=='video')return old();const clips=[...project().clips].sort((a,b)=>a.at-b.at),index=clips.findIndex(c=>c.id===compositionSelected);if(clips[index+step])selectProjectClip(clips[index+step].id);};}
