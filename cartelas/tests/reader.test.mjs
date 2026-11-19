import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readdir,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';
import {validateReaderRequest,createReaderService} from '../reader.mjs';import {createServer} from '../server.mjs';
const request=()=>({files:[{id:'print',name:'pedido.png',data:Buffer.from('fixture').toString('base64')}]});
test('leitura limita materiais e não aceita caminhos ou formatos executáveis',()=>{
  assert.equal(validateReaderRequest(request())[0].kind,'image');assert.throws(()=>validateReaderRequest({files:[{id:'bad',name:'script.exe',data:'AAAA'}]}));assert.throws(()=>validateReaderRequest({files:Array.from({length:11},()=>request().files[0])}));assert.throws(()=>validateReaderRequest({files:[{...request().files[0],data:'base64 inválido'}]}));
});
test('fila de leitura retorna texto e limpa arquivos temporários depois do processamento',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'cartelas-reader-'));const service=createReaderService({directory:dir,availability:async()=>({ready:true}),processor:async()=>({text:'Texto reconhecido',warnings:[]})});
  try{const job=await service.start(request());for(let i=0;i<100&&service.status(job.id).state!=='complete';i++)await new Promise(r=>setTimeout(r,10));const state=service.status(job.id);assert.equal(state.sources[0].text,'Texto reconhecido');for(let i=0;i<50&&(await readdir(dir)).length;i++)await new Promise(r=>setTimeout(r,10));assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}
});
test('cancelamento de leitura não publica um resultado parcial do arquivo em processamento',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'cartelas-reader-'));let started;
  const reached=new Promise(r=>started=r),service=createReaderService({directory:dir,availability:async()=>({ready:true}),processor:async(_,signal)=>{started();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw new Error('cancelado');}});
  try{const job=await service.start(request());await reached;service.cancel(job.id);assert.equal(service.status(job.id).state,'cancelled');assert.deepEqual(service.status(job.id).sources,[]);await new Promise(r=>setTimeout(r,30));}finally{await rm(dir,{recursive:true,force:true});}
});
test('API recusa origem externa antes de iniciar leitura',async()=>{
  let called=false;const server=createServer({reader:{start:async()=>{called=true;}}});server.listen(0,'127.0.0.1');await once(server,'listening');
  try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/reader/start`,{method:'POST',headers:{Origin:'https://externo.example','Content-Type':'application/json'},body:JSON.stringify(request())});assert.equal(r.status,403);assert.equal(called,false);}finally{server.close();}
});
