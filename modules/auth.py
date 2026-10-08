"""Login, cargos e convites. Só vale no servidor (INDOOR_AUTH=1); no app local não há login.
Cargo = conjunto de ferramentas (ids de MODULES). Superadmin é um booleano do usuário: vê todas as
ferramentas e é o único que gerencia cargos, convites e usuários."""
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from storage import connect, now, uid

COOKIE = 'indoor_sessao'
SESSAO_DIAS, CONVITE_DIAS = 30, 7
EMAIL = re.compile(r'[^@\s]+@[^@\s]+\.[^@\s]+')
class Denied(Exception):
    """401 sem login, 403 sem permissão."""
    def __init__(self, message, status='403 Forbidden'): super().__init__(message); self.status = status

FALHAS, FALHAS_LOCK = {}, threading.Lock()  # ponytail: tentativas em memória, zeram ao reiniciar o servidor

def init():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, modules TEXT NOT NULL DEFAULT '[]');
        CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL,
            role TEXT, superadmin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created TEXT);
        CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT, superadmin INTEGER NOT NULL DEFAULT 0,
            created TEXT, expires TEXT, used TEXT);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL, expires TEXT);
        ''')
        # convite com `user` preenchido = link de redefinição de senha de um usuário que já existe
        if 'user' not in {c[1] for c in db.execute('PRAGMA table_info(invites)')}:
            db.execute('ALTER TABLE invites ADD COLUMN user TEXT')

def digest(token): return hashlib.sha256(token.encode()).hexdigest()
def later(days): return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

def hash_password(senha):
    salt = secrets.token_bytes(16)
    return salt.hex() + '$' + hashlib.scrypt(senha.encode(), salt=salt, n=2**14, r=8, p=1).hex()

def check_password(senha, guardado):
    salt, h = guardado.split('$')
    return hmac.compare_digest(hashlib.scrypt(senha.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex(), h)

def allowed(user, modules):
    """Ids de ferramentas que o usuário abre. `modules` = MODULES do server.py."""
    ativos = [m['id'] for m in modules if m['active']]
    if user['superadmin']: return ativos
    with connect() as db: row = db.execute('SELECT modules FROM roles WHERE id=?', (user['role'],)).fetchone()
    return [m for m in json.loads(row['modules']) if m in ativos] if row else []

def session_token(environ):
    return dict(c.strip().split('=', 1) for c in environ.get('HTTP_COOKIE', '').split(';') if '=' in c).get(COOKIE, '')

def user_from(environ):
    token = session_token(environ)
    if not token: return None
    with connect() as db:
        row = db.execute('''SELECT users.* FROM sessions JOIN users ON users.id=sessions.user
                            WHERE sessions.token=? AND sessions.expires>? AND users.active=1''', (digest(token), now())).fetchone()
    return dict(row) | {'password': None} if row else None

def public(user): return {k: user[k] for k in ('id', 'email', 'name', 'role', 'superadmin', 'active')}

def scheme(environ):
    """https atrás do Caddy: o waitress aplica o X-Forwarded-Proto quando INDOOR_TRUSTED_PROXY está definido."""
    return 'https' if environ.get('wsgi.url_scheme') == 'https' else 'http'

def cookie(environ, token, dias):
    secure = '; Secure' if scheme(environ) == 'https' else ''
    return ('Set-Cookie', f'{COOKIE}={token}; Path=/; Max-Age={dias * 86400}; HttpOnly; SameSite=Lax{secure}')

def new_session(db, user_id, environ):
    token = secrets.token_urlsafe(32)
    db.execute('DELETE FROM sessions WHERE expires<?', (now(),))
    db.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), user_id, later(SESSAO_DIAS)))
    return cookie(environ, token, SESSAO_DIAS)

def create_invite(email, role=None, superadmin=False):
    email = str(email or '').strip().lower()
    if not EMAIL.fullmatch(email): raise ValueError('Informe um e-mail válido.')
    token = secrets.token_urlsafe(32)
    with connect() as db:
        if db.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone(): raise ValueError('Já existe um usuário com este e-mail.')
        if not superadmin and not db.execute('SELECT 1 FROM roles WHERE id=?', (role,)).fetchone(): raise ValueError('Escolha um cargo.')
        db.execute('DELETE FROM invites WHERE email=? AND used IS NULL', (email,))  # convite novo substitui o anterior
        db.execute('INSERT INTO invites VALUES(?,?,?,?,?,?,NULL,NULL)', (digest(token), email, None if superadmin else role, int(bool(superadmin)), now(), later(CONVITE_DIAS)))
    return token

def create_reset(user_id):
    """Link para um usuário existente definir uma senha nova (esqueceu ou nunca trocou). Uso único, 7 dias."""
    token = secrets.token_urlsafe(32)
    with connect() as db:
        row = db.execute('SELECT email, active FROM users WHERE id=?', (user_id,)).fetchone()
        if not row: raise ValueError('Usuário não encontrado.')
        if not row['active']: raise ValueError('Reative o usuário antes de redefinir a senha.')
        db.execute('DELETE FROM invites WHERE user=? AND used IS NULL', (user_id,))  # link novo substitui o anterior
        db.execute('INSERT INTO invites VALUES(?,?,NULL,0,?,?,NULL,?)', (digest(token), row['email'], now(), later(CONVITE_DIAS), user_id))
    return token

def invite(db, token):
    row = db.execute('SELECT * FROM invites WHERE token=? AND used IS NULL AND expires>?', (digest(str(token or '')), now())).fetchone()
    if not row: raise ValueError('Convite inválido, expirado ou já usado. Peça um novo ao administrador.')
    return row

def valid_name(name):
    name = str(name or '').strip()
    if not 1 <= len(name) <= 90: raise ValueError('Informe seu nome (até 90 caracteres).')
    return name

def password_ok(senha):
    if not isinstance(senha, str) or not 8 <= len(senha) <= 200: raise ValueError('A senha precisa ter de 8 a 200 caracteres.')
    return senha

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

def api(method, path, query, value, user, environ):
    """-> (resultado, cabeçalhos extras). /api/auth/* e /api/admin/*."""
    q = lambda k: query.get(k, [''])[0]
    if path == '/api/auth/login' and method == 'POST':
        result, header = login(value.get('email'), value.get('password'), environ)
        return result, [header]
    if path == '/api/auth/logout' and method == 'POST':
        with connect() as db: db.execute('DELETE FROM sessions WHERE token=?', (digest(session_token(environ)),))
        return {'ok': True}, [cookie(environ, '', 0)]
    if path == '/api/auth/convite' and method == 'GET':
        with connect() as db:
            row = invite(db, q('token'))
            role = db.execute('SELECT name FROM roles WHERE id=?', (row['role'],)).fetchone()
        if row['user']: return {'email': row['email'], 'reset': True}, []
        return {'email': row['email'], 'role': 'Superadmin' if row['superadmin'] else role['name'] if role else '', 'reset': False}, []
    if path == '/api/auth/cadastro' and method == 'POST':
        senha = password_ok(value.get('password'))
        with connect() as db:
            row = invite(db, value.get('token'))
            if row['user']:  # redefinição: troca a senha e derruba as sessões antigas (outro aparelho, quem sabia a senha)
                db.execute('UPDATE users SET password=? WHERE id=? AND active=1', (hash_password(senha), row['user']))
                db.execute('UPDATE invites SET used=? WHERE token=?', (now(), row['token']))
                db.execute('DELETE FROM sessions WHERE user=?', (row['user'],))
                with FALHAS_LOCK: FALHAS.pop(row['email'], None)
                header = new_session(db, row['user'], environ)
                return public(db.execute('SELECT * FROM users WHERE id=?', (row['user'],)).fetchone()), [header]
            name = valid_name(value.get('name'))
            primeiro = row['superadmin'] and not db.execute('SELECT 1 FROM users WHERE superadmin=1').fetchone()
            ident = uid()
            db.execute('INSERT INTO users VALUES(?,?,?,?,?,?,1,?)', (ident, row['email'], name, hash_password(senha), row['role'], row['superadmin'], now()))
            db.execute('UPDATE invites SET used=? WHERE token=?', (now(), row['token']))
            if primeiro:  # o que foi feito antes do login existir passa a ser do primeiro superadmin
                for table in ('jobs', 'events', 'ofertas_pedidos', 'ofertas_renders', 'ofertas_encartes'):
                    if 'owner' in {c[1] for c in db.execute(f'PRAGMA table_info({table})')}:
                        db.execute(f'UPDATE {table} SET owner=? WHERE owner IS NULL', (ident,))
            header = new_session(db, ident, environ)
            return public(db.execute('SELECT * FROM users WHERE id=?', (ident,)).fetchone()), [header]
    if not user: raise Denied('Faça login.', '401 Unauthorized')
    if path == '/api/auth/me':
        with connect() as db:
            role = db.execute('SELECT name FROM roles WHERE id=?', (user['role'],)).fetchone()
            sessions = db.execute('SELECT count(*) FROM sessions WHERE user=? AND expires>?', (user['id'], now())).fetchone()[0]
        return public(user) | {'roleName': role['name'] if role else None, 'created': user['created'], 'sessions': sessions}, []
    if method == 'POST' and path in ('/api/auth/perfil', '/api/auth/senha', '/api/auth/sair-outros'):
        return account(path, value, user, environ), []
    if not path.startswith('/api/admin/'): raise ValueError('Operação não encontrada.')
    if not user['superadmin']: raise Denied('Só superadmins gerenciam o acesso.')
    return admin(method, path, value, environ), []

def account(path, value, user, environ):
    """Minha conta: o próprio usuário muda nome e senha e encerra as outras sessões."""
    atual = digest(session_token(environ))
    with connect() as db:
        if path == '/api/auth/perfil':
            db.execute('UPDATE users SET name=? WHERE id=?', (valid_name(value.get('name')), user['id']))
            return public(db.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone())
        if path == '/api/auth/senha':
            nova = password_ok(value.get('nova'))
            with FALHAS_LOCK:  # mesmo limite do login: a senha atual não pode ser adivinhada por aqui
                if len([t for t in FALHAS.get(user['email'], []) if t > time.time() - 900]) >= 5:
                    raise ValueError('Muitas tentativas. Aguarde 15 minutos e tente de novo.')
            guardada = db.execute('SELECT password FROM users WHERE id=?', (user['id'],)).fetchone()['password']
            if not check_password(str(value.get('atual') or ''), guardada):
                with FALHAS_LOCK: FALHAS.setdefault(user['email'], []).append(time.time())
                raise ValueError('A senha atual não confere.')
            db.execute('UPDATE users SET password=? WHERE id=?', (hash_password(nova), user['id']))
        # senha nova ou "sair dos outros aparelhos": fica só esta sessão
        removed = db.execute('DELETE FROM sessions WHERE user=? AND token<>?', (user['id'], atual)).rowcount
        return {'ok': True, 'removed': removed}

def admin(method, path, value, environ):
    with connect() as db:
        if path == '/api/admin/dados' and method == 'GET':
            return {'roles': [dict(r) | {'modules': json.loads(r['modules'])} for r in db.execute('SELECT * FROM roles ORDER BY name')],
                    'users': [public(r) for r in db.execute('SELECT * FROM users ORDER BY name')],
                    'invites': [{k: r[k] for k in ('email', 'role', 'superadmin', 'expires')} for r in
                                db.execute('SELECT * FROM invites WHERE used IS NULL AND user IS NULL AND expires>? ORDER BY created DESC', (now(),))]}
        if method != 'POST': raise ValueError('Operação não encontrada.')
        if path == '/api/admin/cargo-salvar':
            name = str(value.get('name') or '').strip()
            if not 1 <= len(name) <= 60: raise ValueError('Dê um nome ao cargo (até 60 caracteres).')
            modules = [str(m) for m in value.get('modules') or []]
            ident = value.get('id') or uid()
            db.execute('INSERT INTO roles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, modules=excluded.modules',
                       (ident, name, json.dumps(modules)))
            return {'id': ident}
        if path == '/api/admin/cargo-excluir':
            if db.execute('SELECT 1 FROM users WHERE role=? UNION SELECT 1 FROM invites WHERE role=? AND used IS NULL', (value.get('id'),) * 2).fetchone():
                raise ValueError('Há usuários ou convites com este cargo. Troque o cargo deles antes de excluir.')
            db.execute('DELETE FROM roles WHERE id=?', (value.get('id'),))
            return {'ok': True}
        if path == '/api/admin/convite-revogar':
            db.execute('DELETE FROM invites WHERE email=? AND used IS NULL AND user IS NULL', (value.get('email'),))
            return {'ok': True}
        if path == '/api/admin/usuario-salvar':
            row = db.execute('SELECT * FROM users WHERE id=?', (value.get('id'),)).fetchone()
            if not row: raise ValueError('Usuário não encontrado.')
            role = value.get('role', row['role'])
            superadmin = int(bool(value.get('superadmin', row['superadmin'])))
            active = int(bool(value.get('active', row['active'])))
            if role and not db.execute('SELECT 1 FROM roles WHERE id=?', (role,)).fetchone(): raise ValueError('Cargo inválido.')
            if row['superadmin'] and row['active'] and not (superadmin and active) and \
                    db.execute('SELECT count(*) FROM users WHERE superadmin=1 AND active=1').fetchone()[0] <= 1:
                raise ValueError('Este é o último superadmin ativo. Promova outra pessoa antes.')
            db.execute('UPDATE users SET role=?, superadmin=?, active=? WHERE id=?', (role, superadmin, active, row['id']))
            if not active: db.execute('DELETE FROM sessions WHERE user=?', (row['id'],))
            return {'ok': True}
    if path in ('/api/admin/convite', '/api/admin/redefinir-senha'):
        token = create_invite(value.get('email'), value.get('role'), value.get('superadmin')) if path.endswith('convite') else create_reset(value.get('id'))
        return {'link': f"{scheme(environ)}://{environ.get('HTTP_HOST')}/login.html?convite={token}"}
    raise ValueError('Operação não encontrada.')
