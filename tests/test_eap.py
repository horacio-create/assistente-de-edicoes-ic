import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-eap-tests-')
os.environ.setdefault('INDOOR_DATA', str(Path(SANDBOX.name) / 'data'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from PIL import Image, ImageDraw
import server
from storage import init
from modules import eap

init()

ORANGE, NAVY, GRAY = (230, 120, 20), (20, 40, 110), (30, 30, 30)

def api(path, data=None, query=None, raw=None):
    return server.api('POST', path, query or {}, raw if raw is not None else json.dumps(data or {}).encode())

def logo(size=(1200, 600), bg='white', mode='RGB'):
    w, h = size; k = w / 1200
    im = Image.new(mode, size, bg); d = ImageDraw.Draw(im)
    d.ellipse((60*k, 60*k, 540*k, 540*k), fill=ORANGE); d.ellipse((170*k, 170*k, 430*k, 430*k), fill=NAVY)
    d.rectangle((640*k, 180*k, 1140*k, 300*k), fill=NAVY); d.rectangle((640*k, 360*k, 1000*k, 420*k), fill=GRAY)
    return im

def at(x, y, margin=.1):
    """Posição na saída 1024 de um ponto da logo de 1200×600 (arte ocupa 60..1140 × 60..540)."""
    k = 1024 * (1 - 2 * margin) / 1080
    return round((1024 - 1080 * k) / 2 + (x - 60) * k), round((1024 - 480 * k) / 2 + (y - 60) * k)

def encode(im, fmt='PNG', **kw):
    b = io.BytesIO(); im.save(b, fmt, **kw); return b.getvalue()

def compose(data, ext='.png', **settings):
    return eap.compose(eap.load(data, ext), settings, eap.jpeg_quality(data))

class EapTests(unittest.TestCase):
    def test_outputs_are_square_1024_with_requested_backgrounds(self):
        r = compose(encode(logo()))
        for key, corner in (('white', (255, 255, 255)), ('black', (0, 0, 0))):
            self.assertEqual(r['images'][key].size, (1024, 1024))
            self.assertEqual(r['images'][key].getpixel((5, 5)), corner)
        transparent = r['images']['transparent']
        self.assertEqual(transparent.mode, 'RGBA'); self.assertEqual(transparent.getpixel((5, 5))[3], 0)
        self.assertEqual(transparent.getpixel(at(300, 300))[3], 255)

    def test_margin_centers_logo_inside_square(self):
        alpha = np.asarray(compose(encode(logo()), margin=.1)['images']['transparent'].getchannel('A'))
        cols = np.flatnonzero((alpha > 8).any(axis=0)); rows = np.flatnonzero((alpha > 8).any(axis=1))
        self.assertAlmostEqual(cols[0], 102, delta=3); self.assertAlmostEqual(1023 - cols[-1], 102, delta=3)
        self.assertAlmostEqual(rows[0], 1023 - rows[-1], delta=3)

    def test_background_removal_has_no_white_halo(self):
        im = compose(encode(logo()))['images']['black']
        px = np.asarray(im).astype(int)
        light = (px.min(axis=2) > 200).sum()  # nada da logo é quase branco; o halo do fundo seria
        self.assertLess(light, 50)

    def test_recommendation_follows_quality(self):
        good = compose(encode(logo()))['assessment']
        self.assertEqual(good['recommended'], 'clean')
        bad_data = encode(logo().resize((300, 150), Image.LANCZOS), 'JPEG', quality=40)
        bad = compose(bad_data, '.jpg')['assessment']
        self.assertEqual(bad['recommended'], 'vector')
        self.assertAlmostEqual(bad['quality'], 40, delta=5)

    def test_vectorization_keeps_brand_colors_and_exports_svg(self):
        data = encode(logo().resize((300, 150), Image.LANCZOS), 'JPEG', quality=40)
        r = compose(data, '.jpg', mode='vector')
        self.assertEqual(r['colors'], 3)
        self.assertTrue(r['svg'].startswith('<svg') and r['svg'].count('<path') == 3)
        center = r['images']['white'].getpixel(at(300, 300))  # meio do círculo azul
        self.assertLess(np.abs(np.array(center) - NAVY).max(), 30)

    def test_seam_between_colors_is_not_a_dark_ring(self):
        label = np.zeros((60, 200), np.uint8); label[:, 90:102] = 2; label[:, 102:] = 1
        fg = np.ones_like(label, bool)
        self.assertFalse((eap.refine(label.copy(), fg, np.zeros_like(fg), 3, 9) == 2).any())
        inner = np.zeros((60, 200), np.uint8); inner[20:40, 50:56] = 1  # traço fino de outra cor dentro de um selo
        self.assertEqual((eap.refine(inner.copy(), fg, np.zeros_like(fg), 2, 9) == 1).sum(), 120)

    def test_transparent_input_and_light_logo(self):
        r = compose(encode(logo(bg=(0, 0, 0, 0), mode='RGBA')))
        self.assertEqual(r['threshold'], None)  # usa a transparência original
        self.assertEqual(r['images']['transparent'].getpixel((5, 5))[3], 0)

    def test_keep_inner_preserves_white_text_inside_badge(self):
        im = Image.new('RGB', (900, 900), 'white'); d = ImageDraw.Draw(im)
        d.rectangle((100, 250, 800, 650), fill=(200, 20, 40)); d.rectangle((300, 400, 600, 500), fill='white')
        data = encode(im)
        hole = compose(data)['images']['transparent'].getpixel((512, 512))[3]
        kept = compose(data, keepInner=True)['images']['transparent'].getpixel((512, 512))
        self.assertEqual(hole, 0); self.assertEqual(kept[3], 255); self.assertGreater(min(kept[:3]), 240)

    def test_lighten_dark_changes_only_neutral_dark_on_black(self):
        data = encode(logo())
        normal, lit = compose(data)['images'], compose(data, lightenDark=True)['images']
        (x0, y0), (x1, y1) = at(680, 375), at(960, 405)
        gray_px = tuple(int(v) for v in np.asarray(lit['black'])[y0:y1, x0:x1].reshape(-1, 3).mean(axis=0))
        self.assertGreater(min(gray_px), 200)  # cinza escuro virou branco
        self.assertEqual(normal['white'].tobytes(), lit['white'].tobytes())  # só a versão preta muda
        center = np.array(lit['black'].getpixel(at(300, 300)))
        self.assertLess(np.abs(center - NAVY).max(), 30)  # azul da marca preservado
        self.assertTrue(any('fundo preto' in n for n in compose(data)['notes']))

    def test_settings_are_validated(self):
        for bad in ({'mode': 'x'}, {'margin': .5}, {'colors': 9}, {'threshold': 300}, {'smooth': 'nan'}):
            with self.assertRaises(ValueError): eap.settings(bad)

    def test_export_writes_selected_versions_and_never_overwrites(self):
        upload = api('/api/eap/upload', query={'name': ['cliente.jpg']}, raw=encode(logo().resize((300, 150)), 'JPEG', quality=40))
        self.assertEqual(upload['assessment']['recommended'], 'vector')
        preview = api('/api/eap/preview', {'id': upload['id'], 'settings': {'mode': 'vector'}})
        self.assertTrue(all(v.startswith('data:image/png;base64,') for v in preview['previews'].values()))
        with tempfile.TemporaryDirectory() as folder:
            body = {'id': upload['id'], 'settings': {'mode': 'vector'}, 'folder': folder, 'name': 'EAP - Cliente',
                    'versions': ['white', 'black', 'transparent'], 'svg': True}
            result = api('/api/eap/export', body)
            names = sorted(p.name for p in Path(folder).iterdir())
            self.assertEqual(names, ['EAP - Cliente - fundo branco.png', 'EAP - Cliente - fundo preto.png', 'EAP - Cliente - transparente.png', 'EAP - Cliente.svg'])
            self.assertEqual(len(result['files']), 4)
            with Image.open(Path(folder) / 'EAP - Cliente - transparente.png') as im: self.assertEqual((im.size, im.mode), ((1024, 1024), 'RGBA'))
            before = {n: (Path(folder) / n).read_bytes() for n in names}
            with self.assertRaises(server.Conflict): api('/api/eap/export', body | {'settings': {'mode': 'clean'}, 'svg': False})
            self.assertEqual({n: (Path(folder) / n).read_bytes() for n in names}, before)

    def test_invalid_requests_are_rejected(self):
        with self.assertRaises(ValueError): api('/api/eap/preview', {'id': '../x', 'settings': {}})
        upload = api('/api/eap/upload', query={'name': ['l.png']}, raw=encode(logo()))
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'ao menos uma'):
                api('/api/eap/export', {'id': upload['id'], 'settings': {}, 'folder': folder, 'name': 'X', 'versions': []})

def patterned(size=400):
    """Texto amarelo sobre estampa (fundo verde com manchas laranja e anéis escuros), como o EXAGERADO."""
    im = Image.new('RGB', (size, size), (126, 149, 70)); d = ImageDraw.Draw(im)
    rng = np.random.default_rng(3)
    for _ in range(260):
        x, y = rng.integers(0, size, 2); r = int(rng.integers(8, 18))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(236, 117, 79), outline=(57, 52, 46), width=3)
    d.rectangle((100, 120, 300, 180), fill=(245, 179, 73)); d.rectangle((100, 220, 300, 280), fill=(245, 179, 73))
    return im

class EapHardCasesTests(unittest.TestCase):
    def test_patterned_background_is_detected(self):
        r = compose(encode(patterned()))
        self.assertFalse(r['flatBackground'])
        self.assertTrue(any('não é liso' in n for n in r['notes']))
        self.assertTrue(compose(encode(logo()))['flatBackground'])

    def test_keep_whole_art_fills_square_without_removing_anything(self):
        r = compose(encode(patterned()), background='keep', mode='vector')
        alpha = np.asarray(r['images']['transparent'].getchannel('A'))
        self.assertEqual(alpha[512, 512], 255); self.assertEqual(alpha[110, 110], 255)  # estampa preservada
        self.assertGreaterEqual(r['colors'], 3)

    def test_pick_isolates_clicked_color_everywhere_and_adds_outline(self):
        data = encode(patterned())
        with self.assertRaisesRegex(ValueError, 'Clique'): compose(data, background='pick')
        r = compose(data, background='pick', picks=[[.5, .375]], outlinePx=8, outlineColor='#102030')
        alpha = np.asarray(r['images']['transparent'].getchannel('A'))
        rows = np.flatnonzero((alpha > 128).any(axis=1))
        self.assertGreater(rows[-1] - rows[0], 600)  # as duas barras amarelas, não só a clicada
        transparent = r['images']['transparent']
        self.assertEqual(transparent.getpixel((512, 512))[3], 0)  # vão entre as barras: estampa removida
        edge = np.asarray(transparent)[(alpha > 250) & (np.asarray(transparent)[..., 2] > 40) & (np.asarray(transparent)[..., 2] < 60)]
        self.assertGreater(len(edge), 100)  # contorno na cor escolhida
        only = compose(data, background='pick', picks=[[.5, .375]], connected=True)['images']['transparent']
        rows = np.flatnonzero((np.asarray(only.getchannel('A')) > 128).any(axis=1))
        self.assertLess(rows[-1] - rows[0], 400)  # “só a parte ligada”: apenas a barra clicada

    def test_pick_assessment_uses_source_resolution(self):
        r = compose(encode(patterned().resize((200, 200))), background='pick', picks=[[.5, .375]])
        self.assertLessEqual(max(r['assessment']['artPx']), 110)
        self.assertEqual(r['assessment']['recommended'], 'vector')

    def test_seam_fix_is_automatic_only_for_compressed_jpeg(self):
        self.assertTrue(compose(encode(logo().resize((300, 150)), 'JPEG', quality=40), '.jpg', mode='vector')['fixSeams'])
        self.assertFalse(compose(encode(logo()), mode='vector')['fixSeams'])

    def test_fast_trace_matches_potracer(self):
        import potrace
        from modules.vector import trace_bitmap
        mask = np.asarray(patterned().convert('L')) < 100
        ref = [[(seg.end_point.x, seg.end_point.y) for seg in c] for c in potrace.Bitmap(~mask).trace(turdsize=4)]
        new = [[(seg.end_point.x, seg.end_point.y) for seg in c] for c in trace_bitmap(mask, turdsize=4)]
        self.assertEqual(ref, new)

if __name__ == '__main__':
    unittest.main()
