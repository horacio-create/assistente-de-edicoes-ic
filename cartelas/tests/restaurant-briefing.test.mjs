import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestBriefing,formatBriefing} from '../public/briefing.js';
const source=(text,id='message')=>({id,name:id,kind:'text',text,warnings:[]});
test('pedidos sem QR não viram reserva obrigatória ao mencionar a recusa',()=>{
  for(const instruction of ['Não precisamos de QR Code neste trabalho.','Não queremos código QR.','Sem QR Code.','Não incluir QR Code.','QR Code não é necessário.','Não vamos usar QR neste VT.']){
    const result=suggestBriefing([source('Cliente: MANGAI\nChamada: Sabores que acolhem\n'+instruction)]);
    assert.equal(result.fields.qr,false,instruction);
    assert.doesNotMatch(formatBriefing(result.fields),/QR Code/);
  }
});
test('QR fornecido continua solicitado mesmo com proibição de gerar outro',()=>{
  const result=suggestBriefing([source('Usar a imagem de QR Code enviada pelo cliente. Não gerar outro QR Code.')]);
  assert.equal(result.fields.qr,true);
});
test('última instrução explícita sobre uso do QR vence na ordem das fontes',()=>{
  assert.equal(suggestBriefing([source('Incluir QR Code.','1'),source('Não precisamos de QR Code.','2')]).fields.qr,false);
  assert.equal(suggestBriefing([source('Sem QR Code.','1'),source('Incluir QR Code enviado.','2')]).fields.qr,true);
});
