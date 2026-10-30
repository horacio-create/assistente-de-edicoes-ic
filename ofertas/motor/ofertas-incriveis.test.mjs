import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validarTemplate,dadosPadrao,prepararDados,esquema} from './contrato.mjs';
const dir=fileURLToPath(new URL('../templates/uniforca-ofertas-incriveis-flexivel',import.meta.url));
test('Ofertas Incríveis: data editável, editor completo e saída HD',()=>{
 const {template,erros}=validarTemplate(dir);assert.deepEqual(erros,[]);
 const schema=esquema(template);assert.equal(schema.editorCartelas,true);assert.deepEqual([schema.saida.largura,schema.saida.altura],[1280,720]);
 const dados=dadosPadrao(template);assert.equal(dados.produtos.length,2);assert.equal(dados.validade,'29 de outubro a 05 de novembro de 2026');
 assert.match(template.html,/Ofertas válidas para os dias/);assert.doesNotMatch(template.html,/enquanto durarem os estoques/);
 for(const file of ['edicao.js','layout.js','selos.js','selos.css','animacao.js'])assert.equal(readFileSync(dir+'/assets/'+file,'utf8'),readFileSync(fileURLToPath(new URL('../templates/uniforca-sadia-flexivel/assets/'+file,import.meta.url)),'utf8'));
});
test('Ofertas Incríveis: 1, 2, 3 e 30 produtos, títulos longos, animações e ajustes',()=>{
 const {template}=validarTemplate(dir),padrao=dadosPadrao(template);
 for(const total of [1,2,3,5,30])for(const animacoes of [true,false]){
  const dados=structuredClone(padrao);dados.animacoes=animacoes;dados.ultimacartela='tres';dados.validade='30 de outubro a 02 de novembro de 2026';
  dados.produtos=Array.from({length:total},(_,i)=>({...padrao.produtos[i%2]}));
  dados.produtos[0].nome='Produto de exemplo '.repeat(8).slice(0,150);
  dados.produtos[0].edicao=JSON.stringify({elementos:{seta:{x:4,y:2,escala:.9},titulo:{x:0,y:3,escala:1}}});
  const pronto=prepararDados(template,dados,dir);assert.deepEqual(pronto.erros,[]);assert.equal(pronto.variaveis.produtos_total,total);
  assert.equal(pronto.variaveis.validade,dados.validade);assert.equal(pronto.variaveis.produtos_1_edicao,dados.produtos[0].edicao);
 }
});
