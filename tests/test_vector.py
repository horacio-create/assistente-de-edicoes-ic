import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-vector-tests-')
os.environ.setdefault('INDOOR_DATA', str(Path(SANDBOX.name) / 'data'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ezdxf
from PIL import Image, ImageDraw
import server
from storage import init
from modules import vector

init()

def api(path, data=None, query=None, raw=None):
    return server.api('POST', path, query or {}, raw if raw is not None else json.dumps(data or {}).encode())

def ring(bg='white', ink=(200, 30, 30), mode='RGB', fmt='PNG', size=(800, 400), **save):
    """Anel (contorno externo + furo) e um quadrado: 3 contornos esperados."""
    im = Image.new(mode, size, bg); d = ImageDraw.Draw(im)
    d.ellipse((40, 40, 360, 360), fill=ink); d.ellipse((120, 120, 280, 280), fill=bg)
    d.rectangle((480, 100, 720, 300), fill=ink)
    b = io.BytesIO(); im.save(b, fmt, **save); return b.getvalue()

def read_dxf(data):
    return ezdxf.read(io.StringIO(data.decode('ascii')))

class VectorTests(unittest.TestCase):
    def trace(self, data, ext='.png', **settings):
        return vector.trace(vector.load(data, ext), settings)

    def test_colored_jpg_becomes_closed_contours_at_requested_width(self):
        r = self.trace(ring(fmt='JPEG', quality=60), '.jpg', widthMm=40)
        self.assertEqual(len(r['contours']), 3)
        xs = [x for c in r['contours'] for x, _ in c]; ys = [y for c in r['contours'] for _, y in c]
        self.assertAlmostEqual(max(xs) - min(xs), 40, delta=.1)
        self.assertAlmostEqual((max(xs) + min(xs)) / 2, 0, delta=.1)  # centralizado na origem
        self.assertAlmostEqual((max(ys) + min(ys)) / 2, 0, delta=.1)
        self.assertAlmostEqual(r['height'], 40 * 320 / 680, delta=.2)  # margens não contam

    def test_transparent_png_and_light_logo_on_dark_background(self):
        self.assertEqual(len(self.trace(ring(bg=(0, 0, 0, 0), ink=(20, 20, 80, 255), mode='RGBA'))['contours']), 3)
        self.assertEqual(len(self.trace(ring(bg=(0, 0, 0, 0), ink=(255, 255, 255, 255), mode='RGBA'))['contours']), 3)
        self.assertEqual(len(self.trace(ring(bg=(20, 20, 60), ink='white'), '.png')['contours']), 3)

    def test_invert_engraves_background(self):
        normal, inverted = self.trace(ring()), self.trace(ring(), invert=True)
        self.assertNotEqual(len(normal['contours']), len(inverted['contours']))

    def test_specks_are_removed_by_detail_setting(self):
        im = Image.open(io.BytesIO(ring())).convert('RGB'); d = ImageDraw.Draw(im)
        for i in range(30): d.point((20 + i * 25, 390), fill=(120, 120, 120))
        b = io.BytesIO(); im.save(b, 'PNG')
        self.assertEqual(len(self.trace(b.getvalue(), detailMm=.1)['contours']), 3)

    def test_svg_and_pdf_inputs(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><circle cx="50" cy="50" r="40" fill="#c00"/><rect x="110" y="20" width="70" height="60" fill="navy"/></svg>'
        self.assertEqual(len(self.trace(svg, '.svg')['contours']), 2)
        import pymupdf
        doc = pymupdf.open(); page = doc.new_page(width=200, height=100); page.draw_rect(pymupdf.Rect(20, 20, 120, 80), fill=(0, 0, 0))
        self.assertEqual(len(self.trace(doc.tobytes(), '.pdf')['contours']), 1)

    def test_blank_image_is_reported(self):
        b = io.BytesIO(); Image.new('RGB', (300, 300), 'white').save(b, 'PNG')
        with self.assertRaisesRegex(ValueError, 'Nenhuma arte'): self.trace(b.getvalue())

    def test_dxf_is_r12_with_closed_polylines_and_extents(self):
        r = self.trace(ring(), widthMm=25)
        doc = read_dxf(vector.dxf(r['contours']))
        entities = list(doc.modelspace())
        self.assertEqual(doc.dxfversion, 'AC1009')
        self.assertEqual(len(entities), 3)
        self.assertTrue(all(e.dxftype() == 'POLYLINE' and e.is_closed and e.dxf.layer == vector.LAYER for e in entities))
        self.assertAlmostEqual(doc.header['$EXTMAX'][0] - doc.header['$EXTMIN'][0], 25, delta=.05)

    def test_settings_are_validated(self):
        for bad in ({'widthMm': 0}, {'widthMm': 'nan'}, {'smooth': 3}, {'threshold': 0}, {'detailMm': -1}):
            with self.assertRaises(ValueError): vector.settings(bad)

    def test_export_writes_new_file_and_never_overwrites(self):
        ident = api('/api/vector/upload', query={'name': ['logo.png']}, raw=ring())['id']
        traced = api('/api/vector/trace', {'id': ident, 'settings': {'widthMm': 30}})
        self.assertEqual(traced['contours'], 3)
        with tempfile.TemporaryDirectory() as folder:
            body = {'id': ident, 'settings': {'widthMm': 30}, 'folder': folder, 'name': 'MS6 - Cliente'}
            result = api('/api/vector/export', body)
            dest = Path(folder) / 'MS6 - Cliente.dxf'
            self.assertEqual(result['name'], dest.name)
            original = dest.read_bytes()
            self.assertEqual(len(list(read_dxf(original).modelspace())), 3)
            with self.assertRaises(server.Conflict): api('/api/vector/export', body | {'settings': {'widthMm': 60}})
            self.assertEqual(dest.read_bytes(), original)
            self.assertEqual(sorted(p.name for p in Path(folder).iterdir()), [dest.name])

    def test_invalid_ids_and_formats_are_rejected(self):
        for ident in ('../../segredo', 'x' * 32, None):
            with self.assertRaises(ValueError): api('/api/vector/trace', {'id': ident, 'settings': {}})
        with self.assertRaisesRegex(ValueError, 'Formato'): api('/api/vector/upload', query={'name': ['logo.exe']}, raw=b'MZ')

if __name__ == '__main__':
    unittest.main()
