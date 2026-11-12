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
 let suppressClick=false;  // o clique que encerra um arraste em grupo não deve desfazer a seleção
 handleClipClick=function(e,c){
  if(suppressClick){suppressClick=false;return;}
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

 /* Ferramenta Seleção: vários trechos por Shift/Ctrl + clique, por caixa (arrastar numa área vazia) ou Ctrl + A;
    Delete remove todos e arrastar um deles move o grupo inteiro. */
 const host=$('layered-timeline');
 const tool=document.createElement('button');tool.type='button';tool.id='timeline-select-tool';tool.className='text-button timeline-select-tool';
 tool.setAttribute('aria-pressed','true');tool.setAttribute('aria-label','Seleção');
 tool.dataset.help='Seleção: clique para escolher um trecho. Para vários, use Shift ou Ctrl + clique, arraste numa área vazia da faixa ou Ctrl + A. Delete remove e arrastar move todos juntos.';
 tool.innerHTML=icon('pointer')+'<span class="timeline-select-count" hidden></span>';
 document.querySelector('.timeline-rail')?.prepend(tool);
 tool.onclick=()=>toast('Seleção: Shift ou Ctrl + clique, ou arraste numa área vazia da faixa para escolher vários trechos.');
 function showCount(){const n=chosenClips.size,badge=tool.querySelector('.timeline-select-count');badge.hidden=n<2;badge.textContent=n;tool.setAttribute('aria-label',n>1?`Seleção: ${n} trechos selecionados`:'Seleção');}
 const basePaint=paint;paint=function(){basePaint();showCount();};
 function setChosen(ids){
  chosenClips=new Set(ids);const last=ids.at(-1);
  if(last){preserveSelection=true;try{oldSelect(last,false);}finally{preserveSelection=false;}}
  paint();
 }
 const chosenClipList=()=>{reconcile();return [...chosenClips].map(id=>project().clips.find(c=>c.id===id)).filter(Boolean);};

 // Remover: com vários selecionados, remove todos os que não estão bloqueados, num único passo de desfazer
 const oldRemove=removeProjectClip;
 removeProjectClip=function(){
  const all=chosenClipList();if(all.length<2)return oldRemove();
  const free=all.filter(c=>!clipLocked(c));if(!free.length){toast('Os trechos selecionados estão bloqueados.');return;}
  const ids=new Set(free.map(c=>c.id));
  if(editProject(()=>{project().clips=project().clips.filter(c=>!ids.has(c.id));compositionSelected=project().clips[0]?.id??null;project().tracks=project().tracks.filter((t,i)=>i===0||project().clips.some(c=>c.track===t.id));})){
   chosenClips=new Set(compositionSelected?[compositionSelected]:[]);paint();
   toast(`${ids.size} trechos removidos${all.length>ids.size?'; os bloqueados ficaram':''}. Ctrl + Z desfaz.`);
  }
 };
 $('remove-segment').onclick=removeProjectClip;

 // Mover em grupo: arrastar um trecho já selecionado (com outros) leva todos juntos, cada um na sua faixa
 let group=null;
 const oldBegin=beginClipDrag;
 beginClipDrag=function(e,c){
  reconcile();
  if(busy||e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey||chosenClips.size<2||!chosenClips.has(c.id))return oldBegin(e,c);
  const clips=chosenClipList().filter(k=>!clipLocked(k));if(!clips.length)return;
  stopComposition();
  group={startX:e.clientX,started:false,delta:0,clips:clips.map(k=>({id:k.id,at:k.at,el:host.querySelector(`[data-clip="${k.id}"]`)}))};
  e.currentTarget.setPointerCapture(e.pointerId);
 };
 window.addEventListener('pointermove',e=>{
  if(!group)return;const dx=e.clientX-group.startX;
  if(!group.started&&Math.abs(dx)<5)return;group.started=true;
  const first=Math.min(...group.clips.map(k=>k.at));let delta=Math.round(dx/timelineScale()*30)/30;if(first+delta<0)delta=-first;group.delta=delta;  // snapFrame não aceita negativos: o deslocamento é arredondado ao quadro aqui
  for(const k of group.clips)if(k.el){k.el.classList.add('clip-moving');k.el.style.transform=`translateX(${delta*timelineScale()}px)`;}
  showSnap(first+delta);
 });
 function endGroup(cancel){
  const g=group;if(!g)return;group=null;
  for(const k of g.clips)if(k.el){k.el.classList.remove('clip-moving');k.el.style.transform='';}
  showSnap(null);if(!g.started)return;
  suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
  if(cancel||!g.delta)return;
  // Mesma regra do arraste de um trecho só: o grupo é inserido onde foi solto (mantendo a ordem e os espaços
  // entre os seus trechos) e os demais da faixa são empurrados; depois a montagem fecha os buracos.
  const ids=new Set(g.clips.map(k=>k.id)),keep=[...chosenClips];
  if(editProject(()=>{
   const p=project(),moving=p.clips.filter(c=>ids.has(c.id)).sort((a,b)=>a.at-b.at);
   p.clips=p.clips.filter(c=>!ids.has(c.id));
   for(const c of moving){c.at=snapFrame(Math.max(0,c.at+g.delta));insertClip(c);}  // insertClip já devolve o trecho à lista
  })){chosenClips=new Set(keep.filter(id=>project().clips.some(c=>c.id===id)));paint();}
  else renderLayeredTimeline();
 }
 window.addEventListener('pointerup',()=>endGroup(false));window.addEventListener('pointercancel',()=>endGroup(true));

 // Caixa de seleção: arrastar a partir de uma área vazia de uma faixa
 let box=null;
 host.addEventListener('pointerdown',e=>{
  // começa em qualquer área vazia da timeline: faixa, linha "Nova faixa" ou o espaço abaixo; nunca na régua, no cursor, nos trechos ou nos botões das faixas
  if(e.button!==0||busy||editorKind!=='video'||e.target.closest('[data-clip],.layered-ruler,.montage-playhead,.track-header,.timeline-veiculacao,button,input,select'))return;
  const inner=$('layered-inner');if(!inner)return;const r=inner.getBoundingClientRect(),add=e.shiftKey||e.ctrlKey||e.metaKey;
  reconcile();box={x:e.clientX-r.left,y:e.clientY-r.top,base:add?[...chosenClips]:[],hits:null,el:null};
 });
 window.addEventListener('pointermove',e=>{
  if(!box)return;const inner=$('layered-inner');if(!inner){box=null;return;}
  const r=inner.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(!box.el){if(Math.hypot(x-box.x,y-box.y)<5)return;box.el=document.createElement('div');box.el.className='timeline-marquee';inner.append(box.el);}
  e.preventDefault();
  Object.assign(box.el.style,{left:Math.min(x,box.x)+'px',top:Math.min(y,box.y)+'px',width:Math.abs(x-box.x)+'px',height:Math.abs(y-box.y)+'px'});
  const area=box.el.getBoundingClientRect(),hits=[...box.base];
  for(const b of inner.querySelectorAll('[data-clip]')){const q=b.getBoundingClientRect();if(q.left<area.right&&q.right>area.left&&q.top<area.bottom&&q.bottom>area.top&&!hits.includes(b.dataset.clip))hits.push(b.dataset.clip);}
  box.hits=hits;for(const b of inner.querySelectorAll('[data-clip]'))b.classList.toggle('selected',hits.includes(b.dataset.clip));
 });
 function endBox(){const b=box;box=null;if(!b?.el)return;b.el.remove();if(b.hits?.length)setChosen(b.hits);else paint();}
 window.addEventListener('pointerup',endBox);window.addEventListener('pointercancel',()=>{if(box?.el)box.el.remove();box=null;paint();});

 // Ctrl + A seleciona todos os trechos da timeline; Esc volta a um só
 window.addEventListener('keydown',e=>{
  if(editorKind!=='video'||busy||!host.offsetParent||e.target.closest?.('input,textarea,select,[contenteditable="true"],dialog'))return;
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&key==='a'&&project()?.clips.length){e.preventDefault();setChosen(project().clips.map(c=>c.id));}
  else if(key==='escape'&&chosenClips.size>1&&compositionSelected){setChosen([compositionSelected]);}
 });
})(globalThis);
