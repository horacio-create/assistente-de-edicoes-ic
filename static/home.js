'use strict';
// Tela Home: boas-vindas com fotos dos colaboradores, ferramentas liberadas pelo cargo e tutoriais.
// O servidor já entrega só os tutoriais que o cargo pode ver; superadmins (ou o app local) gerenciam o conteúdo.

const HOME_TOOLS = {
 images: {name: 'Imagens', icon: 'image', kind: 'image', view: 'studio', text: 'Ajuste artes para qualquer formato de tela: enquadramento, fundo, logo e exportação em JPG ou PNG.'},
 video: {name: 'Vídeos', icon: 'video', kind: 'video', view: 'studio', text: 'Monte vídeos com cortes, camadas, áudio, logo e fundo desfocado; exporte em MP4 dentro do tamanho máximo.'},
 offers: {name: 'Ofertas', icon: 'tag', view: 'ofertas', text: 'Gere vídeos de ofertas de supermercado a partir de templates e encartes.'},
 ms6: {name: 'Vetorização M6S', icon: 'spline', view: 'vector', text: 'Transforma a logo do cliente em contornos DXF para gravar o microfone M6S no laser.'},
 eap: {name: 'Logo EAP', icon: 'hexagon', view: 'eap', text: 'Limpa ou vetoriza a logo do cliente e entrega os PNGs em 1024 × 1024 prontos para uso.'}
};
const HOME_BRAND = {
 indoor: {eyebrow: 'Indoor Channel · Assistente de Edições', text: 'Prepare artes, vídeos, ofertas e logos para as telas da Indoor Channel, direto no navegador. Escolha uma ferramenta abaixo ou veja um tutorial antes de começar.'},
 eap: {eyebrow: 'EAP · Assistente de edições', text: 'Prepare as logos dos clientes da EAP e os arquivos de gravação a laser do microfone M6S, direto no navegador. Escolha uma ferramenta abaixo ou veja um tutorial antes de começar.'}
};
const HOME_PHOTO_MS = 6000, HOME_FADE_MS = 1200;  // cada foto fica 6 s no topo; a troca leva 1,2 s
let homeTimer = null;
let homeManaging = false;

function homeEl(tag, props = {}, ...children) {
 const e = document.createElement(tag);
 for (const [key, value] of Object.entries(props)) {
  if (key.startsWith('aria')) e.setAttribute(key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value);
  else e[key] = value;
 }
 e.append(...children.filter(c => c != null && c !== false)); return e;
}
function homeIcon(name, className) { const box = homeEl('span', {className}); box.innerHTML = icon(name); return box; }
function homeTools() { const ids = new Set((info.modules || []).filter(m => m.active).map(m => m.id)); return Object.keys(HOME_TOOLS).filter(id => ids.has(id)); }
function openTool(id) { const t = HOME_TOOLS[id]; if (!busy) switchEditor(t.kind || editorKind, t.view).catch(e => toast(e.message)); }

async function loadHome() {
 const data = await request('/api/home');
 $('home').replaceChildren(homeManaging && data.editar ? homeManager(data) : homePage(data));
}

function homePage(data) {
 const brand = HOME_BRAND[info.brand] || HOME_BRAND.indoor, first = (info.user?.name || '').trim().split(/\s+/)[0];
 const photos = homeEl('div', {className: 'home-photos', ariaHidden: 'true'}, ...data.fotos.map((f, i) => homeEl('img', {className: 'home-photo' + (i ? '' : ' is-active'), src: f.url, alt: '', decoding: 'async'})));
 startHomePhotos(photos);
 const tutorials = data.tutoriais.filter(t => HOME_TOOLS[t.tool]);
 const hero = homeEl('section', {className: 'home-hero', ariaLabelledby: 'home-welcome'}, photos,
  homeEl('div', {className: 'home-hero-copy'},
   homeEl('span', {className: 'home-eyebrow', textContent: brand.eyebrow}),
   homeEl('h1', {id: 'home-welcome', textContent: first ? `Bem-vindo, ${first}` : 'Bem-vindo'}),
   homeEl('p', {textContent: brand.text}),
   tutorials.length && homeEl('a', {className: 'home-cta', href: '#home-tutorials', onclick: e => { e.preventDefault(); $('home-tutorials').scrollIntoView({behavior: 'smooth'}); }}, 'Ver tutoriais', homeIcon('arrow-right', 'home-cta-icon'))),
  data.editar && homeEl('button', {className: 'home-manage', type: 'button', onclick: () => { homeManaging = true; loadHome().catch(e => toast(e.message)); }}, homeIcon('pencil', 'home-manage-icon'), 'Conteúdo da Home'));
 const cards = homeTools().map(id => {
  const t = HOME_TOOLS[id];
  return homeEl('article', {className: 'home-card'}, homeIcon(t.icon, 'home-card-icon'), homeEl('h3', {textContent: t.name}), homeEl('p', {textContent: t.text}),
   homeEl('button', {className: 'home-open', type: 'button', textContent: 'Abrir', ariaLabel: `Abrir ${t.name}`, onclick: () => openTool(id)}));
 });
 const tools = homeEl('section', {className: 'home-section', ariaLabelledby: 'home-tools-title'},
  homeEl('header', {}, homeEl('h2', {id: 'home-tools-title', textContent: 'Suas ferramentas'}),
   homeEl('p', {textContent: 'Tudo o que o seu acesso libera, em um só lugar. Cada ferramenta salva o seu trabalho para você continuar depois.'})),
  homeEl('div', {className: 'home-grid'}, ...cards));
 const videos = homeEl('section', {className: 'home-section', id: 'home-tutorials', ariaLabelledby: 'home-tutorials-title'},
  homeEl('header', {}, homeEl('h2', {id: 'home-tutorials-title', textContent: 'Tutoriais'}), homeEl('p', {textContent: 'Vídeos curtos, um para cada ferramenta.'})),
  tutorials.length ? homeEl('div', {className: 'home-grid home-videos'}, ...tutorials.map(t => homeEl('figure', {className: 'home-video'},
   homeEl('video', {src: t.url, controls: true, preload: 'metadata', playsInline: true}),
   homeEl('figcaption', {textContent: `Como usar ${HOME_TOOLS[t.tool].name}`}))))
   : homeEl('p', {className: 'home-empty', textContent: 'Os tutoriais aparecem aqui assim que forem publicados.'}));
 return homeEl('div', {className: 'home-page'}, hero, tools, videos);
}

// Fotos do topo: a ativa aparece e se aproxima devagar; a anterior some mantendo a escala, depois volta ao início.
function startHomePhotos(box) {
 clearInterval(homeTimer);
 const photos = [...box.children];
 if (photos.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 let index = 0;
 homeTimer = setInterval(() => {
  if (!box.isConnected || $('home').hidden) { clearInterval(homeTimer); return; }
  const leaving = photos[index]; index = (index + 1) % photos.length;
  leaving.classList.replace('is-active', 'is-leaving');
  photos[index].classList.add('is-active');
  setTimeout(() => leaving.classList.remove('is-leaving'), HOME_FADE_MS);
 }, HOME_PHOTO_MS);
}

// Conteúdo da Home: fotos (todos veem) e um tutorial por ferramenta (só quem tem a ferramenta vê).
function homeManager(data) {
 const send = (path, file) => guard(async () => {
  if (file.size > 100 * 1024 * 1024) throw new Error('Limite de 100 MB por arquivo.');
  const response = await fetch(path, {method: 'POST', headers: {'X-Indoor': '1', 'Content-Type': 'application/octet-stream'}, body: file});
  const result = await response.json(); if (!response.ok) throw new Error(result.error);
  await loadHome();
 });
 const act = (path, body) => guard(async () => { await request(path, body); await loadHome(); });
 const picker = (accept, onfile) => { const input = homeEl('input', {type: 'file', accept, hidden: true}); input.onchange = () => { if (input.files[0]) onfile(input.files[0]); }; return input; };
 const photoInput = picker('image/jpeg,image/png,image/webp', file => send('/api/home/foto', file));
 const photos = homeEl('div', {className: 'home-manage-photos'}, ...data.fotos.map((f, i) => homeEl('figure', {},
  homeEl('img', {src: f.url, alt: `Foto ${i + 1} do carrossel`}),
  homeEl('button', {className: 'ac-btn ac-btn-danger', type: 'button', onclick: () => act('/api/home/foto-remover', {id: f.id})}, homeIcon('trash', 'home-btn-icon'), 'Remover'))),
  homeEl('button', {className: 'home-add-photo', type: 'button', onclick: () => photoInput.click()}, homeIcon('upload', 'home-add-icon'), 'Adicionar foto', homeEl('small', {textContent: 'JPG, PNG ou WebP'})), photoInput);
 const has = new Set(data.tutoriais.map(t => t.tool));
 const rows = Object.entries(HOME_TOOLS).map(([id, t]) => {
  const input = picker('video/mp4', file => send(`/api/home/tutorial?tool=${id}`, file));
  return homeEl('tr', {}, homeEl('th', {scope: 'row', textContent: t.name}),
   homeEl('td', {textContent: has.has(id) ? 'Vídeo publicado' : 'Nenhum vídeo enviado'}),
   homeEl('td', {className: 'home-actions'}, input,
    homeEl('button', {className: 'ac-btn ac-btn-quiet', type: 'button', onclick: () => input.click()}, homeIcon('upload', 'home-btn-icon'), has.has(id) ? 'Trocar vídeo' : 'Enviar vídeo'),
    has.has(id) && homeEl('button', {className: 'ac-btn ac-btn-danger', type: 'button', textContent: 'Remover', ariaLabel: `Remover tutorial de ${t.name}`, onclick: () => act('/api/home/tutorial-remover', {tool: id})})));
 });
 return homeEl('div', {className: 'home-manager'},
  homeEl('header', {className: 'home-manager-head'},
   homeEl('div', {}, homeEl('h1', {textContent: 'Conteúdo da Home'}),
    homeEl('p', {textContent: 'Só superadmins veem esta tela. Fotos aparecem para todos; cada tutorial aparece só para quem tem a ferramenta liberada no cargo.'})),
   homeEl('button', {className: 'ac-btn ac-btn-quiet', type: 'button', onclick: () => { homeManaging = false; loadHome().catch(e => toast(e.message)); }}, 'Ver a Home', homeIcon('arrow-right', 'home-btn-icon'))),
  homeEl('section', {className: 'ac-box home-manager-box', ariaLabelledby: 'home-photos-title'},
   homeEl('header', {className: 'ac-box-head'}, homeEl('div', {}, homeEl('h2', {id: 'home-photos-title', textContent: 'Fotos dos colaboradores'}),
    homeEl('p', {textContent: `${data.fotos.length} de 12 fotos. Elas se alternam no topo da Home, recortadas para preencher a faixa.`}))), photos),
  homeEl('section', {className: 'ac-box home-manager-box', ariaLabelledby: 'home-videos-title'},
   homeEl('header', {className: 'ac-box-head'}, homeEl('div', {}, homeEl('h2', {id: 'home-videos-title', textContent: 'Tutoriais'}),
    homeEl('p', {textContent: 'Um vídeo MP4 por ferramenta, até 100 MB.'}))),
   homeEl('div', {className: 'home-table'}, homeEl('table', {}, homeEl('tbody', {}, ...rows)))));
}

// Marca do cargo: logo do menu, ícone e nome da aba.
function applyBrand(brand) {
 const eap = brand === 'eap', logo = document.querySelector('.sidebar .brand');
 document.body.classList.toggle('marca-eap', eap);
 logo.setAttribute('aria-label', eap ? 'EAP · Início' : 'Indoor Channel · Início');
 logo.querySelector('img').src = eap ? '/eap-icon.svg' : '/favicon.svg?v=13';
 logo.querySelector('img').alt = eap ? 'EAP' : 'Indoor Channel';
 document.querySelector('link[rel="icon"]').href = eap ? '/eap-icon.svg' : '/favicon.svg?v=13';
 document.title = eap ? 'EAP · Assistente de edições' : 'Indoor Channel · Assistente de Edições';
}
document.body.classList.add('secao-home');  // a Home é a tela inicial, antes mesmo de /api/info responder
document.querySelector('.sidebar .brand').addEventListener('click', e => { e.preventDefault(); if (!busy) { homeManaging = false; switchEditor(editorKind, 'home').catch(err => toast(err.message)); } });
