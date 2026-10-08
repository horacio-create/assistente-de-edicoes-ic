"""Fila de exportações do editor (imagens, vídeos e montagens), em segundo plano e por ordem de chegada.

A exportação não depende mais da requisição: fechar a aba ou perder a conexão não a interrompe. O navegador
acompanha por /api/export-progress, que mostra a posição na fila e, no fim, o resultado (export_progress.result).
INDOOR_EXPORTS (deploy/compose.yaml) define quantas rodam ao mesmo tempo; é o mesmo número de vagas do
export_slot do server.py, então a fila e a exportação direta (testes) nunca passam desse total.
"""
import collections
import os
import threading

from modules import export_progress
from storage import USUARIO

WORKERS = max(1, int(os.environ.get('INDOOR_EXPORTS', '2')))
LOCK = threading.Condition()
PENDING = collections.deque()  # (token, run, usuário)
_workers = 0


def submit(token, name, run):
    """Coloca a exportação na fila e responde na hora. `run()` devolve o mesmo resultado do /api/export síncrono."""
    global _workers
    with LOCK:
        export_progress.queued(token, name)
        PENDING.append((token, run, USUARIO.get()))
        while _workers < WORKERS:  # as threads nascem no primeiro uso e ficam esperando trabalho
            threading.Thread(target=_worker, name=f'exportacao-{_workers}', daemon=True).start()
            _workers += 1
        LOCK.notify()
        return {'queued': True, 'token': token, 'position': len(PENDING)}


def position(token):
    """1 = a próxima a começar; 0 = não está esperando (já começou, terminou ou não existe)."""
    with LOCK:
        return next((n for n, item in enumerate(PENDING, 1) if item[0] == token), 0)


def _worker():
    while True:
        with LOCK:
            while not PENDING:
                LOCK.wait()
            token, run, user = PENDING.popleft()
        USUARIO.set(user)  # a thread é reaproveitada: o Histórico fica com o dono desta exportação
        try:
            export_progress.result(token, run())
        except Exception as exc:  # erro inesperado: o navegador recebe a mensagem em vez de esperar para sempre
            export_progress.fail(token, str(exc))
