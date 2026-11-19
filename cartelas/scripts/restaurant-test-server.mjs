// Isolated, loopback-only full workflow test. Never loads user projects.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server.mjs';
import {createBackupService} from '../backups.mjs';
import {createLibraryBackupService} from '../library-backups.mjs';
import {createReaderService} from '../reader.mjs';
import {photoshopJobStatus} from '../photoshop.mjs';
const out=path.resolve('test-results/restaurant-workflow'),materials=path.resolve('Exemplos/Restaurante-Mangai-Teste');
await mkdir(out,{recursive:true});
const helper=`import {readProject} from '/storage.js';import {sheetBlob,nativePhotoshopPayload} from '/export.js';import {drawCard,makeCanvas,textIssues} from '/render.js';
const bar=document.createElement('aside');bar.style='position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:8px;background:#173d30;color:white;display:flex;gap:10px;align-items:center';bar.innerHTML='<b>TESTE ISOLADO · Mangai (pedido simulado)</b><button id="test-sources">Carregar 2 prints + áudio</button><button id="test-materials">Carregar logo + 2 fotos</button><button id="test-evidence">Guardar evidência</button><span id="test-result" role="status"></span>';document.body.append(bar);document.body.style.paddingBottom='64px';
const result=document.getElementById('test-result');
const reopen=document.createElement('button');reopen.id='test-reopen';reopen.textContent='Reabrir cópia de teste';bar.insertBefore(reopen,result);reopen.onclick=async()=>{try{await files('restore-file',['Restaurante-Mangai.cartelas.json']);result.textContent='Cópia enviada ao importador do sistema.';}catch(e){result.textContent=e.message;}};
async function files(id,names){const dt=new DataTransfer();for(const n of names){const r=await fetch('/test-material/'+n);if(!r.ok)throw Error('Material ausente: '+n);const b=await r.blob();dt.items.add(new File([b],n,{type:b.type}));}const input=document.getElementById(id);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
document.getElementById('test-sources').onclick=async()=>{try{await files('intake-file',['print-1-pedido.png','print-2-contatos.png','audio-pedido-simulado.wav']);result.textContent='Três arquivos carregados. Use Ler arquivos.';}catch(e){result.textContent=e.message;}};
document.getElementById('test-materials').onclick=async()=>{try{await files('logo-file',['logo-ilustrativo.png']);await files('photo-file',['foto-1.png','foto-2.png']);result.textContent='Logo e duas fotos enviados pelos importadores do sistema.';}catch(e){result.textContent=e.message;}};
let sequence=Date.now();const evidence=async(name,body)=>{const r=await fetch('/test-evidence/'+name,{method:'POST',body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());};
document.getElementById('test-evidence').onclick=async()=>{try{const p=await readProject();if(!p)throw Error('Nenhum trabalho.');sequence++;await evidence('checkpoint-'+sequence+'.json',p);await evidence('Restaurante-Mangai.cartelas.json',p);const fields={};for(const key of ['clientName','subtitle','services','cta','phone','profile','proposal'])fields[key]=document.getElementById('intake-'+key)?.value;await evidence('fields-'+sequence+'.json',fields);if(p.cards.length){await evidence('payload.json',await nativePhotoshopPayload(p));await evidence('approval.png',{image:await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);sheetBlob(p,'vertical').then(b=>fr.readAsDataURL(b));})});const issues=[];for(let i=0;i<p.cards.length;i++){issues.push(...textIssues(p.cards[i]).map(issue=>({card:i+1,issue})));const c=makeCanvas();await drawCard(p.cards[i],p.assets,c,null,false);await evidence('card-'+(i+1)+'.png',{image:c.toDataURL()});}await evidence('layout-check.json',{cards:p.cards.length,issues,qrRequested:p.cards.some(c=>c.requirements?.qr),assets:Object.values(p.assets).map(a=>({kind:a.kind,name:a.name}))});}result.textContent='Evidência '+sequence+' salva.';}catch(e){result.textContent='ERRO: '+e.message;}};`;
const server=createServer({reader:createReaderService({directory:path.join(out,'reader-temp')}),backups:createBackupService({directory:path.join(out,'backups')}),libraries:createLibraryBackupService(path.join(out,'libraries'))});
const handle=server.listeners('request')[0];server.removeAllListeners('request');
const allow=['print-1-pedido.png','print-2-contatos.png','audio-pedido-simulado.wav','logo-ilustrativo.png','foto-1.png','foto-2.png','Restaurante-Mangai.cartelas.json'];
server.on('request',async(req,res)=>{try{
 if(!/^127\.0\.0\.1:3233$/.test(req.headers.host||'')){res.statusCode=403;return res.end();}
 if(req.url==='/test-helper.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(helper);}
 if(req.url==='/'){let html=await readFile('public/index.html','utf8');html=html.replace('</body>','<script type="module" src="/test-helper.js"></script></body>');res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(req.url.startsWith('/test-material/')){const name=decodeURIComponent(req.url.slice(15));if(!allow.includes(name)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',name.endsWith('.json')?'application/json':name.endsWith('.wav')?'audio/wav':'image/png');return res.end(await readFile(path.join(materials,name)));}
 if(req.method==='POST'&&/^\/test-evidence\/(?:checkpoint-\d+\.json|fields-\d+\.json|Restaurante-Mangai.cartelas.json|payload.json|layout-check.json|approval.png|card-[123].png)$/.test(req.url)){if(req.headers.origin!=='http://127.0.0.1:3233'){res.statusCode=403;return res.end();}let body='';for await(const chunk of req){body+=chunk;if(body.length>140e6)throw Error('Limite de evidência.');}const file=req.url.split('/').at(-1);await writeFile(path.join(out,file),file.endsWith('.png')?Buffer.from(JSON.parse(body).image.split(',')[1],'base64'):body);return res.end('OK');}
 if(/^\/api\/photoshop\/status\/[a-f0-9-]+$/.test(req.url)){const status=await photoshopJobStatus(req.url.split('/').at(-1));await writeFile(path.join(out,'native-status.json'),JSON.stringify(status,null,2));}
 return handle(req,res);
}catch(e){res.statusCode=400;res.end(e.message);}});
server.listen(3233,'127.0.0.1',()=>console.log('Restaurante isolado: http://127.0.0.1:3233/'));
