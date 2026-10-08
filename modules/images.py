import io
import math
import re
import warnings
from PIL import Image, ImageOps, ImageCms
import pymupdf

Image.MAX_IMAGE_PIXELS = 40_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
SUPPORTED = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.pdf'}
DEFAULT = dict(width=1280, height=720, mode='contain', color='#15191e', rotation=0, flipH=False, flipV=False, zoom=1, scaleX=1, scaleY=1, proportionLocked=True, x=0, y=0, safe=True, lockSize=False, lockX=False, lockY=False, lockOutput=False, logoId=None, logoScale=.12, logoX=.97, logoY=.03)

def settings(value):
    s = DEFAULT | value
    s['width'], s['height'] = int(s['width']), int(s['height'])
    if not (64 <= s['width'] <= 7680 and 64 <= s['height'] <= 7680) or s['width'] * s['height'] > 20_000_000:
        raise ValueError('Use dimensões de 64 a 7680 pixels, até 20 milhões de pixels.')
    if s['mode'] not in ('contain', 'cover', 'background') or not re.fullmatch(r'#[0-9a-fA-F]{6}', s['color']):
        raise ValueError('Modo ou cor inválido.')
    for key, low, high in [('zoom', .1, 5), ('scaleX', .1, 5), ('scaleY', .1, 5), ('x', -1, 1), ('y', -1, 1), ('logoScale', .02, .8), ('logoX', 0, 1), ('logoY', 0, 1)]:
        s[key] = float(s[key])
        if not math.isfinite(s[key]) or not low <= s[key] <= high:
            raise ValueError('Ajuste fora do limite.')
    if not isinstance(s['proportionLocked'], bool):
        raise ValueError('Estado da proporção inválido.')
    s['rotation'] = float(s['rotation'])
    if not math.isfinite(s['rotation']):
        raise ValueError('Rotação inválida.')
    s['rotation'] = math.fmod(s['rotation'], 360)
    if s['lockX']: s['x'] = 0
    if s['lockY']: s['y'] = 0
    return s

def rgb(image):
    image = ImageOps.exif_transpose(image)
    if image.mode in ('I;16', 'I;16L', 'I;16B', 'I'):
        image = image.convert('I').point(lambda i: i * (1 / 256)).convert('L')
    profile = image.info.get('icc_profile')
    if profile:
        try:
            image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile('sRGB'), outputMode='RGBA' if 'A' in image.getbands() else 'RGB')
        except Exception:
            pass
    return image.convert('RGBA')

def decode(data, extension):
    if extension == '.pdf':
        with pymupdf.open(stream=data, filetype='pdf') as doc:
            if doc.needs_pass:
                raise ValueError('PDF protegido por senha. Envie uma cópia desbloqueada.')
            if len(doc) > 100:
                raise ValueError('Divida PDFs com mais de 100 páginas.')
            for n, page in enumerate(doc):
                scale = min(2, 3840 / max(page.rect.width, page.rect.height))
                pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
                yield n + 1, Image.frombytes('RGB', (pix.width, pix.height), pix.samples).convert('RGBA'), []
    else:
        with Image.open(io.BytesIO(data)) as im:
            notes = ['Arquivo com múltiplos quadros: usando o primeiro.'] if getattr(im, 'n_frames', 1) > 1 else []
            yield None, rgb(im), notes

def dominant(im):
    base = Image.new('RGBA', im.size, 'white')
    base.alpha_composite(im)
    small = base.convert('RGB').resize((64, 64)).quantize(colors=5).convert('RGB')
    color = max(small.getcolors(4096), key=lambda pair: pair[0])[1]
    return '#%02x%02x%02x' % color

def rotated_size(width, height, rotation):
    """Expanded bounds, including Pillow's integer pixel rounding."""
    if rotation % 90 == 0:
        return (height, width) if rotation % 180 else (width, height)
    angle = math.radians(rotation)
    cosine, sine = abs(round(math.cos(angle), 15)), abs(round(math.sin(angle), 15))
    span_x, span_y = width*cosine + height*sine, width*sine + height*cosine
    return (math.ceil((width+span_x)/2)-math.floor((width-span_x)/2),
            math.ceil((height+span_y)/2)-math.floor((height-span_y)/2))


def geometry(width, height, s):
    iw, ih = rotated_size(width, height, s['rotation'])
    factor = 1 if s['lockSize'] else (max if s['mode'] == 'cover' else min)(s['width']/iw, s['height']/ih)*s['zoom']
    dw, dh = max(1, round(width*factor*s.get('scaleX', 1))), max(1, round(height*factor*s.get('scaleY', 1)))
    stretched = s.get('scaleX', 1) != 1 or s.get('scaleY', 1) != 1
    rw, rh = rotated_size(dw, dh, s['rotation']) if stretched else (max(1, round(iw*factor)), max(1, round(ih*factor)))
    if stretched and (dw*dh > 20_000_000 or rw*rh > 20_000_000):
        raise ValueError('Reduza a escala: o esticamento deve ficar abaixo de 20 milhões de pixels.')
    return dict(factor=factor, drawW=dw, drawH=dh, rw=rw, rh=rh,
                x=round((s['width']-rw)/2+s['x']*s['width']),
                y=round((s['height']-rh)/2+s['y']*s['height']))


def render(source, value, logo=None, transparent=False):
    s = settings(value)
    with Image.open(source) as original:
        im = original.convert('RGBA')
    if s['flipH']: im = ImageOps.mirror(im)
    if s['flipV']: im = ImageOps.flip(im)
    w, h = s['width'], s['height']
    g = geometry(im.width, im.height, s)
    factor, rw, rh, x, y = (g[k] for k in ('factor','rw','rh','x','y'))
    result = Image.new('RGBA', (w, h), (0, 0, 0, 0) if transparent else s['color'] if s['mode'] == 'background' else '#000000')
    if s['scaleX'] != 1 or s['scaleY'] != 1:
        # Sample directly into the output canvas, bounding memory even when cropped.
        angle = math.radians(s['rotation']); co, si = math.cos(angle), math.sin(angle)
        sx, sy = g['drawW']/im.width, g['drawH']/im.height
        cx, cy = x+rw/2, y+rh/2
        matrix = (co/sx, si/sx, im.width/2-(co*cx+si*cy)/sx,
                  -si/sy, co/sy, im.height/2+(si*cx-co*cy)/sy)
        layer = im.transform((w,h), Image.Transform.AFFINE, matrix, Image.Resampling.BICUBIC)
        result.alpha_composite(layer)
    else:
        im = im.rotate(-s['rotation'], expand=True, resample=Image.Resampling.BICUBIC if s['rotation'] % 90 else Image.Resampling.NEAREST)
        if rw * rh <= 20_000_000:
            layer = im.resize((rw, rh), Image.Resampling.LANCZOS)
            result.alpha_composite(layer, (round(x), round(y)))
        else:
            layer = im.transform((w, h), Image.Transform.AFFINE, (1/factor, 0, -x/factor, 0, 1/factor, -y/factor), Image.Resampling.BICUBIC)
            result.alpha_composite(layer)
    if logo:
        with Image.open(logo) as asset:
            mark = asset.convert('RGBA')
        scale = min(w * s['logoScale'] / mark.width, h * .8 / mark.height)
        mark = mark.resize((max(1, round(mark.width*scale)), max(1, round(mark.height*scale))), Image.Resampling.LANCZOS)
        result.alpha_composite(mark, (round((w-mark.width)*s['logoX']), round((h-mark.height)*s['logoY'])))
    notes = []
    if factor > 1.05: notes.append('Ampliação: a imagem pode perder nitidez.')
    if x < -.5 or y < -.5 or x + rw > w + .5 or y + rh > h + .5: notes.append('Parte da imagem fica fora da tela. Confira textos e logotipos.')
    if x > .5 or y > .5 or x + rw < w - .5 or y + rh < h - .5: notes.append('Há áreas de fundo visíveis.')
    return result if transparent else result.convert('RGB'), notes

def encoded(im, fmt):
    out = io.BytesIO()
    if fmt == 'jpg': im.save(out, 'JPEG', quality=95, optimize=True, progressive=True, subsampling=0)
    else: im.save(out, 'PNG', optimize=True)
    return out.getvalue()
