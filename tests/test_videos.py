import hashlib
import io
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from test_workflow import api, server
from modules import videos
from modules.images import DEFAULT, render
import storage
from PIL import Image


@unittest.skipUnless(videos.available(), 'Install FFmpeg to run video integration tests')
class VideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.TemporaryDirectory(prefix='ic-video-tests-')
        cls.folder = Path(cls.work.name)
        cls.source = cls.folder / 'original.mp4'
        videos.run([videos.tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-y',
                    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=4',
                    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
                    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-shortest', str(cls.source)])
        cls.raw = cls.source.read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.work.cleanup()

    def import_sample(self):
        job = api('/api/jobs', {'kind': 'video'})
        result = api('/api/upload', query={'job':[job['id']], 'revision':['0'], 'name':['cliente.mp4']}, raw=self.raw)
        return result['job']

    def test_import_retains_audio_and_original_and_saves_video_fields(self):
        job = self.import_sample()
        m = job['media'][0]
        self.assertEqual(m['kind'], 'video')
        self.assertTrue(m['has_audio'])
        self.assertFalse(m['settings']['mute'])
        self.assertAlmostEqual(m['duration'], 4, delta=.05)
        source = server.DATA / 'midias' / (m['id'] + '.source')
        self.assertEqual(hashlib.sha256(source.read_bytes()).digest(), hashlib.sha256(self.raw).digest())
        m['settings'].update(trimStart=1, trimEnd=3, speed=2, mute=True, targetMB=.25)
        saved = api('/api/save', job)
        self.assertEqual(saved['media'][0]['settings']['trimStart'], 1)
        self.assertTrue(saved['media'][0]['settings']['mute'])

    def test_mp4_export_trims_speeds_mutes_and_obeys_size(self):
        job = self.import_sample()
        m = job['media'][0]
        m['settings'].update(width=1280,height=720,trimStart=1,trimEnd=3,speed=2,mute=True,targetMB=.3)
        job = api('/api/save', job)
        plan = api('/api/plan', dict(job=job['id'], ids=[m['id']], folder=str(self.folder),
                                    format='mp4', template='Vídeo mudo'))
        result = api('/api/export', {'token':plan['token']})
        self.assertTrue(result['results'][0]['ok'], result)
        exported = Path(plan['files'][0]['path'])
        info = videos.probe(exported)
        self.assertEqual((info['width'],info['height']), (1280,720))
        self.assertAlmostEqual(info['duration'], 1, delta=.07)
        self.assertFalse(info['hasAudio'])
        self.assertLessEqual(info['bytes'], 300000)

    def test_audio_is_kept_until_user_chooses_removal_and_can_be_slowed(self):
        output = self.folder / 'with-audio.mp4'
        value = DEFAULT | videos.DEFAULT_VIDEO | dict(width=320,height=180,trimStart=1,trimEnd=2,speed=.25,targetMB=.4)
        videos.export(self.source, output, value)
        info = videos.probe(output)
        self.assertTrue(info['hasAudio'])
        self.assertAlmostEqual(info['duration'], 4, delta=.1)
        self.assertLessEqual(info['bytes'], 400000)

    def test_video_geometry_and_logo_match_image_renderer(self):
        logo = self.folder / 'logo.png'
        Image.new('RGBA',(100,50),(0,255,0,255)).save(logo)
        output = self.folder / 'geometry.mp4'
        value = DEFAULT | videos.DEFAULT_VIDEO | dict(width=180,height=320,trimStart=0,trimEnd=1,
                   rotation=90,flipH=True,mode='background',color='#123456',zoom=.7,x=.1,y=-.1,
                   logoScale=.3,logoX=.8,logoY=.9,mute=True,targetMB=.3)
        videos.export(self.source, output, value, logo)
        original = self.folder / 'source-frame.png'
        videos.frame(self.source).save(original)
        expected,_ = render(original, value, logo)
        actual = videos.frame(output).convert('RGB')
        for point in [(0,0),(179,319),(140,282)]:
            self.assertLess(max(abs(a-b) for a,b in zip(actual.getpixel(point),expected.getpixel(point))), 30)

    def test_rejects_invalid_cut_speed_size_and_odd_dimensions(self):
        for change in [dict(trimStart=3,trimEnd=2),dict(speed=float('nan')),
                       dict(targetMB=float('inf')),dict(width=321),dict(trimEnd=5)]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                videos.settings(DEFAULT | videos.DEFAULT_VIDEO | change, 4)

    def test_montage_export_has_ordered_frames_without_black_gaps(self):
        source = self.folder / 'colored-source.mp4'
        videos.run([videos.tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-y',
                    '-f', 'lavfi', '-i', 'color=red:s=320x180:r=30:d=2',
                    '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=30:d=2',
                    '-f', 'lavfi', '-i', 'color=lime:s=320x180:r=30:d=2',
                    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
                    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
                    '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-c:a', 'aac', str(source)])
        parts = [dict(start=4.25,end=5.45), dict(start=.25,end=.65), dict(start=2.1,end=2.7)]
        parts[0]['locked']=True
        value = DEFAULT | videos.DEFAULT_VIDEO | dict(width=320,height=180,segments=parts,targetMB=.3,previewVisible=False)
        for mute, speed in [(False,1), (True,2)]:
            with self.subTest(mute=mute, speed=speed):
                output = self.folder / f'montage-{mute}.mp4'
                value.update(mute=mute,speed=speed)
                report = videos.export(source,output,value)
                info = videos.probe(output)
                self.assertEqual(info['hasAudio'],not mute)
                self.assertAlmostEqual(info['duration'],2.2/speed,delta=.06)
                self.assertLessEqual(info['bytes'],300000)
                # Check every exported frame, including both sides of every join.
                frames = videos.run([videos.tool('ffmpeg'),'-v','error','-i',str(output),
                                     '-map','0:v:0','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
                counts = videos.frame_counts(videos.settings(value,6))
                self.assertEqual(len(frames)//3,sum(counts))
                expected = [1]*counts[0]+[0]*counts[1]+[2]*counts[2]
                for n, channel in enumerate(expected):
                    pixel = frames[n*3:n*3+3]
                    self.assertGreater(pixel[channel],200, (n,list(pixel)))
                    self.assertLess(max(v for c,v in enumerate(pixel) if c!=channel),35,(n,list(pixel)))
                self.assertAlmostEqual(report['duration'],sum(counts)/30)

    def test_montage_save_reload_and_legacy_single_trim(self):
        job=self.import_sample()
        m=job['media'][0]
        parts=[dict(start=2,end=3,locked=True),dict(start=0,end=1)]
        m['settings']['segments']=parts
        m['settings']['previewVisible']=False
        saved=api('/api/save',job)
        reloaded=api('/api/job',method='GET',query={'id':[job['id']]})
        self.assertEqual(reloaded['media'][0]['settings']['segments'],parts)
        self.assertFalse(reloaded['media'][0]['settings']['previewVisible'])
        self.assertEqual(saved['media'][0]['settings']['segments'],parts)
        legacy=videos.settings(DEFAULT|dict(trimStart=1,trimEnd=3),4)
        self.assertEqual(videos.segments(legacy),[dict(start=1,end=3)])

    def test_montage_rejects_invalid_ranges_and_limits(self):
        for parts in [[],None,{},[{}],[dict(start=0,end=float('nan'))],
                      [dict(start=-1,end=1)],[dict(start=1,end=1.05)],
                      [dict(start=0,end=5)],[dict(start=0,end=1,locked='yes')],
                      [dict(start=0,end=1)]*101]:
            with self.subTest(parts=parts), self.assertRaises(ValueError):
                videos.settings(DEFAULT|dict(segments=parts),4)

    def test_preview_range_requests_support_seeking_without_full_download(self):
        m = self.import_sample()['media'][0]
        received=[]
        body=b''.join(server.app({'REQUEST_METHOD':'GET','PATH_INFO':'/video/'+m['id'],
                     'HTTP_HOST':'localhost:8080','HTTP_RANGE':'bytes=0-31','wsgi.input':io.BytesIO()},
                     lambda status,headers:received.append((status,dict(headers)))))
        self.assertEqual(received[0][0], '206 Partial Content')
        self.assertEqual(len(body),32)
        self.assertEqual(received[0][1]['Content-Length'],'32')

    def test_video_export_rejects_stale_revision(self):
        job = self.import_sample()
        m = job['media'][0]
        plan = api('/api/plan', dict(job=job['id'],ids=[m['id']],folder=str(self.folder),
                                   format='mp4',template='Revisão antiga'))
        api('/api/save', job)
        with self.assertRaises(server.Conflict): api('/api/export', {'token':plan['token']})

    def test_database_migration_preserves_existing_image_editions(self):
        with tempfile.TemporaryDirectory(prefix='ic-old-db-') as work:
            folder=Path(work)
            with closing(sqlite3.connect(folder/'historico.sqlite')) as db:
                db.execute('CREATE TABLE media(id TEXT PRIMARY KEY,job TEXT,name TEXT,page INTEGER,width INTEGER,height INTEGER,color TEXT,settings TEXT,notes TEXT)')
                db.execute('INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)',('old','job','arte.png',None,1280,720,'#000000',json.dumps(DEFAULT),'[]'))
                db.commit()
            with patch.object(storage,'DATA',folder):
                storage.init()
                with storage.connect() as db:
                    row=db.execute('SELECT * FROM media WHERE id="old"').fetchone()
                    self.assertEqual(row['name'],'arte.png')
                    self.assertEqual(row['kind'],'image')
                    self.assertEqual(json.loads(row['settings']),DEFAULT)

    def test_mp4_avi_mov_mkv_and_webm_import_with_audio(self):
        variants = [('mp4','libx264','aac'),('avi','mpeg4','libmp3lame'),
                    ('mov','libx264','aac'),('mkv','libx264','aac'),('webm','libvpx-vp9','libopus')]
        for ext,codec,audio in variants:
            with self.subTest(format=ext):
                source=self.folder/('compatibility.'+ext)
                videos.run([videos.tool('ffmpeg'),'-hide_banner','-loglevel','error','-y',
                            '-i',str(self.source),'-t','1','-c:v',codec,'-c:a',audio,str(source)])
                job=api('/api/jobs',{'kind':'video'})
                result=api('/api/upload',query={'job':[job['id']],'revision':['0'],
                           'name':['CLIENTE.'+ext.upper()]},raw=source.read_bytes())
                media=result['job']['media'][0]
                self.assertEqual(media['kind'],'video')
                self.assertTrue(media['has_audio'])
                self.assertFalse(media['settings']['mute'])
                self.assertAlmostEqual(media['duration'],1,delta=.1)
