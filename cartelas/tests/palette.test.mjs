import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHex,pixelPosition,applyPaletteColors} from '../public/palette.js';
import {blankProject,parseBrief,composeCard,validateProject} from '../public/core.js';
import {blankClient,validateClient,applyClientIdentity} from '../public/clients.js';

test('captura usa as coordenadas da imagem exibida e limita as bordas',()=>{
  const rect={left:10,top:20,width:400,height:200};
  assert.deepEqual(pixelPosition(210,120,rect,1600,800),{x:800,y:400});
  assert.deepEqual(pixelPosition(900,-10,rect,1600,800),{x:1599,y:0});
  assert.equal(normalizeHex(' C9A86A '),'#c9a86a');
  assert.throws(()=>normalizeHex('#fff'));
});
test('cores aplicadas preservam geometria, textos e assets, reabrindo aprovação',()=>{
  const p=blankProject();p.cards=parseBrief('Cartela 1 - Logo + texto\nCliente\nEspecialidade').cards.map(c=>composeCard(c,p.theme,p.palette));
  const card=p.cards[0];card.approved=true;const geometry=card.layers.map(l=>[l.x,l.y,l.w,l.h]),title=card.content.title;
  applyPaletteColors(p,{primary:'#625850',accent:'#c9a86a',background:'#f5f1ea'});
  assert.deepEqual(card.layers.map(l=>[l.x,l.y,l.w,l.h]),geometry);assert.equal(card.content.title,title);assert.equal(card.approved,false);assert.equal(card.layers.find(l=>l.role==='background').fill,'#f5f1ea');
  card.approved=true;applyPaletteColors(p,p.palette);assert.equal(card.approved,true);
  const before=structuredClone(p);assert.throws(()=>applyPaletteColors(p,{primary:'bad',accent:'#c9a86a',background:'#f5f1ea'}));assert.deepEqual(p,before);
});
test('fundo personalizado sobrevive à recomposição e à identidade; fundo inválido é rejeitado',()=>{
  const p=blankProject();p.palette.background='#f5f1ea';const card=parseBrief('Cartela 1 - texto\nCliente').cards[0];composeCard(card,p.theme,p.palette);p.cards=[card];assert.equal(card.layers[0].fill,'#f5f1ea');
  const client=blankClient();client.name='Teste';client.palette.background='#eeeedd';applyClientIdentity(p,client,{recompose:true});assert.equal(card.layers[0].fill,'#eeeedd');assert.doesNotThrow(()=>validateProject(p));
  p.palette.background='url(invalid)';assert.throws(()=>validateProject(p));client.palette.background='invalid';assert.throws(()=>validateClient(client));
});
