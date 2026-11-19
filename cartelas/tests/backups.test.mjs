import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import path from 'node:path';
import {createBackupService} from '../backups.mjs';import {blankProject,parseBrief,composeCard} from '../public/core.js';import {createServer} from '../server.mjs';
const testRoot=path.resolve('test-results');
async function fixture(t){await mkdir(testRoot,{recursive:true});const directory=await mkdtemp(path.join(testRoot,'backups-unit-'));t.after(async()=>{assert.equal(path.dirname(directory),testRoot);assert.ok(path.basename(directory).startsWith('backups-unit-'));await rm(directory,{recursive:true,force:true});});return {directory,service:createBackupService({directory,keep:3})};}
function work(){const p=blankProject();p.name='Trabalho de teste';p.cards=parseBrief('Cartela 1 - texto\nTítulo original').cards.map(c=>composeCard(c,p.theme,p.palette));return p;}
test('backup preserva projeto completo, não duplica apenas por horário e retém versões recentes',async t=>{
  const {service}=await fixture(t),p=work();p.assets.test={name:'Foto',kind:'photo',width:1,height:1,data:'data:image/png;base64,AAAA'};
  const first=await service.save(p);assert.deepEqual(await service.load(first.key,first.version),p);p.updatedAt=new Date(Date.now()+1000).toISOString();assert.equal((await service.save(p)).unchanged,true);assert.equal((await service.list()).length,1);
  for(let i=0;i<4;i++){p.name='Versão '+i;await service.save(p);}const versions=await service.list();assert.equal(versions.length,3);assert.deepEqual(new Set(versions.map(v=>v.name)),new Set(['Versão 1','Versão 2','Versão 3']));
});
test('cópia alterada é recusada, versões anteriores sobrevivem e caminhos externos não são aceitos',async t=>{
  const {directory,service}=await fixture(t),p=work(),old=await service.save(p);p.name='Novo';const latest=await service.save(p),filename=path.join(directory,latest.key,latest.version+'.cartelas.json');const copy=JSON.parse(await readFile(filename,'utf8'));copy.name='Alterado fora do sistema';await writeFile(filename,JSON.stringify(copy));
  await assert.rejects(service.load(latest.key,latest.version),/alterada/);assert.equal((await service.load(old.key,old.version)).name,'Trabalho de teste');await assert.rejects(service.load('../fora',latest.version));await assert.rejects(service.load(old.key,'../../fora'));await assert.rejects(service.save({...p,palette:{}}));
  await writeFile(path.join(directory,old.key,old.version+'.meta.json'),'');await assert.rejects(service.load(old.key,old.version),/integridade/);
});
test('gravações simultâneas idênticas geram uma única cópia completa',async t=>{const {service}=await fixture(t),p=work();await Promise.all(Array.from({length:8},()=>service.save(p)));const copies=await service.list();assert.equal(copies.length,1);assert.deepEqual(await service.load(copies[0].key,copies[0].version),p);});
test('API de backup recusa origem externa e permite recuperar dados em outro navegador',async t=>{
  const {service}=await fixture(t),server=createServer({backups:service});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port,p=work();
  let response=await fetch(base+'/api/backups',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://fora.example'},body:JSON.stringify(p)});assert.equal(response.status,403);
  response=await fetch(base+'/api/backups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});assert.equal(response.status,200);const saved=await response.json();assert.deepEqual(await(await fetch(base+'/api/backups/'+saved.key+'/'+saved.version)).json(),p);assert.equal((await(await fetch(base+'/api/backups')).json()).length,1);
  assert.equal((await fetch(base+'/api/backups/'+saved.key+'/'+saved.version,{headers:{Origin:'https://fora.example'}})).status,403);
});
