import io
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image, ImageDraw, ImageFont
from test_workflow import api, server, sample
from modules import naming, export_progress, videos


class NamesProgressTests(unittest.TestCase):
    def upload(self, job, name, raw=None):
        return api('/api/upload', query={'job': [job['id']], 'revision': [str(job['revision'])], 'name': [name]}, raw=raw or sample())['job']

    def test_first_filename_and_manual_name_survive_later_imports(self):
        job = self.upload(api('/api/jobs'), 'Clinica_Sorriso_final.png')
        self.assertEqual(job['title'], 'Clinica Sorriso')
        job = api('/api/rename', {'id': job['id'], 'revision': job['revision'], 'title': ' Campanha Outubro '})
        self.assertEqual(job['title'], 'Campanha Outubro')
        self.assertEqual(job['meta']['titleOrigin'], 'manual')
        job = self.upload(job, 'Outro cliente.png')
        self.assertEqual(job['title'], 'Campanha Outubro')
        with self.assertRaises(server.Conflict):
            api('/api/rename', {'id': job['id'], 'revision': job['revision']-1, 'title': 'Nome obsoleto'})

    def test_manual_name_before_first_import_and_input_validation(self):
        job = api('/api/jobs')
        for title in ('', ' '*4, 'a'*91, 'nome\ninválido', 123):
            with self.assertRaises(ValueError):
                api('/api/rename', {'id': job['id'], 'revision': job['revision'], 'title': title})
        job = api('/api/rename', {'id': job['id'], 'revision': job['revision'], 'title': 'Nova edição'})
        job = self.upload(job, 'Cliente conhecido.png')
        self.assertEqual(job['title'], 'Nova edição')

    def test_generic_name_uses_content_and_ocr_failure_has_fallback(self):
        with patch.object(naming, 'read_text', return_value=[{'text': 'ODONTOLOGIA', 'height': 50}]):
            job = self.upload(api('/api/jobs'), 'Telas Indoor Channel.png')
        self.assertEqual(job['title'], 'Clínica odontológica')
        self.assertEqual(job['meta']['titleOrigin'], 'content')
        with patch.object(naming, 'read_text', side_effect=OSError('OCR unavailable')):
            job = self.upload(api('/api/jobs'), 'Telas Indoor Channel.png')
        self.assertEqual(job['title'], 'Telas Indoor Channel')

    @unittest.skipUnless(os.name == 'nt', 'Windows local OCR')
    def test_actual_local_ocr_for_generic_filename(self):
        with tempfile.TemporaryDirectory() as work:
            image = Image.new('RGB', (1000, 600), 'white');draw = ImageDraw.Draw(image)
            font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 64)
            draw.text((70, 100), 'CLINICA SORRISO', fill='black', font=font)
            draw.text((70, 260), 'ODONTOLOGIA', fill='black', font=font)
            path = Path(work)/'dental.png';image.save(path)
            suggestion = naming.suggest('Telas Indoor Channel.png', path)
            self.assertEqual(suggestion, {'title': 'Clinica Sorriso', 'origin': 'content'})

    def test_progress_finish_and_failure(self):
        export_progress.start('progress-test', 'Cliente.mp4')
        export_progress.update('progress-test', .35, 'Cliente.mp4')
        export_progress.update('progress-test', .1, 'Cliente.mp4', retry=1)
        self.assertEqual(export_progress.get('progress-test')['percent'], 35)
        export_progress.finish('progress-test', False)
        self.assertEqual(export_progress.get('progress-test')['state'], 'failed')
        export_progress.finish('progress-test', True)
        self.assertEqual(export_progress.get('progress-test')['percent'], 100)

    def image_plan(self, folder, count=1):
        job = api('/api/jobs')
        for index in range(count): job = self.upload(job, f'Cliente {index}.png')
        return api('/api/plan', {'job': job['id'], 'ids': [m['id'] for m in job['media']],
                                'template': 'VT - Cancelamento', 'format': 'png', 'folder': str(folder)})

    def test_cancel_before_export_starts_publishes_nothing(self):
        with tempfile.TemporaryDirectory() as work:
            plan = self.image_plan(Path(work))
            self.assertTrue(api('/api/export-cancel', {'token': plan['token']})['accepted'])
            result = api('/api/export', {'token': plan['token']})
            self.assertTrue(result['cancelled']);self.assertEqual(result['results'], [])
            self.assertEqual(list(Path(work).iterdir()), [])
            self.assertEqual(export_progress.get(plan['token'])['state'], 'cancelled')
            self.assertFalse(api('/api/export-cancel', {'token': plan['token']})['accepted'])

    def test_cancel_batch_keeps_already_completed_files(self):
        with tempfile.TemporaryDirectory() as work:
            plan = self.image_plan(Path(work), 2);original = server.render;calls = 0
            def render_then_cancel(*args, **kwargs):
                nonlocal calls
                result = original(*args, **kwargs);calls += 1
                if calls == 2: export_progress.cancel(plan['token'])
                return result
            with patch.object(server, 'render', side_effect=render_then_cancel):
                result = api('/api/export', {'token': plan['token']})
            self.assertTrue(result['cancelled']);self.assertEqual(len(result['results']), 1)
            self.assertTrue(Path(plan['files'][0]['path']).is_file())
            self.assertFalse(Path(plan['files'][1]['path']).exists())
            self.assertEqual(list(Path(work).glob('.indoor-*.tmp')), [])

    @unittest.skipUnless(videos.available(), 'FFmpeg required')
    def test_cancel_stops_the_owned_ffmpeg_process_promptly(self):
        cancelled = threading.Event();started = time.monotonic()
        with self.assertRaises(videos.ExportCancelled):
            videos.run_progress([videos.tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi',
                                 '-i', 'color=blue:s=160x90:r=30:d=20', '-f', 'null', os.devnull], 20,
                                lambda value: cancelled.set(), cancelled=cancelled.is_set)
        self.assertLess(time.monotonic()-started, 3)

    @unittest.skipUnless(videos.available(), 'FFmpeg required')
    def test_ffmpeg_reports_actual_processed_media_time(self):
        values = []
        videos.run_progress([videos.tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
                             '-i', 'color=blue:s=160x90:r=30:d=2', '-f', 'null', os.devnull], 2, values.append)
        self.assertTrue(values)
        self.assertTrue(all(0 <= value <= 1 for value in values))
        self.assertEqual(values[-1], 1)


if __name__ == '__main__': unittest.main()
