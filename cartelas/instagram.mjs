import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {instagramUsername} from './public/instagram-profile.js';
const settings=['CARTELAS_INSTAGRAM_ENABLED','META_IG_ACCESS_TOKEN','META_IG_USER_ID','META_GRAPH_API_VERSION'];
export async function loadInstagramSettings(env=process.env){
  try{const text=await readFile(new URL('.env',import.meta.url),'utf8');for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&settings.includes(m[1])&&!env[m[1]])env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}}catch(e){if(e.code!=='ENOENT')throw Error('Não foi possível ler a configuração local do Instagram.');}
}
export class InstagramError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function safeInstagramImage(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['cdninstagram.com','fbcdn.net'].some(domain=>u.hostname.endsWith('.'+domain)))return null;return u.href;}catch{return null;}
}
async function limitedBody(response,max){
  if(Number(response.headers.get('content-length'))>max)throw new InstagramError('A resposta do Instagram excedeu o limite permitido.',502);
  const reader=response.body?.getReader();if(!reader)throw new InstagramError('A resposta do Instagram está vazia.',502);const chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new InstagramError('A resposta do Instagram excedeu o limite permitido.',502);chunks.push(Buffer.from(value));}return Buffer.concat(chunks);}finally{await reader.cancel().catch(()=>{});}
}
const mediaFields='id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children.limit(1){id,media_type,media_url,thumbnail_url}';
export function createInstagramService({env=process.env,fetchImpl=globalThis.fetch,now=Date.now}={}){
  const sessions=new Map(),cache=new Map();let cacheBytes=0,listing=false,downloads=0;
  function config(){return {enabled:env.CARTELAS_INSTAGRAM_ENABLED==='1',token:env.META_IG_ACCESS_TOKEN||'',id:env.META_IG_USER_ID||'',version:env.META_GRAPH_API_VERSION||''};}
  function availability(){const c=config(),missing=[];if(!c.enabled)missing.push('ativação');if(!c.token||/[\r\n]/.test(c.token))missing.push('token de acesso');if(!/^\d{5,30}$/.test(c.id))missing.push('ID da conta profissional');if(!/^v\d{2}\.\d+$/.test(c.version))missing.push('versão da API');return {ready:!missing.length,message:missing.length?'Instagram não conectado. Falta configurar: '+missing.join(', ')+'.':'Conexão configurada. Consulte as publicações para verificar o acesso na Meta.',modes:['own','discovery'],limit:12};}
  function prune(){for(const [id,s] of sessions)if(now()-s.created>10*60*1000)sessions.delete(id);for(const [key,c] of cache)if(!sessions.has(key.split('/')[0])){cache.delete(key);cacheBytes-=c.data.length;}}
  async function list(request){
    if(!request||request.consent!==true)throw new InstagramError('Confirme a consulta do perfil na Meta.');
    if(!['own','discovery'].includes(request.mode))throw new InstagramError('Escolha a conta conectada ou um perfil profissional.');
    const username=request.mode==='discovery'?instagramUsername(request.username):null;
    if(!availability().ready)throw new InstagramError('Configure a conexão com a Meta neste computador antes de consultar o feed.',503);
    if(listing)throw new InstagramError('Aguarde a consulta atual terminar.',429);
    listing=true;try{
      const c=config(),url=new URL(`https://graph.facebook.com/${c.version}/${c.id}`);
      const fields=`username,media.limit(12){${mediaFields}}`;url.searchParams.set('fields',username?`business_discovery.username(${username}){${fields}}`:fields);
      let response;try{response=await fetchImpl(url,{headers:{Authorization:'Bearer '+c.token},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new InstagramError('Não foi possível conectar à Meta. Confira a conexão e tente novamente.',502);}
      let value;try{value=JSON.parse((await limitedBody(response,1024*1024)).toString('utf8'));}catch(e){if(e instanceof InstagramError)throw e;throw new InstagramError('A Meta retornou uma resposta inválida.',502);}
      if(!response.ok||value.error){const code=value.error?.code;throw new InstagramError(code===190?'O acesso à Meta expirou ou foi revogado. Atualize o token local.':[10,200].includes(code)?'A conta não tem permissão para esta consulta. Confira as permissões e a conta profissional na Meta.':[4,17,32,613].includes(code)?'A Meta limitou as consultas. Aguarde antes de tentar novamente.':'A Meta não disponibilizou este feed. Confira o perfil, as permissões e a configuração da conta profissional.',502);}
      const account=username?value.business_discovery:value;if(!account||!Array.isArray(account.media?.data))throw new InstagramError('Não foi possível obter as publicações deste perfil profissional.',502);
      const session=randomUUID(),items=new Map(),posts=[],seen=new Set();
      for(const media of account.media.data.slice(0,12)){
        if(!media||!['IMAGE','CAROUSEL_ALBUM','VIDEO'].includes(media.media_type)||!/^\d{1,40}$/.test(String(media.id)))continue;
        if(seen.has(String(media.id)))continue;seen.add(String(media.id));
        const type=media.media_type,first=media.children?.data?.[0],raw=type==='VIDEO'?media.thumbnail_url:type==='CAROUSEL_ALBUM'?(first?.media_type==='VIDEO'?first.thumbnail_url:(first?.media_url||media.media_url)):media.media_url;
        const image=safeInstagramImage(raw),key=randomUUID();if(image)items.set(key,image);
        let permalink=null;try{const u=new URL(media.permalink);if(u.protocol==='https:'&&['www.instagram.com','instagram.com'].includes(u.hostname)&&/^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))permalink=u.origin+u.pathname;}catch{}
        posts.push({id:String(media.id),key,caption:typeof media.caption==='string'?media.caption.slice(0,500):'',type,date:typeof media.timestamp==='string'&&Number.isFinite(Date.parse(media.timestamp))?media.timestamp:null,permalink,previewUrl:image?`/api/instagram/image/${session}/${key}`:null,reason:image?'':raw?'Formato ou origem da imagem não suportado.':type==='VIDEO'?'Capa do vídeo indisponível.':'Imagem não disponibilizada pela Meta.'});
      }
      prune();while(sessions.size>=3)sessions.delete(sessions.keys().next().value);sessions.set(session,{created:now(),items});prune();
      return {session,username:instagramUsername(account.username||username||'conta_conectada'),posts,message:posts.length?'Escolha as publicações que representam a identidade. Carrosséis usam a capa; vídeos usam somente a miniatura disponível.':'Nenhuma publicação disponível. Use os prints como alternativa.'};
    }finally{listing=false;}
  }
  async function image(session,key){
    prune();const url=sessions.get(session)?.items.get(key);if(!url)throw new InstagramError('Esta consulta expirou. Carregue as publicações novamente.',404);
    const cacheKey=session+'/'+key;if(cache.has(cacheKey))return cache.get(cacheKey);
    if(downloads>=4)throw new InstagramError('Aguarde as imagens atuais carregarem e tente novamente.',429);
    downloads++;try{
      let response;try{response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new InstagramError('Não foi possível carregar a imagem. Consulte o feed novamente se o endereço expirou.',502);}
      if(!response.ok)throw new InstagramError('A imagem não está mais disponível. Atualize a consulta.',502);
      const data=await limitedBody(response,8*1024*1024);let type=null;
      if(data.length>=24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';
      else if(data.length>=12&&data[0]===255&&data[1]===216&&data[2]===255)type='image/jpeg';
      else if(data.length>=12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')type='image/webp';
      if(!type)throw new InstagramError('A mídia não é uma imagem PNG, JPG ou WebP válida.',502);
      while(cacheBytes+data.length>24*1024*1024&&cache.size){const old=cache.keys().next().value;cacheBytes-=cache.get(old).data.length;cache.delete(old);}
      const result={data,type};cache.set(cacheKey,result);cacheBytes+=data.length;return result;
    }finally{downloads--;}
  }
  return {availability,list,image};
}
export const instagramService=createInstagramService();
