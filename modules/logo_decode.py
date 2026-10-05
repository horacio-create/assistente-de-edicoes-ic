"""Normalize large logo uploads in an isolated, time-bounded worker."""
import io
import sys
import warnings
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 256_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
try:
    with Image.open(io.BytesIO(sys.stdin.buffer.read())) as im:
        im.thumbnail((2048, 2048), Image.Resampling.LANCZOS, reducing_gap=3)
        result = ImageOps.exif_transpose(im).convert('RGBA')
        result.save(sys.stdout.buffer, 'PNG')
except Exception:
    sys.stderr.write('Não foi possível preparar esta logo. Use um PNG válido com até 256 milhões de pixels e 100 MB.')
    sys.exit(1)
