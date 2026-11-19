import {applyIdentityElements} from './identity-elements.js';
import {validateFonts,mergeFonts} from './fonts.js';
import {applyVisualDirection} from './visual-direction.js';
import {blankProject, uid, validateProject, THEMES, arrangeQr} from './core.js';

const fields=['id','type','role','x','y','w','h','opacity','visible','locked'];
const extra={text:['size','fill','font','weight','align','lineHeight'],shape:['fill','radius'],image:['fit','radius','zoom','offsetX','offsetY'],icon:['fill','icon','strokeWidth','iconVariant']};
function structure(layer) {
  const result=Object.fromEntries([...fields,...(extra[layer.type]||[])].map(key=>[key,layer[key]]));
  if(layer.colorToken!==undefined)result.colorToken=layer.colorToken;
  if(layer.role==='logo'&&layer.logoInset!==undefined)result.logoInset=layer.logoInset;
  if(layer.form!==undefined)result.form=layer.form;
  if(layer.corner!==undefined)result.corner=layer.corner;
  if(layer.edge!==undefined)result.edge=layer.edge;
  if(layer.corners!==undefined)result.corners=[...layer.corners];
  for(const key of ['gradient','texture','shadow'])if(layer[key]!==undefined)result[key]=structuredClone(layer[key]);
  result.name=layer.role==='title'?'Título':layer.role==='body'?'Texto complementar':layer.type==='text'?'Texto adicional':layer.role==='logo'?'Logo':layer.type==='image'?'Foto':'Forma';
  if(layer.type==='shape'&&layer.role==='background')result.name='Fundo';
  if(layer.type==='shape'&&['Moldura assimétrica','Moldura areia','Moldura dourada','Moldura de contato','Moldura azul','Área de proteção do QR'].includes(layer.name))result.name=layer.name;
  if(layer.type==='text')result.text=layer.role==='title'?'Título da cartela':layer.role==='body'?'Texto complementar':'Edite este texto';
  if(layer.type==='image'){result.assetId=null;result.zoom=1;result.offsetX=0;result.offsetY=0;}
  return result;
}
export function validateTemplate(value) {
  if(!value||value.version!==1||value.type!=='cartelas-layout'||typeof value.id!=='string'||!value.id||typeof value.name!=='string'||!value.name.trim()||value.name.length>120||!['intro','services','contact'].includes(value.kind)||!THEMES[value.theme]||!Array.isArray(value.layers)||!value.layers.length||value.layers.length>90||value.layers.some(l=>!l||l.role==='qr'||!extra[l.type]))throw new Error('Modelo inválido. Use um arquivo .layout.json exportado pelo aplicativo.');
  const fontRecords=validateFonts(value.fonts||[]);
  const palette={primary:value.palette?.primary,accent:value.palette?.accent,font:value.palette?.font,background:value.palette?.background};
  if(!/^#[0-9a-f]{6}$/i.test(palette.background))throw new Error('Cor de fundo inválida no modelo.');
  const layers=value.layers.map(structure);
  const p=blankProject();p.theme=value.theme;p.palette=palette;p.fonts=fontRecords;p.cards=[{id:'validation',label:'Modelo',instructions:'',content:{title:'Título',body:''},kind:value.kind,requirements:{logo:false,photo:false,qr:false},approved:false,layers}];
  validateProject(p);
  const model={version:1,type:'cartelas-layout',id:value.id,name:value.name.trim(),kind:value.kind,theme:value.theme,palette,layers,fonts:fontRecords};
  if(value.serviceLayout!==undefined)model.serviceLayout=validateServiceStyle(value.serviceLayout);
  if(value.contactLayout!==undefined)model.contactLayout=validateServiceStyle(value.contactLayout);
  return model;
}
export function captureTemplate(project,card,name) {
  if(!card)throw new Error('Selecione uma cartela para salvar o modelo.');
  const source=structuredClone(card);flattenServices(source);flattenContacts(source);
  return validateTemplate({version:1,type:'cartelas-layout',id:uid(),name,kind:card.kind,theme:project.theme,fonts:project.fonts||[],palette:{...project.palette,background:project.palette.background||THEMES[project.theme].background},layers:source.layers.filter(l=>l.role!=='qr').map(structure),...(card.serviceLayout?{serviceLayout:card.serviceLayout}:{}),...(card.contactLayout?{contactLayout:card.contactLayout}:{})});
}
export function applyTemplate(project,card,source,{keepIdentity=true}={}) {
  const template=validateTemplate(source),oldItems=card.serviceLayout?serviceItems(card):[],oldContacts=card.contactLayout?contactItems(card):[],oldContactEmphasis=card.contactLayout?.contactEmphasis,prepared=structuredClone(card);flattenServices(prepared);flattenContacts(prepared);
  const previous=prepared.layers,used=new Set();
  const mapColor=color=>{
    if(!keepIdentity)return color;
    for(const key of ['primary','accent','background'])if(color.toLowerCase()===template.palette[key].toLowerCase())return project.palette[key]||THEMES[project.theme][key];
    return color;
  };
  const layers=template.layers.map(item=>{
    const l={...structuredClone(item),id:uid()};
    const match=previous.find(old=>!used.has(old.id)&&old.type===l.type&&old.role===l.role&&old.role!=='qr');
    if(match)used.add(match.id);
    if(l.type==='text'){
      l.text=match?.text??(l.role==='title'?card.content.title:l.role==='body'?card.content.body:'Edite este texto');
      if(match?.layoutPlaceholder||(!match&&!['title','body'].includes(l.role)))l.layoutPlaceholder=true;
      if(keepIdentity&&l.font===template.palette.font)l.font=project.palette.font;
    }
    if(l.type==='image'){
      l.assetId=match?.assetId||null;
      if(l.role==='logo'&&match?.logoInset!==undefined)l.logoInset=match.logoInset;
      if(l.role==='logo'&&!l.assetId)l.assetId=project.clientIdentity?.logoAssetId||Object.entries(project.assets).find(([,a])=>a.kind==='logo')?.[0]||null;
    }else l.fill=l.role==='logoBase'?l.fill:keepIdentity&&l.colorToken?colorForToken(project.palette,l.colorToken):mapColor(l.fill);
    return l;
  });
  // Keep unmatched content and the client's QR. Decorative shapes are replaced by the new layout.
  for(const old of previous)if(!used.has(old.id)&&(old.type==='text'||old.type==='image'||old.type==='icon'))layers.push({...old});
  if(layers.length>100)throw new Error('A aplicação ultrapassaria 100 camadas. Remova elementos antes de continuar.');
  card.layers=layers;card.approved=false;
  if(layers.some(l=>l.role==='qr'))arrangeQr(card);
  protectTemplateContrast(card);
  if(template.serviceLayout){
    const items=serviceItems(card),usedItems=new Set();items.forEach(item=>{const previous=oldItems.find(old=>!usedItems.has(old.id)&&old.raw===item.raw);if(previous){usedItems.add(previous.id);item.icon=previous.icon;item.pending=previous.pending;}});
    buildServiceList(card,keepIdentity?project.palette:template.palette,items,template.serviceLayout);
  }else delete card.serviceLayout;
  if(template.contactLayout&&(oldContacts.some(item=>item.icon)||contactItems(card).some(item=>item.icon))){
    const items=contactItems(card),usedContacts=new Set();for(const item of items){const old=oldContacts.find(i=>!usedContacts.has(i.id)&&i.raw===item.raw);if(old){usedContacts.add(old.id);item.icon=old.icon;item.pending=old.pending;item.appearance=old.appearance;}}
    buildContactList(card,keepIdentity?project.palette:template.palette,items,{...template.contactLayout,...(oldContactEmphasis?{contactEmphasis:oldContactEmphasis}:{})});
  }else delete card.contactLayout;
  project.fonts=mergeFonts(project.fonts||[],template.fonts);
  if(keepIdentity&&project.clientIdentity?.visualElementsEnabled)applyIdentityElements(card,project.palette,project.clientIdentity.visualIdentity);
  applyVisualDirection(card);
  return card;
}
import {colorForToken,protectTemplateContrast} from './design-presets.js';
import {flattenServices,serviceItems,buildServiceList,validateServiceStyle} from './service-list.js';

import {contactItems,flattenContacts,buildContactList} from './contact-list.js';
