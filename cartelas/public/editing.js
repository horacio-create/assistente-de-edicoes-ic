import {WIDTH,HEIGHT,uid} from './core.js';

export function editTargets(card,layer,group=true){
  if(!layer||!layer.visible)throw new Error('Selecione um elemento visível.');
  const targets=group&&layer.serviceId?card.layers.filter(l=>l.visible&&l.serviceId===layer.serviceId):[layer];
  if(targets.some(l=>l.locked))throw new Error('Desbloqueie os elementos antes de movê-los.');
  return targets;
}
export function bounds(layers){const x=Math.min(...layers.map(l=>l.x)),y=Math.min(...layers.map(l=>l.y));return {x,y,w:Math.max(...layers.map(l=>l.x+l.w))-x,h:Math.max(...layers.map(l=>l.y+l.h))-y};}
export function translate(layers,dx,dy){for(const l of layers){l.x=Math.round((l.x+dx)*100)/100;l.y=Math.round((l.y+dy)*100)/100;}}
export function distributeElements(layers,axis){
  if(!['x','y'].includes(axis)||layers.length<3)throw Error('Selecione pelo menos três elementos para distribuir.');
  if(layers.some(l=>l.locked||!l.visible))throw Error('Selecione elementos visíveis e desbloqueados.');
  const size=axis==='x'?'w':'h',sorted=[...layers].sort((a,b)=>a[axis]-b[axis]),first=sorted[0],last=sorted.at(-1);
  const gap=(last[axis]+last[size]-first[axis]-sorted.reduce((sum,l)=>sum+l[size],0))/(sorted.length-1);
  if(gap<0)throw Error('Afaste os elementos das extremidades para criar espaços entre eles.');
  let pos=first[axis];for(const l of sorted){l[axis]=Math.round(pos*100)/100;pos+=l[size]+gap;}return layers;
}
export function alignPosition(box,action,margin=80){
  const positions={left:{x:margin,y:box.y},center:{x:(WIDTH-box.w)/2,y:box.y},right:{x:WIDTH-margin-box.w,y:box.y},top:{x:box.x,y:margin},middle:{x:box.x,y:(HEIGHT-box.h)/2},bottom:{x:box.x,y:HEIGHT-margin-box.h}};
  if(!positions[action])throw new Error('Alinhamento inválido.');return positions[action];
}
export function boundedPosition(box,x,y){return {x:Math.max(0,Math.min(Math.max(0,WIDTH-box.w),x)),y:Math.max(0,Math.min(Math.max(0,HEIGHT-box.h),y))};}
export function snapPosition(box,x,y,others=[],threshold=8){
  const axes={x:[0,80,WIDTH/2,WIDTH-80,WIDTH],y:[0,80,HEIGHT/2,HEIGHT-80,HEIGHT]};
  for(const l of others.filter(l=>l.visible&&l.role!=='background')){axes.x.push(l.x,l.x+l.w/2,l.x+l.w);axes.y.push(l.y,l.y+l.h/2,l.y+l.h);}
  const result={x,y,guides:[]};
  for(const axis of ['x','y']){
    const size=axis==='x'?box.w:box.h,start=axis==='x'?x:y;let best=null;
    for(const target of axes[axis])for(const offset of [0,size/2,size]){
      const delta=target-(start+offset);if(Math.abs(delta)<=threshold&&(!best||Math.abs(delta)<Math.abs(best.delta)))best={delta,target};
    }
    if(best){result[axis]+=best.delta;result.guides.push({axis,value:best.target});}
  }
  return result;
}
export function photoOffset(layer,asset,x,y){
  if(!asset)throw new Error('Envie uma foto antes de ajustar o enquadramento.');
  const scale=(layer.fit==='contain'?Math.min(layer.w/asset.width,layer.h/asset.height):Math.max(layer.w/asset.width,layer.h/asset.height))*layer.zoom;
  const maxX=Math.min(1000,Math.abs(asset.width*scale-layer.w)/2),maxY=Math.min(1000,Math.abs(asset.height*scale-layer.h)/2);
  return {offsetX:Math.max(-maxX,Math.min(maxX,x)),offsetY:Math.max(-maxY,Math.min(maxY,y))};
}
export function focusPhoto(layer,asset,position){
  if(layer.role!=='photo'||layer.locked)throw new Error('Selecione uma foto desbloqueada.');
  const positions={left:[1000,0],center:[0,0],right:[-1000,0],top:[0,1000],bottom:[0,-1000]};
  if(!positions[position])throw new Error('Enquadramento indisponível.');
  return photoOffset(layer,asset,...positions[position]);
}
export function logoInset(size){
  const values={compact:.2,balanced:.1,full:0};
  if(!Object.hasOwn(values,size))throw new Error('Tamanho de logo indisponível.');
  return values[size];
}
export function duplicateElement(card,layer){
  if(!layer||!layer.visible||layer.locked)throw new Error('Selecione um elemento visível e desbloqueado.');
  if(layer.role==='qr')throw new Error('O QR do cliente permanece em uma única camada.');
  if(card.layers.length>=100)throw new Error('Limite de 100 camadas por cartela.');
  const copy=structuredClone(layer);copy.id=uid();copy.name+=' · cópia';copy.role='custom';delete copy.serviceId;delete copy.serviceRaw;
  const pos=boundedPosition(copy,copy.x+24,copy.y+24);Object.assign(copy,pos);card.layers.splice(card.layers.indexOf(layer)+1,0,copy);card.approved=false;return copy;
}
export function resizeBox(layer,dx,dy){
  if(layer.locked||!Number.isFinite(dx)||!Number.isFinite(dy))throw new Error('Este elemento não pode ser redimensionado.');
  const maxW=1280-layer.x,maxH=720-layer.y;
  if(layer.role==='qr'){const max=Math.min(maxW,maxH);if(max<160)throw new Error('Reposicione o QR antes de aumentar seu tamanho.');const size=Math.max(160,Math.min(max,layer.w+Math.max(dx,dy)));return {w:Math.round(size*100)/100,h:Math.round(size*100)/100};}
  return {w:Math.round(Math.max(8,Math.min(maxW,layer.w+dx))*100)/100,h:Math.round(Math.max(8,Math.min(maxH,layer.h+dy))*100)/100};
}
