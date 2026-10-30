'use strict';

// Import decisions are made before sending files; existing timelines stay intact.
const videoImportChoice=document.createElement('dialog');
videoImportChoice.id='video-import-choice';
videoImportChoice.setAttribute('aria-labelledby','video-import-choice-title');
videoImportChoice.innerHTML=`<div class="dialog-head"><h2 id="video-import-choice-title">Como organizar as imagens e os vídeos?</h2><button class="close" type="button" aria-label="Cancelar importação">×</button></div>
<p id="video-import-choice-summary"></p>
<label class="check"><input type="radio" name="video-import-mode" value="single" checked> Uma timeline — adicionar os arquivos em sequência</label>
<label class="check"><input type="radio" name="video-import-mode" value="separate"> Uma timeline para cada arquivo — editar e exportar separadamente</label>
<p id="video-import-capacity" class="help"></p>
<label class="check"><input id="video-import-enqueue" type="checkbox"> Colocar todas as timelines na fila ao concluir a importação</label>
<p class="help">As timelines existentes são preservadas. Os arquivos continuam disponíveis na biblioteca. Áudios não são separados em timelines.</p>
<div class="dialog-footer"><button id="video-import-back" type="button" class="secondary">Cancelar</button><button id="video-import-proceed" type="button" class="primary">Importar arquivos</button></div>`;
document.body.append(videoImportChoice);
let resolveVideoImport=null;
function finishVideoImport(value){const resolve=resolveVideoImport;resolveVideoImport=null;videoImportChoice.close();resolve?.(value);}
videoImportChoice.querySelector('.close').onclick=$('video-import-back').onclick=()=>finishVideoImport(null);
videoImportChoice.addEventListener('cancel',e=>{e.preventDefault();finishVideoImport(null);});
$('video-import-proceed').onclick=()=>finishVideoImport({mode:videoImportChoice.querySelector('input[name="video-import-mode"]:checked').value,queue:$('video-import-enqueue').checked});
async function chooseVideoTimelineMode(files){
 const count=files.filter(f=>/\.(mp4|mov|m4v|mkv|avi|webm|wmv|mpg|mpeg|jpg|jpeg|png|webp|bmp|tif|tiff)$/i.test(f.name)).length;
 if(!count||count+(job?.media.filter(m=>['video','image'].includes(m.kind)).length||0)<2)return {mode:'library',queue:false};
 if(resolveVideoImport)return null;
 const empty=!!project()&&!project().clips.length;
 const slots=TIMELINE_LIMIT-timelines().length+(empty?1:0);
 const separate=videoImportChoice.querySelector('[value="separate"]');separate.disabled=count>slots;
 videoImportChoice.querySelector('[value="single"]').checked=true;
 $('video-import-enqueue').checked=false;
 $('video-import-choice-summary').textContent=`Você está adicionando ${count} imagem(ns)/vídeo(s). Escolha como quer trabalhar com eles.`;
 $('video-import-capacity').textContent=count>slots?`Há espaço para ${slots} timeline(s) nesta edição (limite de ${TIMELINE_LIMIT}). Para separar todos, use uma nova edição ou importe menos arquivos.`:`Até ${TIMELINE_LIMIT} timelines por edição. Você pode trocar entre elas pelas abas.`;
 return new Promise(resolve=>{resolveVideoImport=resolve;videoImportChoice.showModal();});
}

function appendImportedVideo(media,mode){
 ensureProject();
 if(mode==='separate'&&project().clips.length&&timelines().length>=TIMELINE_LIMIT)throw new Error(timelineLimitMessage);
 const before=structuredClone(job.meta);
 try{
  mutateEdition(()=>{
   if(mode==='separate'){
    if(project().clips.length){
     const t={id:freshId(),name:'',composition:emptyComposition()};
     job.meta.timelines.push(t);job.meta.activeTimeline=t.id;job.meta.composition=t.composition;
    }
    activeTimeline().name=media.name.replace(/\.[^.]+$/,'').replace(/[\x00-\x1f]/g,' ').slice(0,90).trim()||nextTimelineName();
   }
   const p=project();if(p.clips.length>=100)throw new Error('Limite de cem trechos. O arquivo foi mantido na biblioteca.');
   const at=mode==='separate'?0:projectDuration();
   const track=trackForMedia(media,null),clip=defaultClip(media,track.id,at);
   if(at+clip.duration>3600+.001)throw new Error('A timeline deve ter no máximo uma hora. O arquivo foi mantido na biblioteca.');
   p.clips.push(clip);compositionSelected=clip.id;active=media.id;selected=new Set([media.id]);
  });
 }catch(error){job.meta=before;throw error;}
}

// Refresh an already queued timeline instead of adding the same timeline twice.
async function enqueueAllTimelines(){
 ensureTimelines();const candidates=timelines().filter(t=>t.composition.clips.length);
 if(!candidates.length)throw new Error('Adicione imagens ou vídeos às timelines antes de colocá-las na fila.');
 const queue=structuredClone(exportQueue());let number=Math.max(0,...queue.map(q=>q.number));
 const add=candidates.filter(t=>!queue.some(q=>q.timelineId===t.id));
 if(queue.length+add.length>50||number+add.length>999)throw new Error('A fila não tem espaço para todas as timelines. Exporte ou remova itens antes de continuar.');
 for(const t of candidates){
  const existing=queue.filter(q=>q.timelineId===t.id);
  if(existing.length)for(const q of existing){q.name=t.name;q.composition=structuredClone(t.composition);}
  else queue.push({id:freshId(),timelineId:t.id,name:t.name,number:++number,composition:structuredClone(t.composition)});
 }
 const previous=job.meta.exportQueue;
 try{mutateEdition(()=>job.meta.exportQueue=queue);await save();}
 catch(error){job.meta.exportQueue=previous;markDirty();throw error;}
 renderProjectPanels();renderQueue();return candidates.length;
}
const queueAllButton=document.createElement('button');queueAllButton.id='queue-add-all';queueAllButton.type='button';queueAllButton.className='secondary';queueAllButton.textContent='Todas à fila';queueAllButton.dataset.help='Adicionar todas as timelines com conteúdo à fila. Atualiza as que já estão na fila, sem duplicar.';
$('queue-add').after(queueAllButton);
const batchSyncQueueControls=syncQueueControls;
syncQueueControls=function(){batchSyncQueueControls();queueAllButton.disabled=busy||editorKind!=='video'||!timelines().some(t=>t.composition.clips.length);};
syncQueueControls();
queueAllButton.onclick=()=>guard(async()=>{const count=await enqueueAllTimelines();toast(`${count} timeline(s) preparada(s) na fila.`);});

const originalNamesLabel=document.createElement('label');originalNamesLabel.className='check';originalNamesLabel.id='original-video-names-label';originalNamesLabel.hidden=true;
originalNamesLabel.innerHTML='<input id="original-video-names" type="checkbox"> Manter os nomes originais dos arquivos';
const originalNamesHelp=document.createElement('p');originalNamesHelp.className='help';originalNamesHelp.id='original-video-names-help';originalNamesHelp.hidden=true;
originalNamesHelp.textContent='Uma fonte: nome do arquivo original, com saída .mp4. Várias fontes: nome da timeline. Nomes repetidos recebem (2), (3)…';
$('export-name').before(originalNamesLabel,originalNamesHelp);
function syncOriginalVideoNames(){
 const video=editorKind==='video';originalNamesLabel.hidden=originalNamesHelp.hidden=!video;
 $('export-name').disabled=video&&$('original-video-names').checked;
}
$('original-video-names').onchange=()=>{syncOriginalVideoNames();schedulePlan();};
const batchOpenExport=openExport,batchExportValues=exportValues;
openExport=async function(){
 $('original-video-names').checked=!!job?.meta?.originalNames;syncOriginalVideoNames();
 return batchOpenExport();
};
exportValues=function(){const values=batchExportValues();if(editorKind==='video')values.originalNames=$('original-video-names').checked;return values;};
