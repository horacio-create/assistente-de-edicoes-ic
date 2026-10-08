// Bolinha do usuário na barra lateral, o menu dela (Minha conta · Sair) e a tela Minha conta. Só com login no servidor.
// Usa adminEl/adminInitials de admin.js (carregado antes).

function contaRender(user) {
  $('user-initial').textContent = adminInitials(user.name).slice(0, 1);
  $('user-name').textContent = user.name;
  $('user-chip').title = `${user.name} · ${user.email}`;
  $('user-menu-name').textContent = user.name;
  $('user-menu-email').textContent = user.email;
}

function setupUserMenu(user) {
  const chip = $('user-chip'), menu = $('user-menu');
  chip.hidden = false;
  contaRender(user);
  $('user-menu-role').textContent = user.superadmin ? 'Superadmin' : 'Conta da equipe';
  const close = (focus) => { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); if (focus) chip.focus(); };
  const open = () => {
    menu.hidden = false; chip.setAttribute('aria-expanded', 'true');
    menu.classList.remove('ac-reveal'); void menu.offsetWidth; menu.classList.add('ac-reveal');
    $('user-menu-conta').focus();
  };
  chip.onclick = e => { e.stopPropagation(); menu.hidden ? open() : close(); };
  menu.onclick = e => e.stopPropagation();
  document.addEventListener('click', () => { if (!menu.hidden) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) close(true); });
  $('user-menu-conta').onclick = () => { close(); if (!busy) switchEditor(editorKind, 'conta').catch(e => toast(e.message)); };
  $('logout').onclick = () => baseRequest('/api/auth/logout', {}).finally(() => location.replace('/login.html'));
}

// Botão que mostra "Salvo" por 2 s depois de dar certo (sucesso silencioso, sem toast)
function contaSaved(button, label) {
  button.textContent = 'Salvo'; button.classList.add('is-done');
  setTimeout(() => { button.textContent = label; button.classList.remove('is-done'); }, 2000);
}

function contaForm(onsubmit, ...fields) {
  const error = adminEl('p', {className: 'ac-alert', role: 'alert', hidden: true});
  const form = adminEl('form', {className: 'ac-form', noValidate: true}, ...fields, error);
  form.onsubmit = async e => {
    e.preventDefault();
    error.hidden = true;
    const button = form.querySelector('button[type=submit]'), label = button.textContent;
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    try { await onsubmit(); button.removeAttribute('aria-busy'); button.disabled = false; contaSaved(button, label); }
    catch (err) { button.removeAttribute('aria-busy'); button.disabled = false; error.textContent = err.message; error.hidden = false; }
  };
  return form;
}

function contaField(label, input, hint) {
  input.id ||= 'conta-' + Math.random().toString(36).slice(2, 8);
  return adminEl('div', {className: 'ac-field'}, adminEl('label', {htmlFor: input.id, textContent: label}), input,
    hint && adminEl('p', {className: 'ac-hint', textContent: hint}));
}

async function loadConta() {
  const me = await request('/api/auth/me');
  const tools = info.modules.filter(m => ADMIN_TOOLS[m.id]).map(m => ADMIN_TOOLS[m.id]);
  const since = me.created ? new Date(me.created).toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'}) : null;

  // ---------- perfil ----------
  const profile = adminEl('section', {className: 'ac-box ac-profile'},
    adminEl('div', {className: 'ac-profile-top'},
      adminEl('span', {className: 'ac-avatar is-lg', ariaHidden: 'true', textContent: adminInitials(me.name)}),
      adminEl('div', {className: 'ac-who-text'}, adminEl('strong', {id: 'conta-nome-atual', textContent: me.name}), adminEl('small', {textContent: me.email}))),
    adminEl('dl', {className: 'ac-facts'},
      adminEl('div', {}, adminEl('dt', {textContent: 'Cargo'}), adminEl('dd', {}, me.superadmin
        ? adminEl('span', {className: 'ac-tag is-accent', textContent: 'Superadmin'}) : adminEl('span', {textContent: me.roleName || 'Sem cargo'}))),
      since && adminEl('div', {}, adminEl('dt', {textContent: 'Na equipe desde'}), adminEl('dd', {textContent: since})),
      adminEl('div', {}, adminEl('dt', {textContent: 'Ferramentas liberadas'}), adminEl('dd', {}, adminEl('div', {className: 'ac-chips'},
        ...(tools.length ? tools.map(t => adminEl('span', {className: 'ac-tag', textContent: t})) : [adminEl('span', {className: 'ac-tag is-off', textContent: 'Nenhuma'})])))),
      adminEl('p', {className: 'ac-hint', textContent: me.superadmin ? 'Cargos e acessos são definidos na tela Usuários.' : 'Para mudar o cargo ou as ferramentas, fale com um administrador.'})));

  // ---------- nome ----------
  const name = adminEl('input', {className: 'ac-input', value: me.name, maxLength: 90, autocomplete: 'name'});
  const nameForm = contaForm(async () => {
    const user = await request('/api/auth/perfil', {name: name.value});
    info.user = {...info.user, ...user};
    contaRender(user);
    $('conta-nome-atual').textContent = user.name;
    name.value = user.name;
  }, contaField('Nome', name, 'Aparece na barra lateral e para quem administra a equipe.'),
    adminEl('button', {className: 'ac-btn ac-btn-quiet', type: 'submit', textContent: 'Salvar nome'}));

  // ---------- senha ----------
  const atual = adminEl('input', {className: 'ac-input', type: 'password', autocomplete: 'current-password'});
  const nova = adminEl('input', {className: 'ac-input', type: 'password', autocomplete: 'new-password'});
  const repetir = adminEl('input', {className: 'ac-input', type: 'password', autocomplete: 'new-password'});
  const passForm = contaForm(async () => {
    if (!atual.value) throw new Error('Digite a senha atual.');
    if (nova.value.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
    if (nova.value !== repetir.value) throw new Error('As duas senhas novas estão diferentes.');
    await request('/api/auth/senha', {atual: atual.value, nova: nova.value});
    atual.value = nova.value = repetir.value = '';
    await loadConta();
  }, adminEl('input', {type: 'email', value: me.email, autocomplete: 'username', hidden: true, readOnly: true}),
    contaField('Senha atual', atual), contaField('Nova senha', nova, 'Pelo menos 8 caracteres.'), contaField('Repita a nova senha', repetir),
    adminEl('button', {className: 'ac-btn ac-btn-quiet', type: 'submit', textContent: 'Trocar senha'}));

  // ---------- aparelhos ----------
  const others = me.sessions - 1;
  const signOut = adminEl('button', {className: 'ac-btn ac-btn-quiet', type: 'button', textContent: 'Sair dos outros aparelhos', disabled: others < 1,
    onclick: () => guard(async () => { await request('/api/auth/sair-outros', {}); await loadConta(); })});

  const box = (title, text, ...body) => adminEl('section', {className: 'ac-box'},
    adminEl('header', {className: 'ac-box-head'}, adminEl('div', {}, adminEl('h2', {textContent: title}), text && adminEl('p', {textContent: text}))),
    adminEl('div', {className: 'ac-side-body'}, ...body));

  $('conta').replaceChildren(adminEl('div', {className: 'ac-account'}, profile,
    adminEl('div', {className: 'ac-account-forms'},
      box('Perfil', null, nameForm),
      box('Senha', 'Ao trocar, os outros aparelhos conectados saem da conta.', passForm),
      box('Aparelhos conectados', others > 0 ? `Sua conta está aberta neste e em mais ${others} ${others === 1 ? 'aparelho' : 'aparelhos'}.` : 'Sua conta está aberta só neste aparelho.', signOut))));
}
