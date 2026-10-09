// Tela Usuários (só superadmin, com login no servidor): lista de pessoas + painel com convite, convites pendentes e cargos.
const ADMIN_TOOLS = {images: 'Imagens', video: 'Vídeos', offers: 'Ofertas', eap: 'Logo EAP', ms6: 'Vetorização M6S'};
const ADMIN_BRANDS = {indoor: {name: 'Indoor Channel', icon: '/favicon.svg?v=13'}, eap: {name: 'EAP', icon: '/eap-icon.svg'}};
let adminEditing = null;  // id do cargo aberto para edição ('novo' = criando)
const adminLinks = {};    // links gerados (convite e nova senha) continuam à vista quando a tela re-renderiza

function adminEl(tag, props = {}, ...children) { const e = Object.assign(document.createElement(tag), props); e.append(...children.filter(c => c != null && c !== false)); return e; }
function adminAct(path, body) { return guard(async () => { await request(path, body); await loadAdmin(); }); }
function adminInitials(name) { return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
function adminSwitch(label, checked, onchange, disabled) {
  return adminEl('label', {className: 'ac-switch'}, adminEl('input', {type: 'checkbox', role: 'switch', checked, onchange, disabled}), label);
}
// Botão que vira "Copiado" por 2 s (sucesso silencioso, sem toast)
function adminCopy(url, input) {
  const b = adminEl('button', {className: 'ac-btn ac-btn-quiet', type: 'button', textContent: 'Copiar'});
  b.onclick = () => {
    input.select();
    const done = () => { b.textContent = 'Copiado'; b.classList.add('is-done'); setTimeout(() => { b.textContent = 'Copiar'; b.classList.remove('is-done'); }, 2000); };
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(done, () => { document.execCommand('copy'); done(); });
  };
  return b;
}
function adminLinkBox(box, url, text, key) {
  if (key) adminLinks[key] = {url, text};
  const input = adminEl('input', {className: 'ac-input', value: url, readOnly: true, ariaLabel: 'Link para enviar'});
  box.replaceChildren(adminEl('p', {textContent: text}), adminEl('div', {}, input, adminCopy(url, input)));
  box.hidden = false;
  box.classList.add('ac-reveal');
  input.select();
}

async function loadAdmin() {
  const data = await request('/api/admin/dados');
  const tools = info.modules.map(m => m.id).filter(id => ADMIN_TOOLS[id]);
  const roleName = id => data.roles.find(r => r.id === id)?.name;
  const roleSelect = (value, onchange, label) => {
    const s = adminEl('select', {className: 'ac-select', onchange, ariaLabel: label},
      adminEl('option', {value: '', textContent: 'Sem cargo'}), ...data.roles.map(r => adminEl('option', {value: r.id, textContent: r.name})));
    s.value = value || ''; return s;
  };

  // ---------- lista de pessoas ----------
  const people = data.users.map(u => {
    const me = u.id === info.user.id;
    const linkBox = adminEl('div', {className: 'ac-linkbox', hidden: true, ariaLive: 'polite'});
    const reset = adminEl('button', {className: 'ac-btn ac-btn-text', type: 'button', textContent: 'Nova senha', disabled: !u.active,
      title: u.active ? 'Gerar link para definir uma nova senha' : 'Reative a conta antes', onclick: () => guard(async () => {
        const result = await request('/api/admin/redefinir-senha', {id: u.id});
        adminLinkBox(linkBox, result.link, `Envie este link para ${u.name}. Vale 7 dias e uma vez; a senha antiga deixa de funcionar quando ele for usado.`, u.id);
      })});
    if (adminLinks[u.id]) adminLinkBox(linkBox, adminLinks[u.id].url, adminLinks[u.id].text);
    const role = u.superadmin
      ? adminEl('span', {className: 'ac-tag is-accent', textContent: 'Todas as ferramentas'})
      : roleSelect(u.role, e => adminAct('/api/admin/usuario-salvar', {id: u.id, role: e.target.value || null}), `Cargo de ${u.name}`);
    role.classList.add('ac-person-role');
    return adminEl('li', {className: 'ac-person' + (u.active ? '' : ' is-off')},
      adminEl('div', {className: 'ac-person-row'},
        adminEl('div', {className: 'ac-who'}, adminEl('span', {className: 'ac-avatar', ariaHidden: 'true', textContent: adminInitials(u.name)}),
          adminEl('div', {className: 'ac-who-text'},
            adminEl('strong', {}, adminEl('span', {textContent: u.name}), me && adminEl('span', {className: 'ac-tag', textContent: 'você'}), !u.active && adminEl('span', {className: 'ac-tag is-off', textContent: 'desativado'})),
            adminEl('small', {textContent: u.email}))),
        role,
        adminSwitch('Superadmin', !!u.superadmin, e => adminAct('/api/admin/usuario-salvar', {id: u.id, superadmin: e.target.checked})),
        adminSwitch('Ativo', !!u.active, e => adminAct('/api/admin/usuario-salvar', {id: u.id, active: e.target.checked}), me),
        reset),
      linkBox);
  });
  const list = adminEl('section', {className: 'ac-box'},
    adminEl('header', {className: 'ac-box-head'}, adminEl('div', {},
      adminEl('h2', {id: 'ac-people-title'}, 'Pessoas', adminEl('small', {textContent: String(data.users.length)})),
      adminEl('p', {textContent: 'Desativar tira o acesso na hora. O que a pessoa criou continua guardado.'}))),
    adminEl('ul', {className: 'ac-people'}, ...people));

  // ---------- convidar ----------
  const email = adminEl('input', {className: 'ac-input', id: 'ac-invite-email', type: 'email', inputMode: 'email', placeholder: 'nome@indoorchannel.com.br', autocomplete: 'off'});
  const inviteRole = roleSelect('', null, 'Cargo do convidado'); inviteRole.id = 'ac-invite-role';
  const inviteSuper = adminEl('input', {type: 'checkbox', role: 'switch'});
  inviteSuper.onchange = () => { inviteRole.disabled = inviteSuper.checked; };
  const inviteLink = adminEl('div', {className: 'ac-linkbox', hidden: true, ariaLive: 'polite'});
  inviteLink.style.margin = '0';
  const inviteBtn = adminEl('button', {className: 'ac-btn ac-btn-primary', type: 'submit', textContent: 'Gerar link de convite'});
  const inviteForm = adminEl('form', {className: 'ac-invite-form', noValidate: true, onsubmit: e => { e.preventDefault(); guard(async () => {
    inviteBtn.setAttribute('aria-busy', 'true');
    try {
      const result = await request('/api/admin/convite', {email: email.value, role: inviteRole.value, superadmin: inviteSuper.checked});
      const who = email.value.trim();
      email.value = '';
      data.invites = (await request('/api/admin/dados')).invites; renderPending();
      adminLinkBox(inviteLink, result.link, `Envie para ${who}. Vale 7 dias e uma vez.`, 'convite');
    } finally { inviteBtn.removeAttribute('aria-busy'); }
  }); }},
    adminEl('div', {className: 'ac-field'}, adminEl('label', {htmlFor: 'ac-invite-email', textContent: 'E-mail'}), email),
    adminEl('div', {className: 'ac-field'}, adminEl('label', {htmlFor: 'ac-invite-role', textContent: 'Cargo'}), inviteRole),
    adminEl('label', {className: 'ac-switch is-wrap'}, inviteSuper, 'Superadmin (acesso a tudo e a esta tela)'),
    inviteBtn, inviteLink);
  if (adminLinks.convite) adminLinkBox(inviteLink, adminLinks.convite.url, adminLinks.convite.text);

  const pending = adminEl('ul', {className: 'ac-list'});
  function renderPending() {
    pending.replaceChildren(...data.invites.map(i => adminEl('li', {},
      adminEl('div', {className: 'ac-list-main'}, adminEl('strong', {textContent: i.email}),
        adminEl('small', {textContent: `${i.superadmin ? 'Superadmin' : roleName(i.role) || 'Sem cargo'} · vale até ${new Date(i.expires).toLocaleDateString('pt-BR')}`})),
      adminEl('button', {className: 'ac-btn ac-btn-danger', type: 'button', textContent: 'Cancelar', ariaLabel: `Cancelar convite de ${i.email}`,
        onclick: () => adminAct('/api/admin/convite-revogar', {email: i.email})}))));
    if (!data.invites.length) pending.replaceChildren(adminEl('li', {}, adminEl('p', {className: 'ac-empty', textContent: 'Nenhum convite esperando resposta.'})));
  }
  renderPending();

  // ---------- cargos ----------
  const roleEditor = role => {
    const name = adminEl('input', {className: 'ac-input', value: role?.name || '', placeholder: 'Ex.: Equipe de Ofertas', maxLength: 60, ariaLabel: 'Nome do cargo'});
    const chips = tools.map(id => adminEl('label', {className: 'ac-chip'}, adminEl('input', {type: 'checkbox', value: id, checked: !!role?.modules.includes(id)}), ADMIN_TOOLS[id]));
    // marca: troca a logo do menu, o ícone e o nome da aba de quem tem este cargo
    const brands = Object.entries(ADMIN_BRANDS).map(([id, b]) => adminEl('label', {className: 'ac-chip ac-brand'},
      adminEl('input', {type: 'radio', name: 'ac-brand', value: id, checked: (role?.brand || 'indoor') === id}), adminEl('img', {src: b.icon, alt: ''}), b.name));
    const close = () => { adminEditing = null; loadAdmin().catch(e => toast(e.message)); };
    setTimeout(() => name.focus());
    return adminEl('form', {className: 'ac-role-edit ac-reveal', noValidate: true, onsubmit: e => { e.preventDefault(); adminEditing = null;
      adminAct('/api/admin/cargo-salvar', {id: role?.id, name: name.value, modules: chips.map(c => c.firstChild).filter(c => c.checked).map(c => c.value),
        brand: brands.map(b => b.firstChild).find(b => b.checked)?.value || 'indoor'}); }},
      adminEl('div', {className: 'ac-field'}, adminEl('span', {className: 'ac-label', textContent: 'Nome'}), name),
      adminEl('div', {className: 'ac-field'}, adminEl('span', {className: 'ac-label', textContent: 'Marca'}), adminEl('div', {className: 'ac-chips'}, ...brands)),
      adminEl('div', {className: 'ac-field'}, adminEl('span', {className: 'ac-label', textContent: 'Ferramentas liberadas'}), adminEl('div', {className: 'ac-chips'}, ...chips)),
      adminEl('div', {className: 'ac-role-actions'},
        adminEl('button', {className: 'ac-btn ac-btn-quiet', type: 'button', textContent: 'Cancelar', onclick: close}),
        adminEl('button', {className: 'ac-btn ac-btn-primary', type: 'submit', textContent: role ? 'Salvar' : 'Criar cargo'})),
      role && adminEl('button', {className: 'ac-btn ac-btn-danger', type: 'button', textContent: 'Excluir cargo', onclick: () => { adminEditing = null; adminAct('/api/admin/cargo-excluir', {id: role.id}); }}));
  };
  const roles = data.roles.map(r => adminEditing === r.id ? roleEditor(r) : adminEl('div', {className: 'ac-role'},
    adminEl('div', {className: 'ac-role-head'}, adminEl('strong', {textContent: r.name}, r.brand === 'eap' && adminEl('span', {className: 'ac-tag ac-brand-tag', textContent: 'Marca EAP'})),
      adminEl('button', {className: 'ac-btn ac-btn-text', type: 'button', textContent: 'Editar', ariaLabel: `Editar cargo ${r.name}`, onclick: () => { adminEditing = r.id; loadAdmin(); }})),
    adminEl('div', {className: 'ac-chips'}, ...(r.modules.filter(m => ADMIN_TOOLS[m]).length
      ? r.modules.filter(m => ADMIN_TOOLS[m]).map(m => adminEl('span', {className: 'ac-tag', textContent: ADMIN_TOOLS[m]}))
      : [adminEl('span', {className: 'ac-tag is-off', textContent: 'Nenhuma ferramenta'})]))));
  const newRole = adminEditing === 'novo' ? roleEditor(null)
    : adminEl('button', {className: 'ac-btn ac-btn-quiet', type: 'button', textContent: 'Novo cargo', onclick: () => { adminEditing = 'novo'; loadAdmin(); }});

  const side = adminEl('div', {className: 'ac-side'},
    adminEl('section', {className: 'ac-box'},
      adminEl('header', {className: 'ac-box-head'}, adminEl('div', {}, adminEl('h2', {id: 'ac-invite-title', textContent: 'Convidar'}),
        adminEl('p', {textContent: 'A pessoa recebe um link e escolhe nome e senha.'}))),
      adminEl('div', {className: 'ac-side-body'}, inviteForm,
        adminEl('div', {className: 'ac-field'}, adminEl('span', {className: 'ac-label', textContent: 'Esperando resposta'}), pending))),
    adminEl('section', {className: 'ac-box'},
      adminEl('header', {className: 'ac-box-head'}, adminEl('div', {}, adminEl('h2', {id: 'ac-roles-title'}, 'Cargos', adminEl('small', {textContent: String(data.roles.length)})),
        adminEl('p', {textContent: 'Cada cargo libera um conjunto de ferramentas.'}))),
      adminEl('div', {className: 'ac-side-body'}, ...roles, newRole)),
    adminEl('section', {className: 'ac-box'},
      adminEl('header', {className: 'ac-box-head'}, adminEl('div', {}, adminEl('h2', {textContent: 'Conteúdo da Home'}),
        adminEl('p', {textContent: 'Fotos dos colaboradores e tutoriais de cada ferramenta.'}))),
      adminEl('div', {className: 'ac-side-body'}, adminEl('button', {className: 'ac-btn ac-btn-quiet', type: 'button', textContent: 'Gerenciar conteúdo',
        onclick: () => { homeManaging = true; switchEditor(editorKind, 'home').catch(e => toast(e.message)); }}))));

  $('admin').replaceChildren(adminEl('div', {className: 'ac-admin'}, list, side));
}
