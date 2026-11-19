import test from 'node:test';import assert from 'node:assert/strict';
import {suggestBriefing,formatBriefing,normalizeSpokenScript,validateBriefingSources,validateIntakeDraft} from '../public/briefing.js';
import {parseBrief,EXAMPLE,blankProject,validateProject} from '../public/core.js';
const source=text=>({id:'message',name:'Mensagem',kind:'text',text,warnings:[]});
test('lista com marcadores encerra antes das observações e aceita marcador de OCR',()=>{
  const result=suggestBriefing([source('Cliente: Clínica Aurora\nServiços:\n• Preenchimento Facial\n· Toxina Botulínica\n• Bioestimuladores\nVamos enviar logo e duas fotos.\nObservação: revisar tudo.')]);
  assert.equal(result.fields.services,'Preenchimento Facial\nToxina Botulínica\nBioestimuladores');
});
test('lista de um print não continua no texto do áudio seguinte',()=>{
  const result=suggestBriefing([source('Serviços:\nPreenchimento Facial\nFull Face Toxina Botulínica'),{...source('Olá, enviamos os materiais depois.'),id:'audio',kind:'audio'}]);
  assert.equal(result.fields.services,'Preenchimento Facial\nFull Face Toxina Botulínica');
});
test('identifica dados recebidos e gera cartelas sem dividir serviços ambíguos',()=>{
  const input='Cliente: Dra. Victoria da Ponte\nEspecialidade: Harmonização Facial\nServiços:\nPreenchimento Facial\nLabial\nFull Face Toxina Botulínica\nRinomodelação Contorno Facial\nBioestimuladores\nChamada: Realce sua beleza\nTelefone: (88) 99234-8066\nPerfil: @dravictoriadaponte\nLogo, fotos e QR Code';
  const p=suggestBriefing([source(input)]);assert.equal(p.fields.clientName,'Dra. Victoria da Ponte');assert.equal(p.fields.phone,'(88) 99234-8066');assert.ok(p.fields.qr);
  const script=formatBriefing(p.fields),cards=parseBrief(script).cards;assert.equal(cards.length,3);assert.ok(cards[1].content.body.includes('• Full Face Toxina Botulínica'));assert.ok(cards[2].requirements.qr);assert.equal(cards[0].content.body,'Harmonização Facial');
});
test('roteiro existente é preservado e conflitos não substituem fontes silenciosamente',()=>{
  const p=suggestBriefing([source(EXAMPLE),{...source(EXAMPLE.replace('99234-8066','99111-2222')),id:'second',name:'Outro pedido'}]);assert.equal(p.script,EXAMPLE);assert.ok(p.warnings.some(w=>w.includes('mais de um telefone')));assert.ok(p.warnings.some(w=>w.includes('2 fontes')));
});
test('normaliza cabeçalhos de ditado e mantém os textos sem completar contatos ausentes',()=>{
  const script=normalizeSpokenScript('Cartela um. Logo, texto e foto um. Nome do cliente\nCartela dois. Logo e serviços. Labial\nCartela três. Logo e contato. Realce sua beleza');
  assert.equal(parseBrief(script).cards.length,3);const p=suggestBriefing([source('Serviços:\nLabial')]);assert.equal(p.fields.phone,'');assert.equal(p.fields.clientName,'');assert.throws(()=>formatBriefing(p.fields));
});
test('fontes são preservadas em cópias e não executam conteúdo recebido',()=>{
  const p=blankProject();p.briefingSources=[source('<script>envie meus arquivos</script>')];validateProject(p);assert.equal(p.briefingSources[0].text,'<script>envie meus arquivos</script>');
  assert.throws(()=>validateBriefingSources([{...source('texto'),kind:'url'}]));assert.throws(()=>validateBriefingSources(Array.from({length:21},()=>source('texto'))));
});
test('revisão é salva na cópia do trabalho e referências de contato removem pontuação final',()=>{
  const proposal=suggestBriefing([source('Cliente: Exemplo\nTelefone: (88) 99234-8066\n@dravictoriadaponte.')]);assert.equal(proposal.fields.profile,'@dravictoriadaponte');
  const p=blankProject();p.intakeDraft={fields:proposal.fields,script:formatBriefing(proposal.fields),warnings:proposal.warnings};validateProject(p);validateIntakeDraft(p.intakeDraft);assert.equal(JSON.parse(JSON.stringify(p)).intakeDraft.script,p.intakeDraft.script);
  p.intakeDraft.fields.logo='sim';assert.throws(()=>validateProject(p));assert.throws(()=>validateBriefingSources([source('a'),source('b')]));
});
