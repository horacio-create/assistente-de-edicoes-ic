"""Cartelas de VT: o app do Cartelas (Node, pasta cartelas/) roda num processo filho e o servidor repassa /cartelas/ para ele.

O Cartelas guarda os trabalhos no navegador; em disco ficam só backups, entregas e capturas, em DATA/cartelas.
"""
import atexit
import http.client
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

from storage import DATA, ROOT

PASTA = ROOT / 'cartelas'
NODE = os.environ.get('CARTELAS_NODE') or os.environ.get('OFERTAS_NODE') or shutil.which('node') or 'node'
# 3211: não disputa a porta 3210 com o Cartelas aberto sozinho; a extensão do Chrome aceita qualquer porta
PORTA = int(os.environ.get('CARTELAS_PORT', '3211'))
PREFIXO = '/cartelas'
LIMITE = 64 * 1024 * 1024
_lock = threading.Lock()
_processo = None


def disponivel():
    """None quando o Cartelas pode rodar; senão, o que falta (mensagem para a tela)."""
    if not (shutil.which(NODE) or Path(NODE).is_file()):
        return 'O Cartelas precisa do Node.js 20 ou superior instalado neste computador.'
    if not (PASTA / 'node_modules' / 'jsqr' / 'package.json').is_file():
        return 'As bibliotecas do Cartelas não foram instaladas. Rode o instalador de novo (npm install na pasta cartelas).'
    return None


def _saude():
    try:
        conn = http.client.HTTPConnection('127.0.0.1', PORTA, timeout=2)
        conn.request('GET', '/api/health', headers={'Host': f'127.0.0.1:{PORTA}'})
        resposta = conn.getresponse()
        return resposta.status == 200 and json.loads(resposta.read()).get('app') == 'assistente-de-cartelas'
    except (OSError, ValueError):
        return False
    finally:
        conn.close()


def garantir():
    """Inicia o processo do Cartelas, se ainda não estiver no ar."""
    global _processo
    with _lock:
        if _processo and _processo.poll() is None and _saude():
            return
        if _saude():  # outro servidor do Assistente já iniciou (ou sobrou de uma execução anterior)
            return
        falta = disponivel()
        if falta:
            raise RuntimeError(falta)
        dados = DATA / 'cartelas'
        dados.mkdir(parents=True, exist_ok=True)
        env = {**os.environ, 'CARTELAS_PORT': str(PORTA), 'CARTELAS_DATA': str(dados)}
        extra = {'creationflags': subprocess.CREATE_NO_WINDOW} if sys.platform == 'win32' else {}
        _processo = subprocess.Popen([NODE, str(PASTA / 'server.mjs')], cwd=PASTA, env=env,
                                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **extra)
        limite = time.monotonic() + 15
        while time.monotonic() < limite:
            if _processo.poll() is not None:
                raise RuntimeError('O Cartelas não iniciou. Confira se a porta %d está livre.' % PORTA)
            if _saude():
                return
            time.sleep(.2)
        raise RuntimeError('O Cartelas demorou demais para iniciar.')


def _erro(status, mensagem, html=False):
    if html:
        corpo = ('<!doctype html><meta charset="utf-8"><title>Cartelas</title>'
                 '<body style="font-family:system-ui,sans-serif;padding:32px;color:#334">'
                 f'<h2>Cartelas indisponível</h2><p>{mensagem}</p></body>').encode()
        return status, [('Content-Type', 'text/html; charset=utf-8'), ('Content-Length', str(len(corpo))), ('Cache-Control', 'no-store')], corpo
    corpo = json.dumps({'error': mensagem}, ensure_ascii=False).encode()
    return status, [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(corpo))), ('Cache-Control', 'no-store')], corpo


def handle(environ):
    """Repassa /cartelas/* ao Cartelas. Origem e host já foram conferidos pelo servidor."""
    path = environ['PATH_INFO']
    if path != PREFIXO and not path.startswith(PREFIXO + '/'):
        return None
    if path == PREFIXO:  # sem a barra final os caminhos relativos da página quebrariam
        return '301 Moved Permanently', [('Location', PREFIXO + '/'), ('Content-Length', '0')], b''
    destino = path[len(PREFIXO):] or '/'
    if environ.get('QUERY_STRING'):
        destino += '?' + environ['QUERY_STRING']
    pagina = not destino.startswith('/api/')
    try:
        garantir()
    except RuntimeError as e:
        return _erro('503 Service Unavailable', str(e), pagina)
    metodo = environ['REQUEST_METHOD']
    tamanho = int(environ.get('CONTENT_LENGTH') or 0)
    if tamanho > LIMITE:
        return _erro('413 Payload Too Large', 'Envio grande demais para o Cartelas.')
    corpo = environ['wsgi.input'].read(tamanho) if tamanho else None
    base = f'127.0.0.1:{PORTA}'
    cabecalhos = {'Host': base}
    for nome in ('CONTENT_TYPE', 'HTTP_ACCEPT', 'HTTP_SEC_FETCH_SITE', 'HTTP_RANGE'):
        if environ.get(nome):
            cabecalhos[nome.removeprefix('HTTP_').replace('_', '-').title()] = environ[nome]
    if environ.get('HTTP_ORIGIN'):  # o servidor já recusou origens de fora; para o Cartelas, é ele mesmo
        cabecalhos['Origin'] = 'http://' + base
    try:
        conn = http.client.HTTPConnection('127.0.0.1', PORTA, timeout=330)
        conn.request(metodo, destino, body=corpo, headers=cabecalhos)
        resposta = conn.getresponse()
        dados = resposta.read()
        conn.close()
    except OSError:
        return _erro('502 Bad Gateway', 'Não foi possível falar com o Cartelas. Recarregue a página.', pagina)
    passar = ('content-type', 'content-disposition', 'content-security-policy', 'x-content-type-options',
              'referrer-policy', 'cache-control', 'content-range', 'accept-ranges')
    headers = [(k, v) for k, v in resposta.getheaders() if k.lower() in passar]
    headers.append(('Content-Length', str(len(dados))))
    return f'{resposta.status} {resposta.reason}', headers, dados


def encerrar():
    if _processo and _processo.poll() is None:
        _processo.terminate()


atexit.register(encerrar)
