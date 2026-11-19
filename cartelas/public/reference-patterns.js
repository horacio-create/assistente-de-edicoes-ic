export const PATTERN_NAMES={band:'Faixas horizontais',box:'Caixas de cor',softBox:'Caixas com cantos suavizados (provável)',surface:'Bases de cor ampla',line:'Linhas finas',textGroup:'Grupos de letras (provável)'};
export function graphicPatterns(samples,{singleArtwork=false}={}){
  const groups=new Map();
  for(const [index,sample] of samples.entries())for(const color of sample.colors)for(const element of color.elements||[]){
    if(!PATTERN_NAMES[element.type])continue;const b=element.box;if(!b||[b.x,b.y,b.w,b.h].some(n=>!Number.isFinite(n))||b.w<=0||b.h<=0||b.x<0||b.y<0||b.x+b.w>1.00001||b.y+b.h>1.00001)continue;
    if(!groups.has(element.type))groups.set(element.type,{id:element.type,label:PATTERN_NAMES[element.type],count:0,colors:new Set(),sources:new Map(),positions:new Map()});
    const g=groups.get(element.type);g.count++;g.colors.add(color.hex);
    if(!g.sources.has(index))g.sources.set(index,{index,name:sample.name,evidence:[]});g.sources.get(index).evidence.push(b);
    if(singleArtwork){const center=b.y+b.h/2,key=center<1/3?'topo':center>2/3?'base':'centro';if(!g.positions.has(key))g.positions.set(key,new Set());g.positions.get(key).add(index);}
  }
  return [...groups.values()].map(g=>({...g,colors:[...g.colors],sources:[...g.sources.values()].map(s=>({...s,evidence:s.evidence.slice(0,12)})),positions:singleArtwork?[...g.positions].map(([position,set])=>({position,prints:set.size})):[],total:samples.length})).sort((a,b)=>b.sources.length-a.sources.length||b.count-a.count||a.id.localeCompare(b.id));
}
export function patternNotes(patterns){return patterns.length?'Elementos gráficos conferidos pelo designer (cores escolhidas separadamente na paleta):\n'+patterns.map(p=>`• ${p.label}: ${p.sources.length}/${p.total} referência(s)${p.positions?.length?'; posição na arte individual: '+p.positions.map(v=>v.position+' em '+v.prints+' referência(s)').join(', '):''}.`).join('\n'):'';}
