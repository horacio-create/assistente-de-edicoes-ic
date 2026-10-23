import copy
import tempfile
import unittest
from pathlib import Path
from test_workflow import api
from server import Conflict
from test_projects_queue import ProjectQueueTests
from modules import projects
from storage import uid


class OriginalVideoNamesTests(unittest.TestCase):
    def test_queued_export_uses_each_source_name(self):
        job=ProjectQueueTests().queued()
        with tempfile.TemporaryDirectory() as folder:
            result=api('/api/plan',dict(job=job['id'],queue=True,folder=folder,format='mp4',originalNames=True,template='Ignorado'))
        self.assertEqual([f['name'] for f in result['files']],['red.mp4','blue.mp4'])

    def test_repeated_source_is_numbered_without_collision(self):
        job=ProjectQueueTests().queued()
        duplicate=copy.deepcopy(job['meta']['exportQueue'][0]);duplicate.update(id=uid(),number=3)
        job['meta']['exportQueue'].append(duplicate);job=api('/api/save',job)
        with tempfile.TemporaryDirectory() as folder:
            result=api('/api/plan',dict(job=job['id'],queue=True,folder=folder,format='mp4',originalNames=True))
        self.assertEqual([f['name'] for f in result['files']],['red.mp4','blue.mp4','red (2).mp4'])

    def test_mixed_sources_use_timeline_name_and_single_uses_source(self):
        job=ProjectQueueTests().create();job=api('/api/save',job)
        with tempfile.TemporaryDirectory() as folder:
            args=dict(job=job['id'],composition=True,folder=folder,format='mp4',originalNames=True)
            self.assertEqual(api('/api/plan',args)['files'][0]['name'],'red.mp4')
            p=job['meta']['composition'];clip=copy.deepcopy(p['clips'][0]);clip.update(id=uid(),mediaId=job['media'][1]['id'],at=1)
            p['clips'].append(clip);job=api('/api/save',job)
            self.assertEqual(api('/api/plan',args)['files'][0]['name'],'Timeline 01.mp4')

    def test_original_files_remain_protected(self):
        job=ProjectQueueTests().queued()
        with tempfile.TemporaryDirectory() as folder:
            original=Path(folder)/'red.mp4';original.write_bytes(b'original do cliente')
            with self.assertRaises(Conflict):
                api('/api/plan',dict(job=job['id'],queue=True,folder=folder,format='mp4',originalNames=True))
            self.assertEqual(original.read_bytes(),b'original do cliente')

    def test_cuts_keep_original_stem_without_removing_final_suffix(self):
        media=[dict(id='a',name='Campanha Final.mov',kind='video')]
        project=dict(clips=[dict(mediaId='a'),dict(mediaId='a')])
        self.assertEqual(projects.original_export_name(project,media,'Timeline 01'),'Campanha Final')
        media.extend([dict(id='b',name='Musica.wav',kind='audio'),dict(id='c',name='Arte.png',kind='image')])
        project['clips'].extend([dict(mediaId='b'),dict(mediaId='c')])
        self.assertEqual(projects.original_export_name(project,media,'Timeline 01'),'Campanha Final')
