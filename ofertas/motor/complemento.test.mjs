import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validarTemplate,dadosPadrao,prepararDados} from './contrato.mjs';

for(const id of ['hora-da-carne','hora-da-feira','momento-do-bebe','sadia','perdigao']) {
  test(`${id}: complemento opcional preserva os preços e os ajustes`,()=>{
    const dir=fileURLToPath(new URL(`../templates/uniforca-${id}-flexivel`,import.meta.url));
    const {template,erros}=validarTemplate(dir);assert.deepEqual(erros,[]);
    const dados=structuredClone(dadosPadrao(template));
    for(const p of dados.produtos)for(const k of ['equivalenciapreco','equivalenciaunidade','equivalenciatexto'])delete p[k];
    const antigo=prepararDados(template,dados,dir);assert.deepEqual(antigo.erros,[]);
    assert.equal(antigo.variaveis.produtos_1_equivalenciapreco,'');
    const p=dados.produtos[0];
    Object.assign(p,{por:'3,29',de:'3,79',unidade:'100g',equivalenciapreco:'32,90',equivalenciaunidade:'kg',equivalenciatexto:'No Clube de Desconto o preço do kg sai por:'});
    p.edicao=JSON.stringify({elementos:{'complemento-texto':{x:2,y:3,escala:1.1},'complemento-preco':{x:-1,y:0,escala:1}}});
    const r=prepararDados(template,dados,dir);assert.deepEqual(r.erros,[]);
    assert.equal(r.variaveis.produtos_1_equivalenciapreco,'32,90');
    assert.equal(r.variaveis.produtos_1_por,'3,29');
    assert.equal(r.variaveis.produtos_1_de,'3,79');
    assert.equal(r.variaveis.produtos_1_edicao,p.edicao);
    assert.equal(r.variaveis.produtos_2_equivalenciapreco,'');
    p.promopreco='4,99';p.promotexto='Nessa Promo 500g saem por:';
    p.edicao=JSON.stringify({elementos:{seta:{x:12,y:-5,escala:.9},'tag-promo':{x:-4,y:8,escala:1.1}}});
    const promo=prepararDados(template,dados,dir);assert.deepEqual(promo.erros,[]);
    assert.equal(promo.variaveis.produtos_1_promopreco,'4,99');
    assert.equal(promo.variaveis.produtos_1_promotexto,p.promotexto);
    assert.equal(promo.variaveis.produtos_1_edicao,p.edicao);
    assert.equal(promo.variaveis.produtos_2_promopreco,'');
    p.equivalenciapreco='incorreto';assert.ok(prepararDados(template,dados,dir).erros.length);
  });
}
