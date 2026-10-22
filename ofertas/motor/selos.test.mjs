import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {validarTemplate, dadosPadrao, prepararDados} from './contrato.mjs';

const temas = ['uniforca-hora-da-carne-flexivel', 'uniforca-hora-da-feira-flexivel', 'uniforca-momento-do-bebe-flexivel'];
const assets = tema => new URL(`../templates/${tema}/assets/`, import.meta.url);
const codigo = readFileSync(new URL('selos.js', assets(temas[2])), 'utf8');
const ctx = {window:{}};
vm.runInNewContext(codigo, ctx);
const selos = ctx.window.SelosOfertas;

test('padrão do template, escolha do projeto e exceção por produto têm precedência definida', () => {
  assert.equal(selos.resolver('padrao', 'padrao', 'vermelho'), 'vermelho');
  assert.equal(selos.resolver('amarelo', 'padrao', 'vermelho'), 'amarelo');
  assert.equal(selos.resolver('amarelo', 'vermelho', 'amarelo'), 'vermelho');
  assert.equal(selos.resolver(undefined, undefined, 'amarelo'), 'amarelo');
});

test('os três templates cumprem o contrato e reutilizam o mesmo componente', () => {
  for (const tema of temas) {
    assert.equal(readFileSync(new URL('selos.js', assets(tema)), 'utf8'), codigo);
    const {erros, template:t} = validarTemplate(fileURLToPath(new URL(`../templates/${tema}`, import.meta.url)));
    assert.deepEqual(erros, []);
    assert.equal(t.meta.seloPadrao, tema.includes('bebe') ? 'vermelho' : 'amarelo');
    const dados = dadosPadrao(t);
    dados.estiloselo = 'vermelho';
    dados.produtos[0].estiloselo = 'amarelo';
    const ajuste = JSON.stringify({elementos:{produto:{x:12,y:-3,escala:1.1}}});
    dados.produtos[0].edicao = ajuste;
    const pronto = prepararDados(t, dados, t.dir);
    assert.deepEqual(pronto.erros, []);
    assert.equal(pronto.variaveis.estiloselo, 'vermelho');
    assert.equal(pronto.variaveis.produtos_1_estiloselo, 'amarelo');
    assert.equal(pronto.variaveis.produtos_1_edicao, ajuste);
    assert.equal(pronto.variaveis.produtos_1_por, dados.produtos[0].por);
  }
});

test('pedidos antigos sem campos de selo continuam válidos', () => {
  for (const tema of temas) {
    const {template:t} = validarTemplate(fileURLToPath(new URL(`../templates/${tema}`, import.meta.url)));
    const dados = dadosPadrao(t);
    delete dados.estiloselo;
    dados.produtos.forEach(p => delete p.estiloselo);
    assert.deepEqual(prepararDados(t, dados, t.dir).erros, []);
  }
});

test('estilos desconhecidos não entram na exportação', () => {
  const {template:t} = validarTemplate(fileURLToPath(new URL(`../templates/${temas[2]}`, import.meta.url)));
  const dados = dadosPadrao(t);
  dados.estiloselo = 'inexistente';
  assert.ok(prepararDados(t, dados, t.dir).erros.length > 0);
});
