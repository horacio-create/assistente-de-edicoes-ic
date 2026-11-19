import test from 'node:test';import assert from 'node:assert/strict';
import {editTargets,bounds,translate,alignPosition,boundedPosition,snapPosition,photoOffset,duplicateElement} from '../public/editing.js';
import {shapeLayer,qrLayer} from '../public/core.js';
test('alinhamento usa margens ou bordas e movimento mantém o grupo dentro da cartela',()=>{
  const b={x:100,y:150,w:300,h:100};assert.deepEqual(alignPosition(b,'center'),{x:490,y:150});assert.deepEqual(alignPosition(b,'bottom'),{x:100,y:540});assert.deepEqual(alignPosition(b,'right',0),{x:980,y:150});assert.deepEqual(boundedPosition(b,1500,-50),{x:980,y:0});
});
test('serviço move em conjunto sem mexer no texto-base e respeita bloqueios',()=>{
  const a={...shapeLayer('A',80,100,40,40,'#ffffff'),serviceId:'item'},b={...shapeLayer('B',140,100,400,40,'#ffffff'),serviceId:'item'},hidden={...a,id:'source',visible:false},card={layers:[a,b,hidden]};
  const group=editTargets(card,a);assert.equal(group.length,2);assert.deepEqual(bounds(group),{x:80,y:100,w:460,h:40});translate(group,20,10);assert.equal(a.x,100);assert.equal(b.x,160);assert.equal(hidden.x,80);b.locked=true;assert.throws(()=>editTargets(card,a));assert.equal(editTargets(card,a,false).length,1);
});
test('guias encaixam margens, centros e outros elementos sem tocar objetos distantes',()=>{
  const b={x:0,y:0,w:100,h:100};const s=snapPosition(b,76,210,[]);assert.equal(s.x,80);assert.ok(s.guides.some(g=>g.axis==='x'&&g.value===80));
  const untouched=snapPosition(b,271,187,[]);assert.equal(untouched.x,271);assert.equal(untouched.y,187);
  const other={x:403,y:180,w:80,h:80,visible:true};assert.equal(snapPosition(b,400,200,[other]).x,403);
});
test('enquadramento limita arraste às bordas da imagem e preserva campos da moldura',()=>{
  const l={x:100,y:100,w:400,h:600,fit:'cover',zoom:1},a={width:1200,height:600};assert.deepEqual(photoOffset(l,a,999,999),{offsetX:400,offsetY:0});
  assert.deepEqual(l,{x:100,y:100,w:400,h:600,fit:'cover',zoom:1});l.fit='contain';assert.deepEqual(photoOffset(l,a,999,999),{offsetX:0,offsetY:200});
});
test('duplicação cria elemento independente, preserva máscara e protege QR e camadas bloqueadas',()=>{
  const original=shapeLayer('Forma',1100,600,150,80,'#ffffff',{corners:[30,0,30,0],serviceId:'item'}),card={layers:[original],approved:true};const copy=duplicateElement(card,original);assert.notEqual(copy.id,original.id);assert.equal(copy.role,'custom');assert.equal(copy.serviceId,undefined);copy.corners[0]=0;assert.equal(original.corners[0],30);assert.equal(copy.x,1124);assert.equal(copy.y,624);assert.equal(card.approved,false);
  assert.throws(()=>duplicateElement({layers:[]},qrLayer(null)));original.locked=true;assert.throws(()=>duplicateElement(card,original));
});
