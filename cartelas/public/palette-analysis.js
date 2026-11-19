// Bounded, deterministic color sampling. Only opaque pixels contribute to the palette.
export function dominantColors({data,width,height},limit=6){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>32000000||!data||data.length!==width*height*4||!Number.isInteger(limit)||limit<1||limit>12)throw new Error('Imagem inválida para analisar as cores.');
  const bins=new Map(),step=Math.max(1,Math.ceil(width*height/65536));let opaque=0;
  for(let pixel=0;pixel<width*height;pixel+=step){
    const i=pixel*4;if(data[i+3]<255)continue;
    const r=data[i],g=data[i+1],b=data[i+2],key=((r>>4)<<8)|((g>>4)<<4)|(b>>4);
    let bin=bins.get(key);if(!bin){bin={r:0,g:0,b:0,count:0};bins.set(key,bin);}
    bin.r+=r;bin.g+=g;bin.b+=b;bin.count++;opaque++;
  }
  const ranked=[...bins.values()].sort((a,b)=>b.count-a.count||a.r/a.count-b.r/b.count||a.g/a.count-b.g/b.count||a.b/a.count-b.b/b.count);
  const groups=[],distance=(a,b)=>Math.hypot(a.r/a.count-b.r/b.count,a.g/a.count-b.g/b.count,a.b/a.count-b.b/b.count);
  for(const bin of ranked){
    const match=groups.find(group=>distance(bin,group)<30);
    if(match){match.r+=bin.r;match.g+=bin.g;match.b+=bin.b;match.count+=bin.count;}
    else if(groups.length<48)groups.push({...bin});
  }
  const selected=[];
  for(const group of groups.sort((a,b)=>b.count-a.count)){
    if(group.count/opaque<.003||selected.some(previous=>distance(group,previous)<30))continue;
    selected.push(group);if(selected.length===limit)break;
  }
  return selected.map(group=>({hex:'#'+['r','g','b'].map(key=>Math.round(group[key]/group.count).toString(16).padStart(2,'0')).join(''),share:group.count/opaque}));
}
