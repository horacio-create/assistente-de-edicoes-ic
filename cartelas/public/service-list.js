import {contactRole} from './contact-list.js';
import {uid,shapeLayer,readableColor} from './core.js';
import {ICONS,suggestIcon,iconLayer} from './icons.js';
export const serviceRole=role=>['serviceText','serviceIcon','serviceBadge','serviceRule'].includes(role);
export function validateServiceStyle(value){
  if(!value||typeof value.badges!=='boolean'||typeof value.separators!=='boolean'||!Number.isFinite(value.strokeWidth)||value.strokeWidth<.6||value.strokeWidth>3)throw new Error('Estilo da lista inválido.');
  if(value.contactEmphasis!==undefined&&!['regular','large','extra'].includes(value.contactEmphasis))throw new Error('Destaque dos contatos inválido.');
  return {badges:value.badges,separators:value.separators,strokeWidth:value.strokeWidth,...(value.contactEmphasis?{contactEmphasis:value.contactEmphasis}:{})};
}
export function serviceItems(card){
  const rows=card.layers.filter(l=>l.role==='serviceText');
  if(rows.length)return rows.map(l=>({id:l.serviceId,raw:l.serviceRaw??l.text,text:l.text,pending:!!l.layoutPlaceholder,icon:card.layers.find(i=>i.role==='serviceIcon'&&i.serviceId===l.serviceId)?.icon||'sparkle'}));
  const text=card.layers.find(l=>l.role==='body')?.text||card.content.body;
  return text.split('\n').filter(s=>s.trim()).map(raw=>({id:uid(),raw,text:raw.replace(/^\s*[•●▪*-]\s*/,''),icon:suggestIcon(raw)}));
}
export function flattenServices(card){
  const rows=card.layers.filter(l=>l.role==='serviceText'),body=card.layers.find(l=>l.role==='body');
  if(rows.length&&body)body.text=rows.map(l=>l.serviceRaw??l.text).join('\n');
  if(body)body.visible=true;
  card.layers=card.layers.filter(l=>!serviceRole(l.role));return card;
}
export function serviceGrid(body,count){
  const columns=body.w>=900&&count>=5?2:1,rows=Math.max(1,Math.ceil(count/columns)),gap=48;
  return {columns,rows,width:(body.w-gap*(columns-1))/columns,height:body.h/rows};
}
export function buildServiceList(card,palette,items=serviceItems(card),style=card.serviceLayout||{badges:true,separators:true,strokeWidth:1.3}){
  style=validateServiceStyle(style);
  if(items.length>12)throw new Error('Use até 12 itens por cartela. Divida listas maiores em mais cartelas.');
  const body=card.layers.find(l=>l.role==='body'&&l.type==='text');if(!body)throw new Error('Adicione um texto complementar antes de criar a lista.');
  if(items.some(i=>!ICONS[i.icon]||typeof i.text!=='string'||!i.text.trim()||i.text.length>2000))throw new Error('Confira os textos e ícones dos itens.');
  const base=card.layers.filter(l=>!serviceRole(l.role)&&!contactRole(l.role));
  if(base.length+items.length*(2+(style.badges?2:0))+(style.separators?Math.max(0,items.length-1):0)>100)throw new Error('A lista ultrapassaria o limite de camadas.');
  const grid=serviceGrid(body,items.length),height=grid.height,diameter=Math.max(16,Math.min(68,height-18));
  const layers=[];
  items.forEach((item,index)=>{
    const rowIndex=index%grid.rows,column=Math.floor(index/grid.rows),y=body.y+rowIndex*height,center=y+height/2,badgeX=body.x+column*(grid.width+48);
    if(style.badges){
      layers.push(shapeLayer(`Contorno do medalhão ${index+1}`,badgeX,center-diameter/2,diameter,diameter,palette.accent,{form:'ellipse',role:'serviceBadge',serviceId:item.id,colorToken:'accent',opacity:.8}));
      layers.push(shapeLayer(`Medalhão ${index+1}`,badgeX+1.5,center-diameter/2+1.5,diameter-3,diameter-3,palette.background||'#ffffff',{form:'ellipse',role:'serviceBadge',serviceId:item.id,colorToken:'background',opacity:.72,gradient:{angle:135,amount:.12,tone:'light'}}));
    }
    const size=style.badges?diameter*.64:Math.min(48,diameter);
    const icon=iconLayer(item.icon,badgeX+(diameter-size)/2,center-size/2,size,body.fill);Object.assign(icon,{role:'serviceIcon',name:`Ícone ${index+1} · ${ICONS[item.icon].name}`,serviceId:item.id,strokeWidth:style.strokeWidth});layers.push(icon);
    const row={...body,id:uid(),role:'serviceText',name:`Serviço ${index+1}`,serviceId:item.id,serviceRaw:item.raw??item.text,text:item.text,x:badgeX+diameter+24,y:y+8,w:Math.max(80,grid.width-diameter-24),h:Math.max(16,height-16),size:Math.min(body.size,Math.max(18,height*.44)),visible:true,weight:'bold',lineHeight:1.18};
    if(item.pending)row.layoutPlaceholder=true;else delete row.layoutPlaceholder;
    // Keep the full row available for wrapping; explicit typography fitting centers the final lines.
    layers.push(row);
    if(style.separators&&rowIndex<grid.rows-1&&index<items.length-1)layers.push(shapeLayer(`Separador ${index+1}`,badgeX+8,y+height-1,grid.width-16,1,palette.accent,{role:'serviceRule',serviceId:item.id,colorToken:'accent',opacity:.55}));
  });
  body.visible=false;body.text=items.map(i=>i.raw??i.text).join('\n');card.content.body=body.text;
  card.layers=[...base,...layers];card.serviceLayout=style;delete card.contactLayout;card.approved=false;return card;
}

export function splitServiceCards(project,card,perCard=4){
  if(!project.cards.includes(card)||card.kind!=='services'||!Number.isInteger(perCard)||perCard<2||perCard>6)throw new Error('Selecione uma cartela de serviços.');
  const items=serviceItems(card);if(items.length<=perCard)throw new Error('Esta lista já cabe em uma cartela.');
  const count=Math.ceil(items.length/perCard);if(project.cards.length+count-1>20)throw new Error('A divisão ultrapassaria o limite de 20 cartelas.');
  const cards=Array.from({length:count},(_,i)=>{
    const copy=structuredClone(card);if(i)copy.id=uid();
    buildServiceList(copy,project.palette,items.slice(i*perCard,(i+1)*perCard));
    copy.approved=false;return copy;
  });
  project.cards.splice(project.cards.indexOf(card),1,...cards);
  project.cards.forEach((c,i)=>c.label=`Cartela ${i+1}`);
  return cards;
}
