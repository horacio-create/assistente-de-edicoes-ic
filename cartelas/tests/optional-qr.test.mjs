import test from 'node:test';import assert from 'node:assert/strict';
import {blankProject,parseBrief,composeCard,setQrRequested,qrRequested,validateCard,qrLayer} from '../public/core.js';
test('contato não exige QR e instruções negativas não o tornam obrigatório',()=>{
 for(const header of ['Logo + contatos','contatos sem QR Code','contatos, não incluir QR Code','contatos não precisa de QR']){const c=parseBrief('Cartela 1 - '+header+'\nFale conosco\n(88) 99999-9999').cards[0];assert.equal(c.requirements.qr,false);}
 assert.equal(qrRequested('Logo + QR Code'),true);assert.equal(qrRequested('Incluir QR'),true);assert.equal(qrRequested('Não esquecer QR Code'),true);
});
test('QR é uma escolha reversível e materiais originais permanecem disponíveis',()=>{
 const p=blankProject();p.cards=parseBrief('Cartela 1 - contato\nFale conosco').cards.map(c=>composeCard(c,p.theme,p.palette));const c=p.cards[0];
 assert.equal(validateCard(c,p.assets).some(s=>s.includes('QR')),false);setQrRequested(p,true);assert.equal(validateCard(c,p.assets).some(s=>s.includes('QR Code solicitado')),true);
 c.layers.push(qrLayer(null));const texts=c.layers.filter(l=>l.type==='text');p.assets.original={kind:'qr',data:'original'};
 setQrRequested(p,false);assert.equal(c.requirements.qr,false);assert.equal(c.layers.some(l=>l.role==='qr'),false);assert.deepEqual(c.layers.filter(l=>l.type==='text'),texts);assert.equal(p.assets.original.data,'original');assert.equal(validateCard(c,p.assets).some(s=>s.includes('QR')),false);
});
