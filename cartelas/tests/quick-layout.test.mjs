import test from 'node:test';import assert from 'node:assert/strict';
import {focusPhoto,logoInset} from '../public/editing.js';
import {blankProject,parseBrief,composeCard,validateProject} from '../public/core.js';
import {applyCollection,presetTemplate} from '../public/design-presets.js';
import {captureTemplate} from '../public/templates.js';
test('enquadramento rápido move apenas o recorte da foto, respeita os limites e bloqueios',()=>{
 const layer={role:'photo',x:100,y:80,w:300,h:400,zoom:1,fit:'cover',locked:false},asset={width:1200,height:800},before={...layer};
 assert.deepEqual(focusPhoto(layer,asset,'left'),{offsetX:150,offsetY:0});assert.deepEqual(focusPhoto(layer,asset,'right'),{offsetX:-150,offsetY:0});assert.deepEqual(focusPhoto(layer,asset,'center'),{offsetX:0,offsetY:0});assert.deepEqual(layer,before);assert.throws(()=>focusPhoto({...layer,locked:true},asset,'left'));
});
test('tamanho do logo é reversível dentro da área reservada e permanece no modelo',()=>{
 const p=blankProject();p.cards=parseBrief('Cartela 1 - logo e texto\nClínica Aurora').cards.map(c=>composeCard(c,p.theme,p.palette));const layer=p.cards[0].layers.find(l=>l.role==='logo');layer.logoInset=logoInset('compact');validateProject(p);assert.equal(captureTemplate(p,p.cards[0],'Logo discreto').layers.find(l=>l.role==='logo').logoInset,.2);assert.equal(logoInset('full'),0);assert.throws(()=>logoInset('unknown'));applyCollection(p,'serena');assert.equal(p.cards[0].layers.find(l=>l.role==='logo').logoInset,.2);p.cards[0].layers.find(l=>l.role==='logo').logoInset=.8;assert.throws(()=>validateProject(p));
});
test('Serena tem composições diferentes, mantém o cliente e uma única foto por cartela',()=>{
 const p=blankProject();p.cards=parseBrief('Cartela 1 - logo + foto + texto\nClínica Aurora\nCartela 2 - serviços + foto\nCuidados\n• Facial\n• Labial\nCartela 3 - foto + contatos + QR Code\nAgende\n(88) 90000-0000\n@clinicaaurora').cards.map(c=>composeCard(c,p.theme,p.palette));const contents=p.cards.map(c=>structuredClone(c.content));applyCollection(p,'serena',{keepIdentity:false});validateProject(p);assert.deepEqual(p.cards.map(c=>c.content),contents);for(const c of p.cards)assert.equal(c.layers.filter(l=>l.role==='photo').length,1);const intro=presetTemplate('serena','intro'),services=presetTemplate('serena','services');assert.ok(intro.layers.find(l=>l.role==='photo').x<services.layers.find(l=>l.role==='photo').x);
});
