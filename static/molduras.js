'use strict';
// Molduras de TV: cliente e tamanho → logo e cores → layout do ramo → ajustes no desenho → folha de impressão e faca de corte.
// As formas vêm do servidor como caminhos SVG em cm com papéis de cor (principal, secundária...); trocar uma cor recolore tudo.

const MOLD_NS = 'http://www.w3.org/2000/svg';
const MOLD_PAPEIS = {principal: 'Principal', secundaria: 'Secundária', destaque: 'Destaque', escura: 'Escura', clara: 'Clara'};
let moldCat = null, mold = null, moldId = null, moldGeo = null, moldLogo = null, moldPlaca = null, moldOriginal = null;
const moldZoom = criarZoom($('mold-svg'), document.querySelector('.mold-shell'));
let moldRefs = [], moldSel = null, moldHist = [], moldView = 'folha', moldDrag = null, moldPapelAtivo = 'principal', moldSalvo = true, moldCoresManuais = false;

function moldEl(tag, attrs = {}, ...kids) {
 const e = document.createElementNS(MOLD_NS, tag);
 for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
 e.append(...kids.filter(Boolean)); return e;
}
function moldHtml(tag, props = {}, ...kids) {
 const e = document.createElement(tag);
 for (const [k, v] of Object.entries(props)) { if (k.startsWith('aria') || k.startsWith('data')) e.setAttribute(k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), v); else e[k] = v; }
 e.append(...kids.filter(c => c != null && c !== false)); return e;
}
const moldCm = v => Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 1});
const moldCor = c => /^#/.test(c) ? c : mold.cores[c] || '#000000';
const moldClone = v => JSON.parse(JSON.stringify(v));

async function moldCatalogo() { if (!moldCat) moldCat = await request('/api/molduras/catalogo'); return moldCat; }

// ---------- lista de molduras salvas ----------
async function moldInicio() {
 await moldCatalogo();
 $('mold-editor').hidden = true; $('mold-start').hidden = false; document.body.classList.remove('mold-workspace');
 const {projetos} = await request('/api/molduras/projetos');
 $('mold-list').replaceChildren(projetos.length ? moldHtml('ul', {className: 'mold-saved'}, ...projetos.map(p => moldHtml('li', {},
  moldHtml('span', {className: 'mold-dots', ariaHidden: 'true'}, ...Object.values(p.cores).map(c => moldHtml('i', {style: `background:${c}`}))),
  moldHtml('div', {className: 'mold-saved-info'}, moldHtml('strong', {textContent: p.cliente}),
   moldHtml('small', {textContent: `${p.tv.polegadas ? p.tv.polegadas + '" · ' : ''}${moldCm(p.tv.largura)} × ${moldCm(p.tv.altura)} cm · ${new Date(p.atualizado).toLocaleDateString('pt-BR')}${p.autor ? ' · ' + p.autor : ''}`})),
  moldHtml('button', {type: 'button', className: 'secondary', textContent: 'Abrir', onclick: () => guard(() => moldAbrir(p.id))}),
  moldHtml('button', {type: 'button', className: 'text-button', textContent: 'Excluir', onclick: () => guard(async () => {
   if (!confirm(`Excluir a moldura de ${p.cliente}? Os PDFs já exportados não são apagados.`)) return;
   await request('/api/molduras/excluir', {id: p.id}); await moldInicio();
  })}))))
  : moldHtml('p', {className: 'mold-empty', textContent: 'Nenhuma moldura salva ainda. Clique em Nova moldura para começar.'}));
}

function moldProjetoPadrao() {
 const seg = moldCat.segmentos[0], tam = moldCat.tamanhos.find(t => t.polegadas === 40) || moldCat.tamanhos[0];
 return {cliente: '', tv: {...tam}, quantidade: 1, material: 'PS', segmento: seg.id, layout: seg.layouts[0].id, cores: {...seg.paleta},
         formas: [], editado: false, logo: null, logoIC: 'auto'};
}

async function moldNova() {
 await moldCatalogo();
 moldZoom.novo(); mold = moldProjetoPadrao(); moldId = null; moldPadroesProprios = []; moldLogo = null; moldRefs = []; moldCoresManuais = false;
 await moldGerar(); moldAbrirEditor(); moldSalvo = true; $('mold-cliente').focus();
}

async function moldAbrir(id) {
 await moldCatalogo();
 const p = await request('/api/molduras/projeto?id=' + id);
 moldZoom.novo(); moldId = p.id; delete p.id; mold = p; moldRefs = []; moldCoresManuais = true; moldVcParar();
 // patterns importados que o projeto usa voltam para a lista
 const vistos = new Set(); moldPadroesProprios = [];
 for (const f of p.formas) {
  const q = f.padrao; if (!q || q.fonte.startsWith('pronto:') || vistos.has(q.fonte)) continue; vistos.add(q.fonte);
  const [tipo, id] = q.fonte.split(':'); moldPadroesProprios.push({fonte: q.fonte, tipo, id, nome: q.nome, grupos: q.grupos || []});
 }
 moldLogo = p.logo ? {id: p.logo.id, nome: p.logo.nome, vetor: p.logo.vetor, cores: []} : null;
 const g = await request('/api/molduras/gerar', {tv: mold.tv, layouts: [mold.layout]});
 moldGeo = g.geometria; moldOriginal = moldClone(g.layouts[mold.layout].formas); moldHist = []; moldSel = null;
 await moldAtualizarPlaca(); moldAbrirEditor(); moldSalvo = true;
}

function moldAbrirEditor() {
 $('mold-start').hidden = true; $('mold-editor').hidden = false; document.body.classList.add('mold-workspace');
 moldPreencherCampos(); moldRender(); moldMiniaturas();
 moldPadrao = null; moldSyncPadrao();
}

// ---------- geração ----------
async function moldGerar() {
 const r = await request('/api/molduras/gerar', {tv: mold.tv, layouts: [mold.layout]});
 moldGeo = r.geometria; mold.formas = moldClone(r.layouts[mold.layout].formas); moldOriginal = moldClone(mold.formas);
 if (mold.logo && !mold.logo.placaEscolhida) mold.logo.placa = r.layouts[mold.layout].placa || 'nenhuma';
 mold.editado = false; mold.arte = null; moldHist = []; moldSel = null; $('mold-arte-info').hidden = true;
 moldVcParar();  // outro layout ou outra TV: o arquivo do VectorCraft deixa de valer
 await moldAtualizarPlaca();
}
// Arte vetorial pronta no lugar do layout: as formas vêm do arquivo, com as cores dele, cobrindo a área de sangria
async function moldImportarArte(arquivo) {
 if (!arquivo) return;
 moldVcParar();  // arte escolhida à mão: para de acompanhar o arquivo do VectorCraft
 await guard(async () => {
  if (!/\.(svg|pdf|ai)$/i.test(arquivo.name)) throw new Error('A arte precisa ser vetorial: SVG, PDF ou AI. Imagens (PNG, JPG) não ficam nítidas na impressão.');
  if (mold.editado && !confirm('A arte importada substitui o desenho atual, com as edições. Continuar?')) return;
  toast(`Lendo ${arquivo.name}…`);
  const r = await moldEnviar(arquivo, `/api/molduras/arte?tv=${encodeURIComponent(JSON.stringify(mold.tv))}`);
  moldAplicarArte(r);
 });
 $('mold-arte-file').value = '';
}
function moldAplicarArte(r) {
 moldGuardar();
 mold.formas = r.formas; moldOriginal = moldClone(r.formas); mold.arte = {nome: r.nome}; mold.editado = true; moldSel = null;
 moldRender(); moldMarcarLayout();
 $('mold-arte-info').hidden = false; $('mold-arte-info').textContent = `Usando a arte ${r.nome}. Escolha um layout acima para voltar aos modelos.`;
 toast(r.aviso || `Arte aplicada: ${r.formas.length - 1} formas editáveis. Duplo clique numa forma troca a cor.`);
}
async function moldAtualizarPlaca() {
 moldPlaca = mold.logo ? await request('/api/molduras/placa', {tv: mold.tv, logo: mold.logo.id, escala: mold.logo.escala, placa: mold.logo.placa}) : null;
}
function moldConfirmaPerda() { return !mold.editado || confirm(mold.arte ? 'Isso troca a arte importada pelo layout e descarta as edições. Continuar?' : 'Isso refaz o desenho a partir do layout e descarta as edições manuais. Continuar?'); }

// ---------- prévia ----------
function moldRender() {
 if (!mold || !moldGeo) return;
 const g = moldGeo, W = g.folha.largura, H = g.folha.altura, s = g.sangria, svg = $('mold-svg');
 moldZoom.definir(0, 0, W, H);
 const defs = moldEl('defs', {}, moldEl('clipPath', {id: 'mold-clip'}, moldEl('rect', {x: s.x0, y: s.y0, width: s.x1 - s.x0, height: s.y1 - s.y0})));
 const papel = moldEl('rect', {x: 0, y: 0, width: W, height: H, fill: '#fff', class: 'mold-papel'});
 const camadas = [defs, papel];
 if (moldView === 'folha') {
  const formas = moldEl('g', {'clip-path': 'url(#mold-clip)', id: 'mold-formas'});
  mold.formas.forEach((f, i) => { if (f.imagem) defs.append(moldPadraoImagem(f, i)); });
  mold.formas.forEach((f, i) => formas.append(moldEl('path', {d: f.d, fill: f.imagem ? `url(#mold-pat-${i})` : moldCor(f.cor), 'data-imagem': f.imagem ? '1' : null, 'fill-opacity': f.opacidade ?? null, 'fill-rule': f.regra === 'evenodd' ? 'evenodd' : null,
   class: 'mold-forma' + (moldSel === i ? ' is-selected' : ''), 'data-i': i})));
  camadas.push(formas);
  if (moldPlaca?.placa) camadas.push(moldEl('path', {d: moldPlaca.placa, fill: moldCor(mold.logo.placaCor || 'clara'), class: 'mold-fixo'}));
  if (mold.logo && moldPlaca) {
   const [x0, y0, x1, y1] = moldPlaca.rect;
   camadas.push(moldEl('image', {href: `/molduras/logo/${mold.logo.id}`, x: x0, y: y0, width: x1 - x0, height: y1 - y0, preserveAspectRatio: 'xMidYMid meet', class: 'mold-fixo'}));
  }
  camadas.push(moldEl('path', {d: g.janelaPath, fill: '#fff', class: 'mold-janela'}));
 } else {
  camadas.push(moldEl('path', {d: g.corte, fill: 'none', stroke: '#E8312F', 'stroke-width': .08, class: 'mold-fixo'}));
  camadas.push(moldEl('path', {d: g.janelaPath, fill: 'none', stroke: '#E8312F', 'stroke-width': .08, class: 'mold-janela'}));
 }
 if (moldView === 'folha') camadas.push(moldLogoIndoor());  // a faca de corte não leva a logo Indoor Channel
 camadas.push(moldEtiqueta());
 if (moldView === 'folha') {
  // fora da linha de corte fica esmaecido: mostra o formato final da moldura
  camadas.push(moldEl('path', {d: `M0 0 H${W} V${H} H0 Z ${g.corte}`, 'fill-rule': 'evenodd', fill: '#f5f5f9', 'fill-opacity': .78, class: 'mold-fixo'}));
  camadas.push(moldEl('path', {d: g.corte, fill: 'none', stroke: '#E8312F', 'stroke-width': .1, 'stroke-dasharray': '.6 .4', class: 'mold-fixo'}));
 }
 const marcas = moldEl('g', {stroke: '#2d3144', 'stroke-width': .075, fill: 'none', class: 'mold-fixo'});
 for (const [x, y, sx, sy] of [[.25, .25, 1, 1], [W - .25, .25, -1, 1], [.25, H - .25, 1, -1], [W - .25, H - .25, -1, -1]])
  marcas.append(moldEl('path', {d: `M${x + sx * 1.5} ${y} L${x} ${y} L${x} ${y + sy * 1.5}`}));
 camadas.push(marcas, moldEl('g', {id: 'mold-pontos'}));
 svg.replaceChildren(...camadas);
 if (moldView === 'folha') moldAjustarLogoIC();
 moldDesenharPontos();
 const tv = mold.tv;
 $('mold-title').textContent = mold.cliente || 'Nova moldura';
 $('mold-size').textContent = `Folha ${moldCm(W)} × ${moldCm(H)} cm`;
 $('mold-stats').textContent = `TV ${tv.polegadas ? tv.polegadas + '" · ' : ''}${moldCm(tv.largura)} × ${moldCm(tv.altura)} cm · moldura ${moldCm(g.moldura.largura)} × ${moldCm(g.moldura.altura)} cm`;
 $('mold-export-info').textContent = mold.cliente ? `${mold.cliente} · ${tv.polegadas ? tv.polegadas + '"' : moldCm(tv.largura) + ' × ' + moldCm(tv.altura) + ' cm'}` : 'Informe o cliente';
 moldAvisos(); moldSyncEdicao(); moldAplicadosLista(); moldBarraSync();
 // a faca de corte é só o guia de corte: as etapas de design ficam na folha de impressão
 document.querySelectorAll('.mold-design').forEach(el => { el.hidden = moldView !== 'folha'; });
 $('mold-faca-nota').hidden = moldView === 'folha';
}

function moldLogoIndoor() {
 const L = moldCat.logoIndoor, a = moldGeo.logoIC, k = a.largura / L.largura;
 const g = moldEl('g', {transform: `translate(${a.x0} ${a.y0}) scale(${k})`, class: 'mold-fixo', id: 'mold-ic'});
 g.append(moldEl('path', {d: L.a, 'data-parte': 'a'}), moldEl('path', {d: L.b, 'data-parte': 'b'}));
 return g;
}
function moldLum(hex) {
 const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
 return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
// Logo Indoor Channel: branca sobre fundo escuro, escura sobre fundo claro; "Automática" mede a cor que ficou atrás dela
function moldAjustarLogoIC() {
 const a = moldGeo.logoIC, formas = [...document.querySelectorAll('#mold-formas path:not([data-imagem])')].reverse();
 let variante = mold.logoIC;
 if (variante === 'auto') {
  const lums = [.1, .35, .65, .9].map(fx => {
   const p = new DOMPoint(a.x0 + a.largura * fx, a.y0 + a.altura / 2);
   const f = formas.find(el => Number(el.getAttribute('fill-opacity') ?? 1) >= .5 && el.isPointInFill(p));
   return moldLum(f ? f.getAttribute('fill') : '#FFFFFF');
  });
  variante = lums.reduce((x, y) => x + y) / lums.length < .45 ? 'clara' : 'escura';
 }
 const [ca, cb] = variante === 'clara' ? ['#FFFFFF', moldCat.logoIndoor.tinta] : [moldCat.logoIndoor.tinta, '#FFFFFF'];
 $('mold-ic')?.querySelector('[data-parte=a]').setAttribute('fill', ca);
 $('mold-ic')?.querySelector('[data-parte=b]').setAttribute('fill', cb);
}

function moldEtiqueta() {
 const e = moldGeo.etiqueta, tv = mold.tv;
 const tam = `${tv.polegadas ? tv.polegadas + '" ' : ''}(${moldCm(tv.largura)} x ${moldCm(tv.altura)} cm)`;
 const g = moldEl('g', {class: 'mold-fixo', 'font-family': 'Arial, sans-serif', 'font-size': .39, fill: '#333'});
 g.append(moldEl('rect', {x: e.x0, y: e.y0, width: e.x1 - e.x0, height: e.y1 - e.y0, fill: 'none', stroke: '#2d3144', 'stroke-width': .075}));
 [`Cliente: ${mold.cliente || '—'}`, `Tamanho: ${tam}`, `Quantidade: ${mold.quantidade}`, `Material: ${mold.material}`].forEach((t, i) => {
  const txt = moldEl('text', {x: e.x0 + .5, y: e.y0 + .75 + i * .6}); txt.textContent = t; g.append(txt);
 });
 return g;
}

function moldContraste(a, b) { const [x, y] = [moldLum(a), moldLum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); }
function moldFundoEm(x, y) {
 const p = new DOMPoint(x, y);
 const f = [...document.querySelectorAll('#mold-formas path:not([data-imagem])')].reverse().find(el => Number(el.getAttribute('fill-opacity') ?? 1) >= .5 && el.isPointInFill(p));
 return f ? f.getAttribute('fill') : '#FFFFFF';
}
function moldAvisos() {
 const notas = [];
 if (moldView !== 'folha') { $('mold-notes').replaceChildren(); return; }
 if (!mold.logo) notas.push('Sem logo do cliente: envie a logo no passo 2.');
 else {
  if (mold.logo.vetor === false) notas.push('A logo é uma imagem (PNG/JPG). Para a impressão grande, prefira o arquivo vetorial (PDF, AI ou SVG).');
  if (moldView === 'folha' && mold.logo.cor && moldPlaca && mold.logo.placa === 'nenhuma') {
   const [x0, y0, x1, y1] = moldPlaca.rect, fundo = moldFundoEm((x0 + x1) / 2, (y0 + y1) / 2);
   if (moldContraste(mold.logo.cor, fundo) < 1.8) notas.push('A logo está com pouco contraste com o fundo. Ligue um "Fundo atrás da logo" no passo 2 ou troque a cor do fundo.');
  }
 }
 $('mold-notes').replaceChildren(...notas.map(n => moldHtml('p', {textContent: n})));
}

// ---------- campos ----------
function moldPreencherCampos() {
 $('mold-cliente').value = mold.cliente;
 const tam = $('mold-tamanho'), atual = moldCat.tamanhos.find(t => t.polegadas === mold.tv.polegadas && t.largura === mold.tv.largura && t.altura === mold.tv.altura);
 tam.replaceChildren(...moldCat.tamanhos.map(t => moldHtml('option', {value: String(t.polegadas), textContent: `${t.polegadas}" · ${moldCm(t.largura)} × ${moldCm(t.altura)} cm`})),
  moldHtml('option', {value: 'outro', textContent: atual ? 'Outro tamanho…' : `${mold.tv.polegadas ? mold.tv.polegadas + '" · ' : ''}${moldCm(mold.tv.largura)} × ${moldCm(mold.tv.altura)} cm (outro tamanho)`}));
 tam.value = atual ? String(atual.polegadas) : 'outro';
 $('mold-outro').hidden = !!atual;
 $('mold-polegadas').value = mold.tv.polegadas || ''; $('mold-largura').value = mold.tv.largura; $('mold-altura').value = mold.tv.altura;
 $('mold-quantidade').value = mold.quantidade;
 $('mold-material').replaceChildren(...moldCat.materiais.map(m => moldHtml('option', {value: m, textContent: m}))); $('mold-material').value = mold.material;
 $('mold-segmento').replaceChildren(...moldCat.segmentos.map(s => moldHtml('option', {value: s.id, textContent: s.nome}))); $('mold-segmento').value = mold.segmento;
 $('mold-logo-ic').value = mold.logoIC;
 moldSyncLogo(); moldSyncCores();
}

function moldSyncLogo() {
 const tem = !!mold.logo;
 $('mold-logo-img').hidden = !tem; $('mold-logo-opts').hidden = !tem;
 $('mold-logo-choose').textContent = tem ? 'Trocar logo' : 'Escolher logo';
 if (tem) {
  $('mold-logo-img').src = `/molduras/logo/${mold.logo.id}`; $('mold-logo-img').alt = `Logo ${mold.logo.nome || ''}`;
  $('mold-logo-escala').value = mold.logo.escala; $('mold-logo-escala-v').textContent = Math.round(mold.logo.escala * 100) + '%';
  $('mold-placa').value = mold.logo.placa;
  $('mold-placa-cor-box').hidden = mold.logo.placa === 'nenhuma';
  $('mold-placa-cor-box').replaceChildren(...moldSwatches(mold.logo.placaCor || 'clara', c => { mold.logo.placaCor = c; moldMudou(); moldRender(); moldSyncLogo(); }));
 }
}

function moldSwatches(atual, escolher, comBranco = true) {
 const lista = [...Object.keys(MOLD_PAPEIS), ...(comBranco ? ['#FFFFFF'] : [])];
 return lista.map(c => moldHtml('button', {type: 'button', className: 'mold-swatch' + (c === atual ? ' is-on' : ''), style: `--sw:${moldCor(c)}`,
  title: MOLD_PAPEIS[c] || 'Branco', ariaLabel: MOLD_PAPEIS[c] || 'Branco', ariaPressed: String(c === atual), onclick: () => escolher(c)}));
}

function moldSyncCores() {
 $('mold-papeis').replaceChildren(...Object.entries(MOLD_PAPEIS).map(([papel, nome]) => {
  const input = moldHtml('input', {type: 'color', value: mold.cores[papel].toLowerCase(), ariaLabel: `Cor ${nome}`});
  input.oninput = () => { mold.cores[papel] = input.value.toUpperCase(); moldCoresManuais = true; moldMudou(); moldRender(); moldPintarMiniaturas(); moldPadroesLista(); };
  input.onchange = () => moldSyncCores();
  return moldHtml('label', {className: 'mold-papel' + (moldPapelAtivo === papel ? ' is-on' : ''), onclick: e => { if (e.target !== input) { moldPapelAtivo = papel; moldSyncCores(); } }},
   moldHtml('span', {className: 'mold-papel-cor', style: `--sw:${mold.cores[papel]}`}, input),
   moldHtml('span', {className: 'mold-papel-nome'}, moldHtml('strong', {textContent: nome}), moldHtml('small', {textContent: mold.cores[papel]})));
 }));
 const sugestoes = moldSugestoes();
 $('mold-sugestoes-box').hidden = !sugestoes.length;
 $('mold-sugestoes').replaceChildren(...sugestoes.slice(0, 12).map(([c]) => moldHtml('button', {type: 'button', className: 'mold-chip', style: `--sw:${c}`, title: `Usar ${c} como ${MOLD_PAPEIS[moldPapelAtivo]}`,
  ariaLabel: `Usar ${c} como ${MOLD_PAPEIS[moldPapelAtivo]}`, onclick: () => { mold.cores[moldPapelAtivo] = c; moldCoresManuais = true; moldMudou(); moldRender(); moldSyncCores(); moldPintarMiniaturas(); }})));
 $('mold-refs').replaceChildren(...moldRefs.map((r, i) => moldHtml('span', {className: 'mold-ref'}, moldHtml('span', {className: 'mold-dots'}, ...r.cores.slice(0, 5).map(([c]) => moldHtml('i', {style: `background:${c}`}))),
  moldHtml('small', {textContent: r.nome}), moldHtml('button', {type: 'button', className: 'close', ariaLabel: `Remover ${r.nome}`, textContent: '×', onclick: () => { moldRefs.splice(i, 1); moldSyncCores(); }}))));
}
function moldSugestoes() {
 const todas = [...(moldLogo?.cores || []), ...moldRefs.flatMap(r => r.cores)], grupos = [];
 const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
 for (const [c, w] of todas) {
  const g = grupos.find(([o]) => Math.hypot(...rgb(o).map((v, i) => v - rgb(c)[i])) < 36);
  if (g) g[1] += w; else grupos.push([c, w]);
 }
 return grupos.sort((a, b) => b[1] - a[1]);
}
async function moldCoresAutomaticas() {
 const r = await request('/api/molduras/sugerir', {cores: moldSugestoes(), segmento: mold.segmento});
 mold.cores = r.cores; moldMudou(); moldRender(); moldSyncCores(); moldPintarMiniaturas();
}

// ---------- layouts ----------
let moldMinis = {};
async function moldMiniaturas() {
 const seg = moldCat.segmentos.find(s => s.id === mold.segmento);
 const r = await request('/api/molduras/gerar', {tv: mold.tv, layouts: seg.layouts.map(l => l.id)});
 moldMinis = r.layouts;
 $('mold-layouts').replaceChildren(...seg.layouts.map(l => {
  const g = r.geometria, s = g.sangria;
  const mini = moldEl('svg', {viewBox: `${s.x0} ${s.y0} ${s.x1 - s.x0} ${s.y1 - s.y0}`, 'aria-hidden': 'true', 'data-layout': l.id});
  return moldHtml('button', {type: 'button', className: 'mold-layout' + (l.id === mold.layout ? ' is-on' : ''), role: 'radio', ariaChecked: String(l.id === mold.layout),
   onclick: () => guard(async () => { if ((l.id === mold.layout && !mold.arte) || !moldConfirmaPerda()) return; mold.layout = l.id; await moldGerar(); moldMudou(); moldRender(); moldSyncLogo(); moldMarcarLayout(); })},
   mini, moldHtml('span', {textContent: l.nome}));
 }));
 moldPintarMiniaturas(r.geometria);
}
function moldPintarMiniaturas(g = moldGeo) {
 document.querySelectorAll('#mold-layouts svg').forEach(svg => {
  const formas = moldMinis[svg.dataset.layout]?.formas || [];
  svg.replaceChildren(...formas.map(f => moldEl('path', {d: f.d, fill: moldCor(f.cor), 'fill-opacity': f.opacidade ?? null, 'fill-rule': f.regra === 'evenodd' ? 'evenodd' : null})),
   moldEl('path', {d: g.janelaPath, fill: '#fff'}));
 });
}
function moldMarcarLayout() {
 document.querySelectorAll('.mold-layout').forEach(b => { const on = !mold.arte && b.querySelector('svg').dataset.layout === mold.layout; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
}

// ---------- edição das formas ----------
function moldMudou() { moldSalvo = false; }
function moldGuardar() { moldHist.push(moldClone(mold.formas)); if (moldHist.length > 60) moldHist.shift(); mold.editado = true; moldMudou(); }
function moldSyncEdicao() {
 const f = moldSel != null ? mold.formas[moldSel] : null;
 $('mold-edit').hidden = !f;
 $('mold-desfazer').disabled = !moldHist.length; $('mold-restaurar').disabled = !mold.editado;
 if (!f) { $('mold-edit-hint').textContent = 'Clique numa forma da moldura: a barra de edição aparece sobre ela. Arraste para mover; duplo clique troca a cor ou põe um pattern; Delete apaga.'; return; }
 const fundo = moldSel === 0, padrao = !!f.padrao;
 $('mold-edit-hint').textContent = fundo ? 'Fundo selecionado: troque a cor abaixo.' : padrao ? 'Pattern selecionado: ajuste tamanho, espaçamento e giro no passo 5.'
  : 'Forma selecionada: troque a cor, mude a ordem ou arraste na prévia para mover.';
 $('mold-edit').querySelector('.mold-mini-title').hidden = !!f.imagem; $('mold-forma-cores').hidden = !!f.imagem;
 $('mold-forma-cores').replaceChildren(...moldSwatches(f.cor, c => { moldGuardar(); f.cor = c; if (f.padrao) f.padrao.corOriginal = false; moldRender(); }));
 for (const id of ['mold-frente', 'mold-tras', 'mold-duplicar', 'mold-apagar']) $(id).disabled = fundo;
 $('mold-duplicar').disabled = fundo || padrao;
 $('mold-avancado').hidden = fundo || padrao;
 const n = moldAncoras(f.d).length;
 $('mold-pontos-hint').textContent = n > 160 ? 'Esta forma tem detalhes demais para mover ponto a ponto. Use mover a forma inteira.' : 'Arraste os pontos verdes na prévia.';
}
function moldSelecionar(i) { moldSel = i; moldRender(); if (mold.formas[i]?.padrao || i == null) moldSyncPadrao(); }

function moldMover(d, dx, dy) {
 return d.replace(/(-?\d*\.?\d+(?:e-?\d+)?) (-?\d*\.?\d+(?:e-?\d+)?)/g, (_, x, y) => `${+(+x + dx).toFixed(3)} ${+(+y + dy).toFixed(3)}`);
}
function moldSegmentos(d) {
 const segs = []; const re = /([MLCZ])([^MLCZ]*)/g; let m;
 while ((m = re.exec(d))) segs.push({c: m[1], p: (m[2].trim().match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number)});
 return segs;
}
function moldMontar(segs) { return segs.map(s => s.c + (s.p.length ? s.p.map(v => +v.toFixed(3)).join(' ') : '')).join(' '); }
function moldAncoras(d) {
 const out = [];
 moldSegmentos(d).forEach((s, i) => { if (s.p.length >= 2) out.push({i, x: s.p[s.p.length - 2], y: s.p[s.p.length - 1]}); });
 return out;
}
function moldDesenharPontos() {
 const camada = $('mold-pontos'); if (!camada) return;
 camada.replaceChildren();
 if (moldView !== 'folha' || moldSel == null || moldSel === 0 || mold.formas[moldSel]?.padrao || !$('mold-avancado').open) return;
 const f = mold.formas[moldSel], ancoras = moldAncoras(f.d);
 if (ancoras.length > 160) return;
 const r = moldZoom.px(4);  // 4 px na tela, com ou sem zoom
 const vistos = new Set();
 for (const a of ancoras) {
  const chave = a.x.toFixed(2) + ',' + a.y.toFixed(2); if (vistos.has(chave)) continue; vistos.add(chave);
  const c = moldEl('circle', {cx: a.x, cy: a.y, r, class: 'mold-ponto'});
  c.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); $('mold-svg').setPointerCapture(e.pointerId); const p = moldPonto(e); moldDrag = {tipo: 'ponto', x: a.x, y: a.y, inicio: p, ultimo: p, d0: f.d, el: c}; });
  camada.append(c);
 }
}
function moldPonto(e) { const svg = $('mold-svg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
// Move uma âncora e as alças de curva vizinhas, para a curva acompanhar sem quebrar
function moldMoverAncora(d, ax, ay, dx, dy) {
 const segs = moldSegmentos(d), perto = (x, y) => Math.abs(x - ax) < 1e-3 && Math.abs(y - ay) < 1e-3;
 segs.forEach((s, i) => {
  const n = s.p.length; if (n < 2 || !perto(s.p[n - 2], s.p[n - 1])) return;
  s.p[n - 2] += dx; s.p[n - 1] += dy;
  if (s.c === 'C') { s.p[2] += dx; s.p[3] += dy; }
  const prox = segs[i + 1];
  if (prox && prox.c === 'C') { prox.p[0] += dx; prox.p[1] += dy; }
 });
 return moldMontar(segs);
}

function moldEventosPrevia() {
 const svg = $('mold-svg');
 svg.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const alvo = e.target.closest('.mold-forma');
  if (!alvo) { if (e.target.closest('.mold-janela') || e.target === svg || e.target.classList.contains('mold-papel')) { if (moldSel != null) moldSelecionar(null); } return; }
  const i = Number(alvo.dataset.i);
  // um só gesto: clicar seleciona e, se arrastar, já move (sem precisar clicar duas vezes)
  if (moldSel !== i) moldSelecionar(i);
  if (i === 0 || mold.formas[i].padrao) return;
  e.preventDefault();  // sem isso o navegador pode começar um arraste próprio e cancelar o nosso no meio
  svg.setPointerCapture(e.pointerId);
  const el = document.querySelector(`#mold-formas [data-i="${i}"]`), inicio = moldPonto(e);
  moldDrag = {tipo: 'forma', inicio, ultimo: inicio, d0: mold.formas[i].d, el, moveu: false};
 });
 svg.addEventListener('pointermove', e => {
  if (!moldDrag) return;
  const p = moldPonto(e), dx = p.x - moldDrag.inicio.x, dy = p.y - moldDrag.inicio.y;
  moldDrag.ultimo = p;
  if (moldDrag.tipo === 'forma') {
   if (Math.hypot(dx, dy) > .15) moldDrag.moveu = true;
   if (moldDrag.moveu) { moldDrag.el.setAttribute('d', moldMover(moldDrag.d0, dx, dy)); moldBarra.hidden = true; moldPop.hidden = true; }
  } else {
   moldDrag.el.setAttribute('cx', moldDrag.x + dx); moldDrag.el.setAttribute('cy', moldDrag.y + dy);
   document.querySelector(`#mold-formas [data-i="${moldSel}"]`)?.setAttribute('d', moldMoverAncora(moldDrag.d0, moldDrag.x, moldDrag.y, dx, dy));
  }
 });
 // Fecha o arraste com a última posição vista no pointermove, nunca com a do evento final: num cancelamento o
 // navegador manda (0, 0) e a forma era jogada para fora da folha (parecia ter sido apagada).
 const soltar = cancelou => () => {
  if (!moldDrag) return;
  const d = moldDrag; moldDrag = null;
  if (cancelou) { moldRender(); return; }  // devolve a forma ao lugar
  const dx = d.ultimo.x - d.inicio.x, dy = d.ultimo.y - d.inicio.y;
  if (d.tipo === 'forma' && !d.moveu) return;
  moldGuardar();
  mold.formas[moldSel].d = d.tipo === 'forma' ? moldMover(d.d0, dx, dy) : moldMoverAncora(d.d0, d.x, d.y, dx, dy);
  moldRender();
 };
 svg.addEventListener('pointerup', soltar(false)); svg.addEventListener('pointercancel', soltar(true));
 svg.addEventListener('lostpointercapture', soltar(false));
}

// ---------- logo e referências ----------
async function moldEnviar(arquivo, rota) {
 if (arquivo.size > 100 * 1024 * 1024) throw new Error('Limite de 100 MB por arquivo.');
 const r = await fetch(`${rota}${rota.includes('?') ? '&' : '?'}name=${encodeURIComponent(arquivo.name)}`, {method: 'POST', headers: {'X-Indoor': '1', 'Content-Type': 'application/octet-stream'}, body: arquivo});
 const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
}
async function moldLogoEnviar(arquivo) {
 if (!arquivo) return;
 await guard(async () => {
  toast(`Lendo ${arquivo.name}…`);
  const r = await moldEnviar(arquivo, '/api/molduras/logo');
  moldLogo = r;
  const layout = moldMinis[mold.layout] || {};
  mold.logo = {id: r.id, nome: r.nome, cor: r.cor, vetor: r.vetor, escala: mold.logo?.escala ?? .7, placa: mold.logo?.placa ?? (layout.placa || 'nenhuma'), placaCor: mold.logo?.placaCor || 'clara'};
  if (!moldCoresManuais && r.cores.length) {
   const s = await request('/api/molduras/sugerir', {cores: r.cores, segmento: mold.segmento}); mold.cores = s.cores;
   toast('Logo aplicada. As cores da moldura seguiram as cores da logo; ajuste no passo 3 se quiser.');
  } else $('toast').hidden = true;
  await moldAtualizarPlaca(); moldMudou(); moldRender(); moldSyncLogo(); moldSyncCores(); moldPintarMiniaturas();
 });
 $('mold-logo-file').value = '';
}
async function moldRefsEnviar(arquivos) {
 await guard(async () => {
  for (const a of [...arquivos].slice(0, 8)) {
   toast(`Lendo ${a.name}…`);
   const r = await moldEnviar(a, '/api/molduras/referencia');
   moldRefs.push({nome: a.name, cores: r.cores});
  }
  $('toast').hidden = true; moldSyncCores();
 });
 $('mold-ref-file').value = '';
}

// ---------- salvar e exportar ----------
function moldPayload() {
 if (!mold.cliente.trim()) throw new Error('Informe o nome do cliente no passo 1.');
 const {cliente, tv, quantidade, material, segmento, layout, cores, formas, editado, logoIC} = mold;
 return {cliente, tv, quantidade, material, segmento, layout, cores, formas, editado, logoIC,
         logo: mold.logo && {id: mold.logo.id, escala: mold.logo.escala, placa: mold.logo.placa, placaCor: mold.logo.placaCor}};
}
async function moldSalvar(silencioso = false) {
 const r = await request('/api/molduras/salvar', {id: moldId, projeto: moldPayload()});
 moldId = r.id; moldSalvo = true; if (!silencioso) toast('Moldura salva.');
}
let moldPasta = null;
async function moldAbrirExportar() {
 const p = moldPayload();
 if (!p.logo && !confirm('A moldura está sem a logo do cliente. Exportar assim mesmo?')) return;
 const pasta = moldPasta || await chooseFolder(); if (!pasta) return; moldPasta = pasta;
 const tv = mold.tv, med = v => moldCm(v).replace('.', ',');
 const tam = `${tv.polegadas ? tv.polegadas + ' Polegadas ' : ''}(${med(tv.largura)} x ${med(tv.altura)} cm)`;
 $('mold-nome-folha').value = `Folha de Impressão ${mold.cliente.trim()} - ${tam}`;
 $('mold-nome-faca').value = `Faca de Corte ${mold.cliente.trim()} - ${tam}`;
 $('mold-pasta').textContent = pasta; $('mold-resultado').hidden = true; $('mold-gravar').disabled = false;
 $('mold-dialog-info').textContent = `Folha ${moldCm(moldGeo.folha.largura)} × ${moldCm(moldGeo.folha.altura)} cm · CMYK · sangria de 0,5 cm e marcas de corte`;
 $('mold-dialog').showModal();
}

function moldEventos() {
 $('mold-new').onclick = () => guard(moldNova);
 $('mold-voltar').onclick = () => guard(async () => { if (!moldSalvo && !confirm('Há alterações não salvas. Voltar para a lista assim mesmo?')) return; await moldInicio(); });
 $('mold-salvar').onclick = () => guard(() => moldSalvar());
 $('mold-exportar').onclick = () => guard(moldAbrirExportar);
 $('mold-trocar-pasta').onclick = () => guard(async () => { const p = await chooseFolder(); if (p) { moldPasta = p; $('mold-pasta').textContent = p; } });
 $('mold-gravar').onclick = () => guard(async () => {
  $('mold-resultado').hidden = false; $('mold-resultado').textContent = 'Gerando os PDFs…';
  try {
   const r = await request('/api/molduras/exportar', {projeto: moldPayload(), folder: moldPasta, folha: $('mold-nome-folha').value, faca: $('mold-nome-faca').value});
   await moldSalvar(true);
   $('mold-resultado').textContent = '✓ ' + r.arquivos.map(a => a.split(/[\\/]/).pop()).join('\n✓ ') + `\n${moldPasta}`;
   $('mold-gravar').disabled = true; toast('Folha de impressão e faca de corte geradas.');
  } catch (e) { $('mold-resultado').textContent = e.message; throw e; }
 });
 for (const id of ['mold-nome-folha', 'mold-nome-faca']) $(id).oninput = () => { $('mold-gravar').disabled = false; $('mold-resultado').hidden = true; };
 document.querySelectorAll('[data-mold-view]').forEach(b => b.onclick = () => {
  moldView = b.dataset.moldView; document.querySelectorAll('[data-mold-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  if (moldView !== 'folha') moldSel = null;
  moldRender();
 });
 $('mold-cliente').oninput = () => { mold.cliente = $('mold-cliente').value; moldMudou(); moldRender(); };
 $('mold-quantidade').oninput = () => { const v = Number($('mold-quantidade').value); if (v >= 1 && v <= 999) { mold.quantidade = Math.round(v); moldMudou(); moldRender(); } };
 $('mold-material').onchange = () => { mold.material = $('mold-material').value; moldMudou(); moldRender(); };
 $('mold-tamanho').onchange = () => guard(async () => {
  const v = $('mold-tamanho').value;
  if (v === 'outro') { $('mold-outro').hidden = false; $('mold-polegadas').focus(); return; }
  const t = moldCat.tamanhos.find(x => String(x.polegadas) === v);
  if (!moldConfirmaPerda()) { moldPreencherCampos(); return; }
  mold.tv = {...t}; await moldGerar(); moldMudou(); moldPreencherCampos(); moldRender(); moldMiniaturas();
 });
 $('mold-estimar').onclick = () => guard(async () => {
  const pol = Number($('mold-polegadas').value); if (!pol) throw new Error('Digite as polegadas da TV.');
  const r = await request('/api/molduras/estimar?polegadas=' + pol);
  $('mold-largura').value = r.largura; $('mold-altura').value = r.altura;
  toast(r.tabela ? 'Medida da tabela de TVs em uso.' : `Medida sugerida para ${pol}": ${moldCm(r.largura)} × ${moldCm(r.altura)} cm. Confira com a TV.`);
 });
 $('mold-aplicar-medida').onclick = () => guard(async () => {
  const tv = {polegadas: Number($('mold-polegadas').value) || null, largura: Number($('mold-largura').value), altura: Number($('mold-altura').value)};
  if (!tv.largura || !tv.altura) throw new Error('Preencha a largura e a altura da TV.');
  if (!moldConfirmaPerda()) return;
  const antes = mold.tv; mold.tv = tv;
  try { await moldGerar(); } catch (e) { mold.tv = antes; throw e; }
  moldMudou(); moldPreencherCampos(); moldRender(); moldMiniaturas();
 });
 $('mold-logo-choose').onclick = () => $('mold-logo-file').click();
 $('mold-logo-file').onchange = () => moldLogoEnviar($('mold-logo-file').files[0]);
 $('mold-ref-add').onclick = () => $('mold-ref-file').click();
 $('mold-ref-file').onchange = () => moldRefsEnviar($('mold-ref-file').files);
 $('mold-auto-cores').onclick = () => guard(moldCoresAutomaticas);
 let escalaTimer = null;
 $('mold-logo-escala').oninput = () => {
  mold.logo.escala = Number($('mold-logo-escala').value); $('mold-logo-escala-v').textContent = Math.round(mold.logo.escala * 100) + '%'; moldMudou();
  clearTimeout(escalaTimer); escalaTimer = setTimeout(() => moldAtualizarPlaca().then(moldRender).catch(e => toast(e.message)), 120);
 };
 $('mold-placa').onchange = () => guard(async () => { mold.logo.placa = $('mold-placa').value; mold.logo.placaEscolhida = true; await moldAtualizarPlaca(); moldMudou(); moldRender(); moldSyncLogo(); });
 $('mold-segmento').onchange = () => guard(async () => {
  const seg = moldCat.segmentos.find(s => s.id === $('mold-segmento').value);
  if (!moldConfirmaPerda()) { $('mold-segmento').value = mold.segmento; return; }
  mold.segmento = seg.id; mold.layout = seg.layouts[0].id; moldPadrao = null;
  if (!moldLogo?.cores?.length && !moldRefs.length && !moldCoresManuais) mold.cores = {...seg.paleta};
  await moldGerar(); moldMudou(); moldRender(); moldSyncCores(); moldSyncLogo(); moldSyncPadrao(); await moldMiniaturas();
 });
 $('mold-logo-ic').onchange = () => { mold.logoIC = $('mold-logo-ic').value; moldMudou(); moldRender(); };
 const editar = fn => () => { if (moldSel == null || moldSel === 0) return; moldGuardar(); fn(); moldRender(); };
 $('mold-frente').onclick = editar(() => { const [f] = mold.formas.splice(moldSel, 1); mold.formas.push(f); moldSel = mold.formas.length - 1; });
 $('mold-tras').onclick = editar(() => { const [f] = mold.formas.splice(moldSel, 1); mold.formas.splice(1, 0, f); moldSel = 1; });
 $('mold-duplicar').onclick = editar(() => { const f = moldClone(mold.formas[moldSel]); f.d = moldMover(f.d, 1.5, 1.5); mold.formas.splice(moldSel + 1, 0, f); moldSel += 1; });
 $('mold-apagar').onclick = editar(() => { mold.formas.splice(moldSel, 1); moldSel = null; });
 $('mold-desfazer').onclick = () => { if (!moldHist.length) return; mold.formas = moldHist.pop(); moldSel = null; mold.editado = moldHist.length > 0 || mold.editado; moldMudou(); moldRender(); };
 $('mold-restaurar').onclick = () => { if (!confirm('Descartar todas as edições do desenho e voltar ao layout original?')) return; mold.formas = moldClone(moldOriginal); mold.editado = false; moldHist = []; moldSel = null; moldMudou(); moldRender(); };
 $('mold-avancado').addEventListener('toggle', moldDesenharPontos);
 document.addEventListener('keydown', e => {
  if ($('molduras').hidden || $('mold-editor').hidden || e.target.closest('input,select,textarea') || document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('mold-desfazer').click(); }
  else if (e.key === 'Delete' && moldSel > 0) { e.preventDefault(); $('mold-apagar').click(); }  // só Delete apaga (Backspace não)
  else if (e.key === 'Escape' && moldSel != null) moldSelecionar(null);
 });
 const caixa = $('mold-logo-box');
 caixa.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); caixa.classList.add('over'); } });
 caixa.addEventListener('dragleave', () => caixa.classList.remove('over'));
 caixa.addEventListener('drop', e => { e.preventDefault(); caixa.classList.remove('over'); moldLogoEnviar(e.dataTransfer.files[0]); });
 moldEventosPrevia();
 $('mold-svg').addEventListener('zoom', () => { if (!moldDrag) moldDesenharPontos(); });
 window.addEventListener('beforeunload', e => { if (mold && !moldSalvo && !$('molduras').hidden) e.preventDefault(); });
}

// Abre a lista ao entrar na tela
const moldShowView = showView;
showView = async function (view) {
 const r = await moldShowView(view);
 // a tela cheia (sem rolar a página) vale só com o editor de molduras aberto
 document.body.classList.toggle('mold-workspace', view === 'molduras' && !$('molduras').hidden && !$('mold-editor').hidden);
 if (view === 'molduras' && !$('molduras').hidden && (!mold || $('mold-editor').hidden)) moldInicio().catch(e => toast(e.message));
 return r;
};
// ---------- patterns ----------
// Um módulo repetido em grade no fundo ou dentro de uma forma. Vetores chegam do servidor já recortados (formas comuns
// com a marca `padrao`); imagens viram uma forma com `imagem`, desenhada aqui com <pattern> e no PDF pelo servidor.
let moldPadrao = null, moldPadroesProprios = [], moldPadraoCor = 'secundaria';
const moldPadraoAjustes = () => ({tamanho: Number($('mold-padrao-tamanho').value), espacamento: Number($('mold-padrao-espaco').value),
 giro: Number($('mold-padrao-giro').value), opacidade: Number($('mold-padrao-opacidade').value)});

function moldPadraoRotulos() {
 const a = moldPadraoAjustes();
 $('mold-padrao-tamanho-v').textContent = moldCm(a.tamanho) + ' cm'; $('mold-padrao-espaco-v').textContent = Math.round(a.espacamento * 100) + '%';
 $('mold-padrao-giro-v').textContent = a.giro + '°'; $('mold-padrao-opacidade-v').textContent = Math.round(a.opacidade * 100) + '%';
}
function moldPadraoPrevia(p) {
 if (p.tipo === 'imagem') return moldHtml('img', {src: `/molduras/padrao/${p.id}`, alt: ''});
 const svg = moldEl('svg', {viewBox: '-.6 -.6 1.2 1.2', 'aria-hidden': 'true'});
 const grupos = p.tipo === 'pronto' ? [{d: moldCat.padroes.modulos[p.chave].d, cor: null}] : p.grupos;
 const unica = moldCor(moldPadraoCor === 'original' ? 'escura' : moldPadraoCor);
 grupos.forEach(g => svg.append(moldEl('path', {d: g.d, 'fill-rule': 'evenodd', fill: g.cor && (moldPadraoCor === 'original' || p.tipo === 'vetor') ? g.cor : unica})));
 return svg;
}
function moldPadroesLista() {
 const seg = moldCat.segmentos.find(s => s.id === mold.segmento);
 $('mold-padroes-titulo').textContent = `Prontos para ${seg.nome.toLowerCase()}`;
 const prontos = (moldCat.padroes.porSegmento[mold.segmento] || []).map(k => ({fonte: 'pronto:' + k, chave: k, tipo: 'pronto', nome: moldCat.padroes.modulos[k].nome}));
 $('mold-padroes').replaceChildren(...[...prontos, ...moldPadroesProprios].map(p => moldHtml('button', {type: 'button', role: 'radio', title: p.nome, ariaLabel: p.nome,
  ariaChecked: String(moldPadrao?.fonte === p.fonte), className: 'mold-padrao' + (moldPadrao?.fonte === p.fonte ? ' is-on' : ''),
  onclick: () => {
   if (moldPadraoSelecionado()) { moldSel = null; moldRender(); }
   moldPadrao = p;
   if (p.tipo === 'vetor' && p.grupos.length > 1) moldPadraoCor = 'original'; else if (moldPadraoCor === 'original') moldPadraoCor = 'secundaria';
   moldSyncPadrao();
  }}, moldPadraoPrevia(p))));
}
function moldPadraoSelecionado() { const f = moldSel != null ? mold.formas[moldSel] : null; return f?.padrao ? f : null; }
function moldSyncPadrao() {
 const editando = moldPadraoSelecionado();
 if (editando) {
  const p = editando.padrao, [tipo, chave] = p.fonte.split(':');
  if (moldPadrao?.fonte !== p.fonte) moldPadrao = {fonte: p.fonte, nome: p.nome, tipo, chave, id: chave, grupos: p.grupos || []};
  for (const [id, v] of [['tamanho', p.tamanho], ['espaco', p.espacamento], ['giro', p.giro], ['opacidade', editando.opacidade ?? 1]]) $('mold-padrao-' + id).value = v;
  $('mold-padrao-alvo').value = p.alvo === 'fundo' ? 'fundo' : 'forma';
  if (!editando.imagem) moldPadraoCor = p.corOriginal ? 'original' : editando.cor;
 }
 const tipo = moldPadrao?.tipo;
 $('mold-padrao-opts').hidden = !moldPadrao;
 $('mold-padrao-editando').hidden = !editando; $('mold-padrao-remover').hidden = !editando;
 $('mold-padrao-aplicar').textContent = editando ? 'Atualizar pattern' : 'Aplicar pattern';
 $('mold-padrao-alvo').disabled = !!editando;
 $('mold-padrao-cor-box').hidden = tipo === 'imagem';
 const extras = tipo === 'vetor' && moldPadrao.grupos.length > 1;
 $('mold-padrao-cor-livre').value = /^#/.test(moldPadraoCor) ? moldPadraoCor.toLowerCase() : moldCor(moldPadraoCor === 'original' ? 'secundaria' : moldPadraoCor).toLowerCase();
 $('mold-padrao-livre-amostra').style.setProperty('--sw', $('mold-padrao-cor-livre').value);
 $('mold-padrao-cores').replaceChildren(...moldSwatches(moldPadraoCor, c => moldPadraoDefinirCor(c)),
  ...(extras ? [moldHtml('button', {type: 'button', className: 'text-button', textContent: 'Cores originais', ariaPressed: String(moldPadraoCor === 'original'),
   onclick: () => moldPadraoDefinirCor('original')})] : []));
 moldPadraoRotulos(); moldPadroesLista(); moldAplicadosLista();
}

async function moldAplicarPadrao() {
 if (!moldPadrao) throw new Error('Escolha um pattern.');
 const editando = moldPadraoSelecionado(), a = moldPadraoAjustes();
 let alvo, pos;
 if (editando) {
  alvo = editando.padrao.alvo;
  pos = mold.formas.findIndex(f => f.padrao?.gid === editando.padrao.gid);
 } else if ($('mold-padrao-alvo').value === 'forma') {
  const f = moldSel > 0 ? mold.formas[moldSel] : null;
  if (!f || f.padrao) throw new Error('Clique numa forma do desenho na prévia e aplique de novo.');
  alvo = {d: f.d, regra: f.regra}; pos = moldSel + 1;
 } else { alvo = 'fundo'; pos = 1; }
 const r = await request('/api/molduras/padrao-aplicar', {tv: mold.tv, fonte: moldPadrao.fonte, alvo, tamanho: a.tamanho, espacamento: a.espacamento, giro: a.giro});
 const gid = Math.random().toString(36).slice(2, 10);
 const marca = {fonte: moldPadrao.fonte, nome: moldPadrao.nome, alvo, tamanho: a.tamanho, espacamento: a.espacamento, giro: a.giro, gid,
                corOriginal: moldPadraoCor === 'original', ...(moldPadrao.tipo === 'vetor' ? {grupos: moldPadrao.grupos} : {})};
 const op = a.opacidade < 1 ? a.opacidade : undefined;
 const novas = r.area
  ? [{d: r.area, regra: 'evenodd', cor: '#FFFFFF', opacidade: op, imagem: {id: moldPadrao.id, tamanho: a.tamanho, espacamento: a.espacamento, giro: a.giro, proporcao: r.proporcao}, padrao: marca}]
  : r.formas.map(f => ({d: f.d, regra: 'evenodd', opacidade: op, cor: moldPadraoCor === 'original' ? (f.cor || 'secundaria') : moldPadraoCor, corArquivo: f.cor || undefined, padrao: marca}));
 moldGuardar();
 if (editando) mold.formas = mold.formas.filter(f => f.padrao?.gid !== editando.padrao.gid);
 const i = Math.min(Math.max(pos, 1), mold.formas.length);
 mold.formas.splice(i, 0, ...novas);
 moldSel = i;
 moldRender(); moldSyncPadrao();
 toast(editando ? 'Pattern atualizado.' : 'Pattern aplicado. Clique nele na prévia para ajustar ou trocar a cor.');
}
// Troca a cor do pattern escolhido; num pattern já aplicado, recolore na hora todas as partes dele
function moldPadraoDefinirCor(c, historico = true) {
 moldPadraoCor = c;
 const f = moldPadraoSelecionado();
 if (f && !f.imagem) {
  if (historico) moldGuardar();
  let k = 0;
  for (const x of mold.formas) if (x.padrao?.gid === f.padrao.gid) { x.cor = c === 'original' ? (x.corArquivo || f.padrao.grupos?.[k]?.cor || 'secundaria') : c; k++; }
  f.padrao.corOriginal = c === 'original';
  moldMudou(); moldRender();
 }
 moldSyncPadrao();
}
// Tom suave: a cor do que está atrás do pattern, um pouco mais escura (fundo claro) ou mais clara (fundo escuro)
function moldTomSuave() {
 const f = moldPadraoSelecionado();
 // a cor de onde o pattern foi aplicado: o fundo ou a forma-alvo (nunca outro pattern)
 const alvo = f ? f.padrao.alvo : ($('mold-padrao-alvo').value === 'forma' && moldSel > 0 ? {d: mold.formas[moldSel].d} : 'fundo');
 const dona = alvo === 'fundo' ? mold.formas[0] : mold.formas.find(x => !x.padrao && x.d === alvo.d) || mold.formas[0];
 const base = moldCor(dona.cor);
 const rgb = [1, 3, 5].map(i => parseInt(base.slice(i, i + 2), 16));
 const claro = moldLum(base) > .35, mistura = claro ? [0, 0, 0] : [255, 255, 255], k = claro ? .1 : .16;
 return '#' + rgb.map((v, i) => Math.round(v + (mistura[i] - v) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// Lista dos patterns que estão no desenho: editar (seleciona) ou remover cada um, ou todos de uma vez
function moldAplicados() {
 const grupos = new Map();
 mold.formas.forEach((f, i) => { if (f.padrao && !grupos.has(f.padrao.gid)) grupos.set(f.padrao.gid, {i, f}); });
 return [...grupos.values()];
}
function moldAplicadosLista() {
 const lista = moldAplicados(), atual = moldPadraoSelecionado()?.padrao.gid;
 $('mold-aplicados-box').hidden = !lista.length;
 $('mold-aplicados').replaceChildren(...lista.map(({i, f}) => {
  const p = f.padrao, onde = p.alvo === 'fundo' ? 'no fundo' : 'numa forma';
  return moldHtml('li', {className: p.gid === atual ? 'is-on' : ''},
   moldHtml('span', {className: 'mold-aplicado-cor', style: `--sw:${f.imagem ? '#d4d7dc' : moldCor(f.cor)}`}),
   moldHtml('span', {className: 'mold-aplicado-nome'}, moldHtml('strong', {textContent: p.nome || 'Pattern'}), moldHtml('small', {textContent: onde})),
   moldHtml('button', {type: 'button', className: 'text-button', textContent: 'Editar', onclick: () => moldSelecionar(i)}),
   moldHtml('button', {type: 'button', className: 'text-button', textContent: 'Remover', ariaLabel: `Remover pattern ${p.nome || ''}`,
    onclick: () => { moldGuardar(); mold.formas = mold.formas.filter(x => x.padrao?.gid !== p.gid); moldSel = null; moldRender(); moldSyncPadrao(); toast('Pattern removido.'); }}));
 }));
}
function moldRemoverPadrao() {
 const f = moldPadraoSelecionado(); if (!f) return;
 moldGuardar(); mold.formas = mold.formas.filter(x => x.padrao?.gid !== f.padrao.gid); moldSel = null; moldRender(); moldSyncPadrao();
}
async function moldImportarPadrao(arquivo) {
 if (!arquivo) return;
 await guard(async () => {
  toast(`Lendo ${arquivo.name}…`);
  const r = await moldEnviar(arquivo, '/api/molduras/padrao');
  const p = {fonte: `${r.tipo}:${r.id}`, id: r.id, tipo: r.tipo, nome: r.nome, grupos: r.grupos || []};
  moldPadroesProprios.unshift(p);
  if (moldPadraoSelecionado()) { moldSel = null; moldRender(); }
  moldPadrao = p;
  moldPadraoCor = p.tipo === 'vetor' && p.grupos.length > 1 ? 'original' : 'secundaria';
  $('mold-padrao-aviso').hidden = !r.aviso; $('mold-padrao-aviso').textContent = r.aviso || '';
  $('toast').hidden = true; moldSyncPadrao();
 });
 $('mold-padrao-file').value = '';
}
// <pattern> do SVG com a mesma grade do servidor: fileiras alternadas deslocadas meio passo, girada em torno da origem
function moldPadraoImagem(f, i) {
 const m = f.imagem, passo = m.tamanho * (1 + m.espacamento);
 let w = m.tamanho, h = m.tamanho / m.proporcao; if (h > m.tamanho) { h = m.tamanho; w = m.tamanho * m.proporcao; }
 const pat = moldEl('pattern', {id: `mold-pat-${i}`, patternUnits: 'userSpaceOnUse', width: passo, height: 2 * passo, patternTransform: `rotate(${m.giro})`});
 for (const [x, y] of [[0, 0], [passo, 0], [0, 2 * passo], [passo, 2 * passo], [passo / 2, passo]])
  pat.append(moldEl('image', {href: `/molduras/padrao/${m.id}`, x: x - w / 2, y: y - h / 2, width: w, height: h, preserveAspectRatio: 'none'}));
 return pat;
}
$('mold-padrao-importar').onclick = () => $('mold-padrao-file').click();
$('mold-arte-importar').onclick = () => $('mold-arte-file').click();
$('mold-arte-file').onchange = () => moldImportarArte($('mold-arte-file').files[0]);
$('mold-padrao-file').onchange = () => moldImportarPadrao($('mold-padrao-file').files[0]);
$('mold-padrao-aplicar').onclick = () => guard(moldAplicarPadrao);
$('mold-padrao-remover').onclick = moldRemoverPadrao;
$('mold-remover-todos').onclick = () => {
 const n = moldAplicados().length; if (!n || !confirm(n > 1 ? `Remover os ${n} patterns do desenho?` : 'Remover o pattern do desenho?')) return;
 moldGuardar(); mold.formas = mold.formas.filter(f => !f.padrao); moldSel = null; moldRender(); moldSyncPadrao(); toast('Patterns removidos. Desfazer (Ctrl+Z) traz de volta.');
};
$('mold-padrao-suave').onclick = () => moldPadraoDefinirCor(moldTomSuave());
// cor livre: recolore ao vivo enquanto arrasta no seletor e vira um passo só no Desfazer
let moldCorLivreAntes = null;
$('mold-padrao-cor-livre').addEventListener('input', () => {
 const c = $('mold-padrao-cor-livre').value.toUpperCase(), f = moldPadraoSelecionado();
 $('mold-padrao-livre-amostra').style.setProperty('--sw', c);
 if (!f || f.imagem) return;
 if (!moldCorLivreAntes) moldCorLivreAntes = moldClone(mold.formas);
 for (const x of mold.formas) if (x.padrao?.gid === f.padrao.gid) x.cor = c;
 moldRender();
});
$('mold-padrao-cor-livre').addEventListener('change', () => {
 if (moldCorLivreAntes) { moldHist.push(moldCorLivreAntes); mold.editado = true; moldCorLivreAntes = null; }
 moldPadraoDefinirCor($('mold-padrao-cor-livre').value.toUpperCase(), false);
});
for (const id of ['tamanho', 'espaco', 'giro', 'opacidade']) $('mold-padrao-' + id).oninput = moldPadraoRotulos;

// ---------- barra flutuante e duplo clique ----------
// A edição da forma selecionada fica na própria prévia, logo acima dela (antes ficava só no passo 6, no fim do painel).
// Duplo clique numa forma abre a janelinha de Cor / Pattern. Apagar só pelo botão ou pela tecla Delete.
const moldShell = document.querySelector('.mold-shell');
const moldBarra = moldHtml('div', {id: 'mold-barra', className: 'mold-barra', role: 'toolbar', ariaLabel: 'Editar a forma selecionada', hidden: true});
const moldBotaoBarra = (acao, rotulo, ic, titulo) => moldHtml('button', {type: 'button', className: 'mold-barra-btn', title: titulo || rotulo, ariaLabel: titulo || rotulo,
 innerHTML: icon(ic) + `<span>${rotulo}</span>`, onclick: () => moldBarraAcao(acao)});
const moldBotoes = {
 cor: moldBotaoBarra('cor', 'Cor', 'palette', 'Trocar a cor (ou dê duplo clique na forma)'),
 pattern: moldBotaoBarra('pattern', 'Pattern', 'layout-grid', 'Colocar um pattern dentro da forma'),
 frente: moldBotaoBarra('frente', 'Frente', 'arrow-up-to-line', 'Trazer para frente'),
 tras: moldBotaoBarra('tras', 'Trás', 'arrow-down-to-line', 'Enviar para trás'),
 duplicar: moldBotaoBarra('duplicar', 'Duplicar', 'copy'),
 apagar: moldBotaoBarra('apagar', 'Apagar', 'trash', 'Apagar a forma (tecla Delete)'),
};
moldBarra.append(...Object.values(moldBotoes));
const moldPop = moldHtml('div', {id: 'mold-pop', className: 'mold-pop', role: 'dialog', ariaLabel: 'Cor ou pattern da forma', hidden: true});
moldShell.append(moldBarra, moldPop);
let moldPopAba = 'cor';

function moldBarraSync() {
 const f = moldSel != null ? mold?.formas[moldSel] : null;
 const el = f && moldView === 'folha' && !moldDrag ? document.querySelector(`#mold-formas [data-i="${moldSel}"]`) : null;
 if (!el) { moldBarra.hidden = true; moldPop.hidden = true; return; }
 const fundo = moldSel === 0, padrao = !!f.padrao;
 const mostra = {cor: !f.imagem, pattern: true, frente: !fundo, tras: !fundo, duplicar: !fundo && !padrao, apagar: !fundo};
 for (const [k, b] of Object.entries(moldBotoes)) b.hidden = !mostra[k];
 moldBotoes.pattern.querySelector('span').textContent = padrao ? 'Trocar pattern' : 'Pattern';
 moldBarra.hidden = false;
 // acima da forma (ou abaixo, se não couber), sempre dentro da área da prévia
 const caixa = moldShell.getBoundingClientRect(), r = el.getBoundingClientRect(), bw = moldBarra.offsetWidth, bh = moldBarra.offsetHeight;
 const topoForma = Math.max(r.top, caixa.top), baseForma = Math.min(r.bottom, caixa.bottom);
 let top = fundo ? 12 : topoForma - caixa.top - bh - 10;
 if (top < 8) top = Math.min(baseForma - caixa.top + 10, caixa.height - bh - 8);
 const meio = (Math.max(r.left, caixa.left) + Math.min(r.right, caixa.right)) / 2 - caixa.left;
 moldBarra.style.top = Math.max(8, top) + 'px';
 moldBarra.style.left = Math.min(Math.max(8, meio - bw / 2), caixa.width - bw - 8) + 'px';
 if (!moldPop.hidden) moldPopMontar();
}
function moldBarraAcao(acao) {
 if (acao === 'cor' || acao === 'pattern') return moldPopAbrir(acao, moldBarra.getBoundingClientRect());
 moldPop.hidden = true;
 $({frente: 'mold-frente', tras: 'mold-tras', duplicar: 'mold-duplicar', apagar: 'mold-apagar'}[acao]).click();
 if (acao === 'apagar') toast('Forma apagada. Para desfazer: Ctrl + Z.');
}

// Janelinha de Cor / Pattern, perto de onde a pessoa clicou
function moldPopAbrir(aba, perto) {
 moldPopAba = aba; moldPop.hidden = false; moldPopMontar();
 const caixa = moldShell.getBoundingClientRect(), pw = moldPop.offsetWidth, ph = moldPop.offsetHeight;
 const x = (perto.left ?? perto.x) - caixa.left, y = (perto.bottom ?? perto.y) - caixa.top + 8;
 moldPop.style.left = Math.min(Math.max(8, x), caixa.width - pw - 8) + 'px';
 moldPop.style.top = Math.min(Math.max(8, y), caixa.height - ph - 8) + 'px';
}
function moldPopMontar() {
 const f = moldSel != null ? mold.formas[moldSel] : null; if (!f) { moldPop.hidden = true; return; }
 if (f.imagem) moldPopAba = 'pattern';
 const aba = (id, rotulo) => moldHtml('button', {type: 'button', role: 'tab', className: 'mold-pop-aba', textContent: rotulo, ariaSelected: String(moldPopAba === id),
  disabled: id === 'cor' && !!f.imagem, onclick: () => { moldPopAba = id; moldPopMontar(); }});
 const fechar = moldHtml('button', {type: 'button', className: 'mold-pop-fechar', ariaLabel: 'Fechar', innerHTML: icon('x'), onclick: () => { moldPop.hidden = true; }});
 const corpo = moldHtml('div', {className: 'mold-pop-corpo', role: 'tabpanel'});
 if (moldPopAba === 'cor') {
  const atual = f.cor;
  const livre = moldHtml('input', {type: 'color', value: moldCor(atual).toLowerCase(), ariaLabel: 'Outra cor'});
  livre.addEventListener('change', () => moldPopCor(livre.value.toUpperCase()));
  corpo.append(moldHtml('p', {className: 'mold-pop-dica', textContent: f.padrao ? 'Cor do pattern' : moldSel === 0 ? 'Cor do fundo' : 'Cor desta forma'}),
   moldHtml('div', {className: 'mold-swatches'}, ...moldSwatches(atual, c => moldPopCor(c))),
   moldHtml('label', {className: 'mold-cor-input mold-pop-livre'}, moldHtml('span', {className: 'mold-papel-cor', style: `--sw:${moldCor(atual)}`}, livre), 'Outra cor'));
 } else {
  const seg = moldCat.segmentos.find(s => s.id === mold.segmento);
  const prontos = (moldCat.padroes.porSegmento[mold.segmento] || []).map(k => ({fonte: 'pronto:' + k, chave: k, tipo: 'pronto', nome: moldCat.padroes.modulos[k].nome}));
  const lista = [...prontos, ...moldPadroesProprios];
  corpo.append(moldHtml('p', {className: 'mold-pop-dica', textContent: !lista.length ? `Nenhum pattern pronto para ${seg?.nome.toLowerCase() || 'este ramo'}: importe um no passo 5.`
    : moldSel === 0 ? 'Pattern no fundo da moldura' : f.padrao ? 'Trocar o pattern' : 'Pattern dentro desta forma'}),
   moldHtml('div', {className: 'mold-padroes mold-pop-padroes'}, ...lista.map(p => moldHtml('button', {type: 'button', className: 'mold-padrao', title: p.nome, ariaLabel: p.nome,
    onclick: () => moldPopPattern(p)}, moldPadraoPrevia(p)))),
   moldHtml('button', {type: 'button', className: 'text-button', textContent: 'Mais ajustes: tamanho, giro, importar…', onclick: () => {
    moldPop.hidden = true; const passo = $('mold-padroes').closest('details'); passo.open = true; passo.scrollIntoView({behavior: 'smooth', block: 'start'});
   }}));
 }
 moldPop.replaceChildren(moldHtml('div', {className: 'mold-pop-topo', role: 'tablist'}, aba('cor', 'Cor'), aba('pattern', 'Pattern'), fechar), corpo);
}
function moldPopCor(c) {
 const f = mold.formas[moldSel];
 if (f.padrao) moldPadraoDefinirCor(c);
 else { moldGuardar(); f.cor = c; moldRender(); }
}
async function moldPopPattern(p) {
 const f = mold.formas[moldSel];
 moldPadrao = p;
 if (p.tipo === 'vetor' && p.grupos.length > 1) moldPadraoCor = 'original'; else if (moldPadraoCor === 'original') moldPadraoCor = 'secundaria';
 if (!f.padrao) $('mold-padrao-alvo').value = moldSel === 0 ? 'fundo' : 'forma';
 moldPop.hidden = true;
 await guard(moldAplicarPadrao);
}

// Duplo clique contado aqui: o primeiro clique redesenha a prévia (seleção) e o navegador perde o dblclick nativo
let moldUltimoToque = null;
$('mold-svg').addEventListener('pointerdown', e => {
 const alvo = e.target.closest('.mold-forma'); if (!alvo || e.button !== 0) { moldUltimoToque = null; return; }
 const i = Number(alvo.dataset.i), agora = performance.now(), u = moldUltimoToque;
 moldUltimoToque = {i, t: agora, x: e.clientX, y: e.clientY};
 if (u && u.i === i && agora - u.t < 450 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 6) {
  moldUltimoToque = null;
  setTimeout(() => moldPopAbrir(mold.formas[i]?.imagem ? 'pattern' : 'cor', {x: e.clientX, y: e.clientY}), 0);
 }
});
$('mold-svg').addEventListener('zoom', moldBarraSync);
window.addEventListener('resize', moldBarraSync);
document.addEventListener('pointerdown', e => { if (!moldPop.hidden && !moldPop.contains(e.target) && !moldBarra.contains(e.target) && !e.target.closest('#mold-svg')) moldPop.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !moldPop.hidden) { e.stopImmediatePropagation(); moldPop.hidden = true; } }, true);

// ---------- criar a arte em outro programa ----------
// VectorCraft: ida e volta por arquivo. O modelo tem a folha nas medidas desta moldura, o desenho atual e as guias em
// magenta (a volta as ignora); como a página tem a proporção da folha, cada forma volta exatamente onde foi desenhada.
// Claude (claude.ai, pela assinatura): o texto copiado traz as mesmas medidas; o SVG que ele entrega entra por "Importar arte".
const MOLD_VC_KEY = 'indoor-vectorcraft';  // o mesmo da Vetorização M6S: quem já confirmou lá não é perguntado de novo
function moldVcMostrar() {
 let tem = false; try { tem = localStorage.getItem(MOLD_VC_KEY) === 'sim'; } catch {}
 $('mold-vc-need').hidden = tem; $('mold-vc-steps').hidden = !tem; $('mold-vc-foot').hidden = !tem;
 $('mold-vc-heading').textContent = tem ? 'Editar no VectorCraft' : 'Você tem o VectorCraft?';
}
$('mold-vc-abrir').onclick = () => {
 const f = moldGeo.folha, tv = mold.tv;
 $('mold-vc-medidas').textContent = `Um SVG com a folha de ${moldCm(f.largura)} × ${moldCm(f.altura)} cm (TV ${tv.polegadas ? tv.polegadas + '"' : moldCm(tv.largura) + ' × ' + moldCm(tv.altura) + ' cm'}), o desenho atual na camada "Arte" e as guias em magenta: linha de corte, tela da TV, logo da Indoor e logo do cliente.`;
 $('mold-vc-salvo').textContent = ''; moldVcMostrar(); $('mold-vc-dialog').showModal();
};
$('mold-vc-have').onclick = () => { try { localStorage.setItem(MOLD_VC_KEY, 'sim'); } catch {} moldVcMostrar(); };
$('mold-vc-baixar').onclick = () => guard(async () => {
 const r = await request('/api/molduras/modelo', {tv: mold.tv, cores: mold.cores, formas: mold.formas});
 const tv = mold.tv, nome = `Moldura ${mold.cliente || 'nova'} - ${tv.polegadas ? tv.polegadas + ' polegadas' : moldCm(tv.largura) + 'x' + moldCm(tv.altura) + ' cm'} - modelo.svg`;
 const url = URL.createObjectURL(new Blob([r.svg], {type: 'image/svg+xml'}));
 const a = moldHtml('a', {href: url, download: nome}); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 $('mold-vc-salvo').textContent = `Baixado: ${nome} (na pasta de downloads do navegador).` + (r.fora ? ` ${r.fora} pattern${r.fora > 1 ? 's' : ''} de imagem não ${r.fora > 1 ? 'foram' : 'foi'} junto (só vetores).` : '');
});
// a volta usa o mesmo caminho do "Importar arte"; fecha a janela quando o arquivo for escolhido
$('mold-arte-file').addEventListener('change', () => { if ($('mold-vc-dialog').open) $('mold-vc-dialog').close(); });

$('mold-claude-copiar').onclick = () => guard(async () => {
 const r = await request('/api/molduras/instrucoes', {tv: mold.tv, cores: mold.cores, segmento: mold.segmento});
 try { await navigator.clipboard.writeText(r.texto); }
 catch {  // navegador sem permissão de área de transferência: copia pelo jeito antigo
  const t = moldHtml('textarea', {value: r.texto}); document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
 }
 toast('Instruções copiadas. Cole no claude.ai, troque a última linha pela arte que você quer, baixe o moldura.svg e use "Importar arte".');
});

// ---------- VectorCraft: atualização automática (Chrome e Edge) ----------
// Com a File System Access API, a pessoa escolhe o arquivo salvo uma vez e o navegador o acompanha: a cada Ctrl + S no
// VectorCraft, a moldura se atualiza sozinha (Ctrl + Z desfaz). Quem acompanha é o navegador, no computador da
// pessoa: funciona também no site oficial. Firefox e Safari não têm essa API: lá a volta é manual, com aviso.
const MOLD_VC_AUTO = 'showOpenFilePicker' in window;
let moldVcSync = null, moldVcTimer = 0;
const moldVcBarra = moldHtml('div', {id: 'mold-vc-sync', className: 'mold-vc-sync', hidden: true, role: 'status'});
moldShell.append(moldVcBarra);

function moldVcParar() {
 clearInterval(moldVcTimer); moldVcTimer = 0; moldVcSync = null; moldVcBarra.hidden = true;
}
function moldVcBarraMostrar(texto, botoes = []) {
 moldVcBarra.replaceChildren(moldHtml('span', {className: 'mold-vc-sync-ponto', ariaHidden: 'true'}), moldHtml('span', {textContent: texto}), ...botoes,
  moldHtml('button', {type: 'button', className: 'text-button', textContent: 'Parar', onclick: () => { moldVcParar(); toast('A moldura não acompanha mais o arquivo do VectorCraft.'); }}));
 moldVcBarra.hidden = false;
}
const moldVcAcompanhando = () => moldVcBarraMostrar(`Acompanhando ${moldVcSync.nome}: salve no VectorCraft e a moldura se atualiza.`);

async function moldVcTrazer(arquivo, primeira) {
 const r = await moldEnviar(arquivo, `/api/molduras/arte?tv=${encodeURIComponent(JSON.stringify(mold.tv))}`);
 moldAplicarArte(r);
 if (!primeira) toast(r.aviso || `Moldura atualizada com o que foi salvo no VectorCraft (${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}). Ctrl + Z desfaz.`);
 moldVcSync.formas = JSON.stringify(mold.formas);  // para saber se depois a moldura foi editada aqui no sistema
}
async function moldVcConferir(forcar) {
 const s = moldVcSync; if (!s || busy || $('molduras').hidden) return;
 let arquivo;
 try { arquivo = await s.handle.getFile(); }
 catch { moldVcParar(); toast('O arquivo do VectorCraft não está mais acessível (foi movido ou apagado). Escolha-o de novo.'); return; }
 if (!forcar && arquivo.lastModified === s.visto) return;
 // editaram aqui depois da última atualização: pergunta antes de passar por cima (sem janelas repetidas a cada 2 s)
 if (!forcar && JSON.stringify(mold.formas) !== s.formas) {
  if (s.pendente !== arquivo.lastModified) {
   s.pendente = arquivo.lastModified;
   moldVcBarraMostrar(`${s.nome} foi salvo no VectorCraft, mas a moldura também foi editada aqui.`,
    [moldHtml('button', {type: 'button', className: 'text-button', textContent: 'Trazer do VectorCraft', onclick: () => moldVcConferir(true)})]);
  }
  return;
 }
 s.visto = arquivo.lastModified; s.pendente = null;
 // arquivo no meio da gravação: tenta de novo na próxima volta; só avisa se continuar falhando
 await guard(async () => {
  try { await moldVcTrazer(arquivo, false); s.falhas = 0; moldVcAcompanhando(); }
  catch (e) { if (++s.falhas >= 3) throw e; s.visto = null; }
 });
}
async function moldVcEscolher() {
 if (!MOLD_VC_AUTO) { $('mold-arte-file').click(); return; }
 let handle;
 try {
  [handle] = await window.showOpenFilePicker({id: 'molduras-vectorcraft', types: [{description: 'Arte vetorial (SVG, PDF ou AI)',
   accept: {'image/svg+xml': ['.svg'], 'application/pdf': ['.pdf', '.ai']}}]});
 } catch { return; }  // a pessoa cancelou
 const arquivo = await handle.getFile();
 if (!/\.(svg|pdf|ai)$/i.test(arquivo.name)) { toast('Escolha o arquivo salvo como SVG, PDF ou AI.'); return; }
 if (mold.editado && !confirm('O arquivo do VectorCraft substitui o desenho atual, com as edições. Continuar?')) return;
 $('mold-vc-dialog').close();
 moldVcParar();
 moldVcSync = {handle, nome: arquivo.name, visto: arquivo.lastModified, falhas: 0};
 await guard(async () => {
  try { toast(`Lendo ${arquivo.name}…`); await moldVcTrazer(arquivo, true); }
  catch (e) { moldVcParar(); throw e; }
 });
 if (!moldVcSync) return;
 moldVcAcompanhando();
 moldVcTimer = setInterval(moldVcConferir, 2000);
 toast(`Pronto. A cada vez que você salvar ${arquivo.name} no VectorCraft (Ctrl + S), a moldura se atualiza aqui.`);
}
$('mold-vc-voltar').onclick = moldVcEscolher;
// ao voltar para a aba depois de salvar no VectorCraft, confere na hora (sem esperar a próxima volta)
document.addEventListener('visibilitychange', () => { if (!document.hidden && moldVcSync) moldVcConferir(); });
// passo 3 da janela: o que acontece depois depende do navegador
$('mold-vc-auto').textContent = MOLD_VC_AUTO
 ? 'Salve como SVG, PDF ou AI e escolha o arquivo aqui uma vez. Depois, a cada vez que você salvar no VectorCraft (Ctrl + S), a moldura se atualiza sozinha.'
 : 'Salve como SVG, PDF ou AI e escolha o arquivo aqui. Cada forma volta exatamente onde foi desenhada.';
$('mold-vc-manual').hidden = MOLD_VC_AUTO;

moldEventos();
