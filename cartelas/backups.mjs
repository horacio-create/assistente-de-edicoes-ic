import {dataRoot} from './dados.mjs';
import {mkdir,readFile,readdir,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {validateProject} from './public/core.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const keyPattern=/^[a-f0-9]{64}$/,versionPattern=/^\d{13}-[a-f0-9-]{36}$/;
export function createBackupService({directory=path.join(dataRoot,'Backups','trabalhos'),keep=10,validate=validateProject,describe=p=>({name:p.name,cardCount:p.cards.length})}={}){
  const root=path.resolve(directory);let queue=Promise.resolve();
  if(!Number.isInteger(keep)||keep<1||keep>50)throw new Error('Limite de versões inválido.');
  function folder(key){if(!keyPattern.test(key))throw new Error('Trabalho de backup inválido.');const target=path.resolve(root,key);if(path.dirname(target)!==root)throw new Error('Pasta inválida.');return target;}
  function file(key,version,suffix='.cartelas.json'){if(!versionPattern.test(version))throw new Error('Versão de backup inválida.');return path.join(folder(key),version+suffix);}
  async function versions(key){const entries=await readdir(folder(key)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});return entries.filter(n=>n.endsWith('.cartelas.json')&&versionPattern.test(n.slice(0,-14))).map(n=>n.slice(0,-14)).sort().reverse();}
  async function metadata(key,version){
    try{const m=JSON.parse(await readFile(file(key,version,'.meta.json'),'utf8'));if(m.key===key&&m.version===version&&typeof m.name==='string'&&Number.isFinite(m.cardCount)&&Number.isFinite(Date.parse(m.savedAt)))return m;}catch{}
    const data=await readFile(file(key,version),'utf8'),p=validate(JSON.parse(data));return summary(key,version,p,data);
  }
  function summary(key,version,p,data){return {key,version,...describe(p),savedAt:new Date(Number(version.slice(0,13))).toISOString(),updatedAt:p.updatedAt,bytes:Buffer.byteLength(data),checksum:hash(data),contentHash:hash(JSON.stringify({...p,updatedAt:undefined}))};}
  async function list(){const folders=await readdir(root,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});const result=[];for(const entry of folders.filter(e=>e.isDirectory()&&keyPattern.test(e.name))){for(const version of await versions(entry.name)){try{const m=await metadata(entry.name,version);result.push(m);}catch{/* Damaged versions do not hide other recoverable copies. */}}}return result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));}
  async function load(key,version){const data=await readFile(file(key,version),'utf8');let m;try{m=JSON.parse(await readFile(file(key,version,'.meta.json'),'utf8'));}catch{throw new Error('A cópia não tem verificação de integridade disponível. Escolha outra versão.');}if(m.key!==key||m.version!==version||hash(data)!==m.checksum)throw new Error('A cópia em disco foi alterada ou está incompleta. Escolha outra versão.');return validate(JSON.parse(data));}
  async function saveNow(project){
    const p=validate(project),data=JSON.stringify(p);if(Buffer.byteLength(data)>100*1024*1024)throw new Error('A cópia excede 100 MB para backup.');
    const key=hash(p.id),existing=await versions(key),contentHash=hash(JSON.stringify({...p,updatedAt:undefined}));
    if(existing.length){try{const latest=await metadata(key,existing[0]);if(latest.contentHash===contentHash){await load(key,existing[0]);return {...latest,unchanged:true};}}catch{}}
    await mkdir(folder(key),{recursive:true});const version=Date.now()+'-'+randomUUID(),target=file(key,version),temporary=target+'.tmp';
    await writeFile(temporary,data,'utf8');await rename(temporary,target);const m=summary(key,version,p,data),meta=file(key,version,'.meta.json');await writeFile(meta+'.tmp',JSON.stringify(m),'utf8');await rename(meta+'.tmp',meta);
    // Only complete versions in this exact project's backup folder are rotated.
    for(const old of (await versions(key)).slice(keep)){await unlink(file(key,old));await unlink(file(key,old,'.meta.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});}
    return m;
  }
  function save(project){const copy=structuredClone(project),task=queue.catch(()=>{}).then(()=>saveNow(copy));queue=task;return task;}
  return {save,list,load};
}
export const backupService=createBackupService();
