import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validarTemplate,dadosPadrao,prepararDados} from './contrato.mjs';
for(const id of ['hora-da-carne','hora-da-feira','momento-do-bebe','sadia','perdigao']) {
  test(`${id}: salvamento e exportação preservam a quebra manual do título`,()=>{
    const dir=fileURLToPath(new URL(`../templates/uniforca-${id}-flexivel`,import.meta.url));
    const {template,erros}=validarTemplate(dir);assert.deepEqual(erros,[]);
    const dados=JSON.parse(JSON.stringify(dadosPadrao(template)));
    dados.produtos[0].nome='Filé de Tilápia\nSadia Congelada 400g';
    for(const animacoes of [true,false]){
      dados.animacoes=animacoes;
      const r=prepararDados(template,dados,dir);assert.deepEqual(r.erros,[]);
      assert.equal(r.variaveis.produtos_1_nome,'Filé de Tilápia\nSadia Congelada 400g');
      dados.produtos[0].nome='Filé de Tilápia Sadia Congelada 400g';
      const automatico=prepararDados(template,dados,dir);assert.deepEqual(automatico.erros,[]);
      assert.equal(automatico.variaveis.produtos_1_nome.includes('\n'),false);
      dados.produtos[0].nome='Filé de Tilápia\nSadia Congelada 400g';
    }
  });
}

for(const id of ['hora-da-carne','hora-da-feira','momento-do-bebe','sadia','perdigao']) {
  test(`${id}: aceita título com 150 caracteres e recusa 151`,()=>{
    const dir=fileURLToPath(new URL(`../templates/uniforca-${id}-flexivel`,import.meta.url));
    const {template,erros}=validarTemplate(dir);assert.deepEqual(erros,[]);
    const dados=JSON.parse(JSON.stringify(dadosPadrao(template)));
    const titulo=('Produto Congelado Sabores '.repeat(7)).slice(0,150).trimEnd().padEnd(150,'X');
    dados.produtos[0].nome=titulo;
    const r=prepararDados(template,dados,dir);assert.deepEqual(r.erros,[]);assert.equal(r.variaveis.produtos_1_nome,titulo);
    dados.produtos[0].nome+='X';
    assert.ok(prepararDados(template,dados,dir).erros.some(e=>e.includes('máximo de 150')));
  });
}
