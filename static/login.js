// Login, cadastro por convite e nova senha (/login.html?convite=TOKEN). Só existe com INDOOR_AUTH=1 no servidor.
const $ = id => document.getElementById(id);
const convite = new URLSearchParams(location.search).get('convite');
let modo = 'login';  // 'login' | 'cadastro' | 'reset'

async function request(path, body) {
  const response = await fetch(path, {method: body ? 'POST' : 'GET', headers: body ? {'Content-Type': 'application/json', 'X-Indoor': '1'} : {}, body: body && JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function erro(message, campo) {
  $('erro').textContent = message || '';
  $('erro').hidden = !message;
  for (const id of ['nome', 'email', 'senha', 'confirmar']) $(id).removeAttribute('aria-invalid');
  if (campo) { $(campo).setAttribute('aria-invalid', 'true'); $(campo).focus(); }
}

// Senha nova: a regra aparece antes do erro; a confirmação é conferida ao sair do campo
function conferirConfirmacao() {
  const dica = $('confirmar-dica'), diferente = $('confirmar').value && $('confirmar').value !== $('senha').value;
  dica.hidden = !diferente; dica.textContent = diferente ? 'As duas senhas estão diferentes.' : '';
  dica.classList.toggle('is-error', !!diferente);
  if (diferente) $('confirmar').setAttribute('aria-invalid', 'true'); else $('confirmar').removeAttribute('aria-invalid');
  return !diferente;
}

$('ver-senha').onclick = () => {
  const ver = $('senha').type === 'password';
  for (const id of ['senha', 'confirmar']) $(id).type = ver ? 'text' : 'password';
  $('ver-senha').textContent = ver ? 'Ocultar' : 'Mostrar';
  $('ver-senha').setAttribute('aria-pressed', String(ver));
};

function modoSenhaNova(titulo, sub, botao) {
  $('titulo').textContent = titulo;
  $('sub').textContent = sub;
  $('sub').hidden = false;
  $('enviar').textContent = botao;
  $('campo-email').hidden = true;
  $('campo-confirmar').hidden = $('senha-dica').hidden = false;
  $('senha-label').textContent = 'Crie uma senha';
  $('senha').autocomplete = 'new-password';
  $('rodape').hidden = true;
  $('confirmar').addEventListener('blur', conferirConfirmacao);
}

if (convite) {
  $('card-form').hidden = true;  // só aparece depois de saber que tipo de link é (evita piscar o login)
  request('/api/auth/convite?token=' + encodeURIComponent(convite)).then(info => {
    $('email').value = info.email;  // continua no form para o gerenciador de senhas salvar no e-mail certo
    if (info.reset) {
      modo = 'reset';
      modoSenhaNova('Defina uma nova senha', 'Ao salvar, quem estiver conectado com a senha antiga em outro aparelho sai do sistema.', 'Salvar senha');
      $('senha-label').textContent = 'Nova senha';
      $('convite-texto').textContent = 'Conta: ';
    } else {
      modo = 'cadastro';
      modoSenhaNova('Complete seu cadastro', 'Falta pouco: seu nome e uma senha.', 'Criar conta e entrar');
      $('campo-nome').hidden = false;
      $('convite-texto').textContent = 'Convite para ';
    }
    const quem = document.createElement('strong'); quem.textContent = info.email;
    $('convite-texto').append(quem, info.reset ? '' : ` · ${info.role}`);
    $('convite-info').hidden = false;
    $('card-form').hidden = false;
    $('card-form').classList.add('ac-reveal');
    (modo === 'cadastro' ? $('nome') : $('senha')).focus();
  }).catch(() => { $('card-invalido').hidden = false; $('card-invalido').classList.add('ac-reveal'); });
}

$('form').onsubmit = async event => {
  event.preventDefault();
  erro('');
  if (modo === 'cadastro' && !$('nome').value.trim()) return erro('Escreva seu nome.', 'nome');
  if (modo === 'login' && !$('email').value.trim()) return erro('Informe seu e-mail.', 'email');
  if (!$('senha').value) return erro('Informe a senha.', 'senha');
  if (modo !== 'login' && $('senha').value.length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.', 'senha');
  if (modo !== 'login' && !conferirConfirmacao()) return erro('As duas senhas estão diferentes. Digite de novo.', 'confirmar');
  const rotulo = $('enviar').textContent;
  $('enviar').disabled = true;
  $('enviar').setAttribute('aria-busy', 'true');
  $('enviar').textContent = {login: 'Entrando…', cadastro: 'Criando conta…', reset: 'Salvando…'}[modo];
  try {
    if (modo === 'login') await request('/api/auth/login', {email: $('email').value, password: $('senha').value});
    else await request('/api/auth/cadastro', {token: convite, name: $('nome').value, password: $('senha').value});
    location.replace('/');
  } catch (e) {
    $('enviar').disabled = false;
    $('enviar').removeAttribute('aria-busy');
    $('enviar').textContent = rotulo;
    erro(e.message, modo === 'login' ? 'senha' : null);
    if (modo === 'login') $('senha').select();
  }
};
