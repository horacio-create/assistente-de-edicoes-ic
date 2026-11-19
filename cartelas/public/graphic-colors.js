// Local visual heuristic, not semantic segmentation: prefer compact, uniform graphic regions.
// Texture, tiny compression fragments and large photographic colour masses get less influence.
export function graphicColors({data,width,height},limit=10){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1200000||data?.length!==width*height*4||!Number.isInteger(limit)||limit<1||limit>12)throw Error('Imagem inválida para analisar elementos gráficos.');
  const n=width*height,flat=new Uint8Array(n),visited=new Uint8Array(n),labels=new Int32Array(n),queue=new Int32Array(n),regions=[];
  const close=(a,b,t)=>Math.abs(data[a*4]-data[b*4])+Math.abs(data[a*4+1]-data[b*4+1])+Math.abs(data[a*4+2]-data[b*4+2])<t;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;if(data[i*4+3]<250)continue;
    let same=0;for(const p of [i-1,i+1,i-width,i+width])if(close(i,p,35))same++;
    if(same>=3)flat[i]=1;
  }
  for(let seed=0;seed<n;seed++){
    if(!flat[seed]||visited[seed])continue;
    let head=0,tail=1,minX=seed%width,maxX=minX,minY=Math.floor(seed/width),maxY=minY,r=0,g=0,b=0;
    queue[0]=seed;visited[seed]=1;labels[seed]=seed+1;
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);r+=data[i*4];g+=data[i*4+1];b+=data[i*4+2];
      for(const p of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1])if(p>=0&&!visited[p]&&flat[p]&&close(seed,p,65)){visited[p]=1;labels[p]=seed+1;queue[tail++]=p;}
    }
    const w=maxX-minX+1,h=maxY-minY+1,density=tail/(w*h);if(tail<12||w<3||h<3||density<.38)continue;
    const color=[r,g,b].map(v=>Math.round(v/tail)),max=Math.max(...color),min=Math.min(...color),chroma=max-min;
    // Mid-grey shadows/hover overlays are weak evidence; dark text and light bases remain eligible.
    if(chroma<22&&min>65&&max<220)continue;
    let top=0,bottom=0,left=0,right=0;
    for(let x=minX;x<=maxX;x++){if(labels[(minY+Math.min(1,h-1))*width+x]===seed+1)top++;if(labels[(maxY-Math.min(1,h-1))*width+x]===seed+1)bottom++;}
    for(let y=minY;y<=maxY;y++){if(labels[y*width+minX+Math.min(1,w-1)]===seed+1)left++;if(labels[y*width+maxX-Math.min(1,w-1)]===seed+1)right++;}
    const straight=[top/w,bottom/w,left/h,right/h].filter(v=>v>.65).length;
    const rectangle=density>.45&&w>=22&&h>=4&&tail>=80&&straight>=3;
    const glyph=!rectangle&&w>=3&&h>=5&&h<height*.12&&w/h<2.5&&tail<1800;
    if(!rectangle&&!glyph)continue;
    const score=Math.min(16,Math.sqrt(tail)/3)*(rectangle?1.6:.8)*(chroma<22?.35:1);
    const inset=Math.max(1,Math.floor(Math.min(w,h)*.08)),corners=[[minX+inset,minY+inset],[maxX-inset,minY+inset],[minX+inset,maxY-inset],[maxX-inset,maxY-inset]];
    const rounded=rectangle&&corners.filter(([x,y])=>labels[y*width+x]!==seed+1).length>=3;
    regions.push({color,score,area:tail,rectangle,rounded,box:{x:minX/width,y:minY/height,w:w/width,h:h/height}});
  }
  const groups=[];
  for(const region of regions.sort((a,b)=>b.score-a.score)){
    const group=groups.find(g=>Math.hypot(...g.color.map((v,i)=>v-region.color[i]))<34);
    if(group){group.score+=region.score;group.area+=region.area;group.rectangles+=+region.rectangle;group.regions.push(region);}
    else groups.push({color:region.color,score:region.score,area:region.area,rectangles:+region.rectangle,regions:[region]});
  }
  for(const g of groups){
    const lines=[];
    for(const r of g.regions.filter(r=>!r.rectangle)){
      const bottom=r.box.y+r.box.h,line=lines.find(l=>Math.abs(l.bottom-bottom)<4/height&&r.box.h/l.h>.6&&r.box.h/l.h<1.7);
      if(line)line.items.push(r);else lines.push({bottom,h:r.box.h,items:[r]});
    }
    const runs=[];for(const line of lines){let run=null;for(const item of line.items.sort((a,b)=>a.box.x-b.box.x)){const previous=run?.items.at(-1),gap=previous?item.box.x-previous.box.x-previous.box.w:Infinity;if(!run||gap>Math.max(10/width,line.h*height/width*2.5)){run={items:[]};runs.push(run);}run.items.push(item);}}
    const textLines=runs.filter(l=>l.items.length>=5),text=new Set(textLines.flatMap(l=>l.items));
    g.textLines=textLines.map(l=>{const x=Math.min(...l.items.map(r=>r.box.x)),y=Math.min(...l.items.map(r=>r.box.y));return {type:'textGroup',box:{x,y,w:Math.max(...l.items.map(r=>r.box.x+r.box.w))-x,h:Math.max(...l.items.map(r=>r.box.y+r.box.h))-y}};});
    g.regions=g.regions.filter(r=>r.rectangle||text.has(r));g.score=g.regions.reduce((s,r)=>s+r.score,0);
  }
  const selected=groups.filter(g=>(g.score>=10||g.regions.some(r=>r.rectangle&&r.box.w*r.box.h>=.12))&&(g.rectangles>=1||g.regions.length>=5)).sort((a,b)=>b.score-a.score).slice(0,limit),total=selected.reduce((s,g)=>s+g.score,0);
  return selected.map(g=>({hex:'#'+g.color.map(n=>n.toString(16).padStart(2,'0')).join(''),share:g.score/total,graphic:true,graphicScore:g.score,regions:g.regions.length,rectangles:g.rectangles,area:g.area/n,evidence:g.regions.sort((a,b)=>b.score-a.score).slice(0,6).map(r=>r.box),elements:[...g.regions.filter(r=>r.rectangle).map(r=>{const w=r.box.w*width,h=r.box.h*height,area=r.box.w*r.box.h;return {type:w/h>=7&&h<=6?'line':w/h>=3&&area<.2?'band':area>=.12?'surface':r.rounded?'softBox':'box',box:r.box};}),...g.textLines].slice(0,80)}));
}
