const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const fonte=fs.readFileSync(require('node:path').join(__dirname,'../static/ofertas.js'),'utf8');
const funcoes=fonte.slice(fonte.indexOf('function sincronizarPainelCartela('),fonte.indexOf('// ---------- escolha de imagem ----------'));
const grupos=fonte.slice(fonte.indexOf('const passoDe ='),fonte.indexOf('function aplicarValidacao'));
function ambiente(){
  const no=(dataset={})=>({dataset,hidden:false,parentElement:null,append(n){n.parentElement=this;}});
  const grupo=Array.from({length:3},(_,cartela)=>no({cartela:String(cartela)}));
  const cards=Array.from({length:7},(_,i)=>no({produto:String(i+1)}));
  const titulo={textContent:''},form=no();
  form.querySelector=()=>titulo;
  form.querySelectorAll=s=>s==='[data-cartela]'?grupo:s==='[data-produto]'?cards:[...grupo,...cards];
  const els={'formulario':form,'editor-unificado':no(),'editor-classico':no(),'player':no()};
  const dados=no(),preview=no(),montagens=[];
  const state={pedido:{id:'teste',revision:1,dados:{produtos:Array.from({length:7},()=>({nome:'Produto',edicao:'{}'})),ultimacartela:'tres'}},esquema:{editorCartelas:true, duracao:15}};
  const lista={id:'produtos',min:1,itens:30,grupo:{tamanho:2}};
  let salvamentos=0;
  const c=vm.createContext({state,el:id=>els[id],OfertasEdicao:{montar:opts=>{montagens.push(opts);return {dados,preview};}},listaPrincipal:()=>lista,urlImagem:v=>v,agendarSalvar:()=>salvamentos++,falha:()=>{},irParaVideos:()=>{}});
  vm.runInContext(grupos+funcoes,c);
  return {c,state,grupo,cards,titulo,montagens,salvamentos:()=>salvamentos};
}
test('painel mostra o mesmo produto da cartela selecionada, incluindo o trio final',()=>{
  const a=ambiente();
  vm.runInContext('sincronizarPainelCartela({cartela:1,produto:4})',a.c);
  assert.deepEqual(a.grupo.map(n=>n.hidden),[true,false,true]);
  assert.deepEqual(a.cards.filter(n=>!n.hidden).map(n=>n.dataset.produto),['4']);
  assert.equal(a.titulo.textContent,'Conteúdo · Produto 4');
  vm.runInContext('sincronizarPainelCartela({cartela:2,produto:7})',a.c);
  assert.deepEqual(a.cards.filter(n=>!n.hidden).map(n=>n.dataset.produto),['7']);
  vm.runInContext('sincronizarPainelCartela({cartela:2,produto:2})',a.c);
  assert.equal(a.state.contextoCartela.produto,5);
});
test('ajustes recebidos do canvas são salvos uma vez e não mudam a assinatura do conteúdo',()=>{
  const a=ambiente();vm.runInContext('montarEditorIntegrado()',a.c);
  const assinatura=a.montagens.at(-1).conteudo;
  const ajustes={'4':{v:1,elementos:{'clube-int-0':{x:2,y:0,escala:1.05}}}};
  a.montagens.at(-1).onAlterar(ajustes);
  a.montagens.at(-1).onAlterar(ajustes);
  assert.equal(a.salvamentos(),1);
  assert.equal(JSON.parse(a.state.pedido.dados.produtos[3].edicao).elementos['clube-int-0'].x,2);
  vm.runInContext('montarEditorIntegrado()',a.c);
  assert.equal(a.montagens.at(-1).conteudo,assinatura);
  a.state.pedido.dados.produtos[3].por='12,99';
  vm.runInContext('montarEditorIntegrado()',a.c);
  assert.notEqual(a.montagens.at(-1).conteudo,assinatura);
});
test('mensagens antigas não alteram outro pedido aberto',()=>{
  const a=ambiente();vm.runInContext('montarEditorIntegrado()',a.c);
  const anterior=a.montagens.at(-1);
  a.state.pedido={id:'outro',dados:{produtos:[{edicao:'{}'}]}};
  anterior.onAlterar({'1':{v:1,elementos:{titulo:{x:90,y:0,escala:1}}}});
  assert.equal(a.salvamentos(),0);assert.equal(a.state.pedido.dados.produtos[0].edicao,'{}');
});
