const rgb=hex=>hex.slice(1).match(/../g).map(n=>parseInt(n,16));
const distance=(a,b)=>Math.hypot(...rgb(a).map((n,i)=>n-rgb(b)[i]));
export function recurringColors(samples){
  if(!Array.isArray(samples)||!samples.length||samples.length>36)throw Error('Selecione de 1 a 36 referências.');
  const groups=[];
  const graphic=samples.some(s=>s?.colors?.some(c=>c.graphic===true));
  const tier=hex=>{if(!graphic)return 0;const values=rgb(hex),min=Math.min(...values),max=Math.max(...values),chroma=max-min;return max<=75||(min>=225&&chroma<=30)||(chroma>=60&&chroma/Math.max(1,max)>=.35)?0:1;};
  for(const [index,sample] of samples.entries()){
    if(!sample||typeof sample.name!=='string'||!Array.isArray(sample.colors)||sample.colors.length>12)throw Error('Referência inválida.');
    for(const color of sample.colors){
      if(!/^#[a-f0-9]{6}$/i.test(color.hex)||!Number.isFinite(color.share)||color.share<0||color.share>1)throw Error('Cor inválida na referência.');
      if(color.share<.01)continue; // Ignore tiny antialias/compression traces, not whole image regions.
      let group=groups.find(g=>distance(g.hex,color.hex)<36);
      if(!group){group={hex:color.hex.toLowerCase(),sources:new Map()};groups.push(group);}
      group.sources.set(index,Math.min(1,(group.sources.get(index)||0)+color.share));
    }
  }
  return groups.map(g=>({hex:g.hex,count:g.sources.size,total:samples.length,share:[...g.sources.values()].reduce((a,b)=>a+b,0)/samples.length,sources:[...g.sources.keys()].map(i=>{const evidence=samples[i].colors.filter(c=>distance(g.hex,c.hex)<36).flatMap(c=>c.evidence||[]).slice(0,6);return {index:i,name:samples[i].name,...(evidence.length?{evidence}:{})};})})).sort((a,b)=>tier(a.hex)-tier(b.hex)||b.count-a.count||b.share-a.share||a.hex.localeCompare(b.hex)).slice(0,12);
}
export function normalizedCrop(start,end){
  if(!start||!end||[start.x,start.y,end.x,end.y].some(n=>!Number.isFinite(n)))throw Error('Recorte inválido.');
  const clamp=n=>Math.max(0,Math.min(1,n)),x=Math.min(clamp(start.x),clamp(end.x)),y=Math.min(clamp(start.y),clamp(end.y));
  const w=Math.abs(clamp(start.x)-clamp(end.x)),h=Math.abs(clamp(start.y)-clamp(end.y));
  if(w<.03||h<.03)throw Error('Selecione uma área maior para analisar.');return {x,y,w,h};
}
export function referenceNotes({samples,colors,profile,observations,palette}){
  const graphic=samples.some(s=>s.colors.some(c=>c.graphic===true));
  const chosen=palette?colors.filter(c=>Object.values(palette).some(hex=>hex.toLowerCase()===c.hex.toLowerCase())):colors;
  return [samples.every(s=>s.sourceMode==='posts')?'Identidade sugerida a partir de publicações; conferida pelo designer.':'Identidade sugerida a partir de prints; conferida pelo designer.',graphic?'Método: regiões gráficas prováveis; não é identificação oficial da marca.':'Método: cores gerais da imagem.',palette?'Paleta escolhida: '+Object.entries(palette).map(([key,hex])=>({primary:'Principal',accent:'Destaque',background:'Fundo'}[key]||key)+' '+hex.toUpperCase()).join('; '):'',profile?'Perfil de referência: '+profile:'',...chosen.map(c=>`${c.hex.toUpperCase()}: presente em ${c.count} de ${c.total} referência(s).`),'Referências: '+samples.map(s=>s.name).join('; '),observations?'Observações visuais do designer: '+observations:'','Tipografia não identificada automaticamente; conferir ou importar a fonte oficial.'].filter(Boolean).join('\n');
}
