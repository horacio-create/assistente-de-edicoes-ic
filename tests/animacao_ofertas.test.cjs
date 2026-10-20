const test=require('node:test'),assert=require('node:assert/strict');
const {animar}=require('../ofertas/templates/uniforca-hora-da-carne-flexivel/assets/animacao.js');
function montar(duracao,indice=0,normal=true){
 const chamadas=[];const p={querySelector:s=>!normal&&['.de','.seta'].includes(s)?null:s};
 animar({fromTo:(alvo,de,para,t)=>chamadas.push({alvo,de,para,t})},p,5,duracao,indice);
 return chamadas;
}
test('produto entra pequeno e girado, informações entram depois e permanecem paradas',()=>{
 const c=montar(5);assert.equal(c[0].alvo,'.foto-box');assert.equal(c[0].de.scale,.12);assert.equal(c[0].de.rotation,-24);
 assert.equal(c[0].para.scale,1);assert.equal(c[0].para.rotation,0);
 assert.ok(c.find(x=>x.alvo==='.nome').t>c[0].t);
 assert.ok(c.find(x=>x.alvo==='.selo-preco').t>c.find(x=>x.alvo==='.selo').t);
 assert.ok(c.every(x=>x.para.repeat===undefined&&x.para.yoyo===undefined&&x.para.opacity===1));
 assert.ok(c.every(x=>x.t+x.para.duration<6));
});
test('trio e cartelas curtas concluem a entrada dentro da duração e preservam os alvos editáveis',()=>{
 for(const d of [.5,1,2.5,5,15])for(const i of [0,1,2]){
  const c=montar(d,i);assert.ok(c.every(x=>x.t+x.para.duration<5+d));
  assert.ok(c.every(x=>!x.alvo.includes('ajuste')&&!x.alvo.includes('data-editavel')));
 }
 assert.equal(montar(5,0,false).length,4);
});
