const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {caixaImagem,limitesVisuais,limpar}=require('../ofertas/templates/uniforca-hora-da-feira-flexivel/assets/edicao.js');

test('produto horizontal usa a imagem visível em vez de toda a coluna',()=>{
 const r=caixaImagem({left:20,top:40,width:400,height:600},400,200);
 assert.deepEqual(r,{left:20,top:240,right:420,bottom:440,width:400,height:200});
 // A coluna permite só 98% de sua altura; a foto pode crescer até quase 3x.
 assert.ok((600-16)/r.height>2.9);
});
test('margens transparentes não impedem ampliar, mover ou alinhar o produto',()=>{
 const rect={left:0,top:0,width:400,height:400};
 assert.deepEqual(caixaImagem(rect,400,400,{x0:.25,y0:.4,x1:.75,y1:.6}),
  {left:100,top:160,right:300,bottom:240,width:200,height:80});
 const img={naturalWidth:400,naturalHeight:200,currentSrc:'foto.png',style:{objectPosition:'center top'},
  getBoundingClientRect:()=>rect,ownerDocument:{createElement(){throw Error('sem canvas');}}};
 const produto={dataset:{editavel:'produto'},getBoundingClientRect:()=>rect,querySelector:()=>img};
 assert.deepEqual(limitesVisuais(produto),{left:0,top:0,right:400,bottom:200,width:400,height:200});
});
test('salvar e exportar conservam ampliação de 1200% apenas para as imagens',async()=>{
 const {validarTemplate,dadosPadrao,prepararDados}=await import('../ofertas/motor/contrato.mjs');
 const dir=path.resolve(__dirname,'../ofertas/templates/uniforca-hora-da-feira-flexivel');
 const {template}=validarTemplate(dir),dados=dadosPadrao(template);
 const ajustes={elementos:{produto:{x:200,y:-60,escala:12},titulo:{x:0,y:0,escala:1}}};
 assert.equal(limpar(ajustes).elementos.produto.escala,12);
 dados.produtos[0].edicao=JSON.stringify(ajustes);
 let r=prepararDados(template,dados,dir);assert.deepEqual(r.erros,[]);
 assert.equal(r.variaveis.produtos_1_edicao,dados.produtos[0].edicao);
 ajustes.elementos.produto.escala=12.01;dados.produtos[0].edicao=JSON.stringify(ajustes);
 assert.ok(prepararDados(template,dados,dir).erros.length);
 ajustes.elementos.produto.escala=1;ajustes.elementos.titulo.escala=4.01;dados.produtos[0].edicao=JSON.stringify(ajustes);
 assert.ok(prepararDados(template,dados,dir).erros.length);
});
