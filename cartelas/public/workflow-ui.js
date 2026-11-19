const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cardName(project,card){
  const names={intro:'Abertura',services:'Serviços',contact:'Contato'},siblings=project.cards.filter(c=>c.kind===card.kind);
  return `${card.label} · ${names[card.kind]}${siblings.length>1?' '+(siblings.indexOf(card)+1):''}`;
}
export function setupWorkflow({getProject,getIssues=()=>[],notify=()=>{}}){
  const $=id=>document.getElementById(id),root=document.querySelector('.briefing-panel'),steps=['pedido','materiais','estilo','edicao','entrega'],names=['Pedido','Materiais','Estilo','Edição','Revisão e entrega'];let current='pedido',projectId;
  const paths={editor:'M4 5h16v14H4z M8 5v14 M11 9h6 M11 13h4',clients:'M15 8a3 3 0 1 0-6 0a3 3 0 0 0 6 0 M5 20v-2a7 7 0 0 1 14 0v2',layouts:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',projects:'M3 6h7l2 3h9v11H3z M3 6V4h7l2 2',references:'M3 4h18v16H3z M3 16l5-5 5 5 3-3 5 5 M15 8h.1',help:'M12 22a10 10 0 1 0 0-20a10 10 0 0 0 0 20 M9 9a3 3 0 1 1 4 3l-1 1v2 M12 18h.1'};
  const navNames={editor:'Meu trabalho',clients:'Clientes',layouts:'Templates',projects:'Trabalhos salvos',references:'Referências',help:'Ajuda'};
  for(const button of document.querySelectorAll('.nav')){const key=button.dataset.view;if(key==='intake'){button.hidden=true;continue;}button.setAttribute('aria-label',navNames[key]);button.title=navNames[key];button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key]}"/></svg><span>${navNames[key]}</span>`;}
  function range(first,end,target){let node=first;while(node&&node!==end){const next=node.nextSibling;target.append(node);node=next;}}
  const headings=[...root.querySelectorAll('h3')],visual=headings.find(h=>h.textContent==='Direção visual').previousElementSibling,materials=headings.find(h=>h.textContent==='Materiais').previousElementSibling;
  const panes={};for(const id of steps){const pane=document.createElement('div');pane.id='workflow-'+id;pane.className='workflow-pane';pane.hidden=true;panes[id]=pane;}
  range(root.firstChild,visual,panes.pedido);range(visual,materials,panes.estilo);range(materials,null,panes.materiais);root.replaceChildren(...Object.values(panes));root.classList.add('workflow-tools');
  const duplicate=[...panes.estilo.querySelectorAll('h3')].find(h=>h.textContent==='Coleções pessoais de VT');if(duplicate){duplicate.nextElementSibling?.remove();duplicate.remove();}
  const start=document.createElement('div');start.className='start-path';start.innerHTML='<h3>O que você recebeu do cliente?</h3><button id="start-script" class="start-option selected"><span class="start-option-icon">≡</span><span><strong>Já tenho um roteiro</strong><small>Cole as informações de cada cartela.</small></span><span aria-hidden="true">↗</span></button><button id="start-messages" class="start-option"><span class="start-option-icon">↥</span><span><strong>Mensagens, prints ou áudios</strong><small>Organize o pedido em um roteiro revisável.</small></span><span aria-hidden="true">↗</span></button>';
  panes.pedido.prepend(start);$('start-script').onclick=()=>$('brief').focus();$('start-messages').onclick=()=>receive();
  const identity=document.createElement('details');identity.className='identity-details';identity.innerHTML='<summary>Usar a identidade de um cliente salvo <span>Opcional</span></summary>';const identityBox=panes.pedido.querySelector('.identity-box');identityBox.before(identity);identity.append(identityBox);
  const orderForm=document.createElement('div');orderForm.className='order-form';range(start.nextSibling,null,orderForm);panes.pedido.append(orderForm);
  $('brief').rows=9;
  orderForm.lastElementChild.textContent='Use “Cartela 1”, “Cartela 2”… para separar as cenas. Confira os textos antes de montar.';
  const guide=document.createElement('aside');guide.className='order-guide';const guideIntro='<h2>Do pedido ao layout,<br>um passo de cada vez.</h2><ol><li><strong>Organize o conteúdo</strong><p>Separe os textos e as informações de cada cartela.</p></li><li><strong>Dê a cara do cliente</strong><p>Adicione os materiais e escolha uma coleção visual.</p></li><li><strong>Revise e entregue</strong><p>Gere a montagem para aprovação e os arquivos para o Photoshop.</p></li></ol><div class="guide-format"><strong>1280 × 720</strong><span>Cartelas individuais, elementos editáveis.</span></div>';guide.innerHTML=guideIntro;panes.pedido.append(guide);
  const materialGrid=document.createElement('div');materialGrid.className='materials-grid';
  const logoBlock=document.createElement('section');logoBlock.className='material-block material-logo';logoBlock.innerHTML='<div class="material-heading"><div><h2>Logo da marca</h2><p>A assinatura visual do cliente.</p></div></div>';logoBlock.append($('logo-drop'));
  const photoBlock=document.createElement('section');photoBlock.className='material-block material-photos';photoBlock.innerHTML='<div class="material-heading"><div><h2>Fotos do cliente</h2><p>Importe juntas e escolha onde cada foto aparece.</p></div></div>';
  range($('photo-drop'),[...panes.materiais.querySelectorAll('h3')].find(h=>h.textContent==='QR Code do cliente').previousElementSibling,photoBlock);
  const qrHeading=[...panes.materiais.querySelectorAll('h3')].find(h=>h.textContent==='QR Code do cliente');
  const qrBlock=document.createElement('section');qrBlock.className='material-block material-qr';qrBlock.innerHTML='<div class="material-heading"><div><h2>QR Code</h2><p>Use a imagem pronta enviada pelo cliente.</p></div></div>';range(qrHeading.nextSibling,null,qrBlock);
  const logoAssets=document.createElement('div');logoAssets.id='logo-assets';logoAssets.className='asset-list';logoBlock.append(logoAssets);
  const qrAssets=document.createElement('div');qrAssets.id='qr-assets';qrAssets.className='asset-list';qrBlock.append(qrAssets);
  const qrOptions=document.createElement('div');qrOptions.id='qr-options';range(qrBlock.firstElementChild.nextSibling,null,qrOptions);qrBlock.append(qrOptions);
  const qrChoice=document.createElement('label');qrChoice.className='check-label';qrChoice.innerHTML='<input id="include-qr" type="checkbox"> Este trabalho inclui QR Code';qrOptions.before(qrChoice);qrChoice.before(Object.assign(document.createElement('p'),{className:'hint',textContent:'Opcional. Ative somente quando o cliente pedir.'}));
  const photoDestination=document.createElement('label');photoDestination.innerHTML='Ao enviar uma única foto, colocar em<select id="photo-import-target" aria-label="Destino da foto importada"></select>';photoBlock.querySelector('#photo-drop').before(photoDestination);
  materialGrid.append(logoBlock,photoBlock,qrBlock);const needs=document.createElement('section');needs.className='materials-needs';needs.setAttribute('aria-label','O que o pedido pede');panes.materiais.replaceChildren(needs,materialGrid);
  // Editing tools sit next to the preview rather than beneath a long form.
  for(const node of [document.querySelector('.editing-grid'),$('icon-library'),document.querySelector('.service-panel')])panes.edicao.append(node);
  const editing=panes.edicao.querySelector('.editing-grid'),layerPanel=editing.firstElementChild,elementPanel=editing.lastElementChild;
  const inspectorTabs=document.createElement('div');inspectorTabs.className='inspector-tabs';inspectorTabs.setAttribute('aria-label','Ferramentas de edição');inspectorTabs.innerHTML='<button data-inspector="element">Elemento</button><button data-inspector="layers">Camadas</button><button data-inspector="services">Serviços</button><button data-inspector="contacts">Contatos</button><button data-inspector="visual">Layouts</button>';
  const visualPanel=document.createElement('section');visualPanel.id='visual-tools';let currentInspector='element';
  const contactPanel=document.createElement('section');contactPanel.id='contact-tools';
  const inspectorGroups={contacts:contactPanel,element:elementPanel,layers:layerPanel,services:panes.edicao.querySelector('.service-panel'),visual:visualPanel};
  for(const [key,panel] of Object.entries(inspectorGroups)){panel.dataset.inspectorPanel=key;panel.classList.add('inspector-panel');panes.edicao.append(panel);}editing.remove();inspectorGroups.layers.append($('icon-library'));panes.edicao.prepend(inspectorTabs);
  function showInspector(key){currentInspector=key;for(const [id,panel] of Object.entries(inspectorGroups))panel.hidden=id!==key;inspectorTabs.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.inspector===key);b.setAttribute('aria-pressed',String(b.dataset.inspector===key));});}
  inspectorTabs.querySelectorAll('button').forEach(b=>b.onclick=()=>b.dataset.inspector==='visual'?openGallery():showInspector(b.dataset.inspector));showInspector('element');
  const precision=document.querySelector('.precision-toolbar'),precisionDetails=document.createElement('details');precisionDetails.className='precision-details';precisionDetails.innerHTML='<summary>Alinhar e posicionar <span>Guias e alinhamento</span></summary>';precision.before(precisionDetails);precisionDetails.append(precision);
  panes.entrega.append(document.querySelector('.export-panel'));
  const validation=$('validation');document.querySelector('.canvas-column').insertBefore(validation,document.querySelector('.canvas-wrap'));
  const checks=document.createElement('details');checks.className='preview-checks';checks.innerHTML='<summary id="preview-checks-label">Conferência da cartela</summary>';validation.before(checks);checks.append(validation);
  const options=document.createElement('details');options.className='card-options';options.innerHTML='<summary>Opções da cartela ⋯</summary><div></div>';$('duplicate').before(options);for(const id of ['duplicate','move-left','move-right','delete-card'])options.lastElementChild.append($(id));
  document.querySelector('.canvas-column').insertBefore($('filmstrip'),document.querySelector('.canvas-wrap'));
  const advanced=document.createElement('details');advanced.className='style-advanced';advanced.innerHTML='<summary>Ajustes de cores, fontes e modelos</summary>';range(panes.estilo.firstChild,null,advanced);panes.estilo.append(advanced);
  const draftNotice=document.createElement('p');draftNotice.id='style-draft-status';draftNotice.className='intake-warning';draftNotice.setAttribute('role','status');draftNotice.hidden=true;advanced.querySelector('summary').after(draftNotice);
  function styleDraft(){const p=getProject(),dirty=$('theme').value!==p.theme||$('font').value!==p.palette.font||[['primary-color','primary'],['accent-color','accent'],['background-color','background']].some(([id,key])=>p.palette[key]&&$(id).value.toLowerCase()!==p.palette[key].toLowerCase());draftNotice.hidden=!dirty;draftNotice.textContent='Há ajustes ainda não aplicados às cartelas. Use “Aplicar cores mantendo posições” ou “Refazer layout com estas cores e fonte”.';}
  for(const id of ['theme','font','primary-color','accent-color','background-color'])for(const event of ['input','change'])$(id).addEventListener(event,styleDraft);
  const gallery=document.createElement('div');gallery.className='style-choice';gallery.innerHTML='<h2>Escolha o visual do VT</h2><p class="hint">Compare os templates com seus textos e materiais. Depois ajuste cores e fontes se precisar.</p>';panes.estilo.prepend(gallery);
  const preferences=document.createElement('div');preferences.className='style-preferences';preferences.append($('layout-identity').closest('label'),$('layout-fit-text').closest('label'));
  // Apply options keep their defaults; tucking them away brings the styles above the fold.
  const applyOptions=document.createElement('details');applyOptions.className='apply-options';applyOptions.innerHTML='<summary>Opções ao aplicar</summary>';applyOptions.append(preferences);
  range(panes.estilo.firstChild,null,visualPanel);
  advanced.before(applyOptions);
  let galleryMarker;
  function closeGallery(){const layouts=$('layouts-view');if(!layouts.classList.contains('layout-docked'))return;galleryMarker?.replaceWith(layouts);layouts.classList.remove('layout-docked');layouts.classList.add('view');layouts.hidden=true;delete document.querySelector('.workspace').dataset.layouts;showInspector('element');}
  function mountGallery(){
    const layouts=$('layouts-view');
    if(!layouts.classList.contains('layout-docked')){
      galleryMarker=document.createComment('gallery');layouts.before(galleryMarker);
      layouts.classList.remove('view');layouts.classList.add('layout-docked');
      gallery.after(layouts);
      $('collection-preview-work').checked=!!getProject().cards.length;
    }
    layouts.hidden=false;
    document.querySelector('.workspace').dataset.layouts='open';
    document.dispatchEvent(new Event('cartelas:gallery-open'));
  }
  function openGallery(){if(current!=='estilo'){go('edicao');showInspector('visual');}mountGallery();const pane=current==='estilo'?panes.estilo:document.querySelector('.workspace[data-step=edicao] .workflow-tools');const target=current==='estilo'?gallery:$('layouts-view');if(pane&&target)pane.scrollTop+=target.getBoundingClientRect().top-pane.getBoundingClientRect().top;}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="layouts"]')){if(!$('editor-view').hidden&&getProject().cards.length){e.preventDefault();e.stopImmediatePropagation();openGallery();}else closeGallery();}},true);
  $('browse-collections').onclick=openGallery;
  const quick=document.createElement('div');quick.className='quick-visual';quick.innerHTML='<button id="quick-layout" class="button">Layouts</button><button id="quick-colors" class="button">Cores</button>';document.querySelector('.canvas-toolbar').append(quick);$('quick-layout').onclick=openGallery;$('quick-colors').onclick=()=>$('pick-work-colors').click();
  const descriptions=['Roteiro e informações','Logo, fotos e QR','Templates e identidade','Ajustes das cartelas','Aprovação e arquivos'];
  const titles=['Vamos começar pelo pedido.','Reúna os materiais do cliente.','Encontre o visual do seu VT.','Dê os últimos ajustes.','Tudo pronto para entregar?'];
  const progress=document.querySelector('.workflow');progress.setAttribute('aria-label','Etapas do trabalho');progress.innerHTML=steps.map((id,i)=>`<button class="step" data-workflow="${id}"><span class="step-number">${String(i+1).padStart(2,'0')}</span><span class="step-label"><b>${names[i]}</b><small>${descriptions[i]}</small></span><span class="step-state"></span></button>`).join('');
  const subtitle=document.createElement('p');subtitle.id='page-description';$('page-title').after(subtitle);
  const workspace=document.querySelector('.workspace'),intake=$('intake-view');intake.classList.remove('view');workspace.after(intake);
  const receiveHeader=document.createElement('div');receiveHeader.className='panel-heading receive-heading';receiveHeader.innerHTML='<div><h2>Mensagens, prints e áudios</h2></div><button id="receive-back" class="button">Voltar ao roteiro →</button>';intake.prepend(receiveHeader);$('receive-back').onclick=()=>go('pedido');
  function closeReceive(){intake.hidden=true;workspace.hidden=false;}
  function receive(){go('pedido');workspace.hidden=true;intake.hidden=false;$('page-title').textContent='Vamos organizar o pedido.';subtitle.textContent='Reúna as mensagens e arquivos. Depois confira o briefing antes de montar as cartelas.';}
  // Sem cartelas, as etapas seguintes não têm onde colocar textos, materiais e templates:
  // avançar organiza o roteiro escrito; sem roteiro, fica no pedido e avisa.
  function ready(id){
    if(id==='pedido'||getProject().cards.length)return true;
    if(!$('brief').value.trim()){if(current!=='pedido')go('pedido');notify('Escreva ou importe o roteiro e clique em “Organizar cartelas” antes de seguir.');$('brief').focus();return false;}
    $('parse').click();
    return getProject().cards.length>0&&id!=='materiais';
  }
  function go(id,{focus=false}={}){if(!ready(id))return;closeReceive();if(id==='estilo'){panes.estilo.append(visualPanel);visualPanel.hidden=false;}else if(id==='edicao'){panes.edicao.append(visualPanel);showInspector(currentInspector);}current=id;root.dataset.step=id;workspace.dataset.step=id;for(const key of steps)panes[key].hidden=key!==id;for(const button of progress.querySelectorAll('button')){button.classList.toggle('active',button.dataset.workflow===id);button.setAttribute('aria-current',button.dataset.workflow===id?'step':'false');}const index=steps.indexOf(current);if($('workflow-back')){$('workflow-back').disabled=index===0;$('workflow-next').hidden=index===4;$('workflow-next').textContent=index<4?`Continuar para ${names[index+1].toLowerCase()} →`:'';}if(!$('editor-view').hidden){$('page-title').textContent=titles[index];subtitle.textContent=['Cole o roteiro ou transforme as mensagens do cliente em um pedido organizado.','Os arquivos ficam no trabalho. Você pode trocar a ordem e o destino das fotos.','Escolha uma composição e adapte as cores e fontes à marca.','Selecione um elemento na prévia para editar. Seus ajustes são salvos automaticamente.','Confira as pendências, revise as cartelas e prepare os arquivos.'][index];}if(id==='estilo')mountGallery();if(focus)root.scrollIntoView({block:'start'});revealStep();document.dispatchEvent(new CustomEvent('cartelas:step',{detail:id}));}
  // On narrow screens the step bar scrolls sideways; keep the current step in view.
  function revealStep(){const active=progress.querySelector('button.active');let box=active?.parentElement;while(box&&box!==document.body&&box.scrollWidth<=box.clientWidth+1)box=box.parentElement;if(!active||!box||box===document.body)return;const a=active.getBoundingClientRect(),b=box.getBoundingClientRect();box.scrollLeft+=a.left-b.left-(b.width-a.width)/2;}
  progress.querySelectorAll('button').forEach(b=>b.onclick=()=>go(b.dataset.workflow));
  const next=document.createElement('div');next.className='workflow-next';next.innerHTML='<button id="workflow-back" class="text-button">← Voltar</button><button id="workflow-next" class="button">Continuar →</button>';root.append(next);
  $('workflow-back').onclick=()=>go(steps[Math.max(0,steps.indexOf(current)-1)]);$('workflow-next').onclick=()=>go(steps[Math.min(4,steps.indexOf(current)+1)]);
  const importDetails=document.createElement('details');importDetails.className='import-work';importDetails.innerHTML='<summary>Importar uma cópia por arrastar</summary>';$('restore-drop').before(importDetails);importDetails.append($('restore-drop'));
  // "Abrir cópia" also accepts a dropped copy; the drop zone (with its status) only shows while in use.
  const restoreButton=$('restore');restoreButton.title='Clique ou arraste aqui uma cópia .cartelas.json';
  const fileDrag=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  restoreButton.addEventListener('dragover',e=>{if(!fileDrag(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';restoreButton.classList.add('drop-over');});
  restoreButton.addEventListener('dragleave',()=>restoreButton.classList.remove('drop-over'));
  restoreButton.addEventListener('drop',e=>{if(!fileDrag(e))return;e.preventDefault();restoreButton.classList.remove('drop-over');importDetails.open=true;const input=$('restore-file');input.files=e.dataTransfer.files;input.dispatchEvent(new Event('change'));});
  // One gallery, three categories. Existing controls and import drop zones keep their IDs.
  const layouts=$('layouts-view'),personal=$('personal-collection-drop').previousElementSibling,individual=$('layout-import-drop').previousElementSibling;
  const tabs=document.createElement('div');tabs.className='gallery-tabs';tabs.innerHTML='<button class="button" data-gallery="ready">Prontos</button><button class="button" data-gallery="personal">Minhas coleções</button><button class="button" data-gallery="single">Layouts individuais</button>';layouts.firstElementChild.after(tabs);
  const groups={};for(const key of ['ready','personal','single']){const el=document.createElement('div');el.id='gallery-'+key;groups[key]=el;}
  range(document.querySelector('.collection-controls'),personal,groups.ready);range(personal,individual,groups.personal);range(individual,null,groups.single);layouts.append(...Object.values(groups));
  function galleryTab(key){for(const [id,el] of Object.entries(groups))el.hidden=id!==key;tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('primary',b.dataset.gallery===key));}
  tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>galleryTab(b.dataset.gallery));galleryTab('ready');
  // Save reusable structures where the corresponding library lives.
  for(const [key,input,button] of [['personal','personal-collection-name','save-personal-collection'],['single','layout-name','save-layout']]){const box=document.createElement('div');box.className='library-save';box.append($(input).closest('label'),$(button));groups[key].prepend(box);}
  const galleryReturn=document.createElement('button');galleryReturn.id='gallery-return';galleryReturn.className='text-button gallery-return';galleryReturn.textContent='← Voltar ao visual do trabalho';layouts.prepend(galleryReturn);galleryReturn.id='inline-layout-close';galleryReturn.textContent='← Fechar layouts';galleryReturn.onclick=()=>{if(layouts.classList.contains('layout-docked'))closeGallery();else{document.querySelector('[data-view="editor"]').click();go('estilo');}};
  const check='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Each step reports what is left, so the bar doubles as a progress summary.
  function status(p){
    const issues=new Map(p.cards.map(c=>[c,getIssues(c)])),asked=(c,re)=>issues.get(c).filter(m=>re.test(m)).length;
    const need=(flag,re)=>{const cards=p.cards.filter(c=>c.requirements?.[flag]);return {asked:cards.length,missing:cards.filter(c=>asked(c,re)).length};};
    const logo=need('logo',/logo solicitado/i),photo=need('photo',/foto solicitada/i),qr=need('qr',/QR Code solicitado/i);
    const missing=(logo.missing?1:0)+photo.missing+(qr.missing?1:0),total=[...issues.values()].reduce((n,list)=>n+list.length,0),reviewed=p.cards.filter(c=>c.approved).length,n=p.cards.length;
    return {needs:{logo,photo,qr},steps:{
      pedido:n?{done:true,label:`${n} cartela(s) organizada(s)`}:null,
      materiais:!n?null:missing?{count:missing,label:`${missing} material(is) pendente(s)`}:{done:true,label:'Materiais completos'},
      estilo:p.cards.some(c=>c.designCollection)?{done:true,label:'Coleção aplicada'}:null,
      edicao:n&&reviewed===n?{done:true,label:'Todas revisadas'}:n&&reviewed?{text:`${reviewed}/${n}`,label:`${reviewed} de ${n} revisadas`}:null,
      entrega:!n?null:total?{count:total,label:`${total} pendência(s)`}:reviewed===n?{done:true,label:'Pronto para entregar'}:null}};
  }
  function paintStatus(p){
    const {needs:items,steps:state}=status(p);
    for(const button of progress.querySelectorAll('button')){
      const s=state[button.dataset.workflow],slot=button.querySelector('.step-state');
      button.classList.toggle('done',!!s?.done);button.classList.toggle('pending',!!s?.count);
      slot.innerHTML=!s?'':s.done?check:esc(String(s.count??s.text));
      const name=button.querySelector('b').textContent;button.setAttribute('aria-label',s?`${name}: ${s.label}`:name);button.title=s?.label||'';
    }
    const needsBox=panes.materiais.querySelector('.materials-needs'),rows=[['Logo',items.logo,()=>'1 logo'],['Fotos',items.photo,a=>`${a} foto(s)`],['QR Code',items.qr,()=>'1 QR Code']].filter(([,v])=>v.asked);
    needsBox.hidden=!rows.length;
    needsBox.innerHTML=`<h2>O que o pedido pede</h2><ul>${rows.map(([name,v,ask])=>{const ok=!v.missing;return `<li class="${ok?'ok':'missing'}"><span class="need-mark">${ok?check:''}</span><strong>${name}</strong><span>${ok?'Recebido':name==='Fotos'?`${v.asked-v.missing} de ${v.asked} cartela(s) com foto`:'Pendente'}</span></li>`;}).join('')}</ul>`;
    // The order guide turns into the list of organized cards.
    if(!p.cards.length){if(guide.dataset.mode!=='intro'){guide.innerHTML=guideIntro;guide.dataset.mode='intro';}}
    else{guide.dataset.mode='cards';const kinds={intro:'Abertura',services:'Serviços',contact:'Contato'},asks=c=>[c.requirements?.logo&&'logo',c.requirements?.photo&&'foto',c.requirements?.qr&&'QR'].filter(Boolean).join(' · ');
      guide.innerHTML=`<h2>${p.cards.length} cartela(s) no pedido</h2><ol class="guide-cards">${p.cards.map(c=>`<li><strong>${esc(c.label)} · ${kinds[c.kind]||''}</strong><span>${esc((c.content?.title||'').replace(/\s+/g,' ').slice(0,70))}</span>${asks(c)?`<small>Pede ${asks(c)}</small>`:''}</li>`).join('')}</ol><button type="button" class="button primary guide-next">Continuar para materiais →</button>`;
      guide.querySelector('.guide-next').onclick=()=>go('materiais');}
  }
  // Once cards exist, organizing again is a destructive redo, not the next step.
  function syncParse(p){const parse=$('parse');if(!parse)return;parse.classList.toggle('primary',!p.cards.length);parse.textContent=p.cards.length?'Reorganizar cartelas':'Organizar cartelas →';}
  function sync(){const p=getProject();syncParse(p);workspace.dataset.empty=String(!p.cards.length);try{paintStatus(p);}catch(error){console.error("Status das etapas:",error);}if(projectId!==p.id){projectId=p.id;go(p.cards.length?'edicao':'pedido');}styleDraft();const index=steps.indexOf(current);$('workflow-back').disabled=index===0;$('workflow-next').hidden=index===4;$('workflow-next').textContent=index<4?`Continuar para ${names[index+1].toLowerCase()} →`:'';}
  return {go,sync,galleryTab,receive,closeReceive,showInspector};
}
