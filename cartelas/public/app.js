import {applyIdentityElements} from './identity-elements.js';
import {setupVisualDirection} from './visual-direction-ui.js';
import {distributeElements} from './editing.js';
import {setupContacts} from './contact-ui.js';
import {historyShortcut} from './shortcuts.js';
import {setupDeliveries} from './delivery-ui.js';
import {contactItems,buildContactList,contactBody} from './contact-list.js';
import {renderDeliveryReview} from './review.js';
import {fontChoices,registerFonts} from './fonts.js';
import {setupFonts} from './font-ui.js';
import {setupDiskBackups} from './backup-ui.js';
import {FINISHES,SHADOWS,setFinish,setShadow,finishOf,shadowOf} from './finishes.js';
import { blankProject, parseBrief, composeCard, THEMES, EXAMPLE, uid, textLayer, shapeLayer, validateCard, validateProject, qrLayer, defaultQrCard, arrangeQr, repairQrPlacement, orderedPhotoIds, assignPhoto, distributePhotos, removeAsset, ensurePhotoFrame, setQrRequested } from './core.js';
import { drawCard, makeCanvas, textIssues, loadImage, verifyQrAppearance, readQrImage } from './render.js';
import { download, exportCard, sheetBlob, photoshopPackage, safeName, nativePhotoshopPayload } from './export.js';
import { readProject, saveProject, listProjects } from './storage.js';
import { connectFileDrop, preventFileNavigation } from './imports.js';
import {setupClients} from './client-ui.js';
import {applyClientIdentity} from './clients.js';
import {setupTemplates} from './template-ui.js';
import {setupIcons} from './icon-ui.js';
import {ICONS,SOLID_ICONS} from './icons.js';
import {buildServiceList,serviceItems} from './service-list.js';
import {editTargets,bounds,translate,alignPosition,boundedPosition,snapPosition,photoOffset,focusPhoto,logoInset,duplicateElement,resizeBox} from './editing.js';
import {setupIntake} from './intake-ui.js';
import {validateBriefingSources,validateIntakeDraft} from './briefing.js';
import {setupPalettePicker} from './palette-ui.js';
import {applyPaletteColors} from './palette.js';
import {setupPersonalCollections} from './personal-collection-ui.js';
import {setupWorkflow,cardName} from './workflow-ui.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let project=blankProject(), activeId=null, selectedId=null, undoStack=[], redoStack=[], renderVersion=0, saveTimer, saveQueue=Promise.resolve(), toastTimer, busy=false;
let switching=false, revision=0;
let clientUi;
let diskBackups;
let templateUi;
let personalCollectionUi;
let workflowUi;
let iconUi;
let contactUi;
let intakeUi;
let deliveryUi;
let visualDirectionUi;
let multiIds=new Set();
const propGroupsOpen={};
const multiple=()=>active()?.layers.filter(l=>multiIds.has(l.id))||[];
const movingTargets=()=>{const list=multiple().length>1?multiple():editTargets(active(),selected(),$('move-service-group').checked);if(list.some(l=>l.locked||!l.visible))throw Error('Selecione elementos visíveis e desbloqueados.');return list;};
let stageMode='move',guideLines=[];
const snapshot=()=>({...project,palette:{...project.palette},cards:structuredClone(project.cards),assets:project.assets});
const active=()=>project.cards.find(c=>c.id===activeId);
const selected=()=>active()?.layers.find(l=>l.id===selectedId);
const qrTarget=()=>project.cards.find(c=>c.id===$('qr-target-card').value)||defaultQrCard(project);
function toast(message) {$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,7000);}
function checkpoint() {revision++;undoStack.push(snapshot());if(undoStack.length>25)undoStack.shift();redoStack=[];}
function queueSave(state) {
  diskBackups?.schedule(state);
  saveQueue=saveQueue.catch(()=>{}).then(()=>saveProject(state));
  return saveQueue.then(()=>{if(project.id===state.id&&project.updatedAt===state.updatedAt)$('save-state').textContent='Salvo neste navegador';});
}
async function persistNow() {clearTimeout(saveTimer);project.name=$('project-name').value;project.brief=$('brief').value;project.updatedAt=new Date().toISOString();await queueSave(snapshot());}
function scheduleSave() {
  project.updatedAt=new Date().toISOString();$('save-state').textContent='Salvando…';clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{queueSave(snapshot()).catch(()=>{$('save-state').textContent='Falha ao salvar — faça uma cópia';toast('O navegador não conseguiu salvar. Use “Salvar cópia” para preservar o trabalho.');});},250);
}
function change(fn, card=active()) {checkpoint();fn();project.clientApprovedAt=null;if(card)card.approved=false;scheduleSave();render();}
function issues(card,assets=project.assets) {return [...validateCard(card,assets),...textIssues(card),...card.layers.filter(l=>l.visible&&l.layoutPlaceholder).map(l=>`${l.name}: substitua o texto de exemplo do modelo ou remova a camada.`)];}
function syncInputs() {const options=fontChoices(project.fonts||[]);$('font').innerHTML=options.map(f=>`<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('');$('project-name').value=project.name;$('brief').value=project.brief;$('theme').value=project.theme;$('primary-color').value=project.palette.primary;$('accent-color').value=project.palette.accent;$('background-color').value=project.palette.background||THEMES[project.theme].background;$('font').value=project.palette.font;workflowUi?.sync();}
function chooseCard(id) {multiIds.clear();activeId=id;selectedId=null;stageMode='move';guideLines=[];render();}
function chooseLayer(id,extend=false) {if(extend){if(selectedId&&!multiIds.size)multiIds.add(selectedId);multiIds.has(id)?multiIds.delete(id):multiIds.add(id);const details=document.querySelector('.precision-toolbar').closest('details');if(details)details.open=true;}else multiIds.clear();if(id!==selectedId)stageMode='move';selectedId=id;guideLines=[];if(!extend)workflowUi?.showInspector('element');return render();}
function renderProperties() {
  const l=selected(),c=active(),el=$('properties');
  if(!l) {
    el.innerHTML=c?`<p class="hint">Selecione um elemento para ajustar. As instruções abaixo não aparecem na arte.</p><label>Instruções da cartela<textarea id="card-instructions" rows="3">${esc(c.instructions)}</textarea></label><p class="hint">${esc(c.rawContent || '')}</p>`:'<p class="hint">Selecione um elemento na prévia ou na lista de camadas.</p>';
    $('card-instructions')?.addEventListener('change',e=>change(()=>{c.instructions=e.target.value;c.requirements={logo:/logo/i.test(c.instructions),photo:/foto|imagem/i.test(c.instructions),qr:/qr\s*code/i.test(c.instructions)};}));return;
  }
  const n=(label,key,min,max,step=1)=>`<label>${label}<input data-property="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${Math.round(l[key]*100)/100}"></label>`;
  let html=`<label>Nome da camada<input data-property="name" maxlength="100" value="${esc(l.name)}"></label>`;
  if(l.role==='photo')html+=`<fieldset class="quick-presets"><legend>Enquadramento rápido</legend><p class="hint">Escolha a parte da foto que fica visível na moldura.</p><div>${[['left','Esquerda'],['center','Centro'],['right','Direita'],['top','Topo'],['bottom','Base']].map(([id,name])=>`<button class="button" data-photo-focus="${id}" ${l.locked||!l.assetId?'disabled':''}>${name}</button>`).join('')}</div></fieldset>`;
  if(l.role==='logo')html+=`<fieldset class="quick-presets"><legend>Tamanho do logo na área reservada</legend><div>${[['compact','Discreto'],['balanced','Equilibrado'],['full','Amplo']].map(([id,name])=>`<button class="button" data-logo-size="${id}" aria-pressed="${(l.logoInset||0)===logoInset(id)}" ${l.locked?'disabled':''}>${name}</button>`).join('')}</div><p class="hint">Preserva a proporção e o espaço do layout.</p></fieldset>`;
  if(l.type==='text') html+=`<label>Texto<textarea data-property="text" rows="4" maxlength="20000">${esc(l.text)}</textarea></label><div class="two-col">${n('Tamanho','size',8,180)}<label>Cor<input data-property="fill" type="color" value="${l.fill}"></label></div><div class="two-col"><label>Fonte<select data-property="font">${fontChoices(project.fonts||[]).map(f=>`<option value="${esc(f.id)}" ${f.id===l.font?'selected':''}>${esc(f.label)}</option>`).join('')}</select></label><label>Peso<select data-property="weight" ${l.font.startsWith('font-')?'disabled':''}><option value="normal" ${l.weight==='normal'?'selected':''}>Regular</option><option value="bold" ${l.weight==='bold'?'selected':''}>Negrito</option></select></label></div><div class="two-col"><fieldset class="text-alignment"><legend>Alinhamento do texto</legend>${[['left','Esquerda'],['center','Centro'],['right','Direita']].map(([v,t])=>`<button class="button" data-text-align="${v}" aria-pressed="${v===l.align}" ${l.locked?'disabled':''}>${t}</button>`).join('')}</fieldset>${n('Entrelinha','lineHeight',1,2,.05)}</div>`;
  if(l.type==='shape') html+=`<div class="two-col"><label>Cor<input data-property="fill" type="color" value="${l.fill}"></label>${n('Cantos','radius',0,300)}</div><label>Formato<select data-property="form"><option value="rect" ${!l.form||l.form==='rect'?'selected':''}>Retângulo</option><option value="ellipse" ${l.form==='ellipse'?'selected':''}>Elipse / círculo</option><option value="cornerSweep" ${l.form==='cornerSweep'?'selected':''}>Curva de canto</option><option value="slant" ${l.form==='slant'?'selected':''}>Corte diagonal</option><option value="wave" ${l.form==='wave'?'selected':''}>Onda</option></select></label>`;
  if(l.type==='text'&&l.font.startsWith('font-'))html=html.replace(/<select data-property="weight"[^>]*>[\s\S]*?<\/select>/,'<select data-property="weight" disabled><option>Peso e estilo do arquivo importado</option></select>');
  if(l.type==='shape')html+=`<label>Acabamento<select data-finish>${Object.entries(FINISHES).map(([v,label])=>`<option value="${v}" ${finishOf(l)===v?'selected':''}>${label}</option>`).join('')}</select></label><label>Profundidade<select data-shadow>${Object.entries(SHADOWS).map(([v,label])=>`<option value="${v}" ${shadowOf(l)===v?'selected':''}>${label}</option>`).join('')}</select></label><p class="hint">O acabamento acompanha a cor da forma. Use Cor sólida e Sem sombra para remover os efeitos.</p>`;
  if(l.type==='icon')html+=`<label>Símbolo<select data-property="icon">${Object.entries(ICONS).map(([id,item])=>`<option value="${id}" ${id===l.icon?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label>${SOLID_ICONS[l.icon]?`<label>Estilo do símbolo<select data-property="iconVariant"><option value="outline" ${l.iconVariant!=='solid'?'selected':''}>Traço fino</option><option value="solid" ${l.iconVariant==='solid'?'selected':''}>Preenchido</option></select></label>`:''}<div class="two-col"><label>Cor do símbolo<input data-property="fill" type="color" value="${l.fill}"></label>${l.iconVariant!=='solid'?n('Espessura do traço','strokeWidth',.6,3,.1):''}</div>`;
  if(l.type==='shape'&&l.form==='wave')html+=`<label>Lado da onda<select data-property="edge">${[['top','Superior'],['bottom','Inferior'],['left','Esquerdo'],['right','Direito']].map(([id,label])=>`<option value="${id}" ${l.edge===id?'selected':''}>${label}</option>`).join('')}</select></label>`;
  if(l.type==='shape'&&['cornerSweep','slant'].includes(l.form))html+=`<label>${l.form==='slant'?'Canto cortado':'Canto'}<select data-property="corner">${[['tl','Superior esquerdo'],['tr','Superior direito'],['bl','Inferior esquerdo'],['br','Inferior direito']].map(([id,label])=>`<option value="${id}" ${l.corner===id?'selected':''}>${label}</option>`).join('')}</select></label>`;
  if(l.corners)html+=`<div class="two-col">${l.corners.map((v,i)=>`<label>${['Canto superior esquerdo','Canto superior direito','Canto inferior direito','Canto inferior esquerdo'][i]}<input data-corner="${i}" type="number" min="0" max="300" value="${v}"></label>`).join('')}</div>`;
  if(l.role==='qr')html+=`<div class="qr-notice"><strong>QR Code enviado pelo cliente</strong><br>${esc(project.assets[l.assetId]?.name)}<br>Para substituir, importe outra imagem no campo de QR Code. A proporção e a imagem original são preservadas.</div>`;
  if(l.type==='image'&&l.role!=='qr') html+=`<label>Enquadramento<select data-property="fit"><option value="cover" ${l.fit==='cover'?'selected':''}>Preencher / recortar</option><option value="contain" ${l.fit==='contain'?'selected':''}>Mostrar inteira</option></select></label><div class="two-col">${n('Zoom','zoom',1,4,.05)}${n('Cantos','radius',0,300)}</div><div class="two-col">${n('Deslocamento X','offsetX',-1000,1000)}${n('Deslocamento Y','offsetY',-1000,1000)}</div>`;
  if(l.type==='image'&&l.role!=='qr')html+=`<div class="properties-actions"><button id="pan-photo" class="button" ${l.locked||!l.assetId?'disabled':''}>${stageMode==='pan'?'Concluir enquadramento':'Arrastar foto na moldura'}</button><button id="reset-photo" class="text-button" ${l.locked?'disabled':''}>Redefinir enquadramento</button></div><p class="hint">No modo de enquadramento, o arraste move a imagem dentro da moldura. Sua posição e tamanho são mantidos.</p>`;
  html+=`<details class="prop-group" data-prop-group="geometry"><summary>Posição e tamanho</summary><div class="two-col">${n('Posição X','x',-1280,2560)}${n('Posição Y','y',-720,1440)}</div>`;
  html+=l.role==='qr'?n('Tamanho do QR Code','w',160,512):`<div class="two-col">${n('Largura','w',1,2560)}${n('Altura','h',1,1440)}</div>${n('Opacidade (0–1)','opacity',0,1,.05)}`;
  html+='</details>';
  html+=`<details class="prop-group" data-prop-group="actions"><summary>Duplicar, ordem e bloqueio</summary><div class="properties-actions"><button id="duplicate-element" class="text-button" ${l.locked||!l.visible||l.role==='qr'?'disabled':''}>Duplicar elemento</button><button id="toggle-visible" class="text-button">${l.visible?'Ocultar':'Mostrar'}</button><button id="toggle-lock" class="text-button">${l.locked?'Desbloquear':'Bloquear'}</button><button id="layer-up" class="text-button">Trazer à frente</button><button id="layer-down" class="text-button">Enviar para trás</button><button id="remove-layer" class="text-button danger">Excluir camada</button></div></details>`;
  el.innerHTML=html;
  // Secondary groups start collapsed; their open state survives the panel re-render after each edit.
  el.querySelectorAll('[data-prop-group]').forEach(group=>{group.open=!!propGroupsOpen[group.dataset.propGroup];group.addEventListener('toggle',()=>{propGroupsOpen[group.dataset.propGroup]=group.open;});});
  if(l.locked)el.querySelectorAll('input,textarea,select,[data-text-align],[data-finish],[data-shadow],[data-corner]').forEach(input=>input.disabled=true);
  el.querySelectorAll('[data-photo-focus]').forEach(button=>button.onclick=()=>{try{const offset=focusPhoto(l,project.assets[l.assetId],button.dataset.photoFocus);change(()=>Object.assign(l,offset));}catch(error){toast(error.message);}});
  el.querySelectorAll('[data-logo-size]').forEach(button=>button.onclick=()=>change(()=>{l.logoInset=logoInset(button.dataset.logoSize);}));
  el.querySelectorAll('[data-text-align]').forEach(button=>button.onclick=()=>{if(!l.locked&&l.align!==button.dataset.textAlign)change(()=>{l.align=button.dataset.textAlign;});});
  el.querySelector('[data-finish]')?.addEventListener('change',e=>change(()=>setFinish(l,e.target.value)));
  el.querySelector('[data-shadow]')?.addEventListener('change',e=>change(()=>setShadow(l,e.target.value)));
  el.querySelectorAll('[data-property]').forEach(input=>input.addEventListener('change',()=>{
    const key=input.dataset.property;if(l.locked){toast('Desbloqueie o elemento antes de editar.');renderProperties();return;}
    if(input.type==='number'&&(!input.checkValidity()||!Number.isFinite(input.valueAsNumber))) {toast('Valor fora dos limites permitidos.');renderProperties();return;}
    if(key==='text'&&l.role==='body'&&c.contactLayout){try{const draft=structuredClone(c),body=draft.layers.find(x=>x.id===l.id);body.text=input.value;const items=contactItems({...draft,layers:[body]});buildContactList(draft,project.palette,items);change(()=>{c.layers=draft.layers;c.content=draft.content;});}catch(err){toast(err.message);renderProperties();}return;}
    if(key==='text'&&l.role==='body'&&c.serviceLayout){
      try{const draft=structuredClone(c),body=draft.layers.find(x=>x.id===l.id);body.text=input.value;const source={...draft,layers:[body]};const items=serviceItems(source),previous=serviceItems(c),used=new Set();for(const item of items){const old=previous.find(i=>!used.has(i.id)&&i.raw===item.raw);if(old){item.icon=old.icon;item.pending=old.pending;used.add(old.id);}}buildServiceList(draft,project.palette,items);change(()=>{c.layers=draft.layers;c.content=draft.content;});}catch(err){toast(err.message);renderProperties();}return;
    }
    change(()=>{l[key]=input.type==='number'?input.valueAsNumber:input.value;if(key==='form'){if(['cornerSweep','slant'].includes(l.form))l.corner||='tl';if(l.form==='wave')l.edge||='top';else delete l.edge;}if(key==='text'){delete l.layoutPlaceholder;if(l.role==='contactText'){l.serviceRaw=l.text;const body=c.layers.find(b=>b.role==='body');body.text=contactBody(contactItems(c));c.content.body=body.text;}if(l.role==='serviceText'){l.serviceRaw=l.text;const body=c.layers.find(b=>b.role==='body');body.text=serviceItems(c).map(i=>i.raw).join('\n');c.content.body=body.text;}if(l.role==='body'&&c.serviceLayout){const source={...c,layers:c.layers.filter(x=>x.role==='body')};buildServiceList(c,project.palette,serviceItems(source));}}if(key==='fill')delete l.colorToken;if(l.role==='qr'&&key==='w')l.h=l.w;});
  }));
  el.querySelectorAll('[data-corner]').forEach(input=>input.onchange=()=>{if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber)){toast('Canto fora dos limites.');renderProperties();return;}change(()=>l.corners[+input.dataset.corner]=input.valueAsNumber);});
  if(l.role==='body'&&(c.serviceLayout||c.contactLayout)){$('toggle-visible').disabled=true;$('remove-layer').disabled=true;}
  $('toggle-visible').onclick=()=>change(()=>l.visible=!l.visible);
  $('toggle-lock').onclick=()=>change(()=>l.locked=!l.locked);
  $('remove-layer').onclick=()=>{if(l.locked)return toast('Desbloqueie o elemento antes de excluir.');change(()=>{if(l.role==='contactText')buildContactList(c,project.palette,contactItems(c).filter(i=>i.id!==l.serviceId));else if(l.role==='serviceText')buildServiceList(c,project.palette,serviceItems(c).filter(i=>i.id!==l.serviceId));else c.layers=c.layers.filter(x=>x.id!==l.id);selectedId=null;});};
  const move=delta=>{if(l.locked)return;change(()=>{const i=c.layers.indexOf(l),j=i+delta;if(j>=0&&j<c.layers.length)[c.layers[i],c.layers[j]]=[c.layers[j],c.layers[i]];});};
  $('layer-up').onclick=()=>move(1);$('layer-down').onclick=()=>move(-1);
  $('duplicate-element').onclick=()=>{try{const draft=structuredClone(c);if(l.role==='serviceText'){const items=serviceItems(c),i=items.findIndex(item=>item.id===l.serviceId);items.splice(i+1,0,{...items[i],id:uid()});buildServiceList(draft,project.palette,items);change(()=>{c.layers=draft.layers;c.content=draft.content;selectedId=null;});}else{const copy=duplicateElement(draft,draft.layers.find(x=>x.id===l.id));change(()=>{c.layers=draft.layers;selectedId=copy.id;});}}catch(err){toast(err.message);}};
  if($('pan-photo')){$('pan-photo').onclick=()=>{stageMode=stageMode==='pan'?'move':'pan';render();};$('reset-photo').onclick=()=>change(()=>{l.zoom=1;l.offsetX=0;l.offsetY=0;});}
}
const framing=document.createElement('div');framing.id='photo-framing';framing.className='photo-framing';framing.hidden=true;
framing.innerHTML='<button id="frame-photo" class="button">Enquadrar foto</button><label>Zoom <input id="frame-zoom" type="range" min="1" max="4" step="0.05" value="1"><output id="frame-zoom-value">100%</output></label><button id="frame-reset" class="text-button">Centralizar</button><button id="frame-done" class="button primary">Concluir</button>';
document.querySelector('.canvas-wrap').before(framing);
$('frame-photo').onclick=()=>{stageMode='pan';render();};
$('frame-done').onclick=()=>{stageMode='move';render();};
$('frame-reset').onclick=()=>{const l=selected();if(l&&!l.locked)change(()=>{l.zoom=1;l.offsetX=0;l.offsetY=0;});};
$('frame-zoom').oninput=()=>{const l=selected(),c=active();if(!l||l.locked)return;const zoom=$('frame-zoom').valueAsNumber,draft=structuredClone(c),image=draft.layers.find(i=>i.id===l.id);image.zoom=zoom;Object.assign(image,photoOffset(image,project.assets[l.assetId],l.offsetX,l.offsetY));$('frame-zoom-value').textContent=Math.round(zoom*100)+'%';drawCard(draft,project.assets,$('stage'),l.id).catch(err=>toast(err.message));};
$('frame-zoom').onchange=()=>{const l=selected();if(!l||l.locked)return;const zoom=$('frame-zoom').valueAsNumber;change(()=>{l.zoom=zoom;Object.assign(l,photoOffset(l,project.assets[l.assetId],l.offsetX,l.offsetY));});};
async function render() {
  const version=++renderVersion,c=active();
  try{await registerFonts(project.fonts||[]);}catch(error){$('stage').getContext('2d').clearRect(0,0,1280,720);toast(error.message);return;}if(version!==renderVersion)return;
  workflowUi?.sync();
  clientUi?.syncProject();
  templateUi?.sync();
  personalCollectionUi?.sync();
  iconUi?.sync();
  contactUi?.sync();
  intakeUi?.sync();
  deliveryUi?.sync();
  visualDirectionUi?.sync();
  const selection=multiple();$('multi-count').textContent=selection.length>1?selection.length+' elementos selecionados':'Shift + clique nas camadas para selecionar vários';
  document.querySelectorAll('[data-distribute]').forEach(b=>b.disabled=selection.length<3||selection.some(l=>l.locked||!l.visible));
  $('lock-selection').disabled=!selected()&&!selection.length;
  if(stageMode==='pan'&&(!selected()?.visible||selected()?.locked||selected()?.type!=='image'||selected()?.role==='qr'))stageMode='move';
  $('stage-mode').textContent=stageMode==='pan'?'Enquadramento: arraste a foto dentro da moldura.':'Mover elementos · setas: 1 px · Shift + setas: 10 px';
  $('stage').classList.toggle('photo-pan',stageMode==='pan');
  const photo=selected();framing.hidden=document.querySelector('.briefing-panel').dataset.step!=='edicao'||photo?.role!=='photo'||!photo?.assetId||photo.locked||!photo.visible;
  if(!framing.hidden){$('frame-photo').hidden=stageMode==='pan';$('frame-done').hidden=stageMode!=='pan';$('frame-zoom').value=photo.zoom;$('frame-zoom-value').textContent=Math.round(photo.zoom*100)+'%';}
  document.querySelectorAll('[data-align-element]').forEach(b=>b.disabled=!selected()?.visible||selected()?.locked||multiple().some(l=>l.locked||!l.visible));
  document.querySelector('.quick-alignment small').textContent=selected()?`Camada: ${selected().name}${selected().locked?' · desbloqueie para alinhar.':''}`:'Selecione um elemento na prévia ou em Camadas.';
  $('sidebar-name').textContent=project.name||'Novo trabalho';$('project-summary').textContent=`${project.cards.length} cartela(s) · 1280 × 720`;
  $('empty-state').hidden=!!c;$('card-title').textContent=c?cardName(project,c):'Sua primeira cartela';$('card-meta').textContent=c?'1280 × 720 · duplo clique em texto ou foto para editar':'Escolha como receber o pedido para começar';
  const reviewed=project.cards.filter(c=>c.approved).length;
  $('approval-count').textContent=`${reviewed} de ${project.cards.length} revisadas por você`;
  $('approval-state').textContent=c?.approved?'Revisada por você':'Em montagem';$('approval-state').className='pill'+(c?.approved?' approved':'');
  $('approve').textContent=c?.approved?'Reabrir revisão':'Marcar como revisada ✓';
  $('client-approved').disabled=!project.cards.length||reviewed!==project.cards.length;$('client-approved').checked=!!project.clientApprovedAt;
  $('client-approval-state').textContent=reviewed!==project.cards.length||!project.cards.length?'Revise todas as cartelas antes de registrar a aprovação do cliente.':project.clientApprovedAt?'Aprovação do cliente registrada por você.':'Depois de enviar a imagem e receber a resposta, registre a aprovação do cliente aqui.';
  const previousTarget=$('qr-target-card').value;
  $('qr-target-card').innerHTML=project.cards.map(card=>`<option value="${card.id}">${esc(card.label)}${/qr\s*code/i.test(card.instructions)?' · pede QR Code':''}</option>`).join('');
  $('qr-target-card').value=project.cards.some(card=>card.id===previousTarget)?previousTarget:defaultQrCard(project)?.id||'';
  const qrCard=qrTarget(),qr=qrCard?.layers.find(l=>l.role==='qr');$('qr-destination').textContent=qr?`Em ${qrCard.label}: ${project.assets[qr.assetId]?.name||'QR Code'}`:qrCard?`O arquivo será colocado em ${qrCard.label}.`:'';
  $('qr-target-card').disabled=!project.cards.length;$('position-qr').disabled=!qr;$('move-qr').disabled=!project.cards.some(card=>card.layers.some(l=>l.role==='qr'));
  const hasQr=project.cards.some(card=>card.requirements.qr||card.layers.some(l=>l.role==='qr'));$('include-qr').checked=hasQr;$('include-qr').disabled=!project.cards.length;$('qr-options').hidden=!hasQr;
  $('photo-import-target').innerHTML=project.cards.map(card=>`<option value="${card.id}">${esc(cardName(project,card))}</option>`).join('');$('photo-import-target').value=activeId||'';$('photo-import-target').disabled=!project.cards.length;
  $('redistribute-photos').disabled=!project.cards.length||!orderedPhotoIds(project).length;
  for(const id of ['approve','duplicate','move-left','move-right','delete-card','add-text','add-shape','export-card'])$(id).disabled=!c;
  $('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;
  const problems=c?issues(c):[];$('validation').className='validation'+(c&&!problems.length?' ok':'');
  if($('preview-checks-label')){$('preview-checks-label').textContent=problems.length?`${problems.length} ponto(s) para conferir nesta cartela`:'Nenhuma pendência automática nesta cartela';$('preview-checks-label').parentElement.classList.toggle('has-issues',!!problems.length);}
  const fix=(card,problem)=>{chooseCard(card.id);const role=/QR Code|QR solicitado/i.test(problem)?'qr':/Adicione o logo/i.test(problem)?'logo':/Adicione a foto/i.test(problem)?'photo':null;
    if(role){workflowUi.go('materiais');if(role==='qr')$('qr-target-card').value=card.id;$(role+'-drop').focus();return;}
    const layer=card.layers.find(l=>l.visible&&problem.startsWith(l.name+':'));workflowUi.go('edicao');if(layer)chooseLayer(layer.id);$('properties').scrollIntoView({block:'nearest'});
  };
  $('validation').replaceChildren();if(c&&problems.length)for(const problem of problems){const button=document.createElement('button');button.className='issue-action';button.textContent=problem+' → Corrigir';button.onclick=()=>fix(c,problem);$('validation').append(button);}else $('validation').textContent=c?'Confira o conteúdo e marque a cartela como revisada.':'Organize um pedido para montar as cartelas.';
  renderDeliveryReview(project,issues,fix,(card,{stay=false}={})=>{chooseCard(card.id);if(!stay)workflowUi.go('edicao');});
  $('layer-list').innerHTML=c?[...c.layers].reverse().map(l=>`<button class="layer ${l.id===selectedId||multiIds.has(l.id)?'active':''}" data-layer="${l.id}"><span>${l.type==='text'?'T':l.type==='image'?'▧':l.type==='icon'?'◇':'▰'}</span>${esc(l.name)}<small>${!l.visible?'oculta':l.locked?'bloqueada':''}</small></button>`).join(''):'<p class="hint">As camadas aparecerão aqui.</p>';
  document.querySelectorAll('[data-layer]').forEach(b=>b.onclick=e=>chooseLayer(b.dataset.layer,e.shiftKey));renderProperties();
  renderAssets();
  $('filmstrip').innerHTML=project.cards.map((card,i)=>`<button class="thumbnail ${card.id===activeId?'active':''}" data-card="${card.id}"><canvas width="320" height="180" id="thumb-${i}"></canvas><span>${esc(cardName(project,card))} ${card.approved?'✓':''}</span></button>`).join('');
  document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>chooseCard(b.dataset.card));
  enablePhotoDrop($('stage'),c);document.querySelectorAll('[data-card]').forEach(b=>enablePhotoDrop(b,project.cards.find(card=>card.id===b.dataset.card)));
  try {
    if(c) {const off=makeCanvas();await drawCard(c,project.assets,off,multiIds.size>1?[...multiIds]:selectedId,true,$('show-safe-guides').checked?[...guideLines,...[80,1200].map(value=>({axis:'x',value})),...[80,640].map(value=>({axis:'y',value}))]:guideLines);if(version!==renderVersion)return;$('stage').getContext('2d').clearRect(0,0,1280,720);$('stage').getContext('2d').drawImage(off,0,0);}
    for(let i=0;i<project.cards.length;i++) {if(version!==renderVersion)return;const thumb=$(`thumb-${i}`);if(thumb)await drawCard(project.cards[i],project.assets,thumb);}
  } catch(err) {toast(err.message);}
}
function renderAssets() {
  const photos=orderedPhotoIds(project);
  const ids=[...Object.keys(project.assets).filter(id=>project.assets[id].kind!=='photo'&&project.assets[id].kind!=='qr'),...photos];
  const assetHtml=id=>{
    const a=project.assets[id],photo=a.kind==='photo',index=photos.indexOf(id);
    const used=project.cards.filter(card=>card.layers.some(l=>l.assetId===id)).map(card=>card.label);
    return `<div class="asset-item asset-card" ${photo?`data-photo-id="${id}" draggable="true"`:''}><img src="${a.data}" alt="" draggable="false"><div class="asset-details"><strong>${photo?`${index+1}. `:''}${esc(a.name)}</strong><small>${esc(used.join(', ')||'Disponível na biblioteca')}</small>${photo?`<select data-photo-target="${id}" aria-label="Usar ${esc(a.name)} na cartela" ${project.cards.length?'':'disabled'}><option value="">Usar na cartela…</option>${project.cards.map(card=>`<option value="${card.id}">${esc(card.label)}</option>`).join('')}</select>`:''}<div class="asset-controls">${photo?`<button class="text-button" data-photo-up="${id}" aria-label="Subir foto ${esc(a.name)}" ${index===0?'disabled':''}>↑</button><button class="text-button" data-photo-down="${id}" aria-label="Descer foto ${esc(a.name)}" ${index===photos.length-1?'disabled':''}>↓</button>`:''}<button class="text-button danger" data-remove-asset="${id}" aria-label="Remover ${esc(a.name)}">Remover</button></div></div></div>`;
  };
  $('asset-list').innerHTML=photos.map(assetHtml).join('');
  $('logo-assets').innerHTML=ids.filter(id=>project.assets[id].kind!=='photo').map(assetHtml).join('');
  $('qr-assets').innerHTML=Object.keys(project.assets).filter(id=>project.assets[id].kind==='qr').map(assetHtml).join('');
  document.querySelectorAll('[data-remove-asset]').forEach(b=>b.onclick=()=>{change(()=>{removeAsset(project,b.dataset.removeAsset);if(selected()?.assetId===null)selectedId=null;},null);toast('Material removido do trabalho. Use desfazer para restaurar.');});
  document.querySelectorAll('[data-photo-target]').forEach(select=>select.onchange=()=>{const card=project.cards.find(c=>c.id===select.value);if(!card)return;change(()=>assignPhoto(project,card,select.dataset.photoTarget),null);toast(`Foto aplicada em ${card.label}.`);});
  const reorder=(id,to)=>{const ids=orderedPhotoIds(project),from=ids.indexOf(id);if(from<0||to<0||to>=ids.length||from===to)return;change(()=>{ids.splice(from,1);ids.splice(to,0,id);project.photoOrder=ids;distributePhotos(project);},null);};
  document.querySelectorAll('[data-photo-up]').forEach(b=>b.onclick=()=>reorder(b.dataset.photoUp,photos.indexOf(b.dataset.photoUp)-1));
  document.querySelectorAll('[data-photo-down]').forEach(b=>b.onclick=()=>reorder(b.dataset.photoDown,photos.indexOf(b.dataset.photoDown)+1));
  document.querySelectorAll('[data-photo-id]').forEach(row=>{
    row.ondragstart=e=>{if(e.target.closest('button,select')){e.preventDefault();return;}e.dataTransfer.setData('application/x-cartelas-photo',row.dataset.photoId);e.dataTransfer.effectAllowed='move';};
    row.ondragover=e=>{if(Array.from(e.dataTransfer.types).includes('application/x-cartelas-photo')){e.preventDefault();e.dataTransfer.dropEffect='move';row.classList.add('photo-over');}};
    row.ondragleave=()=>row.classList.remove('photo-over');row.ondragend=()=>document.querySelectorAll('.photo-over').forEach(el=>el.classList.remove('photo-over'));
    row.ondrop=e=>{const id=e.dataTransfer.getData('application/x-cartelas-photo');if(!id)return;e.preventDefault();e.stopPropagation();row.classList.remove('photo-over');reorder(id,photos.indexOf(row.dataset.photoId));};
  });
}
$('qr-target-card').onchange=()=>render();
document.addEventListener('change',e=>{if(e.target.id==='photo-import-target')chooseCard(e.target.value);});
document.addEventListener('change',e=>{if(e.target.id==='include-qr'){try{change(()=>setQrRequested(project,e.target.checked,$('qr-target-card').value),null);}catch(err){toast(err.message);render();}}});
$('position-qr').onclick=()=>{const target=qrTarget();if(target)change(()=>arrangeQr(target),null);};
$('move-qr').onclick=()=>{
  const target=qrTarget();if(!target)return;
  const sources=project.cards.filter(card=>card.layers.some(l=>l.role==='qr'));
  const source=active()?.layers.some(l=>l.role==='qr')?active():sources.length===1?sources[0]:null;
  if(!source)return toast('Selecione a cartela que contém o QR que deseja mover.');
  if(target!==source&&target.layers.some(l=>l.role==='qr'))return toast('A cartela de destino já contém um QR. Remova essa camada antes de mover outro.');
  change(()=>{const qr=source.layers.find(l=>l.role==='qr');if(target!==source){source.layers=source.layers.filter(l=>l!==qr);source.requirements.qr=/qr\s*code/i.test(source.instructions);source.approved=false;target.layers.push(qr);target.requirements.qr=true;}arrangeQr(target);activeId=target.id;selectedId=qr.id;},null);
};
$('redistribute-photos').onclick=()=>{let count=0;change(()=>{project.photoOrder=orderedPhotoIds(project);count=distributePhotos(project);},null);toast(`${count} cartela(s) atualizada(s). Fotos excedentes ficam disponíveis na lista.`);};

$('project-name').addEventListener('change',e=>change(()=>project.name=e.target.value,null));
$('brief').addEventListener('change',e=>change(()=>project.brief=e.target.value,null));
$('load-example').onclick=()=>{change(()=>{project.brief=EXAMPLE;project.name='Dra. Victoria · apresentação';},null);syncInputs();toast('Exemplo carregado. Clique em “Organizar cartelas”.');};
// After organizing, list what each card received so texts can be checked before adding materials.
function showOrganizedSummary(){
  const pane=document.getElementById('workflow-materiais');if(!pane)return;
  let box=document.getElementById('organized-summary');
  if(!box){box=document.createElement('section');box.id='organized-summary';box.className='organized-summary';box.setAttribute('aria-label','Cartelas organizadas');pane.prepend(box);}
  const snippet=c=>{const t=c.layers.filter(l=>l.type==='text'&&l.visible!==false).map(l=>l.text.replace(/\s+/g,' ').trim()).filter(Boolean).join(' · ');return t.length>110?t.slice(0,107)+'…':t;};
  box.innerHTML=`<div class="organized-head"><strong>${project.cards.length} cartela(s) organizada(s)</strong><span class="hint">Confira os textos. Clique numa cartela para editá-la.</span><button type="button" class="text-button" data-close-summary>Fechar</button></div><ol>${project.cards.map(c=>`<li><button type="button" data-review-card="${esc(c.id)}"><b>${esc(cardName(project,c))}</b><span>${esc(snippet(c))||'Sem texto'}</span></button></li>`).join('')}</ol>`;
  box.querySelector('[data-close-summary]').onclick=()=>box.remove();
  box.querySelectorAll('[data-review-card]').forEach(b=>b.onclick=()=>{workflowUi.go('edicao');chooseCard(b.dataset.reviewCard);});
  window.scrollTo({top:0});
}
document.addEventListener('cartelas:step',e=>{if(e.detail!=='materiais')document.getElementById('organized-summary')?.remove();});
$('parse').onclick=()=>{
  try {
    const result=parseBrief($('brief').value);
    if(project.cards.length&&!confirm('Organizar novamente substituirá as cartelas e seus ajustes. Deseja continuar?'))return;
    checkpoint();project.brief=$('brief').value;project.cards=result.cards.map(c=>composeCard(c,project.theme,project.palette));
    const logo=project.clientIdentity?(project.clientIdentity.logoAssetId?[project.clientIdentity.logoAssetId,project.assets[project.clientIdentity.logoAssetId]]:null):Object.entries(project.assets).reverse().find(([,a])=>a.kind==='logo');if(logo)for(const c of project.cards){const l=c.layers.find(l=>l.role==='logo');if(l)l.assetId=logo[0];}
    distributePhotos(project);
    activeId=project.cards[0]?.id;selectedId=null;project.clientApprovedAt=null;scheduleSave();render();workflowUi.go('materiais');showOrganizedSummary();toast(result.notes[0]||`${project.cards.length} cartelas organizadas. Confira os textos abaixo e adicione os materiais.`);
  } catch(err) {toast(err.message);}
};
$('theme').onchange=()=>{const defaults=THEMES[$('theme').value];$('primary-color').value=defaults.primary;$('accent-color').value=defaults.accent;$('background-color').value=defaults.background;$('font').value=defaults.font;};
$('apply-colors').onclick=()=>{try{change(()=>applyPaletteColors(project,{primary:$('primary-color').value,accent:$('accent-color').value,background:$('background-color').value}),null);toast('Cores aplicadas mantendo posições, fotos e textos. Confira os contrastes.');}catch(err){toast(err.message);}};
$('apply-theme').onclick=()=>{
  if(project.cards.length&&!confirm('Aplicar a direção visual recompõe posições, recortes e estilos. Textos e imagens serão mantidos. Continuar?'))return;
  change(()=>{project.theme=$('theme').value;project.palette={...THEMES[project.theme],primary:$('primary-color').value,accent:$('accent-color').value,background:$('background-color').value,font:$('font').value};project.cards.forEach(c=>composeCard(c,project.theme,project.palette));},null);
};
async function importAsset(file,kind) {
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPG ou WebP.');
  if(file.size>15*1024*1024)throw new Error('A imagem excede 15 MB.');
  const targetCard=kind==='qr'?qrTarget():active();
  if(kind!=='logo'&&!targetCard)throw new Error('Organize ou adicione uma cartela antes de enviar este material.');
  const projectId=project.id,targetLayer=selected();
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Falha ao ler a imagem.'));r.readAsDataURL(file);});
  if(Object.values(project.assets).reduce((n,a)=>n+a.data.length,0)+data.length>60*1024*1024)throw new Error('O conjunto de materiais excede o limite desta versão. Reduza as imagens antes de importar.');
  const asset={name:file.name,data,kind,width:1,height:1};const im=await loadImage(asset);asset.width=im.width;asset.height=im.height;
  if(im.width>20000||im.height>20000)throw new Error('Imagem muito grande. Reduza as dimensões para até 20.000 pixels.');
  if(kind==='qr')asset.qrContent=await readQrImage(asset);
  if(project.id!==projectId || (kind!=='logo'&&!project.cards.includes(targetCard)))throw new Error('O trabalho ou a cartela mudou durante a importação. Envie o arquivo novamente.');
  const id=uid();change(()=>{
    project.assets={...project.assets,[id]:asset};
    if(kind==='logo'&&project.clientIdentity)project.clientIdentity={...project.clientIdentity,logoAssetId:id};
    if(kind==='logo') for(const card of project.cards) {let l=card.layers.find(l=>l.role==='logo');if(!l){l={id:uid(),type:'image',role:'logo',name:'Logo',x:60,y:42,w:240,h:88,radius:0,assetId:id,fit:'contain',zoom:1,offsetX:0,offsetY:0,opacity:1,visible:true,locked:false};card.layers.push(l);}l.assetId=id;card.approved=false;}
    else if(kind==='qr') {
      const c=targetCard;let l=c.layers.find(l=>l.role==='qr');
      if(l){l.assetId=id;l.qrContent=asset.qrContent;delete l.qrTarget;l.fit='contain';l.zoom=1;l.offsetX=0;l.offsetY=0;l.radius=0;l.opacity=1;l.visible=true;l.h=l.w;}
      else {l=qrLayer(id,asset.qrContent);c.layers.push(l);}
      c.requirements.qr=true;arrangeQr(c);activeId=c.id;selectedId=l.id;
    }
    else {const c=targetCard;let l=targetLayer?.type==='image'&&!['logo','qr'].includes(targetLayer.role)&&c.layers.includes(targetLayer)?targetLayer:c.layers.find(l=>l.role==='photo');if(!l){c.requirements.photo=true;l=ensurePhotoFrame(c,project.theme,project.palette);}l.assetId=id;if(activeId===c.id)selectedId=l.id;}
  },kind!=='logo'?targetCard:null);toast('Material adicionado.');
}
preventFileNavigation();
for(const [id,zone,kind] of [['logo-file','logo-drop','logo'],['qr-file','qr-drop','qr']])connectFileDrop($(id),$(zone),async file=>{await importAsset(file,kind);return `Arquivo importado: ${file.name}`;});
connectFileDrop($('photo-file'),$('photo-drop'),async files=>{
  if(files.length>20)throw new Error('Importe até 20 fotos por vez.');
  const projectId=project.id,startRevision=revision,targetCard=active();
  const assets=await Promise.all(files.map(async file=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPG ou WebP para todas as fotos.');
    if(file.size>15*1024*1024)throw new Error(`${file.name}: a imagem excede 15 MB.`);
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Falha ao ler '+file.name));r.readAsDataURL(file);});
    const asset={name:file.name,data,kind:'photo',width:1,height:1};const im=await loadImage(asset);asset.width=im.width;asset.height=im.height;
    if(im.width>20000||im.height>20000)throw new Error('Imagem muito grande: '+file.name);return {id:uid(),asset};
  }));
  if(project.id!==projectId||revision!==startRevision)throw new Error('O trabalho mudou durante a importação. Envie as fotos novamente.');
  if([...Object.values(project.assets),...assets.map(a=>a.asset)].reduce((n,a)=>n+a.data.length,0)>60*1024*1024)throw new Error('O conjunto de materiais excede o limite desta versão. Reduza as imagens antes de importar.');
  let count=0;change(()=>{
    project.assets={...project.assets,...Object.fromEntries(assets.map(a=>[a.id,a.asset]))};project.photoOrder=orderedPhotoIds(project);
    if(files.length===1&&targetCard){assignPhoto(project,targetCard,assets[0].id);count=1;}
    else count=distributePhotos(project,{fillOnly:true,ids:assets.map(a=>a.id)});
  },null);
  return `${files.length} foto(s) importada(s); ${count} cartela(s) preenchida(s).`;
},{multiple:true});
$('add-card').onclick=()=>{
  if(project.cards.length>=20)return toast('Limite de 20 cartelas por trabalho.');
  change(()=>{const c={id:uid(),label:`Cartela ${project.cards.length+1}`,instructions:'',rawContent:'',content:{title:'Seu título',body:'Texto complementar'},kind:'intro',requirements:{logo:false,photo:false,qr:false},approved:false,layers:[]};composeCard(c,project.theme,project.palette);project.cards.push(c);activeId=c.id;selectedId=null;},null);
};
$('duplicate').onclick=()=>{if(project.cards.length>=20)return toast('Limite de 20 cartelas.');change(()=>{const c=structuredClone(active());c.id=uid();c.label+=' · cópia';c.approved=false;c.layers.forEach(l=>l.id=uid());project.cards.splice(project.cards.findIndex(x=>x.id===activeId)+1,0,c);activeId=c.id;selectedId=null;},null);};
const moveCard=delta=>{const i=project.cards.findIndex(c=>c.id===activeId),j=i+delta;if(j<0||j>=project.cards.length)return;change(()=>[project.cards[i],project.cards[j]]=[project.cards[j],project.cards[i]],null);};
$('move-left').onclick=()=>moveCard(-1);$('move-right').onclick=()=>moveCard(1);
$('delete-card').onclick=()=>{if(!confirm('Excluir esta cartela? Você poderá desfazer.'))return;change(()=>{const i=project.cards.findIndex(c=>c.id===activeId);project.cards.splice(i,1);activeId=project.cards[Math.min(i,project.cards.length-1)]?.id||null;selectedId=null;},null);};
$('add-text').onclick=()=>change(()=>{const l=textLayer('Novo texto','Edite seu texto',90,250,650,140,40,project.palette.primary);l.role='custom';active().layers.push(l);selectedId=l.id;});
$('add-shape').onclick=()=>change(()=>{const l=shapeLayer('Nova forma',100,400,300,100,project.palette.accent,{role:'custom'});active().layers.push(l);selectedId=l.id;});
$('approve').onclick=async()=>{const c=active();if(!c)return;if(c.approved){change(()=>c.approved=false);return;}const pending=issues(c);if(pending.length)return toast('Resolva as pendências antes de marcar como revisada: '+pending[0]);const startRevision=revision;try{await verifyQrAppearance(c,project.assets);if(revision!==startRevision||!project.cards.includes(c))throw new Error('A cartela mudou durante a conferência. Revise e aprove novamente.');checkpoint();c.approved=true;scheduleSave();render();}catch(err){toast(err.message);}};
$('client-approved').onchange=()=>{checkpoint();project.clientApprovedAt=$('client-approved').checked?new Date().toISOString():null;scheduleSave();render();};
function travel(from,to) {if(!from.length)return;revision++;to.push(snapshot());project=from.pop();activeId=project.cards.some(c=>c.id===activeId)?activeId:project.cards[0]?.id||null;selectedId=active()?.layers.some(l=>l.id===selectedId)?selectedId:null;stageMode='move';guideLines=[];syncInputs();scheduleSave();render();}
$('undo').onclick=()=>travel(undoStack,redoStack);$('redo').onclick=()=>travel(redoStack,undoStack);
document.addEventListener('keydown',event=>{
  const action=historyShortcut(event);
  if(!action||$('editor-view').hidden||document.querySelector('dialog[open]')||document.querySelector('main').inert||busy||drag)return;
  event.preventDefault();
  if(action==='undo')travel(undoStack,redoStack);else travel(redoStack,undoStack);
});
async function switchWork(load) {
  if(switching)return;switching=true;document.querySelector('main').inert=true;
  try {
    await persistNow();const next=await load();if(!next)throw new Error('Trabalho indisponível.');
    const validated=validateProject(next);repairQrPlacement(validated);await queueSave(validated);
    project=validated;revision++;undoStack=[];redoStack=[];activeId=project.cards[0]?.id||null;selectedId=null;syncInputs();for(const id of ['logo-drop','photo-drop','qr-drop']){$(id).querySelector('.drop-status').textContent='';$(id).classList.remove('drop-error');}render();
    document.querySelector('[data-view="editor"]').click();
  } finally {switching=false;document.querySelector('main').inert=false;}
}
$('new-project').onclick=async()=>{try{await switchWork(async()=>blankProject());toast('Novo trabalho criado. O anterior continua em “Trabalhos salvos”.');}catch(err){toast('Não foi possível iniciar outro trabalho: '+err.message);}};
$('backup').onclick=()=>{project.brief=$('brief').value;project.name=$('project-name').value;download(new Blob([JSON.stringify(project)],{type:'application/json'}),safeName(project.name)+'.cartelas.json');scheduleSave();};
$('restore').onclick=()=>$('restore-file').click();
connectFileDrop($('restore-file'),$('restore-drop'),async file=>{
  if(!/\.json$/i.test(file.name))throw new Error('Use uma cópia .cartelas.json ou .json.');
  if(file.size>100*1024*1024)throw new Error('A cópia excede 100 MB.');
  const loaded=validateProject(JSON.parse(await file.text()));
  // A cópia importada recebe um novo identificador para preservar versões já salvas.
  loaded.id=uid();loaded.updatedAt=new Date().toISOString();await switchWork(async()=>loaded);toast('Cópia aberta. O trabalho anterior foi preservado.');return `Cópia aberta: ${file.name}`;
});
async function approvedSnapshot() {
  const state=snapshot();if(!state.cards.length)throw new Error('Monte ao menos uma cartela.');
  for(const c of state.cards){const pending=issues(c,state.assets);if(pending.length)throw new Error(`${c.label}: ${pending[0]}`);if(!c.approved)throw new Error(`Marque ${c.label} como revisada antes de entregar o conjunto.`);await verifyQrAppearance(c,state.assets);}
  return state;
}
async function runExport(button,fn) {if(!$('layout-comparison').hidden)return toast('Aplique ou feche a prévia de layout antes de exportar.');if(busy)return;busy=true;const previous=button.textContent;button.textContent='Preparando…';button.disabled=true;try{await registerFonts(project.fonts||[]);await fn();toast('Arquivo preparado para download.');}catch(err){toast(err.message);}finally{busy=false;button.textContent=previous;button.disabled=false;}}
$('export-card').onclick=()=>runExport($('export-card'),async()=>{const state=snapshot();const c=state.cards.find(c=>c.id===activeId);const pending=issues(c,state.assets);if(pending.length)throw new Error(pending[0]);await verifyQrAppearance(c,state.assets);const canvas=makeCanvas();await drawCard(c,state.assets,canvas,null,false);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Não foi possível gerar a imagem.');try{await deliveryUi.record(state,'png',{blob,cardCount:1});}catch(e){notifyHistoryFailure(e);}download(blob,safeName(c.label)+'.png');});
$('export-sheet').onclick=()=>runExport($('export-sheet'),async()=>{const direction=$('sheet-direction').value;const state=await approvedSnapshot(),blob=await sheetBlob(state,direction);try{await deliveryUi.record(state,'approval',{blob});}catch(e){notifyHistoryFailure(e);}download(blob,safeName(state.name)+'-aprovacao.png');});
function notifyHistoryFailure(error){toast('O arquivo foi gerado, mas não ficou no histórico: '+error.message);}
$('export-photoshop').onclick=()=>runExport($('export-photoshop'),async()=>{const state=await approvedSnapshot();download(await photoshopPackage(state),safeName(state.name)+'-photoshop.zip');});
async function checkPhotoshop(){
  $('photoshop-status').textContent='Verificando Photoshop…';
  try{const response=await fetch('api/photoshop/availability');const result=await response.json();$('photoshop-status').textContent=result.available?`Photoshop conectado · ${result.version}`:result.message;return result.available;}catch{$('photoshop-status').textContent='Não foi possível verificar o Photoshop. Confirme que o aplicativo local está funcionando.';return false;}
}
$('check-photoshop').onclick=checkPhotoshop;
$('export-psd').onclick=()=>runExport($('export-psd'),async()=>{
  const state=await approvedSnapshot();if(!await checkPhotoshop())throw new Error('Abra o Photoshop e tente novamente.');
  const payload=await nativePhotoshopPayload(state);$('photoshop-progress').textContent='Preparando a entrega no Photoshop…';
  const response=await fetch('api/photoshop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const job=await response.json();if(!response.ok)throw new Error(job.error||'Não foi possível iniciar a entrega.');
  try{await deliveryUi.record(state,'psd',{jobId:job.id});}catch(e){notifyHistoryFailure(e);}
  $('psd-download').hidden=true;let status;
  for(let attempt=0;attempt<600;attempt++){
    const response=await fetch('api/photoshop/status/'+job.id);status=await response.json();if(!response.ok)throw new Error(status.error||'Entrega indisponível.');
    if(status.state==='error'){$('photoshop-progress').textContent='A entrega não foi concluída.';throw new Error(status.message);}
    if(status.state==='complete')break;
    $('photoshop-progress').textContent=status.state==='queued'?'Entrega aguardando sua vez…':`Montando um PSD com ${state.cards.length} grupos de cartelas…`;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(status?.state!=='complete')throw new Error('A entrega ainda está em processamento. Aguarde o Photoshop concluir.');
  const filename=safeName(state.name)+'-psds.zip';$('psd-download').href='api/photoshop/download/'+job.id;$('psd-download').download=filename;$('psd-download').hidden=false;
  $('photoshop-progress').textContent=`Entrega de ${state.name} pronta: um PSD com ${status.count} grupos de cartelas, textos editáveis e prévias.`;
  // Let the browser download the file directly, without a second full ZIP in JS memory.
  $('psd-download').click();
  await deliveryUi.refresh();
});

const precision=document.createElement('div');precision.className='selection-tools';
precision.innerHTML='<span id="multi-count" class="hint"></span><div class="properties-actions"><button data-distribute="x" class="button">Espaçar na horizontal</button><button data-distribute="y" class="button">Espaçar na vertical</button><button id="lock-selection" class="button">Bloquear / desbloquear seleção</button><label class="check-label"><input id="show-safe-guides" type="checkbox"> Mostrar margens</label></div>';
document.querySelector('.precision-toolbar').append(precision);
document.querySelectorAll('[data-distribute]').forEach(b=>b.onclick=()=>{try{const selected=multiple(),draft=structuredClone(selected);distributeElements(draft,b.dataset.distribute);change(()=>selected.forEach((l,i)=>Object.assign(l,draft[i])));}catch(e){toast(e.message);}});
$('lock-selection').onclick=()=>{const layers=multiple().length?multiple():[selected()].filter(Boolean);if(layers.length)change(()=>{const lock=layers.some(l=>!l.locked);layers.forEach(l=>l.locked=lock);});};
$('show-safe-guides').onchange=()=>render();
let drag=null;
function point(e) {const rect=$('stage').getBoundingClientRect();return {x:(e.clientX-rect.left)*1280/rect.width,y:(e.clientY-rect.top)*720/rect.height};}
document.querySelectorAll('[data-align-element]').forEach(button=>button.onclick=()=>{
  try{const layers=movingTargets(),box=bounds(layers),desired=alignPosition(box,button.dataset.alignElement,+$('alignment-reference').value),pos=boundedPosition(box,desired.x,desired.y);if(pos.x!==box.x||pos.y!==box.y)change(()=>translate(layers,pos.x-box.x,pos.y-box.y));}catch(err){toast(err.message);}
});
$('stage').onkeydown=e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();try{
    const amount=e.shiftKey?10:1,l=selected();
    if(stageMode==='pan'&&l?.type==='image'&&l.role!=='qr'&&!l.locked){const pos=photoOffset(l,project.assets[l.assetId],l.offsetX+(e.key==='ArrowLeft'?-amount:e.key==='ArrowRight'?amount:0),l.offsetY+(e.key==='ArrowUp'?-amount:e.key==='ArrowDown'?amount:0));change(()=>Object.assign(l,pos));return;}
    const layers=movingTargets(),box=bounds(layers),pos=boundedPosition(box,box.x+(e.key==='ArrowLeft'?-amount:e.key==='ArrowRight'?amount:0),box.y+(e.key==='ArrowUp'?-amount:e.key==='ArrowDown'?amount:0));change(()=>translate(layers,pos.x-box.x,pos.y-box.y));
  }catch(err){toast(err.message);}
};
$('stage').onpointerdown=e=>{
  if(e.button!==0)return;const c=active();if(!c)return;const p=point(e);
  const chosen=selected(),resize=stageMode!=='pan'&&chosen?.visible&&!chosen.locked&&Math.abs(p.x-chosen.x-chosen.w)<16&&Math.abs(p.y-chosen.y-chosen.h)<16;
  const pan=stageMode==='pan',l=resize?chosen:pan?selected():[...c.layers].reverse().find(l=>l.visible&&!l.locked&&p.x>=l.x&&p.x<=l.x+l.w&&p.y>=l.y&&p.y<=l.y+l.h);
  if(pan&&(!l||p.x<l.x||p.x>l.x+l.w||p.y<l.y||p.y>l.y+l.h))return;
  if(e.shiftKey&&l){chooseLayer(l.id,true);return;}
  if(!l||!multiIds.has(l.id))multiIds.clear();
  selectedId=l?.id||null;guideLines=[];
  if(l)workflowUi?.showInspector('element');
  if(l&&document.querySelector('.briefing-panel').dataset.step!=='edicao'){workflowUi.go('edicao');render();return;}
  if(l)try{const layers=!pan&&!resize&&multiIds.size>1?movingTargets():editTargets(c,l,!pan&&!resize&&$('move-service-group').checked&&!e.altKey),box=bounds(layers);drag={layer:l,card:c,mode:resize?'resize':pan?'pan':'move',layers,initial:layers.map(l=>({x:l.x,y:l.y})),box,start:p,original:{...l},offsetX:l.offsetX,offsetY:l.offsetY,changed:false};$('stage').setPointerCapture(e.pointerId);$('stage').focus({preventScroll:true});}catch(err){toast(err.message);}
  render();
};
$('stage').onpointermove=e=>{
  if(!drag)return;if(active()!==drag.card||!drag.card.layers.includes(drag.layer)){finishDrag();return;}
  const p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(!drag.changed&&Math.abs(dx)+Math.abs(dy)>3){checkpoint();drag.changed=true;}if(!drag.changed)return;
  if(drag.mode==='resize'){try{Object.assign(drag.layer,resizeBox(drag.original,dx,dy));}catch(err){toast(err.message);finishDrag();return;}}
  else if(drag.mode==='pan')Object.assign(drag.layer,photoOffset(drag.layer,project.assets[drag.layer.assetId],drag.offsetX+dx,drag.offsetY+dy));
  else{
    let pos=boundedPosition(drag.box,drag.box.x+dx,drag.box.y+dy);guideLines=[];
    if($('snap-guides').checked){const snap=snapPosition(drag.box,pos.x,pos.y,drag.card.layers.filter(l=>!drag.layers.includes(l)));const bounded=boundedPosition(drag.box,snap.x,snap.y);pos=bounded;guideLines=snap.guides.filter(g=>g.axis==='x'?bounded.x===snap.x:bounded.y===snap.y);}
    drag.layers.forEach((l,i)=>{l.x=drag.initial[i].x;l.y=drag.initial[i].y;});translate(drag.layers,pos.x-drag.box.x,pos.y-drag.box.y);
  }
  drag.card.approved=false;render();
};
function finishDrag(){const changed=drag?.changed;drag=null;guideLines=[];if(changed){project.clientApprovedAt=null;scheduleSave();}render();}
$('stage').onpointerup=finishDrag;$('stage').onpointercancel=finishDrag;
$('stage').ondblclick=async e=>{const p=point(e),layer=[...(active()?.layers||[])].reverse().find(l=>l.visible&&p.x>=l.x&&p.x<=l.x+l.w&&p.y>=l.y&&p.y<=l.y+l.h);if(layer?.role==='photo'&&layer.assetId&&!layer.locked){finishDrag();workflowUi.go('edicao');selectedId=layer.id;stageMode='pan';workflowUi.showInspector('element');await render();return;}if(layer?.type==='text'&&!layer.locked){finishDrag();workflowUi.go('edicao');await chooseLayer(layer.id);const field=$('properties').querySelector('[data-property="text"]');field?.focus();field?.select();}};
function enablePhotoDrop(zone,card){
  zone.ondragover=e=>{if([...e.dataTransfer.types].some(t=>['Files','application/x-cartelas-photo'].includes(t))){e.preventDefault();e.dataTransfer.dropEffect='copy';}};
  zone.ondrop=e=>{e.preventDefault();e.stopPropagation();if(!card)return toast('Organize o pedido antes de adicionar uma foto.');const id=e.dataTransfer.getData('application/x-cartelas-photo');if(id){if(project.assets[id]?.kind==='photo'){change(()=>assignPhoto(project,card,id),null);chooseCard(card.id);}return;}
    if(e.dataTransfer.files.length!==1)return toast('Arraste uma foto para substituir nesta cartela. Para várias fotos, use a etapa Materiais.');chooseCard(card.id);$('photo-file').files=e.dataTransfer.files;$('photo-file').dispatchEvent(new Event('change'));
  };
}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=async()=>{
  const from=document.querySelector('.nav.active')?.dataset.view;
  if(button.dataset.view==='intake'){document.querySelector('[data-view="editor"]').click();workflowUi.receive();return;}
  if(button.dataset.view==='editor')workflowUi?.closeReceive();
  const view=button.dataset.view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view+'-view');document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el===button));$('page-title').textContent=view==='references'?'Uma biblioteca de possibilidades.':view==='clients'?'A identidade pronta para o próximo VT.':view==='projects'?'Seus trabalhos, sempre à mão.':view==='help'?'Seu fluxo, passo a passo.':'Monte o próximo VT.';
  if($('page-description'))$('page-description').textContent={clients:'Guarde logos, cores e fontes para os próximos trabalhos.',projects:'Continue um trabalho ou recupere uma versão salva.',layouts:'Compare as composições antes de aplicar ao seu trabalho.',references:'Consulte suas referências para orientar a direção visual.',help:'Um guia para ir do pedido aos arquivos finais.'}[view]||'';
  if(view==='clients')try{await clientUi.refresh();}catch(err){toast(err.message);}
  if(view==='intake')$('page-title').textContent='Do pedido recebido ao roteiro.';
  if(view==='editor')workflowUi?.go(document.querySelector('.briefing-panel')?.dataset.step||(project.cards.length?'edicao':'pedido'));
  if(view==='layouts')try{await templateUi.refresh();await personalCollectionUi.refresh();$('page-title').textContent='Seus layouts, prontos para reutilizar.';}catch(err){toast(err.message);}
  if(view==='projects')try {
    await persistNow();const saved=await listProjects();const dates=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
    $('project-grid').innerHTML=saved.map(p=>`<article class="saved-project ${p.id===project.id?'current':''}"><div class="project-swatch" style="background:${/^#[0-9a-f]{6}$/i.test(p.primary)?p.primary:'#355c42'}">▧</div><h3>${esc(p.name||'Sem nome')}</h3><p>${p.cardCount} cartela(s) · ${p.approvedCount} revisada(s)<br>Salvo em ${esc(dates.format(new Date(p.updatedAt)))}</p><button class="button" data-open-project="${esc(p.id)}">${p.id===project.id?'Continuar este trabalho':'Abrir trabalho'}</button></article>`).join('');
    document.querySelectorAll('[data-open-project]').forEach(b=>b.onclick=async()=>{try{await switchWork(()=>readProject(b.dataset.openProject));}catch(err){toast('Não foi possível abrir: '+err.message);}});
  }catch(err){toast('Não foi possível listar os trabalhos: '+err.message);}finally{await diskBackups.show();}
  if(view==='references'&&!$('reference-grid').children.length) {try{const response=await fetch('api/references');if(!response.ok)throw new Error('Referências indisponíveis');const refs=await response.json();$('reference-grid').innerHTML=refs.map(r=>`<article class="reference-card"><a href="${esc(r.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(r.url)}" alt="Referência ${esc(r.name)}"></a><p>${esc(r.name)}</p></article>`).join('');}catch(err){toast(err.message);}}
});
workflowUi=setupWorkflow({getProject:()=>project,getIssues:card=>issues(card)});
// A selection belongs to editing; other steps show the card without the selection frame.
document.addEventListener('cartelas:step',e=>{if(e.detail!=='edicao'&&selectedId){selectedId=null;multiIds.clear();render();}});
visualDirectionUi=setupVisualDirection({getProject:()=>project,getCard:active,change,notify:toast});
deliveryUi=setupDeliveries({getProject:()=>project,notify:toast});
diskBackups=setupDiskBackups({getProject:()=>project,saveCurrent:persistNow,refreshLibraries:async()=>{await clientUi.refresh();await templateUi.refresh();await personalCollectionUi.refresh();},restoreWork:async saved=>{const copy=validateProject(saved);copy.id=uid();copy.name=(copy.name||'Trabalho')+' · recuperado';copy.updatedAt=new Date().toISOString();await switchWork(async()=>copy);},notify:toast});
clientUi=setupClients({getProject:()=>project,updateProject:next=>{change(()=>{project=next;},null);syncInputs();},newWork:async client=>{await switchWork(async()=>{const p=blankProject();p.name=`${client.name} · Novo VT`;applyClientIdentity(p,client,{recompose:true});return p;});toast(`Novo trabalho de ${client.name} criado com a identidade pronta.`);},notify:toast});
setupPalettePicker({getProject:()=>project});
document.addEventListener('cartelas:gallery-open',async()=>{try{await templateUi.refresh();await personalCollectionUi.refresh();}catch(err){toast(err.message);}});
setupFonts({getProject:()=>project,change,syncInputs,notify:toast});
templateUi=setupTemplates({getProject:()=>project,getCard:active,change,syncInputs,notify:toast});
personalCollectionUi=setupPersonalCollections({getProject:()=>project,change,syncInputs,notify:toast});
contactUi=setupContacts({getProject:()=>project,getCard:active,change,notify:toast});
iconUi=setupIcons({getProject:()=>project,getCard:active,change,notify:toast,select:id=>{selectedId=id;}});
intakeUi=setupIntake({getProject:()=>project,saveSources:sources=>{validateBriefingSources(sources);change(()=>{project.briefingSources=structuredClone(sources);},null);},saveDraft:draft=>{validateIntakeDraft(draft);change(()=>{project.intakeDraft=structuredClone(draft);},null);},applyScript:script=>{change(()=>{project.brief=script;},null);syncInputs();},notify:toast});
try {const saved=await readProject();if(saved){project=validateProject(saved);activeId=project.cards[0]?.id||null;$('save-state').textContent='Trabalho recuperado';if(repairQrPlacement(project)){activeId=defaultQrCard(project)?.id||activeId;toast('Posição do QR corrigida conforme o roteiro. Confira a montagem.');scheduleSave();}}}catch(err){toast('Não foi possível recuperar o salvamento local. Você pode abrir uma cópia.');$('save-state').textContent='Salvamento local indisponível';}
syncInputs();render();
// Back up existing work sequentially as well as new edits; never block the editor.
(async()=>{try{for(const entry of await listProjects()){const saved=await readProject(entry.id);if(saved){diskBackups.schedule(saved);await diskBackups.flush();}}}catch{/* Status explains how to retry; the browser copy remains available. */}})();

void diskBackups.scheduleLibrary({allowEmpty:false}).catch(()=>{});

// Flush the pending debounce when the page is backgrounded; disk copies keep their own status.
const flushOnLeave=()=>{if(document.activeElement?.matches('input,textarea,select'))document.activeElement.blur();if($('save-state').textContent==='Salvando…')void persistNow().catch(()=>{$('save-state').textContent='Falha ao salvar — faça uma cópia';});};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushOnLeave();});
window.addEventListener('pagehide',flushOnLeave);
