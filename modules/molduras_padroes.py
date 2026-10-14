"""Patterns das molduras: um módulo (pronto, vetorial importado ou imagem) repetido em grade desencontrada,
aplicado no fundo ou dentro de uma forma. Vetores são recortados no contorno do alvo (sem pedaços escondidos no PDF);
imagens viram uma camada de bitmap só na hora do PDF. A grade é a mesma da prévia: centros girados em torno da origem
da folha, fileiras alternadas deslocadas meio passo (a prévia usa um <pattern> do SVG com a mesma conta)."""
import io
import json
import math
import numpy
import pymupdf
from PIL import Image, ImageDraw
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box, MultiPolygon, GeometryCollection
from shapely.ops import unary_union
from shapely.validation import make_valid
from . import molduras as M, molduras_layouts as L

MAX_MODULOS = 6000
DPI_IMAGEM = 120          # patterns de imagem no PDF; a 1,5 m de distância da TV não se vê a diferença para 300 dpi


# ---------- geometria ----------
def poligonos(geom):
    if geom is None or geom.is_empty: return []
    if isinstance(geom, Polygon): return [geom]
    if isinstance(geom, (MultiPolygon, GeometryCollection)):
        return [p for g in geom.geoms for p in poligonos(g)]
    return []


def geometria_d(d, evenodd=True):
    """Área de um caminho M/L/C/Z (curvas aproximadas em segmentos)."""
    rings = [r for r in M.achatar(M.subcaminhos(d), passos=12) if len(r) >= 3]
    geom = None
    for r in rings:
        p = make_valid(Polygon(r))
        if geom is None: geom = p
        else: geom = geom.symmetric_difference(p) if evenodd else geom.union(p)
    return make_valid(geom) if geom is not None else GeometryCollection()


def d_geometria(geom):
    partes = []
    for p in poligonos(geom):
        for anel in [p.exterior, *p.interiors]:
            c = list(anel.coords)[:-1]
            if len(c) >= 3: partes.append('M' + ' L'.join(f'{x:.3f} {y:.3f}' for x, y in c) + ' Z')
    return ' '.join(partes)


def unitario(geom):
    """Módulo centrado na origem, com o lado maior medindo 1."""
    x0, y0, x1, y1 = geom.bounds
    s = 1 / max(x1 - x0, y1 - y0, 1e-9)
    return affinity.scale(affinity.translate(geom, -(x0 + x1) / 2, -(y0 + y1) / 2), s, s, origin=(0, 0))


# ---------- módulos prontos ----------
def _g(d): return geometria_d(d, evenodd=False)
def _par(d): return geometria_d(d, evenodd=True)


def _prontos():
    c = L.circulo_d; p = L.pilula_d; po = L.poligono_d
    estrela = lambda n, r1, r2: po([((r1 if i % 2 == 0 else r2) * math.sin(i * math.pi / n), -(r1 if i % 2 == 0 else r2) * math.cos(i * math.pi / n)) for i in range(2 * n)])
    coracao = _g(c(-.25, -.12, .27) + ' ' + c(.25, -.12, .27)).union(_g(po([(-.5, -.02), (.5, -.02), (0, .5)])))
    gota = _g(c(0, .15, .32)).union(_g(po([(-.29, .02), (.29, .02), (0, -.5)])))
    maca = _g(c(-.15, .08, .3) + ' ' + c(.15, .08, .3)).union(_g(L.folha_d(0, -.22, .32, .1, -1.2)))
    halter = _g(L.ret_d(-.42, -.18, -.28, .18, .04) + ' ' + L.ret_d(.28, -.18, .42, .18, .04) + ' ' + L.ret_d(-.3, -.05, .3, .05)
                + ' ' + L.ret_d(-.5, -.1, -.42, .1, .02) + ' ' + L.ret_d(.42, -.1, .5, .1, .02))
    baguete = _g(p(0, 0, 1, .32, -.35)).difference(unary_union([_g(p(x, y, .22, .05, .6)) for x, y in [(-.22, .08), (0, 0), (.22, -.08)]]))
    grao = _g(p(0, 0, .7, .48, .5)).difference(_g(L.faixa_arco_d(-.25, .35, .5, .05, -1.35, -.45)))
    pao = _g('M-.45 .3 L-.45 -.05 C-.45 -.42 .45 -.42 .45 -.05 L.45 .3 Z').difference(
        unary_union([_g(p(x, -.12, .2, .05, -1.1)) for x in (-.18, 0, .18)]))
    cupcake = _g(po([(-.32, 0), (.32, 0), (.22, .45), (-.22, .45)])).union(_g(c(-.2, -.05, .16) + ' ' + c(.2, -.05, .16) + ' ' + c(0, -.2, .22)))
    hamburguer = _g('M-.45 -.05 C-.45 -.45 .45 -.45 .45 -.05 Z').union(_g(p(0, .07, .96, .14, 0))).union(_g(L.ret_d(-.43, .19, .43, .36, .08)))
    xicara = _g(L.ret_d(-.35, -.2, .2, .28, .1)).union(_par(L.anel_d(.25, .02, .17, .07)))
    folha = _g(L.folha_d(-.5, 0, 1, .3, 0))
    # espiga em pé: haste curta e grãos graúdos em pares, apontando para cima
    graos = [_g(p(0, .05, .9, .07, math.pi / 2)), _g(p(0, -.42, .22, .14, math.pi / 2))]
    for i in range(4):
        y = .25 - i * .17
        graos += [_g(p(-.1, y - .02, .26, .13, math.pi / 2 + .6)), _g(p(.1, y - .02, .26, .13, math.pi / 2 - .6))]
    espiga = unary_union(graos)
    onda = LineString([(x / 20 - .5, .18 * math.sin((x / 20) * 2 * math.pi)) for x in range(21)]).buffer(.11, cap_style='round')
    out = {
        'circulo': ('Bolinha', _g(c(0, 0, .5))), 'anel': ('Anel', _par(L.anel_d(0, 0, .5, .16))), 'ponto': ('Trio de pontos', _g(c(0, -.28, .2) + ' ' + c(-.3, .25, .2) + ' ' + c(.3, .25, .2))),
        'mais': ('Cruz', _g(L.mais_d(0, 0, 1, .32))), 'coracao': ('Coração', coracao), 'gota': ('Gota', gota),
        'estrela': ('Estrela', _g(estrela(5, .5, .22))), 'brilho': ('Brilho', _g(estrela(4, .5, .12))), 'oferta': ('Selo de oferta', _g(estrela(12, .5, .4))),
        'raio': ('Raio', _g(po([(.1, -.5), (-.3, .05), (-.02, .05), (-.12, .5), (.3, -.08), (.02, -.08)]))),
        'chevron': ('Seta', _g(po([(-.4, -.5), (0, -.5), (.4, 0), (0, .5), (-.4, .5), (0, 0)]))),
        'losango': ('Losango', _g(po([(0, -.5), (.35, 0), (0, .5), (-.35, 0)]))), 'diagonal': ('Traço', _g(p(0, 0, 1, .16, -.785))),
        'onda': ('Onda', onda),
        'folha': ('Folha', folha), 'maca': ('Fruta', maca), 'halter': ('Halter', halter), 'confeito': ('Confeito', _g(p(0, 0, 1, .32, -.6))),
        'baguete': ('Baguete', baguete), 'grao': ('Grão de café', grao), 'pao': ('Pão', pao), 'espiga': ('Espiga', espiga),
        'cupcake': ('Cupcake', cupcake), 'hamburguer': ('Hambúrguer', hamburguer), 'xicara': ('Xícara', xicara),
    }
    return {k: (nome, unitario(make_valid(g))) for k, (nome, g) in out.items()}


PRONTOS = _prontos()
POR_SEGMENTO = {
    'supermercados': ['maca', 'oferta', 'folha', 'circulo'], 'academias': ['halter', 'raio', 'chevron', 'diagonal'],
    'restaurantes': ['folha', 'losango', 'onda', 'coracao'], 'lanchonetes': ['hamburguer', 'gota', 'estrela', 'circulo'],
    'clinicas': ['mais', 'coracao', 'gota', 'anel'], 'saloes': ['brilho', 'folha', 'coracao', 'ponto'],
    'padarias': ['espiga', 'pao', 'baguete', 'grao'], 'confeitarias': ['cupcake', 'confeito', 'coracao', 'estrela'],
    'conveniencias': ['raio', 'estrela', 'xicara', 'oferta'], 'corporativo': ['ponto', 'diagonal', 'mais', 'anel'],
}


def catalogo():
    return {'modulos': {k: {'nome': nome, 'd': d_geometria(g)} for k, (nome, g) in PRONTOS.items()}, 'porSegmento': POR_SEGMENTO}


# ---------- parâmetros e grade ----------
def parametros(v):
    try:
        tamanho, espacamento, giro = float(v.get('tamanho', 2.5)), float(v.get('espacamento', 1)), float(v.get('giro', 0))
    except (TypeError, ValueError): raise ValueError('Ajustes do pattern inválidos.') from None
    if not (.5 <= tamanho <= 15 and 0 <= espacamento <= 4 and -360 <= giro <= 360) or not all(map(math.isfinite, (tamanho, espacamento, giro))):
        raise ValueError('Pattern: tamanho de 0,5 a 15 cm, espaçamento até 400% e giro até 360°.')
    return tamanho, espacamento, giro


def centros(area, passo, giro):
    """Centros da grade (fileiras pares deslocadas meio passo), girada em torno da origem da folha, que cobrem a área."""
    a = math.radians(giro); ca, sa = math.cos(a), math.sin(a)
    x0, y0, x1, y1 = area.bounds
    cantos = [(x * ca + y * sa, -x * sa + y * ca) for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))]   # para o referencial da grade
    u0, u1 = min(c[0] for c in cantos) - passo, max(c[0] for c in cantos) + passo
    v0, v1 = min(c[1] for c in cantos) - passo, max(c[1] for c in cantos) + passo
    n = ((u1 - u0) / passo + 2) * ((v1 - v0) / passo + 2)
    if n > MAX_MODULOS * 6: raise ValueError('Pattern miúdo demais para esta área. Aumente o tamanho ou o espaçamento.')
    out = []
    for j in range(math.floor(v0 / passo), math.ceil(v1 / passo) + 1):
        for i in range(math.floor(u0 / passo) - 1, math.ceil(u1 / passo) + 1):
            u, v = i * passo + (passo / 2 if j % 2 else 0), j * passo
            out.append((u * ca - v * sa, u * sa + v * ca))
    return out


def area_alvo(g, alvo):
    """Onde o pattern aparece: o fundo inteiro (área com sangria) ou uma forma; a tela da TV fica de fora."""
    s, j = g['sangria'], g['janela']
    folha = box(s['x0'], s['y0'], s['x1'], s['y1'])
    geom = folha if alvo in (None, '', 'fundo') else geometria_d(alvo['d'], alvo.get('regra') == 'evenodd').intersection(folha)
    return make_valid(geom.difference(box(j['x0'] + .3, j['y0'] + .3, j['x1'] - .3, j['y1'] - .3)))


def aplicar_vetor(grupos, g, alvo, tamanho, espacamento, giro):
    """Grupos [(cor, geometria unitária)] repetidos e recortados na área: devolve [{d, cor, grupo}]."""
    area = area_alvo(g, alvo)
    if area.is_empty: raise ValueError('A forma escolhida fica toda atrás da tela da TV. Escolha outra.')
    passo = tamanho * (1 + espacamento)
    pts = [c for c in centros(area, passo, giro) if area.distance(Point(c)) < tamanho]
    if len(pts) > MAX_MODULOS: raise ValueError('Pattern miúdo demais para esta área. Aumente o tamanho ou o espaçamento.')
    out = []
    for i, (cor, unit) in enumerate(grupos):
        # 0,1 mm de tolerância nas curvas: invisível na impressão e deixa o arquivo bem mais leve
        base = affinity.rotate(affinity.scale(unit, tamanho, tamanho, origin=(0, 0)), giro, origin=(0, 0)).simplify(.01)
        pecas = unary_union([affinity.translate(base, x, y) for x, y in pts]).intersection(area)
        d = d_geometria(pecas)
        if d: out.append({'d': d, 'cor': cor, 'grupo': i})
    if not out: raise ValueError('O pattern não coube na área escolhida. Diminua o tamanho.')
    return out


# ---------- importação ----------
def importar(raw, ext):
    """Arquivo do usuário → ('vetor', grupos [(cor, geometria unitária)], aviso) ou ('imagem', PIL RGBA, aviso)."""
    pdf, previa, _ = M.preparar_logo(raw, ext)
    if not pdf: return 'imagem', previa, None
    page = pymupdf.open('pdf', pdf)[0]
    por_cor, ignorados = {}, 0
    for dr in page.get_drawings():
        if dr.get('fill') is None: ignorados += 1; continue
        partes, cur = [], None
        for it in dr['items']:
            if it[0] == 're': r = it[1]; partes.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]); cur = None; continue
            if it[0] == 'qu': q = it[1]; partes.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]); cur = None; continue
            a = (it[1].x, it[1].y)
            if cur is None or math.dist(a, cur[-1]) > .01: cur = [a]; partes.append(cur)
            if it[0] == 'l': cur.append((it[2].x, it[2].y))
            elif it[0] == 'c':
                p0, c1, c2, p3 = a, (it[2].x, it[2].y), (it[3].x, it[3].y), (it[4].x, it[4].y)
                for k in range(1, 11):
                    t = k / 10; m = 1 - t
                    cur.append((m ** 3 * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t ** 3 * p3[0],
                                m ** 3 * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t ** 3 * p3[1]))
        geom = None
        for anel in partes:
            if len(anel) < 3: continue
            p = make_valid(Polygon(anel))
            geom = p if geom is None else (geom.symmetric_difference(p) if dr.get('even_odd') else geom.union(p))
        if geom is None or geom.is_empty: continue
        cor = M.hexa(dr['fill'][:3]) if len(dr['fill']) >= 3 else '#000000'
        # o que vem depois cobre o que veio antes, como no arquivo original
        for outra in list(por_cor): por_cor[outra] = por_cor[outra].difference(geom)
        por_cor[cor] = por_cor[cor].union(geom) if cor in por_cor else geom
    grupos = [(c, g) for c, g in por_cor.items() if not g.is_empty and g.area > 1e-6]
    if not grupos: return 'imagem', previa, 'O arquivo não tem formas preenchidas; ele foi usado como imagem.'
    junto = unary_union([g for _, g in grupos])
    x0, y0, x1, y1 = junto.bounds; s = 1 / max(x1 - x0, y1 - y0)
    norm = lambda g: affinity.scale(affinity.translate(g, -(x0 + x1) / 2, -(y0 + y1) / 2), s, s, origin=(0, 0))
    aviso = 'Linhas sem preenchimento do arquivo foram ignoradas.' if ignorados else None
    if page.get_text().strip(): aviso = 'Textos que não estão em curvas foram ignorados. Converta-os em curvas no Illustrator.'
    return 'vetor', [(c, make_valid(norm(g))) for c, g in sorted(grupos, key=lambda cg: -cg[1].area)], aviso


def grupos_json(grupos):
    return [{'cor': c, 'd': d_geometria(g)} for c, g in grupos]


def grupos_de_json(dados):
    return [(item['cor'], geometria_d(item['d'], evenodd=True)) for item in dados]


# ---------- pattern de imagem no PDF ----------
def camada_imagem(img, proporcao, d_alvo, tamanho, espacamento, giro, opacidade):
    """Bitmap RGBA da área do alvo com a imagem repetida (mesma grade da prévia) e o retângulo onde ele entra (cm)."""
    area = geometria_d(d_alvo, evenodd=True)
    if area.is_empty: return None, None
    x0, y0, x1, y1 = area.bounds
    dpi = DPI_IMAGEM
    while max(x1 - x0, y1 - y0) / 2.54 * dpi > 9000: dpi *= .8
    px = dpi / 2.54
    W, H = max(1, round((x1 - x0) * px)), max(1, round((y1 - y0) * px))
    camada = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    w = tamanho; h = tamanho / proporcao
    if h > tamanho: h, w = tamanho, tamanho * proporcao
    modulo = img.convert('RGBA').resize((max(1, round(w * px)), max(1, round(h * px))), Image.LANCZOS)
    if giro: modulo = modulo.rotate(-giro, expand=True, resample=Image.BICUBIC)
    passo = tamanho * (1 + espacamento)
    for cx, cy in centros(area, passo, giro):
        if area.distance(Point(cx, cy)) > tamanho: continue
        camada.paste(modulo, (round((cx - x0) * px - modulo.width / 2), round((cy - y0) * px - modulo.height / 2)), modulo)
    mascara = Image.new('L', (W, H), 0); desenho = ImageDraw.Draw(mascara)
    para_px = lambda cs: [((x - x0) * px, (y - y0) * px) for x, y in cs]
    for p in poligonos(area):
        desenho.polygon(para_px(p.exterior.coords), fill=255)
        for furo in p.interiors: desenho.polygon(para_px(furo.coords), fill=0)
    alfa = Image.fromarray(numpy.minimum(numpy.asarray(camada.getchannel('A')), numpy.asarray(mascara)))
    if opacidade < 1: alfa = alfa.point(lambda v: round(v * opacidade))
    camada.putalpha(alfa)
    buf = io.BytesIO(); camada.save(buf, 'PNG', optimize=True)
    return buf.getvalue(), (x0, y0, x1, y1)
