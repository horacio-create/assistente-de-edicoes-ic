import test from 'node:test';import assert from 'node:assert/strict';import {suggestBriefing,formatBriefing,validateIntakeDraft} from '../public/briefing.js';import {EXAMPLE} from '../public/core.js';
const source=(id,text,kind='text')=>({id,name:'Fonte '+id,kind,text,warnings:[]});
const first=source('1','Cliente: Clínica Aurora\nÁrea: Harmonização facial\nServiços:\n• Preenchimento Facial\n• Labial\n• Full Face Toxina Botulínica\nChamada: Realce sua beleza\nTelefone: (88) 99234-8066\n@perfil_antigo');
test('correções explícitas substituem contato e chamada e preservam origem/valor anterior',()=>{
  const p=suggestBriefing([first,source('2','Troque o telefone para (88) 99111-2222\nAltere o Instagram para @perfil_novo\nTroque a chamada para Sua beleza, seu cuidado')]);
  assert.equal(p.fields.phone,'(88) 99111-2222');assert.equal(p.fields.profile,'@perfil_novo');assert.equal(p.fields.cta,'Sua beleza, seu cuidado');assert.equal(p.corrections.length,3);assert.equal(p.origins.phone[0].sourceId,'2');assert.ok(p.corrections[0].before.includes('99234'));assert.ok(formatBriefing(p.fields).includes('@perfil_novo'));
});
test('serviços são alterados somente por correspondência exata; itens compostos permanecem intactos',()=>{
  const p=suggestBriefing([first,source('2','Retire o serviço Labial\nInclua o serviço Bioestimuladores\nSubstitua o serviço Preenchimento Facial por Preenchimento Labial\nRetire Full Face')]);
  assert.equal(p.fields.services,'Preenchimento Labial\nFull Face Toxina Botulínica\nBioestimuladores');assert.equal(p.corrections.at(-1).status,'pending');assert.ok(p.warnings.some(w=>w.includes('Correção pendente')));
  assert.deepEqual(p.origins.services.map(o=>o.sourceId),['1','2']);
});
test('ordem das fontes decide correções sucessivas e pedidos sem alvo permanecem pendentes',()=>{
  const a=source('2','Troque o telefone para (88) 99111-2222'),b=source('3','Troque o telefone para (88) 99333-4444\nRetire esse serviço\nTroque a chamada para Outra frase?');
  assert.equal(suggestBriefing([first,a,b]).fields.phone,'(88) 99333-4444');assert.equal(suggestBriefing([first,b,a]).fields.phone,'(88) 99111-2222');const p=suggestBriefing([first,b]);assert.equal(p.fields.services,first.text.match(/Serviços:\n([\s\S]*?)\nChamada/)[1].replace(/• /g,''));assert.equal(p.fields.cta,'Realce sua beleza');
});
test('áudio transcrito aceita instruções delimitadas, sem inferir pedidos condicionais',()=>{
  const p=suggestBriefing([first,source('audio','Corrigindo: troque o telefone para (88) 99111-2222. Retire Labial.','audio')]);assert.equal(p.fields.phone,'(88) 99111-2222');assert.ok(!p.fields.services.includes('Labial'));
  assert.equal(suggestBriefing([first,source('2','Talvez retire Labial')]).fields.services.includes('Labial'),true);
});
test('roteiro anterior com correções não é proposto sem atualização; instruções não viram serviços',()=>{
  const p=suggestBriefing([source('1',EXAMPLE),source('2','Troque o telefone para (88) 99111-2222')]);assert.equal(p.script,'');assert.ok(p.warnings.some(w=>w.includes('correções posteriores')));
  const plain=suggestBriefing([source('1','Cliente: Aurora\nServiços:\nLabial\nRetire Labial\nInclua Bioestimuladores')]);assert.equal(plain.fields.services,'Bioestimuladores');
});
test('evidências sobrevivem à revisão e versões antigas continuam válidas',()=>{
  const p=suggestBriefing([first,source('2','Retire Labial')]),draft={...p,stale:false,manualFields:['cta']};validateIntakeDraft(draft);assert.deepEqual(JSON.parse(JSON.stringify(draft)).corrections,p.corrections);
  validateIntakeDraft({fields:p.fields,script:'',warnings:[]});assert.throws(()=>validateIntakeDraft({...draft,stale:'não'}));assert.throws(()=>validateIntakeDraft({...draft,corrections:[{...p.corrections[0],excerpt:'a'.repeat(1001)}]}));
});
