import test from 'node:test';
import assert from 'node:assert/strict';
import {readVisualDirection,applyVisualDirection} from '../public/visual-direction.js';
import {blankProject,parseBrief,composeCard,validateProject} from '../public/core.js';
import {applyCollection} from '../public/design-presets.js';
import {distributeElements} from '../public/editing.js';
import {expandReadingArea} from '../public/render.js';
test('direção objetiva separa instrução e conteúdo sem adivinhar frases publicitárias',()=>{
 const p=blankProject();const raw='Cartela 1 - Foto 1 + cartela amarela\nSua vida mais verde\nVisual: texto preto; foto à esquerda; título grande';
 const c=parseBrief(raw).cards[0];assert.equal(c.content.title,'Sua vida mais verde');assert.equal(c.content.body,'');
 const found=readVisualDirection(c.instructions,c.rawContent);assert.deepEqual(found.values,{background:'#facc15',textColor:'#000000',photoSide:'left',titleSize:'large'});
 assert.deepEqual(readVisualDirection('','Sua vida mais verde').values,{});
 composeCard(c,p.theme,p.palette);assert.notEqual(c.layers[0].fill,'#facc15');applyVisualDirection(c,found.values);assert.equal(c.layers[0].fill,'#facc15');assert.ok(c.layers.find(l=>l.role==='photo').x<640);
 p.cards=[c];validateProject(p);applyCollection(p,'care',{keepIdentity:false});assert.equal(p.cards[0].layers.find(l=>l.role==='background').fill,'#facc15');assert.ok(p.cards[0].layers.filter(l=>l.type==='text').every(l=>l.fill==='#000000'));
 const before=structuredClone(p.cards[0].layers);applyVisualDirection(p.cards[0]);assert.deepEqual(p.cards[0].layers,before);validateProject(p);
});
test('conflitos, negações, cores hex e parâmetros inválidos',()=>{
 const r=readVisualDirection('fundo amarelo; fundo azul; sem texto preto');assert.equal(r.values.background,undefined);assert.equal(r.values.textColor,undefined);assert.equal(r.notes.length,2);
 assert.equal(readVisualDirection('fundo #123ABC').values.background,'#123abc');
 assert.throws(()=>applyVisualDirection({layers:[]},{background:'yellow'}));assert.throws(()=>applyVisualDirection({layers:[]},{evil:true}));
});
test('posicionamento preserva QR e cores não modificam fotos ou logo',()=>{
 const card={layers:[{role:'photo',x:800,w:400},{role:'qr',visible:true,x:980,w:200},{role:'logo',x:80,w:200}]};
 const before=structuredClone(card.layers);assert.equal(applyVisualDirection(card,{photoSide:'left',textColor:'#000000'}).length,1);assert.deepEqual(card.layers,before);
});
test('espaçamento conserva extremos, tamanhos e bloqueios',()=>{
 const list=[{x:10,w:20,visible:true},{x:40,w:30,visible:true},{x:150,w:20,visible:true}];distributeElements(list,'x');assert.deepEqual(list.map(l=>l.x),[10,75,150]);
 list[1].locked=true;const saved=structuredClone(list);assert.throws(()=>distributeElements(list,'x'));assert.deepEqual(list,saved);
 assert.throws(()=>distributeElements(list.slice(0,2),'x'));
});
test('template aproveita espaço livre antes de diminuir título sem invadir foto',()=>{
 const ctx={measureText:t=>({width:t.length*25,actualBoundingBoxAscent:40})};
 const title={role:'title',type:'text',visible:true,text:'Um título extenso para apresentar o cliente',font:'Arial',weight:'bold',size:50,lineHeight:1.2,x:80,y:200,w:550,h:70};
 const body={role:'body',type:'text',visible:true,x:80,y:320,w:550,h:300};const card={layers:[title,body,{type:'image',role:'photo',visible:true,x:800,y:100,w:400,h:500}]};
 expandReadingArea(card,ctx);assert.ok(title.h>70);assert.ok(body.y>=title.y+title.h+28);assert.equal(title.size,50);const before=structuredClone(card);expandReadingArea(card,ctx);assert.deepEqual(card,before);
});
