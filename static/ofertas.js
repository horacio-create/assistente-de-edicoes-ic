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
    const qtd = state.pedido.dados[def.id].length;
    const tamanho = def.grupo?.tamanho || def.itens;
    const variavel = def.min < def.itens;
    const nomeGrupo = def.grupo?.rotulo || 'Grupo';
    const nomeItem = (def.rotuloItem || def.rotulo).toLowerCase();
    for (let g = 0; g < qtd / tamanho; g++) {
      const grupo = document.createElement('section');
      grupo.className = 'grupo';
      grupo.innerHTML = `<header><h4>${esc(def.grupo ? `${nomeGrupo} ${g + 1}` : def.rotulo)}</h4><small>${tamanho} ${esc(nomeItem)}${tamanho > 1 ? 's' : ''}</small></header>`;
      if (variavel && qtd > def.min) {
        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'remover-grupo';
        remover.textContent = 'Remover';
        remover.setAttribute('aria-label', `Remover ${nomeGrupo.toLowerCase()} ${g + 1}`);
        remover.onclick = async () => {
          const nomes = state.pedido.dados[def.id].slice(g * tamanho, (g + 1) * tamanho).map((it) => it.nome).filter(Boolean).join(', ');
          if (!(await confirmar(`Remover ${nomeGrupo.toLowerCase()} ${g + 1}?`, `${nomes ? nomes + ' saem' : 'Os produtos dela saem'} do vídeo. As imagens continuam na Biblioteca.`, 'Remover'))) return;
          mudarQuantidade(def, (lista) => lista.splice(g * tamanho, tamanho));
        };
        grupo.querySelector('header').append(remover);
      }
      for (let i = g * tamanho; i < (g + 1) * tamanho; i++) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `<div class="item-titulo"><b>${i + 1}</b>${esc(def.rotuloItem || def.rotulo)} ${i + 1}</div>`;
        if (def === listaPrincipal() && encartesProntos().length) {
          const trocar = document.createElement('button');
          trocar.type = 'button';
          trocar.className = 'trocar-encarte';
          trocar.textContent = 'Trocar pelo encarte';
          trocar.setAttribute('aria-label', `Trocar ${(def.rotuloItem || def.rotulo).toLowerCase()} ${i + 1} por um produto do encarte`);
          trocar.onclick = () => abrirTroca(i);
          card.querySelector('.item-titulo').append(trocar);
        }
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
    if (variavel) {
      const grupos = qtd / tamanho, maximo = def.itens / tamanho;
      const rodape = document.createElement('div');
      rodape.className = 'grupo-rodape';
      const adicionar = document.createElement('button');
      adicionar.type = 'button';
      adicionar.className = 'adicionar-grupo';
      adicionar.disabled = grupos >= maximo;
      adicionar.textContent = grupos >= maximo ? `Limite de ${maximo} ${nomeGrupo.toLowerCase()}s` : `+ Adicionar ${nomeGrupo.toLowerCase()}`;
      adicionar.onclick = () => mudarQuantidade(def, (lista) => lista.push(...itensPadrao(def, lista.length, tamanho)), true);
      const resumo = document.createElement('small');
      resumo.textContent = `${grupos} de ${maximo} ${nomeGrupo.toLowerCase()}${maximo > 1 ? 's' : ''} · ${qtd} ${nomeItem}${qtd > 1 ? 's' : ''} · a duração do vídeo é dividida igualmente`;
      rodape.append(adicionar, resumo);
      form.append(rodape);
    }
  }
  form.scrollTop = rolagem;
  aplicarValidacao(state.validacao);
}

// lista com quantidade variável (template com "min"): itens novos vêm do conteúdo de exemplo do template
function itensPadrao(def, de, qtd) {
  const padrao = state.esquema.padrao[def.id];
  return Array.from({ length: qtd }, (_, i) => structuredClone(padrao[(de + i) % padrao.length]));
}
async function mudarQuantidade(def, mudar, rolarAteNovo = false) {
  mudar(state.pedido.dados[def.id]);
  agendarSalvar();
  await montarFormulario();
  if (rolarAteNovo) {
    const novo = [...el('formulario').querySelectorAll('.grupo')].at(-1);
    novo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    novo?.querySelector('input')?.focus({ preventScroll: true });
  }
}
// quantos produtos vão em cada vídeo do "Gerar todos" (mesma regra de tamanhos_dos_videos no servidor)
const passoDe = (lista) => lista.grupo?.tamanho || 1;
const limitesCartelas = (lista) => [(lista.min ?? lista.itens) / passoDe(lista), lista.itens / passoDe(lista)];
function tamanhosDosVideos(n, lista, cartelas) {
  const passo = passoDe(lista), [gmin, gmax] = limitesCartelas(lista);
  cartelas ??= gmax;
  const grupos = Math.ceil(n / passo), total = Math.ceil(grupos / cartelas);
  return Array.from({ length: total }, (_, k) => Math.max(gmin, Math.floor(grupos / total) + (k < grupos % total ? 1 : 0)) * passo);
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
  await gradeImagens(el('grade-dialog'), '', true, 1);
}
// grade paginada no servidor; a página atual fica em alvo.dataset.pagina (recarregar mantém a página)
async function gradeImagens(alvo, busca, escolha, pagina = Number(alvo.dataset.pagina) || 1) {
  const r = await api(`/imagens?por=${escolha ? 30 : 48}&pagina=${pagina}&busca=${encodeURIComponent(busca)}`);
  const imagens = r.itens;
  alvo.dataset.pagina = r.pagina;
  imagens.forEach((i) => (state.imagens[i.id] = i));
  paginacao(alvo, r, (n) => gradeImagens(alvo, busca, escolha, n));
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
function paginacao(alvo, { pagina, paginas, total }, ir) {
  const nav = document.getElementById(alvo.id.replace('grade', 'paginas'));
  nav.hidden = paginas < 2;
  if (nav.hidden) return;
  nav.innerHTML = `<button type="button" class="secondary" data-ir="${pagina - 1}" ${pagina > 1 ? '' : 'disabled'}>‹ Anterior</button>
    <span>Página ${pagina} de ${paginas} · ${total} imagens</span>
    <button type="button" class="secondary" data-ir="${pagina + 1}" ${pagina < paginas ? '' : 'disabled'}>Próxima ›</button>`;
  nav.querySelectorAll('button').forEach((b) => (b.onclick = async () => { await ir(Number(b.dataset.ir)); alvo.scrollTop = 0; alvo.scrollIntoView({ block: 'nearest' }); }));
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
  await gradeImagens(el('grade-dialog'), el('busca-dialog').value, true, 1);
  el('usar-imagem').disabled = el('remover-fundo').disabled = !state.selecionada;
}
el('busca-dialog').addEventListener('input', (e) => gradeImagens(el('grade-dialog'), e.target.value, true, 1));
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
  await gradeImagens(el('grade-dialog'), el('busca-dialog').value, true, 1);
  el('remover-fundo').disabled = false;
});
el('arquivo-imagem').addEventListener('change', async (e) => {
  const fs = [...e.target.files]; e.target.value = '';
  const img = await enviarImagens(fs);
  if (e.target.dataset.destino === 'dialog') aposEnvioNoDialog(img); else carregarBiblioteca(1);
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
    // o botão "Trocar pelo encarte" dos produtos depende de haver encarte pronto
    const temTroca = !!el('formulario').querySelector('.trocar-encarte');
    if (state.esquema && !el('editor').hidden && temTroca !== (encartesProntos().length > 0 && !!listaPrincipal())) montarFormulario();
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
soltar(el('encarte-card'), (fs) => enviarEncarte(fs.find((f) => /\.(pdf|png|jpe?g)$/i.test(f.name)) || fs[0]));

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
  return `<span class="card-body"><strong title="${esc(it.nome)}">${esc(it.nome || 'Sem nome')}</strong>
    <small class="preco-sugerido">${it.por ? `R$ ${esc(it.por)}${it.unidade ? ' ' + esc(it.unidade) : ''}` : 'Sem preço'}</small><small>${it.de ? 'de R$ ' + esc(it.de) : 'sem preço normal'}</small></span>`;
}
const avisosDe = (it) => it.avisos || [];
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
  if (pronto && !enc.itens.length) {
    st.hidden = false;
    st.textContent = /\.(png|jpe?g)$/i.test(enc.nome) ? 'Encarte em imagem: use “Marcar oferta na página” para recortar cada oferta.'
      : 'Nenhum produto reconhecido automaticamente neste PDF. Use “Marcar oferta na página” para recortar as ofertas.';
  }
  el('encarte-acoes').hidden = !pronto;
  el('encarte-todos').hidden = !pronto || !enc.itens.length;
  el('encarte-itens').hidden = !pronto || !enc.itens.length;
  if (!pronto) el('usar-encarte').hidden = true;
  if (pronto && state.encarte !== enc.itens) { state.encarte = enc.itens; state.ordem = state.ordem.filter((k) => k < enc.itens.length); }
  if (pronto) desenharEncarte();
}
function desenharEncarte() {
  const max = listaPrincipal().itens;
  el('encarte-itens').innerHTML = state.encarte.map((it, k) => {
    const pos = state.ordem.indexOf(k), av = avisosDe(it);
    return `<button class="card ${pos >= 0 ? 'selected' : ''} ${av.length ? 'com-aviso' : ''}" data-k="${k}">${pos >= 0 ? `<span class="ordem">${pos + 1}</span>` : ''}
      <span class="edit-card secondary conferir">${av.length ? 'Conferir' : 'Editar'}</span>
      ${av.length ? `<span class="alerta" title="${esc(av.join('\n'))}">${av.length === 1 ? 'Conferir' : av.length + ' avisos'}</span>` : it.conferido ? '<span class="conferido" title="Conferido">✓ conferido</span>' : ''}
      <img class="thumb" src="/ofertas/miniatura/${it.imagem}.png" alt="" loading="lazy">${itemEncarte(it)}</button>`;
  }).join('');
  el('encarte-itens').querySelectorAll('.card').forEach((c) => c.addEventListener('click', (e) => {
    if (e.target.classList.contains('conferir')) return abrirConferir(Number(c.dataset.k));
    const k = Number(c.dataset.k), i = state.ordem.indexOf(k);
    if (i >= 0) state.ordem.splice(i, 1); else if (state.ordem.length < max) state.ordem.push(k); else return aviso(`Este template usa ${max} produtos.`);
    desenharEncarte();
  }));
  el('usar-encarte').hidden = !state.ordem.length;
  el('usar-encarte').textContent = `Preencher ${state.ordem.length} de ${max} produtos`;
  const conferir = state.encarte.filter((it) => avisosDe(it).length).length;
  el('encarte-dica').textContent = (state.ordem.length ? `${state.ordem.length}/${max} escolhidos · clique de novo para desmarcar` : `Clique em até ${max} produtos, na ordem do vídeo.`)
    + (conferir ? ` · ${conferir} ${conferir === 1 ? 'produto para conferir' : 'produtos para conferir'}` : '');
}
el('usar-encarte').addEventListener('click', () => {
  const lista = listaPrincipal();
  if (lista.min < lista.itens) { // lista variável: a quantidade acompanha os produtos escolhidos (em grupos completos)
    const passo = lista.grupo?.tamanho || 1;
    const qtd = Math.min(lista.itens, Math.max(lista.min, Math.ceil(state.ordem.length / passo) * passo));
    const atual = state.pedido.dados[lista.id];
    if (atual.length > qtd) atual.splice(qtd);
    else atual.push(...itensPadrao(lista, atual.length, qtd - atual.length));
  }
  state.ordem.forEach((k, i) => preencherItem(lista, state.pedido.dados[lista.id][i], state.encarte[k]));
  const n = state.ordem.length;
  state.ordem = [];
  desenharEncarte();
  montarFormulario();
  agendarSalvar();
  aviso(`${n} produtos preenchidos a partir do encarte. Confira antes de gerar.`);
  el('formulario').scrollTo({ top: 0, behavior: 'smooth' });
});

// produto do encarte -> item da lista do pedido (só os campos que o template tem)
function preencherItem(lista, alvo, it) {
  const subs = Object.fromEntries(lista.campos.map((s) => [s.id, s]));
  if (subs.nome) alvo.nome = it.nome;
  if (subs.imagem) alvo.imagem = 'biblioteca:' + it.imagem;
  if (subs.por) alvo.por = it.por;
  if (subs.de) alvo.de = it.de;
  if (subs.unidade && subs.unidade.opcoes?.includes(it.unidade)) alvo.unidade = it.unidade;
}

// ---------- trocar um produto do formulário por um do encarte ----------
const troca = { i: null, encarte: null };
const encartesProntos = () => state.encartes.filter((e) => e.status === 'pronto' && e.itens.length);
function abrirTroca(i) {
  troca.i = i;
  troca.encarte = (encartesProntos().find((e) => e.id === state.encarteSel) || encartesProntos()[0])?.id;
  const atual = state.pedido.dados[listaPrincipal().id][i];
  el('trocar-titulo').textContent = `Trocar o produto ${i + 1}${atual?.nome ? ` · ${atual.nome}` : ''}`;
  el('trocar-busca').value = '';
  desenharTroca();
  el('trocar-dialog').showModal();
  el('trocar-busca').focus();
}
function desenharTroca() {
  const prontos = encartesProntos(), enc = prontos.find((e) => e.id === troca.encarte);
  el('trocar-encartes').hidden = prontos.length < 2;
  el('trocar-encartes').innerHTML = prontos.slice(0, 8).map((e) => `<button type="button" class="chip ${e.id === troca.encarte ? 'ativo' : ''}" data-id="${e.id}">
    <strong>${esc(e.nome)}</strong><small>${e.itens.length} produtos · ${hora(e.criado)}</small></button>`).join('');
  el('trocar-encartes').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { troca.encarte = c.dataset.id; desenharTroca(); }));
  const termo = el('trocar-busca').value.trim().toLowerCase();
  const itens = (enc?.itens || []).map((it, k) => [it, k]).filter(([it]) => !termo || (it.nome || '').toLowerCase().includes(termo));
  el('trocar-total').textContent = enc ? `${itens.length} de ${enc.itens.length} produtos` : '';
  el('trocar-grade').innerHTML = itens.length ? itens.map(([it, k]) => `<button type="button" class="card ${avisosDe(it).length ? 'com-aviso' : ''}" data-k="${k}">
    ${avisosDe(it).length ? `<span class="alerta" title="${esc(avisosDe(it).join('\n'))}">Conferir</span>` : ''}
    <img class="thumb" src="/ofertas/miniatura/${it.imagem}.png" alt="" loading="lazy">${itemEncarte(it)}</button>`).join('')
    : `<p class="help">${enc ? 'Nenhum produto com esse nome.' : 'Importe um encarte no card “Encarte” para trocar produtos.'}</p>`;
  el('trocar-grade').querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
    const lista = listaPrincipal(), it = enc.itens[Number(c.dataset.k)];
    preencherItem(lista, state.pedido.dados[lista.id][troca.i], it);
    el('trocar-dialog').close();
    montarFormulario();
    agendarSalvar();
    aviso(`Produto ${troca.i + 1} trocado por ${it.nome || 'produto do encarte'}.${avisosDe(it).length ? ' Confira: este produto tem aviso no encarte.' : ''}`);
  }));
}
el('trocar-busca').addEventListener('input', desenharTroca);

// ---------- conferir / marcar na página (diálogo) ----------
// Áreas vêm do servidor nas unidades do encarte (pontos do PDF ou pixels da imagem); a tela trabalha em frações.
const conf = { k: null, pagina: 1, paginas: [], selecao: null, arrasto: null };
const encAtual = () => state.encartes.find((e) => e.id === state.encarteSel);
async function prepararPaginas(enc) {
  state.paginasEnc ??= {};
  state.paginasEnc[enc.id] ??= await api('/encarte-paginas?id=' + enc.id);
  conf.paginas = state.paginasEnc[enc.id];
}
function mostrarPagina(n, area) {
  const enc = encAtual();
  conf.pagina = n; conf.selecao = null;
  el('pagina-selecao').hidden = true;
  el('recortar').disabled = true;
  el('pagina-img').src = `/ofertas/encarte/${enc.id}/${n}.png`;
  el('pagina-nav').hidden = conf.paginas.length < 2 || conf.k !== null;
  el('pagina-num').textContent = `Página ${n} de ${conf.paginas.length}`;
  el('pagina-ant').disabled = n <= 1; el('pagina-prox').disabled = n >= conf.paginas.length;
  const d = el('pagina-destaque');
  d.hidden = !area;
  if (area) {
    const [w, h] = conf.paginas[n - 1];
    Object.assign(d.style, { left: area[0] / w * 100 + '%', top: area[1] / h * 100 + '%', width: (area[2] - area[0]) / w * 100 + '%', height: (area[3] - area[1]) / h * 100 + '%' });
    el('pagina-img').addEventListener('load', () => d.scrollIntoView({ block: 'center', inline: 'center' }), { once: true });
  }
}
function modoDialogo(marcar) {
  el('conferir-form').hidden = el('conferir-excluir').hidden = el('conferir-salvar').hidden = marcar;
  el('recortar').hidden = el('marcar-dica').hidden = !marcar;
  el('pagina').classList.toggle('marcando', marcar);
  el('conferir-dialog').classList.toggle('marcando', marcar);
}
async function abrirConferir(k) {
  const enc = encAtual(), it = enc.itens[k];
  try { await prepararPaginas(enc); } catch (e) { return falha(e); }
  conf.k = k;
  modoDialogo(false);
  el('conferir-eyebrow').textContent = 'CONFERIR PRODUTO';
  el('conferir-titulo').textContent = it.nome || 'Produto sem nome';
  el('conferir-sub').textContent = it.area ? `${enc.nome} · página ${it.pagina}. O destaque mostra de onde o produto foi lido.` : enc.nome;
  el('conferir-foto').src = `/ofertas/miniatura/${it.imagem}.png`;
  el('conferir-avisos').innerHTML = avisosDe(it).map((a) => `<li>${esc(a)}</li>`).join('');
  el('cf-nome').value = it.nome; el('cf-de').value = it.de; el('cf-por').value = it.por; el('cf-unidade').value = it.unidade;
  el('cf-unidades').innerHTML = (listaPrincipal()?.campos.find((c) => c.id === 'unidade')?.opcoes || []).map((o) => `<option value="${esc(o)}">`).join('');
  mostrarPagina(it.pagina || 1, it.area);
  el('conferir-dialog').showModal();
  el('cf-nome').focus();
}
async function abrirMarcar() {
  const enc = encAtual();
  try { await prepararPaginas(enc); } catch (e) { return falha(e); }
  conf.k = null;
  modoDialogo(true);
  el('conferir-eyebrow').textContent = 'MARCAR OFERTA';
  el('conferir-titulo').textContent = enc.nome;
  el('conferir-sub').textContent = 'Envolva a foto, o nome e os preços da oferta. Num PDF, o texto da área é lido; numa imagem, você digita os dados depois.';
  mostrarPagina(conf.pagina <= conf.paginas.length ? conf.pagina : 1);
  el('conferir-dialog').showModal();
}
el('encarte-marcar').addEventListener('click', abrirMarcar);
el('pagina-ant').addEventListener('click', () => mostrarPagina(conf.pagina - 1));
el('pagina-prox').addEventListener('click', () => mostrarPagina(conf.pagina + 1));
// arrastar para marcar (mouse, toque e caneta)
const fracao = (e) => { const r = el('pagina-img').getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
el('pagina').addEventListener('pointerdown', (e) => {
  if (!el('pagina').classList.contains('marcando')) return;
  e.preventDefault(); el('pagina').setPointerCapture(e.pointerId);
  conf.arrasto = fracao(e);
});
el('pagina').addEventListener('pointermove', (e) => {
  if (!conf.arrasto) return;
  const [x, y] = fracao(e), [x0, y0] = conf.arrasto;
  conf.selecao = [Math.min(x, x0), Math.min(y, y0), Math.max(x, x0), Math.max(y, y0)];
  const [a, b, c, d] = conf.selecao, s = el('pagina-selecao');
  Object.assign(s.style, { left: a * 100 + '%', top: b * 100 + '%', width: (c - a) * 100 + '%', height: (d - b) * 100 + '%' });
  s.hidden = false;
});
el('pagina').addEventListener('pointerup', () => {
  conf.arrasto = null;
  const s = conf.selecao;
  el('recortar').disabled = !s || (s[2] - s[0]) * (s[3] - s[1]) < 0.0004;
});
el('recortar').addEventListener('click', async () => {
  const enc = encAtual();
  el('recortar').disabled = true;
  const t = IndoorTarefas.criar(`Recorte · ${enc.nome}`, 'Lendo a área marcada…');
  try {
    const r = await api('/encarte-recortar', { body: { id: enc.id, pagina: conf.pagina, area: conf.selecao } });
    t.concluir(r.item.nome ? `${r.item.nome} · confira os dados` : 'Recorte salvo · preencha os dados');
    await carregarEncartes();
    abrirConferir(r.k);
  } catch (e) { t.falhar(e.message); el('recortar').disabled = false; }
});
el('conferir-salvar').addEventListener('click', async () => {
  const enc = encAtual();
  try {
    const it = await api('/encarte-item-salvar', { body: { id: enc.id, k: conf.k, nome: el('cf-nome').value, de: el('cf-de').value, por: el('cf-por').value, unidade: el('cf-unidade').value } });
    enc.itens[conf.k] = it;
    state.encarte = null;  // força redesenhar com os dados novos
    el('conferir-dialog').close();
    desenharCardEncarte();
    aviso(`${it.nome} conferido.`);
  } catch (e) { falha(e); }
});
el('conferir-form').addEventListener('submit', (e) => { e.preventDefault(); el('conferir-salvar').click(); });
el('conferir-excluir').addEventListener('click', async () => {
  const enc = encAtual(), it = enc.itens[conf.k];
  if (!(await confirmar(`Excluir ${it.nome || 'este produto'}?`, 'Sai da lista deste encarte. A imagem continua na Biblioteca.', 'Excluir'))) return;
  try {
    await api('/encarte-item-excluir', { body: { id: enc.id, k: conf.k } });
    state.ordem = [];
    el('conferir-dialog').close();
    await carregarEncartes();
  } catch (e) { falha(e); }
});

// ---------- gerar todos os vídeos do encarte ----------
// "Gerar todos": o usuário escolhe cartelas por vídeo (ou quantos vídeos) e o que fazer com o produto sem par
function planoLote() {
  const enc = encAtual(), lista = listaPrincipal(), passo = passoDe(lista), [gmin, gmax] = limitesCartelas(lista);
  const impar = document.querySelector('input[name=of-lote-impar]:checked').value;
  const total = enc.itens.length, sobra = passo > 1 ? total % passo : 0;
  const n = impar === 'fora' && sobra && total > passo ? total - sobra : total;
  const cartelas = Math.min(gmax, Math.max(gmin, Math.round(Number(el('lote-cartelas').value) || gmax)));
  const tamanhos = tamanhosDosVideos(n, lista, cartelas);
  return { enc, lista, passo, gmin, gmax, impar, sobra, n, cartelas, tamanhos, repetidos: tamanhos.reduce((a, b) => a + b, 0) - n };
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function desenharLote() {
  const p = planoLote(), nomeGrupo = (p.lista.grupo?.rotulo || 'cartela').toLowerCase();
  el('lote-cartelas').value = p.cartelas;
  el('lote-videos').value = p.tamanhos.length;
  el('lote-titulo').textContent = `Gerar ${plural(p.tamanhos.length, 'vídeo', 'vídeos')} com ${plural(p.enc.itens.length, 'produto', 'produtos')}`;
  el('lote-sub').textContent = `${p.enc.nome} · na ordem do encarte`;
  el('lote-cartelas-ajuda').textContent = p.gmin === p.gmax ? `Fixo neste template (${p.gmax}).` : `De ${p.gmin} a ${p.gmax} por vídeo.`;
  el('lote-videos-ajuda').textContent = 'Os vídeos saem com quantidades parecidas.';
  el('lote-impar').hidden = !p.sobra;
  el('lote-primeiro').textContent = p.enc.itens[0]?.nome ? `(${p.enc.itens[0].nome})` : '';
  el('lote-ultimo').textContent = p.enc.itens.at(-1)?.nome ? `(${p.enc.itens.at(-1).nome})` : '';
  // vídeos iguais em sequência viram uma linha: "Vídeos 1 a 3 · 4 cartelas (8 produtos)"
  const linhas = [];
  p.tamanhos.forEach((t, k) => { const ult = linhas.at(-1); if (ult?.t === t) ult.ate = k + 1; else linhas.push({ t, de: k + 1, ate: k + 1 }); });
  el('lote-resumo').innerHTML = linhas.map((l) => `<li><b>${l.de === l.ate ? `Vídeo ${l.de}` : `Vídeos ${l.de} a ${l.ate}`}</b><span>${plural(l.t / p.passo, nomeGrupo, nomeGrupo + 's')} · ${plural(l.t, 'produto', 'produtos')}</span></li>`).join('');
  const notas = [];
  if (p.repetidos) notas.push(`${plural(p.repetidos, 'produto se repete', 'produtos se repetem')} para completar ${p.repetidos > p.sobra ? 'os vídeos' : 'a cartela'} (a partir do 1º do encarte).`);
  if (p.n < p.enc.itens.length) notas.push(`${p.enc.itens.at(-1).nome || 'O último produto'} fica de fora.`);
  el('lote-nota').textContent = notas.join(' ');
  const pendentes = p.enc.itens.filter((it) => avisosDe(it).length).length;
  el('lote-aviso').hidden = !pendentes;
  el('lote-aviso').textContent = `Atenção: ${plural(pendentes, 'produto ainda tem aviso', 'produtos ainda têm avisos')} para conferir.`;
  const base = p.enc.nome.replace(/\.[^.]+$/, '');
  el('lote-nomes').textContent = p.tamanhos.length > 1 ? `Nomes: ${base} (1) … ${base} (${p.tamanhos.length})` : `Nome: ${base}`;
  el('lote-gerar').textContent = `Gerar ${plural(p.tamanhos.length, 'vídeo', 'vídeos')}`;
}
el('lote-cartelas').addEventListener('change', desenharLote);
// quantidade de vídeos -> cartelas por vídeo (o mínimo que cabe nesses vídeos); o resumo mostra o resultado real
el('lote-videos').addEventListener('change', () => {
  const p = planoLote(), videos = Math.max(1, Math.round(Number(el('lote-videos').value) || 1));
  el('lote-cartelas').value = Math.ceil(Math.ceil(p.n / p.passo) / videos);
  desenharLote();
});
document.querySelectorAll('input[name=of-lote-impar]').forEach((r) => r.addEventListener('change', desenharLote));
el('encarte-todos').addEventListener('click', () => {
  const [gmin, gmax] = limitesCartelas(listaPrincipal());
  Object.assign(el('lote-cartelas'), { min: gmin, max: gmax, value: gmax, disabled: gmin === gmax });
  el('lote-videos').disabled = gmin === gmax;
  document.querySelector('input[name=of-lote-impar][value=repetir]').checked = true;
  desenharLote();
  el('lote-dialog').showModal();
});
el('lote-gerar').addEventListener('click', async () => {
  const p = planoLote();
  el('lote-gerar').disabled = true;
  try {
    const r = await api('/encarte-gerar-todos', { body: { encarte: p.enc.id, template: state.pedido.template, cartelas: p.cartelas, impar: p.impar } });
    el('lote-dialog').close();
    const falhos = r.videos.filter((v) => !v.render);
    aviso(falhos.length ? `${r.videos.length - falhos.length} na fila. ${falhos.length} não ${falhos.length === 1 ? 'pôde' : 'puderam'} ser gerado(s): abra em Pedidos recentes para corrigir.`
      : `${r.videos.length} ${r.videos.length === 1 ? 'vídeo enviado' : 'vídeos enviados'} para a fila de geração.`, 7000);
    carregarFila();
    mostrar(falhos.length ? 'pedidos' : 'fila');
  } catch (e) { falha(e); } finally { el('lote-gerar').disabled = false; }
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
async function carregarBiblioteca(pagina) { try { await gradeImagens(el('grade-biblioteca'), el('busca-biblioteca').value, false, pagina); } catch (e) { falha(e); } }
el('busca-biblioteca').addEventListener('input', () => { clearTimeout(buscaTimer); buscaTimer = setTimeout(() => carregarBiblioteca(1), 250); });
el('enviar-biblioteca').addEventListener('click', () => { el('arquivo-imagem').dataset.destino = 'biblioteca'; el('arquivo-imagem').click(); });
soltar(el('grade-biblioteca'), async (fs) => { await enviarImagens(fs); carregarBiblioteca(1); });

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
