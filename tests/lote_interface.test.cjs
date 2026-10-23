const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync(require('node:path').join(__dirname, '../static/ofertas.js'), 'utf8');
const funcoes = fonte.slice(fonte.indexOf('const passoDe ='), fonte.indexOf('function aplicarValidacao')) + fonte.slice(fonte.indexOf('function planoLote()'), fonte.indexOf('const plural ='));
function plano(n, impar, distribuicao, cartelas) {
  const lista = {min:1, itens:30, grupo:{tamanho:2, incompleto:true, finalTres:true}};
  const contexto = {fonteLote:()=>({itens:Array.from({length:n},()=>({}))}), listaPrincipal:()=>lista,
    document:{querySelector:()=>({value:impar})}, el:id=>({value:id==='lote-cartelas'?cartelas:distribuicao})};
  return vm.runInNewContext(funcoes + ';planoLote()', contexto);
}
test('resumo da interface conta trio como uma cartela e não perde produtos', () => {
  assert.deepEqual(Array.from(plano(7,'tres','sequencia',3).tamanhos), [7]);
  assert.deepEqual(Array.from(plano(9,'tres','sequencia',3).tamanhos), [6,3]);
  assert.deepEqual(Array.from(plano(9,'tres','equilibrar',3).tamanhos), [4,5]);
  assert.deepEqual(Array.from(plano(7,'sozinho','sequencia',3).tamanhos), [6,1]);
  for(let n=1;n<=101;n++) for(const impar of ['sozinho','tres']) for(const dist of ['sequencia','equilibrar']) {
    const p=plano(n,impar,dist,15);
    assert.equal(p.tamanhos.reduce((a,b)=>a+b,0),n);
    assert.equal(p.repetidos,0);
    assert.ok(p.tamanhos.every(t=>t>0 && t<=30));
  }
});

test('11 produtos, quatro cartelas por vídeo: mostra dois vídeos sem perder a sobra',()=>{
 assert.deepEqual(Array.from(plano(11,'sozinho','sequencia',4).tamanhos),[8,3]);
 assert.deepEqual(Array.from(plano(11,'sozinho','equilibrar',4).tamanhos),[6,5]);
 assert.deepEqual(Array.from(plano(11,'tres','sequencia',4).tamanhos),[8,3]);
});
