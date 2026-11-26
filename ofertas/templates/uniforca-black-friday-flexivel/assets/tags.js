/* Tags do produto (+18, marca, tamanhos), recortadas do encarte. Ficam dentro da caixa da foto, na
   lateral direita, e entram e saem junto com ela. Cada tag é um elemento da edição de cartelas
   ("tag-1"…"tag-4"): selecionar na cartela para mover e redimensionar, como o título e os preços. */
(function (global) {
  function preparar(p, campo, n) {
    const box = p.querySelector('.foto-box');
    if (!box) return;
    let ordem = 0;
    for (let k = 1; k <= 4; k++) {
      const src = String(campo(n, 'tag' + k) || '').trim();
      if (!src) continue;
      const nome = String(campo(n, 'tag' + k + 'nome') || '').trim() || 'Tag ' + k;
      const tag = document.createElement('div');
      tag.className = 'tag-produto';
      tag.dataset.tag = k;
      tag.dataset.nome = nome;
      // até 4 tags empilhadas no canto superior direito, sem cobrir o centro da foto
      tag.style.cssText = 'position:absolute;right:0;top:' + (ordem * 25) + '%;width:24%;height:23%;z-index:3;display:flex;align-items:center;justify-content:center';
      const img = document.createElement('img');
      img.src = src;
      img.alt = nome;
      img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
      tag.append(img);
      box.append(tag);
      ordem++;
    }
  }
  global.TagsOfertas = { preparar };
})(globalThis);
