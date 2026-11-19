import test from 'node:test';import assert from 'node:assert/strict';
import {resizeBox} from '../public/editing.js';import {cardName} from '../public/workflow-ui.js';import {blankProject,parseBrief,validateProject} from '../public/core.js';
test('redimensionamento limita bordas, respeita bloqueios e preserva QR quadrado',()=>{
  const layer={x:100,y:200,w:300,h:200,role:'photo'};assert.deepEqual(resizeBox(layer,2000,2000),{w:1180,h:520});assert.deepEqual(resizeBox(layer,-500,-500),{w:8,h:8});assert.throws(()=>resizeBox({...layer,locked:true},1,1));assert.deepEqual(resizeBox({...layer,role:'qr',w:240,h:240},50,20),{w:290,h:290});assert.deepEqual(resizeBox({...layer,role:'qr',w:240,h:240},-500,-500),{w:160,h:160});
});
test('nomes da navegação indicam função e ordem sem alterar o roteiro',()=>{
  const p=blankProject();p.cards=parseBrief('Cartela 1 - texto\nCliente\nCartela 2 - serviços\n• A\nCartela 3 - serviços\n• B\nCartela 4 - contato\nContato').cards;assert.equal(cardName(p,p.cards[0]),'Cartela 1 · Abertura');assert.equal(cardName(p,p.cards[2]),'Cartela 3 · Serviços 2');assert.equal(p.cards[2].label,'Cartela 3');
});
test('registro manual de aprovação aceita data válida e rejeita valor inválido',()=>{
  const p=blankProject();p.clientApprovedAt='2026-10-13T18:00:00.000Z';assert.doesNotThrow(()=>validateProject(p));p.clientApprovedAt='invalid';assert.throws(()=>validateProject(p));
});
