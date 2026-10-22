import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {getInstalledBrowsers} from '@puppeteer/browsers';
// Uma página e um navegador para todas as cartelas solicitadas; nenhuma conexão externa.
const tarefa=JSON.parse(readFileSync(process.argv[2],'utf8'));
const instalados=await getInstalledBrowsers({cacheDir:join(homedir(),'.cache/hyperframes/chrome')});
const candidatos=[process.env.OFERTAS_CHROME,process.env.CHROME_BIN,...instalados.map(b=>b.executablePath),
  'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'];
const executablePath=candidatos.find(p=>p&&existsSync(p));
if(!executablePath)throw Error('Navegador de renderização não encontrado. Configure OFERTAS_CHROME.');
// O contêiner usa a mesma configuração de sandbox do motor HyperFrames existente.
const semSandbox=process.env.OFERTAS_CHROME_NO_SANDBOX ?? (process.platform==='linux'&&existsSync('/.dockerenv')?'1':'0');
const browser=await puppeteer.launch({executablePath,headless:true,args:['--disable-dev-shm-usage',...(semSandbox==='1'?['--no-sandbox']:[])]});
try{
  const page=await browser.newPage();await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  const entrada=pathToFileURL(join(tarefa.template,'index.html')).href;
  const vars={...tarefa.variaveis};for(const [key,val] of Object.entries(vars))if(typeof val==='string'&&tarefa.copias[val])vars[key]=pathToFileURL(tarefa.copias[val]).href;
  const gsap=pathToFileURL(fileURLToPath(new URL('./node_modules/gsap/dist/gsap.min.js',import.meta.url))).href;
  let html=readFileSync(join(tarefa.template,'index.html'),'utf8').replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[\d.]+\/dist\/gsap\.min\.js/g,gsap);
  const injecao=`<script>window.__timelines={};window.__hyperframes={getVariables:()=>(${JSON.stringify(vars).replace(/</g,'\\u003c')})};</script>`;
  html=html.replace(/<head[^>]*>/,m=>m+injecao);
  await page.setRequestInterception(true);page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())return r.respond({status:200,contentType:'text/html',body:html});if(/^(file:|data:)/.test(r.url()))r.continue();else r.abort();});
  await page.goto(entrada+'?editar=1',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>!!window.__timelines?.main,{timeout:25000});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
  for(const item of tarefa.itens){
    await page.evaluate(numero=>{
      window.__timelines.main.pause(0);
      document.querySelectorAll('.painel').forEach((p,i)=>{p.style.setProperty('display',i===numero?'flex':'none','important');p.style.setProperty('visibility',i===numero?'visible':'hidden','important');p.style.opacity='1';});
    },item.numero);
    // Captura em HD e reduz a JPEG leve, preservando a composição exata.
    const png=await page.screenshot({type:'png'});
    const sharp=(await import('sharp')).default;
    mkdirSync(resolve(item.destino,'..'),{recursive:true});
    await sharp(png).resize(480,270).jpeg({quality:78}).toFile(item.destino+'.tmp');
    const {renameSync}=await import('node:fs');renameSync(item.destino+'.tmp',item.destino);
  }
}finally{await browser.close();}
