export const IDENTITY_PATTERNS={band:'Faixas',box:'Caixas',softBox:'Caixas arredondadas',surface:'Bases de cor',line:'Linhas',textGroup:'Grupos de letras'};
export function validateVisualIdentity(value){
  if(value===undefined)return;
  if(!value||value.version!==1||!Array.isArray(value.patterns)||value.patterns.length>6||new Set(value.patterns).size!==value.patterns.length||value.patterns.some(p=>!Object.hasOwn(IDENTITY_PATTERNS,p))||!Number.isInteger(value.sourceCount)||value.sourceCount<0||value.sourceCount>36||!['prints','posts','manual'].includes(value.sourceMode)||(value.sourceMode==='manual'?value.sourceCount!==0:value.sourceCount<1))throw Error('Elementos da identidade inválidos. Confira o perfil.');
  return value;
}
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const inside=b=>b.x>=0&&b.y>=0&&b.x+b.w<=1280&&b.y+b.h<=720;
function readable(hex){const n=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*n[0]+.7152*n[1]+.0722*n[2]>.179?'#141820':'#ffffff';}
// Adds a bounded visual vocabulary, never attempts to reconstruct a post or move content.
export function applyIdentityElements(card,palette,identity){
  validateVisualIdentity(identity);
  const before=JSON.stringify(card.layers),notes=[],patterns=new Set(identity?.patterns||[]),prefix=card.id+'-identity-';
  card.layers=card.layers.filter(l=>!l.id.startsWith(prefix));
  const title=card.layers.find(l=>l.visible&&l.role==='title'),content=card.layers.filter(l=>l.visible&&l.role!=='background'&&l.role!=='decoration');
  const make=(key,box,fill,radius=0)=>({id:prefix+key,name:'Identidade · '+IDENTITY_PATTERNS[key],type:'shape',role:'decoration',...box,fill,radius,opacity:1,visible:true,locked:false,colorToken:fill===palette.accent?'accent':'primary'});
  const safe=(box,except=null)=>inside(box)&&!content.some(l=>l!==except&&overlaps(box,l));
  const addBehind=(layer,target)=>card.layers.splice(card.layers.indexOf(target),0,layer);
  if(title&&(patterns.has('box')||patterns.has('softBox'))){
    const key=patterns.has('softBox')?'softBox':'box',box={x:title.x-14,y:title.y-10,w:title.w+28,h:title.h+20};
    if(!title.locked&&safe(box,title)){const layer=make(key,box,palette.accent,key==='softBox'?22:0);addBehind(layer,title);title.fill=readable(palette.accent);delete title.colorToken;}
    else notes.push('Caixa do título: sem espaço livre; mantida a composição.');
  }
  for(const key of ['band','line'])if(patterns.has(key)){
    const h=key==='band'?12:3,w=Math.min(title?.w||300,key==='band'?320:440),candidates=title?[{x:title.x,y:title.y+title.h+12,w,h},{x:title.x,y:title.y-20,w,h}]:[];
    candidates.push({x:56,y:664,w,h},{x:56,y:42,w,h});
    const box=candidates.find(b=>safe(b)&&!card.layers.some(l=>l.id.startsWith(prefix)&&overlaps(b,l)));
    if(box){const layer=make(key,box,palette.accent,key==='band'?6:0);card.layers.push(layer);}else notes.push(IDENTITY_PATTERNS[key]+': sem espaço livre; elemento não adicionado.');
  }
  // Background and typography are supplied by the approved palette and font; textGroup is evidence, not a shape.
  if(before!==JSON.stringify(card.layers))card.approved=false;
  return notes;
}
