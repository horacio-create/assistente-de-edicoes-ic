// Ofertas de supermercados — interface do módulo. Isolado numa função para não colidir com o app.js
// (que define $, toast, request…). IDs com prefixo "of-"; API em /api/ofertas; arquivos em /ofertas.
(() => {
'use strict';
const el = (id) => document.getElementById('of-' + id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const STATUS = { na_fila: 'Na fila', gerando: 'Gerando', pronto: 'Pronto', falhou: 'Falhou', cancelado: 'Cancelado', interrompido: 'Interrompido' };
const TELAS = {
  catalogo: ['Novo vídeo', 'Escolha um template. Preencha os produtos. O vídeo sai pronto para a tela.'],
  editor: ['', 'Preencha os campos. A prévia atualiza sozinha.'],
  pedidos: ['Pedidos recentes', 'Retome um vídeo de onde parou.'],
  fila: ['Vídeos gerados', 'Acompanhe a fila e baixe os MP4 prontos.'],
  biblioteca: ['Biblioteca de imagens', 'Recortes prontos para reaproveitar.'],
  templates: ['Templates', 'Publique layouts criados pelos designers.'],
};
const state = { tela: 'catalogo', pronto: null, imagens: {}, pedido: null, esquema: null, validacao: [], timer: null, salvando: null, pendente: false, alvoImagem: null, selecionada: null, encarte: [], ordem: [], vistos: {}, encartes: [], encarteSel: null, encartesVistos: {}, nomes: {} };

async function api(path, { body, raw } = {}) {
  const opts = { method: body || raw ? 'POST' : 'GET', headers: {} };
  if (opts.method === 'POST') opts.headers['X-Indoor'] = '1';
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (raw) opts.body = raw;
  const r = await fetch('/api/ofertas' + path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
// envio de arquivo com progresso real no painel de tarefas; terminado o upload, mostra a fase seguinte
const enviarArquivo = (path, arquivo, tarefa, depois = 'Processando…') =>
  IndoorTarefas.enviar('/api/ofertas' + path, arquivo, {
    headers: { 'X-Indoor': '1' },
    onProgresso: (p) => (p < 1 ? tarefa.progresso(p).detalhe(`Enviando… ${Math.round(p * 100)}%`) : tarefa.progresso(null).detalhe(depois)),
  });
let avisoTimer;
function aviso(msg, ms = 4200) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(avisoTimer); avisoTimer = setTimeout(() => (t.hidden = true), ms); }
const falha = (e) => aviso(e.message || String(e), 6500);
function confirmar(titulo, texto, botao = 'Confirmar') {
  return new Promise((ok) => {
    el('confirmar-titulo').textContent = titulo; el('confirmar-texto').textContent = texto; el('confirmar-ok').textContent = botao;
    const d = el('confirmar-dialog'); d.showModal();
    el('confirmar-ok').onclick = () => { d.close(); ok(true); };
    d.onclose = () => ok(false);
  });
}
function soltar(alvo, aoSoltar) {
  alvo.addEventListener('dragover', (e) => { e.preventDefault(); alvo.classList.add('over'); });
  alvo.addEventListener('dragleave', () => alvo.classList.remove('over'));
  alvo.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); alvo.classList.remove('over'); if (e.dataTransfer.files.length) aoSoltar([...e.dataTransfer.files]); });
}

// ---------- ativação e abas ----------
async function ativar() {
  if (state.pronto === null) {
    try { const s = await api('/status'); state.pronto = s.pronto; el('indisponivel').textContent = s.motivo; }
    catch (e) { state.pronto = false; el('indisponivel').textContent = e.message; }
    el('indisponivel').hidden = state.pronto;
    el('conteudo').hidden = !state.pronto;
    if (state.pronto) { await carregarNomes().catch(() => {}); carregarFila(); carregarEncartes(); }
  }
  if (state.pronto) mostrar(state.tela);
}
// o app.js troca as seções (showView); ativa quando "Ofertas" fica visível
new MutationObserver(() => { if (!document.getElementById('ofertas').hidden) ativar(); else salvarAgora(); })
  .observe(document.getElementById('ofertas'), { attributes: true, attributeFilter: ['hidden'] });

async function mostrar(tela) {
  if (state.pedido && tela !== 'editor') await salvarAgora();
  state.tela = tela;
  document.querySelectorAll('#ofertas .of-tela').forEach((t) => (t.hidden = t.id !== 'of-' + tela));
  document.querySelectorAll('#ofertas .aba').forEach((a) => a.setAttribute('aria-selected', String(a.dataset.tela === (tela === 'editor' ? 'catalogo' : tela))));
  const [titulo, sub] = TELAS[tela];
  document.getElementById('page-title').textContent = tela === 'editor' ? state.esquema?.nome || '' : titulo;
  document.getElementById('page-subtitle').textContent = sub;
  if (tela === 'catalogo') carregarCatalogo();
  if (tela === 'editor') desenharCardEncarte();
  if (tela === 'pedidos') carregarPedidos();
  if (tela === 'fila') carregarFila();
  if (tela === 'biblioteca') carregarBiblioteca();
  if (tela === 'templates') carregarTemplatesAdmin();
}
document.querySelectorAll('#ofertas .aba').forEach((a) => a.addEventListener('click', () => mostrar(a.dataset.tela)));

// ---------- catálogo ----------
// nome legível do template para Pedidos e Vídeos gerados (as listas guardam só o id)
async function carregarNomes() { const lista = await api('/templates'); lista.forEach((t) => (state.nomes[t.id] = t.nome)); return lista; }
const nomeTemplate = (id) => state.nomes[id] || id;
// o título padrão já começa com o nome do template: só repete quando o título foi trocado
const origem = (titulo, id) => (titulo.startsWith(nomeTemplate(id)) ? '' : esc(nomeTemplate(id)) + ' · ');
async function carregarCatalogo() {
  try {
    const lista = await carregarNomes();
    el('lista-templates').innerHTML = lista.length ? lista.map((t) => `
      <button class="template-card ${t.erros.length ? 'invalido' : ''}" data-id="${esc(t.id)}" ${t.erros.length ? 'disabled' : ''}>
        ${t.capa ? `<img src="/ofertas/capa/${esc(t.id)}.png" alt="">` : '<span class="sem-capa">Sem capa</span>'}
        <span class="corpo"><strong>${esc(t.nome)}</strong><small>${esc(t.cliente)}</small><small>${esc(t.descricao)}</small>
        <span class="usar">${t.erros.length ? 'Template com problemas — veja em Templates' : 'Usar este template →'}</span></span></button>`).join('')
      : '<div class="vazio">Nenhum template publicado ainda. Publique o primeiro em Templates.</div>';
    el('lista-templates').querySelectorAll('.template-card:not([disabled])').forEach((c) => c.addEventListener('click', async () => {
      try { abrirPedido(await api('/pedidos', { body: { template: c.dataset.id } })); } catch (e) { falha(e); }
    }));
  } catch (e) { falha(e); }
}

// ---------- editor ----------
async function abrirPedido(pedido) {
  state.esquema = await api('/esquema?template=' + encodeURIComponent(pedido.template));
  state.pedido = pedido;
  el('titulo').value = pedido.titulo;
  el('formato').textContent = `${state.esquema.largura} × ${state.esquema.altura} px · ${state.esquema.duracao}s`;
  el('status-formato').textContent = `MP4 ${state.esquema.largura}×${state.esquema.altura} · ${state.esquema.duracao}s · entra na fila de geração`;
  state.validacao = pedido.validacao || [];
  await montarFormulario();
  estadoSalvo(`Salvo · ${hora(pedido.atualizado)}`);
  atualizarPreview(state.esquema.capaEm);  // abre parado num momento com conteúdo, não no quadro vazio do início
  await mostrar('editor');
}

const valor = (caminho) => caminho.reduce((o, k) => o?.[k], state.pedido.dados);
function definir(caminho, v) {
  let o = state.pedido.dados;
  caminho.slice(0, -1).forEach((k) => (o = o[k]));
  o[caminho.at(-1)] = v;
  agendarSalvar();
}
function urlImagem(v) {
  if (!v) return '';
  if (v.startsWith('biblioteca:')) return `/ofertas/miniatura/${v.slice(11)}.png`;
  return `/ofertas/preview/${state.pedido.id}/${v}`;
}

function campo(def, caminho, idVar) {
  const div = document.createElement('div');
  div.className = 'campo';
  div.dataset.var = idVar;
  const v = valor(caminho);
  const idInput = `of-c-${idVar}`;
  const rotulo = `<label for="${idInput}">${esc(def.rotulo)}${def.opcional ? ' <small>(opcional)</small>' : ''}${def.tipo === 'texto' && def.max ? `<span class="contador-texto">${String(v ?? '').length}/${def.max}</span>` : ''}</label>`;
  const ajuda = def.ajuda ? `<p class="help">${esc(def.ajuda)}</p>` : '';
  const erro = '<div class="erro-campo"></div>';
  if (def.tipo === 'imagem') {
    const biblioteca = String(v || '').startsWith('biblioteca:');
    const info = biblioteca ? state.imagens[v.slice(11)] : null;
    div.innerHTML = `<label>${esc(def.rotulo)}</label><div class="imagem-campo"><img class="miniatura" alt="Imagem atual" src="${esc(urlImagem(v))}">
      <div class="acoes"><button type="button" class="text-button trocar">Trocar imagem…</button>${info && !info.transparente ? '<button type="button" class="text-button sem-fundo">Remover fundo</button>' : ''}
      <small title="${esc(info?.nome || '')}">${info ? esc(info.nome) : biblioteca ? 'Da biblioteca' : 'Imagem padrão do template'}</small>
      ${info && !info.transparente ? '<small class="aviso-fundo">Esta imagem tem fundo</small>' : ''}</div></div>${erro}${ajuda}`;
    const item = caminho.length > 1 ? state.esquema.campos.find((c) => c.id === caminho[0]) : null;
    const abrir = () => abrirImagens(caminho, item ? `${item.rotuloItem || item.rotulo} ${caminho[1] + 1} · ${def.rotulo}` : def.rotulo);
    div.querySelector('.trocar').onclick = abrir;
    div.querySelector('.miniatura').onclick = abrir;
    const semFundo = div.querySelector('.sem-fundo');
    if (semFundo) semFundo.onclick = async () => {
      semFundo.disabled = true;
      const img = await removerFundoBiblioteca(v.slice(11));
      if (img) { definir(caminho, 'biblioteca:' + img.id); montarFormulario(); } else semFundo.disabled = false;
    };
    return div;
  }
  let controle;
  if (def.tipo === 'opcoes') controle = `<select id="${idInput}">${def.opcoes.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (def.tipo === 'numero') controle = `<div class="value-control"><span class="range-track"><input id="${idInput}" type="range" min="${def.min ?? 0}" max="${def.max ?? 1}" step="${def.passo ?? 0.05}" value="${esc(v)}"></span><span class="number-unit"><input type="number" aria-label="${esc(def.rotulo)}" min="${Math.round((def.min ?? 0) * 100)}" max="${Math.round((def.max ?? 1) * 100)}" step="5" value="${Math.round(Number(v) * 100)}"><span>%</span></span></div>`;
  else if (def.tipo === 'cor') controle = `<input id="${idInput}" type="color" value="${esc(v)}">`;
  else if (def.tipo === 'booleano') controle = `<label class="check"><input id="${idInput}" type="checkbox" ${v ? 'checked' : ''}> ${esc(def.rotulo)}</label>`;
  else if (def.tipo === 'preco') controle = `<div class="preco"><span>R$</span><input id="${idInput}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(v)}"></div>`;
  else controle = `<input id="${idInput}" autocomplete="off" ${def.max ? `maxlength="${def.max + 20}"` : ''} value="${esc(v)}">`;
  div.innerHTML = (def.tipo === 'booleano' ? '' : rotulo) + controle + erro + ajuda;
  if (def.tipo === 'numero') {
    const [faixa, numero] = div.querySelectorAll('input');
    faixa.oninput = () => { numero.value = Math.round(faixa.value * 100); definir(caminho, Number(faixa.value)); };
    numero.onchange = () => { faixa.value = numero.value / 100; definir(caminho, Number(numero.value) / 100); };
  } else {
    const input = div.querySelector('input,select');
    input.addEventListener('input', () => {
      definir(caminho, def.tipo === 'booleano' ? input.checked : input.value);
      const contador = div.querySelector('.contador-texto');
      if (contador) contador.textContent = `${input.value.length}/${def.max}`;
    });
  }
  return div;
}

async function montarFormulario() {
  // nome e transparência das imagens da biblioteca usadas no pedido (para o "Remover fundo")
  const ids = JSON.stringify(state.pedido.dados).match(/biblioteca:[0-9a-f]{32}/g)?.map((x) => x.slice(11)).filter((i) => !state.imagens[i]) || [];
  if (ids.length) (await api('/imagens?ids=' + [...new Set(ids)].join(','))).forEach((i) => (state.imagens[i.id] = i));
  const form = el('formulario');
  const rolagem = form.scrollTop;
  form.innerHTML = '<h3>Conteúdo</h3>';
  for (const def of state.esquema.campos) {
    if (def.tipo !== 'lista') { form.append(campo(def, [def.id], def.id)); continue; }
    const tamanho = def.grupo?.tamanho || def.itens;
    for (let g = 0; g < def.itens / tamanho; g++) {
      const grupo = document.createElement('section');
      grupo.className = 'grupo';
      grupo.innerHTML = `<h4>${esc(def.grupo ? `${def.grupo.rotulo} ${g + 1}` : def.rotulo)}</h4>`;
      for (let i = g * tamanho; i < (g + 1) * tamanho; i++) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `<div class="item-titulo"><b>${i + 1}</b>${esc(def.rotuloItem || def.rotulo)} ${i + 1}</div>`;
        let par = null;
        for (const sub of def.campos) {
          const c = campo(sub, [def.id, i, sub.id], `${def.id}_${i + 1}_${sub.id}`);
          if (sub.tipo === 'preco') { // preços lado a lado
            if (!par) { par = document.createElement('div'); par.className = 'dupla'; card.append(par); }
            par.append(c);
            if (par.children.length === 2) par = null;
          } else { par = null; card.append(c); }
        }
        grupo.append(card);
      }
      form.append(grupo);
    }
  }
  form.scrollTop = rolagem;
  aplicarValidacao(state.validacao);
}

function aplicarValidacao(detalhes) {
  state.validacao = detalhes;
  el('formulario').querySelectorAll('.com-erro').forEach((e) => e.classList.remove('com-erro'));
  const gerais = [];
  for (const d of detalhes) {
    const alvo = d.campo && el('formulario').querySelector(`[data-var="${d.campo}"]`);
    if (!alvo) { gerais.push(d.mensagem); continue; }
    alvo.classList.add('com-erro');
    alvo.querySelector('.erro-campo').textContent = d.mensagem;
    alvo.closest('.item-card')?.classList.add('com-erro');
  }
  el('resumo-erros').innerHTML = gerais.map((m) => `<p>${esc(m)}</p>`).join('');
  const s = el('status-validacao');
  s.className = detalhes.length ? 'pendente' : 'ok';
  s.textContent = detalhes.length ? `${detalhes.length} ${detalhes.length === 1 ? 'campo precisa' : 'campos precisam'} de atenção` : 'Tudo certo para gerar';
  el('gerar').disabled = detalhes.length > 0;
}

const PENDENTE = 'Alterações não salvas…';
function estadoSalvo(t) { el('save-state').textContent = t; }
function agendarSalvar() {
  estadoSalvo(PENDENTE);
  clearTimeout(state.timer);
  state.timer = setTimeout(salvarAgora, 650);
}
async function salvarAgora() {
  clearTimeout(state.timer);
  if (!state.pedido) return;
  if (state.salvando) { state.pendente = true; return state.salvando; }
  if (el('save-state').textContent !== PENDENTE) return;
  estadoSalvo('Salvando…');
  state.salvando = (async () => {
    try {
      const r = await api('/pedido-salvar', { body: { id: state.pedido.id, revision: state.pedido.revision, titulo: el('titulo').value, dados: state.pedido.dados } });
      state.pedido.revision = r.revision;
      state.pedido.titulo = el('titulo').value;
      aplicarValidacao(r.validacao);
      estadoSalvo(`Salvo · ${hora(new Date().toISOString())}`);
      atualizarPreview();
    } catch (e) { estadoSalvo('Não foi possível salvar'); falha(e); }
    finally { state.salvando = null; }
  })();
  await state.salvando;
  if (state.pendente) { state.pendente = false; estadoSalvo(PENDENTE); await salvarAgora(); }
}
el('titulo').addEventListener('input', agendarSalvar);

function atualizarPreview(inicio) {
  const player = el('player');
  const tempo = inicio ?? (player.currentTime || 0);
  const tocando = player.ready && !player.paused;
  player.addEventListener('ready', () => { if (tempo) player.seek(tempo); if (tocando) player.play(); }, { once: true });
  player.setAttribute('src', `/ofertas/preview/${state.pedido.id}/index.html?v=${state.pedido.revision}`);
}

el('gerar').addEventListener('click', async () => {
  await salvarAgora();
  try {
    const r = await api('/gerar', { body: { id: state.pedido.id, revision: state.pedido.revision } });
    if (!r.ok) { aplicarValidacao(r.validacao); aviso('Corrija os campos marcados antes de gerar.'); return; }
    aviso('Vídeo enviado para a fila de geração.');
    mostrar('fila');
  } catch (e) { falha(e); }
});

// ---------- escolha de imagem ----------
async function abrirImagens(caminho, rotulo) {
  state.alvoImagem = caminho;
  state.selecionada = null;
  el('imagem-dialog-titulo').textContent = rotulo;
  el('usar-imagem').disabled = el('remover-fundo').disabled = true;
  el('busca-dialog').value = '';
  el('imagem-dialog').showModal();
  await gradeImagens(el('grade-dialog'), '', true);
}
async function gradeImagens(alvo, busca, escolha) {
  const imagens = await api('/imagens?busca=' + encodeURIComponent(busca));
  imagens.forEach((i) => (state.imagens[i.id] = i));
  alvo.innerHTML = imagens.length ? imagens.map((i) => `
    <button class="card ${escolha && state.selecionada === i.id ? 'selected' : ''}" data-id="${i.id}" title="${esc(i.nome)}">
      <img class="thumb" src="/ofertas/miniatura/${i.id}.png" alt="" loading="lazy">
      ${!escolha && !i.transparente ? '<span class="edit-card secondary sem-fundo">Remover fundo</span>' : ''}
      ${!escolha ? '<span class="edit-card secondary apagar" title="Apagar da biblioteca">Apagar</span>' : ''}
      <span class="card-body"><strong>${esc(i.nome)}</strong><small>${i.largura} × ${i.altura}px · ${i.transparente ? 'transparente' : 'com fundo'}</small><small>${esc(i.origem)}</small></span></button>`).join('')
    : `<div class="vazio">${busca ? 'Nada encontrado com esse nome.' : 'Nenhuma imagem ainda. Envie arquivos ou importe um encarte.'}</div>`;
  alvo.querySelectorAll('.card').forEach((c) => c.addEventListener('click', async (e) => {
    if (e.target.classList.contains('sem-fundo')) return removerFundoBiblioteca(c.dataset.id);
    if (e.target.classList.contains('apagar')) return apagarImagem(c.dataset.id);
    if (!escolha) return;
    state.selecionada = c.dataset.id;
    alvo.querySelectorAll('.card').forEach((x) => x.classList.toggle('selected', x === c));
    el('usar-imagem').disabled = el('remover-fundo').disabled = false;
  }));
  alvo.querySelectorAll('.card').forEach((c) => c.addEventListener('dblclick', () => escolha && el('usar-imagem').click()));
}
async function enviarImagens(arquivos) {
  let ultima = null;
  await Promise.all(arquivos.map(async (f) => {
    const t = IndoorTarefas.criar(f.name, 'Enviando…').progresso(0);
    try {
      const img = await enviarArquivo('/imagem?nome=' + encodeURIComponent(f.name), f, t, 'Salvando na biblioteca…');
      state.imagens[img.id] = img; ultima = img;
      t.concluir(img.transparente ? 'Na biblioteca' : 'Na biblioteca · imagem com fundo');
    } catch (e) { t.falhar(e.message); }
  }));
  return ultima;
}
async function removerFundoBiblioteca(id) {
  const nome = state.imagens[id]?.nome || 'imagem';
  const t = IndoorTarefas.criar(`Remover fundo · ${nome}`, 'Removendo o fundo… a primeira vez pode levar até 1 minuto');
  try { const img = await api('/imagem-remover-fundo', { body: { id } }); state.imagens[img.id] = img; t.concluir('Versão sem fundo salva na biblioteca'); return img; }
  catch (e) { t.falhar(e.message); }
  finally { if (!el('biblioteca').hidden) carregarBiblioteca(); }
}
async function apagarImagem(id) {
  const nome = state.imagens[id]?.nome || 'imagem';
  if (!(await confirmar(`Apagar ${nome}?`, 'A imagem sai da biblioteca. Imagens em uso num pedido ou encarte não podem ser apagadas.', 'Apagar'))) return;
  try { await api('/imagem-excluir', { body: { id } }); delete state.imagens[id]; aviso(`${nome} apagada.`); carregarBiblioteca(); } catch (e) { falha(e); }
}
async function aposEnvioNoDialog(img) {
  if (img) state.selecionada = img.id;
  await gradeImagens(el('grade-dialog'), '', true);
  el('usar-imagem').disabled = el('remover-fundo').disabled = !state.selecionada;
}
el('busca-dialog').addEventListener('input', (e) => gradeImagens(el('grade-dialog'), e.target.value, true));
el('enviar-dialog').addEventListener('click', () => { el('arquivo-imagem').dataset.destino = 'dialog'; el('arquivo-imagem').click(); });
soltar(el('grade-dialog'), async (fs) => aposEnvioNoDialog(await enviarImagens(fs)));
el('usar-imagem').addEventListener('click', () => {
  definir(state.alvoImagem, 'biblioteca:' + state.selecionada);
  el('imagem-dialog').close();
  montarFormulario();
});
el('remover-fundo').addEventListener('click', async () => {
  el('remover-fundo').disabled = true;
  const img = await removerFundoBiblioteca(state.selecionada);
  if (img) state.selecionada = img.id;
  await gradeImagens(el('grade-dialog'), el('busca-dialog').value, true);
  el('remover-fundo').disabled = false;
});
el('arquivo-imagem').addEventListener('change', async (e) => {
  const fs = [...e.target.files]; e.target.value = '';
  const img = await enviarImagens(fs);
  if (e.target.dataset.destino === 'dialog') aposEnvioNoDialog(img); else carregarBiblioteca();
});

// ---------- encartes (card no editor) ----------
// A leitura do PDF roda no servidor e o resultado fica salvo; o progresso aparece no painel de tarefas.
const listaPrincipal = () => state.esquema?.campos.find((c) => c.tipo === 'lista');
const ENC_STATUS = { lendo: 'Lendo…', pronto: 'Pronto', falhou: 'Falhou' };
const tarefaEncarte = {};  // id do encarte -> tarefa no painel
let encTimer;

async function carregarEncartes() {
  clearTimeout(encTimer);
  try {
    state.encartes = await api('/encartes');
    for (const e of state.encartes) {
      if (e.status === 'lendo' && !tarefaEncarte[e.id]) tarefaEncarte[e.id] = IndoorTarefas.criar(e.nome, 'Lendo encarte…');
      const t = tarefaEncarte[e.id];
      if (t && t.estado === 'andamento' && e.status === 'pronto') {
        t.concluir(`${e.itens.length} produtos encontrados`);
        if (!state.encarteSel || state.encartesVistos[state.encarteSel] !== 'pronto') state.encarteSel = e.id;
      }
      if (t && t.estado === 'andamento' && e.status === 'falhou') t.falhar(e.erro || 'Não foi possível ler o PDF');
      state.encartesVistos[e.id] = e.status;
    }
    if (!state.encarteSel && state.encartes.length) state.encarteSel = state.encartes[0].id;
    if (!el('editor').hidden) desenharCardEncarte();
    if (state.encartes.some((e) => e.status === 'lendo')) encTimer = setTimeout(carregarEncartes, 1500);
  } catch (e) { encTimer = setTimeout(carregarEncartes, 8000); }
}
async function enviarEncarte(arquivo) {
  if (!arquivo) return;
  const t = IndoorTarefas.criar(arquivo.name, 'Enviando…').progresso(0);
  try {
    const r = await enviarArquivo('/encarte?nome=' + encodeURIComponent(arquivo.name), arquivo, t, 'Lendo encarte…');
    tarefaEncarte[r.id] = t.detalhe('Lendo encarte…').progresso(null);
    state.encarteSel = r.id; state.ordem = [];
    await carregarEncartes();
  } catch (e) { t.falhar(e.message); }
}
el('arquivo-pdf').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; enviarEncarte(f); });
el('encarte-enviar').addEventListener('click', () => el('arquivo-pdf').click());
soltar(el('encarte-card'), (fs) => enviarEncarte(fs.find((f) => /\.pdf$/i.test(f.name)) || fs[0]));

el('encarte-apagar').addEventListener('click', async () => {
  const enc = state.encartes.find((e) => e.id === state.encarteSel);
  if (!enc) return;
  if (!(await confirmar(`Apagar ${enc.nome}?`, 'Remove o encarte e a lista de produtos deste card. As imagens continuam na Biblioteca.', 'Apagar'))) return;
  try {
    await api('/encarte-excluir', { body: { id: enc.id } });
    aviso(`${enc.nome} apagado. As imagens continuam na Biblioteca.`);
    state.encarteSel = null; state.ordem = [];
    await carregarEncartes();
  } catch (e) { falha(e); }
});

function itemEncarte(it) {
  return `<span class="card-body"><strong title="${esc(it.nome)}">${esc(it.nome)}</strong>
    <small class="preco-sugerido">R$ ${esc(it.por)}${it.unidade ? ' ' + esc(it.unidade) : ''}</small><small>${it.de ? 'de R$ ' + esc(it.de) : 'sem preço normal'}</small></span>`;
}
function desenharCardEncarte() {
  const card = el('encarte-card');
  card.hidden = !listaPrincipal();
  if (card.hidden) return;
  const recentes = state.encartes.slice(0, 8);
  el('encarte-lista').innerHTML = recentes.map((e) => `<button type="button" class="chip ${e.id === state.encarteSel ? 'ativo' : ''}" data-id="${e.id}">
    <strong>${esc(e.nome)}</strong><small>${e.status === 'pronto' ? `${e.itens.length} produtos · ${hora(e.criado)}` : ENC_STATUS[e.status]}</small></button>`).join('');
  el('encarte-lista').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { state.encarteSel = c.dataset.id; state.ordem = []; desenharCardEncarte(); }));
  const enc = state.encartes.find((e) => e.id === state.encarteSel);
  el('encarte-apagar').hidden = !enc || enc.status === 'lendo';
  el('encarte-vazio').hidden = state.encartes.length > 0;
  const st = el('encarte-status');
  st.hidden = !enc || enc.status === 'pronto';
  if (enc?.status === 'lendo') st.textContent = `Lendo ${enc.nome}… o progresso aparece no painel de tarefas, no canto da tela.`;
  if (enc?.status === 'falhou') st.textContent = enc.erro || 'Não foi possível ler este PDF.';
  const pronto = enc?.status === 'pronto';
  el('encarte-itens').hidden = el('encarte-dica').hidden = !pronto;
  if (!pronto) el('usar-encarte').hidden = true;
  if (pronto && state.encarte !== enc.itens) { state.encarte = enc.itens; state.ordem = state.ordem.filter((k) => k < enc.itens.length); }
  if (pronto) desenharEncarte();
}
function desenharEncarte() {
  const max = listaPrincipal().itens;
  el('encarte-itens').innerHTML = state.encarte.map((it, k) => {
    const pos = state.ordem.indexOf(k);
    return `<button class="card ${pos >= 0 ? 'selected' : ''}" data-k="${k}">${pos >= 0 ? `<span class="ordem">${pos + 1}</span>` : ''}
      <img class="thumb" src="/ofertas/miniatura/${it.imagem}.png" alt="" loading="lazy">${itemEncarte(it)}</button>`;
  }).join('');
  el('encarte-itens').querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
    const k = Number(c.dataset.k), i = state.ordem.indexOf(k);
    if (i >= 0) state.ordem.splice(i, 1); else if (state.ordem.length < max) state.ordem.push(k); else return aviso(`Este template usa ${max} produtos.`);
    desenharEncarte();
  }));
  el('usar-encarte').hidden = !state.ordem.length;
  el('usar-encarte').textContent = `Preencher ${state.ordem.length} de ${max} produtos`;
  el('encarte-dica').textContent = state.ordem.length ? `${state.ordem.length}/${max} escolhidos · clique de novo para desmarcar` : `Clique em até ${max} produtos, na ordem do vídeo.`;
}
el('usar-encarte').addEventListener('click', () => {
  const lista = listaPrincipal();
  const subs = Object.fromEntries(lista.campos.map((s) => [s.id, s]));
  state.ordem.forEach((k, i) => {
    const it = state.encarte[k], alvo = state.pedido.dados[lista.id][i];
    if (subs.nome) alvo.nome = it.nome;
    if (subs.imagem) alvo.imagem = 'biblioteca:' + it.imagem;
    if (subs.por) alvo.por = it.por;
    if (subs.de) alvo.de = it.de;
    if (subs.unidade && subs.unidade.opcoes?.includes(it.unidade)) alvo.unidade = it.unidade;
  });
  const n = state.ordem.length;
  state.ordem = [];
  desenharEncarte();
  montarFormulario();
  agendarSalvar();
  aviso(`${n} produtos preenchidos a partir do encarte. Confira antes de gerar.`);
  el('formulario').scrollTo({ top: 0, behavior: 'smooth' });
});

// ---------- pedidos ----------
async function carregarPedidos() {
  try {
    const [lista] = await Promise.all([api('/pedidos'), carregarNomes()]);
    el('lista-pedidos').innerHTML = lista.length ? lista.map((p) => {
      const existe = p.template in state.nomes;
      return `
      <div class="recent-card secondary" data-id="${p.id}">${existe ? `<img class="capa" src="/ofertas/capa/${esc(p.template)}.png" alt="" loading="lazy">` : '<span class="capa sem-capa">Template removido</span>'}<strong>${esc(p.titulo)}</strong><small>${origem(p.titulo, p.template)}Editado em ${hora(p.atualizado)}</small>
      ${p.ultimo ? `<span class="status ${p.ultimo}">${STATUS[p.ultimo]}</span>` : '<span class="status">Rascunho</span>'}
      <div class="toolbar"><button class="primary abrir" ${existe ? '' : 'disabled title="O template deste pedido foi removido. Publique-o de novo para reabrir."'}>Abrir</button><button class="text-button excluir">Excluir</button></div></div>`;
    }).join('')
      : '<div class="vazio">Nenhum pedido ainda. Comece em Novo vídeo.</div>';
    el('lista-pedidos').querySelectorAll('.recent-card').forEach((c) => {
      c.querySelector('.abrir').onclick = async () => { try { abrirPedido(await api('/pedido?id=' + c.dataset.id)); } catch (e) { falha(e); } };
      c.querySelector('.excluir').onclick = async () => {
        if (!(await confirmar('Excluir este pedido?', 'Os vídeos já gerados continuam em Vídeos gerados.', 'Excluir'))) return;
        await api('/pedido-excluir', { body: { id: c.dataset.id } }).catch(falha);
        if (state.pedido?.id === c.dataset.id) state.pedido = null;
        carregarPedidos();
      };
    });
  } catch (e) { falha(e); }
}

// ---------- fila ----------
let filaTimer;
const tarefaRender = {};  // id do render -> tarefa no painel
function mostrarFila(id) {
  abertos.add(id); lembrarAbertos();
  state.tela = 'fila';  // se Ofertas está fechado, a ativação do módulo abre direto nesta aba
  if (document.getElementById('ofertas').hidden) document.querySelector('.nav[data-view="ofertas"]').click();
  else mostrar('fila');
}
async function carregarFila() {
  clearTimeout(filaTimer);
  try {
    const { renders, mediaSegundos } = await api('/renders');
    const ativos = renders.filter((r) => r.status === 'na_fila' || r.status === 'gerando');
    for (const r of renders) {
      let t = tarefaRender[r.id];
      if (!t && (r.status === 'na_fila' || r.status === 'gerando')) t = tarefaRender[r.id] = IndoorTarefas.criar(`Vídeo · ${r.titulo}`);
      if (t && t.estado === 'andamento') {
        if (r.status === 'na_fila') t.detalhe('Na fila de geração').progresso(null);
        if (r.status === 'gerando') { const p = Math.min(0.95, segundos(r) / mediaSegundos); t.detalhe(`Gerando… ~${Math.max(1, Math.round(mediaSegundos - segundos(r)))}s restantes`).progresso(p); }
        if (r.status === 'pronto') t.concluir('Vídeo pronto · clique para ver').aoClicar(() => mostrarFila(r.id));
        if (r.status === 'falhou') t.falhar('Falha ao gerar · clique para ver').aoClicar(() => mostrarFila(r.id));
        if (r.status === 'cancelado' || r.status === 'interrompido') t.falhar(STATUS[r.status]);
      }
      if (state.vistos[r.id] && state.vistos[r.id] !== 'pronto' && r.status === 'pronto' && !el('fila').hidden) { abertos.add(r.id); lembrarAbertos(); }
      state.vistos[r.id] = r.status;
    }
    el('fila-contador').hidden = !ativos.length;
    el('fila-contador').textContent = ativos.length;
    if (!el('fila').hidden && !document.getElementById('ofertas').hidden) desenharFila(renders, mediaSegundos);
    filaTimer = setTimeout(carregarFila, ativos.length ? 2000 : 8000);
  } catch (e) { filaTimer = setTimeout(carregarFila, 8000); }
}
// Cards colapsáveis (<details>). A fila é atualizada no lugar a cada poucos segundos: refazer a lista
// inteira fecharia o card aberto e reiniciaria um vídeo em reprodução. Abertos ficam lembrados neste navegador.
const ABERTOS_CHAVE = 'ofertas-fila-abertos';
const abertos = new Set((() => { try { return JSON.parse(localStorage.getItem(ABERTOS_CHAVE) || '[]'); } catch { return []; } })());
const lembrarAbertos = () => { try { localStorage.setItem(ABERTOS_CHAVE, JSON.stringify([...abertos].slice(-100))); } catch {} };
const assinatura = (r) => [r.status, r.terminado, r.erro].join('|');
const segundos = (r) => (r.iniciado ? Math.round((Date.now() - new Date(r.iniciado)) / 1000) : 0);
function infoRender(r, media) {
  if (r.status === 'gerando') return `${segundos(r)}s de ~${media}s`;
  if (r.status === 'pronto') return `Gerado em ${hora(r.terminado)}`;
  return `Pedido em ${hora(r.criado)}`;
}
function corpoRender(r, media) {
  // miniatura leve; o <video> (caro de criar) só nasce no clique em assistir
  if (r.status === 'pronto') return `<button type="button" class="tocar" aria-label="Assistir ao vídeo"><img src="/ofertas/video/${r.id}.jpg" alt="" loading="lazy" decoding="async"><span class="play" aria-hidden="true"></span></button>`;
  if (r.status === 'falhou') return `<pre>${esc(r.erro || 'Falha sem detalhes.')}</pre>`;
  if (r.status === 'gerando') return `<p class="help">Gerando o vídeo… costuma levar uns ${media}s. Você pode continuar usando o sistema.</p>`;
  if (r.status === 'na_fila') return '<p class="help">Aguardando a vez na fila de geração.</p>';
  if (r.status === 'interrompido') return '<p class="help">O servidor reiniciou durante a geração. Abra o pedido e gere de novo.</p>';
  return `<p class="help">Cancelado em ${hora(r.terminado)}.</p>`;
}
function montarRender(card, r, media) {
  card.dataset.assinatura = assinatura(r);
  card.dataset.status = r.status;
  card.dataset.pedido = r.pedido;
  card.innerHTML = `<summary><span class="seta" aria-hidden="true"></span>
      <span class="titulo"><strong>${esc(r.titulo)}</strong><small>${origem(r.titulo, r.template)}<span class="info">${infoRender(r, media)}</span></small></span>
      <span class="acoes"><span class="status ${r.status}">${STATUS[r.status]}</span>
      ${r.status === 'pronto' ? `<a class="primary botao-link" href="/ofertas/video/${r.id}.mp4?baixar=1">Baixar MP4</a>` : ''}
      ${['na_fila', 'gerando'].includes(r.status) ? '<button type="button" class="secondary cancelar">Cancelar</button>' : ''}
      <button type="button" class="text-button abrir">Abrir pedido</button></span>
      ${r.status === 'gerando' ? `<span class="progresso"><i style="width:${Math.min(95, (segundos(r) / media) * 100)}%"></i></span>` : ''}</summary>
    <div class="corpo">${corpoRender(r, media)}</div>`;
  card.querySelector('.abrir').onclick = async (e) => { e.preventDefault(); try { abrirPedido(await api('/pedido?id=' + r.pedido)); } catch (err) { falha(err); } };
  const c = card.querySelector('.cancelar');
  if (c) c.onclick = async (e) => { e.preventDefault(); await api('/render-cancelar', { body: { id: r.id } }).catch(falha); carregarFila(); };
  const tocar = card.querySelector('.tocar');
  if (tocar) {
    tocar.querySelector('img').addEventListener('error', (e) => (e.target.src = `/ofertas/capa/${r.template}.png`), { once: true });
    tocar.onclick = () => {
      const v = document.createElement('video');
      Object.assign(v, { src: `/ofertas/video/${r.id}.mp4#t=${r.capaEm}`, controls: true, autoplay: true });
      tocar.replaceWith(v);
    };
  }
}
function novoCard(r) {
  const card = document.createElement('details');
  card.className = 'render';
  card.dataset.id = r.id;
  card.open = abertos.has(r.id);
  card.addEventListener('toggle', () => {
    if (card.open) abertos.add(r.id); else { abertos.delete(r.id); card.querySelector('video')?.pause(); }
    lembrarAbertos();
  });
  return card;
}
function desenharFila(renders, media) {
  const lista = el('lista-renders');
  if (!renders.length) { lista.innerHTML = '<div class="vazio">Nenhum vídeo gerado ainda.</div>'; return; }
  lista.querySelector('.vazio')?.remove();
  const existentes = new Map([...lista.querySelectorAll('details.render')].map((d) => [d.dataset.id, d]));
  renders.forEach((r, i) => {
    let card = existentes.get(r.id);
    if (!card) montarRender((card = novoCard(r)), r, media);
    else if (card.dataset.assinatura !== assinatura(r)) {
      // terminou enquanto você olhava: abre para mostrar o vídeo
      if (r.status === 'pronto' && card.dataset.status !== 'pronto') { abertos.add(r.id); lembrarAbertos(); card.open = true; }
      montarRender(card, r, media);
    } else if (r.status === 'gerando') {  // só o tempo e a barra mudam
      card.querySelector('.info').textContent = infoRender(r, media);
      card.querySelector('.progresso i').style.width = `${Math.min(95, (segundos(r) / media) * 100)}%`;
    }
    if (lista.children[i] !== card) lista.insertBefore(card, lista.children[i] || null);
    existentes.delete(r.id);
  });
  existentes.forEach((c) => c.remove());
}
function todosCards(abrir) {
  el('lista-renders').querySelectorAll('details.render').forEach((d) => (d.open = abrir));
}
el('expandir-todos').addEventListener('click', () => todosCards(true));
el('recolher-todos').addEventListener('click', () => todosCards(false));
el('atualizar-fila').addEventListener('click', carregarFila);

// ---------- biblioteca ----------
let buscaTimer;
async function carregarBiblioteca() { try { await gradeImagens(el('grade-biblioteca'), el('busca-biblioteca').value, false); } catch (e) { falha(e); } }
el('busca-biblioteca').addEventListener('input', () => { clearTimeout(buscaTimer); buscaTimer = setTimeout(carregarBiblioteca, 250); });
el('enviar-biblioteca').addEventListener('click', () => { el('arquivo-imagem').dataset.destino = 'biblioteca'; el('arquivo-imagem').click(); });
soltar(el('grade-biblioteca'), async (fs) => { await enviarImagens(fs); carregarBiblioteca(); });

// ---------- templates ----------
async function carregarTemplatesAdmin() {
  try {
    const lista = await api('/templates');
    el('lista-templates-admin').innerHTML = lista.map((t) => `<div class="template-linha">
      ${t.capa ? `<img src="/ofertas/capa/${esc(t.id)}.png?${Date.now()}" alt="">` : '<span class="sem-capa"></span>'}
      <div><strong>${esc(t.nome)}</strong> ${t.erros.length ? '<span class="status falhou">Com problemas</span>' : '<span class="status pronto">Publicado</span>'}
      <small>${esc(t.cliente)} · <code>${esc(t.id)}</code></small>${t.erros.length ? `<ul>${t.erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>
      <button type="button" class="text-button remover" data-id="${esc(t.id)}" data-nome="${esc(t.nome)}">Remover</button></div>`).join('')
      || '<div class="vazio">Nenhum template publicado.</div>';
    el('lista-templates-admin').querySelectorAll('.remover').forEach((b) => (b.onclick = async () => {
      if (!(await confirmar(`Remover ${b.dataset.nome}?`, 'Sai de Novo vídeo e os pedidos dele não abrem mais. Os vídeos já gerados continuam. Uma cópia fica guardada: publicar o mesmo template de novo traz tudo de volta.', 'Remover'))) return;
      try { await api('/template-remover', { body: { id: b.dataset.id } }); delete state.nomes[b.dataset.id]; aviso(`${b.dataset.nome} removido.`); carregarTemplatesAdmin(); } catch (e) { falha(e); }
    }));
  } catch (e) { falha(e); }
}
async function publicarZip(arquivo) {
  const res = el('publicar-resultado');
  res.hidden = true;
  const t = IndoorTarefas.criar(`Publicar · ${arquivo.name}`, 'Enviando…').progresso(0);
  try {
    const r = await enviarArquivo('/templates-publicar?nome=' + encodeURIComponent(arquivo.name), arquivo, t, 'Validando o template (contrato, HyperFrames e capa)…');
    if (r.ok) t.concluir(r.avisos?.length ? 'Publicado, com avisos' : 'Publicado'); else t.falhar(`Não publicado: ${r.erros.length} problema(s)`);
    res.hidden = false;
    res.innerHTML = r.ok
      ? `<strong>✓ ${esc(r.nome)} publicado.</strong> ${r.substituiu ? 'A versão anterior foi guardada.' : 'Já aparece em Novo vídeo.'}${(r.avisos || []).length ? `<ul>${r.avisos.map((a) => `<li>⚠ ${esc(a)}</li>`).join('')}</ul>` : ''}`
      : `<strong>O template não foi publicado. Corrija e envie de novo:</strong><ul>${r.erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
    carregarTemplatesAdmin();
  } catch (e) { t.falhar(e.message); res.hidden = false; res.textContent = e.message; }
}
el('publicar-zona').addEventListener('click', () => el('arquivo-zip').click());
soltar(el('publicar-zona'), (fs) => publicarZip(fs[0]));
el('arquivo-zip').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) publicarZip(f); });

window.addEventListener('beforeunload', () => { if (el('save-state').textContent === PENDENTE) salvarAgora(); });
})();
