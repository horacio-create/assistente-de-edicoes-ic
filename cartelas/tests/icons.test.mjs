import test from 'node:test';import assert from 'node:assert/strict';
import {ICONS,iconLayer,suggestIcon} from '../public/icons.js';
import {buildServiceList,serviceItems,flattenServices} from '../public/service-list.js';
import {blankProject,parseBrief,composeCard,validateProject,EXAMPLE,qrLayer,arrangeQr} from '../public/core.js';
import {applyCollection} from '../public/design-presets.js';
import {captureTemplate,applyTemplate,validateTemplate} from '../public/templates.js';
const work=()=>{const p=blankProject();p.cards=parseBrief(EXAMPLE).cards.map(c=>composeCard(c,p.theme,p.palette));return p;};
test('catálogo mantém símbolos e sugestões sem dividir serviços ambíguos',()=>{
  assert.equal(Object.keys(ICONS).length,31);assert.equal(suggestIcon('Música'),'music');assert.equal(suggestIcon('Educação infantil'),'graduation');assert.equal(suggestIcon('Robótica'),'robot');assert.equal(suggestIcon('Preenchimento Labial'),'lips');assert.equal(suggestIcon('Rinomodelação Contorno Facial'),'nose');assert.equal(suggestIcon('Full Face Toxina Botulínica'),'syringe');assert.equal(suggestIcon('Bioestimuladores'),'molecule');
});
test('lista mantém o conteúdo, permite ordem e símbolos manuais e retorna ao texto',()=>{
  const p=work(),c=p.cards[1],original=c.content.body;buildServiceList(c,p.palette);
  assert.equal(c.layers.find(l=>l.role==='body').text,original);assert.equal(serviceItems(c).length,5);assert.equal(c.layers.filter(l=>l.type==='icon').length,5);
  const items=serviceItems(c);items[0].icon='heart';[items[0],items[1]]=[items[1],items[0]];buildServiceList(c,p.palette,items);assert.equal(serviceItems(c)[1].icon,'heart');validateProject(p);
  flattenServices(c);assert.equal(c.layers.filter(l=>l.type==='icon').length,0);assert.equal(c.layers.find(l=>l.role==='body').visible,true);assert.ok(c.layers.find(l=>l.role==='body').text.startsWith('• Labial'));
});
test('Lumina reaplica sem duplicar e mantém escolha manual; outra coleção preserva lista e símbolos',()=>{
  const p=work();applyCollection(p,'lumina',{keepIdentity:false});const c=p.cards[1],count=c.layers.length;
  const items=serviceItems(c);items[0].icon='star';buildServiceList(c,p.palette,items);applyCollection(p,'lumina',{keepIdentity:false});assert.equal(p.cards[1].layers.length,count);assert.equal(serviceItems(p.cards[1])[0].icon,'star');
  applyCollection(p,'care',{keepIdentity:false});assert.equal(p.cards[1].layers.some(l=>l.role==='serviceText'),true);assert.equal(serviceItems(p.cards[1])[0].icon,'star');assert.ok(p.cards[1].layers.find(l=>l.role==='body').text.includes('Preenchimento Facial'));validateProject(p);
});
test('modelos guardam estilo da lista e ícones avulsos sem textos do cliente',()=>{
  const p=work();applyCollection(p,'lumina',{keepIdentity:false});const c=p.cards[1];c.layers.push(iconLayer('phone'));const m=captureTemplate(p,c,'Lista estética');validateTemplate(m);
  assert.ok(m.serviceLayout);assert.ok(m.layers.some(l=>l.type==='icon'));assert.doesNotMatch(JSON.stringify(m),/Preenchimento|Botulínica|Bioestimuladores/);
  const target=work();applyTemplate(target,target.cards[1],m);assert.equal(serviceItems(target.cards[1]).length,5);validateProject(target);
  const bad=structuredClone(target);bad.cards[1].layers.find(l=>l.type==='icon').icon='invalid';assert.throws(()=>validateProject(bad));
});
test('lista rejeita excesso antes de modificar e valida cantos individuais',()=>{
  const p=work(),c=p.cards[1],before=JSON.stringify(c);const items=Array.from({length:13},()=>({id:crypto.randomUUID(),text:'Serviço',icon:'check'}));assert.throws(()=>buildServiceList(c,p.palette,items));assert.equal(JSON.stringify(c),before);
  applyCollection(p,'lumina',{keepIdentity:false});validateProject(p);p.cards[1].layers.find(l=>l.corners).corners=[-1,0,2,0];assert.throws(()=>validateProject(p));
});
test('itens repetidos mantêm símbolos distintos e novos itens continuam pendentes ao reaplicar',()=>{
  const p=work();applyCollection(p,'lumina',{keepIdentity:false});const c=p.cards[1];
  const items=[{id:crypto.randomUUID(),text:'Serviço',raw:'Serviço',icon:'heart',pending:true},{id:crypto.randomUUID(),text:'Serviço',raw:'Serviço',icon:'star'}];buildServiceList(c,p.palette,items);
  applyCollection(p,'lumina',{keepIdentity:false});const result=serviceItems(p.cards[1]);assert.equal(result[0].icon,'heart');assert.equal(result[1].icon,'star');assert.equal(result[0].pending,true);
});
test('QR recebido depois da lista reserva espaço e realinha os itens sem perder os símbolos',()=>{
  const p=work(),c=p.cards[1];buildServiceList(c,p.palette);const items=serviceItems(c);items[0].icon='heart';buildServiceList(c,p.palette,items);
  c.layers.push(qrLayer(null,null));arrangeQr(c);const qr=c.layers.find(l=>l.role==='qr');assert.equal(serviceItems(c)[0].icon,'heart');
  for(const row of c.layers.filter(l=>l.role==='serviceText'))assert.ok(row.x+row.w<=qr.x-60);validateProject(p);
});
