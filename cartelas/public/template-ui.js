function refreshIdentityElements(card,project){if(document.getElementById('layout-identity').checked&&project.clientIdentity?.visualElementsEnabled){applyIdentityElements(card,project.palette,project.clientIdentity.visualIdentity);applyVisualDirection(card);}}
import {applyIdentityElements} from './identity-elements.js';
import {applyVisualDirection} from './visual-direction.js';
import {registerFonts} from './fonts.js';
import {captureTemplate,applyTemplate,validateTemplate} from './templates.js';
import {saveTemplate,listTemplates,deleteTemplate} from './storage.js';
import {connectFileDrop} from './imports.js';
import {download,safeName} from './export.js';
import {drawCard,fitCardTypography} from './render.js';
import {uid} from './core.js';
import {COLLECTIONS,applyCollection,previewCard} from './design-presets.js';
import {LAYOUT_CATEGORIES,collectionCategory,carouselMarkup,connectCarousels} from './carousels.js';
import {SEGMENTS,resolveSegment} from './segments.js';

export function setupTemplates({getProject,getCard,change,syncInputs,notify}) {
  const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let models=[],generation=0,cleanReady=()=>{},cleanModels=()=>{},lastSegmentContext=null;
  let comparison=null,comparisonVersion=0;
  const segmentControls=document.createElement('section');segmentControls.className='segment-controls';
  document.querySelector('.collection-controls label').firstChild.textContent='Filtrar estilos';
  segmentControls.innerHTML='<label>Tipo de negócio<select id="work-segment"><option value="auto">Identificar pelo pedido</option>'+SEGMENTS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')+'</select></label><p id="work-segment-hint" class="hint" role="status"></p><p class="hint">Ao aplicar um template, adapta títulos automáticos. Seus títulos personalizados são preservados.</p>';
  document.querySelector('.collection-controls').before(segmentControls);
  $('work-segment').onchange=()=>{const value=$('work-segment').value;closeComparison();change(()=>{getProject().segment=value;},null);refresh().catch(err=>notify(err.message));notify('Segmento escolhido. Confira a prévia e aplique o template para atualizar as cartelas.');};
  const comparisonCanvas=document.createElement('canvas');comparisonCanvas.id='layout-comparison-canvas';comparisonCanvas.width=1280;comparisonCanvas.height=720;comparisonCanvas.hidden=true;comparisonCanvas.setAttribute('aria-label','Prévia temporária de layout. Aplique ou feche a proposta para continuar.');
  document.querySelector('.canvas-wrap').append(comparisonCanvas);
  const comparisonBar=document.createElement('section');comparisonBar.id='layout-comparison';comparisonBar.className='layout-comparison';comparisonBar.hidden=true;
  comparisonBar.innerHTML='<div><strong id="comparison-name"></strong><p>Somente uma prévia. Seu trabalho continua salvo como estava.</p></div><div class="properties-actions"><button id="comparison-original" class="button" aria-pressed="false">Ver original</button><button id="comparison-card" class="button">Aplicar nesta cartela</button><button id="comparison-all" class="button primary">Aplicar ao VT</button><button id="comparison-close" class="text-button">Fechar prévia</button></div>';
  document.querySelector('.canvas-wrap').before(comparisonBar);
  const fingerprint=()=>JSON.stringify([getProject().id,getProject().cards,getProject().palette,getProject().segment]);
  function closeComparison(){comparison=null;comparisonVersion++;comparisonBar.hidden=true;comparisonCanvas.hidden=true;}
  async function drawComparison(){
    if(!comparison)return;const token=++comparisonVersion,card=comparison.draft.cards.find(c=>c.id===getCard()?.id);if(!card)return closeComparison();
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;await drawCard(card,getProject().assets,canvas,null,true);
    if(token!==comparisonVersion||!comparison)return;comparisonCanvas.getContext('2d').clearRect(0,0,1280,720);comparisonCanvas.getContext('2d').drawImage(canvas,0,0);comparisonCanvas.hidden=comparison.original;
  }
  function compareSet(id){
    if(!getCard())return notify('Organize o roteiro para comparar com o seu conteúdo.');
    try{const draft={...getProject(),cards:structuredClone(getProject().cards)};applyCollection(draft,id,{keepIdentity:$('layout-identity').checked});if($('layout-fit-text').checked)draft.cards.forEach(c=>{fitCardTypography(c);refreshIdentityElements(c,draft);});
      comparison={id,draft,base:fingerprint(),original:false};comparisonBar.hidden=false;$('comparison-name').textContent='Experimentando '+COLLECTIONS.find(c=>c.id===id).name;$('comparison-original').textContent='Ver original';$('comparison-original').setAttribute('aria-pressed','false');drawComparison().catch(err=>{closeComparison();notify(err.message);});
    }catch(err){notify(err.message);}
  }
  $('comparison-close').onclick=closeComparison;
  $('comparison-original').onclick=()=>{if(!comparison)return;comparison.original=!comparison.original;comparisonCanvas.hidden=comparison.original;$('comparison-original').textContent=comparison.original?'Ver proposta':'Ver original';$('comparison-original').setAttribute('aria-pressed',String(comparison.original));};
  $('comparison-card').onclick=()=>{if(comparison)applySet(comparison.id,{onlyCard:true});};
  $('comparison-all').onclick=()=>{if(comparison)applySet(comparison.id);};
  $('browse-collections').onclick=()=>$('quick-layout').click();
  function sync(){const p=getProject(),segment=resolveSegment(p);$('work-segment').value=p.segment||'auto';$('work-segment-hint').textContent=(segment.source==='manual'?'Escolhido: ':segment.source==='content'?'Identificado no pedido: ':'Sem identificação clara: ')+segment.name+'.';const context=JSON.stringify([p.id,p.segment,p.name,p.brief]);if(context!==lastSegmentContext){lastSegmentContext=context;renderCollections().catch(err=>notify(err.message));}$('save-layout').disabled=!getCard();$('apply-layout').disabled=!getCard()||!models.length;$('apply-collection').disabled=!p.cards.length;if(comparison){if(comparison.base!==fingerprint())closeComparison();else drawComparison().catch(err=>{closeComparison();notify(err.message);});} }
  $('collection-select').innerHTML=COLLECTIONS.map(c=>`<option value="${c.id}">${c.name} · ${c.sector}</option>`).join('');
  $('collection-filter').innerHTML='<option value="">Todas as categorias</option>'+LAYOUT_CATEGORIES.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  let previewGeneration=0,previewFrames=new Map();
  $('collection-dialog-close').onclick=()=>$('collection-dialog').close();
  async function enlarge(id,kind){
    const frame=previewFrames.get(`${id}-${kind}`);if(!frame)return notify('Aguarde a prévia terminar de carregar.');
    const c=COLLECTIONS.find(c=>c.id===id);$('collection-dialog-title').textContent=`${c.name} · ${kind==='intro'?'Abertura':kind==='services'?'Serviços':'Contato'}`;
    $('collection-dialog-note').textContent=frame.actual?'Prévia com o conteúdo do seu trabalho. Aplicar atualiza todo o VT.':'Composição ilustrativa. Seus textos e materiais serão usados ao aplicar.';
    $('collection-dialog-apply').disabled=!getProject().cards.length;
    $('collection-dialog-apply').onclick=()=>{$('collection-dialog').close();applySet(id);};
    await drawCard(frame.card,frame.assets,$('collection-dialog-canvas'));
    if(!$('collection-dialog').open)$('collection-dialog').showModal();
  }
  async function renderCollections(){
    const token=++previewGeneration,project=getProject(),useWork=$('collection-preview-work').checked&&project.cards.length;
    previewFrames=new Map();
    const filter=$('collection-filter').value,collections=COLLECTIONS.filter(c=>!filter||collectionCategory(c).id===filter);
    $('collection-preview-label').textContent=useWork?'Prévia do seu trabalho · nenhum ajuste foi aplicado': 'Exemplos de composição · textos ilustrativos e espaços para seus materiais';
    const preview=(c,kind,cover=false)=>`<button class="preview-expand" data-preview-collection="${c.id}" data-preview-kind="${kind}" aria-label="${$('layouts-view').classList.contains('layout-docked')?'Experimentar coleção':'Ampliar'} ${esc(c.name)}: ${kind==='intro'?'abertura':kind==='services'?'serviços':'contato'}"><canvas id="collection-${c.id}-${kind}" width="640" height="360" ${cover?'class="collection-cover"':''}></canvas><span>Ampliar ↗</span></button>`;
    const collectionCards=new Map(collections.map(c=>[c.id,`<article class="collection-card"><div class="collection-meta"><span class="eyebrow">${esc(c.sector)}</span><span class="collection-tag">${esc(c.tag)}</span></div><h2>${esc(c.name)}</h2><p>${esc(c.description)}</p>${preview(c,'intro',true)}<div class="collection-secondary"><figure>${preview(c,'services')}<figcaption>Serviços</figcaption></figure><figure>${preview(c,'contact')}<figcaption>Contato</figcaption></figure></div><div class="collection-bottom"><span>3 composições · 1280 × 720</span><button class="button primary" data-collection-apply="${c.id}" ${project.cards.length?'':'disabled'}>Aplicar ao meu VT</button></div></article>`]));
    cleanReady();
    const groups=new Map(),rank=c=>{const i=collectionCategory(c).collections?.indexOf(c.id);return i>=0?i:99;};for(const c of collections){const category=collectionCategory(c);if(!groups.has(category.id))groups.set(category.id,{...category,cards:[]});}for(const c of [...collections].sort((a,b)=>rank(a)-rank(b))){const category=collectionCategory(c);if(!groups.has(category.id))groups.set(category.id,{...category,cards:[]});groups.get(category.id).cards.push(collectionCards.get(c.id));}
    // The category matching the client's business leads; generic styles close the list.
    const lead={health:'health',restaurant:'commerce',retail:'commerce',education:'education',events:'events'}[resolveSegment(project).id],order=g=>g.id===lead?0:g.id==='other'?2:1;
    $('collection-grid').innerHTML=[...groups.values()].sort((a,b)=>order(a)-order(b)).map(group=>carouselMarkup('ready-'+group.id,group.name,group.cards)).join('');
    cleanReady=connectCarousels($('collection-grid'));

    document.querySelectorAll('[data-collection-apply]').forEach(b=>b.onclick=()=>applySet(b.dataset.collectionApply));
    document.querySelectorAll('[data-preview-collection]').forEach(b=>b.onclick=()=>{if($('layouts-view').classList.contains('layout-docked'))compareSet(b.dataset.previewCollection);else enlarge(b.dataset.previewCollection,b.dataset.previewKind).catch(err=>notify(err.message));});
    for(const c of collections){
      let draft;if(useWork){draft={...project,cards:structuredClone(project.cards)};applyCollection(draft,c.id,{keepIdentity:$('layout-identity').checked});}
      for(const kind of ['intro','services','contact']){
        if(token!==previewGeneration)return;
        const card=draft?.cards.find(card=>card.kind===kind),canvas=$(`collection-${c.id}-${kind}`);
        const frame=card||previewCard(c.id,kind);if(!card||$('layout-fit-text').checked)fitCardTypography(frame);if(card)refreshIdentityElements(frame,project);previewFrames.set(`${c.id}-${kind}`,{card:frame,assets:card?project.assets:{},actual:!!card});await drawCard(frame,card?project.assets:{},canvas);
      }
    }
  }
  function applySet(id,{onlyCard=false}={}){
    if(!getProject().cards.length)return notify('Organize o roteiro antes de aplicar uma coleção.');
    try{
      const p=getProject(),cardId=getCard()?.id,draft={...p,cards:structuredClone(onlyCard?p.cards.filter(c=>c.id===cardId):p.cards)};
      if(!draft.cards.length)return notify('Selecione uma cartela antes de aplicar.');
      applyCollection(draft,id,{keepIdentity:$('layout-identity').checked});if($('layout-fit-text').checked)draft.cards.forEach(c=>{fitCardTypography(c);refreshIdentityElements(c,draft);});
      closeComparison();change(()=>{if(onlyCard)p.cards=p.cards.map(c=>c.id===cardId?draft.cards[0]:c);else{p.cards=draft.cards;p.palette=draft.palette;p.theme=draft.theme;}},null);syncInputs();
      $('collection-select').value=id;
      if(!$('layouts-view').classList.contains('layout-docked')){document.querySelector('[data-view="editor"]').click();document.querySelector('[data-workflow="edicao"]').click();}
      notify(onlyCard?'Layout aplicado somente à cartela selecionada. Desfazer recupera a composição anterior.':'Coleção aplicada ao VT. Revise textos, fotos e contatos. Desfazer recupera o conjunto anterior.');
    }catch(err){notify(err.message);}
  }
  $('apply-collection').onclick=()=>applySet($('collection-select').value);
  $('collection-filter').onchange=()=>renderCollections().catch(err=>notify(err.message));
  $('collection-preview-work').onchange=()=>renderCollections().catch(err=>notify(err.message));
  $('layout-identity').onchange=$('layout-fit-text').onchange=()=>{closeComparison();renderCollections().catch(err=>notify(err.message));};
  async function refresh(){
    const token=++generation,previous=$('layout-select').value;
    const saved=await listTemplates();if(token!==generation)return;models=saved.map(validateTemplate);
    $('layout-select').innerHTML='<option value="">Escolha um modelo salvo</option>'+models.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    if(models.some(m=>m.id===previous))$('layout-select').value=previous;
    const modelCards=models.map((m,i)=>`<article class="saved-project"><canvas id="layout-preview-${i}" width="320" height="180" class="layout-preview" aria-label="Estrutura de ${esc(m.name)}"></canvas><h3>${esc(m.name)}</h3><p>${m.kind==='intro'?'Apresentação':m.kind==='services'?'Serviços':'Contato'} · ${m.layers.length} camadas</p><div class="properties-actions"><button class="button" data-layout-use="${esc(m.id)}">Usar na cartela atual</button><button class="text-button" data-layout-export="${esc(m.id)}">Baixar modelo</button><button class="text-button danger" data-layout-delete="${esc(m.id)}">Remover</button></div></article>`);
    cleanModels();
    $('layout-grid').innerHTML=models.length?['intro','services','contact'].map(kind=>carouselMarkup('saved-'+kind,{intro:'Aberturas',services:'Serviços',contact:'Contatos'}[kind],modelCards.filter((_,i)=>models[i].kind===kind))).join(''):'<p class="hint">Salve a estrutura de uma cartela no trabalho atual para criar seu primeiro modelo.</p>';
    cleanModels=connectCarousels($('layout-grid'));

    document.querySelectorAll('[data-layout-use]').forEach(b=>b.onclick=()=>{ $('layout-select').value=b.dataset.layoutUse;apply(); });
    document.querySelectorAll('[data-layout-export]').forEach(b=>b.onclick=()=>{const m=models.find(m=>m.id===b.dataset.layoutExport);download(new Blob([JSON.stringify(m,null,2)],{type:'application/json'}),safeName(m.name)+'.layout.json');});
    document.querySelectorAll('[data-layout-delete]').forEach(b=>b.onclick=async()=>{try{await deleteTemplate(b.dataset.layoutDelete);await refresh();notify('Modelo removido da biblioteca. Cartelas já montadas permanecem salvas.');}catch(err){notify(err.message);}});
    sync();
    for(let i=0;i<models.length;i++){
      if(token!==generation)return;
      await registerFonts(models[i].fonts||[]);
      const preview={layers:structuredClone(models[i].layers),content:{body:'Serviço em destaque\nAtendimento personalizado\nOutro serviço'},approved:false};
      if(models[i].serviceLayout){preview.layers.find(l=>l.role==='body').text=preview.content.body;buildServiceList(preview,models[i].palette,undefined,models[i].serviceLayout);fitCardTypography(preview);}
      await drawCard(preview,{},$(`layout-preview-${i}`));
    }
    await renderCollections();
  }
  async function apply(){
    const model=models.find(m=>m.id===$('layout-select').value),card=getCard();
    if(!card)return notify('Selecione uma cartela no trabalho atual.');
    if(!model)return notify('Escolha um modelo salvo.');
    try{
      await registerFonts([...(getProject().fonts||[]),...(model.fonts||[]).filter(f=>!(getProject().fonts||[]).some(old=>old.id===f.id))]);
      const context={...getProject()},draft=structuredClone(card);applyTemplate(context,draft,model,{keepIdentity:$('layout-identity').checked});
      if($('layout-fit-text').checked){fitCardTypography(draft);refreshIdentityElements(draft,context);}
      change(()=>{getProject().fonts=context.fonts;card.layers=draft.layers;if(draft.serviceLayout)card.serviceLayout=draft.serviceLayout;else delete card.serviceLayout;if(draft.contactLayout)card.contactLayout=draft.contactLayout;else delete card.contactLayout;delete card.designCollection;card.approved=false;});
      if(!$('layouts-view').classList.contains('layout-docked'))document.querySelector('[data-view="editor"]').click();
      notify('Modelo aplicado. Textos e materiais foram preservados. Confira enquadramento, textos adicionais e QR antes de aprovar.');
    }catch(err){notify(err.message);}
  }
  $('apply-layout').onclick=apply;
  $('save-layout').onclick=async()=>{
    const button=$('save-layout');
    try{const model=captureTemplate(getProject(),getCard(),$('layout-name').value);button.disabled=true;await saveTemplate(model);await refresh();$('layout-select').value=model.id;$('layout-name').value='';notify('Modelo salvo sem textos ou imagens do cliente. Veja a prévia em “Meus layouts”.');}catch(err){notify(err.message);}finally{sync();}
  };
  connectFileDrop($('layout-import-file'),$('layout-import-drop'),async file=>{
    if(file.size>32*1024*1024)throw new Error('O modelo excede 32 MB.');
    let value;try{value=JSON.parse(await file.text());}catch{throw new Error('O arquivo não contém um modelo válido.');}
    const model=validateTemplate(value);model.id=uid();await saveTemplate(model);await refresh();$('layout-select').value=model.id;notify('Modelo importado. Escolha uma cartela para aplicá-lo.');
  });
  refresh().catch(err=>notify('Não foi possível carregar os modelos: '+err.message));
  return {sync,refresh};
}
import {buildServiceList} from './service-list.js';
