import copy
import unittest
from modules import projects, composition
from modules.images import DEFAULT
from storage import uid


class ReuseTimelineTests(unittest.TestCase):
    def build(self, count=6, kind='video', duration=20):
        media=[dict(id=uid(),name=f'Arquivo {i+1:02}',kind=kind,duration=duration if kind=='video' else None,settings=DEFAULT,width=320,height=180) for i in range(count)]
        track=uid()
        project=dict(version=1,settings=DEFAULT|dict(width=320,height=180,mute=True,targetMB=4),tracks=[dict(id=track)],clips=[])
        for at,start,end in [(0,1,4),(3,6,9)]:
            project['clips'].append(dict(id=uid(),mediaId=media[0]['id'],track=track,at=at,duration=3,settings=DEFAULT|dict(rotation=270),**{'in':start,'out':end}))
        timeline=dict(id=uid(),name='Modelo',composition=project)
        meta=dict(timelines=[timeline],composition=project,activeTimeline=timeline['id'],exportQueue=[])
        return meta,media

    def run_model(self,meta,media):
        return projects.reuse_timelines(meta,media,lambda s:None)

    def test_creates_nine_independent_copies_with_cuts_and_geometry(self):
        meta,media=self.build(10);before=copy.deepcopy(meta)
        result=self.run_model(meta,media)
        self.assertEqual(meta,before)
        self.assertEqual(len(result['meta']['timelines']),10)
        self.assertEqual(len(result['report']['created']),9)
        track_ids=[];clip_ids=[]
        for timeline,m in zip(result['meta']['timelines'],media):
            p=timeline['composition'];track_ids.extend(t['id'] for t in p['tracks']);clip_ids.extend(c['id'] for c in p['clips'])
            self.assertEqual(composition.duration(p),6)
            self.assertEqual([c['mediaId'] for c in p['clips']],[m['id']]*2)
            self.assertEqual([(c['in'],c['out'],c['at']) for c in p['clips']],[(1,4,0),(6,9,3)])
            self.assertEqual([c['settings']['rotation'] for c in p['clips']],[270,270])
        self.assertEqual(len(set(track_ids)),10);self.assertEqual(len(set(clip_ids)),20)

    def test_limit_lists_exact_files_left_out(self):
        meta,media=self.build(12);result=self.run_model(meta,media)
        self.assertEqual(len(result['meta']['timelines']),10)
        self.assertEqual([r['name'] for r in result['report']['skipped']],['Arquivo 11','Arquivo 12'])

    def test_short_sources_adapt_cuts_and_report_duration(self):
        meta,media=self.build(2);media[1]['duration']=7
        result=self.run_model(meta,media);target=result['meta']['timelines'][1]['composition']
        self.assertEqual(composition.duration(target),4)
        self.assertEqual([(c['in'],c['out']) for c in target['clips']],[(1,4),(6,7)])
        self.assertEqual(result['report']['adjusted'][0]['direction'],'encurtado')
        self.assertEqual(result['report']['adjusted'][0]['before'],7)
        self.assertEqual(result['report']['adjusted'][0]['after'],4)

    def test_slow_model_reports_longer_output(self):
        meta,media=self.build(2,duration=10)
        for c in meta['composition']['clips']:c['duration']=6;c['at']*=2
        result=self.run_model(meta,media)
        self.assertEqual(result['report']['adjusted'][0]['direction'],'alongado')
        self.assertEqual(result['report']['adjusted'][0]['after'],12)

    def test_images_have_no_native_duration(self):
        meta,media=self.build(2,kind='image')
        result=self.run_model(meta,media)
        self.assertEqual(len(result['meta']['timelines']),2)
        self.assertEqual(result['report']['adjusted'],[])

    def test_existing_timeline_and_queue_replaced_names_and_numbers_preserved(self):
        meta,media=self.build(2)
        dest=copy.deepcopy(meta['timelines'][0]);dest.update(id=uid(),name='Ofertas')
        dest['composition']['clips']=dest['composition']['clips'][:1]
        dest['composition']['clips'][0]['mediaId']=media[1]['id']
        meta['timelines'].append(dest)
        for i,t in enumerate(meta['timelines']):
            meta['exportQueue'].append(dict(id=uid(),timelineId=t['id'],name='Nome preservado',number=i+5,composition=copy.deepcopy(t['composition'])))
        before=copy.deepcopy(meta['exportQueue']);result=self.run_model(meta,media)
        self.assertEqual(result['meta']['timelines'][1]['name'],'Ofertas')
        self.assertEqual(len(result['meta']['timelines'][1]['composition']['clips']),2)
        self.assertEqual(result['report']['queueUpdated'],2)
        for i,item in enumerate(result['meta']['exportQueue']):
            self.assertEqual(item['id'],before[i]['id']);self.assertEqual(item['number'],before[i]['number']);self.assertEqual(item['name'],before[i]['name'])
            self.assertEqual(item['composition'],result['meta']['timelines'][i]['composition'])

    def test_locked_destination_is_skipped(self):
        meta,media=self.build(2)
        dest=copy.deepcopy(meta['timelines'][0]);dest.update(id=uid(),name='Bloqueada')
        dest['composition']['clips'][0]['mediaId']=media[1]['id'];dest['composition']['tracks'][0]['locked']=True
        meta['timelines'].append(dest);before=copy.deepcopy(dest)
        result=self.run_model(meta,media)
        self.assertEqual(result['meta']['timelines'][1]['composition']['clips'][0]['mediaId'],before['composition']['clips'][0]['mediaId'])
        self.assertEqual(result['report']['applied'],[])
        self.assertIn('bloqueada',result['report']['skipped'][0]['reason'])

    def test_overlay_and_audio_follow_shortened_video_without_becoming_destinations(self):
        meta,media=self.build(2);media[1]['duration']=7
        logo=dict(id=uid(),name='Logo',kind='image',duration=None,settings=DEFAULT,width=40,height=20,role='logo')
        audio=dict(id=uid(),name='Musica',kind='audio',duration=20,settings=DEFAULT,width=0,height=0)
        media.extend([logo,audio])
        for m,kind in [(logo,'video'),(audio,'audio')]:
            track=uid();meta['composition']['tracks'].append(dict(id=track,kind=kind))
            meta['composition']['clips'].append(dict(id=uid(),mediaId=m['id'],track=track,at=0,duration=6,settings=DEFAULT,**{'in':0,'out':6}))
        result=self.run_model(meta,media);p=result['meta']['timelines'][1]['composition']
        self.assertEqual(len(result['meta']['timelines']),2)
        self.assertEqual(composition.duration(p),4)
        for c in p['clips'][2:]:self.assertEqual(c['duration'],4);self.assertEqual(c['out'],4)


if __name__=='__main__':unittest.main()
