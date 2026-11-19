import {carouselMarkup,connectCarousels} from './carousels.js';
import {registerFonts,mergeFonts} from './fonts.js';
import {capturePersonalCollection,validatePersonalCollection,applyPersonalCollection} from './personal-collections.js';
import {savePersonalCollection,listPersonalCollections,deletePersonalCollection} from './storage.js';
import {connectFileDrop} from './imports.js';
import {download,safeName} from './export.js';
import {drawCard,fitCardTypography} from './render.js';
import {buildServiceList} from './service-list.js';
import {uid} from './core.js';

export function setupPersonalCollections({getProject,change,syncInputs,notify}){
  const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let collections=[],generation=0,busy=false,cleanCarousel=()=>{};
  function sync(){
    $('save-personal-collection').disabled=busy||!getProject().cards.length;
    $('apply-personal-collection').disabled=!getProject().cards.length||!$('personal-collection-select').value;
  }
  async function apply(id){
    try{
      const collection=collections.find(c=>c.id===id);if(!collection)throw new Error('Escolha uma coleção pessoal.');
      await registerFonts(mergeFonts(getProject().fonts||[],collection.fonts||[]));
      const project=getProject(),draft={...project,cards:structuredClone(project.cards)},result=applyPersonalCollection(draft,collection,{keepIdentity:$('layout-identity').checked,fitText:$('layout-fit-text').checked});
      change(()=>{project.cards=draft.cards;project.palette=draft.palette;project.theme=draft.theme;project.fonts=draft.fonts;},null);syncInputs();
      if(!$('layouts-view').classList.contains('layout-docked'))document.querySelector('[data-view="editor"]').click();
      notify(`${result.applied} cartela(s) receberam os layouts da coleção. ${result.unmatched.length?'Sem modelo correspondente, mantidas como estavam: '+result.unmatched.join(', ')+'. ':''}Revise textos, fotos e QR. Desfazer recupera o conjunto.`);
    }catch(err){notify(err.message);}
  }
  async function refresh(){
    const token=++generation,previous=$('personal-collection-select').value;
    const saved=await listPersonalCollections();if(token!==generation)return;collections=saved.map(validatePersonalCollection);
    $('personal-collection-select').innerHTML='<option value="">Escolha uma coleção pessoal</option>'+collections.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.templates.length} layouts</option>`).join('');
    if(collections.some(c=>c.id===previous))$('personal-collection-select').value=previous;
    const personalCards=collections.map((c,i)=>`<article class="panel personal-collection"><h3>${esc(c.name)}</h3><p class="hint">${c.templates.length} layouts · ${c.templates.map(t=>({intro:'abertura',services:'serviços',contact:'contato'}[t.kind])).join(' → ')}</p><div class="personal-collection-previews">${c.templates.slice(0,6).map((t,j)=>`<figure><canvas id="personal-preview-${i}-${j}" width="320" height="180" aria-label="Estrutura do layout ${j+1}"></canvas><figcaption>${j+1}. ${{intro:'Abertura',services:'Serviços',contact:'Contato'}[t.kind]}</figcaption></figure>`).join('')}</div>${c.templates.length>6?'<p class="hint">Prévias dos seis primeiros layouts.</p>':''}<div class="properties-actions"><button class="button" data-personal-use="${esc(c.id)}" ${getProject().cards.length?'':'disabled'}>Aplicar ao VT atual</button><button class="text-button" data-personal-export="${esc(c.id)}">Baixar coleção</button><button class="text-button danger" data-personal-delete="${esc(c.id)}">Remover</button></div></article>`);
    cleanCarousel();$('personal-collection-grid').innerHTML=collections.length?carouselMarkup('personal-sets','Minhas coleções',personalCards):'<p class="hint">Ajuste um VT e salve seus layouts como coleção. Textos e materiais do cliente ficam apenas no trabalho.</p>';
    cleanCarousel=connectCarousels($('personal-collection-grid'));

    document.querySelectorAll('[data-personal-use]').forEach(b=>b.onclick=()=>apply(b.dataset.personalUse));
    document.querySelectorAll('[data-personal-export]').forEach(b=>b.onclick=()=>{const c=collections.find(c=>c.id===b.dataset.personalExport);download(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),safeName(c.name)+'.colecao.json');});
    document.querySelectorAll('[data-personal-delete]').forEach(b=>b.onclick=async()=>{try{await deletePersonalCollection(b.dataset.personalDelete);await refresh();notify('Coleção removida da biblioteca. Os trabalhos já montados permanecem salvos.');}catch(err){notify(err.message);}});
    sync();
    for(let i=0;i<collections.length;i++)for(let j=0;j<Math.min(6,collections[i].templates.length);j++){
      if(token!==generation)return;const t=collections[i].templates[j];await registerFonts(collections[i].fonts||[]);const card={layers:structuredClone(t.layers),content:{body:'Serviço em destaque\nAtendimento personalizado\nOutro serviço'}};
      if(t.serviceLayout){const body=card.layers.find(l=>l.role==='body');if(body){body.text=card.content.body;buildServiceList(card,t.palette,undefined,t.serviceLayout);}}
      fitCardTypography(card);await drawCard(card,{},$(`personal-preview-${i}-${j}`));
    }
  }
  $('personal-collection-select').onchange=sync;
  $('apply-personal-collection').onclick=()=>apply($('personal-collection-select').value);
  $('save-personal-collection').onclick=async()=>{
    if(busy)return;busy=true;sync();
    try{const c=capturePersonalCollection(getProject(),$('personal-collection-name').value);await savePersonalCollection(c);await refresh();$('personal-collection-select').value=c.id;$('personal-collection-name').value='';notify('Coleção salva com a estrutura do VT, sem os textos e materiais do cliente.');}catch(err){notify(err.message);}finally{busy=false;sync();}
  };
  connectFileDrop($('personal-collection-file'),$('personal-collection-drop'),async file=>{
    if(file.size>32*1024*1024)throw new Error('A coleção excede 32 MB.');
    let value;try{value=JSON.parse(await file.text());}catch{throw new Error('O arquivo não contém uma coleção válida.');}
    const c=validatePersonalCollection(value);c.id=uid();await savePersonalCollection(c);await refresh();$('personal-collection-select').value=c.id;sync();return 'Coleção importada. Aplique ao trabalho quando quiser.';
  });
  refresh().catch(err=>notify('Não foi possível carregar as coleções pessoais: '+err.message));
  return {refresh,sync};
}
