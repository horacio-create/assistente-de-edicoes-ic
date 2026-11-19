import {dataRoot} from './dados.mjs';
import {captureService,extensionOrigin} from './capture.mjs';
import {instagramService,loadInstagramSettings} from './instagram.mjs';
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import {photoshopAvailability,startPhotoshopJob,photoshopJobStatus,photoshopJobDownload} from './photoshop.mjs';
import {safeName} from './public/export.js';
import {readerService,readerAvailability} from './reader.mjs';
import {backupService} from './backups.mjs';
import {libraryBackupService} from './library-backups.mjs';
import {deliveryService} from './deliveries.mjs';
import {aiService,loadAiSettings} from './ai.mjs';
import {siteService} from './site.mjs';
import {spawn} from 'node:child_process';
const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'public');
const referenceRoot = path.join(dataRoot, 'Referências Cartelas');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml' };
const qrReaderPath=createRequire(import.meta.url).resolve('jsqr');
export function createServer({reader=readerService,backups=backupService,libraries=libraryBackupService,ai=aiService,deliveries=deliveryService,instagram=instagramService,capture=captureService,site=siteService}={}) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'");
    try {
      if (!/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end('Host inválido'); }
      if(req.url==='/api/health'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({app:'assistente-de-cartelas',version:'0.2.0',ready:true}));}
      if(req.url.startsWith('/api/capture/')){
        res.setHeader('Content-Type','application/json; charset=utf-8');const origin=req.headers.origin,external=extensionOrigin(origin),extensionRoute=['/api/capture/pair','/api/capture/receive'].includes(req.url);
        if(external&&extensionRoute){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Private-Network','true');if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}}
        const sameOrigin=(!origin||origin===`http://${req.headers.host}`)&&req.headers['sec-fetch-site']!=='cross-site';
        if(extensionRoute?!external:!sameOrigin){res.writeHead(403);return res.end(JSON.stringify({error:'Origem não autorizada para capturas.'}));}
        if(req.url==='/api/capture/state'&&req.method==='GET')return res.end(JSON.stringify(await capture.state()));
        const image=req.url.match(/^\/api\/capture\/batches\/([a-f0-9-]{36})\/images\/([a-f0-9-]{36})$/);
        if(image&&req.method==='GET'){const data=capture.image(image[1],image[2]);res.setHeader('Content-Type','image/png');return res.end(data);}
        const batch=req.url.match(/^\/api\/capture\/batches\/([a-f0-9-]{36})(?:\/(ack|discard))?$/);
        if(batch&&!batch[2]&&req.method==='GET')return res.end(JSON.stringify(capture.detail(batch[1])));
        if(req.method!=='POST'){res.writeHead(404);return res.end(JSON.stringify({error:'Recurso de captura indisponível.'}));}
        if(!extensionRoute&&origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Use JSON para enviar as capturas.'}));}
        const limit=req.url==='/api/capture/receive'?8*1024*1024:4096,chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes<=limit)chunks.push(chunk);}if(bytes>limit){res.writeHead(413);return res.end(JSON.stringify({error:'O lote excede o limite permitido.'}));}const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
        let result;
        if(req.url==='/api/capture/code')result=await capture.createCode();
        else if(req.url==='/api/capture/pair')result=await capture.pair(origin,value.code);
        else if(req.url==='/api/capture/receive')result=await capture.receive(origin,req.headers.authorization,value);
        else if(batch&&batch[2]==='ack')result=capture.acknowledge(batch[1],value.ids);
        else if(batch&&batch[2]==='discard')result=capture.discard(batch[1]);
        else if(req.url==='/api/capture/revoke')result=await capture.revoke(value.id);
        else{res.writeHead(404);return res.end(JSON.stringify({error:'Recurso de captura indisponível.'}));}
        return res.end(JSON.stringify(result));
      }
      if(req.url.startsWith('/api/site/')){
        // Client website reading: same-origin only; the server fetches public addresses and refuses internal networks.
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
        if(req.url==='/api/site/read'&&req.method==='POST'){
          if(req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Formato inválido.'}));}
          let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;if(bytes<=4096)chunks.push(c);}if(bytes>4096){res.writeHead(413);return res.end(JSON.stringify({error:'Pedido muito grande.'}));}
          return res.end(JSON.stringify(await site.read(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}').url)));
        }
        const siteImage=req.url.match(/^\/api\/site\/image\/([a-f0-9-]{36})\/(\d{1,2})$/);
        if(siteImage&&req.method==='GET'){const file=await site.image(siteImage[1],siteImage[2]);res.setHeader('Content-Type',file.type);res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; sandbox");res.setHeader('Content-Disposition','attachment');return res.end(file.data);}
        res.writeHead(404);return res.end(JSON.stringify({error:'Recurso de leitura do site indisponível.'}));
      }
      if(req.url.startsWith('/api/instagram/')){
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
        if(req.url==='/api/instagram/availability'&&req.method==='GET')return res.end(JSON.stringify(instagram.availability()));
        if(req.url==='/api/instagram/feed'&&req.method==='POST'){
          if(req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Formato inválido.'}));}
          let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;if(bytes<=4096)chunks.push(c);}if(bytes>4096){res.writeHead(413);return res.end(JSON.stringify({error:'Pedido muito grande.'}));}
          return res.end(JSON.stringify(await instagram.list(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
        }
        const media=req.url.match(/^\/api\/instagram\/image\/([a-f0-9-]{36})\/([a-f0-9-]{36})$/);
        if(media&&req.method==='GET'){const file=await instagram.image(media[1],media[2]);res.setHeader('Content-Type',file.type);return res.end(file.data);}
        res.writeHead(404);return res.end(JSON.stringify({error:'Recurso do Instagram indisponível.'}));
      }
      if(req.url.startsWith('/api/ai/')){
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
        if(req.url==='/api/ai/availability'&&req.method==='GET')return res.end(JSON.stringify(ai.availability()));
        if(['/api/ai/briefing','/api/ai/identity'].includes(req.url)&&req.method==='POST'){
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Formato inválido.'}));}
          const limit=req.url==='/api/ai/identity'?6*1024*1024:512*1024,chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size<=limit)chunks.push(chunk);}
          if(size>limit){res.writeHead(413);return res.end(JSON.stringify({error:'Pedido muito grande para a IA.'}));}
          const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          return res.end(JSON.stringify(req.url==='/api/ai/identity'?await ai.analyzeIdentity(request):await ai.interpret(request)));
        }
        res.writeHead(404);return res.end(JSON.stringify({error:'Recurso de IA indisponível.'}));
      }
      const url = new URL(req.url, 'http://localhost');
      if(url.pathname.startsWith('/api/deliveries')){
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end('Origem inválida.');}
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(url.pathname==='/api/deliveries'&&req.method==='GET')return res.end(JSON.stringify(await deliveries.list(url.searchParams.get('project'))));
        if(url.pathname==='/api/deliveries'&&req.method==='POST'){
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Formato inválido.'}));}
          let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size<=82*1024*1024)chunks.push(c);}if(size>82*1024*1024){res.writeHead(413);return res.end(JSON.stringify({error:'Entrega muito grande.'}));}
          return res.end(JSON.stringify(await deliveries.save(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
        }
        const match=url.pathname.match(/^\/api\/deliveries\/([a-f0-9-]{36})\/download$/);if(match&&req.method==='GET'){const file=await deliveries.download(url.searchParams.get('project'),match[1]);res.setHeader('Content-Type',file.type);res.setHeader('Content-Disposition',`attachment; filename="${file.name}"`);return res.end(file.data);}
        res.writeHead(404);return res.end(JSON.stringify({error:'Entrega indisponível.'}));
      }
      if(url.pathname.startsWith('/api/backups')||url.pathname.startsWith('/api/library-backups')){
        const libraryRoute=url.pathname.startsWith('/api/library-backups'),route=libraryRoute?'/api/library-backups':'/api/backups',service=libraryRoute?libraries:backups;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
        if(url.pathname===route&&req.method==='GET')return res.end(JSON.stringify(await service.list()));
        if(url.pathname===route&&req.method==='POST'){
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Formato de backup inválido.'}));}
          const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes<=100*1024*1024)chunks.push(chunk);}if(bytes>100*1024*1024){res.writeHead(413);return res.end(JSON.stringify({error:'O backup excede 100 MB.'}));}
          return res.end(JSON.stringify(await service.save(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
        }
        const match=url.pathname.slice(route.length).match(/^\/([a-f0-9]{64})\/(\d{13}-[a-f0-9-]{36})$/);if(match&&req.method==='GET')return res.end(JSON.stringify(await service.load(match[1],match[2])));
        res.writeHead(404);return res.end(JSON.stringify({error:'Backup indisponível.'}));
      }
      if(url.pathname==='/api/reader/availability'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(await readerAvailability()));}
      if(url.pathname.startsWith('/api/reader/')){
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
        if(url.pathname==='/api/reader/start'&&req.method==='POST'){
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Formato inválido.'}));}
          const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes<=60*1024*1024)chunks.push(chunk);}
          if(bytes>60*1024*1024){res.writeHead(413);return res.end(JSON.stringify({error:'Envie os materiais em lotes menores.'}));}
          const job=await reader.start(JSON.parse(Buffer.concat(chunks).toString('utf8')));res.writeHead(202);return res.end(JSON.stringify(job));
        }
        const match=url.pathname.match(/^\/api\/reader\/(status|cancel)\/([a-f0-9-]{36})$/);if(match){if(match[1]==='status'&&req.method==='GET')return res.end(JSON.stringify(reader.status(match[2])));if(match[1]==='cancel'&&req.method==='POST')return res.end(JSON.stringify(reader.cancel(match[2])));}
        res.writeHead(404);return res.end(JSON.stringify({error:'Leitura indisponível.'}));
      }
      if(url.pathname==='/api/photoshop/availability'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(await photoshopAvailability()));}
      if(url.pathname==='/api/photoshop'&&req.method==='POST'){
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end(JSON.stringify({error:'Origem inválida.'}));}
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);return res.end(JSON.stringify({error:'Formato de entrega inválido.'}));}
        const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes<=120*1024*1024)chunks.push(chunk);}
        if(bytes>120*1024*1024){res.writeHead(413);return res.end(JSON.stringify({error:'A entrega excede 120 MB. Reduza a quantidade de cartelas ou de camadas.'}));}
        const job=await startPhotoshopJob(JSON.parse(Buffer.concat(chunks).toString('utf8')));res.writeHead(202);return res.end(JSON.stringify(job));
      }
      const nativeRoute=url.pathname.match(/^\/api\/photoshop\/(status|download)\/([a-f0-9-]+)$/);
      if(nativeRoute&&req.method==='GET'){
        const [,operation,id]=nativeRoute;
        if(operation==='status'){res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(await photoshopJobStatus(id)));}
        const state=await photoshopJobStatus(id);const zip=await photoshopJobDownload(id);res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',`attachment; filename="${safeName(state.name)}-psds.zip"`);return res.end(Buffer.from(await zip.arrayBuffer()));
      }
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      if(url.pathname==='/qr-reader.js') {res.setHeader('Content-Type',types['.js']);return res.end(req.method==='HEAD'?undefined:await readFile(qrReaderPath));}
      if (url.pathname === '/api/references') {
        const entries = await readdir(referenceRoot).catch(() => []);
        const files = entries.filter(n => /\.(png|jpe?g)$/i.test(n)).sort((a,b) => a.localeCompare(b, 'pt-BR', { numeric:true }));
        res.setHeader('Content-Type','application/json; charset=utf-8');
        return res.end(JSON.stringify(files.map(name => ({ name, url:'references/'+encodeURIComponent(name) }))));
      }
      const reference = url.pathname.startsWith('/references/');
      const base = reference ? referenceRoot : publicRoot;
      const relative = decodeURIComponent(reference ? url.pathname.slice('/references/'.length) : url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      const filename = path.resolve(base, relative);
      const inside = path.relative(base, filename);
      if (inside.startsWith('..') || path.isAbsolute(inside) || !types[path.extname(filename).toLowerCase()]) { res.writeHead(403); return res.end('Acesso negado'); }
      const data = await readFile(filename);
      res.setHeader('Content-Type',types[path.extname(filename).toLowerCase()]);
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (err) {if(req.url.startsWith('/api/capture/')){res.setHeader('Content-Type','application/json; charset=utf-8');res.writeHead([400,401,403,404,409,429,503].includes(err.status)?err.status:400);return res.end(JSON.stringify({error:err.status?err.message:'Não foi possível processar as capturas.'}));}if(req.url.startsWith('/api/site/')){res.setHeader('Content-Type','application/json; charset=utf-8');res.writeHead([400,403,404,413,415,502].includes(err.status)?err.status:400);return res.end(JSON.stringify({error:err.status?err.message:'Não foi possível ler o site.'}));}if(req.url.startsWith('/api/instagram/')){res.setHeader('Content-Type','application/json; charset=utf-8');res.writeHead([400,404,429,502,503].includes(err.status)?err.status:400);return res.end(JSON.stringify({error:err.status?err.message:'Não foi possível processar a consulta do Instagram.'}));}if(req.url.startsWith('/api/deliveries')||req.url.startsWith('/api/photoshop')||req.url.startsWith('/api/reader/')||req.url.startsWith('/api/backups')||req.url.startsWith('/api/library-backups')||req.url.startsWith('/api/ai/')){res.setHeader('Content-Type','application/json; charset=utf-8');res.writeHead(err.code==='ENOENT'?404:400);return res.end(JSON.stringify({error:err.message}));}res.writeHead(err.code === 'ENOENT' ? 404 : 400); res.end('Arquivo indisponível'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadAiSettings();
  await loadInstagramSettings();
  const port = Number(process.env.CARTELAS_PORT || 3210);
  const url=`http://127.0.0.1:${port}`;
  const open=()=>{if(process.argv.includes('--open')&&process.platform==='win32'){const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>console.log('Abra o sistema em '+url));child.unref();}};
  const server = createServer();
  server.on('error', async err => {if(err.code==='EADDRINUSE'){try{const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(3000)}),health=await response.json();if(health.app==='assistente-de-cartelas'&&health.ready){console.log('O sistema já está aberto: '+url);open();return;}}catch{}}console.error('Não foi possível iniciar:',err.code==='EADDRINUSE'?'A porta está ocupada por outro aplicativo.':err.message);process.exitCode=1;});
  server.listen(port, '127.0.0.1', () => {console.log('Assistente de cartelas: '+url);open();});
}
