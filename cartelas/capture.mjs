import {dataRoot} from './dados.mjs';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {instagramUsername} from './public/instagram-profile.js';
export class CaptureError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export const extensionOrigin=value=>/^chrome-extension:\/\/[a-p]{32}$/.test(value||'');
const hash=s=>createHash('sha256').update(s).digest('hex');
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function validateCaptureBatch(value){
  if(!value||!uuid(value.batchId)||!Array.isArray(value.captures)||!value.captures.length||value.captures.length>12)throw new CaptureError('Envie de 1 a 12 capturas por lote.');
  let username;try{username=instagramUsername(value.profile);}catch{throw new CaptureError('Perfil do Instagram inválido no lote.');}
  let size=0;const ids=new Set(),captures=value.captures.map(c=>{
    if(!c||!uuid(c.id)||ids.has(c.id)||typeof c.data!=='string'||c.data.length>2500000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(c.data)||typeof c.createdAt!=='string'||c.createdAt.length>40||!Number.isFinite(Date.parse(c.createdAt)))throw new CaptureError('Captura inválida. Capture a tela novamente.');
    ids.add(c.id);size+=c.data.length;const data=Buffer.from(c.data.slice(22),'base64');
    if(data.length<33||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||data.toString('ascii',12,16)!=='IHDR')throw new CaptureError('A captura precisa ser uma imagem PNG válida.');
    const w=data.readUInt32BE(16),h=data.readUInt32BE(20);if(!w||!h||w>20000||h>20000||w*h>32000000)throw new CaptureError('Reduza o tamanho da captura.');
    // Optional layout hints from automatic capture: the profile header, or a grid with whole rows of posts.
    const grid=c.kind==='grid'&&Number.isInteger(c.rows)&&c.rows>=1&&c.rows<=6&&Number.isInteger(c.columns)&&c.columns>=1&&c.columns<=3;
    return {id:c.id,name:'@'+username+' · captura-'+c.id+'.png',data:c.data,createdAt:c.createdAt,kind:grid?'grid':c.kind==='profile'?'profile':'screen',...(grid?{rows:c.rows,columns:c.columns}:{})};
  });
  if(size>6*1024*1024)throw new CaptureError('Divida as capturas em lotes de até 6 MB.');
  return {batchId:value.batchId,profile:'https://www.instagram.com/'+username+'/',username,captures};
}
export function createCaptureService({directory=path.join(dataRoot,'.capture')+path.sep,now=Date.now}={}){
  const folder=directory instanceof URL?fileURLToPath(directory):directory;
  let devices=[],loaded=false,loadPromise=null,code=null,attempts=[],writing=Promise.resolve();const batches=new Map(),receipts=new Map();
  const file=()=>path.join(folder,'devices.json');
  async function load(){if(loaded)return;if(loadPromise)return loadPromise;loadPromise=(async()=>{try{const value=JSON.parse(await readFile(file(),'utf8'));if(!Array.isArray(value)||value.length>3||value.some(d=>!uuid(d.id)||!extensionOrigin(d.origin)||!/^\w{64}$/.test(d.hash)||!Number.isFinite(d.created)))throw Error();devices=value;}catch(e){if(e.code!=='ENOENT')throw new CaptureError('Não foi possível ler as conexões locais. Confira a pasta .capture.',503);}loaded=true;})();try{await loadPromise;}finally{loadPromise=null;}}
  async function persist(){const snapshot=JSON.stringify(devices),target=file();writing=writing.catch(()=>{}).then(async()=>{const dest=target;await mkdir(path.dirname(dest),{recursive:true});const temp=dest+'.tmp';await writeFile(temp,snapshot,{mode:0o600});await rename(temp,dest);});try{await writing;}catch{throw new CaptureError('Não foi possível guardar a conexão neste computador.',503);}}
  function prune(){for(const [id,b] of batches)if(now()-b.created>=3600000)batches.delete(id);for(const [id,r] of receipts)if(now()-r.created>=3600000)receipts.delete(id);}
  const summary=b=>({id:b.id,profile:b.profile,count:b.captures.length,createdAt:new Date(b.created).toISOString(),expiresAt:new Date(b.created+3600000).toISOString()});
  async function createCode(){await load();code={value:randomBytes(6).toString('hex').toUpperCase(),expires:now()+300000};attempts=[];return {code:code.value.slice(0,6)+'-'+code.value.slice(6),expiresAt:new Date(code.expires).toISOString()};}
  async function pair(origin,value){
    if(!extensionOrigin(origin))throw new CaptureError('Origem de extensão inválida.',403);await load();attempts=attempts.filter(t=>now()-t<60000);if(attempts.length>=10)throw new CaptureError('Aguarde um minuto antes de tentar conectar novamente.',429);attempts.push(now());
    const input=typeof value==='string'?value.replace(/[\s-]/g,'').toUpperCase():'';if(!code||now()>=code.expires||!same(input,code.value))throw new CaptureError('Código inválido ou expirado. Gere outro no Cartelas.',401);
    const claimed=code;code=null;
    const token=randomBytes(32).toString('base64url'),device={id:randomUUID(),origin,hash:hash(token),created:now()},previous=devices;devices=[...devices.filter(d=>d.origin!==origin),device].slice(-3);
    try{await persist();code=null;}catch(e){devices=previous;if(!code)code=claimed;throw e;}
    return {token,deviceId:device.id};
  }
  async function authenticate(origin,authorization){await load();if(!extensionOrigin(origin)||typeof authorization!=='string'||!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))throw new CaptureError('Conecte a extensão novamente pelo código do Cartelas.',401);const digest=hash(authorization.slice(7)),device=devices.find(d=>d.origin===origin&&same(d.hash,digest));if(!device)throw new CaptureError('A conexão foi removida. Gere um novo código no Cartelas.',401);return device;}
  async function receive(origin,authorization,value){
    const device=await authenticate(origin,authorization),batch=validateCaptureBatch(value);prune();const key=device.id+'/'+batch.batchId,digest=hash(JSON.stringify(batch)),receipt=receipts.get(key);
    if(receipt){if(receipt.digest!==digest)throw new CaptureError('O lote mudou. Capture um novo lote para enviar.',409);return {id:receipt.id,received:true,duplicate:true};}
    if(batches.size>=3)throw new CaptureError('Há três lotes aguardando no Cartelas. Importe ou descarte um antes de enviar mais.',409);
    if(receipts.size>=100)throw new CaptureError('Muitos lotes nesta hora. Aguarde antes de enviar outro.',429);
    const id=randomUUID(),created=now();batches.set(id,{...batch,id,created,deviceId:device.id});receipts.set(key,{id,digest,created});return {id,received:true,duplicate:false};
  }
  async function state(){await load();prune();return {devices:devices.map(d=>({id:d.id,createdAt:new Date(d.created).toISOString()})),batches:[...batches.values()].map(summary)};}
  function detail(id){prune();const b=batches.get(id);if(!b)throw new CaptureError('Este lote expirou ou já foi importado.',404);return {...summary(b),images:b.captures.map(c=>({id:c.id,name:c.name,url:`api/capture/batches/${id}/images/${c.id}`,kind:c.kind||'screen',...(c.kind==='grid'?{rows:c.rows,columns:c.columns}:{})}))};}
  function image(id,imageId){prune();const c=batches.get(id)?.captures.find(c=>c.id===imageId);if(!c)throw new CaptureError('Captura indisponível.',404);return Buffer.from(c.data.slice(22),'base64');}
  function acknowledge(id,ids){prune();if(!Array.isArray(ids)||ids.length>12||ids.some(v=>!uuid(v)))throw new CaptureError('Seleção de capturas inválida.');const b=batches.get(id);if(b){b.captures=b.captures.filter(c=>!ids.includes(c.id));if(!b.captures.length)batches.delete(id);}return {ok:true};}
  function discard(id){batches.delete(id);return {ok:true};}
  async function revoke(id){await load();const previous=devices;devices=devices.filter(d=>d.id!==id);try{await persist();}catch(e){devices=previous;throw e;}return {ok:true};}
  return {createCode,pair,receive,state,detail,image,acknowledge,discard,revoke};
}
export const captureService=createCaptureService();
