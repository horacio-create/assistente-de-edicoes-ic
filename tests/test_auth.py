import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-auth-')
os.environ['INDOOR_DATA'] = str(Path(SANDBOX.name) / 'data')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from modules import auth  # noqa: E402
from modules import ofertas  # noqa: E402
from storage import init, connect, now  # noqa: E402

init()
auth.init()
ofertas.garantir()


def call(method, path, body=None, cookie=None):
    data = json.dumps(body).encode() if body is not None else b''
    path, _, qs = path.partition('?')
    env = {'REQUEST_METHOD': method, 'PATH_INFO': path, 'QUERY_STRING': qs, 'HTTP_HOST': 'localhost:8080',
           'CONTENT_LENGTH': str(len(data)), 'wsgi.input': io.BytesIO(data), 'HTTP_X_INDOOR': '1',
           **({'HTTP_COOKIE': cookie} if cookie else {})}
    out = {}
    raw = b''.join(server.app(env, lambda s, h: out.update(status=s, headers=dict(h))))
    return int(out['status'][:3]), (json.loads(raw) if raw and out['headers'].get('Content-Type', '').startswith('application/json') else raw), out['headers']


def session(headers): return headers['Set-Cookie'].split(';')[0]


def signup(email, name='Pessoa', role=None, superadmin=False):
    token = auth.create_invite(email, role, superadmin)
    status, user, headers = call('POST', '/api/auth/cadastro', {'token': token, 'name': name, 'password': 'senha-forte'})
    assert status == 200, user
    return user, session(headers)


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.AUTH = True
        with connect() as db:  # trabalho feito antes do login existir: vai para o primeiro superadmin
            db.execute("INSERT INTO jobs(id,title,updated,meta) VALUES('legado','Antigo',?,'{}')", (now(),))
        cls.admin, cls.admin_cookie = signup('chefe@x.com', 'Chefe', superadmin=True)
        status, role, _ = call('POST', '/api/admin/cargo-salvar', {'name': 'Ofertas', 'modules': ['offers']}, cls.admin_cookie)
        assert status == 200
        cls.role = role['id']

    @classmethod
    def tearDownClass(cls): server.AUTH = False

    def test_without_session_api_is_401_and_page_redirects(self):
        self.assertEqual(call('GET', '/api/jobs')[0], 401)
        status, _, headers = call('GET', '/')
        self.assertEqual((status, headers['Location']), (302, '/login.html'))
        self.assertEqual(call('GET', '/login.html')[0], 200)
        self.assertEqual(call('GET', '/api/info')[1], {'version': server.VERSION, 'auth': True, 'user': None})

    def test_legacy_data_goes_to_first_superadmin(self):
        status, jobs, _ = call('GET', '/api/jobs', cookie=self.admin_cookie)
        self.assertEqual(status, 200)
        self.assertIn('legado', [j['id'] for j in jobs])
        with connect() as db: self.assertIsNone(db.execute('SELECT 1 FROM jobs WHERE owner IS NULL').fetchone())

    def test_invite_is_single_use_and_login_works(self):
        token = auth.create_invite('uso@x.com', self.role)
        self.assertEqual(call('GET', '/api/auth/convite?token=' + token)[1], {'email': 'uso@x.com', 'role': 'Ofertas', 'reset': False})
        self.assertEqual(call('POST', '/api/auth/cadastro', {'token': token, 'name': 'Uso', 'password': 'senha-forte'})[0], 200)
        self.assertEqual(call('POST', '/api/auth/cadastro', {'token': token, 'name': 'Uso', 'password': 'senha-forte'})[0], 400)
        status, user, headers = call('POST', '/api/auth/login', {'email': 'USO@x.com ', 'password': 'senha-forte'})
        self.assertEqual((status, user['email']), (200, 'uso@x.com'))
        self.assertEqual(call('GET', '/api/auth/me', cookie=session(headers))[1]['name'], 'Uso')
        self.assertEqual(call('POST', '/api/auth/logout', {}, session(headers))[0], 200)
        self.assertEqual(call('GET', '/api/auth/me', cookie=session(headers))[0], 401)

    def test_five_wrong_passwords_lock_the_email(self):
        signup('trava@x.com', role=self.role)
        for _ in range(5):
            self.assertEqual(call('POST', '/api/auth/login', {'email': 'trava@x.com', 'password': 'errada'})[1]['error'], 'E-mail ou senha incorretos.')
        status, body, _ = call('POST', '/api/auth/login', {'email': 'trava@x.com', 'password': 'senha-forte'})
        self.assertIn('Muitas tentativas', body['error'])

    def test_role_limits_tools(self):
        _, cookie = signup('ofertas@x.com', role=self.role)
        self.assertEqual(call('GET', '/api/jobs', cookie=cookie)[0], 403)
        self.assertEqual(call('POST', '/api/vector/trace', {}, cookie)[0], 403)
        self.assertEqual(call('GET', '/api/history', cookie=cookie)[0], 200)
        info = call('GET', '/api/info', cookie=cookie)[1]
        self.assertEqual([m['id'] for m in info['modules']], ['offers'])
        self.assertEqual(call('GET', '/api/admin/dados', cookie=cookie)[0], 403)

    def test_users_only_see_their_own_jobs_and_orders(self):
        role = call('POST', '/api/admin/cargo-salvar', {'name': 'Editor', 'modules': ['images', 'offers']}, self.admin_cookie)[1]['id']
        a, cookie_a = signup('a@x.com', role=role)
        _, cookie_b = signup('b@x.com', role=role)
        job = call('POST', '/api/jobs', {'kind': 'image'}, cookie_a)[1]
        self.assertEqual([j['id'] for j in call('GET', '/api/jobs', cookie=cookie_a)[1]], [job['id']])
        self.assertEqual(call('GET', '/api/jobs', cookie=cookie_b)[1], [])
        self.assertEqual(call('GET', '/api/job?id=' + job['id'], cookie=cookie_b)[1]['error'], 'Não encontrado.')
        self.assertEqual(call('POST', '/api/rename', {'id': job['id'], 'revision': 0, 'title': 'x'}, cookie_b)[1]['error'], 'Não encontrado.')
        self.assertEqual(call('GET', '/api/job?id=' + job['id'], cookie=cookie_a)[0], 200)
        self.assertEqual([e['action'] for e in call('GET', '/api/history', cookie=cookie_b)[1]], [])
        with connect() as db:
            db.execute("INSERT INTO ofertas_pedidos(id,template,titulo,dados,revision,criado,atualizado,owner) VALUES('p1','t','P','{}',0,?,?,?)", (now(), now(), a['id']))
        self.assertEqual(call('GET', '/api/ofertas/pedido?id=p1', cookie=cookie_b)[1]['error'], 'Não encontrado.')

    def test_superadmin_rules(self):
        status, body, _ = call('POST', '/api/admin/usuario-salvar', {'id': self.admin['id'], 'superadmin': False}, self.admin_cookie)
        self.assertEqual(status, 400)
        self.assertIn('último superadmin', body['error'])
        user, cookie = signup('sai@x.com', role=self.role)
        self.assertEqual(call('POST', '/api/admin/usuario-salvar', {'id': user['id'], 'superadmin': True}, cookie)[0], 403)
        self.assertEqual(call('POST', '/api/admin/usuario-salvar', {'id': user['id'], 'active': False}, self.admin_cookie)[0], 200)
        self.assertEqual(call('GET', '/api/auth/me', cookie=cookie)[0], 401)
        self.assertEqual(call('POST', '/api/admin/cargo-excluir', {'id': self.role}, self.admin_cookie)[0], 400)

    def test_password_reset_link(self):
        user, old_cookie = signup('esqueceu@x.com', role=self.role)
        self.assertEqual(call('POST', '/api/admin/redefinir-senha', {'id': user['id']}, old_cookie)[0], 403)
        status, body, _ = call('POST', '/api/admin/redefinir-senha', {'id': user['id']}, self.admin_cookie)
        token = body['link'].split('convite=')[1]
        self.assertEqual(call('GET', '/api/auth/convite?token=' + token)[1], {'email': 'esqueceu@x.com', 'reset': True})
        self.assertNotIn('esqueceu@x.com', [i['email'] for i in call('GET', '/api/admin/dados', cookie=self.admin_cookie)[1]['invites']])
        status, body, headers = call('POST', '/api/auth/cadastro', {'token': token, 'password': 'senha-nova-123'})
        self.assertEqual((status, body['id'], body['name']), (200, user['id'], 'Pessoa'))
        self.assertEqual(call('GET', '/api/auth/me', cookie=old_cookie)[0], 401)  # sessões antigas caem
        self.assertEqual(call('GET', '/api/auth/me', cookie=session(headers))[0], 200)
        self.assertEqual(call('POST', '/api/auth/login', {'email': 'esqueceu@x.com', 'password': 'senha-forte'})[0], 400)
        self.assertEqual(call('POST', '/api/auth/login', {'email': 'esqueceu@x.com', 'password': 'senha-nova-123'})[0], 200)
        self.assertEqual(call('POST', '/api/auth/cadastro', {'token': token, 'password': 'outra-senha-1'})[0], 400)  # uso único
        call('POST', '/api/admin/usuario-salvar', {'id': user['id'], 'active': False}, self.admin_cookie)
        self.assertIn('Reative', call('POST', '/api/admin/redefinir-senha', {'id': user['id']}, self.admin_cookie)[1]['error'])

    def test_my_account(self):
        user, cookie = signup('conta@x.com', 'Conta', role=self.role)
        other = session(call('POST', '/api/auth/login', {'email': 'conta@x.com', 'password': 'senha-forte'})[2])
        me = call('GET', '/api/auth/me', cookie=cookie)[1]
        self.assertEqual((me['roleName'], me['sessions']), ('Ofertas', 2))
        self.assertEqual(call('POST', '/api/auth/perfil', {'name': '  Conta Nova '}, cookie)[1]['name'], 'Conta Nova')
        self.assertEqual(call('POST', '/api/auth/perfil', {'name': ' '}, cookie)[0], 400)
        status, body, _ = call('POST', '/api/auth/senha', {'atual': 'errada', 'nova': 'outra-senha-1'}, cookie)
        self.assertEqual((status, body['error']), (400, 'A senha atual não confere.'))
        self.assertEqual(call('POST', '/api/auth/senha', {'atual': 'senha-forte', 'nova': 'outra-senha-1'}, cookie)[1], {'ok': True, 'removed': 1})
        self.assertEqual(call('GET', '/api/auth/me', cookie=other)[0], 401)   # outro aparelho caiu
        self.assertEqual(call('GET', '/api/auth/me', cookie=cookie)[0], 200)  # este continua
        self.assertEqual(call('POST', '/api/auth/login', {'email': 'conta@x.com', 'password': 'outra-senha-1'})[0], 200)
        self.assertEqual(call('POST', '/api/auth/sair-outros', {}, cookie)[1], {'ok': True, 'removed': 1})
        self.assertEqual(call('POST', '/api/auth/perfil', {'name': 'X'})[0], 401)

    def test_history_is_linked_to_user_and_tool(self):
        role = call('POST', '/api/admin/cargo-salvar', {'name': 'Relatório', 'modules': ['images', 'video', 'offers']}, self.admin_cookie)[1]['id']
        user, cookie = signup('relatorio@x.com', role=role)
        image = call('POST', '/api/jobs', {'kind': 'image'}, cookie)[1]
        video = call('POST', '/api/jobs', {'kind': 'video'}, cookie)[1]
        call('POST', '/api/rename', {'id': video['id'], 'revision': video['revision'], 'title': 'Vídeo do mês'}, cookie)
        with connect() as db: ofertas.registrar(db, 'Vídeo gerado', 'Teste', user['id'], render='r1')  # fila: fora da requisição
        with connect() as db:
            rows = [tuple(r) for r in db.execute('SELECT action, module FROM events WHERE owner=? ORDER BY id', (user['id'],))]
        self.assertEqual(rows, [('Trabalho criado', 'images'), ('Trabalho criado', 'video'), ('Edição renomeada', 'video'), ('Vídeo gerado', 'offers')])
        # "Apagar tudo" no Histórico só esconde da lista: o registro continua para os relatórios
        self.assertEqual(call('POST', '/api/history-delete', {'all': True}, cookie)[1]['count'], 4)
        self.assertEqual(call('GET', '/api/history', cookie=cookie)[1], [])
        with connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM events WHERE owner=? AND hidden=1', (user['id'],)).fetchone()[0], 4)

    def test_invite_link_from_admin(self):
        status, body, _ = call('POST', '/api/admin/convite', {'email': 'novo@x.com', 'role': self.role}, self.admin_cookie)
        self.assertEqual(status, 200)
        self.assertTrue(body['link'].startswith('http://localhost:8080/login.html?convite='))
        self.assertIn('novo@x.com', [i['email'] for i in call('GET', '/api/admin/dados', cookie=self.admin_cookie)[1]['invites']])


class LocalModeTests(unittest.TestCase):
    def test_without_auth_everything_stays_open(self):
        server.AUTH = False
        self.assertEqual(call('GET', '/api/jobs')[0], 200)
        self.assertEqual(call('GET', '/')[0], 200)


if __name__ == '__main__':
    unittest.main()
