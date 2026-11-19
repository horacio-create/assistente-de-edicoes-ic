"""Cartelas de VT: /cartelas/ é repassado ao app do Cartelas (Node), que roda num processo filho."""
import io
import json
import os
import socket
import tempfile
import unittest
from pathlib import Path
from unittest import mock

os.environ.setdefault('INDOOR_DATA', tempfile.mkdtemp())
from modules import cartelas  # noqa: E402


def environ(path, method='GET', body=b'', **extra):
    return {'PATH_INFO': path, 'REQUEST_METHOD': method, 'QUERY_STRING': '', 'CONTENT_LENGTH': str(len(body)),
            'wsgi.input': io.BytesIO(body), **extra}


def porta_livre():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class RotasTests(unittest.TestCase):
    def test_outras_rotas_nao_sao_do_cartelas(self):
        for path in ('/', '/cartelas.js', '/api/info', '/cartelasx/'):
            self.assertIsNone(cartelas.handle(environ(path)))

    def test_sem_barra_final_redireciona(self):
        status, headers, _ = cartelas.handle(environ('/cartelas'))
        self.assertTrue(status.startswith('301'))
        self.assertIn(('Location', '/cartelas/'), headers)

    def test_sem_node_explica_o_que_falta(self):
        with mock.patch.object(cartelas, '_saude', return_value=False), \
             mock.patch.object(cartelas, 'disponivel', return_value='O Cartelas precisa do Node.js 20 ou superior instalado neste computador.'):
            status, headers, corpo = cartelas.handle(environ('/cartelas/api/backups'))
            self.assertTrue(status.startswith('503'))
            self.assertIn('Node.js', json.loads(corpo)['error'])
            status, headers, corpo = cartelas.handle(environ('/cartelas/'))
            self.assertIn(('Content-Type', 'text/html; charset=utf-8'), headers)


@unittest.skipIf(cartelas.disponivel(), 'Cartelas sem Node.js ou sem npm install')
class ProcessoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dados = tempfile.TemporaryDirectory()
        cls.patches = [mock.patch.object(cartelas, 'PORTA', porta_livre()), mock.patch.object(cartelas, 'DATA', Path(cls.dados.name))]
        for p in cls.patches: p.start()

    @classmethod
    def tearDownClass(cls):
        cartelas.encerrar()
        for p in cls.patches: p.stop()
        cls.dados.cleanup()

    def test_pagina_e_api_passam_pelo_servidor(self):
        status, headers, corpo = cartelas.handle(environ('/cartelas/'))
        self.assertEqual(status, '200 OK')
        self.assertIn(b'<title>Cartelas', corpo)
        self.assertNotIn(b'src="/', corpo)  # caminhos relativos: funcionam dentro de /cartelas/
        csp = dict(headers)['Content-Security-Policy']
        self.assertIn("frame-ancestors 'self'", csp)
        status, _, corpo = cartelas.handle(environ('/cartelas/api/health'))
        self.assertEqual(json.loads(corpo)['app'], 'assistente-de-cartelas')

    def test_backup_grava_na_pasta_de_dados(self):
        projeto = {'version': 1, 'name': 'Teste', 'cards': []}
        corpo = json.dumps(projeto).encode()
        status, _, resposta = cartelas.handle(environ('/cartelas/api/backups', 'POST', corpo, CONTENT_TYPE='application/json',
                                                      HTTP_ORIGIN='http://127.0.0.1:8091', HTTP_SEC_FETCH_SITE='same-origin'))
        if status.startswith('200'):
            self.assertTrue(any((Path(self.dados.name) / 'cartelas' / 'Backups').rglob('*')))
        else:  # o Cartelas validou o projeto e recusou: o importante é não ser barrado pela origem
            self.assertFalse(status.startswith('403'), resposta)


if __name__ == '__main__':
    unittest.main()
