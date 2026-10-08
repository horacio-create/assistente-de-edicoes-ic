import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from modules import videos
from modules.images import DEFAULT, geometry, render, settings

class FreeScaleTests(unittest.TestCase):
    def test_settings_validate_independent_axes_and_lock(self):
        s=settings(DEFAULT|dict(scaleX=.5,scaleY=2,proportionLocked=False))
        self.assertEqual((s['scaleX'],s['scaleY'],s['proportionLocked']),(.5,2,False))
        self.assertEqual(settings(DEFAULT|dict(rotation=-450))['rotation'],-90)
        self.assertEqual(settings(DEFAULT|dict(rotation=3600))['rotation'],0)
        for patch in [dict(scaleX=0),dict(scaleY=6),dict(scaleX=float('nan')),dict(proportionLocked='false')]:
            with self.assertRaises(ValueError): settings(DEFAULT|patch)

    def test_bounds_and_render_follow_stretched_local_axes(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'source.png';Image.new('RGB',(200,100),'red').save(source)
            for angle in (0,90,-90,33,-33):
                s=settings(DEFAULT|dict(width=400,height=400,rotation=angle,scaleX=.5,scaleY=1,proportionLocked=False))
                g=geometry(200,100,s);result,_=render(source,s,transparent=True)
                bounds=result.getbbox();self.assertIsNotNone(bounds)
                self.assertLessEqual(abs((bounds[2]-bounds[0])-g['rw']),3)
                self.assertLessEqual(abs((bounds[3]-bounds[1])-g['rh']),3)
            with self.assertRaises(ValueError):geometry(200,100,settings(DEFAULT|dict(zoom=5,scaleX=5,scaleY=5)))

    @unittest.skipUnless(videos.available(),'FFmpeg required')
    def test_video_frame_matches_stretched_image_at_arbitrary_rotation(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory);source=folder/'source.png';im=Image.new('RGB',(200,100),'red');im.paste('blue',(100,0,200,100));im.save(source)
            movie=folder/'source.mp4'
            videos.run([videos.tool('ffmpeg'),'-v','error','-y','-loop','1','-i',str(source),'-t','1','-c:v','libx264','-pix_fmt','yuv420p',str(movie)])
            for angle in (0,90,-90,33,-33):
                s=videos.settings(DEFAULT|dict(width=400,height=400,rotation=angle,scaleX=.5,scaleY=1.3,proportionLocked=False,trimEnd=1,mute=True),1)
                expected,_=render(source,s);frame=folder/f'frame-{angle}.png';graph=videos.filters(dict(width=200,height=100,hasAudio=False),s,None,False)
                videos.run([videos.tool('ffmpeg'),'-v','error','-y','-i',str(movie),'-filter_complex',graph,'-map','[out]','-frames:v','1',str(frame)])
                with Image.open(frame) as actual:
                    difference=ImageChops.difference(actual.convert('RGB'),expected)
                    self.assertLess(max(ImageStat.Stat(difference).mean),3)
