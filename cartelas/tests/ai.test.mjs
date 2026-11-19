import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiService,validateAiProposal} from '../ai.mjs';
import {createServer} from '../server.mjs';
const source={id:'msg1',kind:'text',name:'Pedido',text:'Cliente: Clínica Aurora\nServiços: Preenchimento Facial\nTelefone: (00) 90000-0000\nSem QR Code.',warnings:[]};
const proposal=()=>({fields:{clientName:'Clínica Aurora',subtitle:'',services:'Preenchimento Facial',cta:'',phone:'(00) 90000-0000',profile:''},materials:{logo:false,photos:false,qr:false},evidence:[{field:'clientName',sourceId:'msg1',quote:'Cliente: Clínica Aurora'},{field:'services',sourceId:'msg1',quote:'Serviços: Preenchimento Facial'},{field:'phone',sourceId:'msg1',quote:'Telefone: (00) 90000-0000'}],warnings:[]});
const env={CARTELAS_AI_ENABLED:'1',OPENAI_API_KEY:'TEST_ONLY_FAKE_KEY',OPENAI_MODEL:'gpt-5.6-terra'};
const completed=value=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}),{status:200});
test('IA desativada não chama provedor; consentimento é obrigatório e status não revela chave',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return completed(proposal());};
 const off=createAiService({env:{},fetchImpl});await assert.rejects(off.interpret({sources:[source],consent:true}),/não configurada/);assert.equal(calls,0);
 const ai=createAiService({env,fetchImpl});assert.equal(JSON.stringify(ai.availability()).includes(env.OPENAI_API_KEY),false);await assert.rejects(ai.interpret({sources:[source]}),/Confirme/);assert.equal(calls,0);
 await assert.rejects(ai.interpret({sources:[{...source,text:'a'.repeat(40001)}],consent:true}),/40 mil/);assert.equal(calls,0);
});
test('integração usa schema estrito, não armazena resposta e envia só fontes textuais',async()=>{
 let sent;const ai=createAiService({env,fetchImpl:async(url,request)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(request.body);return completed(proposal());}});
 const result=await ai.interpret({consent:true,sources:[{...source,data:'NÃO ENVIAR IMAGEM'}]});assert.equal(result.fields.clientName,'Clínica Aurora');assert.equal(result.origins.phone[0].sourceId,source.id);assert.equal(result.fields.qr,false);
 assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.text.format.type,'json_schema');assert.equal(sent.input.includes('NÃO ENVIAR IMAGEM'),false);assert.equal(sent.input.includes(env.OPENAI_API_KEY),false);
});
test('retorno sem origem é esvaziado; trecho falso, contato inventado e QR sem pedido não passam',()=>{
 let value=proposal();value.fields.cta='Texto inventado';let result=validateAiProposal(value,[source]);assert.equal(result.fields.cta,'');
 value=proposal();value.evidence[0].quote='Outro nome';assert.throws(()=>validateAiProposal(value,[source]),/origem/);
 value=proposal();value.fields.phone='(88) 99999-9999';value.materials.qr=true;value.evidence.push({field:'qr',sourceId:'msg1',quote:'QR Code'});result=validateAiProposal(value,[source]);assert.equal(result.fields.phone,'');assert.equal(result.fields.qr,false);
});
test('recusa, resposta incompleta, erro de conta e timeout não produzem briefing',async()=>{
 for(const [response,pattern] of [[new Response(JSON.stringify({status:'incomplete'})),/não concluiu/],[new Response(JSON.stringify({status:'completed',output:[{content:[{type:'refusal'}]}]})),/não produziu/],[new Response('{}',{status:401}),/chave de API/],[new Response('{}',{status:429}),/limite/]]){
  const ai=createAiService({env,fetchImpl:async()=>response});await assert.rejects(ai.interpret({sources:[source],consent:true}),pattern);
 }
 const ai=createAiService({env,fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');}});await assert.rejects(ai.interpret({sources:[source],consent:true}),/demorou/);
});
test('API recusa origem externa e publica somente estado público',async()=>{
 let calls=0;const ai=createAiService({env,fetchImpl:async()=>{calls++;return completed(proposal());}}),server=createServer({ai});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const r=await fetch(base+'/api/ai/briefing',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({sources:[source],consent:true})});assert.equal(r.status,403);assert.equal(calls,0);const status=await(await fetch(base+'/api/ai/availability')).text();assert.equal(status.includes(env.OPENAI_API_KEY),false);assert.equal((await(await fetch(base+'/api/health')).json()).app,'assistente-de-cartelas');assert.equal((await fetch(base+'/.env')).status,403);}
 finally{await new Promise(r=>server.close(r));}
});
test('análise visual usa apenas imagens enviadas e valida cores, fonte e URL anotada',async()=>{
 let calls=0,sent;const ai=createAiService({env,fetchImpl:async(url,request)=>{calls++;sent=JSON.parse(request.body);return completed({palette:{primary:'#304636',accent:'#c8ab76',background:'#faf6ee'},font:'Georgia',summary:'Serifa e tons suaves observados.',warnings:[]});}});
 await assert.rejects(ai.analyzeIdentity({consent:true,images:['https://example.com/imagem.png']}),/imagens/);await assert.rejects(ai.analyzeIdentity({consent:true,images:['data:image/png;base64,AAAA'],profile:'http://127.0.0.1/privado'}),/Instagram/);assert.equal(calls,0);
 const result=await ai.analyzeIdentity({consent:true,images:['data:image/png;base64,AAAA'],profile:'https://www.instagram.com/cliente/'});assert.equal(result.font,'Georgia');assert.match(result.warnings.at(-1),/aproximação/);assert.equal(sent.input[0].content[1].type,'input_image');assert.equal(sent.store,false);assert.equal(calls,1);
});
