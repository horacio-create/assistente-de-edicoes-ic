import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createServer} from '../server.mjs';
test('iniciar novamente reconhece o servidor existente sem abrir outro processo persistente',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const result=await new Promise((resolve,reject)=>{let output='';const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,CARTELAS_PORT:String(server.address().port)},windowsHide:true,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(new Error('O segundo iniciador não encerrou.'));},10000);child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,output});});});assert.equal(result.code,0,result.output);assert.match(result.output,/já está aberto/);assert.equal((await(await fetch('http://127.0.0.1:'+server.address().port+'/api/health')).json()).ready,true);}
 finally{await new Promise(r=>server.close(r));}
});
