// Offline integration harness: real connector, simulated Meta responses, isolated local libraries.
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';
import {createServer} from '../server.mjs';
import {createInstagramService} from '../instagram.mjs';
import {createBackupService} from '../backups.mjs';
import {createLibraryBackupService} from '../library-backups.mjs';
const directory=path.resolve('test-results/instagram-review');await mkdir(directory,{recursive:true});
const source=PNG.sync.read(await readFile('C:/Users/TM-Mídia/Pictures/Screenshots/Captura de tela 2026-10-23 073713.png'));
const images=[1,3,4].map(index=>{const left=Math.floor(index%3*source.width/3),top=Math.floor(Math.floor(index/3)*source.height/2),right=Math.floor((index%3+1)*source.width/3),bottom=Math.floor((Math.floor(index/3)+1)*source.height/2),out=new PNG({width:right-left,height:bottom-top});PNG.bitblt(source,out,left,top,out.width,out.height,0,0);return PNG.sync.write(out);});
const service=createInstagramService({env:{CARTELAS_INSTAGRAM_ENABLED:'1',META_IG_ACCESS_TOKEN:'OFFLINE_TEST_ONLY',META_IG_USER_ID:'17841400000000000',META_GRAPH_API_VERSION:'v99.0'},fetchImpl:async url=>{
  const u=new URL(url);if(u.hostname==='graph.facebook.com'){
    if(u.searchParams.get('fields').includes('perfil_inexistente'))return new Response(JSON.stringify({error:{code:100}}),{status:400});
    const account={username:'feed_simulado_ic',media:{data:[...images.map((_,i)=>({id:String(10000+i),caption:'SIMULAÇÃO LOCAL · Referência recortada de um print fornecido, não obtida da Meta.',media_type:i===2?'CAROUSEL_ALBUM':'IMAGE',media_url:`https://qa.cdninstagram.com/post${i}.png`,permalink:`https://www.instagram.com/p/TESTE${i}/` })),{id:'10009',caption:'SIMULAÇÃO · Vídeo sem capa disponível.',media_type:'VIDEO'}]}};
    return new Response(JSON.stringify(u.searchParams.get('fields').startsWith('business_discovery')?{business_discovery:account}:account));
  }
  const match=u.pathname.match(/^\/post([0-2])\.png$/);if(u.hostname!=='qa.cdninstagram.com'||!match)throw Error('Destino não permitido no teste offline.');return new Response(images[+match[1]],{headers:{'Content-Type':'image/png'}});
}});
const instagram={...service,availability:()=>({...service.availability(),message:'SIMULAÇÃO LOCAL — sem conexão real com a Meta. Imagens de teste extraídas do print fornecido.'}),list:async input=>{const result=await service.list(input);return {...result,message:'SIMULAÇÃO LOCAL. '+result.message};}};
const server=createServer({instagram,backups:createBackupService({directory:path.join(directory,'backups')}),libraries:createLibraryBackupService(path.join(directory,'libraries'))});const handler=server.listeners('request')[0];server.removeAllListeners('request');server.on('request',async(req,res)=>{if(req.url==='/'){const html=await readFile('public/index.html','utf8');res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('<main','<aside style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#30274e;color:#fff;padding:8px">TESTE ISOLADO · API da Meta simulada localmente · nenhuma conexão externa</aside><main'));}return handler(req,res);});server.listen(3238,'127.0.0.1',()=>console.log('Instagram offline review: http://127.0.0.1:3238/'));
