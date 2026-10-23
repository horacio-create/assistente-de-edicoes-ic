const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {limpar}=require('../ofertas/templates/uniforca-hora-da-carne-flexivel/assets/edicao.js');
test('ajustes antigos, vazios ou quebrados têm uma recuperação segura',()=>{
  for(const v of [null,undefined,'','{invalido','{}'])assert.deepEqual(limpar(v),{v:1,elementos:{}});
});
test('caracteres, imagem e título mantêm ajustes independentes, inclusive após serialização',()=>{
  const a={v:1,elementos:{produto:{x:12,y:-8,escala:1.1},titulo:{x:0,y:5,escala:.9},'clube-int-0':{x:2,y:3,escala:1.05},'clube-virgula':{x:4,y:5,escala:1.05}}};
  assert.deepEqual(limpar(JSON.stringify(a)),a);
  const b=limpar(a);b.elementos.produto.x=99;assert.equal(a.elementos.produto.x,12);
});
test('ajustes não executam conteúdo e limitam valores não finitos ou extremos',()=>{
  const r=limpar({elementos:{'<script>':{x:1,y:2,escala:1},produto:{x:Infinity,y:-9000,escala:99}}});
  assert.equal(Object.keys(r.elementos).length,1);assert.deepEqual(r.elementos.produto,{x:0,y:-1080,escala:4});
});
test('o motor entrega para a exportação os mesmos ajustes salvos no pedido',async()=>{
  const {validarTemplate,dadosPadrao,prepararDados,esquema}=await import('../ofertas/motor/contrato.mjs');
  const dir=path.resolve(__dirname,'../ofertas/templates/uniforca-hora-da-carne-flexivel');
  const {template,erros}=validarTemplate(dir);assert.deepEqual(erros,[]);assert.equal(esquema(template).editorCartelas,true);
  const dados=dadosPadrao(template),ajuste=JSON.stringify({v:1,elementos:{'clube-int-0':{x:8,y:4,escala:1.15}}});
  dados.produtos[0].edicao=ajuste;
  const r=prepararDados(template,dados,dir);assert.deepEqual(r.erros,[]);assert.equal(r.variaveis.produtos_1_edicao,ajuste);
  dados.produtos[0].edicao='{"elementos":{"produto":{"x":0,"y":0,"escala":900}}}';
  assert.ok(prepararDados(template,dados,dir).erros.some(e=>e.includes('ajustes visuais inválidos')));
  delete dados.produtos[0].edicao;assert.deepEqual(prepararDados(template,dados,dir).erros,[]);
});


test('seleção e limites usam o texto visível, preservando blocos e textos vazios',()=>{
  const {limitesVisuais}=require('../ofertas/templates/uniforca-hora-da-carne-flexivel/assets/edicao.js');
  const caixa={left:0,top:10,right:600,bottom:50,width:600,height:40};
  let texto={left:230,top:15,right:370,bottom:45,width:140,height:30};
  const no={dataset:{editavel:'titulo'},getBoundingClientRect:()=>caixa,ownerDocument:{createRange:()=>({selectNodeContents:n=>assert.equal(n,no),getBoundingClientRect:()=>texto})}};
  for(const id of ['titulo','selo-titulo','de-unidade','clube-moeda']){no.dataset.editavel=id;assert.equal(limitesVisuais(no),texto);}
  for(const id of ['produto','selo','precos','clube-int-0']){no.dataset.editavel=id;assert.equal(limitesVisuais(no),caixa);}
  no.dataset.editavel='titulo';texto={width:0,height:0};assert.equal(limitesVisuais(no),caixa);
});
