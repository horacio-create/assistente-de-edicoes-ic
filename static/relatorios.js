'use strict';
// Tela Relatórios (só superadmin): o mês do Clockify em números, horas por etiqueta, projeto, colaborador e tarefa,
// alterações e todos os registros. Exporta PDF e Excel. O tempo é registrado e corrigido no próprio Clockify.

let relMes = new Date().toISOString().slice(0, 7), relFiltro = '';

function relHoras(s) { const m = Math.round(s / 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; }
function relBars(title, itens, opts = {}) {
 const top = itens.slice(0, opts.limit || 10), max = Math.max(1, ...top.map(x => x.segundos));
 return atvEl('section', {className: 'rel-box'},
  atvEl('h2', {textContent: title}), opts.note && atvEl('p', {className: 'rel-note', textContent: opts.note}),
  top.length ? atvEl('ul', {className: 'rel-bars'}, ...top.map(x => atvEl('li', {},
   atvEl('span', {className: 'rel-bar-name', textContent: x.nome, title: x.nome}),
   atvEl('span', {className: 'rel-bar-track'}, atvEl('span', {className: 'rel-bar', style: `width:${Math.max(1, 100 * x.segundos / max)}%;--bar:${x.cor || opts.color || 'var(--ink)'}`})),
   atvEl('span', {className: 'rel-bar-value', textContent: relHoras(x.segundos) + (x.alteracoes ? ` · ${x.alteracoes} alt.` : '')}))))
   : atvEl('p', {className: 'rel-note', textContent: 'Sem registros no mês.'}));
}
function relTag(nome, cores) { return atvEl('span', {className: 'atv-tag', style: `--tag:${cores[nome] || '#4f5f73'}`, textContent: nome}); }

async function loadRelatorios(atualizar = false) {
 const month = atvEl('input', {type: 'month', value: relMes, ariaLabel: 'Mês do relatório', max: new Date().toISOString().slice(0, 7)});
 month.onchange = () => { if (month.value) { relMes = month.value; loadRelatorios().catch(e => toast(e.message)); } };
 const refresh = atvEl('button', {type: 'button', className: 'atv-btn', onclick: () => loadRelatorios(true).catch(e => toast(e.message))}, atvIcon('rotate-cw'), 'Atualizar');
 const download = (ext, label) => atvEl('a', {className: 'rel-download', href: `/relatorios/relatorio-${relMes}.${ext}`, download: `relatorio-${relMes}.${ext}`}, atvIcon('arrow-up-right'), label);
 const toolbar = (status, ok) => atvEl('div', {className: 'rel-toolbar'}, atvEl('label', {className: 'rel-month'}, 'Mês', month),
  atvEl('p', {className: 'rel-source', textContent: status}),
  atvEl('div', {className: 'rel-actions'}, refresh, ok && download('pdf', 'Exportar PDF'), ok && download('xlsx', 'Exportar Excel')));
 $('relatorios').replaceChildren(atvEl('div', {className: 'rel-page'}, toolbar('Buscando os registros no Clockify…', false)));
 let data;
 try { data = await request(`/api/relatorios?mes=${relMes}${atualizar ? '&atualizar=1' : ''}`); }
 catch (e) {
  $('relatorios').replaceChildren(atvEl('div', {className: 'rel-page'}, toolbar('Clockify indisponível', false),
   atvEl('section', {className: 'rel-box rel-error'}, atvEl('h2', {textContent: 'Não foi possível carregar o relatório'}), atvEl('p', {textContent: e.message}))));
  return;
 }
 const t = data.totais, cores = Object.fromEntries(data.porEtiqueta.map(x => [x.nome, x.cor]));
 const kpi = (value, label) => atvEl('div', {className: 'rel-kpi'}, atvEl('strong', {textContent: value}), atvEl('span', {textContent: label}));
 const search = atvEl('input', {type: 'search', placeholder: 'Filtrar por tarefa, projeto, etiqueta ou colaborador', value: relFiltro, ariaLabel: 'Filtrar registros'});
 const tbody = atvEl('tbody');
 const renderRows = () => {
  const q = relFiltro.toLowerCase();
  tbody.replaceChildren(...data.registros.filter(r => !q || `${r.tarefa} ${r.projeto} ${r.pessoa} ${r.etiquetas.join(' ')}`.toLowerCase().includes(q)).reverse().map(r => atvEl('tr', {},
   atvEl('td', {textContent: new Date(r.inicio).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}),
   atvEl('td', {textContent: r.pessoa}),
   atvEl('td', {}, atvEl('strong', {textContent: r.tarefa}), atvEl('small', {textContent: r.projeto})),
   atvEl('td', {}, atvEl('span', {className: 'atv-tags'}, ...r.etiquetas.map(n => relTag(n, cores)))),
   atvEl('td', {className: 'rel-num', textContent: r.andamento ? 'em andamento' : relHoras(r.segundos)}),
   atvEl('td', {textContent: r.alteracao ? 'Alteração' : ''}))));
 };
 search.oninput = () => { relFiltro = search.value; renderRows(); };
 renderRows();
 const quando = data.atualizado ? new Date(data.atualizado).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : '';
 $('relatorios').replaceChildren(atvEl('div', {className: 'rel-page'},
  toolbar(`Dados do Clockify${quando ? ' · atualizados às ' + quando : ''}`, true),
  atvEl('div', {className: 'rel-kpis'}, kpi(relHoras(t.segundos), 'horas registradas'), kpi(String(t.tarefas), 'tarefas'),
   kpi(String(t.alteracoes), 'alterações'), kpi(String(t.colaboradores), 'colaboradores'), t.emAndamento ? kpi(String(t.emAndamento), 'cronômetros ligados') : null),
  atvEl('div', {className: 'rel-grid'},
   relBars('Horas por etiqueta', data.porEtiqueta, {note: 'Um registro pode ter várias etiquetas; o tempo dele conta em cada uma.'}),
   relBars('Horas por projeto', data.porProjeto, {color: '#2d3144'}),
   relBars('Horas por colaborador', data.porPessoa, {color: '#4f5f73'}),
   relBars('Tarefas com mais horas', data.porTarefa, {color: '#6a68cb'}),
   atvEl('section', {className: 'rel-box'}, atvEl('h2', {textContent: 'Tarefas com mais alterações'}),
    atvEl('p', {className: 'rel-note', textContent: 'Tarefas com “alteração” na descrição ou numa etiqueta do Clockify.'}),
    data.alteracoesPorTarefa.length ? atvEl('ul', {className: 'rel-list'}, ...data.alteracoesPorTarefa.slice(0, 10).map(x => atvEl('li', {},
     atvEl('span', {textContent: x.nome}), atvEl('strong', {textContent: `${x.alteracoes} alteraç${x.alteracoes === 1 ? 'ão' : 'ões'}`}))))
     : atvEl('p', {className: 'rel-note', textContent: 'Nenhuma alteração registrada no mês.'}))),
  atvEl('section', {className: 'rel-box rel-records'},
   atvEl('div', {className: 'rel-records-head'}, atvEl('h2', {textContent: `Registros (${data.registros.length})`}), search),
   atvEl('div', {className: 'rel-table'}, atvEl('table', {},
    atvEl('thead', {}, atvEl('tr', {}, ...['Início', 'Colaborador', 'Tarefa e projeto', 'Etiquetas', 'Tempo', 'Observação'].map(h => atvEl('th', {scope: 'col', textContent: h})))),
    tbody)))));
}
