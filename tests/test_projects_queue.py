import copy
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from test_workflow import api, server
from modules import composition, videos, export_progress
from modules.images import DEFAULT
from storage import uid


class ProjectQueueTests(unittest.TestCase):
    def create(self):
        job=api('/api/jobs',{'kind':'video'})
        for color in ('red','blue'):
            out=io.BytesIO();Image.new('RGB',(320,180),color).save(out,'PNG')
            job=api('/api/upload',query={'job':[job['id']],'revision':[str(job['revision'])],'name':[color+'.png']},raw=out.getvalue())['job']
        timelines=[]
        for number,m in enumerate(job['media'],1):
            track=uid();project=dict(version=1,settings=DEFAULT|dict(width=320,height=180,mute=True,targetMB=.1),tracks=[dict(id=track,locked=False,previewVisible=True)],clips=[dict(id=uid(),mediaId=m['id'],track=track,at=0,duration=1,settings=DEFAULT,**{'in':0,'out':1})])
            timelines.append(dict(id=uid(),name=f'Timeline {number:02}',composition=project))
        job['meta'].update(timelines=timelines,activeTimeline=timelines[0]['id'],composition=timelines[0]['composition'],exportQueue=[])
        return job

    def queued(self):
        job=self.create()
        for number,t in enumerate(job['meta']['timelines'],1):
            job['meta']['exportQueue'].append(dict(id=uid(),timelineId=t['id'],name=t['name'],number=number,composition=copy.deepcopy(t['composition'])))
        return api('/api/save',job)

    def plan(self,job,folder):
        return api('/api/plan',dict(job=job['id'],queue=True,folder=str(folder),format='mp4',template='VT - Supermercado - Ofertas 07 a 09.10'))

    def test_empty_timeline_and_other_timeline_survive_save(self):
        job=self.create();job['meta']['timelines'][1]['composition']['clips']=[];job=api('/api/save',job)
        self.assertEqual(len(job['meta']['timelines']),2);self.assertEqual(job['meta']['timelines'][1]['composition']['clips'],[])
        self.assertEqual(job['meta']['composition'],job['meta']['timelines'][0]['composition'])

    def test_every_inactive_timeline_is_validated(self):
        job=self.create();job['meta']['timelines'][1]['composition']['clips'][0]['mediaId']=uid()
        with self.assertRaises(ValueError):api('/api/save',job)

    def test_duplicate_ids_invalid_active_and_limits_rejected(self):
        original=self.create()
        for mutate in [lambda m:m.update(activeTimeline=uid()),lambda m:m['timelines'].append(copy.deepcopy(m['timelines'][0])),lambda m:m.update(timelines=m['timelines']*11)]:
            job=copy.deepcopy(original);mutate(job['meta'])
            with self.assertRaises(ValueError):api('/api/save',job)

    def test_snapshots_preserve_settings_after_edit_and_timeline_delete(self):
        job=self.queued();snapshot=copy.deepcopy(job['meta']['exportQueue'][0]['composition'])
        job['meta']['composition']['clips'][0]['duration']=2;job['meta']['composition']['clips'][0]['out']=2
        job['meta']['timelines']=job['meta']['timelines'][:1];job=api('/api/save',job)
        self.assertEqual(job['meta']['exportQueue'][0]['composition'],snapshot)
        with tempfile.TemporaryDirectory() as folder:
            plan=self.plan(job,folder);self.assertEqual(len(plan['files']),2)
            self.assertEqual(plan['files'][0]['name'],'VT 01 - Supermercado - Ofertas 07 a 09.10.mp4')
            self.assertEqual(plan['files'][1]['name'],'VT 02 - Supermercado - Ofertas 07 a 09.10.mp4')
            self.assertEqual(composition.duration(plan['files'][0]['settings']),1)

    def test_queue_rejects_foreign_media_gaps_empty_and_excess(self):
        original=self.queued()
        for mutate in [lambda q:q[0]['composition']['clips'][0].update(mediaId=uid()),lambda q:q[0]['composition'].update(clips=[]),lambda q:q[0]['composition']['clips'][0].update(at=1),lambda q:q.extend(copy.deepcopy(q)*26)]:
            job=copy.deepcopy(original);mutate(job['meta']['exportQueue'])
            with self.assertRaises(ValueError):api('/api/save',job)

    def test_single_queue_item_keeps_two_digit_number_and_stale_plan_rejected(self):
        job=self.queued();job['meta']['exportQueue']=job['meta']['exportQueue'][1:];job=api('/api/save',job)
        with tempfile.TemporaryDirectory() as folder:
            plan=self.plan(job,folder);self.assertTrue(plan['files'][0]['name'].startswith('VT 02 - '))
            api('/api/save',job)
            with self.assertRaises(server.Conflict):api('/api/export',{'token':plan['token']})

    @unittest.skipUnless(videos.available(),'FFmpeg required')
    def test_real_queue_exports_distinct_snapshots_in_sequence(self):
        job=self.queued()
        with tempfile.TemporaryDirectory() as folder:
            plan=self.plan(job,folder);result=api('/api/export',{'token':plan['token']})
            self.assertTrue(all(row['ok'] for row in result['results']),result)
            self.assertEqual([row['queueId'] for row in result['results']],[item['id'] for item in job['meta']['exportQueue']])
            self.assertEqual(result['job']['meta']['exportQueue'],[])
            for number,f in enumerate(plan['files']):
                path=Path(f['path']);info=videos.probe(path);self.assertAlmostEqual(info['duration'],1,delta=.05);self.assertLessEqual(path.stat().st_size,100000)
                pixel=videos.frame(path,.5).getpixel((160,90));self.assertGreater(pixel[0 if number==0 else 2],200)

    @unittest.skipUnless(videos.available(),'FFmpeg required')
    def test_cancel_queue_preserves_completed_file_and_pending_snapshots(self):
        job=self.queued();real=server.composition.export;calls=0
        with tempfile.TemporaryDirectory() as folder:
            plan=self.plan(job,folder)
            def cancel_second(*args,**kwargs):
                nonlocal calls
                calls+=1
                if calls==2:export_progress.cancel(plan['token'])
                return real(*args,**kwargs)
            with patch.object(server.composition,'export',side_effect=cancel_second):result=api('/api/export',{'token':plan['token']})
            self.assertTrue(result['cancelled']);self.assertEqual(len(result['results']),1)
            self.assertTrue(Path(plan['files'][0]['path']).exists());self.assertFalse(Path(plan['files'][1]['path']).exists())
            self.assertEqual(list(Path(folder).glob('.indoor-*.tmp')),[])
            pending=api('/api/job',method='GET',query={'id':[job['id']]})['meta']['exportQueue']
            self.assertEqual(len(pending),1);self.assertEqual(pending[0]['number'],2)


if __name__=='__main__':unittest.main()
