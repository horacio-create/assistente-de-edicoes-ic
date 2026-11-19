import {validateVisualIdentity,applyIdentityElements} from './identity-elements.js';
import {applyVisualDirection} from './visual-direction.js';
import {allowedFont,validateFonts,mergeFonts} from './fonts.js';
import {uid,THEMES,readableColor,composeCard} from './core.js';
import {colorForToken,protectTemplateContrast} from './design-presets.js';

export function blankClient() {
  const now=new Date().toISOString();
  return {version:1,id:uid(),name:'',sector:'',theme:'editorial',palette:{...THEMES.editorial},origin:'custom',notes:'',logo:null,createdAt:now,updatedAt:now};
}
export function validateClientMetadata(c,records=c?.fonts||[]) {
  validateFonts(records);
  validateVisualIdentity(c?.visualIdentity);
  if(c?.visualElementsEnabled!==undefined&&typeof c.visualElementsEnabled!=='boolean')throw Error('Opção de identidade inválida.');
  if(c?.palette?.background!==undefined&&!/^#[0-9a-f]{6}$/i.test(c.palette.background))throw new Error('Cor de fundo inválida no perfil.');
  if(!c||c.version!==1||typeof c.id!=='string'||!c.id||typeof c.name!=='string'||!c.name.trim()||c.name.length>120||typeof c.sector!=='string'||c.sector.length>120||typeof c.notes!=='string'||c.notes.length>5000||!THEMES[c.theme]||!['official','references','custom'].includes(c.origin)||!c.palette||!/^#[0-9a-f]{6}$/i.test(c.palette.primary)||!/^#[0-9a-f]{6}$/i.test(c.palette.accent)||!allowedFont(c.palette.font,records)||!Number.isFinite(Date.parse(c.createdAt))||!Number.isFinite(Date.parse(c.updatedAt)))throw new Error('Perfil de cliente inválido. Confira nome, cores e tipografia.');
  return c;
}
export function validateClient(c) {
  validateClientMetadata(c);
  if(c.logo!==null&&(!c.logo||c.logo.kind!=='logo'||typeof c.logo.name!=='string'||typeof c.logo.data!=='string'||c.logo.data.length>24*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.logo.data)||!Number.isFinite(c.logo.width)||!Number.isFinite(c.logo.height)||c.logo.width<1||c.logo.height<1||c.logo.width>20000||c.logo.height>20000))throw new Error('Logo inválido no perfil do cliente.');
  return c;
}
export function clientFromProject(project,name) {
  const client=blankClient();client.name=name?.trim()||project.clientIdentity?.name||project.name;
  client.sector=project.clientIdentity?.sector||'';client.notes=project.clientIdentity?.notes||'';client.origin=project.clientIdentity?.origin||'custom';client.theme=project.theme;client.palette={...project.palette};client.fonts=structuredClone(project.fonts||[]);
  if(project.clientIdentity?.visualIdentity)client.visualIdentity=structuredClone(project.clientIdentity.visualIdentity);
  const used=project.cards.flatMap(c=>c.layers).find(l=>l.role==='logo'&&l.assetId);
  const logo=used?project.assets[used.assetId]:project.clientIdentity?project.assets[project.clientIdentity.logoAssetId]:Object.values(project.assets).filter(a=>a.kind==='logo').at(-1);
  client.logo=logo?structuredClone(logo):null;return client;
}
export function applyClientIdentity(project,client,{recompose=false,elements=false}={}) {
  validateClient(client);
  const previous={...project.palette};
  let logoAssetId=null;
  if(client.logo) {
    logoAssetId=Object.keys(project.assets).find(id=>project.assets[id].kind==='logo'&&project.assets[id].data===client.logo.data)||uid();
    if(!project.assets[logoAssetId]) {
      if(Object.values(project.assets).reduce((sum,a)=>sum+a.data.length,0)+client.logo.data.length>60*1024*1024)throw new Error('O trabalho não tem espaço para este logo. Remova materiais não usados antes de aplicar.');
      project.assets={...project.assets,[logoAssetId]:structuredClone(client.logo)};
    }
  }
  project.fonts=mergeFonts(project.fonts||[],client.fonts||[]);
  project.palette={...client.palette};if(recompose||!project.cards.length)project.theme=client.theme;
  const {logo,fonts,...metadata}=client;project.clientIdentity={...structuredClone(metadata),logoAssetId,visualElementsEnabled:elements};
  for(const card of project.cards) {
    const before=JSON.stringify(card.layers);
    if(recompose)composeCard(card,project.theme,project.palette);
    for(const l of card.layers) {
      if(l.colorToken)l.fill=colorForToken(project.palette,l.colorToken);
      else {
        if(l.role==='background')l.fill=project.theme==='contrast'?project.palette.primary:(project.palette.background||THEMES[project.theme].background);
        if(l.role==='title')l.fill=project.theme==='contrast'?readableColor(client.palette.primary):client.palette.primary;
        if(l.role==='body')l.fill=project.theme==='contrast'?readableColor(client.palette.primary):'#263028';
        if(l.role==='decoration'){if(l.fill===previous.primary)l.fill=client.palette.primary;else if(l.fill===previous.accent)l.fill=client.palette.accent;}
      }
      if(l.type==='text'&&['title','body','serviceText','contactText'].includes(l.role))l.font=client.palette.font;
      if(l.role==='logo')l.assetId=logoAssetId;
    }
    if(logoAssetId&&!card.layers.some(l=>l.role==='logo'))card.layers.push({id:uid(),type:'image',role:'logo',name:'Logo',x:60,y:42,w:240,h:88,radius:0,assetId:logoAssetId,fit:'contain',zoom:1,offsetX:0,offsetY:0,opacity:1,visible:true,locked:false});
    applyIdentityElements(card,project.palette,elements?client.visualIdentity:undefined);
    protectTemplateContrast(card);
    applyVisualDirection(card);
    const listBody=card.layers.find(l=>l.role==='body');if(card.serviceLayout&&listBody)for(const l of card.layers.filter(l=>['serviceText','serviceIcon'].includes(l.role)&&!l.colorToken))l.fill=listBody.fill;
    if(before!==JSON.stringify(card.layers))card.approved=false;
  }
  return project;
}
