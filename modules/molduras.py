"""Molduras de TV: geometria, layouts, cores do cliente e os dois PDFs de produção (folha de impressão e faca de corte).

A tela monta a moldura com formas vetoriais (caminhos SVG em cm) e papéis de cor; aqui elas viram PDF em CMYK,
no tamanho real, com sangria de 0,5 cm, marcas de corte, logo Indoor Channel e a caixa de identificação."""
import colorsys
import io
import json
import math
import re
from pathlib import Path
import numpy
import pymupdf
from PIL import Image, ImageChops
from . import molduras_geometria as geo_mod
from .molduras_layouts import PAPEIS, catalogo, gerar as gerar_layout

CM = 72 / 2.54
LOGO_IC = json.loads((Path(__file__).parent / 'molduras_dados' / 'logo_indoor.json').read_text(encoding='utf-8'))
TINTA_IC = '#303545'                     # azul-escuro do "channel" nas folhas originais
VERMELHO_FACA = (0, .9, .85, 0)           # linha de corte, em CMYK
PRETO_MARCAS = (0, 0, 0, 1)
LINHA = 2.126                             # pt, espessura das linhas da faca e das marcas, como nos arquivos originais
MAX_FORMAS, MAX_PONTOS = 4000, 400000
FORMATOS_LOGO = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.pdf', '.ai', '.svg'}
HEX = re.compile(r'#[0-9a-fA-F]{6}')
TOKEN = re.compile(r'[MLCZ]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')


# ---------- cores ----------
def rgb(hexa): return tuple(int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
def hexa(c): return '#' + ''.join(f'{round(max(0, min(1, v)) * 255):02X}' for v in c)


def cmyk(hexa_):
    r, g, b = rgb(hexa_)
    k = 1 - max(r, g, b)
    if k >= .999: return (0, 0, 0, 1)
    return ((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k)


def luminancia(hexa_):
    lin = lambda v: v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in rgb(hexa_))
    return .2126 * r + .7152 * g + .0722 * b


def validar_cores(cores):
    if not isinstance(cores, dict): raise ValueError('Cores inválidas.')
    out = {}
    for papel in PAPEIS:
        v = cores.get(papel)
        if not isinstance(v, str) or not HEX.fullmatch(v): raise ValueError('Cores inválidas.')
        out[papel] = v.upper()
    return out


def cor_de(valor, cores):
    if isinstance(valor, str) and HEX.fullmatch(valor): return valor.upper()
    if valor in cores: return cores[valor]
    raise ValueError('Cor inválida numa forma.')


def cores_da_imagem(im, peso=1.0):
    """Cores marcantes de uma imagem: ignora transparência e o branco do fundo; agrupa tons parecidos."""
    im = im.convert('RGBA'); im.thumbnail((180, 180))
    a = numpy.asarray(im); px = a[(a[..., 3] > 128) & (a[..., :3].min(axis=2) < 238)][:, :3]
    if not len(px): return []
    tira = Image.fromarray(px.reshape(1, -1, 3).astype('uint8'), 'RGB')
    q = tira.quantize(colors=10, method=Image.Quantize.FASTOCTREE)
    pal = q.getpalette()
    contagem = sorted(q.getcolors(), reverse=True)
    return [(hexa(tuple(v / 255 for v in pal[i * 3:i * 3 + 3])), c / len(px) * peso) for c, i in contagem]


def juntar(listas):
    """Junta cores de várias imagens, somando o peso de tons próximos."""
    grupos = []
    for hx, w in (c for lst in listas for c in lst):
        r = rgb(hx)
        for g in grupos:
            if math.dist(r, rgb(g[0])) < .14: g[1] += w; break
        else: grupos.append([hx, w])
    return sorted(grupos, key=lambda g: -g[1])


def sugerir_papeis(cores, base):
    """Distribui as cores encontradas nos papéis do layout; o que faltar vem da paleta do segmento."""
    hsv = lambda h: colorsys.rgb_to_hsv(*rgb(h))
    total = sum(w for _, w in cores) or 1
    # tons com menos de 3% da logo costumam ser borda suavizada (mistura de duas cores), não cor da marca
    vivas = [c for c, w in cores if w / total >= .03 and hsv(c)[1] > .25 and .15 < hsv(c)[2]]
    out = dict(base)
    if vivas:
        out['principal'] = vivas[0]
        outras = []
        for c in vivas[1:]:
            if all(math.dist(rgb(c), rgb(o)) > .22 for o in [vivas[0], *outras]): outras.append(c)
        if outras: out['secundaria'] = outras[0]
        if len(outras) > 1: out['destaque'] = outras[1]
        elif outras: out['destaque'] = hexa(colorsys.hsv_to_rgb((hsv(outras[0])[0] + .5) % 1, .75, .9))
        else:
            h, s, v = hsv(vivas[0])
            out['secundaria'] = hexa(colorsys.hsv_to_rgb(h, s * .55, min(1, v * 1.1)))
            out['destaque'] = hexa(colorsys.hsv_to_rgb((h + .08) % 1, min(1, s * 1.1), v * .85))
        h, s, v = hsv(out['principal'])
        escuras = [c for c, _ in cores if hsv(c)[2] < .32]
        out['escura'] = escuras[0] if escuras else hexa(colorsys.hsv_to_rgb(h, min(1, s * 1.05), v * .32))
        out['clara'] = hexa(colorsys.hsv_to_rgb(h, s * .1, .98))
    return {k: v.upper() for k, v in out.items()}


# ---------- caminhos ----------
def subcaminhos(d):
    """Lê um caminho M/L/C/Z absoluto e devolve [(pontos, operações)] validados."""
    if not isinstance(d, str) or len(d) > 2_000_000: raise ValueError('Forma inválida.')
    toks = TOKEN.findall(d)
    if ''.join(toks).replace(' ', '') == '' or re.sub(r'[\sMLCZ0-9eE.,+-]', '', d): raise ValueError('Forma inválida.')
    subs, atual, i, cmd = [], None, 0, None
    def num():
        nonlocal i
        if i >= len(toks) or toks[i] in 'MLCZ': raise ValueError('Forma inválida.')
        v = float(toks[i]); i += 1
        if not math.isfinite(v) or abs(v) > 2000: raise ValueError('Forma fora da folha.')
        return v
    while i < len(toks):
        t = toks[i]
        if t in 'MLCZ': cmd = t; i += 1
        elif cmd in (None, 'Z'): raise ValueError('Forma inválida.')
        if cmd == 'M':
            atual = [('M', (num(), num()))]; subs.append(atual); cmd = 'L'
        elif cmd == 'L':
            if atual is None: raise ValueError('Forma inválida.')
            atual.append(('L', (num(), num())))
        elif cmd == 'C':
            if atual is None: raise ValueError('Forma inválida.')
            atual.append(('C', (num(), num()), (num(), num()), (num(), num())))
        elif cmd == 'Z':
            if atual is not None: atual.append(('Z',))
    return subs


def validar_formas(formas, cores):
    if not isinstance(formas, list) or len(formas) > MAX_FORMAS: raise ValueError('Formas demais no desenho.')
    total, out = 0, []
    for f in formas:
        if not isinstance(f, dict): raise ValueError('Forma inválida.')
        subs = subcaminhos(f.get('d'))
        total += sum(len(s) for s in subs)
        if total > MAX_PONTOS: raise ValueError('O desenho tem pontos demais.')
        op = f.get('opacidade', 1)
        if not isinstance(op, (int, float)) or not 0 <= op <= 1: raise ValueError('Opacidade inválida.')
        item = {'subs': subs, 'd': f['d'], 'opacidade': float(op), 'evenodd': f.get('regra') == 'evenodd'}
        img = f.get('imagem')
        if img is not None:
            # pattern de imagem: o caminho é a área onde a imagem se repete; não tem cor própria
            from .molduras_padroes import parametros
            if not isinstance(img, dict) or not isinstance(img.get('id'), str) or not re.fullmatch(r'[0-9a-f]{32}', img['id']): raise ValueError('Pattern inválido.')
            item |= {'imagem': img['id'], 'ajustes': parametros(img), 'cor': '#FFFFFF'}
        else: item['cor'] = cor_de(f.get('cor'), cores)
        out.append(item)
    return out


def desenhar(page, subs, fill=None, stroke=None, largura=0, opacidade=1.0, evenodd=False):
    """Desenha caminhos em cm numa página PyMuPDF (pt), preenchidos ou só com contorno."""
    s = page.new_shape()
    P = lambda x, y: pymupdf.Point(x * CM, y * CM)
    for sub in subs:
        ini = cur = None
        for op in sub:
            if op[0] == 'M': ini = cur = P(*op[1])
            elif op[0] == 'L': nxt = P(*op[1]); s.draw_line(cur, nxt); cur = nxt
            elif op[0] == 'C': nxt = P(*op[3]); s.draw_bezier(cur, P(*op[1]), P(*op[2]), nxt); cur = nxt
            elif op[0] == 'Z' and cur is not None and ini is not None and (abs(cur.x - ini.x) > .01 or abs(cur.y - ini.y) > .01):
                s.draw_line(cur, ini); cur = ini
    s.finish(color=stroke, fill=fill, width=largura, even_odd=evenodd, closePath=True,
             fill_opacity=opacidade, stroke_opacity=1, lineJoin=1)
    s.commit()


# ---------- logo do cliente ----------
def preparar_logo(raw, ext):
    """Lê a logo enviada: vetorial (PDF/AI/SVG) fica vetorial no PDF final; bitmap entra como imagem.
    Devolve (pdf_de_uma_pagina_ou_None, png_de_previa, proporção largura/altura, cores)."""
    ext = ext.lower()
    if ext not in FORMATOS_LOGO: raise ValueError('Formato de logo não suportado. Use PNG, JPG, WebP, PDF, AI ou SVG.')
    if ext in ('.pdf', '.ai', '.svg'):
        try:
            src = pymupdf.open(stream=raw, filetype='svg' if ext == '.svg' else 'pdf')
            if ext == '.svg': src = pymupdf.open('pdf', src.convert_to_pdf())
        except Exception: raise ValueError('Não foi possível abrir o arquivo da logo.') from None
        if not len(src): raise ValueError('O arquivo da logo está vazio.')
        page = src[0]
        caixa = pymupdf.Rect()
        for _, r in page.get_bboxlog():
            r = pymupdf.Rect(r) & page.rect
            if not r.is_empty and r.width < page.rect.width * .999 or r.height < page.rect.height * .999: caixa |= r
        if caixa.is_empty: caixa = page.rect
        uma = pymupdf.open(); uma.new_page(width=caixa.width, height=caixa.height).show_pdf_page(pymupdf.Rect(0, 0, caixa.width, caixa.height), src, 0, clip=caixa)
        escala = 900 / max(caixa.width, caixa.height)
        pix = uma[0].get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=True)
        previa = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA')
        return uma.tobytes(garbage=3, deflate=True), previa, caixa.width / caixa.height
    try:
        im = Image.open(io.BytesIO(raw)); im.load(); im = im.convert('RGBA')
    except Exception: raise ValueError('Não foi possível abrir a imagem da logo.') from None
    if im.width * im.height > 60_000_000: raise ValueError('Imagem grande demais.')
    alfa = im.getchannel('A')
    if alfa.getextrema()[0] < 250: caixa = alfa.point(lambda v: 255 if v > 8 else 0).getbbox()
    else:
        fundo = Image.new('RGB', im.size, im.getpixel((0, 0))[:3])
        caixa = ImageChops.difference(im.convert('RGB'), fundo).convert('L').point(lambda v: 255 if v > 24 else 0).getbbox()
    if caixa: im = im.crop(caixa)
    return None, im, im.width / im.height


def logo_rect(g, proporcao, escala):
    """Retângulo da logo do cliente: cabe na área da aba, multiplicado pela escala escolhida (0,3 a 1)."""
    a = g['logoCliente']; e = max(.3, min(1.0, float(escala)))
    w, h = a['largura'] * e, a['altura'] * e
    if w / h > proporcao: w = h * proporcao
    else: h = w / proporcao
    return (a['cx'] - w / 2, a['cy'] - h / 2, a['cx'] + w / 2, a['cy'] + h / 2)


# ---------- PDFs ----------
def _marcas(page, g):
    W, H = g['folha']['largura'], g['folha']['altura']
    for (x, y, sx, sy) in [(.25, .25, 1, 1), (W - .25, .25, -1, 1), (.25, H - .25, 1, -1), (W - .25, H - .25, -1, -1)]:
        page.draw_polyline([pymupdf.Point((x + sx * 1.5) * CM, y * CM), pymupdf.Point(x * CM, y * CM), pymupdf.Point(x * CM, (y + sy * 1.5) * CM)],
                           color=PRETO_MARCAS, width=LINHA)


def _etiqueta(page, g, info):
    e = g['etiqueta']
    page.draw_rect(pymupdf.Rect(e['x0'] * CM, e['y0'] * CM, e['x1'] * CM, e['y1'] * CM), color=PRETO_MARCAS, width=LINHA)
    linhas = [f"Cliente: {info['cliente']}", f"Tamanho: {info['tamanho']}", f"Quantidade: {info['quantidade']}", f"Material: {info['material']}"]
    for i, linha in enumerate(linhas):
        page.insert_text(((e['x0'] + .5) * CM, (e['y0'] + .75 + i * .6) * CM), linha, fontsize=11, fontname='helv', color=(0, 0, 0, .85))


def _logo_ic(page, g, variante):
    a = g['logoIC']; s = a['largura'] / LOGO_IC['largura']
    mover = lambda d: re.sub(r'(-?\d+\.?\d*) (-?\d+\.?\d*)', lambda m: f'{a["x0"] + float(m[1]) * s:.4f} {a["y0"] + float(m[2]) * s:.4f}', d)
    cor_a, cor_b = ('#FFFFFF', TINTA_IC) if variante == 'clara' else (TINTA_IC, '#FFFFFF')
    desenhar(page, subcaminhos(mover(LOGO_IC['a'])), fill=cmyk(cor_a))
    desenhar(page, subcaminhos(mover(LOGO_IC['b'])), fill=cmyk(cor_b))


def achatar(subs, passos=10):
    """Polígonos aproximados de um caminho (curvas em segmentos), para saber o que está sob um ponto."""
    polys = []
    for sub in subs:
        poly, cur = [], None
        for op in sub:
            if op[0] == 'M': cur = op[1]; poly = [cur]; polys.append(poly)
            elif op[0] == 'L': cur = op[1]; poly.append(cur)
            elif op[0] == 'C':
                (x0, y0), (x1, y1), (x2, y2), (x3, y3) = cur, op[1], op[2], op[3]
                for i in range(1, passos + 1):
                    t = i / passos; m = 1 - t
                    poly.append((m ** 3 * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t ** 3 * x3,
                                 m ** 3 * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t ** 3 * y3))
                cur = op[3]
    return polys


def contem(polys, x, y, evenodd=False):
    voltas = cruzamentos = 0
    for p in polys:
        for (x0, y0), (x1, y1) in zip(p, p[1:] + p[:1]):
            if (y0 <= y) != (y1 <= y):
                xc = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
                if xc > x: cruzamentos += 1; voltas += 1 if y1 > y0 else -1
    return cruzamentos % 2 == 1 if evenodd else voltas != 0


def cor_no_ponto(formas, x, y, padrao='#FFFFFF'):
    """Cor da forma mais de cima que cobre o ponto (as formas já validadas, na ordem de desenho)."""
    for f in reversed(formas):
        if 'imagem' not in f and f['opacidade'] >= .5 and contem(achatar(f['subs']), x, y, f['evenodd']): return f['cor']
    return padrao


def variante_logo_ic(projeto, cores, formas=None, g=None):
    """Logo Indoor Channel clara (branca) sobre fundo escuro e escura sobre fundo claro; "auto" mede a cor sob a logo."""
    escolha = projeto.get('logoIC') or 'auto'
    if escolha in ('clara', 'escura'): return escolha
    if formas is not None and g is not None:
        a = g['logoIC']
        amostras = [cor_no_ponto(formas, a['x0'] + a['largura'] * fx, a['y0'] + a['altura'] * .5) for fx in (.1, .35, .65, .9)]
        lum = sum(luminancia(c) for c in amostras) / len(amostras)
    else: lum = luminancia(cores.get(projeto.get('logoICFundo') or 'principal', cores['principal']))
    return 'clara' if lum < .45 else 'escura'


def folha_pdf(projeto, g, logo_pdf=None, logo_png=None, imagens=None):
    """`imagens`: id → (PIL RGBA, proporção) dos patterns de imagem usados no desenho."""
    cores = validar_cores(projeto.get('cores'))
    formas = validar_formas(projeto.get('formas'), cores)
    doc = pymupdf.open()
    W, H = g['folha']['largura'], g['folha']['altura']
    page = doc.new_page(width=W * CM, height=H * CM)
    for f in formas:
        if 'imagem' in f:
            from .molduras_padroes import camada_imagem
            if not imagens or f['imagem'] not in imagens: raise ValueError('Imagem de pattern não encontrada. Importe o pattern de novo.')
            png, caixa = camada_imagem(*imagens[f['imagem']], f['d'], *f['ajustes'], f['opacidade'])
            if png: page.insert_image(pymupdf.Rect(*(v * CM for v in caixa)), stream=png)
            continue
        desenhar(page, f['subs'], fill=cmyk(f['cor']), opacidade=f['opacidade'], evenodd=f['evenodd'])
    placa = projeto.get('placa')
    if placa and placa.get('d'):
        desenhar(page, subcaminhos(placa['d']), fill=cmyk(cor_de(placa.get('cor', 'clara'), cores)))
    if projeto.get('logo') and (logo_pdf or logo_png is not None):
        x0, y0, x1, y1 = (v * CM for v in projeto['logo']['rect'])
        alvo = pymupdf.Rect(x0, y0, x1, y1)
        if logo_pdf: page.show_pdf_page(alvo, pymupdf.open('pdf', logo_pdf), 0, keep_proportion=True)
        else:
            buf = io.BytesIO(); logo_png.save(buf, 'PNG'); page.insert_image(alvo, stream=buf.getvalue(), keep_proportion=True)
    s = g['sangria']
    branco = (0, 0, 0, 0)
    for r in [(0, 0, W, s['y0']), (0, s['y1'], W, H), (0, 0, s['x0'], H), (s['x1'], 0, W, H)]:
        page.draw_rect(pymupdf.Rect(*(v * CM for v in r)), color=None, fill=branco, width=0)
    desenhar(page, subcaminhos(g['janelaPath']), fill=branco)
    _logo_ic(page, g, variante_logo_ic(projeto, cores, formas, g))
    _etiqueta(page, g, info_etiqueta(projeto))
    _marcas(page, g)
    doc.set_metadata({'title': f"Folha de Impressão {projeto.get('cliente', '')}", 'creator': 'Assistente de Edições · Indoor Channel'})
    return doc.tobytes(garbage=3, deflate=True)


def faca_pdf(projeto, g):
    doc = pymupdf.open()
    page = doc.new_page(width=g['folha']['largura'] * CM, height=g['folha']['altura'] * CM)
    for d in (g['corte'], g['janelaPath']):
        desenhar(page, subcaminhos(d), stroke=VERMELHO_FACA, largura=LINHA)
    _etiqueta(page, g, info_etiqueta(projeto))
    _marcas(page, g)
    doc.set_metadata({'title': f"Faca de Corte {projeto.get('cliente', '')}", 'creator': 'Assistente de Edições · Indoor Channel'})
    return doc.tobytes(garbage=3, deflate=True)


def info_etiqueta(projeto):
    tv = projeto.get('tv') or {}
    pol = tv.get('polegadas')
    tamanho = geo_mod.nome_tamanho(pol, tv['largura'], tv['altura']).replace(' Polegadas', '"')
    return {'cliente': str(projeto.get('cliente') or '')[:60], 'tamanho': tamanho,
            'quantidade': int(projeto.get('quantidade') or 1), 'material': str(projeto.get('material') or 'PS')[:20]}


def nomes_arquivos(projeto):
    tv = projeto['tv']
    tam = geo_mod.nome_tamanho(tv.get('polegadas'), tv['largura'], tv['altura'])
    cliente = str(projeto.get('cliente') or 'Cliente').strip()
    return f'Folha de Impressão {cliente} - {tam}', f'Faca de Corte {cliente} - {tam}'


def montar(tv, layout, cores=None, segmento=None):
    """Geometria + formas de um layout para uma TV."""
    g = geo_mod.geometria(tv['largura'], tv['altura'])
    return {'geometria': g, **gerar_layout(g, layout)}
