 'use strict';

const MAX_EDITING_TABS=5,editingTabs=new Map(),lastEditingTab=new Map();
try{const saved=JSON.parse(sessionStorage.getItem('indoor-editing-tabs')||'[]');for(const entry of saved){if(/^[a-f0-9]{32}$/.test(entry.id)&&['image','video'].includes(entry.kind)&&[...editingTabs.values()].filter(t=>t.kind===entry.kind).length<MAX_EDITING_TABS)editingTabs.set(entry.id,{id:entry.id,kind:entry.kind,title:String(entry.title||'Nova edição')});}}catch{}
const editingTabbar=document.createElement('div');editingTabbar.id='editing-tabbar';editingTabbar.innerHTML='<div id="editing-tabs" role="tablist" aria-label="Edições abertas"></div><button id="editing-tab-add" type="button" aria-label="Abrir nova edição" data-help="Abrir outra edição nesta seção.">+</button>';
$('page-title').after(editingTabbar);
const editingSaveStatus=$('save-state').closest('.save-status');document.querySelector('main>header').append(editingSaveStatus);
const tabsLimitDialog=document.createElement('dialog');tabsLimitDialog.id='editing-tabs-limit';tabsLimitDialog.setAttribute('aria-labelledby','editing-tabs-limit-heading');tabsLimitDialog.innerHTML='<div class="dialog-head"><h2 id="editing-tabs-limit-heading">Cinco edições abertas</h2><button type="button" class="close" aria-label="Fechar aviso">×</button></div><p>Esta seção aceita até cinco guias. Feche uma guia pelo × ou crie uma nova edição para começar outro conjunto de guias.</p><p>As edições fechadas continuam disponíveis em Edições recentes.</p><div class="dialog-footer"><button id="editing-tabs-back" type="button" class="secondary">Voltar às guias</button><button id="editing-tabs-restart" type="button" class="primary">Criar nova edição</button></div>';document.body.append(tabsLimitDialog);
tabsLimitDialog.querySelector('.close').onclick=$('editing-tabs-back').onclick=()=>tabsLimitDialog.close();
function tabsForKind(kind=editorKind){return [...editingTabs.values()].filter(t=>t.kind===kind);}
function saveTabList(){try{sessionStorage.setItem('indoor-editing-tabs',JSON.stringify([...editingTabs.values()].map(({id,kind,title})=>({id,kind,title}))));}catch{}}
function rememberEditingTab(){
 if(!job)return;const previous=editingTabs.get(job.id);if(!previous&&tabsForKind().length>=MAX_EDITING_TABS)return;
 if(editorKind==='video'&&project())rememberTimelineView();
 editingTabs.set(job.id,{...previous,id:job.id,kind:editorKind,title:job.title,revision:job.revision,active,selected:[...selected],undo:editHistory.undoStack,redo:editHistory.redoStack});lastEditingTab.set(editorKind,job.id);saveTabList();
}
function renderEditingTabs(){
 editingTabbar.hidden=$('studio').hidden;editingSaveStatus.hidden=$('studio').hidden;const list=$('editing-tabs');list.replaceChildren();
 for(const entry of tabsForKind()){
  const tab=document.createElement('div');tab.className='editing-tab'+(entry.id===job?.id?' active':'');tab.dataset.jobId=entry.id;
  const select=document.createElement('button');select.type='button';select.className='editing-tab-select';select.setAttribute('role','tab');select.setAttribute('aria-selected',String(entry.id===job?.id));select.textContent=entry.title;select.title=entry.title;select.disabled=busy;select.onclick=()=>guard(()=>openEditingTab(entry.id));
  const close=document.createElement('button');close.type='button';close.className='editing-tab-close';close.textContent='×';close.setAttribute('aria-label','Fechar guia '+entry.title);close.dataset.help='Fechar esta guia e manter a edição em Edições recentes.';close.disabled=busy;close.onclick=()=>guard(()=>closeEditingTab(entry.id));
  tab.append(select);if(entry.id===job?.id){tab.append(editionName);editionName.hidden=false;}tab.append(close);list.append(tab);
 }
 $('editing-tab-add').disabled=busy;$('editing-tab-add').dataset.help=tabsForKind().length>=MAX_EDITING_TABS?'Limite de cinco guias. Clique para ver as opções.':'Abrir outra edição nesta seção.';saveTabList();
}
function ensureTabCapacity(kind=editorKind,id=null){if((!id||!editingTabs.has(id))&&tabsForKind(kind).length>=MAX_EDITING_TABS){if(!tabsLimitDialog.open)tabsLimitDialog.showModal();throw new Error('Limite de cinco guias: feche uma ou comece outra edição.');}}
function stopEditingPlayers(){stopComposition();stopCompositionFinal();videoPlayer.pause();finalPlayer.pause();releasePlayers(compositionPlayers);releasePlayers(compositionFinalPlayers);thumbRun++;previewSerial++;finalSerial++;planSerial++;clearTimeout(previewTimer);clearTimeout(planTimer);liveAssets.clear();thumbCache.clear();thumbKeys.clear();segmentThumbs.clear();}
async function openEditingTab(id,kind=null){
 if(job?.id===id){await showView('studio');return;}
 await save();rememberEditingTab();const next=await request('/api/job?id='+encodeURIComponent(id));const targetKind=kind||next.meta?.editorKind||(next.media.some(m=>m.kind==='video'||m.kind==='audio')?'video':'image');ensureTabCapacity(targetKind,id);
 stopEditingPlayers();job=next;editorKind=targetKind;const state=editingTabs.get(id);active=null;selected=new Set(state?.selected??job.media.map(m=>m.id));dirty=false;undoGesture=null;editHistory.clear();historyJob=job.id;
 if(state?.revision===job.revision){editHistory.undoStack=state.undo??[];editHistory.redoStack=state.redo??[];}
 syncEditorKind();renderGrid();if(editorKind==='video'&&project())focusTimeline();else if(job.media.length)activate(job.media.find(m=>m.id===state?.active)?.id??job.media[0].id);else{$('editor-controls').inert=true;$('editing-name').textContent='Selecione uma mídia';syncVideo();updateCounts();}
 $('import-status').hidden=true;$('unsupported').hidden=true;$('save-state').textContent='Edição salva neste PC';await showView('studio');rememberEditingTab();renderEditingTabs();
}
async function closeEditingTab(id){
 if(job?.id===id){await save();rememberEditingTab();const kind=editorKind;editingTabs.delete(id);const next=tabsForKind(kind).at(-1);if(next){job=null;await openEditingTab(next.id,kind);}else{stopEditingPlayers();job=null;active=null;selected.clear();dirty=false;editHistory.clear();historyJob=null;compositionJob=null;timelineScreen=null;editorSessions.delete(kind);lastEditingTab.delete(kind);renderGrid();syncVideo();updateCounts();$('editing-name').textContent='Selecione uma mídia';$('editor-controls').inert=true;$('save-state').textContent='Nenhuma edição aberta';}}
 else editingTabs.delete(id);saveTabList();renderEditingTabs();
}
const tabsBaseRequest=baseRequest;baseRequest=async function(path,body,method){if(path==='/api/jobs'&&body){ensureTabCapacity(body.kind||editorKind);rememberEditingTab();}const result=await tabsBaseRequest(path,body,method);if(path==='/api/jobs'&&body){editingTabs.set(result.id,{id:result.id,kind:body.kind||editorKind,title:result.title});saveTabList();}return result;};
const tabsSave=save;save=async function(){await tabsSave();rememberEditingTab();renderEditingTabs();};
const tabsNewJob=newJob;newJob=async function(){ensureTabCapacity();await save();rememberEditingTab();stopEditingPlayers();await tabsNewJob();rememberEditingTab();renderEditingTabs();};
$('new-job').onclick=$('editing-tab-add').onclick=()=>guard(newJob);
$('editing-tabs-restart').onclick=()=>{tabsLimitDialog.close();guard(async()=>{await save();rememberEditingTab();for(const entry of tabsForKind())editingTabs.delete(entry.id);saveTabList();stopEditingPlayers();job=null;active=null;selected.clear();dirty=false;await newJob();});};
$('recent-list').addEventListener('click',e=>{const card=e.target.closest('.recent-card');if(!card||busy)return;e.preventDefault();e.stopImmediatePropagation();guard(()=>openEditingTab(card.dataset.jobId));},true);
const tabsSwitchEditor=switchEditor;switchEditor=async function(kind,view='studio'){
 if(view!=='studio'||kind===editorKind){await tabsSwitchEditor(kind,view);renderEditingTabs();return;}if(busy)return;
 await guard(async()=>{await save();rememberEditingTab();const target=lastEditingTab.get(kind)||tabsForKind(kind).at(-1)?.id;if(target)await openEditingTab(target,kind);else{stopEditingPlayers();editorKind=kind;job=null;active=null;selected.clear();dirty=false;editHistory.clear();historyJob=null;syncEditorKind();renderGrid();syncVideo();updateCounts();$('editor-controls').inert=true;$('editing-name').textContent='Selecione uma mídia';await showView('studio');}});renderEditingTabs();
};
const tabsSyncVideo=syncVideo;syncVideo=function(){tabsSyncVideo();rememberEditingTab();renderEditingTabs();};
const tabsShowView=showView;showView=async function(view){await tabsShowView(view);renderEditingTabs();};
const tabsSyncName=syncEditionName;syncEditionName=function(){tabsSyncName();if(job&&editingTabs.has(job.id)){editingTabs.get(job.id).title=job.title;}renderEditingTabs();};
const tabsSetBusy=setBusy;setBusy=function(value){tabsSetBusy(value);renderEditingTabs();};
$('editing-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||!e.target.matches('[role=tab]'))return;e.preventDefault();e.stopPropagation();const buttons=[...$('editing-tabs').querySelectorAll('[role=tab]')],i=buttons.indexOf(e.target),n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[n]?.focus();});

// Keep output dimensions available through Custom without duplicating the top controls.
const outputSizeDialog=document.createElement('dialog');outputSizeDialog.id='output-size-dialog';outputSizeDialog.innerHTML='<div class="dialog-head"><h2>Tamanho da tela</h2><button type="button" class="close" aria-label="Fechar">×</button></div><p>Defina as medidas da tela exportada.</p><div class="two-columns"><label>Largura<input id="custom-output-width" type="number" min="64" max="7680"></label><label>Altura<input id="custom-output-height" type="number" min="64" max="7680"></label></div><div class="dialog-footer"><button id="custom-output-cancel" type="button" class="secondary">Cancelar</button><button id="custom-output-apply" type="button" class="primary">Aplicar</button></div>';document.body.append(outputSizeDialog);
const tabsPresetChange=$('preset').onchange;$('preset').onchange=()=>{if(editorKind==='video'&&$('preset').value==='custom'){$('custom-output-width').value=$('width').value;$('custom-output-height').value=$('height').value;outputSizeDialog.showModal();}else tabsPresetChange();};
outputSizeDialog.querySelector('.close').onclick=$('custom-output-cancel').onclick=()=>{outputSizeDialog.close();syncPreset();};outputSizeDialog.addEventListener('cancel',()=>syncPreset());
$('custom-output-apply').onclick=()=>{const w=Number($('custom-output-width').value),h=Number($('custom-output-height').value);if(!Number.isInteger(w)||!Number.isInteger(h)||w<64||h<64||w>7680||h>7680||w*h>20000000||w%2||h%2){toast('Use medidas pares de 64 a 7680 pixels, até 20 milhões de pixels.');return;}$('width').value=w;$('height').value=h;screenPreset='custom';screenLocked=false;screenRatio=w/h;commitDimensions();syncLocks();outputSizeDialog.close();};
for(const axis of ['horizontal','vertical']){const button=document.querySelector(`[data-transform="${axis}"]`);const horizontal=axis==='horizontal';button.innerHTML=horizontal?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5l8 7-8 7z" fill="currentColor"/><path d="m22 5-8 7 8 7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 2v20" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 2 7 8 7-8z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m5 22 7-8 7 8z" fill="currentColor"/><path d="M2 12h20" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/></svg>';button.setAttribute('aria-label','Espelhar '+(horizontal?'horizontalmente':'verticalmente'));button.dataset.help='Espelhar '+(horizontal?'horizontalmente':'verticalmente');}
const fitMedia=$('fit-image').onclick;$('fit-image').onclick=()=>{fitMedia();if(editorKind==='video')change({scaleX:1,scaleY:1,proportionLocked:true});};
rememberEditingTab();renderEditingTabs();

const flipHomes=new Map(),rotationActions=document.createElement('div');rotationActions.className='rotation-actions';
$('clip-rotation').closest('.geometry-row').append(rotationActions);
for(const axis of ['horizontal','vertical']){const button=document.querySelector(`[data-transform="${axis}"]`),anchor=document.createComment('mirror-'+axis);button.before(anchor);flipHomes.set(button,anchor);}
function positionFlipButtons(){for(const [button,anchor] of flipHomes){if(editorKind==='video')rotationActions.append(button);else anchor.after(button);}}
const tabsSyncKind=syncEditorKind;syncEditorKind=function(){tabsSyncKind();positionFlipButtons();};positionFlipButtons();
