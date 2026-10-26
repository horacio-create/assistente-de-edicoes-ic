const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const codigo=fs.readFileSync(path.join(root,'ofertas/templates/uniforca-hora-da-feira-flexivel/assets/edicao.js'),'utf8');
const funcao=codigo.slice(codigo.indexOf('function padronizar(c)'),codigo.indexOf('function navegar(n)'));

function ambiente(posicao,parte='de-unidade'){
 const paineis=Array.from({length:3},()=>({style:{cssText:'',setProperty(){}},getBoundingClientRect:()=>({left:0,top:0,right:1000,bottom:600,width:1000,height:600})}));
 const produtos=Array.from({length:6},(_,i)=>{
  const unidade={dataset:{editavel:parte},ajuste:{x:i,y:2,escala:i===0?1.4:1}};
  const normal={ajuste:{x:40,y:50,escala:1}};
  const p={dataset:{numeroProduto:String(i+1)},querySelector:q=>q.includes(parte)?unidade:normal,closest:()=>paineis[Math.floor(i/2)]};
  unidade.closest=()=>paineis[Math.floor(i/2)];return p;
 });
 const context={produtos,paineis,transformacao:n=>n.ajuste,escrever:(n,a)=>n.ajuste=a,herdada:()=>1,limitesVisuais:()=>({left:100,top:100,right:130,bottom:118,width:30,height:18})};
 vm.runInNewContext(funcao+';padronizar({parte:'+JSON.stringify(parte)+',origem:1,cartelas:[0,2],posicao:'+posicao+'})',context);
 return produtos;
}
test('padronizar unidade altera apenas a escala nas cartelas escolhidas',()=>{
 const p=ambiente(false);
 for(const i of [0,1,4,5])assert.equal(p[i].querySelector('de-unidade').ajuste.escala,1.4);
 for(const i of [2,3])assert.equal(p[i].querySelector('de-unidade').ajuste.escala,1);
 assert.equal(p[5].querySelector('de-unidade').ajuste.x,5);
 for(const produto of p)assert.deepEqual(produto.querySelector('normal').ajuste,{x:40,y:50,escala:1});
});
test('copiar posição é opcional e mantém a unidade independente do preço',()=>{
 const p=ambiente(true);
 assert.equal(p[5].querySelector('de-unidade').ajuste.x,0);
 assert.equal(p[5].querySelector('de-unidade').ajuste.y,2);
 assert.equal(p[3].querySelector('de-unidade').ajuste.x,3);
 const {limpar}=require('../ofertas/templates/uniforca-hora-da-feira-flexivel/assets/edicao.js');
 const ajuste={v:1,elementos:{'de-unidade':{x:3,y:4,escala:1.4}}};
 assert.deepEqual(limpar(JSON.stringify(ajuste)),ajuste);
});

for(const posicao of [false,true])test('vírgula: tamanho e posição opcionais nas cartelas escolhidas ('+posicao+')',()=>{
 const p=ambiente(posicao,'clube-virgula');
 for(const i of [0,1,4,5]){
  const ajuste=p[i].querySelector('clube-virgula').ajuste;
  assert.equal(ajuste.escala,1.4);assert.equal(ajuste.x,posicao?0:i);
 }
 for(const i of [2,3])assert.equal(p[i].querySelector('clube-virgula').ajuste.escala,1);
 for(const produto of p)assert.deepEqual(produto.querySelector('normal').ajuste,{x:40,y:50,escala:1});
});
