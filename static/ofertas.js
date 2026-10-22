// Ofertas de supermercados — interface do módulo. Isolado numa função para não colidir com o app.js
// (que define $, toast, request…). IDs com prefixo "of-"; API em /api/ofertas; arquivos em /ofertas.
(() => {
'use strict';
const el = (id) => document.getElementById('of-' + id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const STATUS = { na_fila: 'Na fila', gerando: 'Gerando', pronto: 'Pronto', falhou: 'Falhou', cancelado: 'Cancelado', interrompido: 'Interrompido' };
const TELAS = {
  conferencia: ['Conferir ofertas', 'Etapa 1 · Importe e confira os produtos do encarte.'],
  catalogo: ['Montar cartelas', 'Etapa 2 · Escolha o template para suas ofertas.'],
  videos: ['Montar vídeos', 'Etapa 3 · Organize a saída e confira antes de gerar.'],
  editor: ['', 'Etapa 2 · Confira o conteúdo e ajuste suas cartelas.'],
  pedidos: ['Pedidos recentes', 'Retome um vídeo de onde parou.'],
  fila: ['Vídeos gerados', 'Acompanhe a fila e baixe os MP4 prontos.'],
  biblioteca: ['Biblioteca de imagens', 'Recortes prontos para reaproveitar.'],
  templates: ['Templates', 'Publique layouts criados pelos designers.'],
};
const state = { tela: 'conferencia', importarNaEscolha: false, encarteInteiro: false, pronto: null, imagens: {}, pedido: null, esquema: null, validacao: [], timer: null, salvando: null, pendente: false, alvoImagem: null, selecionada: null, encarte: [], ordem: [], vistos: {}, encartes: [], encarteSel: null, encartesVistos: {}, nomes: {} };

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
new MutationObserver(() => { if (!document.getElementById('ofertas').hidden) ativar(); else { salvarAgora(); OfertasEdicao.recolher(); } })
  .observe(document.getElementById('ofertas'), { attributes: true, attributeFilter: ['hidden'] });

async function mostrar(tela) {
  const telaAnterior = state.tela;
  if (state.pedido && tela !== 'editor') await salvarAgora();
  state.tela = tela;
  document.querySelectorAll('#ofertas .of-tela').forEach((t) => (t.hidden = t.id !== 'of-' + tela));
  document.querySelectorAll('#ofertas .aba').forEach((a) => a.setAttribute('aria-selected', String(a.dataset.tela === (['conferencia', 'catalogo', 'editor', 'videos'].includes(tela) ? 'conferencia' : tela))));
  const [titulo, sub] = TELAS[tela];
  document.getElementById('page-title').textContent = tela === 'editor' ? state.esquema?.nome || '' : titulo;
  document.getElementById('page-subtitle').textContent = sub;
  if (tela === 'catalogo') carregarCatalogo();
  if (tela === 'conferencia') desenharCardEncarte();
  if (tela === 'videos') desenharSaida();
  if (tela === 'editor') montarEditorIntegrado();
  else { el('player').pause?.(); OfertasEdicao.recolher(); }
  atualizarEtapas();
  if (tela === 'pedidos') carregarPedidos();
  if (tela === 'fila') carregarFila();
  if (tela === 'biblioteca') carregarBiblioteca();
  if (tela === 'templates') carregarTemplatesAdmin();
  if (tela !== telaAnterior) document.getElementById('page-title').scrollIntoView({block:'start'});
}
document.querySelectorAll('#ofertas .aba').forEach((a) => a.addEventListener('click', () => mostrar(a.dataset.tela)));

// ---------- etapas do processo (somente Ofertas) ----------
function atualizarEtapas() {
  const etapa = state.tela === 'conferencia' ? 'conferencia' : ['catalogo','editor'].includes(state.tela) ? 'montagem' : 'videos';
  el('etapas').hidden = !['conferencia','catalogo','editor','videos','fila'].includes(state.tela);
  el('etapas').querySelectorAll('[data-etapa]').forEach(b => {
    if (b.dataset.etapa === etapa) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.disabled = b.dataset.etapa === 'videos' && (!state.pedido || state.importarNaEscolha);
  });
  if (state.tela === 'catalogo') el('template-contexto').textContent = state.importarNaEscolha
    ? `${state.ordem.length} produtos de ${encAtual()?.nome || 'seu encarte'} serão usados na montagem.`
    : 'Escolha o visual. Depois preencha os produtos ou use um encarte da primeira etapa.';
}
function atualizarResumoConferencia() {
  const enc = encAtual(), pronto = enc?.status === 'pronto' && enc.itens.length > 0;
  el('continuar-encarte').disabled = !pronto;
  const avisos = pronto ? enc.itens.filter(it => avisosDe(it).length).length : 0;
  const conferidos = pronto ? enc.itens.filter(it => it.conferido).length : 0;
  el('conferencia-resumo').textContent = pronto
    ? `${enc.itens.length} produtos · ${conferidos} conferidos${avisos ? ` · ${avisos} com avisos para revisar` : ''}. Confira os dados antes de continuar.`
    : enc?.status === 'lendo' ? 'Lendo o encarte. Aguarde os produtos aparecerem para continuar.'
    : 'Importe um encarte para começar ou preencha os produtos manualmente.';
}
async function continuarEncarte(todos) {
  const enc = encAtual();
  if (enc?.status !== 'pronto' || !enc.itens.length) return aviso('Importe e confira um encarte antes de continuar.');
  if (todos) state.ordem = enc.itens.map((_, k) => k);
  if (!state.ordem.length) return;
  state.importarNaEscolha = true;
  await mostrar('catalogo');
}
function desenharSaida() {
  if (!state.pedido) return;
  const lista = listaPrincipal(), n = lista ? state.pedido.dados[lista.id].length : 0;
  const saida = state.esquema.saida || state.esquema;
  const cartelas = lista ? tamanhosCartelas(n, passoDe(lista), state.pedido.dados.ultimacartela === 'tres').length : 1;
  el('video-nome').textContent = state.esquema.nome;
  if (document.activeElement !== el('video-titulo')) el('video-titulo').value = el('titulo').value;
  el('video-resumo').textContent = `${n ? `${n} ${n === 1 ? 'produto' : 'produtos'} · ${cartelas} ${cartelas === 1 ? 'cartela' : 'cartelas'} · ` : ''}${state.esquema.duracao}s · MP4 ${saida.largura} × ${saida.altura}`;
  el('video-validacao').textContent = state.encarteInteiro
    ? 'O encarte tem mais produtos que o limite deste vídeo. Organize o encarte completo no painel ao lado.'
    : state.validacao.length ? `${state.validacao.length} campos precisam de atenção. Volte às cartelas para corrigir.`
    : 'Conteúdo preenchido. Faça a conferência visual antes de gerar.';
  el('gerar').disabled = state.validacao.length > 0 || Boolean(state.encarteInteiro);
  const enc = encAtual(), pronto = enc?.status === 'pronto' && enc.itens.length > 0 && !!lista;
  el('encarte-todos').hidden = !pronto;
  el('video-encarte').textContent = pronto
    ? `${enc.nome} · todos os ${enc.itens.length} produtos, na ordem do encarte.`
    : 'Importe um encarte na primeira etapa para organizar todos os produtos em vídeos.';
}
async function irParaVideos() {
  if (state.importarNaEscolha) { aviso('Escolha o template para os produtos selecionados.'); return mostrar('catalogo'); }
  if (!state.pedido) { aviso('Escolha um template na etapa Montar cartelas.'); return mostrar('catalogo'); }
  await salvarAgora();
  if (!el('save-state').textContent.startsWith('Salvo')) return aviso('Aguarde o salvamento antes de continuar.');
  await mostrar('videos');
}
el('etapas').querySelectorAll('[data-etapa]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.etapa === 'videos') irParaVideos().catch(falha);
  else mostrar(b.dataset.etapa === 'montagem' ? (state.pedido && !state.importarNaEscolha ? 'editor' : 'catalogo') : 'conferencia').catch(falha);
}));
el('continuar-encarte').addEventListener('click', () => continuarEncarte(true).catch(falha));
el('sem-encarte').addEventListener('click', () => { state.importarNaEscolha = false; mostrar('catalogo'); });
el('trocar-template').addEventListener('click', async () => {
  if (!await confirmar('Escolher outro template?', 'Será criado um novo pedido. Sua montagem atual continuará em Pedidos recentes.', 'Escolher template')) return;
  state.importarNaEscolha = false; mostrar('catalogo');
});
el('voltar-ofertas').addEventListener('click', () => mostrar('conferencia'));
el('continuar-videos').addEventListener('click', () => irParaVideos().catch(falha));
el('avancar-videos').addEventListener('click', () => irParaVideos().catch(falha));
el('voltar-cartelas').addEventListener('click', () => mostrar('editor'));
el('rever-cartelas').addEventListener('click', () => mostrar('editor'));
el('ver-fila').addEventListener('click', () => mostrar('fila'));
el('video-titulo').addEventListener('input', () => { el('titulo').value = el('video-titulo').value; agendarSalvar(); });

// ---------- catálogo ----------
// nome legível do template para Pedidos e Vídeos gerados (as listas guardam só o id)
async function carregarNomes() { const lista = await api('/templates'); lista.forEach((t) => (state.nomes[t.id] = t.nome)); return lista; }
const nomeTemplate = (id) => state.nomes[id] || id;
// o título padrão já começa com o nome do template: só repete quando o título foi trocado
const origem = (titulo, id) => (titulo.startsWith(nomeTemplate(id)) ? '' : esc(nomeTemplate(id)) + ' · ');
async function carregarCatalogo() {
  try {
    const lista = (await carregarNomes()).filter(t => !t.substituidoPor);
    el('lista-templates').innerHTML = lista.length ? lista.map((t) => `
      <button class="template-card ${t.erros.length ? 'invalido' : ''}" data-id="${esc(t.id)}" ${t.erros.length ? 'disabled' : ''}>
        ${t.capa ? `<img src="/ofertas/capa/${esc(t.id)}.png" alt="">` : '<span class="sem-capa">Sem capa</span>'}
        <span class="corpo"><strong>${esc(t.nome)}</strong><small>${esc(t.cliente)}</small><small>${esc(t.descricao)}</small>
        <span class="usar">${t.erros.length ? 'Template com problemas — veja em Templates' : 'Usar este template '+icon('arrow-right','inline-icon')}</span></span></button>`).join('')
      : '<div class="vazio">Nenhum template publicado ainda. Publique o primeiro em Templates.</div>';
    el('lista-templates').querySelectorAll('.template-card:not([disabled])').forEach((c) => c.addEventListener('click', async () => {
      try {
        await abrirPedido(await api('/pedidos', { body: { template: c.dataset.id } }));
        if (state.importarNaEscolha && listaPrincipal()) {
          if (state.ordem.length <= listaPrincipal().itens) {
            preencherEscolhidos();
            await salvarAgora();
          } else {
            const escolhidos = state.ordem.slice();
            state.ordem = escolhidos.slice(0, listaPrincipal().itens);
            preencherEscolhidos();
            await salvarAgora();
            state.ordem = escolhidos;
            state.encarteInteiro = true;
            await mostrar('videos');
            aviso('Este encarte excede o limite de um vídeo. Use “Organizar vídeos do encarte” para preparar todos os produtos.', 7000);
          }
          state.importarNaEscolha = false;
          atualizarEtapas();
        }
      } catch (e) { falha(e); }
    }));
  } catch (e) { falha(e); }
}

// ---------- editor ----------
async function abrirPedido(pedido) {
  if (state.pedido?.id !== pedido.id) state.contextoCartela = null;
  state.esquema = await api('/esquema?template=' + encodeURIComponent(pedido.template));
  state.pedido = pedido;
  state.encarteInteiro = false;
  el('editar-cartelas').hidden = true;
  el('gerar').textContent = 'Gerar este vídeo';
  el('titulo').value = pedido.titulo;
  const saida = state.esquema.saida || state.esquema;
  el('formato').textContent = `Saída: ${saida.largura} × ${saida.altura} px · ${state.esquema.duracao}s`;
  el('status-formato').textContent = `MP4 ${saida.largura}×${saida.altura} · ${state.esquema.duracao}s · entra na fila de geração`;
  state.validacao = pedido.validacao || [];
  await montarFormulario();
  estadoSalvo(`Salvo · ${hora(pedido.atualizado)}`);
  atualizarPreview(state.esquema.capaEm);  // abre parado num momento com conteúdo, não no quadro vazio do início
  await mostrar('editor');
}

const valor = (caminho) => caminho.reduce((o, k) => o?.[k], state.pedido.dados);
function definir(caminho, v) {
  OfertasEdicao.conteudoAlterado();
  let o = state.pedido.dados;
  caminho.slice(0, -1).forEach((k) => (o = o[k]));
  o[caminho.at(-1)] = v;
  agendarSalvar();
  if (caminho[0] === 'ultimacartela') montarFormulario();
  if (state.tela === 'videos') desenharSaida();
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
  if (def.tipo === 'opcoes') controle = `<select id="${idInput}">${def.opcoes.map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(def.rotulosOpcoes?.[o] || o)}</option>`).join('')}</select>`;
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
  if (def.id === 'estiloselo' && caminho.length === 1) {
    div.classList.add('of-estilo-selos');
    const acoes = document.createElement('div'); acoes.className = 'toolbar';
    const aplicar = document.createElement('button');
    aplicar.type = 'button'; aplicar.className = 'secondary'; aplicar.textContent = 'Aplicar a todas as cartelas';
    const restaurar = document.createElement('button');
    restaurar.type = 'button'; restaurar.className = 'text-button'; restaurar.textContent = 'Restaurar padrão do template';
    const atualizar = async (estilo) => {
      OfertasEdicao.conteudoAlterado();
      state.pedido.dados.estiloselo = estilo || 'padrao';
      const lista = listaPrincipal();
      if (lista?.campos.some(c => c.id === 'estiloselo')) state.pedido.dados[lista.id].forEach(p => { p.estiloselo = 'padrao'; });
      agendarSalvar(); await montarFormulario();
    };
    aplicar.onclick = () => atualizar(state.pedido.dados.estiloselo);
    restaurar.onclick = () => atualizar('padrao');
    acoes.append(aplicar, restaurar); div.append(acoes);
  }
  return div;
}

async function montarFormulario() {
  // nome e transparência das imagens da biblioteca usadas no pedido (para o "Remover fundo")
  const ids = JSON.stringify(state.pedido.dados).match(/biblioteca:[0-9a-f]{32}/g)?.map((x) => x.slice(11)).filter((i) => !state.imagens[i]) || [];
  if (ids.length) (await api('/imagens?ids=' + [...new Set(ids)].join(','))).forEach((i) => (state.imagens[i.id] = i));
  const form = el('formulario');
  const rolagem = form.scrollTop;
  form.innerHTML = '<h3>Conteúdo das cartelas</h3>';
  const gerais = document.createElement('details');
  gerais.className = 'of-dados-campanha';
  gerais.innerHTML = '<summary>Datas e dados da campanha</summary>';
  gerais.open = !state.esquema.editorCartelas;
  form.append(gerais);
  el('video-opcoes').replaceChildren();
  for (const def of [...state.esquema.campos.filter(c => c.tipo !== 'lista'), ...state.esquema.campos.filter(c => c.tipo === 'lista')]) {
    if (def.tipo !== 'lista') {
      const destino = def.id === 'estiloselo' ? form : ['animacoes', 'ultimacartela'].includes(def.id) ? el('video-opcoes') : gerais;
      destino.append(campo(def, [def.id], def.id)); continue;
    }
    const qtd = state.pedido.dados[def.id].length;
    const tamanho = def.grupo?.tamanho || def.itens;
    const variavel = def.min < def.itens;
    const nomeGrupo = def.grupo?.rotulo || 'Grupo';
    const nomeItem = (def.rotuloItem || def.rotulo).toLowerCase();
    const incompleto = variavel && def.grupo?.incompleto; // a última cartela pode ter menos itens (ex.: produto sozinho)
    const tamanhosGrupos = tamanhosCartelas(qtd, tamanho, def.grupo?.finalTres && state.pedido.dados.ultimacartela === 'tres');
    for (let g = 0; g < tamanhosGrupos.length; g++) {
      const inicioGrupo = tamanhosGrupos.slice(0, g).reduce((a,b) => a+b, 0);
      const noGrupo = tamanhosGrupos[g];
      const grupo = document.createElement('section');
      grupo.className = 'grupo';
      if (def === listaPrincipal()) grupo.dataset.cartela = String(g);
      grupo.innerHTML = `<header><h4>${esc(def.grupo ? `${nomeGrupo} ${g + 1}` : def.rotulo)}</h4><small>${noGrupo} ${esc(nomeItem)}${noGrupo > 1 ? 's' : ''}${noGrupo < tamanho ? ' · centralizado' : ''}</small></header>`;
      if (variavel && qtd - noGrupo >= def.min) {
        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'remover-grupo';
        remover.textContent = 'Remover';
        remover.setAttribute('aria-label', `Remover ${nomeGrupo.toLowerCase()} ${g + 1}`);
        remover.onclick = async () => {
          const nomes = state.pedido.dados[def.id].slice(inicioGrupo, inicioGrupo + noGrupo).map((it) => it.nome).filter(Boolean).join(', ');
          if (!(await confirmar(`Remover ${nomeGrupo.toLowerCase()} ${g + 1}?`, `${nomes ? nomes + ' saem' : 'Os produtos dela saem'} do vídeo. As imagens continuam na Biblioteca.`, 'Remover'))) return;
          mudarQuantidade(def, (lista) => lista.splice(inicioGrupo, noGrupo));
        };
        grupo.querySelector('header').append(remover);
      }
      for (let i = inicioGrupo; i < inicioGrupo + noGrupo; i++) {
        const card = document.createElement('div');
        card.className = 'item-card';
        if (def === listaPrincipal()) card.dataset.produto = String(i + 1);
        card.innerHTML = `<div class="item-titulo"><b>${i + 1}</b>${esc(def.rotuloItem || def.rotulo)} ${i + 1}</div>`;
        if (incompleto && qtd > def.min) {
          const tirar = document.createElement('button');
          tirar.type = 'button';
          tirar.className = 'remover-item';
          tirar.textContent = 'Remover';
          tirar.setAttribute('aria-label', `Remover ${nomeItem} ${i + 1}`);
          tirar.onclick = () => mudarQuantidade(def, (lista) => lista.splice(i, 1));
          card.querySelector('.item-titulo').append(tirar);
        }
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
          if (sub.oculto) continue;
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
      const grupos = tamanhosGrupos.length, maximo = def.itens / tamanho;
      const rodape = document.createElement('div');
      rodape.className = 'grupo-rodape';
      const adicionar = document.createElement('button');
      adicionar.type = 'button';
      adicionar.className = 'adicionar-grupo';
      adicionar.disabled = qtd >= def.itens;
      // com cartela incompleta, adicionar completa a última (1 produto); senão, uma cartela nova
      const novos = incompleto ? (qtd % tamanho ? 1 : Math.min(tamanho, def.itens - qtd)) : tamanho;
      adicionar.textContent = qtd >= def.itens ? `Limite de ${maximo} ${nomeGrupo.toLowerCase()}s`
        : novos < tamanho ? `+ Adicionar ${nomeItem}` : `+ Adicionar ${nomeGrupo.toLowerCase()}`;
      adicionar.onclick = () => mudarQuantidade(def, (lista) => lista.push(...itensPadrao(def, lista.length, novos)), true);
      const resumo = document.createElement('small');
      resumo.textContent = `${grupos} de ${maximo} ${nomeGrupo.toLowerCase()}${maximo > 1 ? 's' : ''} · ${qtd} ${nomeItem}${qtd > 1 ? 's' : ''} · a duração do vídeo é dividida igualmente`;
      rodape.append(adicionar, resumo);
      form.append(rodape);
    }
  }
  form.scrollTop = rolagem;
  sincronizarPainelCartela();
  aplicarValidacao(state.validacao);
}

// lista com quantidade variável (template com "min"): itens novos vêm do conteúdo de exemplo do template
function itensPadrao(def, de, qtd) {
  const padrao = state.esquema.padrao[def.id];
  return Array.from({ length: qtd }, (_, i) => structuredClone(padrao[(de + i) % padrao.length]));
}
async function mudarQuantidade(def, mudar, rolarAteNovo = false) {
  OfertasEdicao.conteudoAlterado();
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
const limitesCartelas = (lista) => [Math.ceil((lista.min ?? lista.itens) / passoDe(lista)), lista.itens / passoDe(lista)];
function tamanhosCartelas(n, passo = 2, tres = false) {
  const grupos = Array(Math.floor(n / passo)).fill(passo);
  if (n % passo) {
    if (tres && passo === 2 && n >= 3) grupos[grupos.length - 1] = 3;
    else grupos.push(n % passo);
  }
  return grupos;
}
function tamanhosDosVideos(n, lista, cartelas, distribuicao = 'equilibrar') {
  const passo = passoDe(lista), [gmin, gmax] = limitesCartelas(lista);
  cartelas ??= gmax;
  const grupos = Math.ceil(n / passo), total = Math.ceil(grupos / cartelas);
  return Array.from({ length: total }, (_, k) => Math.max(gmin, distribuicao === 'sequencia' ? Math.min(cartelas, grupos - k * cartelas) : Math.floor(grupos / total) + (k < grupos % total ? 1 : 0)) * passo);
}

function aplicarValidacao(detalhes) {
  state.validacao = detalhes;
  document.querySelectorAll('#of-formulario .com-erro, #of-video-opcoes .com-erro').forEach((e) => e.classList.remove('com-erro'));
  const gerais = [];
  for (const d of detalhes) {
    const alvo = d.campo && document.querySelector(`#of-formulario [data-var="${d.campo}"], #of-video-opcoes [data-var="${d.campo}"]`);
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
  if (state.tela === 'videos') desenharSaida();
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
  if (state.esquema?.editorCartelas) {
    montarEditorIntegrado();
    return;
  }
  const player = el('player');
  const tempo = inicio ?? (player.currentTime || 0);
  const tocando = player.ready && !player.paused;
  player.addEventListener('ready', () => { if (tempo) player.seek(tempo); if (tocando) player.play(); }, { once: true });
  player.setAttribute('src', `/ofertas/preview/${state.pedido.id}/index.html?v=${state.pedido.revision}`);
}

async function gerarPedido() {
  await salvarAgora();
  try {
    const r = await api('/gerar', { body: { id: state.pedido.id, revision: state.pedido.revision } });
    if (!r.ok) { aplicarValidacao(r.validacao); aviso('Corrija os campos marcados antes de gerar.'); return; }
    aviso('Vídeo enviado para a fila de geração.');
    mostrar('fila');
  } catch (e) { falha(e); }
}

async function abrirEdicaoCartelas(gerarDepois = false) {
  await salvarAgora();
  if (!state.esquema?.editorCartelas) return;
  if (state.validacao.length) { aviso('Confira os campos marcados antes de editar as cartelas.'); return; }
  if (!el('save-state').textContent.startsWith('Salvo')) { aviso('Salve as alterações antes de abrir o editor.'); return; }
  await mostrar('editor');
  if (gerarDepois) aviso('Confira as cartelas aqui e depois continue para os vídeos.');
}
el('editar-cartelas').addEventListener('click', () => abrirEdicaoCartelas().catch(falha));
el('gerar').addEventListener('click', () => gerarPedido().catch(falha));

function sincronizarPainelCartela(contexto = state.contextoCartela) {
  if (!state.esquema?.editorCartelas) {
    el('formulario').querySelectorAll('[data-cartela], [data-produto]').forEach(n => n.hidden = false);
    return;
  }
  const lista = listaPrincipal(), qtd = state.pedido.dados[lista.id].length;
  const grupos = tamanhosCartelas(qtd, passoDe(lista), state.pedido.dados.ultimacartela === 'tres');
  const cartela = Math.min(contexto?.cartela || 0, grupos.length - 1);
  const primeiro = grupos.slice(0, cartela).reduce((a,b) => a+b,0) + 1;
  const produto = contexto?.produto >= primeiro && contexto.produto < primeiro + grupos[cartela] ? contexto.produto : primeiro;
  state.contextoCartela = {...contexto, cartela, produto};
  el('formulario').querySelector('h3').textContent = `Conteúdo · Produto ${produto}`;
  el('formulario').querySelectorAll('[data-cartela]').forEach(n => n.hidden = Number(n.dataset.cartela) !== cartela);
  el('formulario').querySelectorAll('[data-produto]').forEach(n => n.hidden = Number(n.dataset.produto) !== produto);
}
function montarEditorIntegrado() {
  if (!state.pedido) return;
  const integrado = Boolean(state.esquema.editorCartelas);
  el('editor-unificado').hidden = !integrado;
  el('editor-classico').hidden = integrado;
  if (!integrado) { el('editor-classico').append(el('formulario')); el('editor-classico').querySelector('.player-shell').append(el('player')); return; }
  const pedidoId = state.pedido.id;
  const conteudo = JSON.stringify(state.pedido.dados, (k,v) => k === 'edicao' ? undefined : v);
  const editor = OfertasEdicao.montar({
    pedido:state.pedido,
    salvo: el('save-state')?.textContent?.startsWith('Salvo') !== false,
    conteudo,
    urlImagem,
    onContexto: contexto => {
      if (state.pedido?.id !== pedidoId) return;
      sincronizarPainelCartela(contexto);
    },
    onAlterar: ajustes => {
      if (state.pedido?.id !== pedidoId) return;
      if (conteudo !== JSON.stringify(state.pedido.dados, (k,v) => k === 'edicao' ? undefined : v)) return;
      let mudou = false;
      for (const [numero, ajuste] of Object.entries(ajustes)) {
        const produto = state.pedido.dados.produtos[Number(numero)-1], texto = JSON.stringify(ajuste);
        if (produto && produto.edicao !== texto) { produto.edicao = texto; mudou = true; }
      }
      if (mudou) agendarSalvar();
    },
    onReproduzir: async (cartela,total) => {
      await salvarAgora();
      if (!el('save-state').textContent.startsWith('Salvo')) throw new Error('Salve as alterações antes de reproduzir a prévia.');
      const player = el('player');
      player.addEventListener('ready', () => { player.seek(state.esquema.duracao/total*cartela + .1); player.play(); }, {once:true});
      player.setAttribute('src', `/ofertas/preview/${pedidoId}/index.html?v=${state.pedido.revision}`);
    },
    onPararPrevia: () => el('player').pause?.(),
    onContinuar: irParaVideos,
    onErro: falha
  }, el('editor-unificado'));
  if (el('formulario').parentElement !== editor.dados) editor.dados.append(el('formulario'));
  if (el('player').parentElement !== editor.preview) editor.preview.append(el('player'));
  sincronizarPainelCartela();
}


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
    if (!el('conferencia').hidden) desenharCardEncarte();
    if (!el('videos').hidden) desenharSaida();
    // o botão "Trocar pelo encarte" dos produtos depende de haver encarte pronto
    const temTroca = !!el('formulario').querySelector('.trocar-encarte');
    if (state.esquema && !el('editor').hidden && temTroca !== (encartesProntos().length > 0 && !!listaPrincipal())) montarFormulario();
    if (state.encartes.some((e) => e.status === 'lendo')) encTimer = setTimeout(carregarEncartes, 1500);
  } catch (e) { encTimer = setTimeout(carregarEncartes, 8000); }
}
async function enviarEncarte(arquivo) {
  if (!arquivo) return;
  const pdf = /\.pdf$/i.test(arquivo.name);
  if (arquivo.size > (pdf ? 200 : 100) * 1024 * 1024) return aviso(pdf ? 'O limite para encartes PDF é 200 MB por arquivo.' : 'O limite para imagens é 100 MB por arquivo.', 6500);
  const t = IndoorTarefas.criar(arquivo.name, 'Enviando…').progresso(0);
  try {
    const r = await enviarArquivo('/encarte?nome=' + encodeURIComponent(arquivo.name) + '&comprimir=' + (el('encarte-comprimir').checked ? '1' : '0'), arquivo, t, 'Preparando e lendo encarte…');
    tarefaEncarte[r.id] = t.detalhe('Lendo encarte…').progresso(null);
    state.encarteSel = r.id; state.ordem = [];
    await carregarEncartes();
  } catch (e) { t.falhar(e.message); }
}
let arquivosConjunto = [], enviandoConjunto = false;
function selecionarEncartes(arquivos) {
  if (enviandoConjunto) return aviso('Aguarde o envio dos encartes terminar.');
  if (!arquivos.length) return;
  if (arquivos.some((f) => !/\.(pdf|png|jpe?g)$/i.test(f.name))) return aviso('Selecione apenas encartes PDF, PNG ou JPG.');
  if (arquivos.length > 20) return aviso('Selecione até 20 encartes por conjunto.');
  if (arquivos.length > 1 && arquivos.reduce((n, f) => n + f.size, 0) > 200 * 1024 * 1024 - 65536) return aviso('O conjunto deve ter até 200 MB.');
  if (arquivos.some((f) => f.size > (/\.pdf$/i.test(f.name) ? 200 : 100) * 1024 * 1024)) return aviso('Limite por arquivo: PDF 200 MB; imagens 100 MB.');
  arquivosConjunto = [...arquivos];
  if (arquivos.length === 1) { arquivosConjunto = []; desenharImportacao(); return enviarEncarte(arquivos[0]); }
  desenharImportacao();
}
function desenharImportacao() {
  el('importacao-conjunto').hidden = !arquivosConjunto.length;
  el('importacao-lista').innerHTML = arquivosConjunto.map((f, i) => `<li><span>${i+1}. ${esc(f.name)} · ${(f.size/1024/1024).toLocaleString('pt-BR', {maximumFractionDigits:2})} MB</span>
    <button type="button" class="secondary" data-mover="-1" data-arquivo="${i}" aria-label="Mover ${esc(f.name)} para cima" ${!i || enviandoConjunto ? 'disabled' : ''}>↑</button>
    <button type="button" class="secondary" data-mover="1" data-arquivo="${i}" aria-label="Mover ${esc(f.name)} para baixo" ${i === arquivosConjunto.length-1 || enviandoConjunto ? 'disabled' : ''}>↓</button>
    <button type="button" class="text-button" data-remover="${i}" aria-label="Remover ${esc(f.name)} da seleção" ${enviandoConjunto ? 'disabled' : ''}>×</button></li>`).join('');
  el('importacao-lista').querySelectorAll('[data-mover]').forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.arquivo), j = i + Number(b.dataset.mover);
    if (enviandoConjunto || j < 0 || j >= arquivosConjunto.length) return;
    [arquivosConjunto[i], arquivosConjunto[j]] = [arquivosConjunto[j], arquivosConjunto[i]];
    desenharImportacao();
  });
  el('importacao-lista').querySelectorAll('[data-remover]').forEach((b) => b.onclick = () => { if (!enviandoConjunto) { arquivosConjunto.splice(Number(b.dataset.remover), 1); desenharImportacao(); } });
  el('importacao-enviar').textContent = enviandoConjunto ? 'Enviando…' : `Importar ${arquivosConjunto.length} encarte(s) juntos`;
  el('importacao-enviar').disabled = enviandoConjunto || !arquivosConjunto.length;
  el('importacao-cancelar').disabled = enviandoConjunto;
  el('encarte-enviar').disabled = enviandoConjunto;
}
el('importacao-cancelar').addEventListener('click', () => { arquivosConjunto = []; desenharImportacao(); });
el('importacao-enviar').addEventListener('click', async () => {
  if (enviandoConjunto || !arquivosConjunto.length) return;
  const arquivos = [...arquivosConjunto], form = new FormData();
  arquivos.forEach((f) => form.append('encartes', f, f.name));
  const t = IndoorTarefas.criar(`${arquivos.length} encartes juntos`, 'Enviando…').progresso(0);
  enviandoConjunto = true; desenharImportacao();
  try {
    const r = await enviarArquivo('/encartes-importar?comprimir=' + (el('encarte-comprimir').checked ? '1' : '0'), form, t, 'Unindo e lendo os encartes…');
    tarefaEncarte[r.id] = t.detalhe('Unindo e lendo os encartes…').progresso(null);
    state.encarteSel = r.id; state.ordem = []; arquivosConjunto = [];
    await carregarEncartes();
  } catch (e) { t.falhar(e.message); }
  finally { enviandoConjunto = false; desenharImportacao(); }
});
el('arquivo-pdf').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; selecionarEncartes(fs); });
el('encarte-enviar').addEventListener('click', () => el('arquivo-pdf').click());
soltar(el('encarte-card'), selecionarEncartes);

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
  card.hidden = false;
  if (card.hidden) return;
  const recentes = state.encartes.slice(0, 8);
  el('encarte-lista').innerHTML = recentes.map((e) => `<button type="button" class="chip ${e.id === state.encarteSel ? 'ativo' : ''}" data-id="${e.id}">
    <strong>${esc(e.nome)}</strong><small>${e.status === 'pronto' ? `${e.itens.length} produtos · ${hora(e.criado)}` : ENC_STATUS[e.status]}</small></button>`).join('');
  el('encarte-lista').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { state.encarteSel = c.dataset.id; state.ordem = []; desenharCardEncarte(); }));
  const enc = state.encartes.find((e) => e.id === state.encarteSel);
  const compressao = el('encarte-compressao');
  const prep = enc?.preparacao;
  compressao.hidden = !prep;
  compressao.replaceChildren();
  if (prep) {
    const mb = (bytes) => bytes < 1024 * 1024
      ? `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`
      : `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB`;
    const reducao = prep.reduzido ? ` ${mb(prep.original)} → ${mb(prep.final)} (${Math.round((1 - prep.final / prep.original) * 100)}% menor).` : '';
    compressao.append(document.createTextNode(prep.mensagem + reducao));
    if (prep.fontes) compressao.append(document.createTextNode(' Ordem: ' + prep.fontes.map((f, i) => `${i+1}. ${f.nome}`).join(' → ') + '.'));
    if (prep.reduzido && enc.status !== 'lendo') {
      const baixar = document.createElement('a');
      baixar.href = `/ofertas/encarte/${enc.id}/compactado.pdf`;
      baixar.textContent = ' Baixar PDF compactado';
      baixar.setAttribute('download', '');
      compressao.append(baixar);
    }
  }
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
  atualizarResumoConferencia();
}
function desenharEncarte() {
  const max = listaPrincipal()?.itens || 30;
  el('encarte-itens').innerHTML = state.encarte.map((it, k) => {
    const pos = state.ordem.indexOf(k), av = avisosDe(it);
    return `<button class="card ${pos >= 0 ? 'selected' : ''} ${av.length ? 'com-aviso' : ''}" data-k="${k}">${pos >= 0 ? `<span class="ordem">${pos + 1}</span>` : ''}
      <span class="edit-card secondary conferir">${av.length ? 'Conferir' : 'Editar'}</span>
      ${av.length ? `<span class="alerta" title="${esc(av.join('\n'))}">${av.length === 1 ? 'Conferir' : av.length + ' avisos'}</span>` : it.conferido ? '<span class="conferido" title="Conferido">'+icon('check','inline-icon')+'conferido</span>' : ''}
      <img class="thumb" src="/ofertas/miniatura/${it.imagem}.png" alt="" loading="lazy">${itemEncarte(it)}</button>`;
  }).join('');
  el('encarte-itens').querySelectorAll('.card').forEach((c) => c.addEventListener('click', (e) => {
    if (e.target.closest('.conferir') || !listaPrincipal()) return abrirConferir(Number(c.dataset.k));
    const k = Number(c.dataset.k), i = state.ordem.indexOf(k);
    if (i >= 0) state.ordem.splice(i, 1); else if (state.ordem.length < max) state.ordem.push(k); else return aviso(`Este template usa ${max} produtos.`);
    desenharEncarte();
  }));
  el('usar-encarte').hidden = !state.ordem.length;
  el('usar-encarte').textContent = `Usar ${state.ordem.length} produtos escolhidos →`;
  const conferir = state.encarte.filter((it) => avisosDe(it).length).length;
  el('encarte-dica').textContent = (state.ordem.length ? `${state.ordem.length}/${max} escolhidos · clique de novo para desmarcar` : (listaPrincipal() ? `Clique em até ${max} produtos, na ordem do vídeo, ou continue com todo o encarte.` : 'Clique em um produto para conferir o recorte, o nome e os preços.'))
    + (conferir ? ` · ${conferir} ${conferir === 1 ? 'produto para conferir' : 'produtos para conferir'}` : '');
}
function preencherEscolhidos() {
  OfertasEdicao.conteudoAlterado();
  const lista = listaPrincipal();
  if (lista.min < lista.itens) { // lista variável: a quantidade acompanha os produtos escolhidos (em grupos completos)
    const passo = lista.grupo?.incompleto ? 1 : lista.grupo?.tamanho || 1;
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
}
el('usar-encarte').addEventListener('click', () => continuarEncarte(false));

// produto do encarte -> item da lista do pedido (só os campos que o template tem)
function preencherItem(lista, alvo, it) {
  const subs = Object.fromEntries(lista.campos.map((s) => [s.id, s]));
  if (subs.edicao) alvo.edicao = '{}';
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
  const limite = impar === 'tres' && sobra && n >= 3 ? Math.floor((lista.itens - 1) / passo) : gmax;
  const cartelas = Math.min(limite, Math.max(gmin, Math.round(Number(el('lote-cartelas').value) || limite)));
  const distribuicao = el('lote-distribuicao').value;
  const grupos = tamanhosCartelas(n, passo, impar === 'tres');
  if (!['sozinho', 'tres'].includes(impar) && grupos.at(-1) < passo) grupos[grupos.length - 1] = passo;
  let inicio = 0;
  const tamanhos = tamanhosDosVideos(grupos.length * passo, lista, cartelas, distribuicao).map(t => {
    const qtd = t / passo, parte = grupos.slice(inicio, inicio + qtd);
    inicio += qtd;
    return parte.reduce((a,b) => a+b, 0) + Math.max(0, qtd - parte.length) * passo;
  });
  return { enc, lista, passo, gmin, gmax: limite, impar, sobra, n, cartelas, distribuicao, tamanhos, repetidos: tamanhos.reduce((a, b) => a + b, 0) - n };
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function desenharLote() {
  const p = planoLote(), nomeGrupo = (p.lista.grupo?.rotulo || 'cartela').toLowerCase();
  el('lote-cartelas').value = p.cartelas;
  el('lote-cartelas').max = p.gmax;
  el('lote-videos').value = p.tamanhos.length;
  el('lote-titulo').textContent = `Gerar ${plural(p.tamanhos.length, 'vídeo', 'vídeos')} com ${plural(p.enc.itens.length, 'produto', 'produtos')}`;
  el('lote-sub').textContent = `${p.enc.nome} · na ordem do encarte`;
  el('lote-cartelas-ajuda').textContent = p.gmin === p.gmax ? `Fixo neste template (${p.gmax}).` : `De ${p.gmin} a ${p.gmax} por vídeo.`;
  el('lote-videos-ajuda').textContent = p.distribuicao === 'sequencia' ? 'Preenche cada vídeo e deixa a sobra no último.' : 'Distribui as cartelas em quantidades parecidas.';
  el('lote-impar').hidden = !p.sobra;
  el('lote-primeiro').textContent = p.enc.itens[0]?.nome ? `(${p.enc.itens[0].nome})` : '';
  el('lote-ultimo').textContent = el('lote-ultimo-sozinho').textContent = p.enc.itens.at(-1)?.nome ? `(${p.enc.itens.at(-1).nome})` : '';
  // vídeos iguais em sequência viram uma linha: "Vídeos 1 a 3 · 4 cartelas (8 produtos)"
  const linhas = [];
  p.tamanhos.forEach((t, k) => { const ult = linhas.at(-1); if (ult?.t === t) ult.ate = k + 1; else linhas.push({ t, de: k + 1, ate: k + 1 }); });
  el('lote-resumo').innerHTML = linhas.map((l) => `<li><b>${l.de === l.ate ? `Vídeo ${l.de}` : `Vídeos ${l.de} a ${l.ate}`}</b><span>${plural(tamanhosCartelas(l.t, p.passo, p.impar === 'tres').length, nomeGrupo, nomeGrupo + 's')} · ${plural(l.t, 'produto', 'produtos')}</span></li>`).join('');
  const notas = [];
  if (p.repetidos) notas.push(`${plural(p.repetidos, 'produto se repete', 'produtos se repetem')} para completar ${p.repetidos > p.sobra ? 'os vídeos' : 'a cartela'} (a partir do 1º do encarte).`);
  if (p.impar === 'sozinho' && p.sobra) notas.push(`${p.enc.itens.at(-1).nome || 'O último produto'} aparece sozinho, centralizado, na última ${nomeGrupo}.`);
  if (p.impar === 'tres' && p.sobra) notas.push(p.n >= 3 ? 'Os últimos três produtos ficam juntos na última cartela, sem repetir nem excluir produtos.' : 'Como há apenas um produto, ele fica sozinho e centralizado.');
  notas.push(el('lote-animacoes').checked ? 'Com animações.' : 'Slides sem animações, com troca direta de cartela.');
  if (p.n < p.enc.itens.length) notas.push(`${p.enc.itens.at(-1).nome || 'O último produto'} fica de fora.`);
  el('lote-nota').textContent = notas.join(' ');
  const pendentes = p.enc.itens.filter((it) => avisosDe(it).length).length;
  el('lote-aviso').hidden = !pendentes;
  el('lote-aviso').textContent = `Atenção: ${plural(pendentes, 'produto ainda tem aviso', 'produtos ainda têm avisos')} para conferir.`;
  const base = el('lote-nome').value.trim() || p.enc.nome.replace(/\.[^.]+$/, '');
  el('lote-nomes').textContent = p.tamanhos.length > 1 ? `Nomes: ${base} (1) … ${base} (${p.tamanhos.length})` : `Nome: ${base}`;
  el('lote-gerar').textContent = `${el('lote-revisar').checked ? 'Preparar para revisar:' : 'Gerar'} ${plural(p.tamanhos.length, 'vídeo', 'vídeos')}`;
}
el('lote-revisar').addEventListener('change', desenharLote);
el('lote-cartelas').addEventListener('change', desenharLote);
el('lote-nome').addEventListener('input', desenharLote);
el('lote-distribuicao').addEventListener('change', desenharLote);
el('lote-animacoes').addEventListener('change', desenharLote);
// quantidade de vídeos -> cartelas por vídeo (o mínimo que cabe nesses vídeos); o resumo mostra o resultado real
el('lote-videos').addEventListener('change', () => {
  const p = planoLote(), videos = Math.max(1, Math.round(Number(el('lote-videos').value) || 1));
  el('lote-cartelas').value = Math.ceil(tamanhosCartelas(p.n, p.passo, p.impar === 'tres').length / videos);
  desenharLote();
});
document.querySelectorAll('input[name=of-lote-impar]').forEach((r) => r.addEventListener('change', desenharLote));
el('encarte-todos').addEventListener('click', () => {
  const [gmin, gmax] = limitesCartelas(listaPrincipal());
  Object.assign(el('lote-cartelas'), { min: gmin, max: gmax, value: gmax, disabled: gmin === gmax });
  el('lote-videos').disabled = gmin === gmax;
  const sozinho = Boolean(listaPrincipal().grupo?.incompleto); // template centraliza o produto sozinho: vira o padrão
  el('lote-sozinho').hidden = !sozinho;
  el('lote-tres').hidden = !listaPrincipal().grupo?.finalTres;
  el('lote-animacoes-campo').hidden = !state.esquema.campos.some(c => c.id === 'animacoes');
  el('lote-revisar-campo').hidden = !state.esquema.editorCartelas;
  el('lote-revisar').checked = Boolean(state.esquema.editorCartelas);
  el('lote-animacoes').checked = state.pedido.dados.animacoes !== false;
  const imparPadrao = sozinho && listaPrincipal().grupo?.finalTres && state.pedido.dados.ultimacartela === 'tres' ? 'tres' : sozinho ? 'sozinho' : 'repetir';
  document.querySelector(`input[name=of-lote-impar][value=${imparPadrao}]`).checked = true;
  el('lote-nome').value = encAtual().nome.replace(/\.[^.]+$/, '');
  desenharLote();
  el('lote-dialog').showModal();
});
el('lote-gerar').addEventListener('click', async () => {
  const p = planoLote();
  el('lote-gerar').disabled = true;
  try {
    const r = await api('/encarte-gerar-todos', { body: { encarte: p.enc.id, template: state.pedido.template, cartelas: p.cartelas, impar: p.impar, nome: el('lote-nome').value, distribuicao: p.distribuicao, animacoes: el('lote-animacoes').checked, revisar: el('lote-revisar').checked, ...(state.esquema.campos.some(c => c.id === 'estiloselo') ? {estiloselo: state.pedido.dados.estiloselo || 'padrao'} : {}) } });
    el('lote-dialog').close();
    if (r.revisar) {
      aviso(`${r.videos.length} pedidos preparados para revisão. Eles também estão em Pedidos recentes.`, 7000);
      await mostrar('pedidos');
      if(r.lote)await abrirVisaoLote(r.lote);
      return;
    }
    const falhos = r.videos.filter((v) => !v.render);
    aviso(falhos.length ? `${r.videos.length - falhos.length} na fila. ${falhos.length} não ${falhos.length === 1 ? 'pôde' : 'puderam'} ser gerado(s): abra em Pedidos recentes para corrigir.`
      : `${r.videos.length} ${r.videos.length === 1 ? 'vídeo enviado' : 'vídeos enviados'} para a fila de geração.`, 7000);
    carregarFila();
    mostrar(falhos.length ? 'pedidos' : 'fila');
  } catch (e) { falha(e); } finally { el('lote-gerar').disabled = false; }
});

// ---------- visão completa dos lotes ----------
const areaLotes=document.createElement('section');areaLotes.className='of-lotes';
areaLotes.innerHTML='<div class="barra-lista"><h3>Conferência dos lotes</h3><select aria-label="Lote para conferir"><option value="">Escolha um lote</option></select><button type="button" class="secondary" data-lotes-atualizar>Atualizar</button><button type="button" data-lotes-fechar hidden>Mostrar pedidos individuais</button></div><p class="help">Todos os vídeos e cartelas do encarte em uma única visão. O conteúdo exibido acompanha os pedidos salvos.</p><div data-lotes-conteudo></div>';
el('pedidos').prepend(areaLotes);
let loteAtual=null,loteTimer=null,loteVersao=0;
async function carregarLotes(){
  try{const lista=await api('/lotes'),select=areaLotes.querySelector('select'),atual=select.value;select.replaceChildren(new Option('Escolha um lote',''),...lista.map(l=>new Option(l.nome,l.id)));select.value=atual;}catch(e){falha(e);}
}
areaLotes.querySelector('select').onchange=e=>{if(e.target.value)abrirVisaoLote(e.target.value).catch(falha);else fecharVisaoLote();};
areaLotes.querySelector('[data-lotes-atualizar]').onclick=()=>{carregarLotes();if(loteAtual)abrirVisaoLote(loteAtual).catch(falha);};
areaLotes.querySelector('[data-lotes-fechar]').onclick=fecharVisaoLote;
function fecharVisaoLote(){loteAtual=null;++loteVersao;clearTimeout(loteTimer);areaLotes.querySelector('[data-lotes-conteudo]').replaceChildren();areaLotes.querySelector('[data-lotes-fechar]').hidden=true;areaLotes.querySelector('select').value='';el('lista-pedidos').hidden=false;}
async function abrirVisaoLote(id){
  clearTimeout(loteTimer);const versao=++loteVersao,lote=await api('/lote?id='+encodeURIComponent(id));if(versao!==loteVersao)return;
  loteAtual=id;areaLotes.querySelector('select').value=id;areaLotes.querySelector('[data-lotes-fechar]').hidden=false;el('lista-pedidos').hidden=true;
  const uso=Array(lote.origem.length).fill(0);lote.videos.filter(v=>!v.excluido).forEach(v=>v.indices.forEach(i=>uso[i]++));
  const repetidos=uso.flatMap((n,i)=>n>1?[`${lote.origem[i].nome} (${n} vezes)`]:[]),fora=uso.flatMap((n,i)=>!n?[lote.origem[i].nome]:[]);
  const corpo=areaLotes.querySelector('[data-lotes-conteudo]');
  corpo.innerHTML=`<div class="of-lote-resumo"><strong>${esc(lote.nome)}</strong><span>${lote.videos.length} vídeos · ${uso.filter(n=>n>0).length}/${uso.length} produtos de origem distribuídos</span><p>${repetidos.length?'Repetidos: '+esc(repetidos.join(' · ')):'Nenhum produto de origem repetido.'}</p><p>${fora.length?'Fora dos vídeos: '+esc(fora.join(' · ')):'Todos os produtos de origem estão distribuídos.'}</p><small>A distribuição se refere à montagem inicial do lote. Confira nomes e imagens atuais abaixo caso tenha trocado produtos.</small></div>`;
  for(const [numero,v] of lote.videos.entries()){
    const sec=document.createElement('section');sec.className='of-lote-video';sec.dataset.pedido=v.pedido;
    sec.innerHTML=`<header><h4>${esc(v.titulo||'Vídeo '+(numero+1))}</h4><span>${v.excluido?'Pedido excluído':v.erros?.length?'Campos para corrigir':'Pronto para conferência visual'}</span></header>`;
    if(v.excluido){corpo.append(sec);continue;}
    if(v.erros?.length){const p=document.createElement('p');p.className='of-lote-alerta';p.textContent=v.erros.join(' · ');sec.append(p);}
    const grade=document.createElement('div');grade.className='of-lote-grade';
    let inicio=0;
    for(const [k,tamanho] of tamanhosCartelas(v.produtos.length,2,v.ultimacartela==='tres').entries()){
      const produtos=v.produtos.slice(inicio,inicio+tamanho),indices=v.indices.slice(inicio,inicio+tamanho);inicio+=tamanho;
      const b=document.createElement('button');b.type='button';b.className='of-lote-cartela';b.dataset.cartela=String(k);
      b.innerHTML=`<img alt="Prévia da cartela ${k+1}" loading="lazy" decoding="async"><strong>Cartela ${k+1} · ${tamanho} produto(s)</strong><span>${produtos.map((p,i)=>`${esc(p.nome)} · R$ ${esc(p.por)}${uso[indices[i]]>1?' · repetido':''}`).join('<br>')}</span><small>Abrir esta cartela para ajustar →</small>`;
      b.onclick=async()=>{try{await abrirPedido(await api('/pedido?id='+v.pedido));OfertasEdicao.irParaCartela(k);}catch(e){falha(e);}};
      grade.append(b);
    }
    sec.append(grade);corpo.append(sec);
  }
  atualizarPreviewsLote(id,versao);
}
async function atualizarPreviewsLote(id,versao){
  if(versao!==loteVersao||loteAtual!==id||state.tela!=='pedidos')return;
  let pendente=false;
  // Sequencial: cada pedido usa a fila de miniaturas, sem abrir vários navegadores.
  for(const sec of areaLotes.querySelectorAll('[data-pedido]')){
    if(!sec.querySelector('img'))continue;
    try{
      const r=await api('/cartelas-miniaturas?id='+sec.dataset.pedido);if(versao!==loteVersao)return;
      for(const [k,item] of (r.cartelas||[]).entries()){const img=sec.querySelector(`[data-cartela="${k}"] img`);if(img&&item.url&&img.getAttribute('src')!==item.url)img.src=item.url;}
      pendente ||= r.pendente;
      if(r.erro)sec.querySelectorAll('img:not([src])').forEach(img=>{img.alt='Prévia indisponível — clique para abrir o editor';});
    }catch(e){sec.querySelectorAll('img:not([src])').forEach(img=>{img.alt='Abra a cartela para conferir';});}
  }
  if(pendente&&versao===loteVersao)loteTimer=setTimeout(()=>atualizarPreviewsLote(id,versao),2200);
}

// ---------- pedidos ----------
async function carregarPedidos() {
  carregarLotes();
  if(loteAtual)abrirVisaoLote(loteAtual).catch(falha);
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
      c.querySelector('.abrir').onclick = async () => { try { state.importarNaEscolha = false; abrirPedido(await api('/pedido?id=' + c.dataset.id)); } catch (e) { falha(e); } };
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
  card.querySelector('.abrir').onclick = async (e) => { e.preventDefault(); try { state.importarNaEscolha = false; abrirPedido(await api('/pedido?id=' + r.pedido)); } catch (err) { falha(err); } };
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
      <div><strong>${esc(t.nome)}</strong> ${t.erros.length ? '<span class="status falhou">Com problemas</span>' : t.substituidoPor ? '<span class="status">Modelo anterior · fora de Novo vídeo</span>' : '<span class="status pronto">Publicado</span>'}
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
      ? `<strong>${icon('circle-check','inline-icon')}${esc(r.nome)} publicado.</strong> ${r.substituiu ? 'A versão anterior foi guardada.' : 'Já aparece em Novo vídeo.'}${(r.avisos || []).length ? `<ul>${r.avisos.map((a) => `<li>${icon('alert','inline-icon')}${esc(a)}</li>`).join('')}</ul>` : ''}`
      : `<strong>O template não foi publicado. Corrija e envie de novo:</strong><ul>${r.erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
    carregarTemplatesAdmin();
  } catch (e) { t.falhar(e.message); res.hidden = false; res.textContent = e.message; }
}
el('publicar-zona').addEventListener('click', () => el('arquivo-zip').click());
soltar(el('publicar-zona'), (fs) => publicarZip(fs[0]));
el('arquivo-zip').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) publicarZip(f); });

window.addEventListener('beforeunload', () => { if (el('save-state').textContent === PENDENTE) salvarAgora(); });
})();
