'use strict';
// Cronômetro de atividades (estilo Clockify): antes de usar uma ferramenta, a pessoa informa cliente, tarefa e etiquetas.
// Só no servidor com login; o Colaborador EAP não registra (info.registraTempo = false). O tempo corre no servidor.

const TOOL_VIEWS = new Set(['studio', 'ofertas', 'vector', 'eap']);
const LONG_RUN_S = 4 * 3600;  // depois de 4 h seguidas, pergunta se a pessoa ainda está na mesma atividade
let atividade = null, atividadeTags = [], atividadeSync = 0, atividadeTick = null, atividadeAvisada = null;

function atvEl(tag, props = {}, ...children) {
 const e = document.createElement(tag);
 for (const [key, value] of Object.entries(props)) {
  if (key.startsWith('aria')) e.setAttribute(key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value);
  else if (key === 'style') e.style.cssText = value;
  else e[key] = value;
 }
 e.append(...children.filter(c => c != null && c !== false)); return e;
}
function atvTag(id) { return atividadeTags.find(t => t.id === id); }
function atvChip(id, extra = '') { const t = atvTag(id); return t ? atvEl('span', {className: 'atv-tag' + extra, style: `--tag:${t.color}`, textContent: t.name}) : null; }
function atvDuration(s) { s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':'); }
function atvMinutes(s) { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; }
function atvElapsed() {
 if (!atividade) return 0;
 const running = atividade.status === 'andamento' && atividade.periodoDesde && !atividade.corrigido;
 return atividade.segundos + (running ? (Date.now() - atividadeSync) / 1000 : 0);
}
async function atvLoad() {
 const data = await request('/api/atividades/atual');
 atividadeTags = data.etiquetas || atividadeTags; atvSet(data.atividade);
}
function atvSet(value) { atividade = value?.status === 'finalizada' ? null : value; atividadeSync = Date.now(); atvRender(); }

// ---------- cronômetro no topo ----------
const atvTimer = atvEl('div', {id: 'atividade-timer', className: 'atv-timer', hidden: true, role: 'status', ariaLive: 'off'});
document.querySelector('main>header').append(atvTimer);
function atvRender() {
 clearInterval(atividadeTick);
 atvTimer.hidden = !info.registraTempo;
 if (!info.registraTempo) return;
 if (!atividade) {
  atvTimer.className = 'atv-timer is-idle';
  atvTimer.replaceChildren(atvEl('span', {className: 'atv-dot'}), atvEl('span', {className: 'atv-idle', textContent: 'Nenhuma atividade'}),
   atvEl('button', {type: 'button', className: 'atv-btn atv-primary', textContent: 'Iniciar', onclick: () => atvAsk().catch(e => toast(e.message))}),
   atvEl('button', {type: 'button', className: 'atv-btn', textContent: 'Minhas atividades', onclick: atvMine}));
  return;
 }
 const paused = atividade.status === 'pausada', clock = atvEl('strong', {className: 'atv-clock', textContent: atvDuration(atvElapsed())});
 atvTimer.className = 'atv-timer' + (paused ? ' is-paused' : '');
 atvTimer.replaceChildren(atvEl('span', {className: 'atv-dot', title: paused ? 'Pausada' : 'Em andamento'}), clock,
  atvEl('span', {className: 'atv-what', title: `${atividade.cliente} — ${atividade.tarefa}`}, atvEl('b', {textContent: atividade.cliente}), ` — ${atividade.tarefa}`),
  atvEl('span', {className: 'atv-tags'}, ...atividade.etiquetas.map(id => atvChip(id, ' is-dot'))),
  atvEl('button', {type: 'button', className: 'atv-btn', textContent: paused ? 'Retomar' : 'Pausar', onclick: () => atvAct(paused ? 'retomar' : 'pausar')}),
  atvEl('button', {type: 'button', className: 'atv-btn atv-primary', textContent: 'Finalizar', onclick: () => atvAct('finalizar')}),
  atvEl('button', {type: 'button', className: 'atv-btn atv-icon', ariaLabel: 'Minhas atividades', title: 'Minhas atividades', onclick: atvMine}, atvIcon('list')));
 if (!paused) atividadeTick = setInterval(() => {
  const s = atvElapsed(); clock.textContent = atvDuration(s);
  if (s > LONG_RUN_S && atividadeAvisada !== atividade.id) { atividadeAvisada = atividade.id; atvLongRun(); }
 }, 1000);
}
function atvIcon(name) { const s = atvEl('span', {className: 'atv-ico'}); s.innerHTML = icon(name); return s; }
async function atvAct(action) {
 try { atvSet((await request(`/api/atividades/${action}`, {})).atividade); if (action === 'finalizar') toast('Atividade finalizada. Ela já conta no relatório do mês.'); }
 catch (e) { toast(e.message); await atvLoad().catch(() => {}); }
}

// ---------- caixa "Nova atividade" (obrigatória antes das ferramentas) ----------
const atvDialog = atvEl('dialog', {id: 'atividade-dialog', className: 'atv-dialog', ariaLabelledby: 'atividade-title'});
document.body.append(atvDialog);
function atvAsk() {
 return new Promise(async resolve => {
  if (atividade?.status === 'pausada') { await atvAct('retomar'); resolve(true); return; }
  const sug = await request('/api/atividades/sugestoes').catch(() => ({clientes: [], tarefas: []}));
  const clientes = atvEl('datalist', {id: 'atv-clientes'}, ...sug.clientes.map(c => atvEl('option', {value: c})));
  const tarefas = atvEl('datalist', {id: 'atv-tarefas'});
  const cliente = atvEl('input', {id: 'atv-cliente', required: true, maxLength: 120, autocomplete: 'off', placeholder: 'Ex.: Vantagem Supermercado'});
  cliente.setAttribute('list', 'atv-clientes');
  const tarefa = atvEl('input', {id: 'atv-tarefa', required: true, maxLength: 200, autocomplete: 'off', placeholder: 'Ex.: Ofertas 11 a 14/10'});
  tarefa.setAttribute('list', 'atv-tarefas');
  // as tarefas sugeridas são as do cliente digitado
  cliente.oninput = () => tarefas.replaceChildren(...sug.tarefas.filter(t => t.cliente.toLowerCase() === cliente.value.trim().toLowerCase()).map(t => atvEl('option', {value: t.tarefa})));
  const chosen = new Set();
  const chips = atvEl('div', {className: 'atv-chips', role: 'group', ariaLabel: 'Etiquetas'}, ...atividadeTags.map(t => {
   const b = atvEl('button', {type: 'button', className: 'atv-tag atv-choose', style: `--tag:${t.color}`, textContent: t.name, ariaPressed: 'false'});
   b.onclick = () => { chosen.has(t.id) ? chosen.delete(t.id) : chosen.add(t.id); b.setAttribute('aria-pressed', String(chosen.has(t.id))); };
   return b;
  }));
  const error = atvEl('p', {className: 'atv-error', role: 'alert', hidden: true});
  const close = ok => { atvDialog.close(); resolve(ok); };
  const form = atvEl('form', {method: 'dialog', noValidate: true},
   atvEl('div', {className: 'dialog-head'}, atvEl('div', {}, atvEl('h2', {id: 'atividade-title', textContent: 'Nova atividade'}),
    atvEl('p', {textContent: 'Antes de começar, conte para quem é o trabalho. O cronômetro inicia ao confirmar.'})),
    atvEl('button', {type: 'button', className: 'close', ariaLabel: 'Fechar', onclick: () => close(false)}, atvIcon('x'))),
   atvEl('label', {className: 'atv-field'}, 'Cliente', cliente), clientes,
   atvEl('label', {className: 'atv-field'}, 'Nome da tarefa', tarefa), tarefas,
   atvEl('div', {className: 'atv-field'}, atvEl('span', {textContent: 'Etiquetas'}), chips), error,
   atvEl('div', {className: 'dialog-footer'},
    atvEl('button', {type: 'button', className: 'secondary', textContent: 'Cancelar', onclick: () => close(false)}),
    atvEl('button', {type: 'submit', className: 'primary', textContent: 'Iniciar cronômetro'})));
  form.onsubmit = async e => {
   e.preventDefault(); error.hidden = true;
   const body = {cliente: cliente.value, tarefa: tarefa.value, etiquetas: [...chosen]};
   try {
    if (!body.cliente.trim() || !body.tarefa.trim() || !body.etiquetas.length) throw new Error('Preencha cliente, nome da tarefa e ao menos uma etiqueta.');
    const {repeticao} = await request('/api/atividades/verificar', body);
    if (repeticao) body.alteracaoDe = await atvRepeat(repeticao) ? repeticao.id : null;
    atvSet((await request('/api/atividades/iniciar', body)).atividade); close(true);
   } catch (err) { error.textContent = err.message; error.hidden = false; }
  };
  atvDialog.replaceChildren(form); atvDialog.oncancel = e => { e.preventDefault(); close(false); };
  atvDialog.showModal(); cliente.focus();
 });
}
// Mesmo cliente e mesma tarefa há menos de um dia: quase sempre o cliente reenviou com correção.
function atvRepeat(r) {
 return new Promise(resolve => {
  const when = new Date(r.inicio).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
  const box = atvEl('dialog', {className: 'atv-dialog atv-confirm', ariaLabelledby: 'atv-repeat-title'});
  const done = v => { box.close(); box.remove(); resolve(v); };
  box.append(atvEl('h2', {id: 'atv-repeat-title', textContent: 'É uma alteração?'}),
   atvEl('p', {}, 'A tarefa ', atvEl('b', {textContent: `${r.cliente} — ${r.tarefa}`}), ` foi iniciada em ${when}${r.pessoa ? ` por ${r.pessoa}` : ''}. Se o cliente reenviou com correções, ela conta como alteração no relatório.`),
   atvEl('div', {className: 'dialog-footer'},
    atvEl('button', {type: 'button', className: 'secondary', textContent: 'Não, é uma tarefa nova', onclick: () => done(false)}),
    atvEl('button', {type: 'button', className: 'primary', textContent: 'Sim, é uma alteração', onclick: () => done(true)})));
  box.oncancel = e => { e.preventDefault(); done(false); };
  document.body.append(box); box.showModal();
 });
}
function atvConfirm(title, text, yes, no) {
 return new Promise(resolve => {
  const box = atvEl('dialog', {className: 'atv-dialog atv-confirm', ariaLabelledby: 'atv-confirm-title'});
  const done = v => { box.close(); box.remove(); resolve(v); };
  box.append(atvEl('h2', {id: 'atv-confirm-title', textContent: title}), atvEl('p', {textContent: text}),
   atvEl('div', {className: 'dialog-footer'}, atvEl('button', {type: 'button', className: 'secondary', textContent: no, onclick: () => done(false)}),
    atvEl('button', {type: 'button', className: 'primary', textContent: yes, onclick: () => done(true)})));
  box.oncancel = e => { e.preventDefault(); done(false); };
  document.body.append(box); box.showModal();
 });
}
async function atvLongRun() {
 if (await atvConfirm('Ainda na mesma atividade?', `${atividade.cliente} — ${atividade.tarefa} está com o cronômetro ligado há mais de 4 horas.`, 'Continuar', 'Pausar agora') === false) atvAct('pausar');
}

// Abrir uma ferramenta sem atividade em andamento pede a caixa; cancelar mantém a tela atual.
const atvShowView = showView;
showView = async function (view) {
 if (info.registraTempo && TOOL_VIEWS.has(view) && atividade?.status !== 'andamento') {
  let ok = false;
  try { ok = await atvAsk(); } catch (e) { toast(e.message); }
  if (!ok) { if (document.querySelector('.view:not([hidden])')?.id === 'studio' && view === 'studio') await atvShowView('home'); return; }
 }
 return atvShowView(view);
};
// Ao terminar uma exportação, pergunta se a atividade acabou.
const atvRequest = request;
request = async function (path, body, method) {
 const data = await atvRequest(path, body, method);
 const exported = ['/api/export', '/api/vector/export', '/api/eap/export'].includes(path) && !(data?.results && !data.results.some(r => r.ok)) && !data?.cancelled;
 if (exported && info.registraTempo && atividade?.status === 'andamento')
  setTimeout(async () => { if (await atvConfirm('Atividade concluída?', `O arquivo foi exportado. A atividade ${atividade.cliente} — ${atividade.tarefa} terminou?`, 'Finalizar atividade', 'Continuar trabalhando')) atvAct('finalizar'); }, 600);
 return data;
};

// ---------- Minhas atividades: o próprio colaborador corrige o tempo no mês corrente ----------
async function atvMine() {
 const data = await request('/api/atividades/minhas').catch(e => { toast(e.message); return null; });
 if (!data) return;
 const box = atvEl('dialog', {className: 'atv-dialog atv-mine', ariaLabelledby: 'atv-mine-title'});
 const rows = data.atividades.map(a => {
  const minutes = atvEl('input', {type: 'number', min: 0, max: 1440, step: 1, value: Math.round(a.segundos / 60), ariaLabel: 'Minutos'});
  const reason = atvEl('input', {maxLength: 200, placeholder: 'Motivo da correção', ariaLabel: 'Motivo da correção'});
  const edit = atvEl('form', {className: 'atv-fix', hidden: true}, minutes, atvEl('span', {textContent: 'min'}), reason,
   atvEl('button', {type: 'submit', className: 'atv-btn atv-primary', textContent: 'Salvar'}));
  edit.onsubmit = async e => {
   e.preventDefault();
   try { await request('/api/atividades/corrigir', {id: a.id, minutos: Number(minutes.value), motivo: reason.value}); box.close(); box.remove(); atvMine(); }
   catch (err) { toast(err.message); }
  };
  return atvEl('li', {},
   atvEl('div', {className: 'atv-mine-row'},
    atvEl('div', {}, atvEl('strong', {textContent: `${a.cliente} — ${a.tarefa}`}),
     atvEl('small', {textContent: new Date(a.inicio).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) + (a.alteracaoDe ? ' · alteração' : '') + (a.corrigido ? ' · tempo corrigido' : '')}),
     atvEl('span', {className: 'atv-tags'}, ...a.etiquetas.map(id => atvChip(id)))),
    atvEl('span', {className: 'atv-mine-time', textContent: a.status === 'finalizada' ? atvMinutes(a.segundos) : 'em andamento'}),
    a.status === 'finalizada' && atvEl('button', {type: 'button', className: 'atv-btn', textContent: 'Corrigir', onclick: () => { edit.hidden = !edit.hidden; minutes.focus(); }})),
   edit);
 });
 box.append(atvEl('div', {className: 'dialog-head'}, atvEl('div', {}, atvEl('h2', {id: 'atv-mine-title', textContent: 'Minhas atividades'}),
   atvEl('p', {textContent: 'Este mês. Esqueceu o cronômetro ligado? Corrija o tempo e conte o motivo; a correção fica registrada.'})),
  atvEl('button', {type: 'button', className: 'close', ariaLabel: 'Fechar', onclick: () => { box.close(); box.remove(); }}, atvIcon('x'))),
  rows.length ? atvEl('ul', {className: 'atv-mine-list'}, ...rows) : atvEl('p', {className: 'atv-empty', textContent: 'Nenhuma atividade neste mês.'}));
 box.oncancel = () => box.remove();
 document.body.append(box); box.showModal();
}

// O cronômetro aparece assim que /api/info diz que esta pessoa registra tempo.
(function waitInfo() { if (typeof info === 'object' && 'registraTempo' in info) { if (info.registraTempo) atvLoad().catch(e => toast(e.message)); else atvRender(); } else setTimeout(waitInfo, 200); })();
