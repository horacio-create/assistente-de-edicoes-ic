import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from test_workflow import api, server
from modules import videos, composition
from modules.images import DEFAULT
from storage import uid


@unittest.skipUnless(videos.available(), 'FFmpeg required')
class CompositionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work=tempfile.TemporaryDirectory(prefix='ic-composition-tests-')
        cls.folder=Path(cls.work.name)
        cls.videos={}
        for color in ('red','blue'):
            source=cls.folder/(color+'.mp4')
            videos.run([videos.tool('ffmpeg'),'-v','error','-y','-f','lavfi','-i',f'color={color}:s=320x180:r=30:d=4',
                        '-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac','-shortest',str(source)])
            cls.videos[color]=source.read_bytes()

    @classmethod
    def tearDownClass(cls): cls.work.cleanup()

    def upload(self,job,name,data):
        return api('/api/upload',query={'job':[job['id']],'revision':[str(job['revision'])],'name':[name]},raw=data)['job']

    def image(self,color):
        out=io.BytesIO();Image.new('RGB',(320,180),color).save(out,'PNG');return out.getvalue()

    def create(self): return api('/api/jobs',dict(kind='video'))

    def project(self,tracks):
        return dict(version=1,settings=DEFAULT|dict(width=320,height=180,mute=False,targetMB=.4),
                    tracks=[dict(id=t,locked=False,previewVisible=True) for t in tracks],clips=[])

    def clip(self,m,track,at,duration,start=0,end=None):
        return dict(id=uid(),mediaId=m['id'],track=track,at=at,duration=duration,
                    **{'in':start,'out':end or start+duration},settings=dict(DEFAULT),locked=False)

    def export_project(self,job,project,name):
        job['meta']['composition']=project;job=api('/api/save',job)
        plan=api('/api/plan',dict(job=job['id'],composition=True,folder=str(self.folder),format='mp4',template=name))
        self.assertEqual(len(plan['files']),1)
        result=api('/api/export',dict(token=plan['token']))
        self.assertTrue(result['results'][0]['ok'],result)
        return Path(plan['files'][0]['path'])

    def pixels(self,path):
        raw=videos.run([videos.tool('ffmpeg'),'-v','error','-i',str(path),'-map','0:v:0','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
        return [tuple(raw[i:i+3]) for i in range(0,len(raw),3)]

    def test_single_image_becomes_fifteen_second_video(self):
        job=self.upload(self.create(),'foto.png',self.image('lime'));track=uid();p=self.project([track]);p['settings'].update(width=1280,height=720,mute=True)
        p['clips']=[self.clip(job['media'][0],track,0,15)]
        exported=self.export_project(job,p,'Imagem 15 segundos');info=videos.probe(exported)
        self.assertAlmostEqual(info['duration'],15,delta=.05);self.assertEqual((info['width'],info['height']),(1280,720));self.assertFalse(info['hasAudio']);self.assertLessEqual(info['bytes'],400000)
        for point in (0,7,14.9): self.assertGreater(videos.frame(exported,point).getpixel((640,360))[1],200)

    def test_layered_different_videos_and_images_render_in_order_with_audio(self):
        job=self.create()
        for name,data in [('red.mp4',self.videos['red']),('blue.mp4',self.videos['blue']),('green.png',self.image('lime')),('yellow.png',self.image('yellow'))]:job=self.upload(job,name,data)
        red,blue,green,yellow=job['media'];base,upper=uid(),uid();p=self.project([base,upper])
        p['tracks'][1].update(previewVisible=False,locked=True)
        p['clips']=[self.clip(red,base,0,4),self.clip(yellow,base,4,2),self.clip(green,upper,1,1),self.clip(blue,upper,2,1,2,3)]
        output=self.export_project(job,p,'Vídeo com camadas');info=videos.probe(output)
        self.assertTrue(info['hasAudio']);self.assertAlmostEqual(info['duration'],6,delta=.08);self.assertLessEqual(info['bytes'],400000)
        pixels=self.pixels(output);self.assertEqual(len(pixels),180)
        colors=[(255,0,0)]*30+[(0,255,0)]*30+[(0,0,255)]*30+[(255,0,0)]*30+[(255,255,0)]*60
        for i,(actual,expected) in enumerate(zip(pixels,colors)):
            self.assertLess(max(abs(a-b) for a,b in zip(actual,expected)),35,(i,actual,expected))

    def test_slideshow_preserves_image_durations_and_geometry(self):
        job=self.upload(self.create(),'foto1.png',self.image('red'));job=self.upload(job,'foto2.png',self.image('blue'))
        track=uid();p=self.project([track]);p['clips']=[self.clip(job['media'][0],track,0,5),self.clip(job['media'][1],track,5,10)]
        p['clips'][1]['settings'].update(zoom=.5,mode='background',color='#00ff00')
        output=self.export_project(job,p,'Slides 15 segundos');info=videos.probe(output)
        self.assertAlmostEqual(info['duration'],15,delta=.05);self.assertFalse(info['hasAudio'])
        self.assertGreater(videos.frame(output,4.9).getpixel((160,90))[0],200)
        image=videos.frame(output,5.1);self.assertGreater(image.getpixel((160,90))[2],200);self.assertGreater(image.getpixel((0,0))[1],200)

    def test_blur_background_covers_bars_with_media_and_half_color(self):
        job=self.upload(self.create(),'video.mp4',self.videos['red']);job=self.upload(job,'foto.png',self.image('blue'))
        track=uid();p=self.project([track]);p['tracks'][0]['blurVisible']=False
        p['settings'].update(width=180,height=320,mute=True)
        p['clips']=[self.clip(job['media'][0],track,0,1),self.clip(job['media'][1],track,1,1)]
        for clip in p['clips']:clip['settings'].update(mode='blur',blur=80,color='#000000')
        output=self.export_project(job,p,'Fundo desfocado')
        top=videos.frame(output,.5).getpixel((90,20));self.assertTrue(100<top[0]<160 and top[1]<40 and top[2]<40,top)
        self.assertGreater(videos.frame(output,.5).getpixel((90,160))[0],200)
        top=videos.frame(output,1.5).getpixel((90,20));self.assertTrue(100<top[2]<160 and top[0]<40,top)
        p['clips'][0]['settings']['blur']=150;job=api('/api/job',method='GET',query={'id':[job['id']]});job['meta']['composition']=p
        with self.assertRaises(ValueError):api('/api/save',job)

    def test_mute_applies_to_entire_composition(self):
        job=self.upload(self.create(),'audio.mp4',self.videos['red']);track=uid();p=self.project([track]);p['settings']['mute']=True;p['clips']=[self.clip(job['media'][0],track,0,2,1,3)]
        output=self.export_project(job,p,'Montagem muda');self.assertFalse(videos.probe(output)['hasAudio'])

    def test_many_short_clips_export_without_command_line_or_thread_limits(self):
        job=self.upload(self.create(),'imagem.png',self.image('lime'));track=uid();p=self.project([track])
        p['settings'].update(width=64,height=64,mute=True)
        p['clips']=[self.clip(job['media'][0],track,i/30,1/30) for i in range(100)]
        output=self.export_project(job,p,'Cem trechos');self.assertAlmostEqual(videos.probe(output)['duration'],100/30,delta=.05)
        for time in (0,1,3.3):self.assertGreater(videos.frame(output,time).getpixel((32,32))[1],200)

    def test_logos_are_owned_and_rendered_on_video_and_image_clips(self):
        job=self.upload(self.create(),'video.mp4',self.videos['red']);job=self.upload(job,'foto.png',self.image('blue'))
        logo=api('/api/logo',query={'job':[job['id']],'revision':[str(job['revision'])],'name':['logo.png']},raw=self.image('lime'))
        job=logo['job'];track=uid();p=self.project([track]);p['settings']['mute']=True
        p['clips']=[self.clip(job['media'][0],track,0,1),self.clip(job['media'][1],track,1,1)]
        for clip in p['clips']:clip['settings'].update(logoId=logo['logoId'],logoScale=.2,logoX=.5,logoY=.5)
        output=self.export_project(job,p,'Logo em mídias diferentes')
        for time in (.5,1.5):self.assertGreater(videos.frame(output,time).getpixel((160,90))[1],200)
        job=api('/api/job',method='GET',query={'id':[job['id']]});p['clips'][0]['settings']['logoId']=uid();job['meta']['composition']=p
        with self.assertRaises(ValueError):api('/api/save',job)

    def test_rejects_foreign_sources_invalid_ranges_gaps_and_stale_plans(self):
        job=self.upload(self.create(),'primeiro.mp4',self.videos['red']);other=self.upload(self.create(),'outro.mp4',self.videos['blue']);track=uid();p=self.project([track]);p['clips']=[self.clip(other['media'][0],track,0,1)]
        with self.assertRaises(ValueError):composition.validate(p,job['media'])
        p['clips']=[self.clip(job['media'][0],track,1,1)]
        with self.assertRaises(ValueError):composition.check_coverage(composition.validate(p,job['media']))
        p['clips'][0].update(at=0,**{'out':5})
        with self.assertRaises(ValueError):composition.validate(p,job['media'])
        p['clips'][0].update(**{'out':1});job['meta']['composition']=p;job=api('/api/save',job)
        plan=api('/api/plan',dict(job=job['id'],composition=True,folder=str(self.folder),format='mp4',template='Revisão'))
        job=api('/api/save',job)
        with self.assertRaises(server.Conflict):api('/api/export',dict(token=plan['token']))
        loaded=api('/api/job',method='GET',query={'id':[job['id']]})
        self.assertEqual(loaded['meta']['composition']['clips'][0]['mediaId'],job['media'][0]['id'])
