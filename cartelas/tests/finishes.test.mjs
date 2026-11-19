import test from 'node:test';import assert from 'node:assert/strict';
import {blankProject,parseBrief,composeCard,validateProject} from '../public/core.js';
import {setFinish,setShadow,finishColors} from '../public/finishes.js';
import {captureTemplate,applyTemplate} from '../public/templates.js';
import {applyPaletteColors} from '../public/palette.js';
import {COLLECTIONS,presetTemplate} from '../public/design-presets.js';
const work=()=>{const p=blankProject();p.cards=parseBrief('Cartela 1 - texto\nNome do cliente').cards.map(c=>composeCard(c,p.theme,p.palette));return p;};
test('acabamentos sobrevivem ao modelo sem compartilhar objetos e seguem a nova identidade',()=>{
  const p=work(),bg=p.cards[0].layers[0];setFinish(bg,'paper');setShadow(bg,'soft');const model=captureTemplate(p,p.cards[0],'Teste');
  applyTemplate(p,p.cards[0],model);const applied=p.cards[0].layers[0];assert.deepEqual(applied.gradient,bg.gradient);applied.gradient.angle=42;assert.notEqual(model.layers[0].gradient.angle,42);
  const colors=finishColors(applied);applyPaletteColors(p,{primary:'#332211',accent:'#ccaaff',background:'#ddeeff'});assert.notDeepEqual(finishColors(applied),colors);assert.equal(applied.fill,'#ddeeff');validateProject(p);
  setFinish(applied,'plain');setShadow(applied,'none');assert.equal(applied.gradient,undefined);assert.equal(applied.texture,undefined);assert.equal(applied.shadow,undefined);
});
test('cópias rejeitam efeitos excessivos ou aplicados ao texto e QR',()=>{
  for(const [key,value] of [['gradient',{angle:90,amount:1,tone:'light'}],['texture',{amount:.1,seed:3}],['shadow',{blur:100,x:0,y:0,opacity:.1}]]){const p=work();p.cards[0].layers[0][key]=value;assert.throws(()=>validateProject(p));}
  const p=work();setFinish(p.cards[0].layers.find(l=>l.type==='text'),'light');assert.throws(()=>validateProject(p));
});
test('todas as coleções e variantes guardam acabamentos válidos e fundos coerentes',()=>{
  for(const collection of COLLECTIONS)for(const kind of ['intro','services','contact'])for(const hasPhoto of [false,true])for(const hasQr of [false,true]){
    const p=work(),model=presetTemplate(collection.id,kind,{hasPhoto,hasQr});applyTemplate(p,p.cards[0],model,{keepIdentity:false});validateProject(p);assert.ok(p.cards[0].layers.find(l=>l.role==='background').gradient);
  }
});
