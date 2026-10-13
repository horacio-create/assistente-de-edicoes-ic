"""Vetorização M6S: logo → peças (contorno + furos) em mm, sempre com 12 mm de altura → DXF R12 para o laser.
Vetores (SVG, AI, PDF) entram como formas; bitmaps são redesenhados pelo potrace. As peças podem ser editadas à mão."""
import io
import logging
import math
import numpy as np
import ezdxf
from PIL import Image, ImageFilter
import pymupdf
from shapely import affinity, make_valid
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union
from modules.images import rgb

SUPPORTED = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.pdf', '.svg', '.ai'}
HEIGHT_MM = 12.0  # o microfone M6S grava a logo sempre com 12 mm de altura; a largura acompanha a proporção
DEFAULT = dict(threshold=None, invert=False, smooth=1.0, detailMm=.08, denoise=True)
WORK_MIN, WORK_MAX = 2400, 4000  # lado maior da imagem de trabalho, em px
LAYER = 'GRAVACAO'
logging.getLogger('ezdxf').setLevel(logging.ERROR)  # R12 não grava $INSUNITS; o arquivo é em mm.


def settings(value):
    s = DEFAULT | (value or {})
    for key, low, high in [('smooth', 0, 1.33), ('detailMm', 0, 2)]:
        s[key] = float(s[key])
        if not math.isfinite(s[key]) or not low <= s[key] <= high:
            raise ValueError('Ajuste de vetorização fora do limite.')
    if s['threshold'] is not None:
        s['threshold'] = int(s['threshold'])
        if not 1 <= s['threshold'] <= 254: raise ValueError('Sensibilidade fora do limite.')
    s['invert'], s['denoise'] = bool(s['invert']), bool(s['denoise'])
    return s


def load(data, extension):
    """Abre bitmap, PDF/AI (1ª página) ou SVG como RGBA, com vetores rasterizados em alta resolução."""
    if extension in ('.pdf', '.ai', '.svg'):
        try:
            doc = pymupdf.open(stream=data, filetype='svg' if extension == '.svg' else 'pdf')
        except Exception:
            raise ValueError('Arquivo vetorial ilegível. Exporte a logo como PNG ou PDF.') from None
        with doc:
            if doc.needs_pass: raise ValueError('PDF protegido por senha. Envie uma cópia desbloqueada.')
            page = doc[0]
            scale = WORK_MAX / max(page.rect.width, page.rect.height, 1)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=True)
            return Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)
    with Image.open(io.BytesIO(data)) as im:
        return rgb(im)


def ink_mask(im, s):
    """Separa a arte do fundo pela distância de cor ao fundo detectado nas bordas."""
    im = im.convert('RGBA')
    if max(im.size) > WORK_MAX: im.thumbnail((WORK_MAX, WORK_MAX), Image.Resampling.LANCZOS)
    alpha = np.asarray(im.getchannel('A'))
    if (alpha < 128).mean() > .01:
        # Logo transparente: compõe sobre o tom oposto ao da arte para não perder partes claras.
        visible = np.asarray(im.convert('RGB'))[alpha >= 128]
        base = Image.new('RGBA', im.size, 'black' if visible.size and visible.mean() > 200 else 'white')
        base.alpha_composite(im)
        im = base
    px = np.asarray(im.convert('RGB')).astype(np.int16)
    border = np.concatenate([px[0], px[-1], px[:, 0], px[:, -1]])
    distance = Image.fromarray(np.abs(px - np.median(border, axis=0)).max(axis=2).astype(np.uint8))
    if s['denoise']:
        # Remove blocos de JPEG e serrilhado na resolução de origem.
        distance = distance.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(1.2 if max(im.size) < 1200 else .7))
    long_side = max(im.size)
    if long_side < WORK_MIN:
        # Ampliar o mapa contínuo antes do limiar posiciona a borda entre pixels: curvas lisas.
        k = WORK_MIN / long_side
        distance = distance.resize((round(im.width * k), round(im.height * k)), Image.Resampling.BICUBIC)
    distance = np.asarray(distance)
    threshold = s['threshold'] if s['threshold'] is not None else otsu(distance)
    mask = distance >= threshold
    if s['invert']: mask = ~mask
    return mask, threshold


def otsu(values):
    hist = np.bincount(values.ravel(), minlength=256).astype(np.float64)
    total, levels = hist.sum(), np.arange(256)
    weight = np.cumsum(hist)
    mean = np.cumsum(hist * levels)
    between = (mean[-1] * weight / total - mean) ** 2 / np.maximum(weight * (total - weight), 1)
    return int(np.clip(np.argmax(between[:-1]) + 1, 8, 247))


def trace_bitmap(mask, turdsize=2, alphamax=1.0, opttolerance=.2):
    """Potrace sobre `mask` (True = arte), equivalente a potrace.Bitmap(~mask).trace().

    O potracer procura cada novo contorno varrendo a imagem inteira (custo contornos × pixels).
    Os contornos saem da última linha para a primeira e as linhas já tratadas ficam vazias,
    então um cursor de linha dá o mesmo resultado em tempo linear.
    """
    from potrace.potrace import POTRACE_TURNPOLICY_MINORITY, Path, findpath, process_path, xor_path
    bm = np.pad(np.asarray(mask, bool), [(0, 1), (0, 1)], mode='constant')
    original, plist, y = bm.copy(), [], bm.shape[0] - 1
    while True:
        while y >= 0 and not bm[y].any(): y -= 1
        if y < 0: break
        x = int(np.argmax(bm[y]))
        path = findpath(bm, x, y + 1, original[y][x], POTRACE_TURNPOLICY_MINORITY)
        xor_path(bm, path)
        if path.area > turdsize: plist.append(path)
    process_path(plist, alphamax=alphamax, opticurve=True, opttolerance=opttolerance)
    return Path(plist)


def bezier(p0, p1, p2, p3, tolerance):
    """Achata uma curva cúbica em segmentos com erro máximo próximo de `tolerance`."""
    size = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
    steps = max(2, min(64, math.ceil(math.sqrt(size / tolerance))))
    points = []
    for i in range(1, steps + 1):
        t = i / steps; u = 1 - t
        points.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                       u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return points


def trace(im, value):
    """Retorna contornos fechados em mm (Y para cima, centralizados na origem) e avisos."""
    s = settings(value)
    mask, threshold = ink_mask(im, s)
    rows, cols = np.any(mask, axis=1), np.any(mask, axis=0)
    if not rows.any() or mask.all():
        raise ValueError('Nenhuma arte separada do fundo. Ajuste a sensibilidade ou use “Inverter”.')
    top, bottom = np.flatnonzero(rows)[[0, -1]]
    left, right = np.flatnonzero(cols)[[0, -1]]
    mm = HEIGHT_MM / (bottom - top + 1)  # mm por pixel; a altura vale para a arte, sem margens
    turd = int((s['detailMm'] / mm) ** 2)
    # potracer inverte o bitmap recebido: True = fundo.
    path = trace_bitmap(mask, turdsize=turd, alphamax=s['smooth'])
    cx, cy = (left + right + 1) / 2, (top + bottom + 1) / 2
    tolerance = .004 / mm  # 4 µm de desvio máximo ao achatar curvas
    contours = []
    for curve in path:
        pts, start = [], curve.start_point
        cursor = (start.x, start.y)
        for seg in curve:
            end = (seg.end_point.x, seg.end_point.y)
            if seg.is_corner:
                pts += [(seg.c.x, seg.c.y), end]
            else:
                pts += bezier(cursor, (seg.c1.x, seg.c1.y), (seg.c2.x, seg.c2.y), end, tolerance)
            cursor = end
        poly = [(round((x - cx) * mm, 4), round((cy - y) * mm, 4)) for x, y in pts]
        poly = [p for i, p in enumerate(poly) if p != poly[i - 1]]
        if len(poly) >= 3: contours.append(poly)
    if not contours: raise ValueError('Os detalhes ficaram pequenos demais. Reduza “Remover detalhes”.')
    width = (right - left + 1) * mm
    notes = []
    thin = thin_fraction(mask[top:bottom + 1, left:right + 1], .1 / mm)
    if thin > .02: notes.append(f'{thin:.0%} da arte tem traços com menos de 0,1 mm nesse tamanho; podem sumir na gravação.')
    if mm > .05 and max(im.size) < 600:
        notes.append('Imagem de baixa resolução: confira curvas e textos pequenos na prévia.')
    if len(contours) > 400: notes.append('Muitos contornos: pode haver ruído ou textura. Aumente “Remover detalhes”.')
    return dict(contours=contours, width=round(width, 3), height=HEIGHT_MM, threshold=threshold,
                points=sum(map(len, contours)), notes=notes)


def thin_fraction(mask, radius):
    """Fração da arte que desaparece ao erodir pelo raio dado (estima traços finos)."""
    r = int(radius)
    if r < 1 or mask.sum() == 0: return 0.
    eroded = mask.copy()
    for _ in range(min(r, 40)):
        e = eroded.copy()
        e[1:] &= eroded[:-1]; e[:-1] &= eroded[1:]; e[:, 1:] &= eroded[:, :-1]; e[:, :-1] &= eroded[:, 1:]
        eroded = e
    grown = eroded.copy()
    for _ in range(min(r, 40)):
        g = grown.copy()
        g[1:] |= grown[:-1]; g[:-1] |= grown[1:]; g[:, 1:] |= grown[:, :-1]; g[:, :-1] |= grown[:, 1:]
        grown = g
    return float((mask & ~grown).sum() / mask.sum())


def svg_path(contours):
    return ' '.join('M' + ' L'.join(f'{x:.3f} {-y:.3f}' for x, y in c) + ' Z' for c in contours)


def dxf(contours):
    """DXF R12 (AC1009) com POLYLINE fechadas, em mm: lido por EzCad, LightBurn e CADs."""
    doc = ezdxf.new('R12')
    doc.layers.add(LAYER, color=7)
    msp = doc.modelspace()
    for c in contours:
        msp.add_polyline2d(c, close=True, dxfattribs={'layer': LAYER})
    xs, ys = [x for c in contours for x, _ in c], [y for c in contours for _, y in c]
    # Extensões corretas fazem o “zoom para tudo” do EzCad/LightBurn enquadrar a arte.
    msp.dxf.extmin, msp.dxf.extmax = (min(xs), min(ys), 0), (max(xs), max(ys), 0)
    out = io.StringIO()
    doc.write(out)
    return out.getvalue().encode('ascii', errors='replace')


# ---------- peças: contorno externo + furos, em mm com Y para cima ----------
MAX_PARTS, MAX_POINTS = 3000, 250_000


def polygons(geom):
    """Só as áreas (descarta linhas e pontos que sobram de operações), como MultiPolygon válido."""
    geom = make_valid(geom)
    found = [g for g in getattr(geom, 'geoms', [geom]) if isinstance(g, (Polygon, MultiPolygon)) and not g.is_empty]
    flat = [p for g in found for p in getattr(g, 'geoms', [g])]
    return MultiPolygon([p for p in flat if p.area > 1e-6])


def geometry_from_contours(contours):
    """Contornos fechados em regra par-ímpar (como o laser lê o DXF) → geometria."""
    geom = Polygon()
    for c in contours:
        if len(c) >= 3: geom = geom.symmetric_difference(make_valid(Polygon(c)))
    return polygons(geom)


def _ring(coords): return [[round(x, 4), round(y, 4)] for x, y in list(coords)[:-1]]


def parts_from_geometry(geom):
    return [{'outer': _ring(p.exterior.coords), 'holes': [_ring(h.coords) for h in p.interiors]}
            for p in sorted(polygons(geom).geoms, key=lambda p: (-p.bounds[3], p.bounds[0]))]


def pieces_from_parts(parts):
    """Peças na mesma ordem da tela (os índices das edições se referem a ela)."""
    if not isinstance(parts, list) or not parts: raise ValueError('O desenho ficou vazio. Desfaça a última edição.')
    if len(parts) > MAX_PARTS: raise ValueError('Desenho com peças demais.')
    total, polys = 0, []
    for part in parts:
        if not isinstance(part, dict): raise ValueError('Peça inválida.')
        rings = [part.get('outer')] + list(part.get('holes') or [])
        for r in rings:
            if not isinstance(r, list) or len(r) < 3: raise ValueError('Peça inválida.')
            total += len(r)
            for pt in r:
                if not (isinstance(pt, list) and len(pt) == 2 and all(isinstance(v, (int, float)) and math.isfinite(v) and abs(v) < 5000 for v in pt)):
                    raise ValueError('Ponto inválido.')
        if total > MAX_POINTS: raise ValueError('Desenho com pontos demais.')
        polys.append(polygons(Polygon(rings[0], rings[1:])))
    return polys


def geometry_from_parts(parts):
    return polygons(unary_union(pieces_from_parts(parts)))


def normalize(geom):
    """Altura de 12 mm, largura proporcional e centro na origem."""
    geom = polygons(geom)
    if geom.is_empty: raise ValueError('O desenho ficou vazio. Desfaça a última edição.')
    x0, y0, x1, y1 = geom.bounds
    k = HEIGHT_MM / max(y1 - y0, 1e-9)
    return polygons(affinity.scale(affinity.translate(geom, -(x0 + x1) / 2, -(y0 + y1) / 2), k, k, origin=(0, 0)))


def contours_from_parts(parts):
    return [c for p in parts for c in [p['outer'], *p['holes']]]


def summary(geom, notes=()):
    """Peças normalizadas para 12 mm, medidas, contagem e avisos, no formato que a tela e a exportação usam."""
    geom = normalize(geom)
    parts = parts_from_geometry(geom)
    x0, y0, x1, y1 = geom.bounds
    notes = list(notes)
    fino = geom.difference(geom.buffer(-.05).buffer(.05))  # áreas com menos de 0,1 mm de espessura
    if geom.area and fino.area / geom.area > .02 and not any('0,1 mm' in n for n in notes):
        notes.append(f'{fino.area / geom.area:.0%} da arte tem traços com menos de 0,1 mm; podem sumir na gravação. Use “Engrossar traços”.')
    contours = contours_from_parts(parts)
    return dict(parts=parts, width=round(x1 - x0, 3), height=round(y1 - y0, 3), contours=len(contours),
                points=sum(map(len, contours)), notes=notes, path=svg_path(contours))


def edit(parts, op, target=None, amount=None):
    """Edições manuais. `target`: lista de índices de peças (vazia = desenho todo) ou {part, hole}."""
    pieces = pieces_from_parts(parts)
    indices = [i for i in (target or []) if isinstance(i, int) and 0 <= i < len(pieces)] if isinstance(target, list) else []
    chosen = indices or list(range(len(pieces)))
    if op == 'apagar':
        if not indices: raise ValueError('Clique numa parte do desenho para apagar.')
        pieces = [p for i, p in enumerate(pieces) if i not in indices]
        if not pieces: raise ValueError('Não dá para apagar o desenho inteiro.')
        return unary_union(pieces)
    if op == 'preencher':
        i, h = (target or {}).get('part') if isinstance(target, dict) else None, (target or {}).get('hole') if isinstance(target, dict) else None
        if not (isinstance(i, int) and 0 <= i < len(pieces) and isinstance(h, int) and pieces[i].geoms and 0 <= h < len(pieces[i].geoms[0].interiors)):
            raise ValueError('Clique num furo do desenho para preencher.')
        p = pieces[i].geoms[0]
        pieces[i] = Polygon(p.exterior, [r for j, r in enumerate(p.interiors) if j != h])
        return unary_union(pieces)
    if op in ('suavizar', 'engrossar'):
        try: amount = float(amount)
        except (TypeError, ValueError): raise ValueError('Quantidade inválida.') from None
        if not 0 < amount <= 1: raise ValueError('Use uma quantidade entre 0 e 1 mm.')
        changed = []
        for i in chosen:
            p = pieces[i]
            if op == 'engrossar': changed.append(p.buffer(amount, join_style='round', quad_segs=8))
            # fecha e abre: arredonda serrilhados para fora e para dentro sem mudar a espessura média
            else: changed.append(p.buffer(amount, quad_segs=8).buffer(-2 * amount, quad_segs=8).buffer(amount, quad_segs=8).simplify(.004))
        result = unary_union([p for i, p in enumerate(pieces) if i not in chosen] + changed)
        if polygons(result).is_empty: raise ValueError('A suavização apagou essas partes. Use um valor menor.')
        return result
    if op == 'normalizar': return unary_union(pieces)
    raise ValueError('Edição desconhecida.')


def subpaths(items, tolerance=.05):
    """Itens de desenho do PyMuPDF (linha, curva, retângulo, quadrilátero) → anéis fechados."""
    rings, cur = [], []
    def point(p): return (float(p.x), float(p.y))
    for item in items:
        kind = item[0]
        if kind in ('re', 'qu'):
            if cur: rings.append(cur); cur = []
            q = item[1].quad if kind == 're' else item[1]
            rings.append([point(q.ul), point(q.ur), point(q.lr), point(q.ll)])
            continue
        start = point(item[1])
        if not cur or math.dist(cur[-1], start) > 1e-6:
            if cur: rings.append(cur)
            cur = [start]
        if kind == 'l': cur.append(point(item[2]))
        elif kind == 'c': cur += bezier(start, point(item[2]), point(item[3]), point(item[4]), tolerance)
    if cur: rings.append(cur)
    return [r for r in rings if len(r) >= 3]


def vector_parts(data, extension):
    """Lê SVG/AI/PDF como formas preenchidas, na ordem de pintura: cor escura soma, branco recorta.
    Devolve (geometria, None), ou (None, motivo) quando o arquivo tem algo que não vira contorno fiel."""
    try:
        doc = pymupdf.open(stream=data, filetype='svg' if extension == '.svg' else 'pdf')
    except Exception:
        return None, 'arquivo vetorial ilegível'
    with doc:
        if doc.needs_pass: return None, 'PDF protegido'
        page = doc[0]
        if page.get_images(): return None, 'o arquivo tem imagens dentro'
        if page.get_text('text').strip(): return None, 'há textos que não foram convertidos em curvas'
        geom = Polygon()
        for d in page.get_drawings():
            fill = d.get('fill')
            if fill is None:
                if d.get('color') is not None and (d.get('width') or 0) > 0: return None, 'há linhas sem preenchimento'
                continue
            if (d.get('fill_opacity') if d.get('fill_opacity') is not None else 1) < .5: continue
            shape = Polygon()
            for r in subpaths(d['items']):
                poly = make_valid(Polygon(r))
                shape = shape.symmetric_difference(poly) if d.get('even_odd') else shape.union(poly)
            ink = .299 * fill[0] + .587 * fill[1] + .114 * fill[2] < .85
            geom = geom.union(shape) if ink else geom.difference(shape)
        geom = polygons(geom)
        if geom.is_empty: return None, 'nenhuma forma preenchida escura'
        return affinity.scale(geom, 1, -1, origin=(0, 0)), None  # PDF tem Y para baixo
