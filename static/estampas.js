'use strict';
// Estampas de camisa (DTF): a arte do cliente em cada tamanho e local (frente, costas, mangas), no maior tamanho que cabe
// na área segura, alinhada pelo topo. A prévia mostra a camisa com LARGURA e ALTURA, a área tracejada e as artes.
// Um local pode ter várias estampas (ex.: duas logos no peito): cada uma com o seu tamanho e posição, sem se sobrepor;
// na exportação, cada lado vira um PDF só com o conjunto.

const EST_NS = 'http://www.w3.org/2000/svg';
const EST_CURTO = {'frente': 'Frente', 'costas': 'Costas', 'manga-esquerda': 'Manga esq.', 'manga-direita': 'Manga dir.'};
const EST_MAX_POR_LOCAL = 6, EST_FOLGA = .05;   // cm: duas estampas podem encostar, mas não se cruzar
let estCat = null, estMarcados = new Set(), estVista = {tipo: 'comum', tamanho: 'M', local: 'frente'}, estPlano = [], estPasta = null;
let estCor = 'branca', estArrasto = null;
// estampas aplicadas: {uid, local, arte, ajuste: {escala, x, y}} (x e y = fração do espaço livre na área)
let estPecas = [], estSel = null, estUid = 0;
const estChave = (tipo, tam) => tipo + ':' + tam;
const estCm = v => Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 2});
function estEl(tag, attrs = {}, ...kids) { const e = document.createElementNS(EST_NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); e.append(...kids.filter(Boolean)); return e; }
function estHtml(tag, props = {}, ...kids) {
 const e = document.createElement(tag);
 for (const [k, v] of Object.entries(props)) { if (k.startsWith('aria') || k.startsWith('data')) e.setAttribute(k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), v); else e[k] = v; }
 e.append(...kids.filter(c => c != null && c !== false)); return e;
}
function estTexto(x, y, txt, attrs = {}) { const t = estEl('text', {x, y, ...attrs}); t.textContent = txt; return t; }
const estTam = (tipo, tam) => estCat.tamanhos.find(t => t.tipo === tipo && t.tamanho === tam);
const estNome = (tipo, tam) => `${estCat.tipos[tipo]} ${tam}`;
const estDoLocal = local => estPecas.filter(p => p.local === local);
const estRotulo = p => { const l = estDoLocal(p.local); return estCat.locais[p.local] + (l.length > 1 ? ` ${l.indexOf(p) + 1}` : ''); };
// estampa selecionada no local da prévia (a primeira, se a seleção ficou em outro local)
function estAtual() { const l = estDoLocal(estVista.local); return l.find(p => p.uid === estSel) || l[0] || null; }
const estPecasApi = () => estPecas.map(p => ({local: p.local, arte: p.arte.id, ajuste: p.ajuste}));

async function estIniciar() {
 if (!estCat) {
  estCat = await request('/api/estampas/catalogo');
  estMarcados = new Set(estCat.tamanhos.map(t => estChave(t.tipo, t.tamanho)));   // por padrão, todos os tamanhos
 }
 estSync();
}

// ---------- cor da camisa ----------
const estCorHex = () => estCat.cores.find(c => c.id === estCor)?.hex || '#F5F2F3';
function estLum(hex) {
 const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
 return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
function estCores(caixa) {
 caixa.replaceChildren(...estCat.cores.map(c => estHtml('button', {type: 'button', role: 'radio', className: 'est-cor' + (c.id === estCor ? ' is-on' : ''),
  style: `--sw:${c.hex}`, title: c.nome, ariaLabel: c.nome, ariaChecked: String(c.id === estCor), onclick: () => { estCor = c.id; estSync(); estCores(caixa); }})));
 $('est-cor-nome').textContent = estCat.cores.find(c => c.id === estCor)?.nome || '';
}

// ---------- geometria: mesma conta do servidor ----------
// o maior encaixe na área, reduzido pela escala, posicionado pela fração do espaço livre
function estColocar(arte, aw, ah, a) {
 const wMax = Math.min(aw, ah * arte.proporcao), lw = wMax * a.escala, lh = lw / arte.proporcao;
 return {lw, lh, dx: (aw - lw) * a.x, dy: (ah - lh) * a.y, wMax};
}
// tamanhos em que a sobreposição é conferida: os marcados e o da prévia
function estTamanhosConferidos() {
 const l = estCat.tamanhos.filter(t => estMarcados.has(estChave(t.tipo, t.tamanho)));
 const v = estTam(estVista.tipo, estVista.tamanho); if (!l.includes(v)) l.push(v);
 return l;
}
// a estampa `p` com o ajuste `a` cabe sem cruzar as outras do mesmo local, em todos os tamanhos?
function estCabe(p, a, outras = estDoLocal(p.local).filter(o => o !== p)) {
 for (const t of estTamanhosConferidos()) {
  const [aw, ah] = t.locais[p.local].area, r = estColocar(p.arte, aw, ah, a);
  for (const o of outras) {
   const s = estColocar(o.arte, aw, ah, o.ajuste);
   if (Math.min(r.dx + r.lw, s.dx + s.lw) - Math.max(r.dx, s.dx) > EST_FOLGA && Math.min(r.dy + r.lh, s.dy + s.lh) - Math.max(r.dy, s.dy) > EST_FOLGA) return false;
  }
 }
 return true;
}
// lugar para uma estampa nova no local: o maior tamanho possível, tentando topo, centro e laterais
function estLugarLivre(local, arte) {
 const p = {local, arte}, outras = estDoLocal(local);
 if (!outras.length) return {escala: 1, x: .5, y: 0};
 const xs = [0, 1, .5, .25, .75], ys = [0, .5, 1, .25, .75];
 for (let e = .6; e >= .2 - 1e-9; e -= .05)
  for (const y of ys) for (const x of xs) { const a = {escala: +e.toFixed(2), x, y}; if (estCabe(p, a, outras)) return a; }
 return null;
}
function estSemEspaco(msg) { $('est-espaco-msg').textContent = msg; $('est-espaco-dialog').showModal(); }

// ---------- arrastar, redimensionar, medida em cm ----------
function estPonto(e) { const svg = $('est-svg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function estPegar(e, modo, p, g) {
 e.preventDefault(); e.stopPropagation();
 try { e.target.setPointerCapture(e.pointerId); } catch {}
 if (estSel !== p.uid) { estSel = p.uid; estListaArtes(); }
 estArrasto = {modo, p, g, inicio: estPonto(e), ajuste: {...p.ajuste}};
}
const estLimitar = (v, a, b) => Math.min(Math.max(v, a), b);
$('est-svg').addEventListener('pointermove', e => {
 if (!estArrasto) return;
 const {modo, p, g, inicio, ajuste} = estArrasto, pt = estPonto(e);
 const novo = {...ajuste};
 if (modo === 'mover') {
  const livreX = g.aw - g.lw, livreY = g.ah - g.lh;
  if (livreX > .01) {
   novo.x = estLimitar((g.dx + pt.x - inicio.x) / livreX, 0, 1);
   // snap: perto do meio (até 1 cm), a estampa gruda no centro horizontal; Alt solta o snap
   if (!e.altKey && Math.abs((novo.x - .5) * livreX) < 1) novo.x = .5;
  }
  if (livreY > .01) novo.y = estLimitar((g.dy + pt.y - inicio.y) / livreY, 0, 1);
 } else {
  const wMax = Math.min(g.aw, g.ah * p.arte.proporcao);
  novo.escala = estLimitar((g.lw + Math.max(pt.x - inicio.x, (pt.y - inicio.y) * p.arte.proporcao)) / wMax, .2, 1);
 }
 // nunca por cima de outra estampa: trava no último ponto livre
 if (!estCabe(p, novo)) return;
 p.ajuste = novo; estRender();
 if (modo === 'mover' && novo.x === .5) {
  // guia vertical no centro da área enquanto a estampa está grudada no meio
  const meio = g.ax + g.aw / 2;
  $('est-svg').append(estEl('line', {x1: meio, y1: g.ay - 1, x2: meio, y2: g.ay + g.ah + 1, stroke: '#ff2fa0', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '5 4', class: 'est-guia'}));
 }
});
const estSoltar = () => { if (estArrasto) { estArrasto = null; estRender(); estConferir(); } };
$('est-svg').addEventListener('pointerup', estSoltar); $('est-svg').addEventListener('pointercancel', estSoltar);
// muda o ajuste da estampa selecionada, se couber; `avisar` abre o pop-up quando não cabe
function estAjustar(patch, avisar = false) {
 const p = estAtual(); if (!p) return false;
 const novo = {...p.ajuste, ...patch};
 if (!estCabe(p, novo)) {
  if (avisar) estSemEspaco(`Nesse tamanho, ${estRotulo(p)} ficaria por cima de outra estampa. Diminua ou afaste uma delas, ou remova uma estampa deste lado.`);
  estRender(); return false;
 }
 p.ajuste = novo; estRender(); return true;
}
$('est-escala').oninput = () => estAjustar({escala: Number($('est-escala').value)});
$('est-escala').onchange = () => estConferir();
$('est-centro').onclick = () => { if (estAjustar({x: .5, y: .5}, true)) estConferir(); };
$('est-topo').onclick = () => { if (estAjustar({x: .5, y: 0}, true)) estConferir(); };
// medida digitada em cm (no tamanho da prévia): a proporção fica travada, a outra medida acompanha
function estMedida(campo) {
 const p = estAtual(); if (!p) return;
 const v = Number(String($(campo).value).replace(',', '.'));
 const t = estTam(estVista.tipo, estVista.tamanho), [aw, ah] = t.locais[p.local].area;
 const {wMax} = estColocar(p.arte, aw, ah, p.ajuste);
 if (!(v > 0)) { estRender(); return; }
 const larg = campo === 'est-larg' ? v : v * p.arte.proporcao;
 let escala = larg / wMax;
 if (escala > 1 + 1e-6) toast(`Nesta área cabe no máximo ${estCm(wMax)} × ${estCm(wMax / p.arte.proporcao)} cm.`);
 if (escala < .2 - 1e-6) toast(`O mínimo é ${estCm(wMax * .2)} cm de largura (20% da área).`);
 escala = estLimitar(escala, .2, 1);
 if (estAjustar({escala}, true)) estConferir();
}
for (const c of ['est-larg', 'est-alt']) {
 $(c).onchange = () => estMedida(c);
 $(c).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $(c).blur(); } };
}

// ---------- prévia ----------
function estRender() {
 const t = estTam(estVista.tipo, estVista.tamanho), [w, h] = t.camisa, loc = t.locais[estVista.local];
 const svg = $('est-svg'), m = w / 2;
 svg.setAttribute('viewBox', `${-w * .85} ${-4} ${w * 1.7} ${h + 9}`);
 const tinta = '#20203c', cor = estCorHex(), traco = estLum(cor) > .18 ? tinta : '#e6e6ee';
 // marcações (medidas e área segura): vermelho, ou a primeira cor que se destaca na camisa escolhida
 const contraste = (a, b) => { const [x, y] = [estLum(a), estLum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
 const vermelho = ['#d7192d', '#1f6fd1', '#20203c', '#ffffff'].find(c => contraste(c, cor) >= 2.4) || '#20203c';
 // desenho da equipe: a silhueta recebe a cor da camisa e as linhas vêm por cima, na cor que contrasta
 const fio = estEl('g', {}, estEl('path', {d: loc.contorno, fill: cor}),
  estEl('path', {d: loc.linhas, fill: 'none', stroke: traco, 'stroke-width': loc.espessura, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
 // linhas de medida, como no desenho de referência
 const yLarg = .3 * h, xAlt = -m * .78;   // linhas longe da área de estampa, para não cobrir a arte
 const medidas = estEl('g', {stroke: vermelho, 'stroke-width': .7, 'stroke-linecap': 'round'},
  estEl('line', {x1: -m, y1: yLarg, x2: m, y2: yLarg}), estEl('line', {x1: xAlt, y1: 0, x2: xAlt, y2: h}));
 const rotulos = estEl('g', {fill: traco, 'font-family': 'Arial, sans-serif', 'font-size': 1.7, 'font-weight': 700, stroke: cor, 'stroke-width': .5, 'paint-order': 'stroke'},
  estTexto(m - 1, yLarg + 2.6, `LARGURA ${estCm(w)} cm`, {'text-anchor': 'end'}),
  estTexto(xAlt - 1.2, h * .8, `ALTURA ${estCm(h)} cm`, {transform: `rotate(-90 ${xAlt - 1.2} ${h * .8})`}));
 const [ax, ay] = loc.posicao, [aw, ah] = loc.area;
 const area = estEl('rect', {x: ax, y: ay, width: aw, height: ah, fill: 'none', stroke: vermelho, 'stroke-width': .25, 'stroke-dasharray': '1 .7'});
 const camadas = [fio, medidas, area];
 const pecas = estDoLocal(estVista.local), sel = estAtual(), alca = Math.max(.9, w / 45);
 $('est-ajuste').hidden = !sel;
 // as não selecionadas primeiro; a selecionada por cima, com a alça de tamanho e o X de remover
 for (const p of [...pecas.filter(q => q !== sel), sel].filter(Boolean)) {
  const {lw, lh, dx, dy} = estColocar(p.arte, aw, ah, p.ajuste), x = ax + dx, y = ay + dy, g = {ax, ay, aw, ah, lw, lh, dx, dy};
  const img = estEl('image', {href: `/estampas/arte/${p.arte.id}`, x, y, width: lw, height: lh, preserveAspectRatio: 'xMidYMid meet', class: 'est-arte'});
  img.addEventListener('pointerdown', e => estPegar(e, 'mover', p, g));
  camadas.push(img);
  if (p !== sel) { camadas.push(estEl('rect', {x, y, width: lw, height: lh, fill: 'none', stroke: '#6967c9', 'stroke-width': .12, 'stroke-dasharray': '.5 .4', class: 'est-moldura est-outra'})); continue; }
  const canto = estEl('rect', {x: x + lw - alca / 2, y: y + lh - alca / 2, width: alca, height: alca, fill: '#fff', stroke: '#6967c9', 'stroke-width': .2, class: 'est-alca'});
  canto.addEventListener('pointerdown', e => estPegar(e, 'tamanho', p, g));
  const r = alca * .62, cx = x + lw, cy = y;
  const fechar = estEl('g', {class: 'est-remover', role: 'button', 'aria-label': `Remover ${estRotulo(p)}`},
   estEl('title', {}, `Remover ${estRotulo(p)}`),
   estEl('circle', {cx, cy, r, fill: '#fff', stroke: '#d7192d', 'stroke-width': .2}),
   estEl('path', {d: `M${cx - r * .42} ${cy - r * .42}L${cx + r * .42} ${cy + r * .42}M${cx + r * .42} ${cy - r * .42}L${cx - r * .42} ${cy + r * .42}`, stroke: '#d7192d', 'stroke-width': .22, 'stroke-linecap': 'round'}));
  fechar.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); estRemover(p); });
  camadas.push(estEl('rect', {x, y, width: lw, height: lh, fill: 'none', stroke: '#6967c9', 'stroke-width': .18, class: 'est-moldura'}), canto, fechar);
  $('est-escala').value = p.ajuste.escala; $('est-escala-v').textContent = Math.round(p.ajuste.escala * 100) + '%';
  for (const [c, v] of [['est-larg', lw], ['est-alt', lh]]) if (document.activeElement !== $(c)) $(c).value = Math.round(v * 100) / 100;
 }
 if (!sel) camadas.push(estTexto(ax + aw / 2, ay + ah / 2, 'Sem estampa', {'text-anchor': 'middle', fill: '#8a8aa0', 'font-family': 'Arial, sans-serif', 'font-size': 1.6}));
 $('est-medida-vazia').hidden = !!sel; $('est-medida-campos').hidden = !sel;
 if (sel) $('est-larg').closest('#est-medida-campos').querySelector('label').textContent = pecas.length > 1 ? estRotulo(sel) : 'Estampa';
 camadas.push(rotulos);
 svg.replaceChildren(...camadas);
 $('est-stats').textContent = `${estNome(estVista.tipo, estVista.tamanho)} · ${estCat.locais[estVista.local]} · área de estampa ${estCm(aw)} × ${estCm(ah)} cm${loc.confirmar ? ' (a confirmar)' : ''}`;
}

function estAbas() {
 $('est-locais-tabs').replaceChildren(...Object.entries(EST_CURTO).map(([local, nome]) => estHtml('button', {type: 'button', textContent: nome, ariaPressed: String(estVista.local === local),
  className: estDoLocal(local).length ? '' : 'est-vazio', onclick: () => { estVista.local = local; estSync(); }})));
 $('est-tamanho-tabs').replaceChildren(...estCat.tamanhos.map(t => estHtml('button', {type: 'button', textContent: (t.tipo === 'baby' ? 'Baby ' : '') + t.tamanho,
  className: 'est-chip' + (estVista.tipo === t.tipo && estVista.tamanho === t.tamanho ? ' is-on' : ''), ariaPressed: String(estVista.tipo === t.tipo && estVista.tamanho === t.tamanho),
  title: estNome(t.tipo, t.tamanho), onclick: () => { estVista.tipo = t.tipo; estVista.tamanho = t.tamanho; estSync(); }})));
}

// ---------- painel ----------
function estRemover(p) {
 estPecas = estPecas.filter(q => q !== p);
 if (estSel === p.uid) estSel = estDoLocal(p.local)[0]?.uid ?? null;
 estSync();
}
function estListaArtes() {
 const ordem = Object.keys(EST_CURTO);
 const lista = [...estPecas].sort((a, b) => ordem.indexOf(a.local) - ordem.indexOf(b.local));
 $('est-artes').replaceChildren(...lista.map(p => estHtml('li', {className: p.uid === estSel && p.local === estVista.local ? 'is-on' : '',
   onclick: e => { if (e.target.closest('button')) return; estSel = p.uid; estVista.local = p.local; estSync(); }},
  estHtml('img', {src: `/estampas/arte/${p.arte.id}`, alt: ''}),
  estHtml('div', {className: 'est-arte-info'}, estHtml('strong', {textContent: estRotulo(p)}), estHtml('small', {textContent: p.arte.nome})),
  estHtml('div', {className: 'est-arte-acoes'},
   estHtml('button', {type: 'button', className: 'text-button', textContent: 'Trocar', onclick: () => estEscolher(p)}),
   estHtml('button', {type: 'button', className: 'text-button', textContent: 'Remover', onclick: () => estRemover(p)})))));
}
function estListaTamanhos() {
 $('est-tamanhos').replaceChildren(...Object.entries(estCat.tipos).map(([tipo, nome]) => estHtml('fieldset', {},
  estHtml('legend', {textContent: nome}),
  ...estCat.tamanhos.filter(t => t.tipo === tipo).map(t => {
   const c = estHtml('input', {type: 'checkbox', checked: estMarcados.has(estChave(tipo, t.tamanho))});
   c.onchange = () => { c.checked ? estMarcados.add(estChave(tipo, t.tamanho)) : estMarcados.delete(estChave(tipo, t.tamanho)); estConferir(); estInfo(); };
   const conf = t.locais.frente.confirmar;
   return estHtml('label', {className: 'check', title: `Camisa ${estCm(t.camisa[0])} × ${estCm(t.camisa[1])} cm · área ${estCm(t.locais.frente.area[0])} × ${estCm(t.locais.frente.area[1])} cm`},
    c, `${t.tamanho}`, conf ? estHtml('small', {className: 'est-confirmar', textContent: 'a confirmar'}) : null);
  }))));
}
function estTamanhosMarcados() { return estCat.tamanhos.filter(t => estMarcados.has(estChave(t.tipo, t.tamanho))).map(t => [t.tipo, t.tamanho]); }
// um PDF por lado com estampa, em cada tamanho
const estLados = () => new Set(estPecas.map(p => p.local)).size;
function estInfo() {
 const n = estLados() * estMarcados.size;
 const mk = $('est-mock-exportar').checked ? estMarcados.size * 4 : 0;
 $('est-export-info').textContent = n ? `${n} PDF${n > 1 ? 's' : ''} de estampa${mk ? ` + ${mk} mockups` : ''}${$('est-folha').checked ? ' + folha de conferência' : ''}` : 'Escolha estampas e tamanhos';
 $('est-exportar').disabled = !n;
}

// ---------- mockups ----------
let estMockVez = 0, estMockTimer = null, estMockVistas = [], estMockI = 0, estMockTitulo = '';
function estMockTamanhos() {
 const sel = $('est-mock-tam'), atual = sel.value;
 const opcoes = estTamanhosMarcados().map(([t, s]) => estHtml('option', {value: estChave(t, s), textContent: estNome(t, s)}));
 sel.replaceChildren(...opcoes);
 const vista = estChave(estVista.tipo, estVista.tamanho);
 sel.value = [atual, vista].find(v => opcoes.some(o => o.value === v)) || opcoes[0]?.value || '';
}
function estMockups() { clearTimeout(estMockTimer); estMockTimer = setTimeout(() => estMockGerar().catch(e => toast(e.message)), 350); }
async function estMockGerar() {
 estMockTamanhos();
 const grid = $('est-mock-grid'), vez = ++estMockVez, chave = $('est-mock-tam').value;
 if (!chave || !estPecas.length) { grid.replaceChildren(estHtml('p', {className: 'help', textContent: 'Escolha um tamanho no passo 4.'})); return; }
 grid.classList.add('carregando');
 try {
  const r = await request('/api/estampas/mockups', {pecas: estPecasApi(), cor: estCor, tamanho: chave.split(':')});
  if (vez !== estMockVez) return;
  const [tipo, tam] = chave.split(':');
  estMockVistas = r.vistas; estMockTitulo = estNome(tipo, tam);
  if ($('est-mock-dialog').open) estMockMostrar(estMockI);
  grid.replaceChildren(...(r.vistas.length ? r.vistas.map((v, i) => estHtml('button', {type: 'button', title: 'Ampliar', onclick: () => { estMockMostrar(i); $('est-mock-dialog').showModal(); }},
   estHtml('img', {src: v.imagem, alt: `Mockup ${estMockTitulo}, ${v.nome}`}), estHtml('span', {textContent: v.nome})))
   : [estHtml('p', {className: 'help', textContent: 'Ainda não há fotos de mockup para este tamanho.'})]));
 } finally { if (vez === estMockVez) grid.classList.remove('carregando'); }
}
// navegação entre as vistas na janela ampliada (setas na tela ou do teclado)
function estMockMostrar(i) {
 const n = estMockVistas.length; if (!n) return;
 estMockI = (i + n) % n; const v = estMockVistas[estMockI];
 $('est-mock-titulo').textContent = `${estMockTitulo} · ${v.nome}`; $('est-mock-img').src = v.imagem; $('est-mock-img').alt = `Mockup ${estMockTitulo}, ${v.nome}`;
 $('est-mock-pos').textContent = `${estMockI + 1} de ${n}`;
}
$('est-mock-ant').onclick = () => estMockMostrar(estMockI - 1);
$('est-mock-prox').onclick = () => estMockMostrar(estMockI + 1);
$('est-mock-dialog').addEventListener('keydown', e => {
 if (e.key === 'ArrowLeft') { e.preventDefault(); estMockMostrar(estMockI - 1); }
 if (e.key === 'ArrowRight') { e.preventDefault(); estMockMostrar(estMockI + 1); }
});
$('est-mock-tam').onchange = estMockups;
$('est-mock-exportar').onchange = () => estInfo();

// ---------- conferência ----------
let estConferindo = 0;
async function estConferir() {
 const avisos = [], vez = ++estConferindo;
 for (const a of new Map(estPecas.map(p => [p.arte.id, p.arte])).values())
  for (const v of a.avisos || []) avisos.push({...v, arte: a});
 if (estPecas.length && estMarcados.size) {
  try {
   const r = await request('/api/estampas/conferir', {pecas: estPecasApi(), tamanhos: estTamanhosMarcados(), cor: estCor});
   if (vez !== estConferindo) return;
   estPlano = r.itens;
   for (const texto of r.sobreposicoes || []) avisos.unshift({nivel: 'erro', texto});
   for (const item of r.itens) for (const v of item.avisos) avisos.push({...v, texto: `${estNome(item.tipo, item.tamanho)} · ${item.rotulo}: ${v.texto}`});
   for (const item of r.itens) for (const v of item.avisosGerais || []) avisos.unshift({...v, texto: `${item.rotulo}: ${v.texto}`});
   if (r.itens.some(i => i.confirmar)) avisos.push({nivel: 'info', texto: 'As áreas de GG, XGG, costas e mangas estão a confirmar com a gráfica.'});
  } catch (e) { toast(e.message); }
 }
 estMockups();
 $('est-avisos').replaceChildren(...(avisos.length ? avisos : [{nivel: 'ok', texto: 'Nenhum problema encontrado.'}]).map(v => estHtml('li', {className: 'est-aviso ' + v.nivel},
  estHtml('span', {textContent: v.texto}),
  v.tipo === 'fundo' && !v.arte.vetor ? estHtml('button', {type: 'button', className: 'secondary', textContent: 'Remover fundo branco', onclick: () => guard(() => estRemoverFundo(v.arte))}) : null)));
}
async function estRemoverFundo(arte) {
 const nova = await request('/api/estampas/remover-fundo', {id: arte.id});
 for (const p of estPecas) if (p.arte.id === arte.id) p.arte = nova;
 toast('Fundo branco removido.'); estSync();
}
function estSync() {
 const tem = estPecas.length > 0;
 $('est-empty').hidden = tem; $('est-editor').hidden = !tem;
 document.body.classList.toggle('est-workspace', tem && !$('estampas').hidden);
 if (!tem) return;
 if (!estDoLocal(estVista.local).length) estVista.local = Object.keys(EST_CURTO).find(l => estDoLocal(l).length);
 if (!estDoLocal(estVista.local).some(p => p.uid === estSel)) estSel = estDoLocal(estVista.local)[0]?.uid ?? null;
 $('est-title').textContent = $('est-cliente').value.trim() || 'Estampa';
 estAbas(); estListaArtes(); estListaTamanhos(); estCores($('est-cores')); estRender(); estInfo(); estConferir();
}

// ---------- importação ----------
let estTrocando = null;   // estampa que o próximo arquivo substitui (botão Trocar)
function estEscolher(peca = null) { estTrocando = peca; $('est-file').click(); }
async function estEnviar(arquivo) {
 if (!arquivo) return;
 await guard(async () => {
  if (arquivo.size > 100 * 1024 * 1024) throw new Error('Limite de 100 MB por arquivo.');
  toast(`Lendo ${arquivo.name}…`);
  const r = await fetch(`/api/estampas/arte?name=${encodeURIComponent(arquivo.name)}`, {method: 'POST', headers: {'X-Indoor': '1', 'Content-Type': 'application/octet-stream'}, body: arquivo});
  const arte = await r.json(); if (!r.ok) throw new Error(arte.error);
  $('toast').hidden = true;
  if (estTrocando) {
   // trocar mantém o lugar; se a arte nova não couber ali (outra proporção), procura um lugar livre no mesmo lado
   const p = estTrocando; estTrocando = null;
   const outras = estDoLocal(p.local).filter(o => o !== p), teste = {local: p.local, arte};
   const ajuste = estCabe(teste, p.ajuste, outras) ? p.ajuste : (estCabe(teste, {...p.ajuste, escala: .2}, outras) ? {...p.ajuste, escala: .2} : estLugarLivre(p.local, arte));
   if (!ajuste) { estSemEspaco(`${arquivo.name} não cabe no lugar de ${estRotulo(p)}. Diminua ou remova outra estampa deste lado e tente de novo.`); return; }
   Object.assign(p, {arte, ajuste}); estSel = p.uid; estVista.local = p.local; estSync(); return;
  }
  estPerguntarLocais(arte);
 });
 $('est-file').value = '';
}
// Ao importar: frente marcada (ou o primeiro local livre); a janela pergunta se a estampa também vai para costas e mangas.
// Se o local já tiver estampa, a nova entra ao lado dela, no maior tamanho que couber sem sobrepor.
function estPerguntarLocais(arte) {
 const livre = Object.keys(EST_CURTO).find(l => !estDoLocal(l).length) || estVista.local;
 $('est-locais-nome').textContent = arte.nome;
 $('est-locais-opcoes').replaceChildren(...Object.entries(estCat.locais).map(([local, nome]) => estHtml('label', {className: 'check'},
  estHtml('input', {type: 'checkbox', value: local, checked: local === livre}), nome,
  estDoLocal(local).length ? estHtml('small', {className: 'est-confirmar', textContent: 'entra ao lado da atual'}) : null)));
 $('est-locais-ok').onclick = () => {
  const locais = [...$('est-locais-opcoes').querySelectorAll('input:checked')].map(i => i.value);
  if (!locais.length) { toast('Escolha ao menos um local.'); return; }
  const lotados = [], novas = [];
  for (const l of locais) {
   const ajuste = estDoLocal(l).length < EST_MAX_POR_LOCAL ? estLugarLivre(l, arte) : null;
   if (!ajuste) { lotados.push(estCat.locais[l]); continue; }
   const p = {uid: ++estUid, local: l, arte, ajuste}; estPecas.push(p); novas.push(p);
  }
  $('est-locais-dialog').close();
  if (novas.length) { estSel = novas[0].uid; estVista.local = novas[0].local; estSync(); }
  if (lotados.length) estSemEspaco(`Não há espaço para mais uma estampa em: ${lotados.join(', ')}. Remova uma estampa ou diminua alguma para caber, e importe de novo.`);
 };
 estCores($('est-locais-cores'));
 $('est-locais-dialog').showModal();
}

// ---------- exportação ----------
async function estAbrirExportar() {
 if (!$('est-cliente').value.trim()) { $('est-cliente').focus(); throw new Error('Informe o nome do cliente no passo 1.'); }
 if (!estMarcados.size) throw new Error('Escolha ao menos um tamanho.');
 const pasta = estPasta || await chooseFolder(); if (!pasta) return; estPasta = pasta;
 const n = estLados() * estMarcados.size;
 $('est-pasta').textContent = pasta; $('est-resultado').hidden = true; $('est-gravar').disabled = false;
 const pastas = estMarcados.size > 6 ? ', separados em pastas de camisa comum e baby look' : '';
 const mk = $('est-mock-exportar').checked ? `, ${estMarcados.size * 4} mockups` : '';
 $('est-dialog-info').textContent = `${n} PDF${n > 1 ? 's' : ''} na medida exata (um por lado e tamanho)${mk}${pastas}${$('est-folha').checked ? ' e a folha de conferência' : ''}`;
 $('est-dialog').showModal();
}
$('est-gravar').onclick = () => guard(async () => {
 $('est-resultado').hidden = false; $('est-resultado').textContent = 'Gerando os arquivos…';
 try {
  const r = await request('/api/estampas/exportar', {cliente: $('est-cliente').value, pecas: estPecasApi(),
   tamanhos: estTamanhosMarcados(), conferencia: $('est-folha').checked, mockups: $('est-mock-exportar').checked, zip: $('est-zip').checked, cor: estCor, folder: estPasta});
  $('est-resultado').textContent = $('est-zip').checked ? `✓ Arquivo .zip em ${estPasta}` : `✓ ${r.arquivos.length} arquivo(s) em ${estPasta}${r.organizado ? ', separados por tipo de camisa' : ''}`;
  $('est-gravar').disabled = true; toast('Estampas exportadas.');
 } catch (e) { $('est-resultado').textContent = e.message; throw e; }
});
$('est-trocar-pasta').onclick = () => guard(async () => { const p = await chooseFolder(); if (p) { estPasta = p; $('est-pasta').textContent = p; } });
$('est-exportar').onclick = () => guard(estAbrirExportar);
$('est-choose').onclick = e => { e.stopPropagation(); estEscolher(); };
$('est-empty').onclick = () => estEscolher();
$('est-empty').onkeydown = e => { if (e.target === $('est-empty') && ['Enter', ' '].includes(e.key)) { e.preventDefault(); estEscolher(); } };
$('est-add').onclick = () => estEscolher();
$('est-file').onchange = () => estEnviar($('est-file').files[0]);
$('est-cliente').oninput = () => { $('est-title').textContent = $('est-cliente').value.trim() || 'Estampa'; };
$('est-folha').onchange = estInfo;
$('est-todos').onclick = () => { estMarcados = new Set(estCat.tamanhos.map(t => estChave(t.tipo, t.tamanho))); estListaTamanhos(); estConferir(); estInfo(); };
$('est-nenhum').onclick = () => { estMarcados.clear(); estListaTamanhos(); estConferir(); estInfo(); };
for (const zona of [$('est-empty'), $('est-editor')]) {
 let fundo = 0;
 zona.addEventListener('dragenter', e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); fundo++; zona.classList.add('over'); });
 zona.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
 zona.addEventListener('dragleave', () => { if (--fundo <= 0) { fundo = 0; zona.classList.remove('over'); } });
 zona.addEventListener('drop', e => { e.preventDefault(); fundo = 0; zona.classList.remove('over'); estTrocando = null; estEnviar(e.dataTransfer.files[0]); });
}
const estShowView = showView;
showView = async function (view) {
 const r = await estShowView(view);
 if (view === 'estampas' && !$('estampas').hidden) estIniciar().catch(e => toast(e.message));
 else document.body.classList.remove('est-workspace');
 return r;
};
