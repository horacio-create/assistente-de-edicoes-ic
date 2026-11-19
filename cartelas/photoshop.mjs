import {dataRoot} from './dados.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {photoshopScript,zipFiles} from './public/export.js';
const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url)),exportsRoot=path.join(dataRoot,'.exports');
const fontNames=new Set(['ArialMT','Arial-BoldMT','Georgia','Georgia-Bold','Verdana','Verdana-Bold','TrebuchetMS','TrebuchetMS-Bold']);
let queue=Promise.resolve(),pending=0;
const liveStates=new Map();
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const pngPath=/^(camadas\/cartela-\d{2}\/\d{2,3}-[A-Za-z0-9_-]+|previas\/cartela-\d{2}|materiais\/foto-\d{2,3})\.png$/;
const jobPattern=/^[a-f0-9-]{36}$/;
function jobDirectory(id){if(!jobPattern.test(id))throw new Error('Entrega inválida.');return path.join(exportsRoot,id);}
function checkedOutput(id,output){if(typeof output!=='string')throw new Error('Pasta de entrega inválida.');const relative=path.relative(jobDirectory(id),output);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Pasta de entrega inválida.');return output;}
export function validatePhotoshopPayload(payload) {
  if(!payload||!payload.manifest||payload.manifest.version!==1||!Array.isArray(payload.manifest.cards)||payload.manifest.cards.length<1||payload.manifest.cards.length>20||!Array.isArray(payload.images)||payload.images.length>2020||typeof payload.name!=='string'||payload.name.length>300)throw new Error('Entrega inválida.');
  if(payload.manifest.delivery!==undefined&&payload.manifest.delivery!=='grouped')throw new Error('Formato de entrega inválido.');
  const customFonts=payload.manifest.customFonts||[];
  if(!Array.isArray(customFonts)||customFonts.length>16||customFonts.some(name=>typeof name!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)))throw new Error('Fontes personalizadas inválidas na entrega.');
  const allowedNames=new Set([...fontNames,...customFonts]);
  const images=new Map();
  for(const file of payload.images){
    if(!file||typeof file.name!=='string'||!pngPath.test(file.name)||images.has(file.name)||typeof file.data!=='string'||file.data.length>(file.name.startsWith('materiais/')?32:8)*1024*1024||!file.data.length||!/^[A-Za-z0-9+/=]+$/.test(file.data))throw new Error('Imagem inválida na entrega.');
    const bytes=Buffer.from(file.data,'base64');
    if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw new Error('As imagens da entrega devem ser PNG de 1280 × 720.');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if(file.name.startsWith('materiais/')?(!finite(width,1,4096)||!finite(height,1,4096)):(width!==1280||height!==720))throw new Error('Camadas devem ter 1280 × 720; fotos, até 4096 pixels por lado.');
    images.set(file.name,bytes);
  }
  const filenames=new Set();
  for(const card of payload.manifest.cards){
    if(!card||typeof card.name!=='string'||card.name.length>160||!/^cartela-\d{2}$/.test(card.filename)||filenames.has(card.filename)||!Array.isArray(card.layers)||!card.layers.length||card.layers.length>100)throw new Error('Cartela inválida na entrega.');filenames.add(card.filename);
    for(const layer of card.layers){
      if(!layer||typeof layer.name!=='string'||layer.name.length>200||typeof layer.locked!=='boolean')throw new Error('Camada inválida na entrega.');
      if(layer.type==='raster'){if(!images.has(layer.file)||!layer.file.startsWith('camadas/'+card.filename+'/'))throw new Error('Material de camada ausente.');}
      else if(layer.type==='photo'){
        const source=images.get(layer.file),im=layer.image,m=layer.mask;
        if(!source||!/^materiais\/foto-\d{2,3}\.png$/.test(layer.file))throw new Error('Material de foto ausente.');
        if(typeof layer.maskFile!=='string'||!images.has(layer.maskFile)||!layer.maskFile.startsWith('camadas/'+card.filename+'/'))throw new Error('Material de máscara ausente.');
        if(layer.sourceWidth!==source.readUInt32BE(16)||layer.sourceHeight!==source.readUInt32BE(20)||!finite(layer.opacity,0,1)||!im||!finite(im.x,-32768,32768)||!finite(im.y,-32768,32768)||!finite(im.w,1,32768)||!finite(im.h,1,32768)||!m||!finite(m.x,-1280,2560)||!finite(m.y,-720,1440)||!finite(m.w,1,2560)||!finite(m.h,1,1440)||!Array.isArray(m.corners)||m.corners.length!==4||m.corners.some(v=>!finite(v,0,Math.min(300,m.w/2,m.h/2))))throw new Error('Foto ou máscara inválida na entrega.');
      }
      else if(layer.type==='text'){
        if(!allowedNames.has(layer.psFont)||!Array.isArray(layer.lines)||layer.lines.length>500||layer.lines.some(s=>typeof s!=='string')||layer.lines.join('').length>20000||!finite(layer.size,8,180)||!finite(layer.leading,8,360)||!finite(layer.anchorX,-1280,3840)||!finite(layer.baseline,-720,2160)||!finite(layer.opacity,0,1)||!/^#[0-9a-f]{6}$/i.test(layer.fill)||!['left','center','right'].includes(layer.align))throw new Error('Texto inválido na entrega.');
      }else throw new Error('Tipo de camada inválido.');
    }
  }
  return images;
}
export async function photoshopAvailability(){
  if(process.platform!=='win32')return {available:false,message:'A integração local requer Windows e Photoshop aberto.'};
  try{const {stdout}=await execute('cscript.exe',['//nologo',path.join(root,'scripts','photoshop-probe.vbs')],{windowsHide:true,timeout:10000,maxBuffer:32768});return {available:true,version:stdout.trim().split(' | ')[0]};}
  catch{return {available:false,message:'Abra o Photoshop, feche eventuais caixas de diálogo e tente novamente.'};}
}
async function storeJob(id,state){liveStates.set(id,structuredClone(state));if(liveStates.size>200)liveStates.delete(liveStates.keys().next().value);await writeFile(path.join(jobDirectory(id),'status.json'),JSON.stringify(state),'utf8');}
export async function startPhotoshopJob(payload){
  const images=validatePhotoshopPayload(payload);payload={...payload,manifest:{...payload.manifest,delivery:'grouped'}};if(pending>=3)throw new Error('Há entregas em processamento. Aguarde a conclusão.');
  const id=randomUUID(),directory=jobDirectory(id),createdAt=new Date().toISOString();await mkdir(directory,{recursive:true});
  for(const [filename,bytes] of images){const target=path.join(directory,...filename.split('/'));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);}
  await writeFile(path.join(directory,'composicao.json'),JSON.stringify(payload.manifest),'utf8');
  await writeFile(path.join(directory,'montar-cartelas.jsx'),photoshopScript(payload.manifest,{interactive:false,renderPreviews:true}),'utf8');
  await storeJob(id,{id,state:'queued',name:payload.name,createdAt,count:payload.manifest.cards.length});pending++;
  queue=queue.catch(()=>{}).then(async()=>{
    try{
      await storeJob(id,{id,state:'running',name:payload.name,createdAt,count:payload.manifest.cards.length});
      await execute('cscript.exe',['//nologo',path.join(root,'scripts','photoshop-run.vbs'),path.join(directory,'montar-cartelas.jsx')],{windowsHide:true,timeout:300000,maxBuffer:65536});
      const report=(await readFile(path.join(directory,'resultado-photoshop.txt'),'utf8')).replace(/^\uFEFF/,'');
      if(!report.startsWith('OK|'))throw new Error(report.replace(/^ERROR\|/,''));
      const output=checkedOutput(id,report.split('|')[1]);
      await readFile(path.join(output,'cartelas.psd'));
      for(const card of payload.manifest.cards)await readFile(path.join(output,card.filename+'.png'));
      await storeJob(id,{id,state:'complete',name:payload.name,createdAt,count:payload.manifest.cards.length,output,finishedAt:new Date().toISOString()});
    }catch(error){const report=await readFile(path.join(directory,'resultado-photoshop.txt'),'utf8').catch(()=>'');const message=report.replace(/^\uFEFF?ERROR\|/,'').replace(/^ERROR\|/,'').trim()||'Não foi possível concluir a entrega. Confira se o Photoshop está aberto e disponível.';await storeJob(id,{id,state:'error',name:payload.name,createdAt,message,finishedAt:new Date().toISOString()});}
    finally{pending--;}
  });
  return {id,state:'queued'};
}
export async function photoshopJobStatus(id){
  const directory=jobDirectory(id);if(liveStates.has(id))return structuredClone(liveStates.get(id));
  for(let attempt=0;attempt<5;attempt++){try{let state=JSON.parse(await readFile(path.join(directory,'status.json'),'utf8'));
    if(['queued','running'].includes(state.state)){
      const report=(await readFile(path.join(directory,'resultado-photoshop.txt'),'utf8').catch(()=>'')).replace(/^\uFEFF/,'');
      if(report.startsWith('OK|')){const output=checkedOutput(id,report.split('|')[1]),manifest=JSON.parse(await readFile(path.join(directory,'composicao.json'),'utf8'));await readFile(path.join(output,'cartelas.psd'));for(const card of manifest.cards){if(!/^cartela-\d{2}$/.test(card.filename))throw Error('Nome de prévia inválido.');await readFile(path.join(output,card.filename+'.png'));}state={...state,state:'complete',output,finishedAt:new Date().toISOString()};await storeJob(id,state);}
      else if(report.startsWith('ERROR|')||Date.now()-Date.parse(state.createdAt)>360000){state={...state,state:'error',message:'Entrega interrompida. Gere uma nova versão pelo sistema.',finishedAt:new Date().toISOString()};await storeJob(id,state);}
    }
    return state;
  }catch(error){if(!(error instanceof SyntaxError)||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,25));}}
}
export async function photoshopJobDownload(id){
  const state=await photoshopJobStatus(id);if(state.state!=='complete')throw new Error('A entrega ainda não está pronta.');
  checkedOutput(id,state.output);
  const directory=jobDirectory(id);const manifest=JSON.parse(await readFile(path.join(directory,'composicao.json'),'utf8'));const files=[];
  if(manifest.delivery==='grouped')files.push({name:'cartelas.psd',data:await readFile(path.join(state.output,'cartelas.psd'))});
  for(const card of manifest.cards){if(!/^cartela-\d{2}$/.test(card.filename))throw new Error('Nome de arquivo inválido.');if(manifest.delivery!=='grouped')files.push({name:card.filename+'.psd',data:await readFile(path.join(state.output,card.filename+'.psd'))});files.push({name:'previas/'+card.filename+'.png',data:await readFile(path.join(state.output,card.filename+'.png'))});}
  files.push({name:'LEIA-ME.txt',data:'Entrega do Photoshop em RGB, 1280 × 720. Nas novas entregas, cartelas.psd contém um grupo por cartela. A primeira cartela fica visível; alterne a visibilidade dos grupos para trabalhar em cada cena.\nTextos são camadas nativas editáveis. Fotografias são objetos inteligentes incorporados com máscaras de camada independentes; fotos maiores que 4096 pixels são reduzidas para esse limite no arquivo incorporado. No Photoshop, clique na miniatura da foto para mover ou transformar o conteúdo; clique na miniatura da máscara para ajustar o recorte. Logo, formas, ícones e QR são camadas rasterizadas separadas.\nAs prévias desta pasta foram salvas pelo próprio Photoshop. Confira a entrega antes de usar na produção.\n'});
  return zipFiles(files);
}
