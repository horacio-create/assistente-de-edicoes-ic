import {serviceGrid} from './service-list.js';
import { WIDTH, HEIGHT, qrContentOf } from './core.js';
import {ICONS,SOLID_ICONS,SOLID_FILL_RULE} from './icons.js';
import {finishColors,textureTile} from './finishes.js';
const imageCache = new Map();
export async function loadImage(asset) {
  if (!imageCache.has(asset.data)) imageCache.set(asset.data,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>{imageCache.delete(asset.data);reject(new Error('Não foi possível abrir a imagem '+asset.name));};im.src=asset.data;}));
  return imageCache.get(asset.data);
}
export function wrapText(ctx, layer) {
  ctx.font=`${layer.font.startsWith('font-')?'normal':layer.weight} ${layer.size}px "${layer.font}"`;
  const result=[];
  for(const paragraph of layer.text.split('\n')) {
    if(!paragraph) {result.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/)) {
      const candidate=line?line+' '+word:word;
      if(line && ctx.measureText(candidate).width>layer.w) {result.push(line);line=word;} else line=candidate;
    }
    result.push(line);
  }
  // Balance automatically wrapped headings without changing the client's explicit line breaks.
  if(layer.role==='title'&&!layer.text.includes('\n')){
    for(let pass=0;pass<result.length*2;pass++){
      let changed=false;
      for(let i=0;i<result.length-1;i++){
        const words=result[i].split(' ');if(words.length<2)continue;
        const moved=words.pop(),left=words.join(' '),right=moved+' '+result[i+1];
        const before=Math.abs(ctx.measureText(result[i]).width-ctx.measureText(result[i+1]).width);
        const after=Math.abs(ctx.measureText(left).width-ctx.measureText(right).width);
        if(ctx.measureText(right).width<=layer.w&&after<before){result[i]=left;result[i+1]=right;changed=true;}
      }
      if(!changed)break;
    }
  }
  const ascent=ctx.measureText('Ág').actualBoundingBoxAscent || layer.size*.8;
  return {lines:result,ascent,height:result.length*layer.size*layer.lineHeight,tooWide:result.some(s=>ctx.measureText(s).width>layer.w+1)};
}
function boxPath(ctx,l) {
  ctx.beginPath();
  if(l.form==='ellipse')ctx.ellipse(l.x+l.w/2,l.y+l.h/2,l.w/2,l.h/2,0,0,Math.PI*2);
  else if(l.form==='cornerSweep'){
    const right=['tr','br'].includes(l.corner),bottom=['bl','br'].includes(l.corner),x=v=>l.x+(right?l.w-v:v),y=v=>l.y+(bottom?l.h-v:v);
    ctx.moveTo(x(0),y(0));ctx.lineTo(x(l.w),y(0));ctx.quadraticCurveTo(x(l.w*.8),y(l.h*.8),x(0),y(l.h));ctx.closePath();
  }else if(l.form==='slant'){
    // One corner moves inward along its horizontal edge, giving the diagonal cut used in retail layouts.
    const cut=Math.min(l.w*.9,l.h*.3),pts=[[l.x,l.y],[l.x+l.w,l.y],[l.x+l.w,l.y+l.h],[l.x,l.y+l.h]];
    ({tl:()=>pts[0][0]+=cut,tr:()=>pts[1][0]-=cut,br:()=>pts[2][0]-=cut,bl:()=>pts[3][0]+=cut})[l.corner]?.();
    ctx.moveTo(...pts[0]);for(const p of pts.slice(1))ctx.lineTo(...p);ctx.closePath();
  }else if(l.form==='wave'){
    // The chosen edge undulates inside the box; the opposite side stays straight.
    const vertical=['left','right'].includes(l.edge),length=vertical?l.h:l.w,depth=vertical?l.w:l.h,a=Math.min(depth*.45,Math.max(10,length*.035));
    const at=(t,d)=>{const along=t*length,inward=l.edge==='left'||l.edge==='top'?d:depth-d;return vertical?[l.x+inward,l.y+along]:[l.x+along,l.y+inward];};
    ctx.moveTo(...at(0,depth));
    for(let i=0;i<=48;i++){const t=i/48;ctx.lineTo(...at(t,a+a*Math.sin(t*Math.PI*3.2+.6)));}
    ctx.lineTo(...at(1,depth));ctx.closePath();
  }else ctx.roundRect(l.x,l.y,l.w,l.h,l.corners?.map(v=>Math.min(v,l.w/2,l.h/2))||Math.min(l.radius||0,l.w/2,l.h/2));
}
export async function drawLayer(ctx, l, assets, placeholders=true) {
  if(!l.visible) return;
  ctx.save(); ctx.globalAlpha=l.opacity;
  if(l.type==='shape') {
    ctx.fillStyle=l.fill;
    if(l.gradient){const angle=l.gradient.angle*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle),span=(Math.abs(dx)*l.w+Math.abs(dy)*l.h)/2,cx=l.x+l.w/2,cy=l.y+l.h/2;
      const gradient=ctx.createLinearGradient(cx-dx*span,cy-dy*span,cx+dx*span,cy+dy*span),colors=finishColors(l);colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));ctx.fillStyle=gradient;}
    if(l.shadow){const scale=ctx.getTransform().a;ctx.shadowColor=`rgba(0,0,0,${l.shadow.opacity})`;ctx.shadowBlur=l.shadow.blur*scale;ctx.shadowOffsetX=l.shadow.x*scale;ctx.shadowOffsetY=l.shadow.y*scale;}
    boxPath(ctx,l);ctx.fill();ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
    if(l.texture){boxPath(ctx,l);ctx.clip();ctx.globalAlpha=l.opacity*l.texture.amount;ctx.fillStyle=ctx.createPattern(textureTile(l.texture.seed),'repeat');ctx.fillRect(l.x,l.y,l.w,l.h);}
  }
  if(l.type==='icon'){
    const size=Math.min(l.w,l.h);ctx.translate(l.x+(l.w-size)/2,l.y+(l.h-size)/2);ctx.scale(size/24,size/24);ctx.strokeStyle=l.fill;ctx.lineWidth=l.strokeWidth;ctx.lineCap='round';ctx.lineJoin='round';
    if(l.iconVariant==='solid'&&SOLID_ICONS[l.icon]){ctx.fillStyle=l.fill;ctx.fill(new Path2D(SOLID_ICONS[l.icon]),SOLID_FILL_RULE[l.icon]||'evenodd');}
    else for(const path of ICONS[l.icon].paths)ctx.stroke(new Path2D(path));
  }
  if(l.type==='text') {
    const metrics=wrapText(ctx,l);ctx.fillStyle=l.fill;ctx.textBaseline='alphabetic';ctx.textAlign=l.align;
    ctx.beginPath();ctx.rect(l.x,l.y,l.w,l.h);ctx.clip();
    const x=l.align==='center'?l.x+l.w/2:l.align==='right'?l.x+l.w:l.x;
    metrics.lines.forEach((line,i)=>ctx.fillText(line,x,l.y+metrics.ascent+i*l.size*l.lineHeight));
  }
  if(l.type==='image') {
    const a=assets[l.assetId];
    if(a) {
      const im=await loadImage(a);const scale=(l.fit==='contain'?Math.min(l.w/im.width,l.h/im.height):Math.max(l.w/im.width,l.h/im.height))*l.zoom*(l.role==='logo'?1-2*(l.logoInset||0):1);
      boxPath(ctx,l);ctx.clip();if(l.role==='qr')ctx.imageSmoothingEnabled=false;ctx.drawImage(im,l.x+(l.w-im.width*scale)/2+l.offsetX,l.y+(l.h-im.height*scale)/2+l.offsetY,im.width*scale,im.height*scale);
    } else if(placeholders) {
      ctx.fillStyle=l.role==='logo'?'#ffffffb3':l.role==='qr'?'#ffffff':'#dedbd4';boxPath(ctx,l);ctx.fill();
      ctx.strokeStyle='#8a8a7660';ctx.lineWidth=2;ctx.setLineDash([8,8]);boxPath(ctx,l);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#747969';ctx.font='20px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(l.role==='logo'?'Adicionar logo':l.role==='qr'?'QR do cliente':'Adicionar foto',l.x+l.w/2,l.y+l.h/2);
    }
  }
  ctx.restore();
}
export async function drawCard(card,assets,canvas,selected=null,placeholders=true,guides=[]) {
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/WIDTH,canvas.height/HEIGHT);
  for(const l of card.layers) await drawLayer(ctx,l,assets,placeholders);
  for(const selection of card.layers.filter(l=>Array.isArray(selected)?selected.includes(l.id):l.id===selected)){
  if(selection?.visible) {ctx.strokeStyle='#4c8c51';ctx.lineWidth=3;ctx.setLineDash([9,5]);ctx.strokeRect(selection.x,selection.y,selection.w,selection.h);if(!selection.locked){ctx.setLineDash([]);ctx.fillStyle='#4c8c51';ctx.fillRect(selection.x+selection.w-7,selection.y+selection.h-7,14,14);}}
  }
  if(guides.length){ctx.strokeStyle='#398db9';ctx.lineWidth=1.5;ctx.setLineDash([6,6]);for(const guide of guides){ctx.beginPath();if(guide.axis==='x'){ctx.moveTo(guide.value,0);ctx.lineTo(guide.value,HEIGHT);}else{ctx.moveTo(0,guide.value);ctx.lineTo(WIDTH,guide.value);}ctx.stroke();}}
  ctx.restore(); return canvas;
}
export function textIssues(card) {
  const ctx=document.createElement('canvas').getContext('2d');const issues=[];
  for(const l of card.layers.filter(l=>l.visible&&l.type==='text')) {const m=wrapText(ctx,l);if(m.height>l.h+1||m.tooWide) issues.push(`${l.name}: o texto não cabe na área. Aumente a área ou ajuste a tipografia.`);}
  return issues;
}
// Fit only on explicit template application. The persisted size is shared by preview and Photoshop.
export function fitCardTypography(card) {
  const ctx=document.createElement('canvas').getContext('2d');
  expandReadingArea(card,ctx);
  for(const l of card.layers.filter(l=>l.type==='text'&&l.visible&&['title','body','serviceText','contactText'].includes(l.role))){
    const floor=l.role==='title'?30:l.role==='serviceText'?18:l.role==='contactText'?20:22;
    if(l.role==='contactText'){const body=card.layers.find(b=>b.role==='body'),rows=card.layers.filter(r=>r.role==='contactText'),height=body.h/rows.length,index=rows.indexOf(l);l.y=body.y+index*height+4;l.h=Math.max(16,height-8);while(l.size>floor){const m=wrapText(ctx,l);if(m.height<=l.h&&!m.tooWide)break;l.size=Math.max(floor,l.size-1);}const m=wrapText(ctx,l);l.h=Math.min(height-4,m.height);l.y=body.y+(index+.5)*height-l.h/2;continue;}
    const icon=l.role==='serviceText'?card.layers.find(i=>i.role==='serviceIcon'&&i.serviceId===l.serviceId):null;
    // The hidden body retains the list grid. Fit before centering so a second application is stable.
    const body=icon?card.layers.find(i=>i.role==='body'):null,rows=body?card.layers.filter(i=>i.role==='serviceText'):[];
    const rowHeight=body?serviceGrid(body,rows.length).height:0;
    if(icon&&body){l.y=icon.y+icon.h/2-rowHeight/2+8;l.h=Math.max(16,rowHeight-16);}
    while(l.size>floor){const m=wrapText(ctx,l);if(m.height<=l.h&& !m.tooWide)break;l.size=Math.max(floor,l.size-1);}
    if(icon&&body){const m=wrapText(ctx,l);l.h=Math.min(rowHeight-4,m.height);l.y=icon.y+icon.h/2-l.h/2;}
  }
  // Each contact fits independently: a long handle must not shrink the phone too.
  return card;
}
// Reclaim empty space before reducing type. Only standard reading zones move.
export function expandReadingArea(card,ctx){
  const title=card.layers.find(l=>l.role==='title'&&l.visible),body=card.layers.find(l=>l.role==='body');
  if(!title||title.locked||!body||body.locked||card.serviceLayout||card.contactLayout)return card;
  const measured=wrapText(ctx,title);if(measured.height<=title.h&&!measured.tooWide)return card;
  const desired=Math.ceil(measured.height),bottom=Math.min(640,body.y+body.h),nextY=Math.max(body.y,title.y+desired+28),remaining=bottom-nextY;
  if(remaining<120||desired>360)return card;
  const proposed={...title,h:desired},flow={...body,y:nextY,h:remaining};
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  if(card.layers.some(l=>l.visible&&['image','text','icon'].includes(l.type)&&l!==title&&l!==body&&(overlaps(l,proposed)||overlaps(l,flow))))return card;
  title.h=desired;body.y=nextY;body.h=remaining;return card;
}
export function makeCanvas(width=WIDTH,height=HEIGHT) {const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
export function canvasBlob(canvas) {return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao exportar imagem.')),'image/png'));}
export async function verifyQrAppearance(card,assets) {
  const codes=card.layers.filter(l=>l.role==='qr'&&l.visible);if(!codes.length)return;
  if(typeof globalThis.jsQR!=='function')throw new Error('Não foi possível carregar a verificação do QR Code. Atualize o aplicativo.');
  const frame=makeCanvas();await drawCard(card,assets,frame,null,false);const ctx=frame.getContext('2d');
  for(const l of codes) {
    const x=Math.max(0,Math.floor(l.x)),y=Math.max(0,Math.floor(l.y));
    const w=Math.min(WIDTH-x,Math.ceil(l.w)),h=Math.min(HEIGHT-y,Math.ceil(l.h));
    if(w<=0||h<=0)throw new Error('QR Code fora da área da cartela.');
    const pixels=ctx.getImageData(x,y,w,h);const decoded=globalThis.jsQR(pixels.data,w,h,{inversionAttempts:'attemptBoth'});
    if(!decoded||(qrContentOf(l)!==null&&decoded.data!==qrContentOf(l)))throw new Error('QR Code não está legível na arte final. Confira tamanho, recorte e elementos sobrepostos.');
  }
}
export async function readQrImage(asset) {
  const im=await loadImage(asset);const ratio=Math.min(1,1600/Math.max(im.width,im.height));
  const c=makeCanvas(Math.round(im.width*ratio),Math.round(im.height*ratio));const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
  const pixels=ctx.getImageData(0,0,c.width,c.height);return globalThis.jsQR?.(pixels.data,c.width,c.height)?.data??null;
}
