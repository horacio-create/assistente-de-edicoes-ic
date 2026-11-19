import {dataRoot} from './dados.mjs';
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {photoshopJobStatus,photoshopJobDownload} from './photoshop.mjs';
import {safeName} from './public/export.js';
const hash=b=>createHash('sha256').update(b).digest('hex'),uuid=/^[a-f0-9-]{36}$/;
const projectId=value=>{if(typeof value!=='string'||!value.length||value.length>100)throw Error('Trabalho inválido.');return value;};
export function createDeliveryService({directory=path.join(dataRoot,'Backups','entregas'),jobStatus=photoshopJobStatus,jobDownload=photoshopJobDownload}={}){
  const root=path.resolve(directory);let queue=Promise.resolve();
  const folder=id=>path.join(root,hash(projectId(id)));
  const filename=(project,id,suffix)=>{if(!uuid.test(id))throw Error('Entrega inválida.');return path.join(folder(project),id+suffix);};
  async function metadata(project,id){const m=JSON.parse(await readFile(filename(project,id,'.json'),'utf8'));if(m.version!==1||m.id!==id||m.projectId!==project||!['approval','png','psd'].includes(m.kind)||!Number.isInteger(m.sequence)||typeof m.name!=='string'||!Number.isFinite(Date.parse(m.createdAt)))throw Error('Registro de entrega inválido.');return m;}
  async function list(project){const names=await readdir(folder(project)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});const entries=[];for(const name of names){if(!name.endsWith('.json')||!uuid.test(name.slice(0,-5)))continue;try{const m=await metadata(project,name.slice(0,-5));let state='complete',message='';if(m.kind==='psd'){try{const job=await jobStatus(m.jobId);state=job.state;message=state==='error'?'O Photoshop não concluiu esta entrega.':'';}catch{state='missing';message='O arquivo desta entrega não está disponível.';}}else{try{const bytes=await readFile(filename(project,m.id,'.png'));if(hash(bytes)!==m.checksum)throw Error();}catch{state='missing';message='O arquivo está ausente ou foi alterado.';}}const {checksum,...publicData}=m;entries.push({...publicData,state,message});}catch{/* A broken record does not hide other deliveries. */}}return entries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.sequence-a.sequence);}
  async function saveNow(value){
    const project=projectId(value?.projectId);if(typeof value.name!=='string'||!value.name.length||value.name.length>300||!['approval','png','psd'].includes(value.kind)||!Number.isInteger(value.cardCount)||value.cardCount<1||value.cardCount>20)throw Error('Dados da entrega inválidos.');
    let bytes,job;if(value.kind==='psd'){if(!uuid.test(value.jobId||''))throw Error('PSD inválido.');job=await jobStatus(value.jobId);if(job.name!==value.name||job.count!==value.cardCount)throw Error('PSD não corresponde ao trabalho.');const existing=(await list(project)).find(e=>e.jobId===value.jobId);if(existing)return existing;}else{
      if(typeof value.data!=='string'||value.data.length>80*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.data))throw Error('Imagem de entrega inválida.');bytes=Buffer.from(value.data,'base64');if(bytes.toString('base64')!==value.data||bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw Error('Use uma imagem PNG válida.');const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(w<1||h<1||w>30000||h>30000||w*h>25000000)throw Error('Dimensões de entrega inválidas.');
    }
    const existing=await list(project),id=randomUUID(),m={version:1,id,projectId:project,name:value.name,kind:value.kind,sequence:Math.max(0,...existing.map(e=>e.sequence))+1,cardCount:value.cardCount,createdAt:new Date().toISOString(),projectUpdatedAt:typeof value.projectUpdatedAt==='string'&&Number.isFinite(Date.parse(value.projectUpdatedAt))?value.projectUpdatedAt:null,...(job?{jobId:value.jobId}:{checksum:hash(bytes),bytes:bytes.length})};
    await mkdir(folder(project),{recursive:true});if(bytes){await writeFile(filename(project,id,'.png.tmp'),bytes);await rename(filename(project,id,'.png.tmp'),filename(project,id,'.png'));}await writeFile(filename(project,id,'.json.tmp'),JSON.stringify(m));await rename(filename(project,id,'.json.tmp'),filename(project,id,'.json'));const {checksum,...publicData}=m;return {...publicData,state:job?.state||'complete'};
  }
  function save(value){const next=queue.catch(()=>{}).then(()=>saveNow(value));queue=next;return next;}
  async function download(project,id){const m=await metadata(project,id);if(m.kind==='psd'){const blob=await jobDownload(m.jobId);return {data:Buffer.from(await blob.arrayBuffer()),type:'application/zip',name:safeName(m.name)+'-entrega-'+m.sequence+'-psd.zip'};}const data=await readFile(filename(project,id,'.png'));if(hash(data)!==m.checksum)throw Error('A entrega foi alterada. Gere outra versão.');return {data,type:'image/png',name:safeName(m.name)+'-entrega-'+m.sequence+(m.kind==='approval'?'-aprovacao':'-cartela')+'.png'};}
  return {save,list,download};
}
export const deliveryService=createDeliveryService();
