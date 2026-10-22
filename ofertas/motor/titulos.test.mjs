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
