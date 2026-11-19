// Relative colors let finishes follow each client's palette.
export const FINISHES={plain:'Cor sólida',light:'Luz suave',paper:'Papel suave',metal:'Reflexo acetinado'};
export const SHADOWS={none:'Sem sombra',soft:'Sombra suave',lifted:'Mais profundidade'};
export function setFinish(layer,value){
  delete layer.gradient;delete layer.texture;
  if(value==='light'||value==='paper')layer.gradient={angle:135,amount:.12,tone:'light'};
  if(value==='paper')layer.texture={amount:.035,seed:17};
  if(value==='metal')layer.gradient={angle:25,amount:.28,tone:'satin'};
}
export function finishOf(layer){return layer.texture?'paper':layer.gradient?.tone==='satin'?'metal':layer.gradient?'light':'plain';}
export function setShadow(layer,value){delete layer.shadow;if(value!=='none')layer.shadow={blur:value==='lifted'?26:16,x:0,y:value==='lifted'?10:5,opacity:value==='lifted'?.2:.12};}
export function shadowOf(layer){return !layer.shadow?'none':layer.shadow.blur>20?'lifted':'soft';}
export function validateFinishes(layer){
  const bounded=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
  if(['gradient','texture','shadow'].some(key=>layer[key]!==undefined)&&layer.type!=='shape')throw new Error('Acabamentos são permitidos apenas em formas.');
  const g=layer.gradient,t=layer.texture,s=layer.shadow;
  if(g!==undefined&&(!g||!bounded(g.angle,0,360)||!bounded(g.amount,0,.4)||!['light','satin'].includes(g.tone)))throw new Error('Degradê inválido.');
  if(t!==undefined&&(!t||!bounded(t.amount,0,.08)||!Number.isInteger(t.seed)||!bounded(t.seed,0,65535)))throw new Error('Textura inválida.');
  if(s!==undefined&&(!s||!bounded(s.blur,0,40)||!bounded(s.x,-20,20)||!bounded(s.y,-20,20)||!bounded(s.opacity,0,.3)))throw new Error('Sombra inválida.');
}
export function mixColor(hex,toward,amount){return '#'+hex.slice(1).match(/../g).map((v,i)=>Math.round(parseInt(v,16)*(1-amount)+parseInt(toward.slice(1+i*2,3+i*2),16)*amount).toString(16).padStart(2,'0')).join('');}
export function finishColors(layer){const g=layer.gradient;if(!g)return [layer.fill];return g.tone==='satin'?[mixColor(layer.fill,'#000000',g.amount*.35),mixColor(layer.fill,'#ffffff',g.amount),layer.fill]:[mixColor(layer.fill,'#ffffff',g.amount),layer.fill];}
const tiles=new Map();
export function textureTile(seed){
  if(tiles.has(seed))return tiles.get(seed);
  const tile=document.createElement('canvas');tile.width=tile.height=96;const ctx=tile.getContext('2d'),data=ctx.createImageData(96,96);let state=seed+1;
  for(let i=0;i<data.data.length;i+=4){state=(Math.imul(state,1664525)+1013904223)>>>0;const noise=state>>>24;const color=noise>=128?255:0;data.data[i]=data.data[i+1]=data.data[i+2]=color;data.data[i+3]=96+noise%160;}
  ctx.putImageData(data,0,0);if(tiles.size>=32)tiles.delete(tiles.keys().next().value);tiles.set(seed,tile);return tile;
}
