import io
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

class PackagingTests(unittest.TestCase):
    def test_payload_contains_ofertas_templates_and_video_tools(self):
        helper = Path(__file__).resolve().parents[1] / 'packaging/build_payload.py'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            app, work = root/'app', root/'work'
            build = work/'build'; build.mkdir(parents=True)
            for rel, data in {'version.py':b'VERSION="1.8.0"', 'portable.py':b'# portable', 'modules/videos.py':b'# videos',
                              'static/app.js':b'// app', 'ofertas/motor/package.json':b'{}',
                              'ofertas/templates/example/index.html':b'<html></html>',
                              'tools/ffmpeg/ffmpeg.exe':b'ffmpeg', 'tools/ffmpeg/ffprobe.exe':b'ffprobe'}.items():
                f=app/rel; f.parent.mkdir(parents=True,exist_ok=True); f.write_bytes(data)
            for directory in ('python/Lib', 'python/DLLs', 'wheels'): (work/directory).mkdir(parents=True)
            (work/'python/python.exe').write_bytes(b'python')
            (build/'launcher.exe').write_bytes(b'launcher')
            output=root/'portable.exe'
            subprocess.run([sys.executable,str(helper),str(app),str(work),str(build),str(output)],check=True,capture_output=True)
            content=output.read_bytes();self.assertEqual(content[-16:-8],b'ICPAYLD1')
            size=struct.unpack('<Q',content[-8:])[0]
            with zipfile.ZipFile(io.BytesIO(content[-16-size:-16])) as archive:
                for name in ('app/ofertas/motor/package.json','app/ofertas/templates/example/index.html',
                             'app/tools/ffmpeg/ffmpeg.exe','app/tools/ffmpeg/ffprobe.exe','app/portable.py'):
                    self.assertIn(name,archive.namelist())
