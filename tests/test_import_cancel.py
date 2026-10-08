import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from test_workflow import api, sample, server
from modules import import_tasks, videos
from storage import DATA, uid

class ImportCancelTests(unittest.TestCase):
    def upload(self, job, token, name='sample.png', raw=None):
        return api('/api/upload', query={'job':[job['id']], 'revision':[str(job['revision'])],
                   'name':[name], 'token':[token]}, raw=sample() if raw is None else raw)

    def cancel(self, job, token):
        return api('/api/import-cancel', {'job':job['id'], 'token':token})

    def test_cancel_before_upload_never_decodes(self):
        job, token = api('/api/jobs'), uid()
        self.assertTrue(self.cancel(job, token)['accepted'])
        with patch.object(server, 'decode') as decode:
            result = self.upload(job, token)
        decode.assert_not_called()
        self.assertTrue(result['cancelled'])
        self.assertEqual(result['job']['media'], [])
        self.assertEqual(result['job']['revision'], job['revision'])

    def test_cancel_multipage_removes_partial_and_keeps_previous_media(self):
        job = self.upload(api('/api/jobs'), uid())['job']
        token, before = uid(), set((DATA/'midias').iterdir())
        image = server.Image.new('RGBA', (20, 20), 'red')
        def pages(*args):
            yield 1, image, []
            self.assertTrue(self.cancel(job, token)['accepted'])
            yield 2, image, []
        with patch.object(server, 'decode', side_effect=pages):
            result = self.upload(job, token)
        self.assertTrue(result['cancelled'])
        self.assertEqual([m['id'] for m in result['job']['media']], [m['id'] for m in job['media']])
        self.assertEqual(set((DATA/'midias').iterdir()), before)
        self.assertEqual(result['job']['revision'], job['revision'])

    def test_cancel_running_video_and_audio_kills_process_and_cleans_files(self):
        for kind, name in [('videos', 'clip.mp4'), ('audio', 'song.wav')]:
            with self.subTest(kind=kind):
                job, token = api('/api/jobs', {'kind':'video'}), uid()
                before, entered = set((DATA/'midias').iterdir()), threading.Event()
                def processor(source, proxy, poster, cancelled=None):
                    proxy.write_bytes(b'partial');poster.write_bytes(b'partial');entered.set()
                    videos.run([sys.executable, '-c', 'import time;time.sleep(20)'], cancelled=cancelled)
                    raise AssertionError('The processing must be cancelled')
                module = getattr(server, kind)
                with patch.object(module, 'import_video' if kind=='videos' else 'import_audio', side_effect=processor), ThreadPoolExecutor(1) as pool:
                    future = pool.submit(self.upload, job, token, name, b'fixture')
                    self.assertTrue(entered.wait(3))
                    started = time.monotonic();self.assertTrue(self.cancel(job, token)['accepted'])
                    result = future.result(timeout=3)
                    self.assertLess(time.monotonic()-started, 2)
                self.assertTrue(result['cancelled']);self.assertEqual(result['job']['media'], [])
                self.assertEqual(set((DATA/'midias').iterdir()), before)

    def test_cancel_just_before_commit_keeps_database_and_files_unchanged(self):
        job, token = api('/api/jobs'), uid()
        before = set((DATA/'midias').iterdir())
        def naming(*args):
            self.cancel(job, token)
            return {'title':'Cancelled', 'origin':'filename'}
        with patch.object(server.naming, 'suggest', side_effect=naming):
            result = self.upload(job, token)
        self.assertTrue(result['cancelled']);self.assertEqual(result['job']['media'], [])
        self.assertEqual(result['job']['revision'], job['revision'])
        self.assertEqual(set((DATA/'midias').iterdir()), before)

    def test_cancel_after_commit_does_not_remove_completed_file(self):
        job, token = api('/api/jobs'), uid()
        result = self.upload(job, token)
        self.assertFalse(self.cancel(job, token)['accepted'])
        self.assertEqual(len(result['job']['media']), 1)
        self.assertTrue((DATA/'midias'/(result['job']['media'][0]['id']+'.png')).is_file())

    def test_token_is_validated_and_bound_to_job(self):
        first, second, token = api('/api/jobs'), api('/api/jobs'), uid()
        self.cancel(first, token)
        with self.assertRaises(ValueError): self.cancel(second, token)
        with self.assertRaises(ValueError): self.cancel(first, '../invalid')

    def test_completed_task_registry_stays_bounded(self):
        for i in range(150): import_tasks.start(uid(), 'test').finish()
        self.assertLessEqual(len(import_tasks.TASKS), 100)
