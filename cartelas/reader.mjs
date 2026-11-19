import {spawn} from 'node:child_process';
import {mkdir,writeFile,rm,access} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),tempRoot=path.join(root,'.reader-tmp');
const python=path.join(root,'.local-reader',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const extensions={png:'image',jpg:'image',jpeg:'image',webp:'image',mp3:'audio',wav:'audio',ogg:'audio',opus:'audio',m4a:'audio',mp4:'audio',webm:'audio',flac:'audio'};
export function validateReaderRequest(value){
  if(!value||!Array.isArray(value.files)||!value.files.length||value.files.length>10)throw new Error('Envie de 1 a 10 arquivos por leitura.');
  let total=0;const ids=new Set();
  const files=value.files.map(f=>{
    if(!f||typeof f.id!=='string'||f.id.length>100||ids.has(f.id)||typeof f.name!=='string'||f.name.length>240||typeof f.data!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(f.data))throw new Error('Arquivo inválido.');
    ids.add(f.id);const ext=f.name.split('.').at(-1).toLowerCase(),kind=extensions[ext];if(!kind)throw new Error('Use imagens PNG/JPG/WebP ou áudios MP3/WAV/OGG/M4A/WEBM/FLAC.');
    const bytes=Buffer.from(f.data,'base64');if(bytes.toString('base64')!==f.data||!bytes.length||bytes.length>(kind==='image'?8:20)*1024*1024)throw new Error('Prints devem ter até 8 MB e áudios até 20 MB.');
    total+=bytes.length;if(total>40*1024*1024)throw new Error('A leitura excede 40 MB. Envie em lotes menores.');
    return {id:f.id,name:f.name,kind,ext,bytes};
  });return files;
}
export async function readerAvailability(){
  try{await access(python);await access(path.join(root,'.reader-models/ready.json'));return {ready:true,mode:'local',message:'Leitura local pronta · sem chave de API.'};}
  catch{return {ready:false,mode:'local',message:'Abra “Preparar leitura local.cmd” na pasta do projeto para instalar os modelos.'};}
}
function processFile(file,signal){
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[path.join(root,'scripts/reader_worker.py'),file.kind,file.filename],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',HF_HUB_OFFLINE:'1'},stdio:['ignore','pipe','pipe']});let output='',size=0;
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},10*60*1000);
    const abort=()=>child.kill();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)child.kill();
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)child.kill();else output+=chunk.toString('utf8');});child.stderr.resume();
    child.on('error',()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new Error('Não foi possível iniciar a leitura local. Prepare os modelos novamente.'));});
    child.on('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);if(signal.aborted)return reject(new Error('Leitura cancelada.'));if(timedOut)return reject(new Error('A leitura demorou demais. Envie arquivos menores.'));try{const result=JSON.parse(output.trim());if(code||result.error)throw new Error(result.error||'Arquivo não reconhecido.');resolve(result);}catch(err){reject(new Error(err.message.startsWith('Unexpected')?'Não foi possível ler este arquivo. Confira o formato.':err.message));}});
  });
}
export function createReaderService({processor=processFile,availability=readerAvailability,directory=tempRoot}={}){
  const jobs=new Map();let queue=Promise.resolve(),pending=0;
  const safeDir=id=>{const target=path.resolve(directory,id),relative=path.relative(path.resolve(directory),target);if(!/^[a-f0-9-]{36}$/.test(id)||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Diretório inválido.');return target;};
  function status(id){const job=jobs.get(id);if(!job)throw new Error('Leitura não encontrada. Envie os materiais novamente.');const {controller,...publicJob}=job;return structuredClone(publicJob);}
  async function start(value){
    const files=validateReaderRequest(value);if(!(await availability()).ready)throw new Error('A leitura local ainda não está preparada.');if(pending>=3)throw new Error('Já existem leituras em andamento. Aguarde a conclusão.');
    for(const [id,job] of jobs)if(Date.now()-job.createdAt>3600000&&['complete','cancelled','error'].includes(job.state))jobs.delete(id);
    const id=randomUUID(),controller=new AbortController(),job={id,state:'queued',createdAt:Date.now(),done:0,total:files.length,sources:[],message:'Aguardando leitura local…',controller};jobs.set(id,job);pending++;
    queue=queue.catch(()=>{}).then(async()=>{
      const dir=safeDir(id);
      try{
        if(controller.signal.aborted)return;await mkdir(dir,{recursive:true});job.state='running';
        for(let i=0;i<files.length;i++){
          if(controller.signal.aborted)break;const f=files[i],filename=path.join(dir,`${i}.${f.ext}`);await writeFile(filename,f.bytes);
          job.message=`${f.kind==='audio'?'Transcrevendo':'Lendo print'}: ${f.name}`;
          try{const result=await processor({...f,filename},controller.signal);if(!controller.signal.aborted)job.sources.push({id:f.id,name:f.name,kind:f.kind,text:result.text,segments:result.segments||[],warnings:result.warnings||[]});}
          catch(err){if(!controller.signal.aborted)job.sources.push({id:f.id,name:f.name,kind:f.kind,text:'',segments:[],warnings:[String(err.message).slice(0,1000)],error:true});}
          job.done=i+1;await rm(filename,{force:true});
        }
        if(!controller.signal.aborted){job.state='complete';job.message=job.sources.some(s=>s.error)?'Leitura concluída com avisos. Confira cada fonte.':'Leitura concluída. Revise o texto reconhecido.';}
      }catch{if(!controller.signal.aborted){job.state='error';job.message='Não foi possível preparar os arquivos para leitura.';}}
      finally{pending--;await rm(safeDir(id),{recursive:true,force:true}).catch(()=>{});}
    });
    return status(id);
  }
  function cancel(id){const job=jobs.get(id);if(!job)throw new Error('Leitura não encontrada.');if(['queued','running'].includes(job.state)){job.controller.abort();job.state='cancelled';job.message='Leitura cancelada.';}return status(id);}
  return {start,status,cancel};
}
export const readerService=createReaderService();
