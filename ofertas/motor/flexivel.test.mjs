import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validarTemplate, prepararDados, dadosPadrao} from './contrato.mjs';

const dir = fileURLToPath(new URL('../templates/uniforca-hora-da-carne-flexivel', import.meta.url));
test('template flexível valida, aceita ímpares e mantém preferências', () => {
  const {template, erros} = validarTemplate(dir);
  assert.deepEqual(erros, []);
  for (const n of [1, 3, 5, 7, 29, 30]) {
    const dados = dadosPadrao(template);
    dados.produtos = Array.from({length:n}, (_,i) => ({...dados.produtos[i % 6]}));
    dados.animacoes = false;
    dados.ultimacartela = 'tres';
    const pronto = prepararDados(template, dados, dir);
    assert.deepEqual(pronto.erros, []);
    assert.equal(pronto.variaveis.produtos_total, n);
    assert.equal(pronto.variaveis.animacoes, false);
    assert.equal(pronto.variaveis.ultimacartela, 'tres');
  }
});
test('campos novos opcionais usam padrões para pedidos antigos', () => {
  const {template} = validarTemplate(dir);
  const dados = dadosPadrao(template);
  delete dados.animacoes;
  delete dados.ultimacartela;
  const pronto = prepararDados(template, dados, dir);
  assert.deepEqual(pronto.erros, []);
  assert.equal(pronto.variaveis.animacoes, true);
  assert.equal(pronto.variaveis.ultimacartela, 'sozinho');
});
