import '../../tests/preview_salvamento.test.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validarTemplate,dadosPadrao,prepararDados,esquema} from './contrato.mjs';
for(const [marca,quantidade] of [['sadia',2],['perdigao',1]]){
  const dir=fileURLToPath(new URL(`../templates/uniforca-${marca}-flexivel`,import.meta.url));
  test(`${marca}: contrato, data editável, fontes locais e editor completo`,()=>{
    const {template,erros}=validarTemplate(dir);assert.deepEqual(erros,[]);
    const schema=esquema(template);assert.equal(schema.editorCartelas,true);assert.equal(template.meta.seloPadrao,'vermelho');
    assert.equal(schema.saida.largura,1280);assert.equal(schema.saida.altura,720);
    const dados=dadosPadrao(template);assert.equal(dados.produtos.length,quantidade);
    assert.equal(dados.validade,'22 a 24 de setembro de 2026');
    assert.match(template.html,/id="validade-linha"/);assert.match(template.html,/enquanto durarem os estoques/);
    assert.ok(!JSON.stringify(dados).includes('Ã'));assert.match(template.html,/fonteData>18/);
    for(const parte of ['layout.js','edicao.js','selos.js','selos.css','animacao.js']){
      assert.equal(readFileSync(new URL(`../templates/uniforca-${marca}-flexivel/assets/${parte}`,import.meta.url),'utf8'),readFileSync(new URL(`../templates/uniforca-hora-da-carne-flexivel/assets/${parte}`,import.meta.url),'utf8'));
    }
  });
  test(`${marca}: 1, 2, 3 e 30 produtos, slides/animações e data longa preservam ajustes`,()=>{
    const {template}=validarTemplate(dir),padrao=dadosPadrao(template);
    for(const total of [1,2,3,5,30])for(const animacoes of [true,false]){
      const dados={...padrao,validade:'22 a 24 de novembro de 2026',animacoes,ultimacartela:'tres',produtos:Array.from({length:total},(_,i)=>({...padrao.produtos[i%padrao.produtos.length]}))};
      dados.produtos[0].edicao=JSON.stringify({v:1,elementos:{titulo:{x:4,y:0,escala:.95}}});
      dados.produtos[0].por='149,99';
      const r=prepararDados(template,dados,dir);assert.deepEqual(r.erros,[]);
      assert.equal(r.variaveis.produtos_total,total);assert.equal(r.variaveis.animacoes,animacoes);
      assert.equal(r.variaveis.validade,dados.validade);assert.equal(r.variaveis.produtos_1_edicao,dados.produtos[0].edicao);
    }
  });
}
