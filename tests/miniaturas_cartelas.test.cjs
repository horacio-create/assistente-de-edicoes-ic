const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const fonte=fs.readFileSync(require('node:path').join(__dirname,'../static/ofertas-editor.js'),'utf8');
const funcoes=fonte.slice(fonte.indexOf('  function assinaturaMiniatura('),fonte.indexOf('  function rotuloPrevia('));
function ambiente(){
  const op={pedido:{id:'pedido',revision:1,dados:{validade:'Hoje',produtos:[{nome:'A',edicao:'{}'},{nome:'B',edicao:'{}'}]}}};
  const minis=[0,1].map(n=>({dataset:{cartela:String(n),visivel:n===0?'true':'false'},closest:()=>({dataset:{}})}));
  const nav={scrollLeft:0,clientWidth:300,scrollWidth:600},campos={'faixa-anterior':{},'faixa-proxima':{}};
  let seq=0;
  const c=vm.createContext({op,numerosDaCartela:n=>[n+1],crypto:{randomUUID:()=>String(++seq)},inline:true,el:id=>campos[id],dialog:{querySelector:()=>nav,querySelectorAll:()=>minis}});
  vm.runInContext(funcoes,c);
  return {c,op,minis,campos,nav};
}
test('prévias só carregam quando visíveis e usam a revisão salva do pedido',()=>{
  const a=ambiente();vm.runInContext('atualizarMiniaturas()',a.c);
  assert.match(a.minis[0].src,/v=1&editar=1&sessao=1/);
  assert.equal(a.minis[1].src,undefined);
  a.op.pedido.revision=2;a.minis[1].dataset.visivel='true';
  vm.runInContext('atualizarMiniaturas()',a.c);
  assert.match(a.minis[1].src,/v=2&editar=1/);
});
test('alterar uma cartela atualiza apenas sua prévia; mudar a campanha atualiza ambas',()=>{
  const a=ambiente();a.minis[1].dataset.visivel='true';vm.runInContext('atualizarMiniaturas()',a.c);
  const anterior=a.minis[1].src;
  a.op.pedido.revision=3;a.op.pedido.dados.produtos[0].edicao='{"titulo":{"x":2}}';
  vm.runInContext('atualizarMiniaturas()',a.c);
  assert.match(a.minis[0].src,/v=3/);assert.equal(a.minis[1].src,anterior);
  a.op.pedido.revision=4;a.op.pedido.dados.validade='Amanhã';vm.runInContext('atualizarMiniaturas()',a.c);
  assert.match(a.minis[0].src,/v=4/);assert.match(a.minis[1].src,/v=4/);
});
test('setas da faixa respeitam seus limites',()=>{
  const a=ambiente();vm.runInContext('atualizarSetasFaixa()',a.c);
  assert.equal(a.campos['faixa-anterior'].disabled,true);assert.equal(a.campos['faixa-proxima'].disabled,false);
  a.nav.scrollLeft=300;vm.runInContext('atualizarSetasFaixa()',a.c);
  assert.equal(a.campos['faixa-anterior'].disabled,false);assert.equal(a.campos['faixa-proxima'].disabled,true);
});
