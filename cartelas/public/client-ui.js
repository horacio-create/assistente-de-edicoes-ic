import {IDENTITY_PATTERNS} from './identity-elements.js';
import {setupIdentityPreview} from './identity-preview-ui.js';
import {fontChoices,importFont,mergeFonts,registerFonts} from './fonts.js';
import {blankClient,validateClient,clientFromProject} from './clients.js';
import {uid} from './core.js';
import {saveClient,listClients} from './storage.js';
import {connectFileDrop} from './imports.js';
import {download,safeName} from './export.js';
import {loadImage} from './render.js';
import {setupIdentityReferences} from './identity-ui.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origins={official:'Identidade oficial',references:'Referências do designer',custom:'Direção criada para o cliente'};
export function setupClients({getProject,updateProject,newWork,notify}) {
  let clients=[],draft=blankClient(),draftToken=0,logoBusy=false,fontBusy=false;
  const elementsPanel=document.createElement('section');elementsPanel.className='client-elements-panel';elementsPanel.innerHTML='<h3>Elementos aprovados da identidade</h3><p class="hint">A análise do feed preenche esta seleção após sua conferência. Você também pode ajustar manualmente. A aplicação no trabalho terá uma prévia.</p><div class="client-elements-options"></div><p data-elements-source class="hint"></p>';
  $('client-notes').closest('label').before(elementsPanel);
  for(const [id,label] of Object.entries(IDENTITY_PATTERNS)){const row=document.createElement('label'),input=document.createElement('input');row.className='check-label';input.type='checkbox';input.dataset.identityPattern=id;row.append(input,document.createTextNode(label));elementsPanel.querySelector('div').append(row);}
  function showElements(value){elementsPanel.querySelectorAll('input').forEach(i=>i.checked=!!value?.patterns.includes(i.dataset.identityPattern));elementsPanel.querySelector('[data-elements-source]').textContent=value?(value.sourceMode==='manual'?'Seleção manual de elementos':(value.sourceMode==='posts'?'Conferido em publicações separadas':'Conferido em prints')+' · '+value.sourceCount+' referência(s)'):'Sem padrões conferidos. Perfis antigos mantêm suas orientações; marque os elementos que deseja usar.';}
  const preview=setupIdentityPreview({getProject,updateProject,notify});
  const identityReferences=setupIdentityReferences({getToken:()=>draftToken,getFonts:()=>draft.fonts||[],setVisualIdentity:value=>{draft.visualIdentity=structuredClone(value);showElements(value);},notify});
  function syncProject() {
    const p=getProject(),previous=$('work-client').value;
    $('work-client').innerHTML='<option value="">Escolha um cliente salvo</option>'+clients.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const selected=clients.some(c=>c.id===previous)?previous:clients.some(c=>c.id===p.clientIdentity?.id)?p.clientIdentity.id:'';
    $('work-client').value=selected;
    $('apply-work-client').textContent='Ver prévia da identidade';$('apply-work-client').disabled=!selected;$('new-client-work').disabled=!selected;
    $('work-client-status').textContent=p.clientIdentity?`Identidade em uso: ${p.clientIdentity.name}${p.clientIdentity.notes?' · '+p.clientIdentity.notes:''}`:'Cadastre uma identidade para reutilizar cores, fonte e logo.';
  }
  function renderLogo() {
    $('client-logo-preview').innerHTML=draft.logo?`<img src="${draft.logo.data}" alt="Logo do cliente"><span>${esc(draft.logo.name)}</span>`:'';
    $('client-remove-logo').hidden=!draft.logo;
  }
  function loadForm(client) {
    draft=structuredClone(client);draft.fonts=mergeFonts(draft.fonts||[],getProject().fonts||[]);draftToken++;identityReferences.reset();showElements(draft.visualIdentity);
    $('client-font').innerHTML=fontChoices(draft.fonts).map(f=>`<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('');
    $('client-form-title').textContent=clients.some(c=>c.id===draft.id)?'Editar cliente':'Cadastrar cliente';
    $('client-name').value=draft.name;$('client-sector').value=draft.sector;$('client-theme').value=draft.theme;$('client-primary').value=draft.palette.primary;$('client-accent').value=draft.palette.accent;$('client-font').value=draft.palette.font;$('client-origin').value=draft.origin;$('client-notes').value=draft.notes;
    $('client-logo-drop').querySelector('.drop-status').textContent='';$('client-logo-drop').classList.remove('drop-error');renderLogo();
    $('client-background').value=draft.palette.background||'#ffffff';
  }
  function readForm() {
    const patterns=[...elementsPanel.querySelectorAll('input:checked')].map(i=>i.dataset.identityPattern),visualIdentity=patterns.length||draft.visualIdentity?{version:1,patterns,sourceCount:draft.visualIdentity?.sourceCount??0,sourceMode:draft.visualIdentity?.sourceMode||'manual'}:undefined;
    return validateClient({...draft,...(visualIdentity?{visualIdentity}:{}),name:$('client-name').value.trim(),sector:$('client-sector').value.trim(),theme:$('client-theme').value,palette:{...draft.palette,background:$('client-background').value,primary:$('client-primary').value,accent:$('client-accent').value,font:$('client-font').value},origin:$('client-origin').value,notes:$('client-notes').value.trim(),updatedAt:new Date().toISOString()});
  }
  async function refresh() {
    clients=(await listClients()).map(validateClient);syncProject();
    $('client-grid').innerHTML=clients.length?clients.map(c=>`<article class="saved-project"><div class="client-card-header">${c.logo?`<img src="${c.logo.data}" alt="Logo de ${esc(c.name)}">`:'<span class="client-monogram">◈</span>'}<div><h3>${esc(c.name)}</h3><p>${esc(c.sector||'Área não informada')}</p></div></div><div class="client-swatches"><span style="background:${c.palette.primary}" title="Cor principal"></span><span style="background:${c.palette.accent}" title="Cor de destaque"></span><small>${esc(c.palette.font)}</small></div><p>${esc(origins[c.origin])}${c.notes?'<br>'+esc(c.notes):''}</p><div class="properties-actions"><button class="button" data-client-new="${c.id}">Novo VT</button><button class="text-button" data-client-edit="${c.id}">Editar perfil</button></div></article>`).join(''):'<div class="panel"><h3>Seu próximo trabalho pode começar com a identidade pronta.</h3><p class="hint">Cadastre o primeiro cliente ou use “Salvar esta identidade como cliente” no trabalho atual.</p></div>';
    document.querySelectorAll('[data-client-edit]').forEach(b=>b.onclick=()=>{loadForm(clients.find(c=>c.id===b.dataset.clientEdit));$('client-name').focus();});
    document.querySelectorAll('[data-client-new]').forEach(b=>b.onclick=async()=>{try{await newWork(clients.find(c=>c.id===b.dataset.clientNew));}catch(err){notify(err.message);}});
  }
  $('work-client').onchange=()=>{const selected=$('work-client').value;$('apply-work-client').disabled=!selected;$('new-client-work').disabled=!selected;};
  $('apply-work-client').onclick=()=>{try{const c=clients.find(c=>c.id===$('work-client').value);if(!c)throw new Error('Escolha um cliente salvo.');preview.open(c,{recompose:$('client-recompose').checked});}catch(err){notify(err.message);}};
  $('new-client-work').onclick=async()=>{try{const c=clients.find(c=>c.id===$('work-client').value);if(c)await newWork(c);}catch(err){notify(err.message);}};
  $('capture-client').onclick=()=>{const c=clientFromProject(getProject());loadForm(c);document.querySelector('[data-view="clients"]').click();$('client-name').focus();};
  $('clear-client-form').onclick=()=>loadForm(blankClient());
  $('client-remove-logo').onclick=()=>{draft={...draft,logo:null};renderLogo();};
  $('save-client').onclick=async()=>{
    if(logoBusy||fontBusy)return;
    try{const client=readForm();$('save-client').disabled=true;await saveClient(client);await refresh();loadForm(client);notify(`Perfil de ${client.name} salvo. Selecione-o no trabalho para aplicar a identidade.`);}catch(err){notify('Não foi possível salvar: '+err.message);}finally{$('save-client').disabled=logoBusy||fontBusy;}
  };
  $('export-client').onclick=()=>{try{const c=readForm();download(new Blob([JSON.stringify(c)],{type:'application/json'}),safeName(c.name)+'.cliente.json');}catch(err){notify(err.message);}};
  connectFileDrop($('client-font-file'),$('client-font-drop'),async files=>{
    fontBusy=true;$('save-client').disabled=true;try{
    const token=draftToken,records=await Promise.all(files.map(importFont)),merged=mergeFonts(draft.fonts||[],records);await registerFonts(merged);
    if(token!==draftToken)throw new Error('O perfil mudou. Importe a fonte novamente.');draft={...draft,fonts:merged};$('client-font').innerHTML=fontChoices(merged).map(f=>`<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('');$('client-font').value=records[0].id;return 'Fonte pronta. Salve o cliente para preservar o arquivo no perfil.';
    }finally{fontBusy=false;$('save-client').disabled=logoBusy;}
  },{multiple:true});
  connectFileDrop($('client-logo-file'),$('client-logo-drop'),async file=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPG ou WebP.');if(file.size>15*1024*1024)throw new Error('O logo excede 15 MB.');
    const token=draftToken;logoBusy=true;$('save-client').disabled=true;
    try {
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Falha ao ler o logo.'));reader.readAsDataURL(file);});
      const logo={name:file.name,data,kind:'logo',width:1,height:1};const im=await loadImage(logo);logo.width=im.width;logo.height=im.height;
      if(im.width>20000||im.height>20000)throw new Error('Reduza o logo para até 20.000 pixels.');if(token!==draftToken)throw new Error('O perfil mudou durante a importação. Envie o logo novamente.');
      draft={...draft,logo};renderLogo();return `Logo importado: ${file.name}`;
    }finally{logoBusy=false;$('save-client').disabled=fontBusy;}
  });
  connectFileDrop($('client-import-file'),$('client-import-drop'),async file=>{
    if(!/\.json$/i.test(file.name)||file.size>60*1024*1024)throw new Error('Use um perfil .cliente.json de até 60 MB.');
    const client=validateClient(JSON.parse(await file.text()));client.id=uid();client.updatedAt=new Date().toISOString();await saveClient(client);await refresh();loadForm(client);return `Perfil importado: ${client.name}`;
  });
  loadForm(draft);refresh().catch(err=>notify('Não foi possível carregar os clientes: '+err.message));
  return {refresh,syncProject};
}
