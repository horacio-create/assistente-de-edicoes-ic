const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const fonte=fs.readFileSync(require('node:path').join(__dirname,'../static/ofertas-editor.js'),'utf8');
const funcoes=fonte.slice(fonte.indexOf('  let miniTimer='),fonte.indexOf('  function rotuloPrevia('));
function ambiente(){
  const op={pedido:{id:'pedido',revision:1,dados:{produtos:[{nome:'A'},{nome:'B'}]}}};
  const botoes=[{dataset:{}},{dataset:{}}];
  const minis=[0,1].map(n=>({dataset:{cartela:String(n)},closest:()=>botoes[n],getAttribute(k){return this[k];}}));
  const nav={scrollLeft:0,clientWidth:300,scrollWidth:600},campos={'faixa-anterior':{},'faixa-proxima':{}};
  let resposta={cartelas:[{url:'/0.jpg'},{url:'/1.jpg'}]},chamadas=0,agendadas=[];
  const c=vm.createContext({op,inline:true,clearTimeout(){},setTimeout(f){agendadas.push(f);return 1;},encodeURIComponent,fetch:async()=>{chamadas++;return {ok:true,json:async()=>resposta};},el:id=>campos[id],dialog:{querySelector:()=>nav,querySelectorAll:s=>s==='[data-mini-cartela]'?botoes:minis}});
  vm.runInContext(funcoes,c);
  return {c,op,minis,campos,nav,botoes,agendadas,set resposta(r){resposta=r;},get chamadas(){return chamadas;}};
}
test('miniaturas carregam JPEGs estáticos e não abrem editores adicionais',async()=>{
  const a=ambiente();await vm.runInContext('atualizarMiniaturas()',a.c);
  assert.equal(a.minis[0].src,'/0.jpg');assert.equal(a.minis[1].src,'/1.jpg');
  const renderMini=fonte.slice(fonte.indexOf('  function desenharMiniaturas(){'),fonte.indexOf('  let miniTimer='));
  assert.equal((fonte.match(/createElement\('iframe'\)/g)||[]).length,0);
});
test('mudança em uma cartela mantém URL da outra e não reinicia a imagem já carregada',async()=>{
  const a=ambiente();await vm.runInContext('atualizarMiniaturas()',a.c);let atribuicoes=0;
  Object.defineProperty(a.minis[1],'src',{get:()=>'/1.jpg',set(){atribuicoes++;}});
  a.resposta={cartelas:[{url:'/0-nova.jpg'},{url:'/1.jpg'}]};await vm.runInContext('atualizarMiniaturas()',a.c);
  assert.equal(a.minis[0].src,'/0-nova.jpg');assert.equal(atribuicoes,0);
});
test('miniaturas pendentes são consultadas novamente; erros não ficam em laço',async()=>{
  const a=ambiente();a.resposta={pendente:true,cartelas:[]};await vm.runInContext('atualizarMiniaturas()',a.c);assert.equal(a.agendadas.length,1);
  a.resposta={erro:'falhou',pendente:false};await vm.runInContext('atualizarMiniaturas()',a.c);assert.equal(a.agendadas.length,1);assert.equal(a.botoes[0].dataset.carregada,'erro');
});
test('setas da faixa respeitam seus limites',()=>{
  const a=ambiente();vm.runInContext('atualizarSetasFaixa()',a.c);assert.equal(a.campos['faixa-anterior'].disabled,true);assert.equal(a.campos['faixa-proxima'].disabled,false);
  a.nav.scrollLeft=300;vm.runInContext('atualizarSetasFaixa()',a.c);assert.equal(a.campos['faixa-anterior'].disabled,false);assert.equal(a.campos['faixa-proxima'].disabled,true);
});
