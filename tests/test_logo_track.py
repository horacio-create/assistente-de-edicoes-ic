import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw
from test_workflow import api, server
from modules import videos, composition
from modules.images import DEFAULT
from storage import uid, get_job


class LogoTrackTests(unittest.TestCase):
    def logo(self):
        out=io.BytesIO();image=Image.new('RGBA',(64,64),(0,0,0,0))
        ImageDraw.Draw(image).rectangle((16,16,47,47),fill='white');image.save(out,'PNG');return out.getvalue()

    def test_logo_media_retains_alpha_and_belongs_to_job(self):
        job=api('/api/jobs',{'kind':'video'})
        result=api('/api/logo',query={'job':[job['id']],'revision':['0'],'name':['Logo.png'],'composition':['1']},raw=self.logo())
        media=result['job']['media'][0]
        self.assertEqual(media['role'],'logo');self.assertEqual(media['id'],result['mediaId'])
        with Image.open(server.DATA/'midias'/f'{media["id"]}.png') as image:
            self.assertEqual(image.getpixel((0,0))[3],0);self.assertEqual(image.getpixel((32,32))[3],255)
        other=api('/api/jobs',{'kind':'video'})
        project={'version':1,'settings':DEFAULT|dict(mute=True,targetMB=1),'tracks':[dict(id=uid(),locked=False,previewVisible=True)],'clips':[]}
        project['clips']=[dict(id=uid(),mediaId=media['id'],track=project['tracks'][0]['id'],at=0,duration=1,settings=DEFAULT,**{'in':0,'out':1})]
        with self.assertRaises(ValueError): composition.validate(project,other['media'])

    @unittest.skipUnless(videos.available(),'FFmpeg required')
    def test_transparent_logo_exports_over_base_only_during_its_clip(self):
        job=api('/api/jobs',{'kind':'video'})
        base=io.BytesIO();Image.new('RGB',(320,180),'red').save(base,'PNG')
        job=api('/api/upload',query={'job':[job['id']],'revision':['0'],'name':['Cliente.png']},raw=base.getvalue())['job']
        result=api('/api/logo',query={'job':[job['id']],'revision':[str(job['revision'])],'name':['Logo.png'],'composition':['1']},raw=self.logo());job=result['job']
        bottom,top=uid(),uid();p=dict(version=1,settings=DEFAULT|dict(width=320,height=180,mute=True,targetMB=.4),tracks=[dict(id=t,locked=False,previewVisible=True) for t in (bottom,top)],clips=[])
        for m,track,at,length in [(job['media'][0],bottom,0,2),(job['media'][1],top,.5,1)]:
            p['clips'].append(dict(id=uid(),mediaId=m['id'],track=track,at=at,duration=length,locked=False,settings=DEFAULT|dict(width=320,height=180,x=0,y=0,zoom=.2 if m['role']=='logo' else 1),**{'in':0,'out':length}))
        with tempfile.TemporaryDirectory() as work:
            output=Path(work)/'logo.mp4';composition.export(job['media'],server.DATA/'midias',output,p,lambda s:None)
            for time,white in [(.25,False),(.75,True),(1.75,False)]:
                data=videos.run([videos.tool('ffmpeg'),'-v','error','-ss',str(time),'-i',str(output),'-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1'])
                image=Image.open(io.BytesIO(data)).convert('RGB');center=image.getpixel((160,90));corner=image.getpixel((10,10))
                self.assertGreater(corner[0],190);self.assertLess(corner[1],35)
                if white:self.assertTrue(all(value>190 for value in center),center)
                else:self.assertGreater(center[0],190);self.assertLess(center[1],35)


if __name__=='__main__':unittest.main()
