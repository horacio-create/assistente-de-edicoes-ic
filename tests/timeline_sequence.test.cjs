const test=require('node:test'),assert=require('node:assert/strict');
const {plan}=require('../static/timeline-sequence.js');
const media=[{id:'v1',kind:'video'},{id:'v2',kind:'video'},{id:'v3',kind:'video'},{id:'audio',kind:'audio'}];
function project(){return {tracks:[{id:'t1'},{id:'t2'},{id:'t3'}],clips:[{id:'a',mediaId:'v1',track:'t1',at:0,duration:2,in:1,out:3,settings:{rotation:90}},{id:'b',mediaId:'v2',track:'t2',at:0,duration:3,in:2,out:5,settings:{mute:true}}]};}
test('imagens PNG e seleção mista também podem formar a escadinha',()=>{
 for(const kinds of [['image','image'],['image','video'],['video','image']]){
  const sources=media.map(m=>({...m}));sources[0].kind=kinds[0];sources[1].kind=kinds[1];
  const p=project();p.clips.forEach(c=>{c.duration=15;});
  const before=structuredClone(p);
  assert.deepEqual(plan(p,['a','b'],sources),[{id:'a',at:0},{id:'b',at:15}]);assert.deepEqual(p,before);
 }
 const sources=media.map(m=>({...m}));sources[1].kind='audio';assert.throws(()=>plan(project(),['a','b'],sources));
});
test('escadinha mantém cortes, durações e faixas e não modifica a entrada',()=>{
 const p=project(),before=structuredClone(p);assert.deepEqual(plan(p,['a','b'],media),[{id:'a',at:0},{id:'b',at:2}]);assert.deepEqual(p,before);
});
test('ordem da seleção e ordem das faixas podem ser escolhidas',()=>{
 const p=project();assert.deepEqual(plan(p,['b','a'],media),[{id:'b',at:0},{id:'a',at:3}]);assert.deepEqual(plan(p,['a','b'],media,'tracks'),[{id:'b',at:0},{id:'a',at:3}]);
});
test('trechos não selecionados e áudio são preservados',()=>{
 const p=project();p.clips.push({id:'c',mediaId:'v3',track:'t3',at:0,duration:1},{id:'d',mediaId:'audio',track:'t3',at:0,duration:5});const before=structuredClone(p);
 assert.equal(plan(p,['a','b'],media).length,2);assert.deepEqual(p,before);
});
test('bloqueios, colisões e seleção inválida não alteram a montagem',()=>{
 for(const change of [p=>p.clips[1].locked=true,p=>p.tracks[1].locked=true,p=>p.clips.push({id:'other',mediaId:'v3',track:'t2',at:2,duration:2})]){
  const p=project();change(p);const before=structuredClone(p);assert.throws(()=>plan(p,['a','b'],media));assert.deepEqual(p,before);
 }
 assert.throws(()=>plan(project(),['a'],media));assert.throws(()=>plan(project(),['a','missing'],media));
});
test('não cria lacunas ou ultrapassa uma hora e usa a grade de 30 fps',()=>{
 const p=project();p.clips[0].duration=1/30;assert.equal(plan(p,['a','b'],media)[1].at,1/30);
 p.clips.push({id:'c',mediaId:'v3',track:'t3',at:20,duration:2});assert.throws(()=>plan(p,['a','b'],media),/espaço vazio/);
 p.clips.pop();p.clips[0].duration=3600;assert.throws(()=>plan(p,['a','b'],media),/uma hora/);
});
