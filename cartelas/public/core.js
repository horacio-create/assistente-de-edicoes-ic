import {allowedFont,validateFonts} from './fonts.js';
import {SEGMENTS} from './segments.js';
import {readVisualDirection,applyVisualDirection,validateVisualDirection} from './visual-direction.js';
import {validateFinishes} from './finishes.js';
export const WIDTH = 1280, HEIGHT = 720;
export const THEMES = {
  editorial: { primary:'#996c61', accent:'#d9b991', background:'#f4eee7', font:'Georgia' },
  contrast: { primary:'#162d3e', accent:'#efb83e', background:'#162d3e', font:'Arial' },
  essential: { primary:'#176d72', accent:'#81c8c1', background:'#ffffff', font:'Arial' }
};
export const EXAMPLE = `Cartela 1 - Logo + texto + Foto 1
DRA. VICTORIA DA PONTE
HARMONIZAÇÃO FACIAL

Cartela 2 - Logo como assinatura + foto 2 + serviços
• Preenchimento Facial
• Labial
• Full Face Toxina Botulínica
• Rinomodelação Contorno Facial
• Bioestimuladores

Cartela 3 - Logo + texto + informações de contato e QR Code
Realce sua beleza
(88) 99234-8066
@dravictoriadaponte`;

export function uid() { return globalThis.crypto.randomUUID(); }
export function blankProject() {
  return { version:1, id:uid(), name:'Novo trabalho', brief:'', theme:'editorial', palette:{ ...THEMES.editorial }, cards:[], assets:{}, updatedAt:new Date().toISOString() };
}
export function parseBrief(source) {
  const clean = source.replace(/\r\n?/g,'\n').replace(/[\u200B-\u200D\uFEFF]/g,'');
  const header = /^\s*cartela\s*(\d+)\s*(?:[-–—:.]\s*)?(.*)$/gim;
  const matches = [...clean.matchAll(header)];
  if (!matches.length) throw new Error('Use “Cartela 1”, “Cartela 2”… para indicar o início de cada cartela.');
  if (matches.length > 20) throw new Error('Esta versão aceita até 20 cartelas por trabalho.');
  const numbers = new Set();
  const cards = matches.map((m,i) => {
    const number = Number(m[1]);
    if (numbers.has(number)) throw new Error(`“Cartela ${number}” aparece duas vezes. Confira a numeração.`);
    numbers.add(number);
    const rawContent = clean.slice(m.index+m[0].length, matches[i+1]?.index ?? clean.length).trim();
    const instructions = m[2].trim();
    const visual=readVisualDirection(instructions,rawContent);
    const lines = visual.content.split('\n').map(t=>t.trim()).filter(Boolean);
    const bullet = lines.some(t=>/^[•●▪*-]\s*/.test(t));
    const contact = /contato|qr\s*code|encerramento/i.test(instructions);
    const firstIsBullet = /^[•●▪*-]\s*/.test(lines[0] || '');
    const title = firstIsBullet ? 'Serviços' : lines[0] || '';
    const body = firstIsBullet ? lines.join('\n') : lines.slice(1).join('\n');
    return { id:uid(), label:`Cartela ${number}`, instructions, rawContent, content:{ title, body }, automaticTitle:firstIsBullet?title:null, kind:contact?'contact':bullet?'services':'intro', requirements:{ logo:/logo/i.test(instructions), photo:/foto|imagem/i.test(instructions), qr:qrRequested(instructions) }, approved:false, layers:[] };
  });
  const prefix = clean.slice(0,matches[0].index).trim();
  return { cards, notes:prefix ? [`Texto antes da primeira cartela preservado no pedido: ${prefix}`] : [] };
}
export function readableColor(hex) {
  const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2]>.179?'#202821':'#ffffff';
}
export function textLayer(name,text,x,y,w,h,size,fill,font='Arial',weight='normal') {
  return { id:uid(), type:'text', role:'content', name,text,x,y,w,h,size,fill,font,weight,lineHeight:1.22,align:'left',opacity:1,visible:true,locked:false };
}
export function shapeLayer(name,x,y,w,h,fill,extra={}) {
  return { id:uid(), type:'shape', role:'decoration', name,x,y,w,h,fill,radius:0,opacity:1,visible:true,locked:false,...extra };
}
export function qrContentOf(value) {return value?.qrContent ?? value?.qrTarget ?? null;}
export function qrRequested(value){
  const text=String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /\bqr(?:\s*code)?\b/.test(text)&&!/(?:\bsem\s+(?:o\s+)?|\bnao\s+(?:incluir|usar|precisa(?:r)?|tem|tera)\s+(?:de\s+|o\s+)?)qr(?:\s*code)?\b/.test(text);
}
export function setQrRequested(project,enabled,cardId=defaultQrCard(project)?.id){
  if(typeof enabled!=='boolean')throw new Error('Opção de QR inválida.');
  const target=project.cards.find(c=>c.id===cardId);if(enabled&&!target)throw new Error('Organize as cartelas antes de incluir QR.');
  for(const card of project.cards){
    if(enabled){if(card===target&&!card.requirements.qr){card.requirements.qr=true;card.approved=false;}}
    else if(card.requirements.qr||card.layers.some(l=>l.role==='qr')){card.requirements.qr=false;card.layers=card.layers.filter(l=>l.role!=='qr'&&l.name!=='Área de proteção do QR');card.approved=false;}
  }
  return project;
}
export function qrLayer(assetId,content=null) {
  return {id:uid(),type:'image',role:'qr',name:'QR Code',x:980,y:402,w:240,h:240,radius:0,assetId,qrContent:content,fit:'contain',zoom:1,offsetX:0,offsetY:0,opacity:1,visible:true,locked:false};
}
export function defaultQrCard(project) {
  return project.cards.find(c=>c.requirements.qr)||project.cards.find(c=>c.kind==='contact')||project.cards.at(-1);
}
export function arrangeQr(card) {
  const qr=card.layers.find(l=>l.role==='qr');if(!qr)return;
  const list=card.serviceLayout&&card.layers.some(l=>l.role==='serviceText')?{items:serviceItems(card),accent:card.layers.find(l=>['serviceBadge','serviceRule'].includes(l.role))?.fill||'#d9b991',background:card.layers.find(l=>l.role==='background')?.fill||'#ffffff'}:null;
  const contacts=card.contactLayout?{items:contactItems(card),accent:card.layers.find(l=>l.role==='contactBadge')?.fill||'#d9b991'}:null;
  qr.w=Math.max(160,Math.min(360,qr.w));qr.h=qr.w;qr.x=1280-60-qr.w;qr.y=642-qr.h;
  for(const l of card.layers) {
    if(['title','body'].includes(l.role)&&l.x<qr.x)l.w=Math.min(l.w,Math.max(100,qr.x-l.x-60));
    if(l.role==='photo'&&l.visible&&l.x+l.w>qr.x&&l.y+l.h>qr.y){l.y=Math.min(l.y,qr.y-120);l.h=Math.max(80,qr.y-l.y-40);}
  }
  if(list)buildServiceList(card,{accent:list.accent,background:list.background},list.items,card.serviceLayout);
  if(contacts)buildContactList(card,{accent:contacts.accent},contacts.items,card.contactLayout);
  card.approved=false;
}
export function repairQrPlacement(project) {
  const requested=project.cards.filter(c=>c.requirements.qr);
  const sources=project.cards.filter(c=>c.layers.some(l=>l.role==='qr'));
  if(requested.length!==1||sources.length!==1)return false;
  const source=sources[0],target=requested[0];const qr=source.layers.find(l=>l.role==='qr');
  if(source===target){const overlaps=target.layers.some(l=>l.role==='photo'&&l.visible&&l.x<qr.x+qr.w&&l.x+l.w>qr.x&&l.y<qr.y+qr.h&&l.y+l.h>qr.y);if(!overlaps&&!(qr.x===870&&qr.y===280))return false;arrangeQr(target);return true;}
  source.layers=source.layers.filter(l=>l!==qr);source.requirements.qr=/qr\s*code/i.test(source.instructions);source.approved=false;
  target.layers.push(qr);target.requirements.qr=true;arrangeQr(target);return true;
}
export function orderedPhotoIds(project) {
  const available=Object.keys(project.assets).filter(id=>project.assets[id].kind==='photo');
  return [...(project.photoOrder||[]).filter(id=>available.includes(id)),...available.filter(id=>!(project.photoOrder||[]).includes(id))];
}
export function assignPhoto(project,card,assetId) {
  if(project.assets[assetId]?.kind!=='photo')throw new Error('Foto indisponível.');
  let layer=card.layers.find(l=>l.role==='photo');
  if(layer?.assetId===assetId&&layer.visible)return false;
  if(!layer){card.requirements.photo=true;layer=ensurePhotoFrame(card,project.theme,project.palette);}
  layer.assetId=assetId;layer.visible=true;layer.zoom=1;layer.offsetX=0;layer.offsetY=0;card.approved=false;
  if(card.layers.some(l=>l.role==='qr'))arrangeQr(card);return true;
}
export function ensurePhotoFrame(card,theme,palette){
  let layer=card.layers.find(l=>l.role==='photo');if(layer)return layer;
  if(card.designCollection){
    const template=presetTemplate(card.designCollection,card.kind,{hasPhoto:true,hasQr:card.requirements.qr||card.layers.some(l=>l.role==='qr')});
    applyTemplate({theme,palette,assets:{}},card,template,{keepIdentity:true});return card.layers.find(l=>l.role==='photo');
  }
  composeCard(card,theme,palette);return card.layers.find(l=>l.role==='photo');
}
export function distributePhotos(project,{fillOnly=false,ids=orderedPhotoIds(project)}={}) {
  let cards=project.cards.filter(c=>c.requirements.photo||c.layers.some(l=>l.role==='photo'));
  if(!cards.length)cards=project.cards.filter(c=>c.kind!=='contact'&&!c.requirements.qr);
  if(fillOnly)cards=cards.filter(c=>!c.layers.some(l=>l.role==='photo'&&l.assetId));
  let count=0;for(let i=0;i<Math.min(cards.length,ids.length);i++)if(assignPhoto(project,cards[i],ids[i]))count++;
  return count;
}
export function removeAsset(project,id) {
  const assets={...project.assets};delete assets[id];project.assets=assets;
  project.photoOrder=orderedPhotoIds(project).filter(key=>key!==id);
  if(project.clientIdentity?.logoAssetId===id)project.clientIdentity={...project.clientIdentity,logoAssetId:null};
  for(const card of project.cards)for(const layer of card.layers)if(layer.assetId===id){layer.assetId=null;card.approved=false;}
}
export function composeCard(card, theme, palette) {
  const listStyle=card.serviceLayout,items=listStyle?serviceItems(card):null;
  const contactStyle=card.contactLayout,contacts=contactStyle?contactItems(card):[];
  if(contactStyle)flattenContacts(card);
  if(listStyle)flattenServices(card);
  delete card.designCollection;
  const previous = card.layers;
  const oldTitle = previous.find(l=>l.role==='title');
  const oldBody = previous.find(l=>l.role==='body');
  if (oldTitle) card.content.title = oldTitle.text;
  if (oldBody) card.content.body = oldBody.text;
  const photo = previous.find(l=>l.role==='photo');
  const logo = previous.find(l=>l.role==='logo');
  const qr = previous.find(l=>l.role==='qr');
  const custom = previous.filter(l=>l.role==='custom');
  const dark = theme==='contrast';
  const hasPhoto = card.requirements.photo || photo?.assetId;
  const fill = dark ? readableColor(palette.primary) : '#263028';
  const layers = [shapeLayer('Fundo',0,0,1280,720,dark?palette.primary:(palette.background||THEMES[theme].background),{ role:'background',locked:true })];
  let textWidth = hasPhoto ? 650 : 1080;
  if(qr)textWidth=650;
  if (theme==='editorial') {
    layers.push(shapeLayer('Faixa lateral',hasPhoto?810:1130,0,hasPhoto?470:150,720,palette.accent));
    layers.push(shapeLayer('Detalhe editorial',60,151,90,5,palette.primary));
  } else if (theme==='contrast') {
    layers.push(shapeLayer('Faixa de destaque',0,658,1280,62,palette.accent));
    layers.push(shapeLayer('Marcador',62,155,80,7,palette.accent));
  } else {
    layers.push(shapeLayer('Base institucional',0,666,1280,54,palette.primary));
    layers.push(shapeLayer('Área de destaque',hasPhoto?800:1095,90,hasPhoto?420:130,540,palette.accent,{radius:32}));
  }
  if (hasPhoto) {
    const geometry = theme==='essential' ? {x:830,y:120,w:390,h:480,radius:25} : {x:theme==='contrast'?770:850,y:0,w:theme==='contrast'?510:430,h:theme==='contrast'?658:720,radius:0};
    layers.push({id:uid(),type:'image',name:'Foto',role:'photo',...geometry,assetId:photo?.assetId||null,fit:'cover',zoom:1,offsetX:0,offsetY:0,opacity:1,visible:true,locked:false});
  }
  if (card.requirements.logo || logo?.assetId) layers.push({id:uid(),type:'image',name:'Logo',role:'logo',x:60,y:42,w:240,h:88,radius:0,assetId:logo?.assetId||null,fit:'contain',zoom:1,offsetX:0,offsetY:0,opacity:1,visible:true,locked:false});
  const titleY=card.kind==='contact'?245:190;
  const title=textLayer('Título',card.content.title,60,titleY,textWidth,card.kind==='services'?85:220,card.kind==='services'?48:58,dark?fill:palette.primary,palette.font, 'bold');
  title.role='title'; layers.push(title);
  if (card.content.body) {
    const y=card.kind==='services'?302:card.kind==='contact'?455:450;
    const body=textLayer(card.kind==='services'?'Serviços':'Texto complementar',card.content.body,60,y,textWidth,card.kind==='services'?310:160,card.kind==='services'?34:30,fill,'Arial');
    body.role='body'; layers.push(body);
  }
  card.layers=[...layers,...(qr?[{...qr,id:uid()}]:[]),...custom];if(qr)arrangeQr(card);card.approved=false;
  if(listStyle&&card.layers.some(l=>l.role==='body'))buildServiceList(card,palette,items,listStyle);
  if(contactStyle&&card.layers.some(l=>l.role==='body'))buildContactList(card,palette,contacts,contactStyle);
  applyVisualDirection(card);
  return card;
}
export function approveCard(card) { card.approved=true; }
export function mutateCard(card, fn) { fn(card); card.approved=false; }
export function validateCard(card, assets) {
  const issues=[];
  if (!card.layers.some(l=>l.type==='text' && l.visible && l.text.trim())) issues.push('Adicione o texto da cartela.');
  const codes=card.layers.filter(l=>l.role==='qr'&&l.visible);
  if(card.requirements.qr&&!codes.some(l=>assets[l.assetId]?.kind==='qr')) issues.push('QR Code solicitado: adicione a imagem enviada pelo cliente.');
  for(const l of codes) {
    const a=assets[l.assetId];
    if(a?.kind!=='qr'||qrContentOf(a)!==qrContentOf(l)) issues.push('QR Code: material ausente ou incompatível. Importe a imagem do cliente novamente.');
    if(l.fit!=='contain'||l.zoom!==1||l.offsetX!==0||l.offsetY!==0||l.radius!==0||l.opacity!==1||l.w!==l.h) issues.push('QR Code: mantenha formato quadrado, opacidade total e enquadramento sem recorte.');
    if(l.w<160) issues.push('QR Code: aumente o tamanho para preservar a leitura.');
  }
  for (const role of ['logo','photo']) {
    const layer=card.layers.find(l=>l.role===role && l.visible);
    if (card.requirements[role] && (!layer?.assetId || !assets[layer.assetId])) issues.push(role==='logo'?'Adicione o logo solicitado.':'Adicione a foto solicitada.');
  }
  for (const l of card.layers.filter(l=>l.visible)) {
    if (l.x<0 || l.y<0 || l.x+l.w>1280 || l.y+l.h>720) issues.push(`${l.name}: elemento ultrapassa a cartela.`);
    if (l.type==='image' && l.assetId && !assets[l.assetId]) issues.push(`${l.name}: material ausente.`);
    if (l.type==='image' && l.role!=='qr' && assets[l.assetId]) { const a=assets[l.assetId]; const scale=l.fit==='contain'?Math.min(l.w/a.width,l.h/a.height):Math.max(l.w/a.width,l.h/a.height); if(scale*l.zoom>1.5) issues.push(`${l.name}: resolução baixa para o tamanho utilizado.`); }
  }
  return issues;
}
export function validateProject(p) {
  if(p?.segment!==undefined&&p.segment!=='auto'&&!SEGMENTS.some(s=>s.id===p.segment))throw new Error('Segmento do trabalho inválido.');
  validateFonts(p?.fonts||[]);
  if(p?.clientApprovedAt!==undefined&&p.clientApprovedAt!==null&&(typeof p.clientApprovedAt!=='string'||!Number.isFinite(Date.parse(p.clientApprovedAt))))throw new Error('Registro de aprovação do cliente inválido.');
  if(p?.palette?.background!==undefined&&!/^#[0-9a-f]{6}$/i.test(p.palette.background))throw new Error('Cor de fundo inválida.');
  if (!p || p.version!==1 || typeof p.id!=='string' || typeof p.name!=='string' || typeof p.brief!=='string' || !THEMES[p.theme] || !p.palette || !/^#[0-9a-f]{6}$/i.test(p.palette.primary) || !/^#[0-9a-f]{6}$/i.test(p.palette.accent) || !allowedFont(p.palette.font,p.fonts||[]) || !Array.isArray(p.cards) || p.cards.length>20 || !p.assets || Array.isArray(p.assets)) throw new Error('Cópia inválida ou de uma versão incompatível.');
  const ids = new Set();
  if(p.briefingSources!==undefined)validateBriefingSources(p.briefingSources);
  if(p.intakeDraft!==undefined)validateIntakeDraft(p.intakeDraft);
  if(p.clientIdentity!==undefined){validateClientMetadata(p.clientIdentity,p.fonts||[]);if(p.clientIdentity.logoAssetId!==null&&(typeof p.clientIdentity.logoAssetId!=='string'||p.assets[p.clientIdentity.logoAssetId]?.kind!=='logo'))throw new Error('Logo da identidade do cliente ausente na cópia.');}
  if(p.photoOrder!==undefined&&(!Array.isArray(p.photoOrder)||new Set(p.photoOrder).size!==p.photoOrder.length||p.photoOrder.some(id=>typeof id!=='string'||p.assets[id]?.kind!=='photo')))throw new Error('Ordem de fotos inválida.');
  const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  for (const a of Object.values(p.assets)) {
    if (!a || typeof a.name!=='string' || typeof a.data!=='string' || a.data.length>24*1024*1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data) || !finite(a.width,1,20000) || !finite(a.height,1,20000)) throw new Error('Material inválido na cópia.');
    if(a.kind==='qr' && qrContentOf(a)!==null && (typeof qrContentOf(a)!=='string'||qrContentOf(a).length>20000))throw new Error('QR Code inválido na cópia.');
  }
  for (const c of p.cards) {
    if (!c || typeof c.id!=='string' || ids.has(c.id) || typeof c.label!=='string' || typeof c.instructions!=='string' || typeof c.approved!=='boolean' || !c.content || typeof c.content.title!=='string' || typeof c.content.body!=='string' || !c.requirements || !['intro','services','contact'].includes(c.kind) || !Array.isArray(c.layers) || c.layers.length>100) throw new Error('Cartela inválida na cópia.');
    ids.add(c.id);
    if(c.visualDirection!==undefined)validateVisualDirection(c.visualDirection);
    if(c.designCollection!==undefined&&!['atelier','care','table','bold','nocturne','school','lumina','serena','vitrine','onda','oferta','consultorio','impacto'].includes(c.designCollection))throw new Error('Coleção de layout inválida.');
    if(c.automaticTitle!==undefined&&c.automaticTitle!==null&&(typeof c.automaticTitle!=='string'||c.automaticTitle.length>200))throw new Error('Título automático inválido.');
    if(c.contactLayout!==undefined)validateServiceStyle(c.contactLayout);
    if(c.serviceLayout!==undefined)validateServiceStyle(c.serviceLayout);
    for(const flag of ['logo','photo','qr']) if(typeof c.requirements[flag]!=='boolean') throw new Error('Instrução inválida na cópia.');
    const layerIds=new Set();
    for(const l of c.layers) {
      if(!l || !['shape','text','image','icon'].includes(l.type) || typeof l.id!=='string' || layerIds.has(l.id) || typeof l.name!=='string' || typeof l.role!=='string' || !finite(l.x,-1280,2560) || !finite(l.y,-720,1440) || !finite(l.w,1,2560) || !finite(l.h,1,1440) || !finite(l.opacity,0,1) || typeof l.visible!=='boolean' || typeof l.locked!=='boolean') throw new Error('Camada inválida na cópia.');
      layerIds.add(l.id);
      validateFinishes(l);
      if(l.colorToken!==undefined&&!['primary','accent','background','onPrimary','onAccent','onBackground'].includes(l.colorToken))throw new Error('Cor de identidade inválida.');
      if(l.form!==undefined&&(l.type!=='shape'||!['rect','ellipse','cornerSweep','slant','wave'].includes(l.form)))throw new Error('Formato de camada inválido.');
      if(['cornerSweep','slant'].includes(l.form)&&!['tl','tr','bl','br'].includes(l.corner))throw new Error('Curva de canto inválida.');
      if(l.form==='wave'&&!['top','bottom','left','right'].includes(l.edge))throw new Error('Lado da onda inválido.');
      if(l.edge!==undefined&&l.form!=='wave')throw new Error('Lado da onda inválido.');
      if(l.corners!==undefined&&(!['shape','image'].includes(l.type)||!Array.isArray(l.corners)||l.corners.length!==4||l.corners.some(v=>!finite(v,0,300))))throw new Error('Cantos inválidos.');
      if(l.type==='icon'&&(!Object.hasOwn(ICONS,l.icon)||!finite(l.strokeWidth,.6,3)))throw new Error('Ícone inválido.');
      if(l.iconVariant!==undefined&&(l.type!=='icon'||!['outline','solid'].includes(l.iconVariant)))throw new Error('Estilo do ícone inválido.');
      if(l.contactAppearance!==undefined)validateIconAppearance(l.contactAppearance);
      if(l.logoInset!==undefined&&(l.role!=='logo'||!finite(l.logoInset,0,.3)))throw new Error('Respiro do logo inválido.');
      if(l.serviceId!==undefined&&(typeof l.serviceId!=='string'||l.serviceId.length>100))throw new Error('Item de serviço inválido.');
      if(l.contactSymbol!==undefined&&l.contactSymbol!==null&&!Object.hasOwn(ICONS,l.contactSymbol))throw new Error('Símbolo de contato inválido.');
      if(l.contactJoin!==undefined&&(typeof l.contactJoin!=='string'||l.contactJoin.length>40||l.contactJoin!=='\n'&&/[\r\n]/.test(l.contactJoin)))throw new Error('Separação dos contatos inválida.');
      if(l.serviceRaw!==undefined&&(typeof l.serviceRaw!=='string'||l.serviceRaw.length>2000))throw new Error('Texto de serviço inválido.');
      if(l.type!=='image' && !/^#[0-9a-f]{6}$/i.test(l.fill)) throw new Error('Cor inválida.');
      if(l.type==='text' && (typeof l.text!=='string' || l.text.length>20000 || !finite(l.size,8,180) || !finite(l.lineHeight,1,2) || !allowedFont(l.font,p.fonts||[]) || !['normal','bold'].includes(l.weight) || !['left','center','right'].includes(l.align))) throw new Error('Texto inválido.');
      if(l.type==='shape' && !finite(l.radius,0,300)) throw new Error('Forma inválida.');
      if(l.type==='image' && (!['contain','cover'].includes(l.fit) || !finite(l.zoom,1,4) || !finite(l.offsetX,-1000,1000) || !finite(l.offsetY,-1000,1000) || !finite(l.radius,0,300) || (l.assetId!==null && (typeof l.assetId!=='string' || !p.assets[l.assetId])))) throw new Error('Imagem inválida.');
      if(l.role==='qr' && (l.type!=='image'||(qrContentOf(l)!==null&&(typeof qrContentOf(l)!=='string'||qrContentOf(l).length>20000))))throw new Error('Camada de QR inválida.');
    }
  }
  return p;
}
import {validateClientMetadata} from './clients.js';
import {presetTemplate} from './design-presets.js';
import {applyTemplate} from './templates.js';
import {ICONS,validateIconAppearance} from './icons.js';
import {buildServiceList,flattenServices,serviceItems,validateServiceStyle} from './service-list.js';
import {validateBriefingSources,validateIntakeDraft} from './briefing.js';

import {flattenContacts,buildContactList,contactItems} from './contact-list.js';
