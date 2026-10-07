import array
import io
import math
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from test_workflow import api, server
from modules import audio, composition, videos
from modules.images import DEFAULT
from storage import uid, get_job


@unittest.skipUnless(videos.available(), 'FFmpeg required')
class AudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work=tempfile.TemporaryDirectory(prefix='ic-audio-tests-')
        cls.folder=Path(cls.work.name)
        cls.wav=cls.folder/'music.wav'
        videos.run([videos.tool('ffmpeg'),'-v','error','-y','-f','lavfi','-i',
                    'aevalsrc=if(lt(t\\,1)\\,0\\,0.3*sin(2*PI*440*t)):s=48000:d=4',str(cls.wav)])

    @classmethod
    def tearDownClass(cls): cls.work.cleanup()

    def upload(self,job,name,data):
        return api('/api/upload',query={'job':[job['id']],'revision':[str(job['revision'])],'name':[name]},raw=data)['job']

    def fixture(self):
        job=api('/api/jobs',dict(kind='video'))
        image=io.BytesIO();Image.new('RGB',(320,180),'red').save(image,'PNG')
        job=self.upload(job,'red.png',image.getvalue())
        job=self.upload(job,'music.wav',self.wav.read_bytes())
        visual,music=job['media'];vt,at=uid(),uid()
        p=dict(version=1,settings=DEFAULT|dict(width=320,height=180,targetMB=.4,mute=False),
               tracks=[dict(id=vt,kind='video',locked=False,previewVisible=True),dict(id=at,kind='audio',muted=False,locked=False)],
               clips=[dict(id=uid(),mediaId=visual['id'],track=vt,at=0,duration=4,settings=DEFAULT,**{'in':0,'out':4}),
                      dict(id=uid(),mediaId=music['id'],track=at,at=1,duration=2,settings=DEFAULT,**{'in':1,'out':3})])
        return job,p

    def export(self,job,p,name):
        job['meta']['composition']=p;job=api('/api/save',job)
        plan=api('/api/plan',dict(job=job['id'],composition=True,folder=str(self.folder),format='mp4',template=name))
        result=api('/api/export',dict(token=plan['token']))
        self.assertTrue(result['results'][0]['ok'],result)
        return Path(plan['files'][0]['path'])

    def test_supported_sources_proxy_and_real_bounded_waveform(self):
        for ext,codec in [('.wav','pcm_s16le'),('.mp3','libmp3lame'),('.flac','flac'),('.ogg','libvorbis'),('.m4a','aac')]:
            with self.subTest(ext=ext):
                source=self.wav
                if ext!='.wav':
                    source=self.folder/('source'+ext)
                    videos.run([videos.tool('ffmpeg'),'-v','error','-y','-i',str(self.wav),'-c:a',codec,str(source)])
                job=self.upload(api('/api/jobs',dict(kind='video')),'music'+ext,source.read_bytes())
                music=job['media'][0]
                self.assertEqual(music['kind'],'audio');self.assertTrue(music['has_audio'])
                self.assertAlmostEqual(music['duration'],4,delta=.12)
                self.assertLessEqual(len(music['waveform']),audio.PEAKS)
                self.assertLess(max(music['waveform'][5:450]),.01)
                self.assertGreater(max(music['waveform'][800:]),.15)
                self.assertEqual(get_job(job['id'])['media'][0]['waveform'],music['waveform'])
                self.assertGreater(audio.probe(server.DATA/'midias'/(music['id']+'.m4a'))['duration'],3.9)

    def test_rejects_wrong_editor_invalid_content_and_stale_upload(self):
        job=api('/api/jobs',dict(kind='image'))
        with self.assertRaises(ValueError):self.upload(job,'music.wav',self.wav.read_bytes())
        job=api('/api/jobs',dict(kind='video'))
        with self.assertRaises(ValueError):self.upload(job,'music.mp3',b'not audio')
        updated=self.upload(job,'music.wav',self.wav.read_bytes())
        with self.assertRaises(server.Conflict):self.upload(job,'again.wav',self.wav.read_bytes())
        self.assertEqual(len(get_job(updated['id'])['media']),1)

    def test_audio_tracks_do_not_cover_visual_gaps_and_cannot_mix_types(self):
        job,p=self.fixture()
        clean=composition.validate(p,job['media']);composition.check_coverage(clean)
        p['clips'][1]['track']=p['tracks'][0]['id']
        with self.assertRaises(ValueError):composition.validate(p,job['media'])
        p['clips'][1]['track']=p['tracks'][1]['id'];p['clips'][0]['at']=1
        with self.assertRaises(ValueError):composition.check_coverage(composition.validate(p,job['media']))
        p['clips']=p['clips'][1:]
        with self.assertRaises(ValueError):composition.check_coverage(composition.validate(p,job['media']))

    def test_trim_delay_speed_and_mute_are_honored_in_export(self):
        job,p=self.fixture();p['clips'][1].update(duration=1,**{'in':1,'out':3})
        output=self.export(job,p,'Music with cut and speed')
        self.assertTrue(videos.probe(output)['hasAudio']);self.assertAlmostEqual(videos.probe(output)['duration'],4,delta=.05)
        # Materialize timestamp gaps: newer AAC encoders may extend a silent
        # packet instead of emitting repeated silent frames.
        raw=videos.run([videos.tool('ffmpeg'),'-v','error','-i',str(output),'-map','0:a:0','-af','aresample=async=1:first_pts=0','-ac','1','-ar','48000','-f','f32le','pipe:1'])
        samples=array.array('f',raw)
        rms=lambda a,b:math.sqrt(sum(v*v for v in samples[round(a*48000):round(b*48000)])/round((b-a)*48000))
        self.assertLess(rms(.2,.8),.003);self.assertGreater(rms(1.2,1.8),.1);self.assertLess(rms(2.2,3.8),.003)
        self.assertLessEqual(output.stat().st_size,400000)
        job=get_job(job['id']);p['tracks'][1]['muted']=True
        self.assertFalse(videos.probe(self.export(job,p,'Muted audio track'))['hasAudio'])
        job=get_job(job['id']);p['tracks'][1]['muted']=False;p['settings']['mute']=True
        self.assertFalse(videos.probe(self.export(job,p,'Globally muted music'))['hasAudio'])

    def test_muted_track_does_not_mute_other_music_and_queue_keeps_snapshot(self):
        job,p=self.fixture();second=uid();p['tracks'].append(dict(id=second,kind='audio',muted=True,locked=True))
        c=dict(p['clips'][1],id=uid(),track=second,at=0,duration=4,**{'in':0,'out':4});p['clips'].append(c)
        output=self.export(job,p,'One audible one muted')
        self.assertTrue(videos.probe(output)['hasAudio'])
        job=get_job(job['id']);tid=uid();qid=uid();job['meta'].update(timelines=[dict(id=tid,name='Music',composition=p)],activeTimeline=tid,
            exportQueue=[dict(id=qid,timelineId=tid,name='Music',number=1,composition=p)])
        saved=api('/api/save',job)
        self.assertTrue(saved['meta']['exportQueue'][0]['composition']['tracks'][2]['muted'])

    def test_audio_endpoint_supports_range_and_head(self):
        job=self.upload(api('/api/jobs',dict(kind='video')),'music.wav',self.wav.read_bytes())
        ident=job['media'][0]['id'];headers=[]
        def start(status,value):headers.append((status,dict(value)))
        env=dict(PATH_INFO='/audio/'+ident,REQUEST_METHOD='GET',HTTP_HOST='localhost',HTTP_RANGE='bytes=0-31',**{'wsgi.input':io.BytesIO(b'')})
        data=b''.join(server.app(env,start))
        self.assertEqual(headers[-1][0],'206 Partial Content');self.assertEqual(len(data),32)
        self.assertEqual(headers[-1][1]['Content-Type'],'audio/mp4')
        env.update(REQUEST_METHOD='HEAD');self.assertEqual(b''.join(server.app(env,start)),b'')
        env.update(REQUEST_METHOD='GET',HTTP_RANGE='bytes=999999999-');self.assertEqual(b''.join(server.app(env,start)),b'')
        self.assertTrue(headers[-1][0].startswith('416'))

    def test_music_mix_preserves_video_voice_when_music_is_muted(self):
        job,p=self.fixture();movie=self.folder/'voice.mp4'
        videos.run([videos.tool('ffmpeg'),'-v','error','-y','-f','lavfi','-i','color=red:s=320x180:r=30:d=4',
                    '-f','lavfi','-i','sine=frequency=880:duration=4','-c:v','libx264','-c:a','aac','-shortest',str(movie)])
        job=self.upload(job,'voice.mp4',movie.read_bytes());p['clips'][0]['mediaId']=job['media'][-1]['id']
        def amplitude(output,hz):
            raw=videos.run([videos.tool('ffmpeg'),'-v','error','-i',str(output),'-map','0:a:0',
                            '-af','aresample=async=1:first_pts=0','-ac','1','-ar','48000','-f','f32le','pipe:1'])
            samples=array.array('f',raw)[62400:86400]
            sine=sum(v*math.sin(2*math.pi*hz*i/48000) for i,v in enumerate(samples))
            cosine=sum(v*math.cos(2*math.pi*hz*i/48000) for i,v in enumerate(samples))
            return 2*math.hypot(sine,cosine)/len(samples)
        mixed=self.export(job,p,'Voice and music')
        self.assertGreater(amplitude(mixed,440),.15);self.assertGreater(amplitude(mixed,880),.07)
        job=get_job(job['id']);p['tracks'][1]['muted']=True
        voice=self.export(job,p,'Voice with music muted')
        self.assertLess(amplitude(voice,440),.01);self.assertGreater(amplitude(voice,880),.07)
