// Reads a client's public website to suggest brand colors and logo candidates.
// Only public http(s) addresses are fetched; internal network addresses are refused.
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {randomUUID} from 'node:crypto';

export class SiteError extends Error{constructor(message,status=400){super(message);this.status=status;}}

const HTML_LIMIT=2*1024*1024,CSS_LIMIT=1024*1024,IMAGE_LIMIT=4*1024*1024,TIMEOUT=10000,MAX_REDIRECTS=3;
const IMAGE_TYPES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg'};

export function normalizeSiteUrl(value){
  let text=String(value||'').trim();if(!text||text.length>500)throw new SiteError('Informe o endereço do site do cliente.');
  if(!/^https?:\/\//i.test(text))text='https://'+text;
  let url;try{url=new URL(text);}catch{throw new SiteError('Endereço de site inválido.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new SiteError('Use um endereço http ou https, sem usuário e senha.');
  if(url.port&&!['80','443'].includes(url.port))throw new SiteError('Use o endereço público do site, sem porta especial.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||(!isIP(host)&&!host.includes('.')))throw new SiteError('Use o endereço público do site do cliente.');
  url.hash='';return url;
}

export function privateAddress(address){
  const ip=address.toLowerCase().replace(/^::ffff:/,'');
  if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===198&&(b===18||b===19))||a>=224;}
  return ip==='::'||ip==='::1'||/^f[cd]/.test(ip)||/^fe[89ab]/.test(ip)||/^ff/.test(ip);
}

async function assertPublic(url,resolve){
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[host]:(await resolve(host).catch(()=>{throw new SiteError('Não encontrei este site. Confira o endereço.',404);})).map(a=>a.address);
  if(!addresses.length||addresses.some(privateAddress))throw new SiteError('Este endereço aponta para uma rede interna e não pode ser lido.',403);
}

async function readLimited(response,limit){
  const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new SiteError('O arquivo do site é grande demais para a leitura.',413);}chunks.push(value);}
  return Buffer.concat(chunks);
}

export function createSiteService({fetchImpl=fetch,resolve=host=>lookup(host,{all:true}),now=Date.now}={}){
  const sessions=new Map();
  async function get(url,limit,accept){
    let current=url;
    for(let hop=0;hop<=MAX_REDIRECTS;hop++){
      await assertPublic(current,resolve);
      let response;try{response=await fetchImpl(current.href,{redirect:'manual',signal:AbortSignal.timeout(TIMEOUT),headers:{'User-Agent':'Mozilla/5.0 (compatible; Cartelas/0.2; leitura de identidade visual)','Accept':accept}});}
      catch(error){throw new SiteError(error?.name==='TimeoutError'?'O site demorou demais para responder.':'Não consegui acessar o site. Confira o endereço e a internet.',502);}
      if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)break;current=normalizeSiteUrl(new URL(location,current).href);continue;}
      if(!response.ok)throw new SiteError('O site respondeu com erro '+response.status+'.',502);
      return {url:current,type:(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),data:await readLimited(response,limit)};
    }
    throw new SiteError('O site redirecionou vezes demais.',502);
  }
  function prune(){for(const [id,s] of sessions)if(now()-s.created>10*60*1000)sessions.delete(id);while(sessions.size>3)sessions.delete(sessions.keys().next().value);}
  async function read(value){
    const page=await get(normalizeSiteUrl(value),HTML_LIMIT,'text/html,application/xhtml+xml');
    if(!/html/.test(page.type))throw new SiteError('Este endereço não é uma página de site.',415);
    const html=page.data.toString('utf8'),found=extractSite(html,page.url);
    const css=[...found.inlineCss];
    for(const href of found.stylesheets.slice(0,4)){try{const sheet=await get(normalizeSiteUrl(href),CSS_LIMIT,'text/css');if(/css|text\/plain/.test(sheet.type))css.push(sheet.data.toString('utf8'));}catch{/* a stylesheet that fails is skipped */}}
    const colors=rankColors({themeColor:found.themeColor,css:css.join('\n')});
    const session=randomUUID(),items=new Map();
    const images=found.images.slice(0,8).map(item=>{const key=String(items.size);items.set(key,item.url);return {key,kind:item.kind,label:item.label,previewUrl:`/api/site/image/${session}/${key}`};});
    prune();sessions.set(session,{created:now(),items});prune();
    return {session,site:page.url.origin,title:found.title,colors,images,message:colors.length||images.length?'Confira as cores e imagens encontradas. Nada é aplicado sem sua escolha.':'Não encontrei cores ou imagens de marca nesta página.'};
  }
  async function image(session,key){
    prune();const url=sessions.get(session)?.items.get(key);if(!url)throw new SiteError('Esta leitura expirou. Leia o site novamente.',404);
    const file=await get(normalizeSiteUrl(url),IMAGE_LIMIT,'image/png,image/jpeg,image/webp,image/svg+xml');
    if(!IMAGE_TYPES[file.type])throw new SiteError('Formato de imagem não suportado.',415);
    return {type:file.type,data:file.data};
  }
  return {read,image};
}

const attr=(tag,name)=>{const m=tag.match(new RegExp('\\s'+name+'\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));return m?(m[2]??m[3]??m[4]??'').trim():'';};
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');

export function extractSite(html,base){
  const absolute=href=>{try{const u=new URL(decode(href),base);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
  const title=decode((html.match(/<title[^>]*>([^<]{0,200})/i)?.[1]||'').trim());
  const metas=html.match(/<meta\b[^>]*>/gi)||[],links=html.match(/<link\b[^>]*>/gi)||[],imgs=html.match(/<img\b[^>]*>/gi)||[];
  const themeColor=metas.map(t=>attr(t,'name').toLowerCase()==='theme-color'?attr(t,'content'):'').find(Boolean)||'';
  const stylesheets=links.filter(t=>/\bstylesheet\b/i.test(attr(t,'rel'))).map(t=>absolute(attr(t,'href'))).filter(Boolean);
  const inlineCss=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).concat([...html.matchAll(/\sstyle\s*=\s*"([^"]{0,500})"/gi)].map(m=>m[1]));
  const images=[],seen=new Set(),add=(url,kind,label)=>{if(url&&!seen.has(url)&&!/\.ico(?:$|\?)/i.test(url)){seen.add(url);images.push({url,kind,label});}};
  for(const tag of imgs){const hint=[attr(tag,'src'),attr(tag,'alt'),attr(tag,'class'),attr(tag,'id')].join(' ');if(/logo|marca|brand/i.test(hint)){const src=attr(tag,'src')||attr(tag,'data-src');add(absolute(src),'logo','Imagem marcada como logo'+(attr(tag,'alt')?': '+decode(attr(tag,'alt')).slice(0,60):''));}}
  const icons=links.filter(t=>/icon/i.test(attr(t,'rel'))).map(t=>({url:absolute(attr(t,'href')),size:Math.max(0,...(attr(t,'sizes').match(/\d+/g)||['0']).map(Number)),apple:/apple-touch-icon/i.test(attr(t,'rel'))})).filter(i=>i.url).sort((a,b)=>(b.apple-a.apple)||(b.size-a.size));
  for(const icon of icons.slice(0,2))add(icon.url,'icon','Ícone do site');
  const og=metas.find(t=>/^og:image$/i.test(attr(t,'property')));if(og)add(absolute(attr(og,'content')),'social','Imagem de compartilhamento do site');
  return {title,themeColor,stylesheets,inlineCss,images};
}

const hex=v=>{let h=v.replace('#','').toLowerCase();if(h.length===3||h.length===4)h=[...h.slice(0,3)].map(c=>c+c).join('');else h=h.slice(0,6);return /^[0-9a-f]{6}$/.test(h)?'#'+h:null;};
const rgb=(r,g,b)=>'#'+[r,g,b].map(n=>Math.max(0,Math.min(255,Math.round(Number(n)))).toString(16).padStart(2,'0')).join('');
export function rankColors({themeColor='',css=''}){
  // Platform defaults (WordPress block presets and their helper classes) are not the client's brand.
  css=css.replace(/--wp--preset--[a-z0-9-]+\s*:[^;}]*[;}]?/gi,'').replace(/\.has-[a-z0-9-]+-(?:background-color|color|border-color)[^{]*\{[^}]*\}/gi,'');
  const scores=new Map(),reasons=new Map(),bump=(color,score,reason)=>{if(!color)return;scores.set(color,(scores.get(color)||0)+score);if(reason&&!reasons.has(color))reasons.set(color,reason);};
  bump(hex(themeColor.trim())||null,40,'Cor do tema do site');
  for(const m of css.matchAll(/--([a-z0-9-]*(?:primary|primaria|brand|marca|accent|destaque|secondary|main)[a-z0-9-]*)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi)){const v=m[2].startsWith('#')?hex(m[2]):(()=>{const n=m[2].match(/[\d.]+/g);return n&&n.length>=3?rgb(n[0],n[1],n[2]):null;})();bump(v,25,'Variável --'+m[1]);}
  for(const m of css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi))bump(hex(m[0]),1);
  for(const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi))bump(rgb(m[1],m[2],m[3]),1);
  const neutral=c=>{const [r,g,b]=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return Math.max(r,g,b)-Math.min(r,g,b)<12;};
  const ranked=[...scores].map(([color,score])=>({color,score:neutral(color)&&!reasons.has(color)?score*.25:score,neutral:neutral(color)&&!reasons.has(color),reason:reasons.get(color)||'Usada no visual do site'})).sort((a,b)=>b.score-a.score);
  // Brand colors first; at most two neutrals (usually text and background).
  return [...ranked.filter(c=>!c.neutral).slice(0,6),...ranked.filter(c=>c.neutral).slice(0,2)].sort((a,b)=>b.score-a.score).map(({color,reason})=>({color,reason}));
}

export const siteService=createSiteService();
