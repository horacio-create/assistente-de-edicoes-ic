'use strict';

// The active composition stays compatible with earlier jobs and editor controls.
const TIMELINE_LIMIT=10;
const timelineLimitMessage='Limite de 10 timelines nesta edição. Importe os arquivos restantes em uma nova edição ou exclua as outras 9 timelines e repita a operação.';
function ensureTimelines(){
 if(!job?.meta?.composition)return;
 if(!job.meta.timelines?.length){const id=freshId();job.meta.timelines=[{id,name:'Timeline 01',composition:job.meta.composition}];job.meta.activeTimeline=id;markDirty();}
 const active=job.meta.timelines.find(t=>t.id===job.meta.activeTimeline)||job.meta.timelines[0];
 job.meta.activeTimeline=active.id;active.composition=job.meta.composition;
 job.meta.exportQueue??=[];
}
function timelines(){return job?.meta?.timelines||[];}
function activeTimeline(){return timelines().find(t=>t.id===job.meta.activeTimeline);}
function exportQueue(){return job?.meta?.exportQueue||[];}
function nextTimelineName(){let number=timelines().length+1;while(timelines().some(t=>t.name==='Timeline '+String(number).padStart(2,'0')))number++;return 'Timeline '+String(number).padStart(2,'0');}
function emptyComposition(){return {version:1,settings:structuredClone(project()?.settings||{...defaults,targetMB:4,mute:false}),tracks:[{id:freshId(),kind:'video',locked:false,muted:false,previewVisible:true}],clips:[]};}
function mutateEdition(mutate){undoGesture=null;editSettings(job.media,mutate);markDirty();}
const timelineViews=new Map();let timelineScreen=null,clipClipboard=null,libraryTab='media',queueExportMode=false,timelinePanelSignature=null;
const timelineIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16M4 11h16M4 17h16M8 3v18"/><rect x="11" y="8" width="7" height="5" rx="1"/></svg>';
const trashIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
const scissorsIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 12 12M8 16 20 4"/></svg>';
const libraryTabs=document.createElement('div');libraryTabs.className='library-tabs';libraryTabs.setAttribute('role','tablist');libraryTabs.setAttribute('aria-label','Biblioteca da edição');
libraryTabs.innerHTML='<button id="media-tab" role="tab" type="button" aria-controls="media-panel" data-help="Biblioteca compartilhada. Arraste arquivos do computador para importar e miniaturas para a timeline.">Mídias</button><button id="edition-tab" role="tab" type="button" aria-controls="edition-panel" data-help="Criar, abrir, renomear e excluir as timelines desta edição.">Edição</button>';
const mediaPanel=document.createElement('div');mediaPanel.id='media-panel';mediaPanel.className='library-panel';mediaPanel.setAttribute('role','tabpanel');mediaPanel.setAttribute('aria-labelledby','media-tab');
for(const element of [...library.children])if(element.id!=='save-composition')mediaPanel.append(element);
const editionPanel=document.createElement('div');editionPanel.id='edition-panel';editionPanel.className='library-panel';editionPanel.setAttribute('role','tabpanel');editionPanel.setAttribute('aria-labelledby','edition-tab');editionPanel.hidden=true;
editionPanel.innerHTML='<div class="library-heading"><h3>Timelines</h3><button id="new-timeline" type="button" aria-label="Criar timeline" data-help="Criar uma timeline vazia nesta edição, usando a mesma biblioteca.">+</button></div><div id="timeline-list" class="timeline-list"></div>';
library.prepend(libraryTabs,mediaPanel,editionPanel);
function selectLibraryTab(tab){libraryTab=tab;mediaPanel.hidden=tab!=='media';editionPanel.hidden=tab!=='edition';$('media-tab').setAttribute('aria-selected',String(tab==='media'));$('edition-tab').setAttribute('aria-selected',String(tab==='edition'));}
$('media-tab').onclick=()=>selectLibraryTab('media');$('edition-tab').onclick=()=>selectLibraryTab('edition');selectLibraryTab('media');

const timelineTabs=document.createElement('div');timelineTabs.id='timeline-tabs';timelineTabs.className='timeline-tabs';timelineTabs.setAttribute('role','tablist');timelineTabs.setAttribute('aria-label','Timelines abertas');
timelineToolbar.prepend(timelineTabs);
const timelineBody=document.createElement('div');timelineBody.className='timeline-body';
const timelineRail=document.createElement('div');timelineRail.className='timeline-rail';timelineRail.setAttribute('aria-label','Ferramentas da timeline');
for(const [id,icon,label] of [['split-segment',scissorsIcon,'Dividir aqui'],['remove-segment',trashIcon,'Remover trecho'],['segment-left','<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 12 12 5v5h10v4H12v5Z"/></svg>','Mover trecho para antes'],['segment-right','<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12 12 5v5H2v4h10v5Z"/></svg>','Mover trecho para depois']]){const button=$(id);button.innerHTML=icon;button.setAttribute('aria-label',label);timelineRail.append(button);}
$('add-segment').hidden=true;$('add-segment').setAttribute('aria-hidden','true');
$('add-segment').onclick=()=>{selectLibraryTab('media');$('library-add').focus();};
$('layered-timeline').before(timelineBody);timelineBody.append(timelineRail,$('layered-timeline'));

const renameTimelineDialog=document.createElement('dialog');renameTimelineDialog.id='rename-timeline-dialog';renameTimelineDialog.innerHTML='<h2>Renomear timeline</h2><label for="timeline-name">Nome<input id="timeline-name" maxlength="90"></label><div class="dialog-footer"><button id="timeline-rename-cancel" type="button">Cancelar</button><button id="timeline-rename-confirm" type="button" class="primary">Salvar nome</button></div>';
document.body.append(renameTimelineDialog);let timelineRenameId=null;
function renameTimeline(id){if(busy)return;const t=timelines().find(t=>t.id===id);if(!t)return;timelineRenameId=id;$('timeline-name').value=t.name;renameTimelineDialog.showModal();$('timeline-name').select();}
$('timeline-rename-cancel').onclick=()=>renameTimelineDialog.close();
$('timeline-rename-confirm').onclick=()=>{const name=$('timeline-name').value.trim(),t=timelines().find(t=>t.id===timelineRenameId);if(!t||!name||/[\x00-\x1f]/.test(name)){toast('Escreva um nome para a timeline.');return;}mutateEdition(()=>t.name=name);renameTimelineDialog.close();renderProjectPanels();};
$('timeline-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('timeline-rename-confirm').click();}};
function rememberTimelineView(){if(timelineScreen)timelineViews.set(timelineScreen,{cursor:compositionCursor,selected:compositionSelected,zoom:timelineZoom,left:timelineHost.scrollLeft,top:timelineHost.scrollTop});}
function resetTimelineView(){
 const key=job.id+':'+job.meta.activeTimeline;if(timelineScreen===key)return;
 timelineScreen=key;const view=timelineViews.get(key);stopComposition();stopCompositionFinal();releasePlayers(compositionPlayers);releasePlayers(compositionFinalPlayers);
 compositionSelected=view?.selected??project().clips[0]?.id??null;compositionCursor=Math.min(view?.cursor??0,projectDuration());timelineZoom=view?.zoom??1;
 const canvas=$('live-preview'),context=canvas.getContext('2d');context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
 timelineHost.scrollLeft=view?.left??0;timelineHost.scrollTop=view?.top??0;
}
function focusTimeline(){const c=projectClip();active=c?.mediaId??job.media[0]?.id??null;selected=new Set(c?[c.mediaId]:[]);if(active)activate(active);else syncVideo();updateCounts();requestAnimationFrame(fitStage);}
function switchTimeline(id){if(busy||id===job?.meta?.activeTimeline)return;const t=timelines().find(t=>t.id===id);if(!t)return;rememberTimelineView();job.meta.activeTimeline=id;job.meta.composition=t.composition;markDirty();focusTimeline();}
function createTimeline(){
 if(busy||!ensureProject())return;if(timelines().length>=TIMELINE_LIMIT){toast(timelineLimitMessage);return;}
 rememberTimelineView();mutateEdition(()=>{const t={id:freshId(),name:nextTimelineName(),composition:emptyComposition()};job.meta.timelines.push(t);job.meta.activeTimeline=t.id;job.meta.composition=t.composition;});focusTimeline();
}
function deleteTimeline(id){
 if(busy||!timelines().some(t=>t.id===id))return;rememberTimelineView();
 mutateEdition(()=>{job.meta.timelines=timelines().filter(t=>t.id!==id);if(!timelines().length)job.meta.timelines=[{id:freshId(),name:'Timeline 01',composition:emptyComposition()}];if(job.meta.activeTimeline===id){job.meta.activeTimeline=timelines()[0].id;job.meta.composition=timelines()[0].composition;}});
 focusTimeline();toast('Timeline removida. Ctrl + Z desfaz. Os itens da fila foram preservados.');
}
$('new-timeline').onclick=createTimeline;
function renderProjectPanels(){
 if(editorKind!=='video'||!job?.meta?.composition)return;ensureTimelines();
 const signature=JSON.stringify([job.id,timelines().map(t=>[t.id,t.name])]);
 if(signature===timelinePanelSignature){
  for(const row of $('timeline-list').children)row.querySelector('.timeline-item').setAttribute('aria-pressed',String(row.dataset.timelineId===job.meta.activeTimeline));
  for(const tab of timelineTabs.querySelectorAll('[data-timeline-id]'))tab.setAttribute('aria-selected',String(tab.dataset.timelineId===job.meta.activeTimeline));
  $('new-timeline').disabled=busy||timelines().length>=TIMELINE_LIMIT;syncQueueControls();return;
 }
 timelinePanelSignature=signature;
 const list=$('timeline-list');list.replaceChildren();timelineTabs.replaceChildren();
 for(const t of timelines()){
  const row=document.createElement('div');row.className='timeline-entry';row.dataset.timelineId=t.id;
  const button=document.createElement('button');button.type='button';button.className='timeline-item';button.innerHTML=timelineIcon;const name=document.createElement('span');name.textContent=t.name;button.append(name);button.setAttribute('aria-pressed',String(t.id===job.meta.activeTimeline));button.dataset.help='Abrir '+t.name+'. Dois cliques para renomear.';button.onclick=()=>switchTimeline(t.id);button.ondblclick=()=>renameTimeline(t.id);
  const remove=document.createElement('button');remove.type='button';remove.className='timeline-delete';remove.innerHTML=trashIcon;remove.setAttribute('aria-label','Excluir '+t.name);remove.dataset.help='Excluir esta timeline. As mídias e os itens da fila são preservados; Ctrl + Z desfaz.';remove.onclick=()=>deleteTimeline(t.id);row.append(button,remove);list.append(row);
  const tab=document.createElement('button');tab.type='button';tab.className='timeline-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(t.id===job.meta.activeTimeline));tab.dataset.timelineId=t.id;tab.innerHTML=timelineIcon;const text=document.createElement('span');text.textContent=t.name;tab.append(text);tab.dataset.help='Abrir '+t.name+'. Dois cliques para renomear.';tab.onclick=()=>switchTimeline(t.id);tab.ondblclick=()=>renameTimeline(t.id);timelineTabs.append(tab);
 }
 const add=document.createElement('button');add.type='button';add.id='timeline-tab-add';add.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14"/></svg>';add.setAttribute('aria-label','Criar timeline');add.dataset.help='Criar uma timeline vazia.';add.onclick=createTimeline;timelineTabs.append(add);
 $('new-timeline').disabled=busy||timelines().length>=TIMELINE_LIMIT;syncQueueControls();
}

// File drops import into the shared library; internal clip drags keep their behavior.
let mediaDropDepth=0;
library.addEventListener('dragenter',e=>{if(!e.dataTransfer.types.includes('Files')||busy)return;e.preventDefault();mediaDropDepth++;library.classList.add('file-drop');});
library.addEventListener('dragleave',()=>{if(--mediaDropDepth<=0){mediaDropDepth=0;library.classList.remove('file-drop');}});
library.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')&&!busy){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
library.addEventListener('drop',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();e.stopPropagation();mediaDropDepth=0;library.classList.remove('file-drop');selectLibraryTab('media');upload([...e.dataTransfer.files]);});
$('studio').addEventListener('drop',e=>{if(editorKind!=='video'||busy||e.defaultPrevented||!e.dataTransfer.types.includes('Files'))return;e.preventDefault();e.stopPropagation();selectLibraryTab('media');upload([...e.dataTransfer.files]);});

window.addEventListener('keydown',e=>{
 if(editorKind!=='video'||busy||$('studio').hidden||document.querySelector('dialog[open]')||!(e.ctrlKey||e.metaKey)||e.altKey||e.isComposing||e.target.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])'))return;
 const key=e.key.toLowerCase();if(!['c','v'].includes(key))return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
 if(key==='c'){const c=projectClip();if(c){clipClipboard={jobId:job.id,clip:structuredClone(c)};toast('Trecho copiado. Ctrl + V cola nesta ou em outra timeline.');}return;}
 if(!clipClipboard)return;if(clipClipboard.jobId!==job.id){toast('Copie um trecho desta edição para colar.');return;}
 if(project().clips.length>=100){toast('Limite de cem trechos nesta timeline.');return;}
 const copy=structuredClone(clipClipboard.clip);copy.id=freshId();copy.track=null;copy.at=snapFrame(compositionCursor);copy.locked=false;
 if(editProject(()=>{copy.track=trackForMedia(projectMedia(copy),projectTrack()?.id).id;insertClip(copy);compositionSelected=copy.id;compositionCursor=copy.at;}))selectProjectClip(copy.id,false);
},true);

const queueActions=document.createElement('div');queueActions.className='queue-actions';queueActions.hidden=true;
const queueStackIcon='<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="white" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><rect x="1.5" y="2" width="23" height="20" rx="1.5"/><rect x="4.5" y="5" width="23" height="20" rx="1.5"/><rect x="7.5" y="8" width="23" height="22" rx="1.5"/></g><circle cx="14" cy="14" r="2.8" fill="currentColor"/><path d="m9 27 4-5 2 2 3-4 3 3 4-7 4 6v5z" fill="currentColor"/></svg>';
const queueAddIcon='<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="white" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><rect x="1.5" y="2" width="23" height="18" rx="1.5"/><rect x="5.5" y="6" width="23" height="18" rx="1.5"/></g><circle cx="11.5" cy="11.5" r="2.6" fill="currentColor"/><path d="m7 22 4-5 2 2 3-4 3 3 4-7 4 7v4z" fill="currentColor"/><circle cx="25" cy="24.5" r="6.7" fill="currentColor" stroke="white" stroke-width="1"/><path d="M23.8 21h2.4v2.3h2.3v2.4h-2.3V28h-2.4v-2.3h-2.3v-2.4h2.3z" fill="white"/></svg>';
queueActions.innerHTML='<button id="queue-add" type="button" class="secondary" data-help="Guardar uma cópia da timeline atual na fila. Você pode continuar editando antes de exportar.">'+queueAddIcon+'<span>Adicionar à fila</span></button><button id="queue-open" type="button" aria-label="Ver fila de exportação" data-help="Conferir ou remover os vídeos que esperam na fila.">'+queueStackIcon+'<span>Fila</span><span id="queue-count" hidden></span></button>';
$('open-export').querySelector('span').innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12 12 5v5H2v4h10v5Z" transform="rotate(-45 12 12)"/></svg>';
$('open-export').before(queueActions);
const queueDialog=document.createElement('dialog');queueDialog.id='queue-dialog';queueDialog.innerHTML='<div class="dialog-head"><h2>Fila de exportação</h2><button id="queue-close" type="button" class="close" aria-label="Fechar fila">×</button></div><div id="queue-list"></div><div class="dialog-footer"><button id="queue-export" type="button" class="primary">Exportar fila</button></div>';
document.body.append(queueDialog);
function syncQueueControls(){const video=editorKind==='video';queueActions.hidden=!video;$('queue-count').textContent=String(exportQueue().length);$('queue-count').hidden=!exportQueue().length;$('queue-add').disabled=busy||!project()?.clips.length||exportQueue().length>=50;$('queue-open').disabled=busy;$('queue-export').disabled=busy||!exportQueue().length;if(video){$('open-export').disabled=busy||(!project()?.clips.length&&!exportQueue().length);$('open-export').dataset.help=exportQueue().length?'Revisar e exportar os '+exportQueue().length+' vídeos da fila em sequência (Ctrl + E).':'Revisar e exportar a timeline atual (Ctrl + E).';}}
function renderQueue(){
 const list=$('queue-list');list.replaceChildren();
 for(const item of exportQueue()){
  const row=document.createElement('div');row.className='queue-entry';row.dataset.queueId=item.id;const text=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent='VT '+String(item.number).padStart(2,'0')+' · '+item.name;const s=item.composition.settings;detail.append(document.createTextNode(seconds(projectDuration(item.composition))+' · '+s.width+' × '+s.height+' · '));const audioState=document.createElement('strong');audioState.className='queue-audio-state';audioState.textContent=s.mute?'Sem áudio':'Áudio mantido';detail.append(audioState);text.append(name,detail);
  const remove=document.createElement('button');remove.type='button';remove.innerHTML=trashIcon;remove.setAttribute('aria-label','Remover VT '+String(item.number).padStart(2,'0')+' da fila');remove.dataset.help='Retirar da fila. A timeline continua na edição.';remove.onclick=()=>guard(async()=>{mutateEdition(()=>job.meta.exportQueue=exportQueue().filter(q=>q.id!==item.id));await save();renderQueue();});row.append(text,remove);list.append(row);
 }
 if(!exportQueue().length){const empty=document.createElement('p');empty.textContent='Nenhum vídeo na fila.';list.append(empty);}syncQueueControls();
}
$('queue-close').onclick=()=>queueDialog.close();$('queue-open').onclick=()=>{renderQueue();queueDialog.showModal();};
$('queue-add').onclick=()=>guard(async()=>{
 if(!project()?.clips.length)throw new Error('Adicione uma mídia à timeline antes de colocá-la na fila.');if(exportQueue().length>=50)throw new Error('A fila aceita até cinquenta vídeos.');if(exportQueue().some(q=>q.number>=999))throw new Error('Exporte ou esvazie a fila antes de iniciar outra numeração.');
 const snapshot=structuredClone(project()),timeline=activeTimeline();mutateEdition(()=>job.meta.exportQueue.push({id:freshId(),timelineId:timeline.id,name:timeline.name,number:Math.max(0,...exportQueue().map(q=>q.number))+1,composition:snapshot}));
 await save();renderProjectPanels();toast('Timeline adicionada à fila. Você pode continuar editando ou criar outra.');
});
function exportProject(){return queueExportMode?(exportQueue()[previewIndex]?.composition??project()):project();}
const projectOpenExport=openExport,projectExportValues=exportValues,projectFinalPreview=finalPreview;
openExport=async function(){
 if(editorKind!=='video'||!exportQueue().length){queueExportMode=false;return projectOpenExport();}
 stopComposition();const folder=await chooseFolder();if(!folder)return;await save();exportFolder=folder;queueExportMode=true;exportIds=exportQueue().map(q=>q.id);previewIndex=0;
 $('export-name').value=job.meta.template||('VT - '+job.title).slice(0,85);$('format').value='mp4';$('folder-label').textContent=folder;$('overwrite').checked=false;$('overwrite-label').hidden=true;$('export-result').hidden=true;resetCompletion();$('export-dialog').showModal();await Promise.all([finalPreview(),refreshPlan()]);syncAudio();
};
exportValues=function(){return editorKind==='video'&&queueExportMode?{job:job.id,queue:true,template:$('export-name').value,folder:exportFolder,format:'mp4'}:projectExportValues();};
finalPreview=async function(){
 if(!queueExportMode)return projectFinalPreview();stopCompositionFinal();releasePlayers(compositionFinalPlayers);compositionFinalTime=0;const p=exportProject(),item=exportQueue()[previewIndex];if(!item)return;
 $('preview-prev').hidden=$('preview-next').hidden=exportQueue().length<2;$('final-image').hidden=true;$('final-video-canvas').hidden=false;$('final-video-controls').hidden=false;
 $('preview-index').textContent=(previewIndex+1)+' / '+exportQueue().length+' · '+item.name;$('final-video-scrub').min=0;$('final-video-scrub').max=projectDuration(p);$('final-video-scrub').value=0;
 const s=p.settings;$('final-notes').textContent=s.width+' × '+s.height+' px · '+seconds(projectDuration(p))+' · até '+s.targetMB+' MB · '+(s.mute?'Sem áudio':'Áudio mantido quando presente');renderCompositionCanvas($('final-video-canvas'),0,true,compositionFinalPlayers,false);$('final-video-play').textContent='▶ Reproduzir resultado';
};
$('queue-export').onclick=()=>{queueDialog.close();guard(openExport);};
$('export-dialog').addEventListener('close',()=>{queueExportMode=false;releasePlayers(compositionFinalPlayers);});
const queueRequest=request;
request=async function(path,body,method){
 const exportingQueue=path==='/api/export'&&queueExportMode;
 const result=await queueRequest(path,body,method);
 if(exportingQueue&&result.job){job=result.job;dirty=false;$('save-state').textContent='Edição salva neste PC';ensureTimelines();syncQueueControls();}
 return result;
};
const projectSyncVideo=syncVideo;
syncVideo=function(){
 if(editorKind==='video'&&job){ensureProject();resetTimelineView();}projectSyncVideo();
 const logoSection=document.querySelector('#editor .logo-settings');logoSection.hidden=editorKind==='video';logoSection.previousElementSibling.hidden=editorKind==='video';
 if(editorKind==='video'){renderProjectPanels();if(!projectClip()&&activeTimeline())$('editing-name').textContent=activeTimeline().name;}
};
const projectSyncAudio=syncAudio;
syncAudio=function(){projectSyncAudio();if(queueExportMode)$('export-audio-action').hidden=true;syncQueueControls();};
const projectUpdateCounts=updateCounts;
updateCounts=function(){projectUpdateCounts();syncQueueControls();};
const projectSave=save;
save=async function(){if(editorKind==='video'&&job?.meta?.composition)ensureTimelines();return projectSave();};
const projectSetBusy=setBusy;
setBusy=function(value){projectSetBusy(value);queueActions.inert=value;syncQueueControls();};
syncQueueControls();


const reuseReportDialog=document.createElement('dialog');reuseReportDialog.id='reuse-timelines-dialog';
reuseReportDialog.innerHTML='<div class="dialog-head"><h2>Ajustes reutilizados</h2><button type="button" class="close" aria-label="Fechar resumo">×</button></div><p id="reuse-timelines-summary"></p><div id="reuse-timelines-details"></div><p class="help">Ctrl + Z desfaz esta operação. Para os arquivos que ultrapassam o limite de 10 timelines, importe-os em uma nova edição ou exclua as outras 9 timelines e repita a operação.</p>';
document.body.append(reuseReportDialog);reuseReportDialog.querySelector('.close').onclick=()=>reuseReportDialog.close();
$('apply-all').dataset.help='Usar a timeline aberta como modelo nas demais: enquadramento, cortes, duração e camadas. Com uma única timeline, preparar uma por arquivo, até 10. Os itens correspondentes da fila também são atualizados.';
const timelineApplyAll=$('apply-all').onclick;
$('apply-all').onclick=()=>{
 if(editorKind!=='video')return timelineApplyAll();
 guard(async()=>{
  if(!activeTimeline())throw new Error('Abra uma timeline para usar como modelo.');
  stopComposition();
  const result=await request('/api/reuse-timelines',{job:job.id,revision:job.revision,meta:job.meta});
  mutateEdition(()=>job.meta=result.meta);syncVideo();renderLibrary();drawSoon();await save();renderProjectPanels();
  const r=result.report;$('reuse-timelines-summary').textContent=`Modelo: ${activeTimeline().name}. Aplicado a ${r.applied.length} arquivo(s); ${r.created.length} timeline(s) criada(s). ${r.queueUpdated} item(ns) da fila atualizado(s).`;
  const details=$('reuse-timelines-details');details.replaceChildren();
  for(const a of r.adjusted){const p=document.createElement('p');p.textContent=`${a.name}: ${a.direction} — ${seconds(a.before)} → ${seconds(a.after)} (modelo: ${seconds(a.model)}).`;details.append(p);}
  for(const a of r.skipped){const p=document.createElement('p');p.textContent=`Não aplicado: ${a.name}. ${a.reason}`;details.append(p);}
  reuseReportDialog.showModal();
 });
};
