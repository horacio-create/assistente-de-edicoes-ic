'use strict';
// Zoom das prévias vetoriais (Vetorização M6S e Molduras): Alt + roda do mouse aproxima ou afasta no ponto do cursor,
// e a lupa no canto inferior direito tem −, 100% e +. Vai de 100% a 800%. Com zoom, a vista se move como a ferramenta Mão
// do Illustrator: segurando a barra de espaço e arrastando, arrastando com o botão do meio (roda) ou com Alt + arrastar.
const ZOOM_MAX = 8, ZOOM_PASSO = 1.25;

function criarZoom(svg, shell) {
 const z = {base: null, k: 1, cx: 0, cy: 0};
 const rotulo = document.createElement('button');
 const botao = (txt, titulo, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'zoom-btn'; b.textContent = txt; b.title = titulo; b.setAttribute('aria-label', titulo); b.onclick = fn; return b; };
 const caixa = document.createElement('div'); caixa.className = 'zoom-ctl';
 caixa.title = 'Zoom: Alt + roda do mouse. Para mover a vista: segure Espaço e arraste, ou arraste com o botão da roda.';
 const lupa = document.createElement('span'); lupa.className = 'zoom-lupa'; lupa.setAttribute('aria-hidden', 'true');
 lupa.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.3-4.3"/></svg>';
 rotulo.type = 'button'; rotulo.className = 'zoom-btn zoom-valor'; rotulo.title = 'Voltar a 100%'; rotulo.onclick = () => z.reset();
 caixa.append(lupa, botao('−', 'Diminuir zoom', () => z.zoom(1 / ZOOM_PASSO)), rotulo, botao('+', 'Aumentar zoom', () => z.zoom(ZOOM_PASSO)));
 shell.append(caixa);

 const limitar = (v, a, b) => Math.min(Math.max(v, a), b);
 function aplicar() {
  if (!z.base) return;
  const [x, y, w, h] = z.base, vw = w / z.k, vh = h / z.k;
  z.cx = limitar(z.cx, x + vw / 2, x + w - vw / 2); z.cy = limitar(z.cy, y + vh / 2, y + h - vh / 2);
  svg.setAttribute('viewBox', `${z.cx - vw / 2} ${z.cy - vh / 2} ${vw} ${vh}`);
  rotulo.textContent = Math.round(z.k * 100) + '%';
  caixa.querySelector('[aria-label="Diminuir zoom"]').disabled = z.k <= 1; caixa.querySelector('[aria-label="Aumentar zoom"]').disabled = z.k >= ZOOM_MAX;
  shell.classList.toggle('zoom-ativo', z.k > 1);
  svg.dispatchEvent(new CustomEvent('zoom'));
 }
 const ponto = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
 // Área de desenho: muda com o conteúdo; o zoom escolhido continua, só o centro é ajustado para não sair da área
 z.definir = (x, y, w, h) => { if (!z.base) { z.cx = x + w / 2; z.cy = y + h / 2; } z.base = [x, y, w, h]; aplicar(); };
 z.novo = () => { z.base = null; z.k = 1; };  // outro arquivo: começa sem zoom
 z.reset = () => { if (!z.base) return; z.k = 1; z.cx = z.base[0] + z.base[2] / 2; z.cy = z.base[1] + z.base[3] / 2; aplicar(); };
 z.zoom = (fator, p) => {
  if (!z.base) return;
  const novo = limitar(z.k * fator, 1, ZOOM_MAX); if (novo === z.k) return;
  p = p || {x: z.cx, y: z.cy};
  z.cx = p.x + (z.cx - p.x) * z.k / novo; z.cy = p.y + (z.cy - p.y) * z.k / novo; z.k = novo; aplicar();
 };
 // pixels de tela → unidades do desenho (para pontos de âncora de tamanho fixo na tela)
 z.px = n => { const m = svg.getScreenCTM(); return m && m.a ? n / m.a : n; };
 shell.addEventListener('wheel', e => { if (!e.altKey || !z.base) return; e.preventDefault(); z.zoom(e.deltaY < 0 ? ZOOM_PASSO : 1 / ZOOM_PASSO, ponto(e)); }, {passive: false});
 let arrasto = null, espaco = false, dentro = false;
 const digitando = () => document.activeElement?.closest?.('input,textarea,select,[contenteditable]');
 shell.addEventListener('pointerenter', () => { dentro = true; });
 shell.addEventListener('pointerleave', () => { dentro = false; });
 document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || !dentro || digitando() || !shell.offsetParent) return;
  e.preventDefault(); if (!espaco) { espaco = true; shell.classList.add('zoom-mao'); }
 });
 document.addEventListener('keyup', e => { if (e.code === 'Space' && espaco) { espaco = false; shell.classList.remove('zoom-mao'); } });
 window.addEventListener('blur', () => { espaco = false; shell.classList.remove('zoom-mao'); });
 // botão do meio: sem isso o navegador abre a rolagem automática
 svg.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
 svg.addEventListener('pointerdown', e => {
  const mao = espaco || e.button === 1 || (e.altKey && e.button === 0);
  if (!mao) return;
  e.preventDefault(); e.stopPropagation();
  if (z.k <= 1) return;
  try { svg.setPointerCapture(e.pointerId); } catch {} shell.classList.add('zoom-arrastando');
  arrasto = {x: e.clientX, y: e.clientY, cx: z.cx, cy: z.cy, escala: svg.getScreenCTM().a};
 }, true);
 svg.addEventListener('pointermove', e => {
  if (!arrasto) return; e.stopPropagation();
  z.cx = arrasto.cx - (e.clientX - arrasto.x) / arrasto.escala; z.cy = arrasto.cy - (e.clientY - arrasto.y) / arrasto.escala; aplicar();
 }, true);
 const soltar = e => { if (arrasto) { e.stopPropagation(); arrasto = null; shell.classList.remove('zoom-arrastando'); } };
 svg.addEventListener('pointerup', soltar, true); svg.addEventListener('pointercancel', soltar, true);
 return z;
}
