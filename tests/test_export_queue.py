import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-fila-')
os.environ['INDOOR_DATA'] = str(Path(SANDBOX.name) / 'data')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image  # noqa: E402
import server  # noqa: E402
from modules import export_progress, export_queue, ofertas  # noqa: E402
from storage import USUARIO, connect, init, now, uid  # noqa: E402

init()
ofertas.garantir()


def api(path, data=None, method='POST', query=None, raw=None, background=False, fila=True):
    if background and fila and path == '/api/export': data = {**(data or {}), 'fila': 1}  # como o navegador atual
    return server.api(method, path, query or {}, raw if raw is not None else json.dumps(data or {}).encode(), background=background)


def png():
    raw = io.BytesIO(); Image.new('RGB', (320, 180), '#2e7d32').save(raw, 'PNG'); return raw.getvalue()


def wait_result(token, seconds=30):
    limit = time.time() + seconds
    while time.time() < limit:
        state = export_progress.get(token)
        if state and 'result' in state: return state
        time.sleep(.05)
    raise AssertionError('a exportação não terminou')


class ExportQueueTests(unittest.TestCase):
    def setUp(self):
        self.job = api('/api/jobs')
        self.job = api('/api/upload', query={'job': [self.job['id']], 'revision': ['0'], 'name': ['arte.png']}, raw=png())['job']
        self.folder = Path(SANDBOX.name) / uid(); self.folder.mkdir()

    def plan(self):
        return api('/api/plan', dict(job=self.job['id'], ids=[m['id'] for m in self.job['media']], client='Cliente',
                                     campaign='Campanha', date='2026-10-08', format='jpg', folder=str(self.folder)))

    def test_web_export_returns_at_once_and_result_arrives_through_progress(self):
        plan = self.plan()
        answer = api('/api/export', {'token': plan['token']}, background=True)
        self.assertEqual((answer['queued'], answer['token']), (True, plan['token']))
        state = wait_result(plan['token'])
        self.assertEqual(state['state'], 'complete')
        self.assertEqual([r['ok'] for r in state['result']['results']], [True])
        self.assertTrue((self.folder / plan['files'][0]['name']).is_file())

    def test_validation_errors_still_come_back_immediately(self):
        plan = self.plan()
        api('/api/export', {'token': plan['token']}, background=True)
        wait_result(plan['token'])
        again = self.plan()  # mesmo nome: agora o arquivo existe
        with self.assertRaises(server.Conflict):
            api('/api/export', {'token': again['token']}, background=True)

    def test_queue_order_position_and_cancel_before_start(self):
        gate = threading.Event()
        # ocupa todas as threads da fila (as de testes anteriores também) com trabalhos travados
        busy = [f'ocupada-{n}' for n in range(max(export_queue.WORKERS, export_queue._workers))]
        for token in busy: export_queue.submit(token, 'travada', lambda: (gate.wait(10), {'results': [], 'cancelled': False})[1])
        time.sleep(.2)
        queued = self.plan()
        answer = api('/api/export', {'token': queued['token']}, background=True)
        progress = api('/api/export-progress', method='GET', query={'token': [queued['token']]})
        self.assertEqual((answer['queued'], progress['state'], progress['position']), (True, 'waiting', 1))
        self.assertEqual(api('/api/export-cancel', {'token': queued['token']}), {'accepted': True})
        gate.set()
        for token in busy: wait_result(token)
        cancelled = wait_result(queued['token'])
        self.assertTrue(cancelled['result']['cancelled'])
        self.assertEqual(cancelled['result']['results'], [])  # cancelada antes de começar: nada foi processado
        self.assertFalse((self.folder / queued['files'][0]['name']).exists())

    def test_history_of_background_export_keeps_its_owner(self):
        plan = self.plan()
        with connect() as db: db.execute("UPDATE jobs SET owner='dono-da-exportacao' WHERE id=?", (self.job['id'],))
        USUARIO.set({'id': 'dono-da-exportacao'})
        try:
            api('/api/export', {'token': plan['token']}, background=True)
        finally:
            USUARIO.set(None)
        wait_result(plan['token'])
        with connect() as db:
            owners = {r['owner'] for r in db.execute("SELECT owner FROM events WHERE job=? AND action='Exportado'", (self.job['id'],))}
        self.assertEqual(owners, {'dono-da-exportacao'})

    def test_tab_opened_before_the_queue_is_told_to_reload(self):
        plan = self.plan()
        with self.assertRaises(server.Conflict) as erro:
            api('/api/export', {'token': plan['token']}, background=True, fila=False)
        self.assertIn('Recarregue a página', str(erro.exception))
        # o plano não foi consumido: depois de recarregar, exportar funciona
        api('/api/export', {'token': plan['token']}, background=True)
        self.assertEqual(wait_result(plan['token'])['state'], 'complete')

    def test_network_delivery_folder_is_not_deleted_while_export_runs(self):
        entrega = uid()
        plan = api('/api/plan', dict(job=self.job['id'], ids=[m['id'] for m in self.job['media']], client='Cliente',
                                     campaign='Entrega', date='2026-10-08', format='jpg', folder='navegador:' + entrega))
        gate = threading.Event()
        original = server.run_export
        with patch.object(server, 'run_export', lambda *a: (gate.wait(10), original(*a))[1]):
            api('/api/export', {'token': plan['token']}, background=True)
            # o que a aba antiga fazia: limpar a pasta logo depois da resposta "na fila"
            self.assertEqual(api('/api/entrega-limpar', {'token': entrega}), {'ok': True, 'adiada': True})
            gate.set()
            state = wait_result(plan['token'])
        self.assertEqual([r['ok'] for r in state['result']['results']], [True])
        self.assertEqual(api('/api/entrega', method='GET', query={'token': [entrega]}), [plan['files'][0]['name']])
        self.assertEqual(api('/api/entrega-limpar', {'token': entrega}), {'ok': True})  # terminou: agora limpa
        self.assertFalse((server.ENTREGAS / entrega).exists())

    def test_unexpected_error_reaches_the_browser(self):
        plan = self.plan()
        with patch.object(server, 'run_export', side_effect=RuntimeError('disco cheio')):
            api('/api/export', {'token': plan['token']}, background=True)
            state = wait_result(plan['token'])
        self.assertEqual((state['state'], state['result']), ('failed', {'error': 'disco cheio'}))

    def test_preview_is_not_blocked_by_busy_exports(self):
        media = self.job['media'][0]
        taken = 0
        while server.EXPORTAR.acquire(blocking=False): taken += 1  # todas as vagas de exportação ocupadas
        try:
            done = threading.Event()
            threading.Thread(target=lambda: (api('/api/preview', {'id': media['id'], 'settings': media['settings']}), done.set()), daemon=True).start()
            self.assertTrue(done.wait(15), 'a prévia esperou a exportação')
        finally:
            for _ in range(taken): server.EXPORTAR.release()


class OfertasTests(unittest.TestCase):
    # Com o motor de Ofertas instalado (CI, servidor), a thread da fila roda de verdade neste processo. Os testes
    # seguram ofertas.LOCK (a mesma trava dela) e apagam os registros falsos antes de soltar: ela nunca os vê.
    def render(self, status, tentativas, dados=True, criado=None):
        ident = uid()
        if dados:
            (ofertas.PASTA / 'renders' / ident).mkdir(parents=True)
            (ofertas.PASTA / 'renders' / ident / 'dados.json').write_text('{}')
        with connect() as db:
            db.execute("INSERT INTO ofertas_renders(id,pedido,template,titulo,revision,status,criado,tentativas) VALUES(?,?,?,?,0,?,?,?)",
                       (ident, 'p', 't', 'Vídeo', status, criado or now(), tentativas))
        self.addCleanup(self.apagar, ident)
        return ident

    def apagar(self, ident):
        with connect() as db: db.execute('DELETE FROM ofertas_renders WHERE id=?', (ident,))

    def status(self, ident):
        with connect() as db: return tuple(db.execute('SELECT status, tentativas FROM ofertas_renders WHERE id=?', (ident,)).fetchone())

    def test_render_interrupted_by_restart_goes_back_to_queue_twice_at_most(self):
        with ofertas.LOCK:
            nova, ultima, esgotada = self.render('gerando', 0), self.render('gerando', 1), self.render('gerando', 2)
            sem_dados = self.render('gerando', 0, dados=False)
            with patch.object(ofertas, 'status', return_value={'pronto': False, 'motivo': ''}), patch.object(ofertas, '_iniciado', False):
                ofertas.garantir()  # o que roda ao subir o servidor
            self.assertEqual(self.status(nova), ('na_fila', 1))
            self.assertEqual(self.status(ultima), ('na_fila', 2))
            self.assertEqual(self.status(esgotada), ('interrompido', 2))
            self.assertEqual(self.status(sem_dados), ('interrompido', 0))
            for ident in (nova, ultima, esgotada, sem_dados): self.apagar(ident)

    def test_queue_thread_survives_a_render_that_cannot_start(self):
        with ofertas.LOCK, patch.object(ofertas, 'RENDERS_SIMULTANEOS', 99):
            quebrado = self.render('na_fila', 0, dados=False, criado='2000-01-01T00:00:00')  # o mais antigo: é o próximo
            self.assertTrue(ofertas.iniciar_proximo())  # antes, a thread morria aqui com FileNotFoundError
            with connect() as db: row = db.execute('SELECT status, erro FROM ofertas_renders WHERE id=?', (quebrado,)).fetchone()
            self.assertEqual(row['status'], 'falhou')
            self.assertIn('dados do pedido', row['erro'])
            self.apagar(quebrado)

    def test_background_removal_runs_one_at_a_time(self):
        ident = uid()
        with connect() as db:
            db.execute("INSERT INTO ofertas_imagens(id,nome,origem,largura,altura,transparente,criado) VALUES(?,?,?,1,1,0,?)", (ident, 'img', 'envio', now()))
        running, peak, lock = [0], [0], threading.Lock()
        def fake_run(*a, **k):
            with lock: running[0] += 1; peak[0] = max(peak[0], running[0])
            time.sleep(.2)
            with lock: running[0] -= 1
            return type('R', (), {'returncode': 1, 'stderr': b'falhou de proposito'})()
        with patch.object(ofertas.subprocess, 'run', fake_run):
            threads = [threading.Thread(target=lambda: self.assertRaises(ValueError, ofertas.remover_fundo, ident)) for _ in range(3)]
            for t in threads: t.start()
            for t in threads: t.join()
        self.assertEqual(peak[0], 1)


if __name__ == '__main__':
    unittest.main()
