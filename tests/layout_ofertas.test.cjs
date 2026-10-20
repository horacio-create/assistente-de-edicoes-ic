const test = require('node:test');
const assert = require('node:assert/strict');
const {distribuir, organizarVertical, geometriaLateral, organizar} = require('../ofertas/templates/uniforca-hora-da-carne-flexivel/assets/layout.js');

test('título de uma, duas ou três linhas reserva a própria altura sem invadir a imagem', () => {
  for (const altura of [420, 524, 640, 800])
    for (const titulo of [36, 72, 108])
      for (const animacoes of [true, false]) {
        const faixa = distribuir(altura, titulo, 175, animacoes);
        assert.ok(faixa.topoImagem >= faixa.topoTitulo + titulo + 18);
        assert.ok(faixa.alturaImagem > 0);
        assert.ok(faixa.topoPreco + 175 <= altura - 14);
        // A imagem termina no selo, sem chegar ao número preto (55px abaixo).
        assert.ok(faixa.topoImagem + faixa.alturaImagem < faixa.topoPreco + 55);
        if (animacoes) assert.ok(faixa.topoImagem - 18 > faixa.topoTitulo + titulo);
      }
});

test('crescer a área branca aumenta a imagem, preservando títulos e preços', () => {
  const a = distribuir(524, 72, 175, false);
  const b = distribuir(724, 72, 175, false);
  assert.ok(b.alturaImagem > a.alturaImagem + 180);
  assert.ok(Math.abs((b.topoPreco - a.topoPreco) - 200) < 8);
});

test('um título excepcionalmente longo reduz a fonte de todos por igual e preserva suas linhas', () => {
  function produto(longo) {
    const nome = {style:{},get offsetHeight() {
      return Number(this.style.fontSize?.replace('px','') || 30) * 1.12 * (longo ? 3 : 1);
    }};
    const elementos = {'.nome':nome,'.foto-box':{style:{}},'.foto':{style:{}},
      '.precos':{style:{}},'.selo':{style:{}},'.de':null};
    return {style:{},dataset:{},parentElement:{clientWidth:613},clientWidth:613,
      clientHeight:524,querySelector:s => elementos[s]};
  }
  const produtos = [produto(true),produto(false),produto(false)];
  organizarVertical(produtos,false);
  assert.deepEqual(produtos.map(p => p.querySelector('.nome').style.fontSize), ['26px','26px','26px']);
  for (const p of produtos) {
    const foto = p.querySelector('.foto-box').style;
    assert.ok(Number(foto.top.replace('px','')) > 3*26*1.12);
    assert.ok(Number(foto.height.replace('px','')) > 0);
  }
});

test('distribuição lateral separa fotografia e informações em cartelas de um, dois ou três', () => {
  for (const largura of [613,920,1840]) {
    const m = geometriaLateral(largura,524);
    assert.ok(m.fotoEsquerda >= 24);
    assert.ok(m.textoEsquerda >= m.fotoEsquerda+m.fotoLargura+28);
    assert.ok(m.textoEsquerda+m.textoLargura <= largura-24);
    assert.ok(m.fotoTopo >= 32);
    assert.ok(m.fotoTopo+m.fotoAltura <= 524-32);
  }
  const sozinho=geometriaLateral(1840,524),dupla=geometriaLateral(920,524);
  assert.equal(sozinho.fotoLargura,dupla.fotoLargura);
  assert.equal(sozinho.textoLargura,dupla.textoLargura);
});

test('layout lateral mantém o título acima dos preços e o selo dentro de cada oferta', () => {
  const numero = s => Number.parseFloat(s);
  function oferta(largura, caracteres, precoNormal) {
    const nome={style:{},get offsetHeight() {
      const larguraTexto=numero(/width:([\d.]+)px/.exec(this.style.cssText)[1]);
      const fonte=numero(this.style.fontSize);
      return Math.ceil(caracteres*fonte*.6/larguraTexto)*fonte*1.12;
    }};
    const elementos={'.nome':nome,'.foto-box':{style:{}},'.foto':{style:{}},
      '.precos':{style:{}},'.selo':{style:{}},
      '.de':precoNormal?{style:{},offsetWidth:precoNormal,offsetHeight:90}:null,
      '.seta':{style:{},querySelector:()=>({setAttribute(){}})}};
    return {style:{},dataset:{},parentElement:{clientWidth:largura},clientWidth:largura,
      clientHeight:524,querySelector:s=>elementos[s]};
  }
  for (const animacoes of [true,false]) {
    const ps=[oferta(920,60,260),oferta(920,20,0),oferta(613,45,400),oferta(1840,35,220)];
    organizar(ps,animacoes);
    assert.equal(new Set(ps.map(p=>p.querySelector('.nome').style.fontSize)).size,1);
    for (const p of ps) {
      const nome=p.querySelector('.nome'),foto=p.querySelector('.foto-box').style,
        precos=p.querySelector('.precos').style,selo=p.querySelector('.selo').style;
      const escala=numero(precos.transform.slice(6));
      assert.ok(escala>0);
      assert.ok(numero(nome.style.top)+nome.offsetHeight+15<=numero(precos.top));
      assert.ok(numero(foto.left)+numero(foto.width)+27<=numero(precos.left));
      assert.ok(numero(precos.top)+numero(precos.height)*escala<=524-24);
      assert.ok(numero(precos.left)+(numero(selo.left)+229)*escala<=p.clientWidth-24);
      assert.equal(p.dataset.distribuicao,'lateral');
    }
  }
});
