import test from 'node:test';import assert from 'node:assert/strict';
import {SEGMENTS,resolveSegment} from '../public/segments.js';
import {blankProject,parseBrief,composeCard,validateProject} from '../public/core.js';
import {applyCollection,presetTemplate} from '../public/design-presets.js';
import {suggestIcon,ICONS} from '../public/icons.js';
import {serviceItems,buildServiceList} from '../public/service-list.js';
const make=(subtitle,items='• Item um\n• Item dois',title='')=>{const p=blankProject();p.brief=`Cartela 1 - texto\nCliente\n${subtitle}\n\nCartela 2 - serviços + Foto 2\n${title?title+'\n':''}${items}`;p.cards=parseBrief(p.brief).cards.map(c=>composeCard(c,p.theme,p.palette));return p;};
test('segmentos reconhecem conteúdo sem depender do nome do layout e respeitam escolha manual',()=>{
  for(const [subtitle,id] of [['Cozinha brasileira','restaurant'],['Harmonização facial','health'],['Loja de calçados','retail'],['Educação infantil','education'],['Produção de eventos','events']])assert.equal(resolveSegment(make(subtitle),'table').id,id);
  const p=make('Cozinha brasileira');p.segment='general';assert.equal(resolveSegment(p).id,'general');
  assert.equal(resolveSegment(make('Apresentação')).id,'general');
  assert.equal(resolveSegment(make('Cozinha e harmonização facial')).id,'general');
  p.segment='invalido';assert.throws(()=>validateProject(p));
});
test('títulos automáticos se adaptam ao segmento sem alterar itens ou títulos escritos pelo designer',()=>{
  for(const segment of SEGMENTS){const p=make('Apresentação');p.segment=segment.id;const original=p.cards[1].content.body;applyCollection(p,'table',{keepIdentity:false});assert.equal(p.cards[1].layers.find(l=>l.role==='title').text,segment.heading);assert.equal(p.cards[1].content.body,original);validateProject(p);}
  const p=make('Cozinha brasileira');applyCollection(p,'table');p.cards[1].layers.find(l=>l.role==='title').text='Menu especial do chef';p.segment='education';applyCollection(p,'school');assert.equal(p.cards[1].layers.find(l=>l.role==='title').text,'Menu especial do chef');
  const explicit=make('Cozinha brasileira',undefined,'Serviços');applyCollection(explicit,'table');assert.equal(explicit.cards[1].layers.find(l=>l.role==='title').text,'Serviços');
});
test('título automático acompanha troca consciente de segmento, sobrevive à cópia e não se autoidentifica',()=>{
  const p=make('Apresentação');applyCollection(p,'school');assert.equal(p.cards[1].content.title,'Atividades e formação');assert.equal(resolveSegment(p).id,'general');
  const copy=validateProject(JSON.parse(JSON.stringify(p)));copy.segment='restaurant';applyCollection(copy,'table');assert.equal(copy.cards[1].content.title,'Nossos sabores');
  delete copy.segment;copy.cards[1].automaticTitle={};assert.throws(()=>validateProject(copy));
});
test('gastronomia tem símbolos próprios, sem afetar procedimentos de estética ou ícones manuais',()=>{
  for(const [text,id] of [['Baião de dois','bowl'],['Carne de sol','meat'],['Sobremesas regionais','cake'],['Café especial','coffee'],['Delivery','truck'],['Preenchimento facial','face'],['Toxina botulínica','syringe']]){assert.equal(suggestIcon(text),id,text);assert.ok(ICONS[id].paths.length);}
  const p=make('Cozinha brasileira','• Baião de dois\n• Carne de sol\n• Sobremesas regionais');applyCollection(p,'table');assert.deepEqual(serviceItems(p.cards[1]).map(i=>i.icon),['bowl','meat','cake']);const items=serviceItems(p.cards[1]);items[0].icon='heart';buildServiceList(p.cards[1],p.palette,items);applyCollection(p,'table');assert.equal(serviceItems(p.cards[1])[0].icon,'heart');
});
test('À mesa mantém foto protagonista e retira painel pesado na abertura sem invadir textos/QR',()=>{
  const t=presetTemplate('table','intro',{hasPhoto:true,photoAspect:1.8});const photo=t.layers.find(l=>l.role==='photo');assert.deepEqual([photo.x,photo.y,photo.w,photo.h],[626,0,654,720]);assert.equal(t.layers.some(l=>l.name==='Base do texto'),false);
  const services=presetTemplate('table','services',{hasPhoto:true,photoAspect:1.8});assert.equal(services.layers.find(l=>l.name==='Base do texto').colorToken,'background');
});
