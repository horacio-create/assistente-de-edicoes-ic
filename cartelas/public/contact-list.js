import {uid,shapeLayer,readableColor} from './core.js';
import {ICONS,iconLayer,validateIconAppearance} from './icons.js';
import {validateServiceStyle,serviceRole} from './service-list.js';
export const contactRole=role=>['contactText','contactIcon','contactBadge'].includes(role);
export function contactPreset(card,palette,preset){
  if(!['line','solid','badge'].includes(preset))throw new Error('Escolha uma aparência de contato válida.');
  const items=contactItems(card).map(item=>({...item,appearance:preset==='badge'?{variant:'outline',color:readableColor(palette.accent),badgeColor:palette.accent,badgeOpacity:1}:{variant:preset==='solid'?'solid':'outline'}}));
  return {items,style:{badges:preset==='badge',separators:false,strokeWidth:1.6,contactEmphasis:card.contactLayout?.contactEmphasis||'large'}};
}
export function suggestContactIcon(text){
  const s=text.trim();
  if(/instagram(?:\.com)?|(?:^|\s)@[a-z0-9_.]+/i.test(s))return 'camera';
  if(/whats(?:app)?|\bzap\b|wa\.me\//i.test(s))return 'whatsapp';
  const digits=s.replace(/\D/g,'');
  if(digits.length>=8&&/^(?:(?:telefone|fone|celular|contato)\s*[:\-]?\s*)?[+\d\s().\-]+$/i.test(s))return digits.length===11||digits.length===13?'whatsapp':'phone';
  if(/telefone|fone|celular/i.test(s))return 'phone';
  return null;
}
export function contactItems(card){
  const rows=card.layers.filter(l=>l.role==='contactText');
  if(rows.length)return rows.map(row=>{
    const icon=card.layers.find(l=>l.role==='contactIcon'&&l.serviceId===row.serviceId),badge=card.layers.find(l=>l.role==='contactBadge'&&l.serviceId===row.serviceId),appearance={...row.contactAppearance};
    if(icon){appearance.variant=icon.iconVariant||'outline';if(!icon.colorToken)appearance.color=icon.fill;}
    if(badge&&!badge.colorToken){appearance.badgeColor=badge.fill;appearance.badgeOpacity=badge.opacity;}
    return {id:row.serviceId,raw:row.serviceRaw??row.text,text:row.text,join:row.contactJoin??'\n',pending:!!row.layoutPlaceholder,appearance,icon:icon?.icon??row.contactSymbol??null};
  });
  const body=card.layers.find(l=>l.role==='body');
  return (body?.text??card.content.body??'').split('\n').filter(line=>line.trim()).flatMap(raw=>{
    const separator=raw.match(/\s+(?=(?:Instagram\s*:\s*)?@[a-z0-9_.]+)/i);
    if(separator){const left=raw.slice(0,separator.index),right=raw.slice(separator.index+separator[0].length);if(['phone','whatsapp'].includes(suggestContactIcon(left)))return [{id:uid(),raw:left,text:left,icon:suggestContactIcon(left),pending:!!body?.layoutPlaceholder,join:'\n'},{id:uid(),raw:right,text:right,icon:'camera',pending:!!body?.layoutPlaceholder,join:separator[0]}];}
    return [{id:uid(),raw,text:raw,icon:suggestContactIcon(raw),pending:!!body?.layoutPlaceholder,join:'\n'}];
  });
}
export const contactBody=items=>items.map((item,i)=>(i?(item.join??'\n'):'')+(item.raw??item.text)).join('');
export function flattenContacts(card){
  const rows=card.layers.filter(l=>l.role==='contactText'),body=card.layers.find(l=>l.role==='body');
  if(rows.length&&body)body.text=contactBody(contactItems(card));
  if(body)body.visible=true;
  card.layers=card.layers.filter(l=>!contactRole(l.role));return card;
}
export function buildContactList(card,palette,items=contactItems(card),style=card.contactLayout||{badges:false,separators:false,strokeWidth:1.5}){
  style=validateServiceStyle(style);
  items=items.map(item=>({...item,appearance:validateIconAppearance(item.appearance)}));
  const body=card.layers.find(l=>l.role==='body'&&l.type==='text');if(!body)throw new Error('Adicione os contatos no texto complementar da cartela.');
  if(items.length>12||items.some(i=>typeof i.text!=='string'||!i.text.trim()||i.text.length>2000||typeof(i.raw??i.text)!=='string'||(i.raw??i.text).length>2000||i.icon!==null&&!Object.hasOwn(ICONS,i.icon)))throw new Error('Use até 12 linhas de contato e confira os símbolos e textos.');
  if(body.w<90&&items.some(i=>i.icon))throw new Error('Aumente a largura do texto de contatos para acomodar os ícones.');
  const base=card.layers.filter(l=>!contactRole(l.role)&&!serviceRole(l.role)),count=items.reduce((n,i)=>n+1+(i.icon?1+(style.badges?1:0):0),0);
  if(base.length+count>100)throw new Error('A organização dos contatos ultrapassaria 100 camadas.');
  const emphasis=style.contactEmphasis||'large',height=body.h/Math.max(1,items.length),iconLimit={regular:38,large:58,extra:64}[emphasis],size=Math.min(iconLimit,Math.max(18,height-12)),inset=size+16,layers=[];
  items.forEach((item,index)=>{
    const center=body.y+(index+.5)*height,hasIcon=!!item.icon,a=item.appearance;
    if(hasIcon&&style.badges)layers.push(shapeLayer(`Medalhão de contato ${index+1}`,body.x,center-size/2,size,size,a.badgeColor||palette.accent,{form:'ellipse',role:'contactBadge',serviceId:item.id,...(!a.badgeColor?{colorToken:'accent'}:{}),opacity:a.badgeOpacity??.22}));
    if(hasIcon){const glyph=style.badges?size*(emphasis==='regular'?.76:.82):size;const icon=iconLayer(item.icon,body.x+(size-glyph)/2,center-glyph/2,glyph,a.color||body.fill);Object.assign(icon,{role:'contactIcon',name:ICONS[item.icon].name+' · contato',serviceId:item.id,iconVariant:a.variant||'outline',strokeWidth:style.strokeWidth,...(!a.color&&body.colorToken?{colorToken:body.colorToken}:{})});layers.push(icon);}
    const primary=['phone','whatsapp'].includes(item.icon),target=emphasis==='regular'?body.size:emphasis==='extra'?Math.max(48,body.size*1.6):Math.max(40,body.size*1.35);
    const row={...body,id:uid(),name:`Contato ${index+1}${item.icon?' · '+ICONS[item.icon].name:''}`,role:'contactText',serviceId:item.id,serviceRaw:item.raw??item.text,contactJoin:item.join??'\n',contactSymbol:item.icon,text:item.text,x:body.x+(hasIcon?inset:0),y:body.y+index*height+4,w:body.w-(hasIcon?inset:0),h:Math.max(16,height-8),size:Math.min(target+(primary&&emphasis!=='regular'?4:0),Math.max(20,(height-8)/1.2)),weight:emphasis==='regular'?body.weight:'bold',lineHeight:1.2,visible:true};
    row.contactAppearance=a;
    if(item.pending)row.layoutPlaceholder=true;else delete row.layoutPlaceholder;layers.push(row);
  });
  body.visible=false;body.text=contactBody(items);card.content.body=body.text;card.layers=[...base,...layers];card.contactLayout=style;delete card.serviceLayout;card.approved=false;return card;
}
