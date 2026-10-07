"""Regression coverage for older server FFmpeg and browser-delivered exports."""
import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from test_workflow import api, server
import test_projects_queue as queue_tests
from modules import videos
from storage import uid


@unittest.skipUnless(videos.available(), 'FFmpeg required')
class ExportCompatibilityTests(unittest.TestCase):
    def assert_exported(self, plan, result):
        self.assertTrue(result['results'])
        self.assertTrue(all(row['ok'] for row in result['results']), result)
        for item in plan['files']:
            source = Path(item['path'])
            self.assertTrue(source.is_file())
            info = videos.probe(source)
            self.assertAlmostEqual(info['duration'], 1, delta=.05)
            self.assertLessEqual(info['bytes'], 100000)
            self.assertEqual((info['width'], info['height']), (320, 180))

    def test_single_and_six_item_queue_delivered_through_browser(self):
        helper = queue_tests.ProjectQueueTests()
        job = helper.queued()
        single_token, queue_token = uid(), uid()
        try:
            single = api('/api/plan', dict(job=job['id'], composition=True,
                         folder='navegador:'+single_token, format='mp4', template='VT - Individual'))
            self.assert_exported(single, api('/api/export', {'token': single['token']}))
            self.assertEqual(api('/api/entrega', method='GET', query={'token':[single_token]}),
                             ['VT - Individual.mp4'])
            originals = job['meta']['exportQueue']
            job['meta']['exportQueue'] = []
            for index in range(6):
                item = copy.deepcopy(originals[index % 2])
                item.update(id=uid(), number=index+1, name=f'Timeline {index+1:02}')
                job['meta']['exportQueue'].append(item)
            job = api('/api/save', job)
            queued = helper.plan(job, 'navegador:'+queue_token)
            result = api('/api/export', {'token':queued['token']})
            self.assert_exported(queued, result)
            self.assertEqual(result['job']['meta']['exportQueue'], [])
            self.assertEqual(api('/api/entrega', method='GET', query={'token':[queue_token]}),
                             [f'VT {index:02} - Supermercado - Ofertas 07 a 09.10.mp4' for index in range(1,7)])
            for index, item in enumerate(queued['files']):
                pixel = videos.frame(Path(item['path']), .5).getpixel((160,90))
                self.assertGreater(pixel[0 if index % 2 == 0 else 2], 200)
        finally:
            for token in (single_token, queue_token): api('/api/entrega-limpar', {'token':token})

    def test_capability_lookup_is_cached_per_executable(self):
        videos.filter_file_option.cache_clear()
        try:
            with patch.object(videos, 'run', return_value=b'-filter_complex_script filename  read graph') as command:
                self.assertEqual(videos.filter_file_option('old-test-ffmpeg'), '-filter_complex_script')
                self.assertEqual(videos.filter_file_option('old-test-ffmpeg'), '-filter_complex_script')
                self.assertEqual(command.call_count, 1)
            with patch.object(videos, 'run', return_value=b'-filter_complex <graph_description> create graph'):
                self.assertEqual(videos.filter_file_option('new-test-ffmpeg'), '-/filter_complex')
        finally:
            videos.filter_file_option.cache_clear()


if __name__ == '__main__': unittest.main()
