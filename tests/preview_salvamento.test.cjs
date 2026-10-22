const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const fonte=fs.readFileSync(require.resolve('../static/ofertas-editor.js'),'utf8');
const metodo=fonte.slice(fonte.indexOf('  atualizar(options){'),fonte.indexOf('  irParaCartela(numero){'));
test('trocar a distribuição aguarda salvar e então recarrega a revisão correta',()=>{
  const iframe={src:'revisao-2'},c=vm.createContext({op:{pedido:{id:'teste',revision:2}},iframe,assinatura:'pares',recarregarConteudo:true,pronto:false,cartela:1,selecionados:[],crypto:{randomUUID:()=> 'nova'},encodeURIComponent,cancelarPadronizacao(){},inline:false});
  vm.runInContext(`const editor={${metodo}};`,c);
  vm.runInContext("editor.atualizar({pedido:{id:'teste',revision:2},conteudo:'trio',salvo:false})",c);assert.equal(iframe.src,'revisao-2');assert.equal(vm.runInContext('assinatura',c),'pares');
  vm.runInContext("editor.atualizar({pedido:{id:'teste',revision:3},conteudo:'trio',salvo:true})",c);assert.match(iframe.src,/v=3&editar=1/);assert.equal(vm.runInContext('assinatura',c),'trio');
});
test('salvar só o posicionamento não recarrega o canvas nem perde o histórico',()=>{
  const iframe={src:'revisao-2'},c=vm.createContext({op:{pedido:{id:'teste',revision:2}},iframe,assinatura:'pares',recarregarConteudo:false,pronto:true,inline:false});vm.runInContext(`const editor={${metodo}};`,c);
  vm.runInContext("editor.atualizar({pedido:{id:'teste',revision:3},conteudo:'pares',salvo:true})",c);assert.equal(iframe.src,'revisao-2');
});
