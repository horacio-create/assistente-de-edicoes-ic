// Painel de tarefas (no estilo do Google Drive): envios, leituras e processamentos longos com progresso.
//   const t = IndoorTarefas.criar('foto.png', 'Enviando…');
//   t.progresso(0.4)           0–1 = barra circular; null = girando (sem porcentagem conhecida)
//   t.detalhe('Lendo…'); t.concluir('Pronto'); t.falhar('Motivo'); t.aoClicar(() => …)
//   await IndoorTarefas.enviar(url, arquivo, { headers, onProgresso })   POST com progresso real do upload
'use strict';
window.IndoorTarefas = (() => {
  const tarefas = new Map();
  let painel, lista, titulo, seq = 0, minimizarTimer;

  function montar() {
    painel = document.createElement('section');
    painel.className = 'tarefas';
    painel.hidden = true;
    painel.setAttribute('aria-label', 'Tarefas em andamento');
    painel.innerHTML = `<header><strong aria-live="polite"></strong>
      <button type="button" class="t-min" aria-label="Minimizar" aria-expanded="true"><span></span></button>
      <button type="button" class="t-fechar" aria-label="Fechar">×</button></header><ul></ul>`;
    document.body.append(painel);
    // o painel não pode esconder conteúdo: a página reserva o espaço dele (ver tarefas.css)
    new ResizeObserver(() => document.body.style.setProperty('--tarefas-altura', painel.hidden ? '0px' : painel.offsetHeight + 24 + 'px')).observe(painel);
    titulo = painel.querySelector('strong');
    lista = painel.querySelector('ul');
    painel.querySelector('.t-min').onclick = () => minimizar(!painel.classList.contains('minimizado'));
    // fechar tira as concluídas; as que ainda estão rodando continuam (e o painel volta se houver)
    painel.querySelector('.t-fechar').onclick = () => {
      for (const [id, t] of tarefas) if (t.estado !== 'andamento') { t.li.remove(); tarefas.delete(id); }
      atualizar();
    };
  }

  function minimizar(min) {
    clearTimeout(minimizarTimer);
    painel.classList.toggle('minimizado', min);
    const botao = painel.querySelector('.t-min');
    botao.setAttribute('aria-expanded', String(!min));
    botao.setAttribute('aria-label', min ? 'Expandir' : 'Minimizar');
  }

  function atualizar() {
    if (!painel) return;
    const todas = [...tarefas.values()];
    const andamento = todas.filter((t) => t.estado === 'andamento').length;
    const erros = todas.filter((t) => t.estado === 'erro').length;
    painel.hidden = !todas.length;
    titulo.textContent = andamento
      ? `${andamento} ${andamento === 1 ? 'tarefa em andamento' : 'tarefas em andamento'}`
      : erros ? `${erros} com problema · ${todas.length - erros} ${todas.length - erros === 1 ? 'concluída' : 'concluídas'}`
      : `${todas.length} ${todas.length === 1 ? 'concluída' : 'concluídas'}`;
    painel.classList.toggle('com-andamento', andamento > 0);
    document.body.classList.toggle('com-tarefas', !painel.hidden);
    // tudo terminado: recolhe sozinho para liberar a tela (o cabeçalho continua com o resumo)
    clearTimeout(minimizarTimer);
    if (todas.length && !andamento) minimizarTimer = setTimeout(() => minimizar(true), 5000);
  }

  function criar(nome, detalhe = '') {
    if (!painel) montar();
    const id = ++seq;
    const li = document.createElement('li');
    li.innerHTML = '<span class="t-nome"></span><span class="t-detalhe"></span><span class="t-icone" aria-hidden="true"></span>';
    li.querySelector('.t-nome').textContent = nome;
    li.title = nome;
    lista.prepend(li);
    const t = {
      li, estado: 'andamento',
      detalhe(texto) { li.querySelector('.t-detalhe').textContent = texto; return t; },
      progresso(p) {
        const icone = li.querySelector('.t-icone');
        icone.classList.toggle('girando', p == null);
        if (p != null) icone.style.setProperty('--p', Math.max(0, Math.min(1, p)));
        return t;
      },
      concluir(texto = 'Concluído') { t.estado = 'ok'; li.classList.remove('erro'); li.classList.add('ok'); t.detalhe(texto); atualizar(); return t; },
      falhar(texto = 'Não foi possível concluir') { t.estado = 'erro'; li.classList.remove('ok'); li.classList.add('erro'); t.detalhe(texto); li.title = texto; atualizar(); return t; },
      aoClicar(fn) { li.classList.add('clicavel'); li.tabIndex = 0; li.onclick = fn; li.onkeydown = (e) => e.key === 'Enter' && fn(); return t; },
    };
    t.detalhe(detalhe).progresso(null);
    tarefas.set(id, t);
    minimizar(false);
    atualizar();
    return t;
  }

  // fetch não informa o progresso do upload; XMLHttpRequest sim
  function enviar(url, corpo, { headers = {}, onProgresso } = {}) {
    return new Promise((ok, erro) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
      x.upload.onprogress = (e) => e.lengthComputable && onProgresso?.(e.loaded / e.total);
      x.onload = () => {
        let dados = {};
        try { dados = JSON.parse(x.responseText); } catch {}
        if (x.status >= 200 && x.status < 300) ok(dados);
        else erro(new Error(dados.error || 'Não foi possível concluir o envio.'));
      };
      x.onerror = () => erro(new Error('A conexão caiu durante o envio.'));
      x.send(corpo);
    });
  }

  return { criar, enviar };
})();
