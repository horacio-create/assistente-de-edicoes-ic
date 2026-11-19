import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {suggestBriefing,formatBriefing} from '../public/briefing.js';import {parseBrief} from '../public/core.js';
const source=text=>({id:'audio',name:'Áudio fictício',kind:'audio',text,warnings:[]});
test('transcrição real da Aurora propõe três cartelas sem prints e sem inventar contatos ou QR',async()=>{
  const text=await readFile(new URL('./fixtures/audio-aurora-transcript.txt',import.meta.url),'utf8'),p=suggestBriefing([source(text)]);
  assert.equal(p.fields.clientName,'clínica aurora');assert.equal(p.fields.subtitle,'harmonização facial');assert.equal(p.fields.cta,'sua beleza, seu cuidado');assert.equal(p.fields.services.toLowerCase(),'preenchimento facial\ntoxina botulínica\nbioestimuladores');assert.equal(p.fields.phone,'');assert.equal(p.fields.profile,'');assert.equal(p.fields.qr,false);assert.equal(parseBrief(formatBriefing(p.fields)).cards.length,3);assert.ok(p.warnings.some(w=>w.includes('QR Code não foi reconhecido')));
});
test('frases ausentes não são completadas; expressões compostas permanecem juntas',()=>{
  const p=suggestBriefing([source('Aqui é da Clínica Azul. Os serviços são: Full Face Toxina Botulínica, Rinomodelação e Contorno Facial. A frase final é: Cuide de você.')]);assert.equal(p.fields.services,'Full Face Toxina Botulínica\nRinomodelação e Contorno Facial');assert.ok(p.warnings.some(w=>w.includes('mantida junta')));assert.equal(p.fields.subtitle,'');assert.equal(p.fields.phone,'');
  const empty=suggestBriefing([source('Olá, quero um vídeo bonito. Obrigada.')]);assert.equal(empty.fields.clientName,'');assert.throws(()=>formatBriefing(empty.fields));
});
test('dados escritos têm prioridade e divergências no áudio geram avisos',()=>{
  const p=suggestBriefing([{...source('Cliente: Clínica Oficial\nChamada: Frase oficial\nServiços:\n• Serviço oficial'),id:'print',name:'Print',kind:'image'},source('Aqui é da Clínica Diferente. A frase final é: Outra frase. Os serviços são: Bioestimuladores.')]);assert.equal(p.fields.clientName,'Clínica Oficial');assert.equal(p.fields.services,'Serviço oficial');assert.equal(p.fields.cta,'Frase oficial');assert.ok(p.warnings.some(w=>w.includes('propostas diferentes')));
});
