"""Logo EAP: remove o fundo ou vetoriza em cores; entrega PNG 1024×1024 em fundo branco, preto e transparente."""
import io
import math
import re
import numpy as np
import pymupdf
from PIL import Image, ImageFilter
from modules.vector import SUPPORTED, load, otsu, trace_bitmap

SIZE = 1024
WORK_MAX, VECTOR_WORK = 4000, 1600  # lado maior: análise e vetorização (≈2× a arte final)
DEFAULT = dict(mode='clean', background='auto', threshold=None, keepInner=False, picks=[], connected=False, fixSeams=None, colors=None, smooth=1.0,
               detailPx=2.0, margin=.10, outlinePx=0.0, outlineColor=None, lightenDark=False)
VERSIONS = {'white': 'fundo branco', 'black': 'fundo preto', 'transparent': 'transparente'}
JPEG_T50 = 57.625  # média da tabela de luminância padrão do JPEG em qualidade 50


def settings(value):
    s = DEFAULT | (value or {})
    if s['mode'] not in ('clean', 'vector') or s['background'] not in ('auto', 'keep', 'pick'): raise ValueError('Modo inválido.')
    for key, low, high in [('smooth', 0, 1.33), ('detailPx', 0, 20), ('margin', 0, .3), ('outlinePx', 0, 40)]:
        s[key] = float(s[key])
        if not math.isfinite(s[key]) or not low <= s[key] <= high: raise ValueError('Ajuste da logo fora do limite.')
    for key, low, high in [('threshold', 1, 254), ('colors', 1, 8)]:
        if s[key] is not None:
            s[key] = int(s[key])
            if not low <= s[key] <= high: raise ValueError('Ajuste da logo fora do limite.')
    for key in ('keepInner', 'lightenDark', 'connected'): s[key] = bool(s[key])
    if s['fixSeams'] is not None: s['fixSeams'] = bool(s['fixSeams'])
    if s['outlineColor'] is not None and not re.fullmatch(r'#[0-9a-fA-F]{6}', str(s['outlineColor'])): raise ValueError('Cor de contorno inválida.')
    try:
        s['picks'] = [(float(x), float(y)) for x, y in s['picks']][:20]
    except (TypeError, ValueError):
        raise ValueError('Pontos de cor inválidos.') from None
    if not all(0 <= v <= 1 for pt in s['picks'] for v in pt): raise ValueError('Pontos de cor inválidos.')
    return s


def jpeg_quality(data):
    """Estima a qualidade (1–100) de um JPEG pelas tabelas de quantização; None se não for JPEG."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            tables = getattr(im, 'quantization', None)
            if im.format != 'JPEG' or not tables: return None
            scale = np.mean(tables[0]) / JPEG_T50 * 100
    except Exception:
        return None
    return int(np.clip((200 - scale) / 2 if scale <= 100 else 5000 / scale, 1, 100))


def border_connected(background):
    """Fundo ligado às bordas."""
    seeds = np.zeros_like(background)
    seeds[0], seeds[-1], seeds[:, 0], seeds[:, -1] = True, True, True, True
    return connected(background, seeds)


def connected(mask, seeds):
    """Partes de `mask` ligadas às sementes (reconstrução geodésica em resolução reduzida)."""
    h, w = mask.shape
    k = min(1, 800 / max(h, w))
    size = (max(1, round(w * k)), max(1, round(h * k)))
    small = np.asarray(Image.fromarray(mask).resize(size, Image.Resampling.NEAREST))
    region = np.asarray(Image.fromarray(seeds & mask).resize(size, Image.Resampling.BOX)) & small
    for i in range(4000):
        grown = region.copy()
        grown[1:] |= region[:-1]; grown[:-1] |= region[1:]; grown[:, 1:] |= region[:, :-1]; grown[:, :-1] |= region[:, 1:]
        grown &= small
        if i % 8 == 0 and np.array_equal(grown, region): break
        region = grown
    return np.asarray(Image.fromarray(region).resize((w, h), Image.Resampling.NEAREST)) & mask


def flat_palette(rgba, count=None):
    """Paleta só de áreas lisas: transições entre cores (antisserrilhado, JPEG) não viram cores próprias."""
    rgb = rgba.convert('RGB')
    spread = np.max([np.asarray(rgb.getchannel(c).filter(ImageFilter.MaxFilter(3))).astype(np.int16)
                     - np.asarray(rgb.getchannel(c).filter(ImageFilter.MinFilter(3))) for c in 'RGB'], axis=0)
    source = np.asarray(rgba).astype(np.float32)
    flat = (spread < 40) & (source[..., 3] >= 230)
    return palette(source[..., :3], flat if flat.sum() > 200 else source[..., 3] >= 230, count)


def pick_matte(im, s):
    """Mantém só as cores clicadas (por padrão, apenas a parte ligada ao clique)."""
    if not s['picks']: raise ValueError('Clique na logo, na imagem original, para escolher o que manter.')
    clean = Image.merge('RGBA', [*im.convert('RGB').filter(ImageFilter.MedianFilter(3)).split(), im.getchannel('A')])
    colors = flat_palette(clean)
    upscale = 1
    if max(im.size) < 1600:
        # Seleciona sobre a imagem ampliada: a borda entre cores fica lisa em vez de seguir os pixels.
        k = upscale = 1600 / max(im.size)
        size = (round(im.width * k), round(im.height * k))
        im, clean = (x.convert('RGBa').resize(size, Image.Resampling.BICUBIC).convert('RGBA') for x in (im, clean))
    label = np.asarray(Image.fromarray(nearest(np.asarray(clean.convert('RGB')).astype(np.float32), colors)).filter(ImageFilter.ModeFilter(3)))
    h, w = label.shape
    keep = np.zeros((h, w), bool)
    for x, y in s['picks']:
        px, py = min(w - 1, int(x * w)), min(h - 1, int(y * h))
        same = label == label[py, px]
        if s['connected']:
            seed = np.zeros_like(same); seed[max(0, py - 1):py + 2, max(0, px - 1):px + 2] = True
            same = connected(same, seed)
        keep |= same
    alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(.6))
    alpha = Image.fromarray(np.minimum(np.asarray(alpha), np.asarray(im.getchannel('A'))))
    return Image.merge('RGBA', [*im.convert('RGB').split(), alpha]), upscale


def matte(im, s):
    """RGBA com o fundo removido: borda suave pela distância de cor e cores sem halo do fundo.

    Devolve também o limiar usado e se o fundo nas bordas é liso (estampas e fotos não são).
    """
    im = im.convert('RGBA')
    if max(im.size) > WORK_MAX: im.thumbnail((WORK_MAX, WORK_MAX), Image.Resampling.LANCZOS)
    alpha = np.asarray(im.getchannel('A'))
    px = np.asarray(im.convert('RGB')).astype(np.float32)
    border = np.concatenate([px[0], px[-1], px[:, 0], px[:, -1]])
    bg = np.median(border, axis=0)
    # Um anel 4% para dentro também precisa ser majoritariamente fundo: molduras finas enganam a borda.
    d = max(1, round(.04 * min(px.shape[:2])))
    inner = np.concatenate([px[d], px[-1 - d], px[:, d], px[:, -1 - d]])
    def share(ring): return (np.abs(ring - bg).max(axis=1) < 40).mean()
    flat_bg = bool(share(border) > .7 and share(inner) > .5)
    if s['background'] == 'keep': return im, {'threshold': None, 'flatBackground': flat_bg}
    if s['background'] == 'pick':
        cut, upscale = pick_matte(im, s)
        return cut, {'threshold': None, 'flatBackground': flat_bg, 'upscale': upscale}
    if (alpha < 250).mean() > .01:
        return im, {'threshold': None, 'flatBackground': True}  # já é transparente: mantém o recorte original
    distance = Image.fromarray(np.abs(px - bg).max(axis=2).astype(np.uint8)).filter(ImageFilter.MedianFilter(3))
    distance = np.asarray(distance).astype(np.float32)
    t = s['threshold'] if s['threshold'] is not None else otsu(distance.astype(np.uint8))
    a = np.clip((distance - .5 * t) / t, 0, 1)  # rampa de 0,5t a 1,5t: metade da cobertura no limiar
    if s['keepInner']:
        a[(a < .5) & ~border_connected(a < .5)] = 1  # áreas internas da cor do fundo continuam na logo
    # Tira a contaminação da cor do fundo nas bordas semitransparentes.
    edge = (a > .02) & (a < 1)
    px[edge] = np.clip((px[edge] - (1 - a[edge, None]) * bg) / a[edge, None], 0, 255)
    out = np.dstack([px, a * 255]).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA'), {'threshold': t, 'flatBackground': flat_bg}


def crop_art(rgba):
    box = rgba.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not box: raise ValueError('Nenhuma logo separada do fundo. Ajuste a sensibilidade.')
    return rgba.crop(box)


def assess(art, quality, margin, upscale=1):
    """Recomenda vetorizar quando a logo será muito ampliada ou o JPEG está muito comprimido.

    `upscale` desfaz ampliações internas (Isolar por cor), para medir a resolução de origem.
    """
    target = SIZE * (1 - 2 * margin)
    size = [max(1, round(v / upscale)) for v in art.size]
    factor = target / max(size)
    bad = factor > 1.6 or (quality is not None and (quality < 55 or (quality < 80 and factor > 1.15)))
    reasons = []
    if factor > 1.05: reasons.append(f'será ampliada {factor:.1f}×'.replace('.', ','))
    if quality is not None and quality < 80: reasons.append(f'JPEG com qualidade estimada em {quality}%')
    return dict(recommended='vector' if bad else 'clean', factor=round(factor, 2), artPx=size, quality=quality,
                text=('Qualidade baixa: a logo ' + ' e '.join(reasons) + '. Recomendamos vetorizar.') if bad else
                     ('Qualidade razoável: ' + ' e '.join(reasons) + '. Remover o fundo deve bastar.' if reasons else 'Qualidade boa: basta remover o fundo.'))


def fit(art, margin):
    """Centraliza a arte no quadrado 1024×1024 respeitando a margem (reamostragem com alfa pré-multiplicado)."""
    target = SIZE * (1 - 2 * margin)
    k = target / max(art.size)
    size = (max(1, round(art.width * k)), max(1, round(art.height * k)))
    art = art.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(art, ((SIZE - size[0]) // 2, (SIZE - size[1]) // 2))
    return canvas


def palette(rgb, fg, count):
    """Cores principais da arte; com `count` vazio, junta tons próximos e descarta cores residuais."""
    solid = rgb[fg]
    if len(solid) > 200_000: solid = solid[np.random.default_rng(0).choice(len(solid), 200_000, replace=False)]
    sample = Image.fromarray(solid.reshape(1, -1, 3).astype(np.uint8))
    colors = np.array(sample.quantize(colors=count or 8, method=Image.Quantize.MEDIANCUT, kmeans=3).getpalette()[:3 * (count or 8)]).reshape(-1, 3).astype(np.float32)
    if count: return colors
    labels = nearest(solid.astype(np.float32), colors)
    share = np.bincount(labels, minlength=len(colors)) / max(len(labels), 1)
    keep = []
    for i in np.argsort(-share):
        if share[i] < .004: continue
        if any(np.abs(colors[i] - colors[j]).max() < 40 for j in keep): continue
        keep.append(i)
    return colors[keep] if keep else colors[:1]


def nearest(px, colors, with_distance=False):
    best, label = np.full(px.shape[:-1], np.inf, np.float32), np.zeros(px.shape[:-1], np.uint8)
    for i, c in enumerate(colors):
        d = ((px - c) ** 2).sum(axis=-1)
        closer = d < best
        best[closer], label[closer] = d[closer], i
    return (label, best) if with_distance else label


def grow(mask, r):
    m = mask.copy()
    for _ in range(r):
        g = m.copy(); g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]; m = g
    return m


def refine(label, fg, unsure, count, r):
    """Corrige rótulos de cor duvidosos herdando o vizinho sólido mais próximo.

    Duvidosos: pixels longe de todas as cores (mistura de antisserrilhado) e faixas finas de uma cor
    espremidas entre duas outras, típicas de JPEG (contorno escuro entre laranja e azul). Traços finos
    que tocam o fundo, como textos e contornos, são preservados.
    """
    near = [grow((label == c) & fg, 2 * r + 1) for c in range(count)]  # alcança os dois lados de uma faixa de até 2r
    near_bg = grow(~fg, r + 1)
    for c in range(count):
        m = (label == c) & fg
        thin = m & ~grow(~grow(~m, r), r)  # o que some numa abertura de raio r
        if not thin.any(): continue
        others = sum(near[d].astype(np.uint8) for d in range(count) if d != c)
        unsure |= thin & ~near_bg & (others >= 2)
    sure = fg & ~unsure
    for _ in range(4 * r + 8):
        todo = fg & ~sure
        if not todo.any(): break
        for dst, src in (((slice(1, None),), (slice(None, -1),)), ((slice(None, -1),), (slice(1, None),)),
                         ((slice(None), slice(1, None)), (slice(None), slice(None, -1))),
                         ((slice(None), slice(None, -1)), (slice(None), slice(1, None)))):
            take = np.zeros_like(sure); take[dst] = sure[src] & todo[dst]
            shifted = np.zeros_like(label); shifted[dst] = label[src]
            label = np.where(take, shifted, label); sure |= take; todo &= ~take
    return label


def vectorize(art, s):
    """Redesenha a arte em camadas de cor com curvas limpas; devolve o SVG 1024×1024 e a paleta."""
    k = VECTOR_WORK / max(art.size)
    size = (max(1, round(art.width * k)), max(1, round(art.height * k)))
    clean = Image.merge('RGBA', [*art.convert('RGB').filter(ImageFilter.MedianFilter(3)).split(), art.getchannel('A')])
    work = clean.convert('RGBa').resize(size, Image.Resampling.BICUBIC).convert('RGBA')
    px = np.asarray(work).astype(np.float32)
    fg = px[..., 3] >= 128
    colors = flat_palette(clean, s['colors'])  # na resolução de origem
    label, distance = nearest(px[..., :3], colors, with_distance=True)
    if s['fixSeams']: label = refine(label, fg, (distance >= 45 ** 2) & fg, len(colors), max(1, round(1.6 * k)))
    label = np.asarray(Image.fromarray(label).filter(ImageFilter.ModeFilter(5)))
    order = np.argsort(-np.bincount(label[fg], minlength=len(colors)))
    target = SIZE * (1 - 2 * s['margin'])
    scale = target / max(size)
    ox, oy = (SIZE - size[0] * scale) / 2, (SIZE - size[1] * scale) / 2
    turd = int((s['detailPx'] / scale) ** 2)
    layers = []
    # Camadas empilhadas: cada cor cobre também as seguintes, então não há frestas entre cores vizinhas.
    for n, i in enumerate(order):
        mask = fg & np.isin(label, order[n:])
        if not mask.any(): continue
        d = svg_path(trace_bitmap(mask, turdsize=turd, alphamax=s['smooth']), scale, ox, oy)
        if d: layers.append(('#%02x%02x%02x' % tuple(int(v) for v in colors[i]), d))
    if not layers: raise ValueError('Os detalhes ficaram pequenos demais. Reduza “Remover detalhes”.')
    return layers


def svg_path(path, scale, ox, oy):
    def p(pt): return f'{pt.x * scale + ox:.2f} {pt.y * scale + oy:.2f}'
    parts = []
    for curve in path:
        cmd = ['M' + p(curve.start_point)]
        for seg in curve:
            cmd.append(f'L{p(seg.c)} L{p(seg.end_point)}' if seg.is_corner else f'C{p(seg.c1)} {p(seg.c2)} {p(seg.end_point)}')
        parts.append(' '.join(cmd) + ' Z')
    return ' '.join(parts)


def svg_document(layers, outline=None):
    paths = ''.join(f'<path fill="{color}" fill-rule="evenodd" d="{d}"/>' for color, d in layers)
    if outline:
        # A primeira camada é a silhueta inteira: um traço redondo por baixo vira o contorno.
        color, width = outline
        paths = f'<path fill="{color}" stroke="{color}" stroke-width="{2 * width:.2f}" stroke-linejoin="round" fill-rule="evenodd" d="{layers[0][1]}"/>' + paths
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">{paths}</svg>'


def rasterize(svg):
    with pymupdf.open(stream=svg.encode(), filetype='svg') as doc:
        pix = doc[0].get_pixmap(alpha=True)
        return Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)


def luminance(rgb):
    return rgb[..., 0] * .299 + rgb[..., 1] * .587 + rgb[..., 2] * .114


def dark_weight(rgb, limit=90):
    """Peso 0–1 de tons escuros e neutros (preto, cinza escuro); cores da marca ficam de fora."""
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)
    return np.clip((limit - luminance(rgb)) / 25, 0, 1) * np.clip((60 - chroma) / 20, 0, 1)


def lighten(rgba):
    """Clareia as partes escuras e neutras (para o fundo preto), com transição suave."""
    px = np.asarray(rgba).astype(np.float32)
    # Peso calculado numa cópia suavizada: ruído de JPEG isolado não vira pontos brancos.
    smooth = np.asarray(rgba.convert('RGB').filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32)
    w = dark_weight(smooth)[..., None]
    px[..., :3] = px[..., :3] * (1 - w) + 255 * w
    return Image.fromarray(px.round().astype(np.uint8), 'RGBA')


def outline_raster(logo, width, color):
    """Contorno arredondado de `width` px em volta da silhueta, desenhado por baixo da logo."""
    a = logo.getchannel('A')
    grown = np.asarray(a.filter(ImageFilter.GaussianBlur(width / 2))).astype(np.float32)
    ring = Image.fromarray((np.clip((grown - 3) / 6, 0, 1) * 255).astype(np.uint8))
    base = Image.new('RGBA', logo.size, color); base.putalpha(ring)
    base.alpha_composite(logo)
    return base


def darkest(im):
    colors = flat_palette(im.convert('RGBA'))
    c = colors[np.argmin(luminance(colors))]
    return '#%02x%02x%02x' % tuple(int(v) for v in c)


def contrast_notes(logo):
    px = np.asarray(logo).astype(np.float32)
    a = px[..., 3] / 255
    total = a.sum()
    if not total: return {}
    lum = luminance(px[..., :3])
    return {'darkShare': float((a * (dark_weight(px[..., :3]) > .5)).sum() / total), 'lightShare': float((a * (lum > 200)).sum() / total)}


def compose(im, value, quality=None):
    """Gera as três versões 1024×1024 e, no modo vetor, o SVG."""
    s = settings(value)
    if s['fixSeams'] is None: s['fixSeams'] = quality is not None and quality < 90  # emendas escuras vêm da compressão JPEG
    cut, cut_info = matte(im, s)
    art = crop_art(cut)
    info = assess(art, quality, s['margin'], cut_info.get('upscale', 1))
    outline_color = s['outlineColor'] or darkest(im)
    outline = (outline_color, s['outlinePx']) if s['outlinePx'] > 0 else None
    svg = None
    if s['mode'] == 'vector':
        layers = vectorize(art, s)
        svg = svg_document(layers, outline)
        logo = rasterize(svg)
        dark_outline = (lighten_hex(outline_color), s['outlinePx']) if outline else None
        dark_logo = rasterize(svg_document([(lighten_hex(c), d) for c, d in layers], dark_outline)) if s['lightenDark'] else logo
    else:
        plain = fit(art, s['margin'])
        logo = outline_raster(plain, s['outlinePx'], outline_color) if outline else plain
        dark_logo = lighten(logo) if s['lightenDark'] else logo
    white, black = Image.new('RGBA', (SIZE, SIZE), 'white'), Image.new('RGBA', (SIZE, SIZE), 'black')
    white.alpha_composite(logo); black.alpha_composite(dark_logo)
    contrast = contrast_notes(logo)
    notes = []
    if s['background'] == 'auto' and not cut_info['flatBackground']:
        notes.append('O fundo não é liso (estampa, foto ou textura). Use “Manter arte inteira” ou “Isolar por cor”.')
    if s['mode'] == 'clean' and info['factor'] > 1.6:
        notes.append(f'A logo será ampliada {info["factor"]:.1f}× e pode ficar borrada. Experimente Vetorizar.'.replace('.', ',', 1))
    if contrast.get('darkShare', 0) > .05 and not s['lightenDark']:
        notes.append('Partes escuras somem no fundo preto. Marque “Clarear partes escuras no fundo preto”.')
    if contrast.get('lightShare', 0) > .5:
        notes.append('A logo é clara e tem pouco contraste no fundo branco.')
    return dict(images={'white': white.convert('RGB'), 'black': black.convert('RGB'), 'transparent': logo}, svg=svg,
                assessment=info, threshold=cut_info['threshold'], flatBackground=cut_info['flatBackground'], notes=notes,
                darkShare=round(contrast.get('darkShare', 0), 3), colors=len(layers) if svg else None, outlineColor=outline_color,
                fixSeams=s['fixSeams'])


def lighten_hex(color):
    rgb = np.array([int(color[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    w = float(dark_weight(rgb))
    return '#%02x%02x%02x' % tuple(int(round(v * (1 - w) + 255 * w)) for v in rgb)


def png(im):
    out = io.BytesIO()
    im.save(out, 'PNG', optimize=True)
    return out.getvalue()
