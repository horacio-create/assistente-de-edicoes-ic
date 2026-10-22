/* Mesma regra do Encarte Studio: faixas de título, imagem e preço,
   escala comum dos preços e margens proporcionais ao quadro. */
(function (global) {
  function distribuir(altura, titulo, preco, animacoes) {
    const margem = Math.max(16, altura * .035);
    const intervalo = animacoes ? 38 : 18;
    const sobreposicaoSelo = 24;
    const topoTitulo = margem;
    const topoImagem = topoTitulo + titulo + intervalo;
    const topoPreco = altura - margem - preco;
    return {topoTitulo, topoImagem, topoPreco,
      alturaImagem: Math.max(1, topoPreco + sobreposicaoSelo - topoImagem)};
  }

  function organizarVertical(produtos, animacoes) {
    // Todos os títulos do pedido usam a mesma fonte. A largura acompanha a coluna.
    let fonte = 30;
    produtos.forEach(p => {
      p.style.width = p.parentElement.clientWidth + 'px';
      p.style.transform = 'none';
      const nome = p.querySelector('.nome');
      const largura = Math.min(620, p.clientWidth - 64);
      nome.style.cssText = `left:${(p.clientWidth-largura)/2}px;width:${largura}px;right:auto;top:0;text-wrap:balance;overflow-wrap:anywhere`;
    });
    const cabeEmDuasLinhas = () => {
      produtos.forEach(p => { p.querySelector('.nome').style.fontSize = fonte + 'px'; });
      return produtos.every(p => p.querySelector('.nome').offsetHeight <= fonte * 1.12 * 2 + 2);
    };
    while (!cabeEmDuasLinhas() && fonte > 26) fonte--;
    // Textos excepcionalmente extensos ganham mais linhas; nunca são cortados.
    const titulo = Math.max(...produtos.map(p => p.querySelector('.nome').offsetHeight));
    let escalaPreco = 1;
    produtos.forEach(p => {
      const de = p.querySelector('.de');
      const largura = (de ? de.offsetWidth + 24 : 0) + 229;
      p.dataset.larguraPrecos = largura;
      escalaPreco = Math.min(escalaPreco, (p.clientWidth - 64) / largura);
    });
    produtos.forEach(p => {
      const altura = p.clientHeight;
      const faixa = distribuir(altura, titulo, 175 * escalaPreco, animacoes);
      const nome = p.querySelector('.nome');
      nome.style.top = faixa.topoTitulo + titulo - nome.offsetHeight + 'px';
      const foto = p.querySelector('.foto-box');
      const larguraFoto = Math.min(620, p.clientWidth - 80);
      Object.assign(foto.style, {left:(p.clientWidth-larguraFoto)/2+'px',
        top:faixa.topoImagem+'px', width:larguraFoto+'px', height:faixa.alturaImagem+'px'});
      foto.style.alignItems = 'flex-start';
      p.querySelector('.foto').style.objectPosition = 'center top';
      const precos = p.querySelector('.precos');
      const largura = Number(p.dataset.larguraPrecos);
      Object.assign(precos.style, {position:'absolute', width:largura+'px', height:'175px',
        top:faixa.topoPreco+'px', left:(p.clientWidth-largura*escalaPreco)/2+'px',
        transform:`scale(${escalaPreco})`, transformOrigin:'left top'});
      const selo = p.querySelector('.selo');
      Object.assign(selo.style, {left:largura-229+'px', top:'0px'});
      const de = p.querySelector('.de');
      if (de) {
        Object.assign(de.style, {left:'0px',right:'auto',top:'55px'});
        Object.assign(p.querySelector('.seta').style, {left:largura-277+'px',top:'139px'});
      }
    });
  }
  // Uma oferta ocupa duas áreas vizinhas: fotografia e informações.
  // O produto sozinho conserva a largura do par, centralizado no quadro.
  function geometriaLateral(largura, altura) {
    const larguraUtil = Math.min(920, largura);
    const margem = 24;
    const intervalo = 28;
    const fotoLargura = (larguraUtil - 2 * margem - intervalo) * .5;
    const inicio = (largura - larguraUtil) / 2 + margem;
    return {fotoEsquerda:inicio, fotoLargura, fotoTopo:32,
      fotoAltura:Math.max(1,altura-64),
      textoEsquerda:inicio+fotoLargura+intervalo, textoLargura:fotoLargura};
  }

  function organizar(produtos, animacoes) {
    let fonte = 30;
    const alturaSelo = Math.max(...produtos.map(p => p.querySelector(".selo").offsetHeight));
    const medidas = new Map();
    produtos.forEach(p => {
      p.style.width = p.parentElement.clientWidth + 'px';
      p.style.transform = 'none';
      const m = geometriaLateral(p.clientWidth, p.clientHeight);
      medidas.set(p,m);
      const nome = p.querySelector('.nome');
      nome.style.cssText = `left:${m.textoEsquerda}px;width:${m.textoLargura}px;right:auto;top:0;text-wrap:balance;overflow-wrap:anywhere`;
    });
    const cabeEmTresLinhas = () => {
      produtos.forEach(p => {p.querySelector('.nome').style.fontSize=fonte+'px';});
      return produtos.every(p => p.querySelector('.nome').offsetHeight <= fonte*1.12*3+2);
    };
    while (!cabeEmTresLinhas() && fonte>26) fonte--;
    const tituloAltura = Math.max(...produtos.map(p=>p.querySelector('.nome').offsetHeight));
    let escalaNormal = .8;
    let escalaSelo = 1.4;
    produtos.forEach(p => {
      const m = medidas.get(p), de = p.querySelector('.de');
      escalaSelo = Math.min(escalaSelo,(m.textoLargura-32)/229);
      if (de) escalaNormal = Math.min(escalaNormal,(m.textoLargura-24)/de.offsetWidth);
    });
    const normalAltura = Math.max(0,...produtos.map(p => (p.querySelector('.de')?.offsetHeight || 0)*escalaNormal));
    produtos.forEach(p => {
      // Reserva também a pequena expansão do selo nas animações.
      const margem = animacoes ? 32 : 24;
      escalaSelo = Math.min(escalaSelo,(p.clientHeight-2*margem-tituloAltura-16-normalAltura-18)/alturaSelo);
    });
    produtos.forEach(p => {
      const m = medidas.get(p);
      const alturaBloco = tituloAltura + 16 + normalAltura + 18 + alturaSelo*escalaSelo;
      const topo = (p.clientHeight-alturaBloco)/2;
      const nome = p.querySelector('.nome');
      nome.style.top = topo+tituloAltura-nome.offsetHeight+'px';
      const fotoBox = p.querySelector('.foto-box');
      Object.assign(fotoBox.style,{left:m.fotoEsquerda+'px',top:m.fotoTopo+'px',
        width:m.fotoLargura+'px',height:m.fotoAltura+'px',alignItems:'center'});
      p.querySelector('.foto').style.objectPosition='center center';
      const precos = p.querySelector('.precos');
      const largura = m.textoLargura/escalaSelo;
      const topoSelo = (normalAltura+18)/escalaSelo;
      Object.assign(precos.style,{position:'absolute',left:m.textoEsquerda+'px',
        top:topo+tituloAltura+16+'px',width:largura+'px',height:topoSelo+alturaSelo+'px',
        transform:`scale(${escalaSelo})`,transformOrigin:'left top'});
      Object.assign(p.querySelector('.selo').style,{left:(largura-229)/2+'px',top:topoSelo+'px'});
      const de=p.querySelector('.de');
      if (de) {
        const escala=escalaNormal/escalaSelo;
        Object.assign(de.style,{left:(largura-de.offsetWidth*escala)/2+'px',right:'auto',
          top:(normalAltura-de.offsetHeight*escalaNormal)/(2*escalaSelo)+'px',
          transform:`scale(${escala})`,transformOrigin:'left top'});
        const seta=p.querySelector('.seta');
        Object.assign(seta.style,{left:(largura-229)/2+14+'px',top:topoSelo-31+'px'});
        seta.querySelector('path').setAttribute('d','M42 3 C22 -1 11 8 8 25 M4 16 L8 26 L19 20');
      }
      p.dataset.distribuicao='lateral';
    });
  }
  global.LayoutOfertas = {distribuir, organizarVertical, geometriaLateral, organizar};
  if (typeof module !== 'undefined') module.exports = global.LayoutOfertas;
})(globalThis);
