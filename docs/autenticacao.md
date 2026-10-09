# Raio-x: autenticação, cargos e convites

## 1. Motivação

O Assistente de Edições roda em dois lugares:

- **No PC da equipe / executável portátil**: uma pessoa usa, os arquivos ficam na máquina.
- **No servidor** (`deploy/`, `https://assistente-edicao.indoorchannel.com.br`): até esta mudança, **qualquer pessoa que soubesse o endereço** usava todas as ferramentas e via o trabalho de todos.

A funcionalidade fecha o servidor com:

1. **Login** por e-mail e senha.
2. **Cargos personalizados**: cada cargo libera um subconjunto das ferramentas (Imagens, Vídeos, Ofertas, Logo EAP, Vetorização M6S).
3. **Superadmin como booleano do usuário** (não é um cargo): vê todas as ferramentas e é o único que gerencia cargos, convites e usuários. Só um superadmin dá ou tira essa marcação.
4. **Cadastro por convite**: o superadmin informa e-mail + cargo, o sistema gera um link, o superadmin envia o link e a pessoa completa o cadastro com nome e senha.
5. **Dados por usuário**: edições, pedidos de Ofertas, encartes, vídeos gerados e histórico passam a ter dono.

Decisões de escopo:

| Decisão | Escolha |
|---|---|
| Onde vale o login | Só no servidor, com `INDOOR_AUTH=1`. No PC e no portátil nada muda. |
| Primeiro superadmin | Comando no terminal (`python server.py criar-superadmin email`), não uma tela de "primeiro acesso" (no domínio público, quem chegasse primeiro viraria admin). |
| Dados | Separados por usuário. Biblioteca de imagens de Ofertas e templates continuam compartilhados. |
| Dependências | Nenhuma nova: `hashlib.scrypt`, `secrets`, `hmac`, `contextvars`, tudo da biblioteca padrão. |

## 2. Fluxo geral

```
                        ┌──────────────── terminal (servidor) ────────────────┐
                        │ python server.py criar-superadmin chefe@x.com       │
                        │   → auth.create_invite(superadmin=True) → imprime link │
                        └───────────────────────────┬──────────────────────────┘
                                                    │ link /login.html?convite=TOKEN
navegador                                           ▼
 login.html ──GET /api/auth/convite?token──▶ auth.api ─▶ invites (sha256 do token)
            ──POST /api/auth/cadastro─────▶ cria users, marca convite usado,
                                             (1º superadmin herda dados sem dono),
                                             cria sessions ─▶ Set-Cookie indoor_sessao
            ──POST /api/auth/login────────▶ scrypt + limite de tentativas ─▶ Set-Cookie

 qualquer requisição ─▶ server.app()
     validate_host / origem (já existia)
     user = auth.user_from(cookie) ; USUARIO.set(user)      ← ContextVar em storage.py
     /api/auth/*, /api/admin/*  → auth.api (admin só com superadmin)
     rota pública (PUBLIC)      → segue
     sem user                   → 302 /login.html (página) | 401 (resto)
     TOOLS[prefixo] ∉ allowed(user) → 403
     ofertas.handle / api() / arquivos
         gravação: owner = storage.owner()
         leitura por id: storage.mine(db, tabela, id)  → "Não encontrado."
         listagens: WHERE ? IS NULL OR owner=?

 index.html ─ app.js: GET /api/info → applyAccess(): esconde ferramentas fora do cargo,
                      mostra nome + Sair; superadmin vê "Usuários" → admin.js
```

## 3. Modelo de dados

Tudo em SQLite (`dados/historico.sqlite`), sem migrações versionadas: o projeto cria tabelas com `CREATE TABLE IF NOT EXISTS` e acrescenta colunas com `ALTER TABLE` quando faltam, na inicialização.

### 3.1 Tabelas novas (`modules/auth.py:23-32`)

```python
CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, modules TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL,
    role TEXT, superadmin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created TEXT);
CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT, superadmin INTEGER NOT NULL DEFAULT 0,
    created TEXT, expires TEXT, used TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL, expires TEXT);
```

O que não é óbvio:

- **`roles.modules` é JSON** com ids de `MODULES` (`server.py`), por exemplo `["offers"]`. Não há tabela de junção: a lista é pequena, é sempre lida inteira e só o superadmin a edita.
- **`users.role` é anulável**: um superadmin não precisa de cargo (vê tudo), e o admin pode deixar alguém "Sem cargo", que não vê nenhuma ferramenta.
- **`users.superadmin` é uma coluna do usuário**, não um cargo especial. É assim que "só superadmins alteram essa variável" fica garantido: só `/api/admin/usuario-salvar` escreve nela, e esse endpoint exige superadmin.
- **`users.active`** existe em vez de apagar o usuário: o dono dos registros continua apontando para alguém e o histórico não fica órfão.
- **`invites.token` e `sessions.token` guardam o sha256**, não o valor. Quem ler o banco (backup, volume Docker) não consegue usar um convite pendente nem sequestrar uma sessão. Como os tokens têm 256 bits aleatórios (`secrets.token_urlsafe(32)`), não precisam de salt.
- **`invites.used`** é uma data, não um booleano: uso único com registro de quando foi usado.
- **`invites.role` é `NULL` em convite de superadmin** (`create_invite`, linha 85).

### 3.2 Coluna `owner` nas tabelas existentes

`storage.py:57-59` (edições e histórico):

```python
for table in ('jobs', 'events'):
    if 'owner' not in {r[1] for r in db.execute(f'PRAGMA table_info({table})')}:
        db.execute(f'ALTER TABLE {table} ADD COLUMN owner TEXT')
```

`modules/ofertas/__init__.py:118-121` (Ofertas):

```python
# dono (login no servidor): pedidos, vídeos e encartes são de quem criou; biblioteca e templates são da equipe
for tabela in ('ofertas_pedidos', 'ofertas_renders', 'ofertas_encartes'):
    if 'owner' not in {c['name'] for c in db.execute(f'PRAGMA table_info({tabela})')}:
        db.execute(f'ALTER TABLE {tabela} ADD COLUMN owner TEXT')
```

`owner` é `NULL` em dois casos, e os dois são intencionais:

1. **Modo local** (sem login): ninguém está logado, então `owner()` devolve `None` e nada é filtrado.
2. **Dados anteriores ao login**: herdados pelo primeiro superadmin no cadastro (seção 4.4).

`media`, `logos` e `plans` **não** ganharam `owner`: pertencem a um `job` e herdam o dono dele (a checagem de `/api/preview` e `/api/export` segue `media.job` e `plans.job`, seção 5.2).

### 3.3 Histórico para relatórios: `events.owner`, `events.module` e índice

Cada evento do Histórico guarda **quem** (`owner`, id do usuário), **em qual ferramenta** (`module`: `images`, `video`, `offers`, `ms6`, `eap`) e **quando** (`time`). O índice `events_owner_time` deixa rápidas as consultas por pessoa e período, base dos relatórios futuros. Exemplo:

```sql
SELECT users.name, events.module, count(*) FROM events JOIN users ON users.id = events.owner
WHERE events.time >= '2026-10-01' GROUP BY users.name, events.module;
```

`storage.event()` descobre o módulo sozinho: pelo `editorKind` da edição quando o evento tem `job`; senão, pelo `ContextVar` `FERRAMENTA`, que `server.app()` define pelo caminho (`/api/ofertas/`, `/api/vector/`, `/api/eap/`). `ofertas.registrar()` passa `'offers'` explícito, para cobrir a fila e a leitura de encartes em segundo plano. Os eventos antigos são classificados uma vez, na migração (testado numa cópia do banco real: 164 de 164 eventos classificados).

"Apagar" no Histórico só esconde o evento da lista da pessoa (`hidden=1`); o registro continua no banco para os relatórios. Usuários também nunca são apagados, só desativados, então o `owner` de um evento antigo sempre encontra alguém.

> **Efeito colateral:** o `ALTER TABLE` muda a quantidade de colunas. Quem fazia `INSERT ... VALUES(...)` sem nomear colunas quebra. Por isso os `INSERT` de `ofertas_renders` e `ofertas_encartes` passaram a nomear colunas, e os de `ofertas_pedidos` passaram a ter 8 valores. Um teste antigo (`tests/test_ofertas.py:234`) tinha um `INSERT` posicional em `ofertas_renders` e foi ajustado.

## 4. Lógica central: `modules/auth.py`

### 4.1 Senha

```python
def hash_password(senha):
    salt = secrets.token_bytes(16)
    return salt.hex() + '$' + hashlib.scrypt(senha.encode(), salt=salt, n=2**14, r=8, p=1).hex()

def check_password(senha, guardado):
    salt, h = guardado.split('$')
    return hmac.compare_digest(hashlib.scrypt(senha.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex(), h)
```

- **scrypt** é uma função de derivação de chave lenta e que usa muita memória, e está na biblioteca padrão. Assim não foi preciso adicionar `bcrypt`/`argon2` ao `requirements.txt`, que também alimenta o executável portátil.
- `n=2**14, r=8` usa cerca de 16 MB e algumas dezenas de ms por verificação. É um custo aceitável para um login e caro para quem tenta adivinhar senhas em massa.
- Formato `salt_hex$hash_hex`: o salt viaja junto, então cada senha tem um salt próprio.
- `hmac.compare_digest` compara em tempo constante, sem vazar por timing quantos caracteres bateram.

### 4.2 Sessão e cookie

```python
def cookie(environ, token, dias):
    secure = '; Secure' if scheme(environ) == 'https' else ''
    return ('Set-Cookie', f'{COOKIE}={token}; Path=/; Max-Age={dias * 86400}; HttpOnly; SameSite=Lax{secure}')

def new_session(db, user_id, environ):
    token = secrets.token_urlsafe(32)
    db.execute('DELETE FROM sessions WHERE expires<?', (now(),))
    db.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), user_id, later(SESSAO_DIAS)))
    return cookie(environ, token, SESSAO_DIAS)
```

- **Sessão no banco, não JWT.** Desativar um usuário (`DELETE FROM sessions WHERE user=?`) ou sair derruba a sessão na hora. Com um token autocontido isso exigiria uma lista de revogação.
- **`HttpOnly`**: o JavaScript da página não lê o cookie, então um XSS não o rouba.
- **`SameSite=Lax`**, somado às proteções que já existiam (cabeçalho `X-Indoor: 1` obrigatório em todo POST, checagem de `Origin` e de `Sec-Fetch-Site` em `server.app`), cobre CSRF sem precisar de token CSRF.
- **`Secure` só em HTTPS.** Num teste local por `http://localhost:8765` o cookie não pode ser `Secure` (o Safari o descartaria). Para o servidor saber que está em HTTPS atrás do Caddy, veja 6.3.
- A limpeza de sessões vencidas acontece a cada login (`DELETE ... WHERE expires<?`), sem precisar de um job agendado.
- A validade de 30 dias (`SESSAO_DIAS`) é fixa e não se renova com o uso.

`user_from` (linhas 52-59) lê o cookie, faz o hash e junta com `users` exigindo `active=1` e sessão não vencida. Assim, um usuário desativado perde o acesso mesmo que alguma sessão escape da limpeza. `password` é zerado no dict devolvido, para o hash nunca circular pelo resto da requisição.

### 4.3 Convite

```python
def create_invite(email, role=None, superadmin=False):
    email = str(email or '').strip().lower()
    if not EMAIL.fullmatch(email): raise ValueError('Informe um e-mail válido.')
    token = secrets.token_urlsafe(32)
    with connect() as db:
        if db.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone(): raise ValueError('Já existe um usuário com este e-mail.')
        if not superadmin and not db.execute('SELECT 1 FROM roles WHERE id=?', (role,)).fetchone(): raise ValueError('Escolha um cargo.')
        db.execute('DELETE FROM invites WHERE email=? AND used IS NULL', (email,))  # convite novo substitui o anterior
        db.execute('INSERT INTO invites VALUES(?,?,?,?,?,?,NULL)', (digest(token), email, None if superadmin else role, int(bool(superadmin)), now(), later(CONVITE_DIAS)))
    return token
```

- O e-mail é **normalizado** (`strip().lower()`) aqui e no login. `"USO@x.com "` e `"uso@x.com"` são a mesma conta, e o teste `test_invite_is_single_use_and_login_works` cobre esse caso.
- Convidar de novo o mesmo e-mail **substitui** o convite pendente, então o link antigo para de funcionar. É o caminho para "perdi o link".
- O token em texto puro só existe no retorno da função, ou seja, no link. O banco guarda o hash.
- **Não há envio de e-mail**, conforme pedido: quem convidou copia o link e envia.

`invite(db, token)` (linhas 88-91) é o único lugar que valida um convite: existe, não foi usado e não venceu. A mensagem de erro é a mesma nos três casos, para não revelar qual deles aconteceu.

### 4.4 Cadastro e herança dos dados antigos

```python
with connect() as db:
    row = invite(db, value.get('token'))
    primeiro = row['superadmin'] and not db.execute('SELECT 1 FROM users WHERE superadmin=1').fetchone()
    ident = uid()
    db.execute('INSERT INTO users VALUES(?,?,?,?,?,?,1,?)', (ident, row['email'], name, hash_password(senha), row['role'], row['superadmin'], now()))
    db.execute('UPDATE invites SET used=? WHERE token=?', (now(), row['token']))
    if primeiro:  # o que foi feito antes do login existir passa a ser do primeiro superadmin
        for table in ('jobs', 'events', 'ofertas_pedidos', 'ofertas_renders', 'ofertas_encartes'):
            if 'owner' in {c[1] for c in db.execute(f'PRAGMA table_info({table})')}:
                db.execute(f'UPDATE {table} SET owner=? WHERE owner IS NULL', (ident,))
    header = new_session(db, ident, environ)
```

- Tudo roda numa transação só (`connect()` usa `with db:`). Se algo falhar, o convite não é marcado como usado e o usuário não fica pela metade.
- **Por que os dados antigos vão para o primeiro superadmin:** com a separação por usuário, linhas com `owner IS NULL` não apareceriam para ninguém, porque o filtro é `owner=?`. O primeiro superadmin é quem ligou o login, então é quem herda.
- O `PRAGMA table_info` protege contra a tabela de Ofertas ainda sem a coluna `owner`. Para isso não acontecer no servidor, `server.py` chama `ofertas.garantir()` na inicialização quando `AUTH` está ligado (ver 6.1).
- O cadastro já cria a sessão: a pessoa cai direto no sistema, sem logar de novo.

**Exemplo (do teste `test_legacy_data_goes_to_first_superadmin`):** antes de qualquer usuário existir, há um job `legado` com `owner NULL`. O convite de superadmin de `chefe@x.com` é aceito: `primeiro = True`, o `UPDATE jobs SET owner='<id do chefe>' WHERE owner IS NULL` roda, e `GET /api/jobs` com o cookie do chefe inclui `legado`. Ao final, não sobra nenhum job com `owner IS NULL`.

### 4.4.1 Redefinição de senha

Reaproveita a tabela `invites`, com uma coluna a mais: `user`. Um convite com `user` preenchido não cria conta, só troca a senha de um usuário que já existe.

```python
if 'user' not in {c[1] for c in db.execute('PRAGMA table_info(invites)')}:
    db.execute('ALTER TABLE invites ADD COLUMN user TEXT')
```

`create_reset(user_id)` recusa usuário desativado e substitui um link anterior ainda não usado. No `/api/auth/cadastro`, o ramo de redefinição troca a senha, marca o link como usado, **apaga todas as sessões do usuário** (outros aparelhos, ou quem sabia a senha antiga), zera o contador de tentativas e abre uma sessão nova:

```python
if row['user']:  # redefinição: troca a senha e derruba as sessões antigas (outro aparelho, quem sabia a senha)
    db.execute('UPDATE users SET password=? WHERE id=? AND active=1', (hash_password(senha), row['user']))
    db.execute('UPDATE invites SET used=? WHERE token=?', (now(), row['token']))
    db.execute('DELETE FROM sessions WHERE user=?', (row['user'],))
```

Por que reaproveitar a tabela: validade, uso único, hash do token e a página `login.html?convite=` já existiam. `GET /api/auth/convite` devolve `reset: true`, e a página esconde o campo de nome e troca o título para "Defina uma nova senha". Os links de redefinição ficam fora de "Convites pendentes" e do "Revogar" (`user IS NULL` nas duas consultas). Quem gera o link é o superadmin, em `POST /api/admin/redefinir-senha {id}` (botão **Redefinir senha** em cada usuário); o envio é manual, como o do convite.

### 4.5 Login e limite de tentativas

```python
def login(email, senha, environ):
    email = str(email or '').strip().lower()
    with FALHAS_LOCK:
        recentes = [t for t in FALHAS.get(email, []) if t > time.time() - 900]
        FALHAS[email] = recentes
        if len(recentes) >= 5: raise ValueError('Muitas tentativas. Aguarde 15 minutos e tente de novo.')
    with connect() as db:
        row = db.execute('SELECT * FROM users WHERE email=? AND active=1', (email,)).fetchone()
        if not row or not check_password(str(senha or ''), row['password']):
            with FALHAS_LOCK: FALHAS.setdefault(email, []).append(time.time())
            raise ValueError('E-mail ou senha incorretos.')
        with FALHAS_LOCK: FALHAS.pop(email, None)
        return public(row), new_session(db, row['id'], environ)
```

É uma janela deslizante de 15 minutos (900 s) por e-mail, guardada em memória.

**Exemplo (do teste `test_five_wrong_passwords_lock_the_email` e do teste manual):** 5 tentativas erradas devolvem "E-mail ou senha incorretos." e geram 5 registros em `FALHAS['trava@x.com']`. Na 6ª, mesmo com a senha **certa**, a lista filtrada tem 5 itens, `5 >= 5`, e a resposta é "Muitas tentativas". Às +15 min os registros saem da janela e o login volta a funcionar. Um login certo antes de atingir o limite zera o contador (`FALHAS.pop`).

A mensagem é a mesma para "e-mail não existe" e "senha errada", para não servir de oráculo de quais e-mails estão cadastrados.

### 4.6 Permissão por ferramenta

```python
def allowed(user, modules):
    """Ids de ferramentas que o usuário abre. `modules` = MODULES do server.py."""
    ativos = [m['id'] for m in modules if m['active']]
    if user['superadmin']: return ativos
    with connect() as db: row = db.execute('SELECT modules FROM roles WHERE id=?', (user['role'],)).fetchone()
    return [m for m in json.loads(row['modules']) if m in ativos] if row else []
```

- A permissão é **calculada a cada requisição**, não guardada na sessão. Mudar o cargo de alguém, ou as ferramentas de um cargo, vale na próxima requisição, sem precisar sair e entrar.
- Ferramentas inativas (`conteudos`, "Em breve") nunca são liberadas, mesmo que estejam no JSON do cargo.

### 4.7 Endpoints de administração (`admin`, linhas 148-188)

Todos exigem superadmin (`auth.api`, linha 145). Os pontos de atenção:

- `cargo-salvar` faz upsert (`ON CONFLICT(id) DO UPDATE`): sem `id` cria o cargo, com `id` edita.
- `cargo-excluir` recusa a exclusão se houver usuário **ou convite pendente** com o cargo. Sem isso, o convite seria aceito com um `role` que não existe mais.
- `usuario-salvar` aceita mudanças parciais (`value.get('superadmin', row['superadmin'])`), e a tela manda um campo por vez. A regra que protege o sistema de ficar sem administrador:

```python
if row['superadmin'] and row['active'] and not (superadmin and active) and \
        db.execute('SELECT count(*) FROM users WHERE superadmin=1 AND active=1').fetchone()[0] <= 1:
    raise ValueError('Este é o último superadmin ativo. Promova outra pessoa antes.')
```

  Ela vale tanto para tirar o superadmin quanto para desativar: o que conta é "deixaria de ser superadmin ativo". Desativar alguém também apaga as sessões dessa pessoa.
- `convite` monta o link com o esquema e o `Host` da própria requisição do admin, então funciona igual em `localhost:8765` e no domínio.

## 5. Pontos de entrada e o portão

### 5.1 `server.app()`: o portão (`server.py:654-672`)

```python
user = auth.user_from(environ) if AUTH else None
USUARIO.set(user)  # a thread do waitress é reaproveitada: sempre redefinir
if AUTH and path.startswith(('/api/auth/', '/api/admin/')):
    ...
    result, extra = auth.api(method, path, parse_qs(environ.get('QUERY_STRING', '')), json.loads(body) if body else {}, user, environ)
    ...
if AUTH and not path.startswith(PUBLIC):
    if not user:
        if path in ('/', '/index.html'):
            start_response('302 Found', [('Location', '/login.html'), ('Content-Length', '0')]); return []
        raise auth.Denied('Faça login.', '401 Unauthorized')
    need = next((tools for prefixes, tools in TOOLS if path.startswith(prefixes)), None)
    if need and not need & set(auth.allowed(user, MODULES)): raise auth.Denied('Seu cargo não tem acesso a esta ferramenta.')
resposta = ofertas.handle(environ)
```

- O portão roda **depois** das checagens de host e origem, que já existiam, e **antes** de `ofertas.handle`. Ofertas tem o próprio roteador, então qualquer checagem colocada depois dele não valeria para Ofertas.
- **`USUARIO.set(user)` é incondicional.** O waitress atende várias requisições na mesma thread, e um `ContextVar` definido numa requisição continuaria lá na próxima. Sem redefinir sempre, uma requisição anônima poderia herdar o usuário da anterior.
- Os endpoints de auth recebem o mesmo tratamento dos outros: `X-Indoor: 1` em POST, e um limite de corpo de 1 MB, já que login não precisa dos 100 MB de upload.
- Página sem login recebe **302**. API e arquivos recebem **401**, e é isso que o `app.js` usa para redirecionar.

`PUBLIC` e `TOOLS` (`server.py:60-64`):

```python
AUTH = os.environ.get('INDOOR_AUTH') == '1'
PUBLIC = ('/login.html', '/login.js', '/style.css', '/favicon.svg', '/logo-indoor.png', '/api/info')
TOOLS = [(('/api/history',), None), (('/api/ofertas/', '/ofertas/'), {'offers'}), (('/api/vector/', '/vetor/'), {'ms6'}), (('/api/eap/', '/eap/'), {'eap'}),
         (('/api/', '/media/', '/logo/', '/video/', '/audio/', '/entrega'), {'images', 'video'})]
```

- **A ordem importa**: `next()` pega o primeiro prefixo que casa, e `'/api/'` funciona como "o resto" no fim da lista.
- **`/api/history` → `None`**: o Histórico vale para qualquer cargo, porque mostra eventos de todas as ferramentas, inclusive de Ofertas. Sem essa entrada, um usuário só de Ofertas cairia em `'/api/'` e receberia 403.
- **Imagens e Vídeos dividem as mesmas rotas** (`/api/jobs`, `/api/save`, `/api/upload`…). O tipo de editor fica em `jobs.meta.editorKind`, não na URL. Por isso o requisito é "Imagens **ou** Vídeos" (`{'images', 'video'}`, interseção de conjuntos).
- Os arquivos estáticos do app (`app.js`, `admin.js` etc.) não estão em `PUBLIC`: sem login, devolvem 401.
- `/api/info` é público, mas sem usuário responde só `{version, auth: True, user: None}` (`server.py:207-211`). Assim a tela de login não expõe hostname nem a lista de ferramentas.

`auth.Denied` é uma exceção própria, com `status` 401 ou 403, tratada em `server.py:740`. A primeira versão usava `PermissionError`, mas ele é subclasse de `OSError`: um erro de permissão de pasta durante a exportação, que hoje vira uma mensagem 400 legível, passaria a responder 403.

### 5.2 Dono dos registros: `storage.py`

```python
# usuário logado da requisição (None no modo local, sem login): grava e filtra o dono dos registros
USUARIO = contextvars.ContextVar('usuario', default=None)

def owner(): return (USUARIO.get() or {}).get('id')

def event(db, job, action, detail, dono=None):
    db.execute('INSERT INTO events(job,time,action,detail,owner) VALUES(?,?,?,?,?)', (job, now(), action, json.dumps(detail, ensure_ascii=False), dono or owner()))

def mine(db, table, ident):
    """Recusa registro de outro usuário como se não existisse. Sem login (modo local), tudo é de todos."""
    if owner() and not db.execute(f'SELECT 1 FROM {table} WHERE id=? AND owner=?', (ident, owner())).fetchone():
        raise ValueError('Não encontrado.')
```

**Por que um `ContextVar` em vez de passar `user` como parâmetro:** `event()` é chamado em cerca de 20 lugares, e os `INSERT` de dono ficam espalhados por `server.py` e `ofertas`. Passar o usuário por todas essas assinaturas mudaria dezenas de linhas. O `ContextVar` é definido uma vez por requisição, no portão, e lido onde precisa.

**A limitação:** threads criadas com `threading.Thread` **não herdam** o contexto. Por isso `event()` aceita um `dono` explícito, usado pelos trabalhos em segundo plano (seção 5.4).

O padrão de filtro `WHERE ? IS NULL OR owner=?` com `(owner(), owner())` serve aos dois modos com a mesma consulta: sem login, o primeiro termo é verdadeiro e nada é filtrado; com login, vale `owner=?`.

`mine()` responde **"Não encontrado."**, e não 403, para não confirmar que aquele id existe com outro dono.

### 5.3 Checagem central em `server.api()` (`server.py:212-218`)

```python
# cada usuário só vê e mexe nas próprias edições; o id vem em campos diferentes conforme a rota
with connect() as db:
    ref = {'/api/job': query.get('id', [None])[0], '/api/logo': query.get('job', [None])[0], '/api/upload': query.get('job', [None])[0],
           '/api/rename': value.get('id'), '/api/save': value.get('id'), '/api/reuse-timelines': value.get('job'), '/api/plan': value.get('job')}.get(path)
    if path == '/api/preview': ref = (db.execute('SELECT job FROM media WHERE id=?', (value.get('id'),)).fetchone() or {'job': None})['job']
    if path == '/api/export': ref = (db.execute('SELECT job FROM plans WHERE id=?', (value.get('token'),)).fetchone() or {'job': None})['job']
    if ref is not None or path in ('/api/preview', '/api/export'): mine(db, 'jobs', ref)
```

Uma tabela, em vez de uma checagem dentro de cada endpoint. Cada rota de edição recebe o id do job num campo diferente (`id` ou `job`, na query ou no corpo), e esse mapa concentra isso num lugar só. Ao criar uma rota nova que recebe um job, basta acrescentar uma linha aqui.

`/api/preview` e `/api/export` não recebem o job diretamente: recebem uma mídia e um token de plano, e a consulta sobe até o job dono. Se a mídia ou o plano não existe, `ref = None` e `mine` recusa (com login).

As listagens (`/api/jobs`, `/api/history`, `history-delete`/`restore`, inclusive "apagar todos") ganharam o filtro de dono. No `history-delete`, o filtro está também no `UPDATE`, porque os `ids` vêm do cliente.

### 5.4 Ofertas (`modules/ofertas/__init__.py`)

A checagem central fica no topo de `api()`, linha 592:

```python
# o id de pedido, vídeo ou encarte só vale para o dono (login no servidor)
tabela = {'/pedido': 'ofertas_pedidos', '/pedido-salvar': 'ofertas_pedidos', '/pedido-excluir': 'ofertas_pedidos', '/gerar': 'ofertas_pedidos',
          '/render-cancelar': 'ofertas_renders', '/encarte-paginas': 'ofertas_encartes', '/encarte-item-salvar': 'ofertas_encartes',
          '/encarte-item-excluir': 'ofertas_encartes', '/encarte-recortar': 'ofertas_encartes', '/encarte-excluir': 'ofertas_encartes',
          '/encarte-gerar-todos': 'ofertas_encartes'}.get(path)
if tabela:
    with connect() as db: mine(db, tabela, q('id') or str(value.get('encarte' if path == '/encarte-gerar-todos' else 'id', '')))
```

Ela fica **antes** de `if not status()['pronto']`, então a posse é checada mesmo quando o Node não está instalado. O teste `test_users_only_see_their_own_jobs_and_orders` depende disso.

O mesmo padrão aparece nas outras partes:

- **Gravação**: os `INSERT` de pedidos, renders e encartes recebem `owner()`.
- **Listagens**: `/pedidos`, `/encartes` e `/renders` filtram com `? IS NULL OR owner=?`.
- **`get_pedido`** também filtra, para que o caminho `/pedidos` → `api('GET', '/pedido', ...)` e o `/gerar` fiquem cobertos.
- **Rascunho intocado** (`POST /pedidos` reaproveita o rascunho nunca salvo do mesmo template): passou a procurar só entre os rascunhos do usuário. Antes, Ana clicar num template poderia reabrir (e sobrescrever) o rascunho de Bruno.

**Trabalhos em segundo plano** não têm o `ContextVar` da requisição, então o dono vem do próprio registro:

```python
def registrar(db, acao, resumo, dono=None, **detalhe):
    event(db, None, acao, {'módulo': MODULO, 'arquivo': resumo, **detalhe}, dono)
```

- `acompanhar()` (fim de um render): `SELECT status, titulo, owner FROM ofertas_renders` → `registrar(..., atual['owner'], ...)` (linhas 252/258).
- `ler_encarte()` (leitura do PDF): `nome, dono = ... SELECT nome, owner FROM ofertas_encartes` (linha 298).

Sem isso, "Vídeo gerado" e "Encarte importado" ficariam com `owner NULL` e não apareceriam no Histórico de quem pediu.

### 5.5 CLI: primeiro superadmin (`server.py:750-756`)

```python
init()
auth.init()
if sys.argv[1:2] == ['criar-superadmin']:
    if len(sys.argv) != 3: sys.exit('Uso: python server.py criar-superadmin email@exemplo.com')
    host = os.environ.get('INDOOR_PUBLIC_URL', 'https://assistente-edicao.indoorchannel.com.br')
    print(f'Convite de superadmin (vale {auth.CONVITE_DIAS} dias): {host}/login.html?convite={auth.create_invite(sys.argv[2], superadmin=True)}')
    sys.exit()
```

O comando gera um **convite**, não um usuário: a senha nunca passa pelo terminal (nem pelo histórico do shell). No Docker: `docker compose -f deploy/compose.yaml exec assistente python server.py criar-superadmin email`. A URL impressa usa o domínio de produção, e `INDOOR_PUBLIC_URL` troca isso em testes locais.

## 6. Configuração e deploy

### 6.1 `ofertas.garantir()` na inicialização

```python
if AUTH: ofertas.garantir()  # coluna owner das Ofertas existe antes do 1º cadastro (que herda os dados antigos)
```

As tabelas e colunas de Ofertas são criadas sob demanda, na primeira requisição a `/ofertas`. Se o primeiro superadmin se cadastrasse antes de alguém abrir Ofertas depois do deploy, as tabelas antigas ainda estariam sem `owner`, o `UPDATE` de herança pularia essas tabelas, e os pedidos antigos ficariam sem dono, invisíveis para todos. Esse caso foi encontrado durante os testes.

### 6.2 `deploy/compose.yaml`

```yaml
INDOOR_ALLOWED_HOSTS: "*"           # qualquer nome que chegue pelo proxy (a 8080 não é exposta)
INDOOR_AUTH: "1"                    # login, cargos e convites (ver README, "Usuários e acesso")
INDOOR_TRUSTED_PROXY: "*"           # confia no X-Forwarded-Proto do Caddy: cookie de sessão só em HTTPS
```

O comentário do `Caddyfile` que sugeria `basic_auth` saiu: agora o login é do próprio sistema.

### 6.3 Por que `INDOOR_TRUSTED_PROXY`

O Caddy termina o HTTPS e fala HTTP com o app. Para marcar o cookie como `Secure`, o app precisa saber que o navegador está em HTTPS, e a informação vem no cabeçalho `X-Forwarded-Proto`. Só que o waitress, por padrão (`clear_untrusted_proxy_headers=True`), **apaga** os `X-Forwarded-*` de proxies em que não confia. No teste, o cookie saía sem `Secure` mesmo com o cabeçalho presente.

```python
proxy = os.environ.get('INDOOR_TRUSTED_PROXY')
serve(app, ..., **({'trusted_proxy': proxy, 'trusted_proxy_headers': {'x-forwarded-proto'}} if proxy else {}))
```

Com isso, o próprio waitress aplica o cabeçalho e define `wsgi.url_scheme='https'`, e `auth.scheme()` só lê esse valor. Confiar em `*` é seguro aqui porque a porta 8080 só é publicada em `127.0.0.1` e o Caddy é a única entrada. **Não use `*` se o app estiver exposto diretamente.**

## 7. Frontend

### 7.1 `static/login.html` + `static/login.js`

Uma página só, com três modos e um estado de erro:

| Modo | Quando | O que muda |
|---|---|---|
| Entrar | sem `?convite=` | e-mail + senha; rodapé "peça a um administrador" |
| Complete seu cadastro | convite de conta nova | cartão "Convite para **e-mail** · cargo", campos nome + senha + repetir senha |
| Defina uma nova senha | link com `reset: true` | sem nome, só senha nova + repetir; avisa que as sessões antigas caem |
| Este link não vale mais | `GET /api/auth/convite` falhou | cartão próprio com explicação e "Ir para o login", em vez de um formulário desabilitado |

Com `?convite=`, o formulário fica escondido até a resposta chegar, para não "piscar" o login antes de virar cadastro. O e-mail do convite continua num campo escondido do form, para o gerenciador de senhas salvar a senha no e-mail certo.

Estados do botão de enviar: carregando (`aria-busy`, spinner em CSS, rótulo "Entrando…"/"Criando conta…"/"Salvando…"), erro (o rótulo volta, `#erro` com `role="alert"` e `aria-invalid` no campo culpado; no login, a senha fica selecionada para redigitar) e sucesso (`location.replace('/')`, sem toast). "Mostrar/Ocultar" senha usa `aria-pressed`. A regra de 8 caracteres aparece como dica antes de virar erro; a confirmação é conferida ao sair do campo. O servidor continua validando tudo (`password_ok`); o cliente só adianta a mensagem.

Visual: as telas usam `static/acesso.css` (ver 7.4). Por ser uma ferramenta interna, o login é só um cartão simples sobre o fundo do app, com o logo e o nome "Assistente de Edições", sem painel de marca nem lema.

### 7.2 `static/app.js`

**Sessão expirada.** Em `baseRequest`:

```js
if (response.status === 401) { location.replace('/login.html'); throw new Error('Sessão encerrada. Entre novamente.'); }
```

**Visibilidade por cargo.** Depois de `/api/info`:

```js
function applyAccess(value){
  const tools=new Set(value.modules.map(m=>m.id)),editor=tools.has('images')||tools.has('video');
  const need=b=>({image:'images',video:'video'}[b.dataset.kind]||{ofertas:'offers',vector:'ms6',eap:'eap'}[b.dataset.view]);
  document.querySelectorAll('.sidebar .nav').forEach(b=>{const id=need(b);b.hidden=id?!tools.has(id):(b.dataset.view==='recent'&&!editor)||(b.dataset.view==='admin'&&!value.user.superadmin);});
  ...
  const first=[...document.querySelectorAll('.sidebar .nav')].find(b=>!b.hidden);
  if(!tools.has('images')&&first)switchEditor(first.dataset.kind||editorKind,first.dataset.view).catch(e=>toast(e.message));
}
```

- Só roda com `value.auth`, então o modo local fica exatamente como antes.
- **Isso replica no cliente o mapa `TOOLS` do servidor** (botão → id de ferramenta). Esconder um botão é só conforto visual: quem decide o acesso é o portão. Se um botão escapar, a ação devolve 403.
- "Edições recentes" some sem Imagens nem Vídeos, porque lista jobs (`/api/jobs` → 403). O "Histórico" fica sempre.
- A tela inicial é Imagens. Se o cargo não libera Imagens, o app abre a primeira ferramenta visível (Ofertas, no exemplo de teste).
- O botão "+ Nova edição" segue a mesma regra dentro de `showView` (`['vector','eap','admin']` ou sem editor), porque `showView` reescreve `hidden` a cada troca de tela.

**Nome e "Sair"** ficam no cabeçalho (`.header-actions` em `index.html`). A primeira tentativa os colocou no rodapé da barra lateral, mas uma regra existente, `.sidebar .local{display:none!important}`, esconde aquele rodapé.

### 7.3 `static/admin.js`: tela "Usuários"

A tela é montada com `document.createElement` e `textContent` (helper `adminEl`), nunca com `innerHTML`, porque nomes e e-mails vêm de usuários. Os helpers têm prefixo `admin*` porque `ofertas.js` já declara um `const el` global, e os scripts clássicos dividem o mesmo escopo léxico.

O layout tem a lista de pessoas ocupando a tela e um painel lateral (`.ac-admin`, que vira uma coluna abaixo de 1180 px):

- **Pessoas:** avatar de iniciais, nome e e-mail, etiquetas "você" e "desativado", cargo (select), chaves Superadmin e Ativo, e o botão "Nova senha", que mostra o link logo abaixo da linha com "Copiar". Superadmin mostra "Todas as ferramentas" no lugar do select. A sua própria chave "Ativo" fica desabilitada.
- **Convidar:** e-mail, cargo e a chave Superadmin (que desabilita o cargo); "Gerar link de convite" mostra o link no próprio painel. Logo abaixo ficam os convites "Esperando resposta", com "Cancelar".
- **Cargos:** cada cargo aparece com as ferramentas em etiquetas. "Editar" abre o editor no lugar (nome + chips de ferramentas, Cancelar/Salvar, "Excluir cargo"). "Novo cargo" abre o mesmo editor vazio.

Cada ação chama `adminAct` (`guard` → `request` → `loadAdmin`), que recarrega a tela. Para um link gerado e ainda não copiado não sumir nesse recarregamento, os links ficam em `adminLinks` (por usuário, e `convite`) e voltam a aparecer na nova renderização. "Copiar" vira "Copiado" por 2 s, sem toast.

### 7.3.1 Barra lateral e `static/conta.js`: Minha conta

A barra lateral tem três grupos com rótulo: **Ferramentas**, **Geral** (Edições recentes, Histórico, Usuários) e **Em breve**. Recolhida, cada rótulo vira um traço curto. Quando o cargo não deixa nenhum item de um grupo, o rótulo some junto (`applyAccess`). O botão de fixar a barra aberta saiu: ela fica sempre recolhida e abre ao passar o mouse ou com foco de teclado.

Acima da versão fica a bolinha do usuário: a inicial em verde e o nome, que aparece quando a barra abre. Ela só existe com login. O clique abre um menu com nome, e-mail, "Superadmin" ou "Conta da equipe", **Minha conta** e **Sair**. O menu fica preso ao `body` (`position: fixed`), e não dentro da barra, porque a barra tem `overflow: hidden`, recolhe quando o mouse sai, e um clique de mouse nela tira o foco de propósito (`blur`, para não deixá-la presa aberta). Fecha com Esc (o foco volta para a bolinha), com clique fora ou ao escolher uma opção.

A tela **Minha conta** (`#conta`, `loadConta()`) traz:

- **Resumo:** iniciais, nome, e-mail, cargo (ou Superadmin), "na equipe desde" e as ferramentas liberadas. Só leitura; quem muda cargo é o admin.
- **Perfil:** troca o nome (`POST /api/auth/perfil`). A bolinha e o menu atualizam na hora.
- **Senha:** senha atual, nova e repetir (`POST /api/auth/senha`). Errar a senha atual conta no mesmo limite de 5 tentativas do login, para que a tela não sirva para adivinhar senhas. Ao trocar, as **outras** sessões são encerradas e a atual continua.
- **Aparelhos conectados:** quantas sessões abertas (`sessions` em `/api/auth/me`) e "Sair dos outros aparelhos" (`POST /api/auth/sair-outros`).

No backend, `account()` (`modules/auth.py`) identifica a sessão atual pelo hash do cookie (`session_token`) para apagar todas as outras (`DELETE ... WHERE user=? AND token<>?`). `valid_name()` é a mesma validação do cadastro. Sucesso é silencioso: o botão vira "Salvo" por 2 s.

### 7.4 `static/acesso.css`

É o CSS das duas telas, carregado por `login.html` e pelo `index.html`. Começa com um carimbo de design e um bloco `:root` de tokens `--ac-*`, em OKLCH, derivados das cores de `style.css`. O destaque é o verde `--green` (`#81d680`, texto `#18391a`), o mesmo do botão "Escolher mídias"; o roxo fica só no anel de foco, como no resto do app, porque verde claro sobre fundo claro não passa o contraste mínimo de 3:1. Links de texto usam um verde escuro pelo mesmo motivo. Todo valor de cor do arquivo passa por um token. Tem os oito estados nos controles (`.ac-btn`, `.ac-input`, `.ac-switch`, `.ac-chip`), anel de foco sempre visível em `:focus-visible`, `prefers-reduced-motion`, alvos de toque de 44 px em `pointer: coarse` e grids com `minmax(0,1fr)`, para um e-mail longo não estourar o layout.

Dois conflitos com o `style.css` global ficam documentados no próprio arquivo: o app aplica `margin-left` a todo `<main>` (a área do formulário de login é um `<main>`), e pinta todo `input:disabled` com `!important` (o que apagava a chave desabilitada).

## 8. Testes

`tests/test_auth.py` chama `server.app` com um environ falso (o mesmo padrão de `test_ofertas.py`) e liga `server.AUTH = True` só na classe `AuthTests`:

| Teste | O que garante |
|---|---|
| `test_without_session_api_is_401_and_page_redirects` | 401 na API, 302 em `/`, `login.html` público, `/api/info` sem dados internos |
| `test_legacy_data_goes_to_first_superadmin` | herança dos dados com `owner NULL` |
| `test_invite_is_single_use_and_login_works` | convite de uso único, e-mail normalizado, `me`, logout invalida a sessão |
| `test_five_wrong_passwords_lock_the_email` | bloqueio na 6ª tentativa, mesmo com a senha certa |
| `test_role_limits_tools` | cargo só com `offers`: 403 em jobs/vector/admin, 200 no Histórico, `info.modules == ['offers']` |
| `test_users_only_see_their_own_jobs_and_orders` | A não vê nem abre o job ou pedido de B (`Não encontrado.`), inclusive em `/api/rename` |
| `test_superadmin_rules` | não remove o último superadmin; não-superadmin não se promove; desativar derruba a sessão; cargo em uso não é excluído |
| `test_password_reset_link` | só superadmin gera o link; senha antiga deixa de valer, sessões antigas caem, uso único, usuário desativado é recusado |
| `test_my_account` | `me` traz cargo e sessões; nome validado; senha atual errada é recusada; trocar senha derruba só os outros aparelhos; "sair dos outros"; sem login dá 401 |
| `test_history_is_linked_to_user_and_tool` | eventos gravam dono e ferramenta (imagem, vídeo e Ofertas fora da requisição); "apagar tudo" só esconde |
| `test_invite_link_from_admin` | link montado com esquema e host da requisição |
| `LocalModeTests` | `AUTH` desligado: tudo aberto como antes |

Uma invariante que o teste deixa visível: na suíte completa (`unittest discover`), todos os módulos de teste dividem o mesmo banco no processo (o `INDOOR_DATA` do primeiro import vence). Por isso o teste de herança verifica `assertIn('legado', ...)` e "não sobrou `owner NULL`", em vez de uma lista exata.

Verificação manual feita: o servidor rodou com `INDOOR_AUTH=1`, o convite saiu pelo CLI e o fluxo foi exercitado por `curl` (incluindo o `Set-Cookie` com e sem `X-Forwarded-Proto`). Depois, o Chromium headless (Playwright) fez login, criou um convite pela tela, completou o cadastro numa segunda sessão, conferiu que o usuário só de Ofertas vê apenas "Ofertas" e "Histórico" e testou "Sair". Nenhum erro de JS.

## 9. Lacunas conhecidas

1. **A redefinição de senha depende do superadmin** (seção 4.4.1). Não há "esqueci a senha" self-service na tela de login, porque o sistema não envia e-mail. Um usuário logado também não troca a própria senha sem pedir um link.
2. **Arquivos servidos por id não checam o dono**: `/media/<id>`, `/video/<id>`, `/audio/<id>`, `/logo/<id>`, `/ofertas/video/<id>`, `/ofertas/preview/<pedido>/…`, `/ofertas/encarte/<id>/<n>.png`. Eles exigem login e a ferramenta certa, mas não o dono. Os ids são uuid4 (128 bits) e só vazam se alguém compartilhar a URL. O mesmo vale para os tokens de `/api/export-progress`, `/api/export-cancel` e `/api/entrega`.
3. **A mensagem de "imagem em uso" vaza títulos de outros usuários.** Em `apagar_imagem` (`modules/ofertas/__init__.py:502`), a Biblioteca é compartilhada, mas a consulta de "em uso" procura pedidos e encartes **de todos** e cita os títulos na mensagem de erro.
4. **O bloqueio de tentativas é por e-mail e em memória.** Ele zera ao reiniciar e permite que alguém **bloqueie** a conta de outra pessoa errando a senha dela 5 vezes (o bloqueio dura 15 min). Não há limite por IP.
5. **O superadmin não vê os dados dos outros.** Foi uma decisão ("só gerencia acesso"), mas significa que, quando alguém sai da empresa, os pedidos dessa pessoa ficam inacessíveis: não há transferência de dono.
6. **Templates de Ofertas podem ser publicados e removidos por qualquer usuário com Ofertas.** Eles são compartilhados, então um usuário pode remover o template que outros usam. Pode merecer um cargo ou permissão própria.
7. **Só `baseRequest` (`app.js`) redireciona em 401.** Os `fetch` diretos em `ofertas.js`, `vector.js`, `eap.js` e nos uploads mostram o toast "Faça login." sem redirecionar. Recarregar a página leva ao login.
8. **`roles.modules` aceita qualquer string.** Os ids não são validados contra `MODULES` ao salvar, só filtrados na leitura (`allowed`). Não quebra nada, mas um id errado fica guardado em silêncio.
9. **O mapa botão → ferramenta existe em dois lugares**: `TOOLS` (servidor) e `applyAccess` (cliente). Uma ferramenta nova precisa entrar nos dois, além de `ADMIN_TOOLS` em `admin.js` (os nomes exibidos).
10. **O link do convite usa o `Host` da requisição.** Com `INDOOR_ALLOWED_HOSTS="*"`, um `Host` arbitrário seria aceito. Na prática quem gera o convite é o navegador do superadmin, que manda o host real, mas fixar a URL pública (como o CLI já faz com `INDOOR_PUBLIC_URL`) seria mais robusto.
11. **Teste pré-existente quebrado:** `tests/test_desktop_paths.py` (arquivo não versionado) falha com `KeyError: 'PORTABLE_ROOT'`, com ou sem esta mudança (conferido com `git stash`).
