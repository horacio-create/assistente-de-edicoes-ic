import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-tests-')
os.environ['INDOOR_DATA'] = str(Path(SANDBOX.name) / 'data')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
import pymupdf
import server
from storage import init, get_job, connect
from modules.images import decode, render, DEFAULT, settings

init()

def api(path, data=None, method='POST', query=None, raw=None):
    return server.api(method, path, query or {}, raw if raw is not None else json.dumps(data or {}).encode())

def sample(fmt='PNG'):
    im = Image.new('RGB', (400, 200), '#ce3434')
    for x in range(200,400):
        for y in range(200): im.putpixel((x,y), (30,80,210))
    b=io.BytesIO(); im.save(b,fmt); return b.getvalue()

class WorkflowTests(unittest.TestCase):
    def test_atomic_publication_preserves_file_created_after_review(self):
        from unittest.mock import patch
        plan = self.plan()
        dest = Path(plan['files'][0]['path'])
        real_link = os.link
        def late_file(temp, target):
            Path(target).write_bytes(b'Arquivo de outra pessoa')
            return real_link(temp, target)
        with patch.object(server.os, 'link', side_effect=late_file):
            result = api('/api/export', {'token':plan['token']})
        self.assertFalse(result['results'][0]['ok'])
        self.assertEqual(dest.read_bytes(), b'Arquivo de outra pessoa')
        self.assertEqual(list(self.folder.glob('.indoor-*.tmp')), [])

    @unittest.skipUnless(os.name == 'nt', 'Windows rename is the non-replacing fallback')
    def test_atomic_publication_windows_fallback_refuses_overwrite(self):
        from unittest.mock import patch
        temp, dest = self.folder/'source.tmp', self.folder/'destination.png'
        temp.write_bytes(b'Complete file')
        with patch.object(server.os, 'link', side_effect=OSError('Hard links unsupported')):
            server.publish_new(temp, dest)
        self.assertEqual(dest.read_bytes(), b'Complete file')
        temp.write_bytes(b'Other file')
        with patch.object(server.os, 'link', side_effect=OSError('Hard links unsupported')):
            with self.assertRaises(FileExistsError): server.publish_new(temp, dest)
        self.assertEqual(dest.read_bytes(), b'Complete file')

    def test_revision_change_during_render_prevents_publication(self):
        from unittest.mock import patch
        original = server.render
        plan = self.plan()
        def changed(*args):
            api('/api/save', self.job)
            return original(*args)
        with patch.object(server, 'render', side_effect=changed):
            result = api('/api/export', {'token':plan['token']})
        self.assertFalse(result['results'][0]['ok'])
        self.assertFalse(Path(plan['files'][0]['path']).exists())

    def test_portable_session_is_advertised_in_info(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {'INDOOR_PORTABLE':'1'}):
            self.assertTrue(api('/api/info', method='GET')['portable'])
        with patch.dict(os.environ, {'INDOOR_PORTABLE':''}):
            self.assertFalse(api('/api/info', method='GET')['portable'])

    def test_host_header_rejects_rebinding_even_with_matching_origin(self):
        def request(host):
            status = []
            env = {'REQUEST_METHOD':'GET', 'PATH_INFO':'/api/info', 'HTTP_HOST':host,
                   'HTTP_ORIGIN':'http://' + host, 'wsgi.input':io.BytesIO()}
            body = b''.join(server.app(env, lambda code, headers: status.append(code)))
            return status[0], json.loads(body)
        status, body = request('attacker.example:8080')
        self.assertEqual(status, '400 Bad Request')
        self.assertIn('Host', body['error'])
        for host in ('localhost:8080', '127.0.0.1:8080', '[::1]:8080', server.socket.gethostname()+':8080'):
            self.assertEqual(request(host)[0], '200 OK')

    def test_new_export_never_exposes_partial_destination(self):
        from unittest.mock import patch
        plan = self.plan()
        dest = Path(plan['files'][0]['path'])
        real_open = Path.open
        class InterruptedWrite:
            def __enter__(self):
                self.file = real_open(dest, 'xb')
                return self
            def write(self, data):
                self.file.write(data[:10])
                self.file.flush()
                raise OSError('Queda simulada durante gravação')
            def __exit__(self, *args): self.file.close()
        def intercept(path, *args, **kwargs):
            if path == dest and args and args[0] == 'xb': return InterruptedWrite()
            return real_open(path, *args, **kwargs)
        with patch.object(Path, 'open', intercept):
            result = api('/api/export', {'token':plan['token']})
        if dest.exists():
            with Image.open(dest) as image: image.load()
        self.assertTrue(result['results'][0]['ok'])
        self.assertEqual(list(self.folder.glob('.indoor-*.tmp')), [])

    def test_export_does_not_block_another_job_save_during_render(self):
        import threading
        from unittest.mock import patch
        other = api('/api/jobs')
        done = threading.Event()
        workers, saved_during_render = [], []
        original = server.render
        def save_other():
            api('/api/save', other)
            done.set()
        def slow_render(*args):
            worker = threading.Thread(target=save_other)
            workers.append(worker)
            worker.start()
            saved_during_render.append(done.wait(1))
            return original(*args)
        with patch.object(server, 'render', side_effect=slow_render):
            result = api('/api/export', {'token':self.plan()['token']})
        for worker in workers: worker.join(3)
        self.assertTrue(result['results'][0]['ok'])
        self.assertEqual(saved_during_render, [True])

    def test_unused_folder_listing_is_not_available(self):
        with self.assertRaisesRegex(ValueError, 'Operação não encontrada'):
            api('/api/folders', method='GET', query={'path':[str(self.folder)]})

    def test_16_bit_grayscale_is_scaled_before_conversion(self):
        from modules.images import rgb
        for mode in ('I;16', 'I;16L', 'I;16B', 'I'):
            with self.subTest(mode=mode):
                self.assertEqual(rgb(Image.new(mode, (4,4), 40000)).getpixel((0,0)), (156,156,156,255))
        for fmt, ext in (('PNG', '.png'), ('TIFF', '.tiff')):
            raw = io.BytesIO()
            Image.new('I;16', (4,4), 40000).save(raw, fmt)
            self.assertEqual(next(decode(raw.getvalue(), ext))[1].getpixel((0,0)), (156,156,156,255))

    def setUp(self):
        self.job=api('/api/jobs')
        self.job=api('/api/upload',query={'job':[self.job['id']],'revision':['0'],'name':['arte.png']},raw=sample())['job']
        self.folder=Path(SANDBOX.name)/self.job['id']; self.folder.mkdir()

    def plan(self, **kw):
        return api('/api/plan',dict(job=self.job['id'],ids=[m['id'] for m in self.job['media']],client='Cliente',campaign='Campanha',date='2026-09-29',format='jpg',folder=str(self.folder))|kw)

    def test_logo_preview_export_position_and_ownership(self):
        import base64
        mark = Image.new('RGBA', (100, 50), (0, 255, 0, 255))
        mark.putpixel((0, 0), (0, 0, 0, 0))
        raw = io.BytesIO(); mark.save(raw, 'PNG')
        response = api('/api/logo', query={'job':[self.job['id']], 'revision':[str(self.job['revision'])], 'name':['marca.png']}, raw=raw.getvalue())
        self.job = response['job']; m = self.job['media'][0]
        src = server.DATA/'midias'/f"{m['id']}.png"
        original = src.read_bytes()
        m['settings'].update(width=400,height=200,logoId=response['logoId'],logoScale=.25,logoX=1,logoY=0)
        self.job = api('/api/save', self.job)
        preview = api('/api/preview', {'id':m['id'], 'settings':m['settings']})
        image = Image.open(io.BytesIO(base64.b64decode(preview['image'].split(',')[1])))
        self.assertGreater(image.getpixel((350,25))[1], 240)
        result = api('/api/export', {'token':self.plan(format='png')['token']})
        self.assertTrue(result['results'][0]['ok'])
        with Image.open(next(self.folder.glob('*.png'))) as out:
            self.assertEqual(out.getpixel((350,25)), (0,255,0))
            self.assertEqual(out.getpixel((50,25)), (206,52,52))
        self.assertEqual(original, src.read_bytes())
        other = api('/api/jobs')
        with self.assertRaises(ValueError): server.logo_path(m['settings'], other['id'])
        with self.assertRaises(ValueError): server.logo_path({'logoId':'../outside'}, self.job['id'])
        logo = server.logo_path(m['settings'], self.job['id'])
        moved,_ = render(src, m['settings'] | {'logoX':0,'logoY':1}, logo)
        self.assertEqual(moved.getpixel((50,175)), (0,255,0))
        self.assertEqual(moved.getpixel((350,25)), (30,80,210))
        self.assertEqual(get_job(self.job['id'])['media'][0]['settings']['logoId'], response['logoId'])

    def test_pdf_without_background_is_white_and_text_survives_export(self):
        with pymupdf.open() as doc:
            page = doc.new_page(width=320, height=180)
            page.insert_text((25, 70), 'Texto preto', fontsize=24, color=(0, 0, 0))
            data = doc.tobytes()
        page, image, _ = next(decode(data, '.pdf'))
        self.assertEqual(image.getpixel((0, 0)), (255, 255, 255, 255))
        self.job = api('/api/upload', query={'job':[self.job['id']], 'revision':[str(self.job['revision'])], 'name':['texto.pdf']}, raw=data)['job']
        media = self.job['media'][-1]
        self.job = api('/api/save', self.job)
        result = api('/api/export', {'token':self.plan(ids=[media['id']], format='png')['token']})
        self.assertTrue(result['results'][0]['ok'])
        with Image.open(next(self.folder.glob('*.png'))) as exported:
            self.assertEqual(exported.size, (1280, 720))
            self.assertGreater(len(exported.getcolors(1_000_000)), 2)

    def test_version_and_numbered_template_spacing(self):
        from version import VERSION
        self.assertEqual(api('/api/info',method='GET')['version'], VERSION)
        self.job=api('/api/upload',query={'job':[self.job['id']],'revision':[str(self.job['revision'])],'name':['segunda.png']},raw=sample())['job']
        for template in ('VT - Cliente - Campanha', 'VT1 - Cliente - Campanha', 'VT 1 - Cliente - Campanha'):
            result=self.plan(template=template)
            self.assertEqual([f['name'] for f in result['files']], ['VT 1 - Cliente - Campanha.jpg', 'VT 2 - Cliente - Campanha.jpg'])

    def test_logo_limits(self):
        for key, val in [('logoScale', 2), ('logoX', -1), ('logoY', float('nan'))]:
            with self.assertRaises(ValueError): settings({key:val})
        with self.assertRaises(ValueError):
            api('/api/logo',query={'job':[self.job['id']], 'revision':[str(self.job['revision'])], 'name':['logo.pdf']},raw=b'bad')

    def test_history_delete_selected_all_and_restore_preserves_media(self):
        before = api('/api/history', method='GET')
        ident = before[0]['id']
        media = self.job['media'][0]
        source = server.DATA/'midias'/f"{media['id']}.png"
        original = source.read_bytes()
        deleted = api('/api/history-delete', {'ids':[ident]})
        self.assertEqual(deleted['count'], 1)
        self.assertNotIn(ident, [e['id'] for e in api('/api/history', method='GET')])
        api('/api/history-restore', {'ids':deleted['ids']})
        self.assertIn(ident, [e['id'] for e in api('/api/history', method='GET')])
        deleted = api('/api/history-delete', {'all':True})
        self.assertEqual(api('/api/history', method='GET'), [])
        self.assertEqual(source.read_bytes(), original)
        self.assertEqual(get_job(self.job['id'])['media'][0]['id'], media['id'])
        api('/api/history-restore', {'ids':deleted['ids']})
        self.assertEqual(len(api('/api/history', method='GET')), len(before))

    def test_logo_worker_rejects_invalid_image(self):
        with self.assertRaises(ValueError):
            api('/api/logo', query={'job':[self.job['id']], 'revision':[str(self.job['revision'])], 'name':['bad.png']}, raw=b'not a png')
        self.assertEqual(get_job(self.job['id'])['logos'], [])

    def test_media_order_persists_and_controls_export_numbering(self):
        for name in ['segunda.png','terceira.png']:
            self.job=api('/api/upload',query={'job':[self.job['id']],'revision':[str(self.job['revision'])],'name':[name]},raw=sample())['job']
        original = [m['id'] for m in self.job['media']]
        self.job['media'] = [self.job['media'][2], self.job['media'][0], self.job['media'][1]]
        self.job = api('/api/save', self.job)
        expected = [original[2], original[0], original[1]]
        self.assertEqual([m['id'] for m in get_job(self.job['id'])['media']], expected)
        plan = self.plan(template='VT - Cliente - Campanha 01.10.2026', ids=original)
        self.assertEqual([f['id'] for f in plan['files']], expected)
        self.assertEqual([f['name'].split(' - ')[0] for f in plan['files']], ['VT 1','VT 2','VT 3'])
        result = api('/api/export', {'token':plan['token']})
        self.assertTrue(all(r['ok'] for r in result['results']))
        subset=self.plan(ids=[original[1],original[2]],template='VT - Recorte')
        self.assertEqual([f['id'] for f in subset['files']], [original[2],original[1]])
        self.job=api('/api/upload',query={'job':[self.job['id']],'revision':[str(self.job['revision'])],'name':['nova.png']},raw=sample())['job']
        self.assertEqual([m['id'] for m in self.job['media'][:3]], expected)
        self.assertEqual(self.job['media'][-1]['name'], 'nova.png')

    def test_media_order_rejects_duplicate_or_missing_ids(self):
        value=dict(self.job); value['media']=self.job['media']*2
        with self.assertRaises(ValueError): api('/api/save',value)
        value['media']=[]
        with self.assertRaises(ValueError): api('/api/save',value)
        self.assertEqual(get_job(self.job['id'])['revision'],self.job['revision'])

    def test_all_image_formats(self):
        for fmt, ext in [('JPEG','.jpg'),('JPEG','.jpeg'),('PNG','.png'),('WEBP','.webp'),('BMP','.bmp'),('TIFF','.tiff')]:
            with self.subTest(fmt=fmt):
                pages=list(decode(sample(fmt),ext)); self.assertEqual(pages[0][1].size,(400,200))

    def test_pdf_pages_independent(self):
        doc=pymupdf.open()
        doc.new_page(width=400,height=200); doc.new_page(width=200,height=400)
        result=api('/api/upload',query={'job':[self.job['id']],'revision':[str(self.job['revision'])],'name':['duas.pdf']},raw=doc.tobytes())['job']
        self.assertEqual([m['page'] for m in result['media']], [None,1,2])
        self.assertEqual(result['media'][2]['width'],400)

    def test_modes_rotation_and_safe_guide(self):
        src=server.DATA/'midias'/f"{self.job['media'][0]['id']}.png"
        contain,_=render(src,DEFAULT|{'width':400,'height':400})
        self.assertEqual(contain.getpixel((10,10)),(0,0,0))
        bg,_=render(src,DEFAULT|{'width':400,'height':400,'mode':'background','color':'#00ff00'})
        self.assertEqual(bg.getpixel((10,10)),(0,255,0))
        cover,notes=render(src,DEFAULT|{'width':400,'height':400,'mode':'cover'})
        self.assertNotEqual(cover.getpixel((10,10)),(0,0,0));self.assertTrue(any('fora' in n for n in notes))
        a,_=render(src,DEFAULT|{'safe':True});b,_=render(src,DEFAULT|{'safe':False})
        self.assertEqual(a.tobytes(),b.tobytes())
        rotated,_=render(src,DEFAULT|{'width':200,'height':400,'rotation':90})
        self.assertEqual(rotated.getpixel((100,50)),(206,52,52))
        flipped,_=render(src,DEFAULT|{'width':400,'height':200,'flipH':True})
        self.assertEqual(flipped.getpixel((10,10)),(30,80,210))

    def test_export_and_history(self):
        plan=self.plan(); result=api('/api/export',{'token':plan['token']})
        self.assertTrue(result['results'][0]['ok'])
        with Image.open(plan['files'][0]['path']) as im:self.assertEqual(im.size,(1280,720));self.assertEqual(im.format,'JPEG')
        events=api('/api/history',method='GET')
        self.assertTrue(any(e['action']=='Exportado' and e['job']==self.job['id'] for e in events))
        with self.assertRaises(ValueError):api('/api/export',{'token':plan['token']})

    def test_png_custom_dimensions_and_persistence(self):
        m=self.job['media'][0];m['settings'].update(width=720,height=1280,zoom=1.4,x=.1)
        self.job=api('/api/save',self.job)
        recovered=get_job(self.job['id']);self.assertEqual(recovered['media'][0]['settings']['zoom'],1.4)
        plan=self.plan(format='png');api('/api/export',{'token':plan['token']})
        with Image.open(plan['files'][0]['path']) as im:self.assertEqual(im.size,(720,1280));self.assertEqual(im.format,'PNG')

    def test_original_never_overwritten(self):
        p=self.folder/'VT - Cliente - Campanha 2026-09-29.jpg';p.write_bytes(b'original')
        with self.assertRaises(server.Conflict):self.plan()
        self.assertEqual(p.read_bytes(),b'original')

    def test_overwrite_requires_confirmation_and_unchanged_content(self):
        plan=self.plan();api('/api/export',{'token':plan['token']})
        new=self.plan()
        with self.assertRaises(server.Conflict):api('/api/export',{'token':new['token']})
        self.assertTrue(api('/api/export',{'token':new['token'],'overwrite':True})['results'][0]['ok'])
        third=self.plan();Path(third['files'][0]['path']).write_bytes(b'changed elsewhere')
        with self.assertRaises(server.Conflict):api('/api/export',{'token':third['token'],'overwrite':True})
        with self.assertRaises(server.Conflict):self.plan()

    def test_race_new_file_after_plan(self):
        p=self.plan();dest=Path(p['files'][0]['path']);dest.write_bytes(b'new original')
        with self.assertRaises(server.Conflict):api('/api/export',{'token':p['token']})
        self.assertEqual(dest.read_bytes(),b'new original')

    def test_revision_conflict(self):
        old=dict(self.job); self.job=api('/api/save',self.job)
        with self.assertRaises(server.Conflict):api('/api/save',old)

    def test_stale_export_plan(self):
        p=self.plan();api('/api/save',self.job)
        with self.assertRaises(server.Conflict):api('/api/export',{'token':p['token']})

    def test_unsupported_and_corrupt_logged(self):
        q={'job':[self.job['id']],'revision':[str(self.job['revision'])],'name':['arte.psd']}
        self.assertIn('unsupported',api('/api/upload',query=q,raw=b'psd'))
        q['name']=['bad.png']
        with self.assertRaises(ValueError):api('/api/upload',query=q,raw=b'bad')
        events=api('/api/history',method='GET')
        self.assertTrue(any(e['action']=='Falha na importação' and e['job']==self.job['id'] for e in events))

    def test_batch_names_and_duplicate_names(self):
        self.job=api('/api/upload',query={'job':[self.job['id']],'revision':[str(self.job['revision'])],'name':['segundo.png']},raw=sample())['job']
        p=self.plan();self.assertTrue(p['files'][0]['name'].startswith('VT 1 -'));self.assertTrue(p['files'][1]['name'].startswith('VT 2 -'))
        with self.assertRaises(ValueError):self.plan(names=['Igual','igual'])

    def test_input_bounds(self):
        for patch in [{'width':99999},{'zoom':float('nan')},{'color':'red'},{'rotation':45}]:
            with self.assertRaises(ValueError):settings(patch)
        for name in ['CON','nul','COM1','LPT9']:
            with self.assertRaises(ValueError):server.clean(name)

    def test_single_name_template_numbers_batch(self):
        self.job=api('/api/upload',query={'job':[self.job['id']],'revision':[str(self.job['revision'])],'name':['outra.png']},raw=sample())['job']
        p=self.plan(template='VT - Cliente - Campanha 30.09.2026')
        self.assertEqual([f['name'] for f in p['files']],['VT 1 - Cliente - Campanha 30.09.2026.jpg','VT 2 - Cliente - Campanha 30.09.2026.jpg'])
        edited=self.plan(template='VT - Loja - Natal 25.12.2026',format='png')
        self.assertEqual(edited['files'][1]['name'],'VT 2 - Loja - Natal 25.12.2026.png')

    def test_original_size_and_center_locks(self):
        src=server.DATA/'midias'/f"{self.job['media'][0]['id']}.png"
        options=DEFAULT|{'width':800,'height':600,'zoom':4,'x':.5,'y':-.5,'lockSize':True,'lockX':True,'lockY':True}
        im,_=render(src,options)
        self.assertEqual(im.getpixel((199,300)),(0,0,0))
        self.assertEqual(im.getpixel((210,210)),(206,52,52))
        self.assertEqual(im.getpixel((610,300)),(0,0,0))
        self.job['media'][0]['settings']=options
        saved=api('/api/save',self.job)['media'][0]['settings']
        self.assertEqual((saved['x'],saved['y']),(0,0));self.assertTrue(saved['lockSize'])

    def test_remote_cannot_open_host_folder_dialog(self):
        with self.assertRaises(ValueError):
            server.api('POST','/api/pick-folder',{},b'{}',{'REMOTE_ADDR':'192.168.1.42'})
        local=server.api('GET','/api/info',{},b'',{'REMOTE_ADDR':'127.0.0.1'})
        remote=server.api('GET','/api/info',{},b'',{'REMOTE_ADDR':'192.168.1.42'})
        self.assertEqual(local['nativePicker'],os.name=='nt');self.assertFalse(remote['nativePicker'])

    def test_cross_origin_rejected(self):
        status=[]
        env={'REQUEST_METHOD':'POST','PATH_INFO':'/api/jobs','HTTP_HOST':'localhost:8080','HTTP_ORIGIN':'https://evil.example','wsgi.input':io.BytesIO(b'{}'),'CONTENT_LENGTH':'2','HTTP_X_INDOOR':'1'}
        server.app(env,lambda s,h:status.append(s));self.assertEqual(status[0],'400 Bad Request')

if __name__=='__main__':unittest.main()
