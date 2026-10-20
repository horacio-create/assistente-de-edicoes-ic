const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const id of ['uniforca-hora-da-carne', 'uniforca-hora-da-carne-flexivel']) {
  test(`${id}: preserva vírgula e centavos no selo e no preço normal`, () => {
    const html = fs.readFileSync(path.join(__dirname, '../ofertas/templates', id, 'index.html'), 'utf8');
    const contexto = {};
    vm.runInNewContext(html.slice(html.indexOf('function preencherPreco('), html.indexOf('function montarProduto(')), contexto);
    for (const preco of ['0,99', '3,99', '27,99', '99,99', '199,99', '1000,99']) {
      for (const selo of [true,false]) {
        const spans = Object.fromEntries(['.int','.cent','.un'].map(c=>[c,{textContent:''}]));
        const elemento = {innerHTML:'',dataset:{},querySelector:c=>spans[c]};
        contexto.preencherPreco(elemento, preco, '100g', selo);
        assert.equal(spans['.int'].textContent, preco.split(',')[0]);
        assert.equal(spans['.cent'].textContent, (selo?'':',') + '99');
        assert.equal(spans['.un'].textContent, '100g');
        assert.equal(elemento.dataset.inteiros, String(preco.split(',')[0].length));
        if(selo) assert.match(elemento.innerHTML,/class="virgula"[^>]*>,<\/span>/);
      }
    }
    assert.match(html, /viewBox="0 0 229 175"/);
    assert.match(html, /document\.fonts\.ready/);
    const referencia = JSON.parse(fs.readFileSync(path.join(__dirname, '../ofertas/referencias/selo-clube-contorno.json'), 'utf8'));
    assert.ok(html.includes(`d="${referencia.externo}"`), 'Contorno externo deve conservar a geometria medida da referência.');
    assert.ok(html.includes(`d="${referencia.amarelo}"`), 'Área amarela deve conservar a geometria medida da referência.');
  });
}
