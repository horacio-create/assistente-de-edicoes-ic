/* Sequenciar altera apenas a posição dos trechos selecionados. */
(function(root){
 function plan(project,ids,media,order='selection'){
  const rows=new Map(media.map(m=>[m.id,m])),chosen=[...new Set(ids)].map(id=>project.clips.find(c=>c.id===id));
  if(chosen.length<2||chosen.some(c=>!c||!['video','image'].includes(rows.get(c.mediaId)?.kind)))throw new Error('Selecione pelo menos dois vídeos ou imagens com Shift ou Ctrl + clique.');
  const ranks=new Map(project.tracks.map((t,i)=>[t.id,project.tracks.length-1-i]));
  if(chosen.some(c=>c.locked||project.tracks.find(t=>t.id===c.track)?.locked))throw new Error('Desbloqueie os trechos e suas faixas antes de organizar.');
  if(order==='tracks')chosen.sort((a,b)=>ranks.get(a.track)-ranks.get(b.track)||a.at-b.at);
  let frame=Math.min(...chosen.map(c=>Math.round(c.at*30)));
  const updates=chosen.map(c=>{const at=frame/30;frame+=Math.round(c.duration*30);return {id:c.id,at};});
  if(frame>3600*30)throw new Error('A sequência ultrapassa o limite de uma hora.');
  const positions=new Map(updates.map(c=>[c.id,c.at]));
  const result=project.clips.map(c=>({...c,at:positions.get(c.id)??c.at}));
  for(const c of result.filter(c=>positions.has(c.id))){
   if(result.some(other=>other.id!==c.id&&!positions.has(other.id)&&other.track===c.track&&c.at<other.at+other.duration-.001&&c.at+c.duration>other.at+.001))throw new Error('Há outro trecho no caminho nesta faixa. Selecione-o também ou mova-o antes de organizar.');
  }
  let covered=0;
  for(const c of result.filter(c=>rows.get(c.mediaId)?.kind!=='audio').sort((a,b)=>a.at-b.at)){
   if(c.at>covered+.001)throw new Error('Essa ordem deixaria um espaço vazio na montagem. Inclua os trechos desse intervalo na seleção.');
   covered=Math.max(covered,c.at+c.duration);
  }
  return updates;
 }
 root.TimelineSequence={plan};
 if(typeof module!=='undefined')module.exports={plan};
 if(typeof document==='undefined')return;

 let chosenClips=new Set(),selectionScope=null,preserveSelection=false;
 const scope=()=>job?.id+':'+job?.meta?.activeTimeline;
 function reconcile(){
  const key=scope();
  if(key!==selectionScope){selectionScope=key;chosenClips.clear();}
  chosenClips=new Set([...chosenClips].filter(id=>project()?.clips.some(c=>c.id===id)));
  if(!preserveSelection&&!chosenClips.has(compositionSelected))chosenClips=new Set(compositionSelected?[compositionSelected]:[]);
 }
 function paint(){
  reconcile();
  for(const block of $('layered-timeline').querySelectorAll('[data-clip]')){
   const selected=chosenClips.has(block.dataset.clip);block.classList.toggle('selected',selected);block.setAttribute('aria-pressed',String(selected));
  }
 }
 const oldRender=renderLayeredTimeline;
 renderLayeredTimeline=function(){oldRender();paint();};
 const oldSelect=selectProjectClip;
 selectProjectClip=function(id,seek=true){if(!preserveSelection)chosenClips=new Set([id]);oldSelect(id,seek);paint();};
 const oldClick=handleClipClick;
 handleClipClick=function(e,c){
  if(e.shiftKey||e.ctrlKey||e.metaKey){
   reconcile();if(chosenClips.has(c.id))chosenClips.delete(c.id);else chosenClips.add(c.id);
   preserveSelection=true;
   try{oldSelect(chosenClips.has(c.id)?c.id:([...chosenClips].at(-1)||c.id),false);}
   finally{preserveSelection=false;}
   // Keep the explicit set: clicking the last selected item can clear it.
   for(const block of $('layered-timeline').querySelectorAll('[data-clip]')){block.classList.toggle('selected',chosenClips.has(block.dataset.clip));block.setAttribute('aria-pressed',String(chosenClips.has(block.dataset.clip)));}
   clipClickPrevious=null;return;
  }
  oldClick(e,c);chosenClips=new Set([c.id]);paint();
 };
 $('layered-timeline').addEventListener('pointerdown',e=>{
  if(e.button===0&&(e.shiftKey||e.ctrlKey||e.metaKey)&&e.target.closest('[data-clip]'))e.stopPropagation();
 },true);

 const menu=document.createElement('div');menu.id='timeline-clip-menu';menu.className='timeline-clip-menu';menu.setAttribute('role','menu');menu.hidden=true;
 menu.innerHTML='<button type="button" role="menuitem">Organizar em escadinha…</button><p>Selecione vídeos ou imagens com Shift ou Ctrl + clique.</p>';document.body.append(menu);
 const dialog=document.createElement('dialog');dialog.id='timeline-sequence-dialog';dialog.setAttribute('aria-labelledby','timeline-sequence-title');
 dialog.innerHTML='<div class="dialog-head"><h2 id="timeline-sequence-title">Organizar trechos em escadinha?</h2><button type="button" class="close" aria-label="Cancelar organização">×</button></div><p id="timeline-sequence-summary"></p><label>Ordem dos trechos<select id="timeline-sequence-order"><option value="selection">Ordem em que selecionei</option><option value="tracks">Ordem das faixas, de cima para baixo</option></select></label><p class="help">Cada trecho começa quando o anterior termina. Os cortes, as durações e as faixas são mantidos. Ctrl + Z desfaz.</p><p id="timeline-sequence-error" class="error" role="alert" hidden></p><div class="dialog-footer"><button type="button" id="timeline-sequence-cancel" class="secondary">Cancelar</button><button type="button" id="timeline-sequence-apply" class="primary">Organizar em escadinha</button></div>';
 document.body.append(dialog);let draft=null;
 dialog.querySelector('.close').onclick=$('timeline-sequence-cancel').onclick=()=>dialog.close();
 const hide=()=>{menu.hidden=true;};
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))hide();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 window.addEventListener('blur',hide);window.addEventListener('resize',hide);
 $('layered-timeline').addEventListener('scroll',hide);
 $('layered-timeline').addEventListener('contextmenu',e=>{
  const block=e.target.closest('[data-clip]');if(!block||busy||editorKind!=='video')return;
  e.preventDefault();reconcile();
  if(!chosenClips.has(block.dataset.clip))selectProjectClip(block.dataset.clip,false);
  const valid=[...chosenClips].filter(id=>['video','image'].includes(projectMedia(project().clips.find(c=>c.id===id))?.kind));
  menu.querySelector('button').disabled=valid.length<2||valid.length!==chosenClips.size;
  menu.hidden=false;menu.style.left=Math.min(e.clientX,Math.max(8,innerWidth-300))+'px';menu.style.top=Math.min(e.clientY,Math.max(8,innerHeight-110))+'px';menu.querySelector('button').focus();
 });
 menu.querySelector('button').onclick=()=>{
  draft={scope:scope(),ids:[...chosenClips]};hide();
  $('timeline-sequence-order').value='selection';$('timeline-sequence-error').hidden=true;
  $('timeline-sequence-summary').textContent=`Organizar ${draft.ids.length} trechos em sequência, a partir do primeiro ponto ocupado pela seleção?`;
  dialog.showModal();
 };
 $('timeline-sequence-apply').onclick=()=>{
  try{
   if(busy||draft?.scope!==scope())throw new Error('A timeline mudou. Selecione os trechos novamente.');
   const updates=plan(project(),draft.ids,job.media,$('timeline-sequence-order').value);
   if(editProject(()=>{for(const item of updates)project().clips.find(c=>c.id===item.id).at=item.at;},{closeGaps:false})){
    dialog.close();paint();toast('Trechos organizados em escadinha. Ctrl + Z desfaz.');
   }
  }catch(error){$('timeline-sequence-error').textContent=error.message;$('timeline-sequence-error').hidden=false;}
 };
})(globalThis);
