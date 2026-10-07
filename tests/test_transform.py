import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw
from modules import videos
from modules.images import DEFAULT, settings, rotated_size, render


class TransformTests(unittest.TestCase):
    def test_free_rotation_bounds_match_pillow(self):
        for size in [(100, 100), (101, 79), (320, 180)]:
            for angle in [0, 1, 30, 45, 89.5, 90, 180, 270, 315, 359]:
                with self.subTest(size=size, angle=angle):
                    expected = Image.new('RGBA', size).rotate(-angle, expand=True).size
                    self.assertEqual(rotated_size(*size, angle), expected)

    def test_rotation_normalizes_and_rejects_nonfinite(self):
        self.assertEqual(settings({'rotation': -22.5})['rotation'], 337.5)
        self.assertEqual(settings({'rotation': 382.5})['rotation'], 22.5)
        for angle in [float('inf'), float('-inf'), float('nan')]:
            with self.assertRaises(ValueError): settings({'rotation': angle})

    @unittest.skipUnless(videos.available(), 'FFmpeg required')
    def test_free_rotation_export_matches_image_geometry(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            image = Image.new('RGB', (160, 80), 'red')
            ImageDraw.Draw(image).rectangle((80, 0, 159, 79), fill='blue')
            source_image = root / 'source.png'; image.save(source_image)
            source_video = root / 'source.mp4'
            videos.run([videos.tool('ffmpeg'), '-v', 'error', '-y', '-loop', '1', '-i', str(source_image),
                        '-t', '0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(source_video)])
            value = DEFAULT | dict(width=320, height=240, rotation=30, zoom=.7, x=.1, y=-.1, flipH=True,
                                   trimStart=0, trimEnd=.5, speed=1, mute=True, targetMB=.5)
            expected, _ = render(source_image, value)
            output = root / 'rotated.mp4'; videos.export(source_video, output, value)
            actual = videos.frame(output, .2).convert('RGB')
            # Check interior colors and transparent rotation corners against the same transform.
            for y in range(10, 230, 20):
                for x in range(10, 310, 20):
                    color = expected.getpixel((x, y))[:3]
                    if any(max(abs(a-b) for a,b in zip(color,expected.getpixel((x+dx,y+dy))[:3]))>15
                           for dx,dy in [(-4,0),(4,0),(0,-4),(0,4)]): continue
                    if max(color) < 10 or (max(color) > 240 and sorted(color)[1] < 10):
                        self.assertLess(max(abs(a-b) for a,b in zip(color, actual.getpixel((x,y)))), 45, (x,y,color,actual.getpixel((x,y))))

    def test_rotated_logo_preserves_alpha(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'logo.png'
            image = Image.new('RGBA', (100, 60)); ImageDraw.Draw(image).rectangle((10,10,89,49), fill='white'); image.save(path)
            result, _ = render(path, DEFAULT | dict(width=320,height=180,rotation=33,zoom=.5), transparent=True)
            self.assertEqual(result.getpixel((0,0))[3], 0)
            self.assertEqual(result.getpixel((160,90))[3], 255)
