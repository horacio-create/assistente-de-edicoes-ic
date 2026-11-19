import {colorForToken,protectTemplateContrast} from './design-presets.js';

export function normalizeHex(value){
  const hex=String(value).trim();
  if(!/^#?[0-9a-f]{6}$/i.test(hex))throw new Error('Informe uma cor com seis caracteres, como #C9A86A.');
  return '#'+hex.replace(/^#/,'').toLowerCase();
}
export function pixelPosition(clientX,clientY,rect,width,height){
  if(rect.width<=0||rect.height<=0||width<1||height<1)throw new Error('Imagem indisponível.');
  return {x:Math.max(0,Math.min(width-1,Math.floor((clientX-rect.left)*width/rect.width))),y:Math.max(0,Math.min(height-1,Math.floor((clientY-rect.top)*height/rect.height)))};
}
export function applyPaletteColors(project,colors){
  const next={...project.palette};for(const key of ['primary','accent','background'])next[key]=normalizeHex(colors[key]);
  const previous=project.palette;
  for(const card of project.cards){
    const before=JSON.stringify(card.layers);
    for(const layer of card.layers){
      if(layer.colorToken)layer.fill=colorForToken(next,layer.colorToken);
      else if(layer.role==='background')layer.fill=project.theme==='contrast'?next.primary:next.background;
      else for(const key of ['primary','accent','background'])if(layer.fill?.toLowerCase()===previous[key]?.toLowerCase()){layer.fill=next[key];break;}
    }
    protectTemplateContrast(card);
    if(before!==JSON.stringify(card.layers))card.approved=false;
  }
  project.palette=next;return project;
}
