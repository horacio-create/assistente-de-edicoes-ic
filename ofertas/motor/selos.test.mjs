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

test('cores do nome e do preço normal: escolha do projeto sobrepõe a arte; vazio mantém a arte', () => {
  const head = {filhos: [], appendChild(e) { this.filhos.push(e); }};
  const doc = {head, addEventListener() {}, getElementById: id => head.filhos.find(e => e.id === id && !e.removido) || null,
    createElement: () => ({remove() { this.removido = true; }})};
  const c = {window: {}, document: doc};
  vm.runInNewContext(codigo, c);
  c.window.SelosOfertas.cores({cornome: '#111111', corpreco: '#222222'});
  const css = doc.getElementById('cores-projeto').textContent;
  assert.match(css, /\.produto \.nome\{color:#111111!important\}/);
  assert.match(css, /\.produto \.de \.int,[^{]*\{color:#222222!important\}/);
  c.window.SelosOfertas.cores({cornome: 'vermelho', corpreco: ''});
  assert.equal(doc.getElementById('cores-projeto'), null);
  for (const tema of temas) {
    const {template:t} = validarTemplate(fileURLToPath(new URL(`../templates/${tema}`, import.meta.url)));
    const dados = dadosPadrao(t);
    assert.equal(dados.cornome, '');
    dados.cornome = '#000000'; dados.corpreco = '#1a1a1a';
    const pronto = prepararDados(t, dados, t.dir);
    assert.deepEqual(pronto.erros, []);
    assert.equal(pronto.variaveis.cornome, '#000000');
    dados.cornome = 'preto';
    assert.ok(prepararDados(t, dados, t.dir).erros.length > 0);
  }
});
