import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTIONS,presetTemplate,applyCollection} from '../public/design-presets.js';
import {blankProject,parseBrief,composeCard,validateProject,qrLayer} from '../public/core.js';
import {serviceItems,serviceGrid,splitServiceCards} from '../public/service-list.js';
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
test('fotos horizontais respeitam leitura, moldura e QR nas sete coleções',()=>{
 for(const {id,shapedPhoto} of COLLECTIONS)for(const kind of ['intro','services','contact'])for(const hasQr of [true,false]){
  const template=presetTemplate(id,kind,{photoAspect:1.8,hasPhoto:true,hasQr,hasLogo:false}),photo=template.layers.find(l=>l.role==='photo');
  // Shaped frames (diagonal, wave, circle, arch) crop the photo instead of resizing the frame.
  if(shapedPhoto)assert.ok(photo.w>=200&&photo.h>=200,id+' '+kind);
  else if(id!=='table')assert.ok(Math.abs(photo.w/photo.h-1.8)<.001,id+' '+kind);
  else if(kind!=='contact'&&!hasQr)assert.deepEqual([photo.y,photo.h],[0,720]);
  assert.equal(template.layers.some(l=>['logo','logoBase'].includes(l.role)),false);
  for(const text of template.layers.filter(l=>l.type==='text'))assert.equal(overlap(text,photo),false,id+' '+text.role);
  for(const layer of template.layers)assert.ok(layer.x>=0&&layer.y>=0&&layer.x+layer.w<=1280&&layer.y+layer.h<=720,id+' '+layer.name);
  if(hasQr)assert.equal(overlap(photo,qrLayer(null)),false,id+' QR');
 }
});
test('coleção escolhe moldura horizontal pelas dimensões do material e preserva texto',()=>{
 const p=blankProject();p.cards=parseBrief('Cartela 1 - Foto 1\nUma apresentação\nTexto do cliente').cards.map(c=>composeCard(c,p.theme,p.palette));
 p.assets.photo={kind:'photo',width:1800,height:1000,name:'Horizontal',data:'data:image/png;base64,AAAA'};p.cards[0].layers.find(l=>l.role==='photo').assetId='photo';
 const content=structuredClone(p.cards[0].content);applyCollection(p,'atelier',{keepIdentity:false});
 const photo=p.cards[0].layers.find(l=>l.role==='photo');assert.ok(Math.abs(photo.w/photo.h-1.8)<.001);assert.deepEqual(p.cards[0].content,content);validateProject(p);
 p.cards[0].layers.push({...photo,id:crypto.randomUUID(),role:'logo',assetId:null});applyCollection(p,'care');assert.equal(p.cards[0].layers.some(l=>l.role==='logo'),false);
});
test('grade larga distribui itens por coluna em ordem e listas divididas preservam tudo',()=>{
 assert.deepEqual(serviceGrid({w:1000,h:360},8),{columns:2,rows:4,width:476,height:90});
 const p=blankProject();p.cards=parseBrief('Cartela 1 - serviços\nNossos serviços\n'+Array.from({length:9},(_,i)=>'• Serviço '+(i+1)).join('\n')).cards.map(c=>composeCard(c,p.theme,p.palette));
 applyCollection(p,'care',{keepIdentity:false});const original=serviceItems(p.cards[0]);p.cards[0].layers.find(l=>l.role==='serviceIcon').icon='heart';original[0].icon='heart';
 const id=p.cards[0].id,cards=splitServiceCards(p,p.cards[0]);assert.equal(cards.length,3);assert.equal(cards[0].id,id);assert.equal(new Set(cards.map(c=>c.id)).size,3);
 assert.deepEqual(cards.flatMap(serviceItems).map(i=>[i.raw,i.icon]),original.map(i=>[i.raw,i.icon]));assert.deepEqual(cards.map(c=>serviceItems(c).length),[4,4,1]);validateProject(p);
 const before=structuredClone(p);assert.throws(()=>splitServiceCards(p,p.cards[0]));assert.deepEqual(p,before);
});
