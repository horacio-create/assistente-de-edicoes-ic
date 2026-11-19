export function profileFromTab(tab){
  let u;try{u=new URL(tab?.url);}catch{throw Error('Abra o perfil do cliente no Instagram e clique na extensão.');}
  const name=u.pathname.replace(/^\/|\/$/g,'');if(u.protocol!=='https:'||!['www.instagram.com','instagram.com'].includes(u.hostname)||u.username||u.password||u.port||!name||name.includes('/')||! /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(name)||name.includes('..')||['direct','accounts','explore','reels','reel','stories','p'].includes(name.toLowerCase()))throw Error('Abra a página do perfil do cliente. Não capture mensagens ou telas de login.');
  return 'https://www.instagram.com/'+name.toLowerCase()+'/';
}
export function localTarget(port){const n=Number(port);if(!Number.isInteger(n)||n<1024||n>65535)throw Error('Informe a porta do Cartelas, como 3210.');return 'http://127.0.0.1:'+n;}
export function addCapture(batch,capture){
  if(batch.captures.length&&batch.profile!==capture.profile)throw Error('Este lote pertence a outro cliente. Envie ou limpe o lote antes de capturar outro perfil.');
  if(batch.captures.length>=12)throw Error('O lote já tem 12 capturas. Envie antes de continuar.');
  if(batch.captures.some(c=>c.data===capture.data))throw Error('Essa tela já está no lote. Role o feed antes de capturar novamente.');
  if(capture.data.length>2500000||batch.captures.reduce((n,c)=>n+c.data.length,0)+capture.data.length>6*1024*1024)throw Error('O lote está cheio. Envie estas capturas antes de continuar.');
  return {...batch,batchId:crypto.randomUUID(),profile:capture.profile,captures:[...batch.captures,{id:capture.id,data:capture.data,createdAt:capture.createdAt,...(capture.kind?{kind:capture.kind}:{}),...(capture.kind==='grid'?{rows:capture.rows,columns:capture.columns}:{})}]};
}
// Converts a page rectangle (CSS pixels) into a clamped crop box on the captured image, whatever the zoom or pixel density.
export function cropBox(rect,viewport,image){
  if(!rect||!viewport?.width||!image?.width||!image?.height)return {x:0,y:0,width:image?.width||0,height:image?.height||0};
  const scale=image.width/viewport.width,x=Math.max(0,Math.floor(rect.x*scale)),y=Math.max(0,Math.floor(rect.y*scale));
  const right=Math.min(image.width,Math.ceil((rect.x+rect.width)*scale)),bottom=Math.min(image.height,Math.ceil((rect.y+rect.height)*scale));
  if(right-x<120||bottom-y<120)return {x:0,y:0,width:image.width,height:image.height};
  return {x,y,width:right-x,height:bottom-y};
}
export function autoScreens(value){const n=Number(value);return Number.isInteger(n)&&n>=2&&n<=6?n:3;}
