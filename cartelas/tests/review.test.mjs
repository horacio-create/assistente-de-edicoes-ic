import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCategory,reviewSummary} from '../public/review.js';
test('revisão agrupa pendências sem tratar QR opcional como obrigatório',()=>{
 assert.equal(issueCategory('QR Code solicitado: adicione a imagem'),'qr');assert.equal(issueCategory('Título: o texto não cabe'),'text');assert.equal(issueCategory('Adicione o logo solicitado.'),'assets');assert.equal(issueCategory('Forma: elemento ultrapassa a cartela.'),'layout');
 const p={cards:[{id:'one',approved:false},{id:'two',approved:true}]},summary=reviewSummary(p,c=>c.id==='one'?['Foto: resolução baixa','Título: o texto não cabe']:[]);assert.equal(summary.total,2);assert.equal(summary.counts.assets,1);assert.equal(summary.counts.text,1);assert.equal(summary.counts.qr,0);assert.equal(summary.unreviewed,1);
});
