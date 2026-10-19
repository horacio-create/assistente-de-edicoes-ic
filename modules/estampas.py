"""Estampas de camisa para DTF: a arte do cliente vira um PDF no tamanho certo para cada tamanho de camisa e local
(frente, costas, mangas). A arte ocupa o maior tamanho possível dentro da área de estampa, sem distorcer e sem passar
do limite (a área fica longe das costuras), alinhada pelo topo. O PDF tem exatamente a medida da arte.

Medidas em cm. Valores com `confirmar` foram calculados (proporção dos tamanhos conhecidos) ou são o padrão do DTF
e aparecem na tela como "a confirmar" até a gráfica validar."""
import io
import json
import math
import re
from pathlib import Path
import numpy
import pymupdf
from PIL import Image, ImageDraw

CM = 72 / 2.54
# tipo → tamanho → camisa (largura × altura) e área da frente; GG e XGG da frente foram estimados (½ da largura, ~49% da altura)
TAMANHOS = {
    'comum': {
        'P': {'camisa': (50, 69), 'area': (24, 34)},
        'M': {'camisa': (52, 72), 'area': (26, 36)},
        'G': {'camisa': (54, 75), 'area': (27, 37)},
        'GG': {'camisa': (56, 78), 'area': (28, 38), 'confirmar': True},
        'XGG': {'camisa': (62, 81), 'area': (31, 39.5), 'confirmar': True},
    },
    'baby': {
        'P': {'camisa': (41, 58), 'area': (20, 30)},
        'M': {'camisa': (43, 61), 'area': (22, 32)},
        'G': {'camisa': (45, 64), 'area': (24, 34)},
    },
}
TIPOS = {'comum': 'Comum', 'baby': 'Baby look'}
# exportação com mais de 6 tamanhos (comum e baby look juntos): os arquivos vão para pastas por tipo de camisa
ORGANIZAR_ACIMA_DE = 6
PASTAS = {('comum', 'impressao'): 'Camisa comum - impressão', ('baby', 'impressao'): 'Camisa baby look - impressão',
          ('comum', 'mockups'): 'Camisa comum - mockups', ('baby', 'mockups'): 'Camisa baby look - mockups'}
MANGA = {'comum': (9, 9), 'baby': (7, 7)}          # área de cada manga, igual em todos os tamanhos do tipo (a confirmar)
LOCAIS = {'frente': 'Frente', 'costas': 'Costas', 'manga-esquerda': 'Manga esquerda', 'manga-direita': 'Manga direita'}   # lados de quem veste
FORMATOS = {'.pdf', '.ai', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'}
DPI_IDEAL, DPI_MINIMO = 300, 150
LINHA_MINIMA_MM = .5                                 # traços mais finos podem não fixar no DTF


def area(tipo, tamanho, local):
    """Área de estampa (largura, altura, a confirmar?) de um local num tamanho."""
    t = TAMANHOS[tipo][tamanho]
    if local in ('frente', 'costas'):
        return t['area'][0], t['area'][1], bool(t.get('confirmar')) or local == 'costas'
    if local in ('manga-esquerda', 'manga-direita'):
        return MANGA[tipo][0], MANGA[tipo][1], True
    raise ValueError('Local da estampa inválido.')


def encaixe(proporcao, larg, alt):
    """Maior tamanho da arte que cabe na área sem distorcer (largura, altura em cm)."""
    w = min(larg, alt * proporcao)
    return round(w, 2), round(w / proporcao, 2)


def catalogo():
    """Tabela de medidas e o desenho de cada camisa (o mesmo da folha de conferência), com a área de cada local."""
    tam = []
    for tipo, tamanhos in TAMANHOS.items():
        for nome, t in tamanhos.items():
            w, h = t['camisa']; locais = {}
            for local in LOCAIS:
                aw, ah, conf = area(tipo, nome, local)
                g = camisa(w, h, costas=local == 'costas', tipo=tipo)
                x, y = posicao_area(tipo, local, w, h, aw, ah)
                locais[local] = {'area': [aw, ah], 'confirmar': conf, 'posicao': [round(x, 2), round(y, 2)], 'contorno': g['contorno'], 'linhas': g['linhas'], 'espessura': g['espessura']}
            tam.append({'tipo': tipo, 'tamanho': nome, 'camisa': [w, h], 'locais': locais})
    return {'tipos': TIPOS, 'tamanhos': tam, 'locais': LOCAIS, 'cores': [{'id': c, 'nome': n, 'hex': h} for c, n, h in CORES]}


# ---------- leitura da arte ----------
def _caixa_conteudo(page):
    caixa = pymupdf.Rect()
    for _, r in page.get_bboxlog():
        r = pymupdf.Rect(r) & page.rect
        if not r.is_empty: caixa |= r
    return caixa if not caixa.is_empty else page.rect


def ler(raw, ext):
    """Arquivo enviado → dados da arte: PDF vetorial de uma página recortado no conteúdo, ou imagem RGBA recortada,
    mais o que a conferência precisa (fundo branco, traço mais fino, resolução)."""
    ext = ext.lower()
    if ext not in FORMATOS: raise ValueError('Formato não suportado. Use PDF, AI, SVG ou PNG (no CorelDraw: Arquivo › Publicar em PDF).')
    if ext in ('.pdf', '.ai', '.svg'):
        try:
            src = pymupdf.open(stream=raw, filetype='svg' if ext == '.svg' else 'pdf')
            if ext == '.svg': src = pymupdf.open('pdf', src.convert_to_pdf())
        except Exception: raise ValueError('Não foi possível abrir o arquivo da estampa.') from None
        if not len(src): raise ValueError('O arquivo da estampa está vazio.')
        if len(src) > 1: aviso_paginas = f'O arquivo tem {len(src)} páginas; foi usada só a primeira.'
        else: aviso_paginas = None
        page = src[0]
        caixa = _caixa_conteudo(page)
        if caixa.width < 1 or caixa.height < 1: raise ValueError('Não há desenho no arquivo da estampa.')
        uma = pymupdf.open(); nova = uma.new_page(width=caixa.width, height=caixa.height)
        nova.show_pdf_page(pymupdf.Rect(0, 0, caixa.width, caixa.height), src, 0, clip=caixa)
        # conferência: traço mais fino (pt, no tamanho original) e fundo branco cobrindo a arte
        linhas = [d['width'] for d in page.get_drawings() if d.get('color') is not None and d.get('width')]
        fundo = any(d.get('fill') and min(d['fill'][:3]) > .96 and (d['rect'] & caixa).get_area() >= caixa.get_area() * .9
                    for d in page.get_drawings())
        textos_svg = ext == '.svg' and bool(page.get_text().strip())
        imagens = len(page.get_images())
        escala = 1200 / max(caixa.width, caixa.height)
        previa = Image.open(io.BytesIO(uma[0].get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=True).tobytes('png'))).convert('RGBA')
        return {'vetor': True, 'pdf': uma.tobytes(garbage=3, deflate=True), 'previa': previa, 'proporcao': caixa.width / caixa.height,
                'linhaMinPt': min(linhas) if linhas else None, 'larguraPt': caixa.width, 'fundoBranco': fundo, 'textosSvg': textos_svg,
                'imagensEmbutidas': imagens, 'avisoPaginas': aviso_paginas, 'corPrincipal': cor_principal(previa)}
    try:
        im = Image.open(io.BytesIO(raw)); im.load(); im = im.convert('RGBA')
    except Exception: raise ValueError('Não foi possível abrir a imagem da estampa.') from None
    if im.width * im.height > 150_000_000: raise ValueError('Imagem grande demais (acima de 150 milhões de pixels).')
    caixa = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not caixa: raise ValueError('A imagem está toda transparente.')
    im = im.crop(caixa)
    return {'vetor': False, 'imagem': im, 'previa': _miniatura(im), 'proporcao': im.width / im.height,
            'fundoBranco': fundo_branco(im), 'px': (im.width, im.height), 'corPrincipal': cor_principal(im)}


def cor_principal(im):
    """Cor que mais aparece na arte (sem transparência), para avisar quando ela some na cor da camisa."""
    im = im.convert('RGBA'); im.thumbnail((160, 160))
    a = numpy.asarray(im); px = a[a[..., 3] > 200][:, :3]
    if not len(px): return None
    tira = Image.fromarray(px.reshape(1, -1, 3).astype('uint8'), 'RGB')
    q = tira.quantize(colors=6, method=Image.Quantize.FASTOCTREE); pal = q.getpalette()
    _, i = max(q.getcolors())
    return '#' + ''.join(f'{v:02X}' for v in pal[i * 3:i * 3 + 3])


def _miniatura(im):
    p = im.copy(); p.thumbnail((1200, 1200)); return p


def fundo_branco(im):
    """Imagem sem transparência e com a borda quase toda branca: no DTF, o fundo branco sai impresso."""
    a = im.getchannel('A')
    if a.getextrema()[0] < 250: return False
    w, h = im.size; rgb = im.convert('RGB')
    passo = max(1, (w + h) // 400)
    borda = [rgb.getpixel((x, y)) for x in range(0, w, passo) for y in (0, h - 1)] + [rgb.getpixel((x, y)) for y in range(0, h, passo) for x in (0, w - 1)]
    return sum(min(p) > 235 for p in borda) / len(borda) > .9


def remover_fundo(im, tolerancia=24):
    """Deixa transparente o branco ligado à borda (o que está dentro da arte, como o miolo de uma letra branca, fica)."""
    rgb = im.convert('RGB')
    cores = numpy.asarray(rgb)
    marcador = next(c for c in [(1, 254, 3), (2, 253, 5), (3, 251, 7)] if not (cores == c).all(axis=2).any())
    w, h = rgb.size
    passo = max(1, (w + h) // 300)
    sementes = [(x, y) for x in range(0, w, passo) for y in (0, h - 1)] + [(x, y) for y in range(0, h, passo) for x in (0, w - 1)]
    for s in sementes:
        p = rgb.getpixel(s)
        if p != marcador and min(p) > 235: ImageDraw.floodfill(rgb, s, marcador, thresh=tolerancia)
    fora = (numpy.asarray(rgb) == marcador).all(axis=2)
    alfa = numpy.asarray(im.getchannel('A')).copy(); alfa[fora] = 0
    novo = im.copy(); novo.putalpha(Image.fromarray(alfa))
    caixa = novo.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not caixa: raise ValueError('A imagem ficaria vazia sem o fundo branco.')
    return novo.crop(caixa)


# ---------- conferência ----------
def conferir(meta, larg_cm, alt_cm):
    """Avisos de impressão desta arte neste tamanho final."""
    avisos = []
    if meta['vetor']:
        if meta.get('linhaMinPt'):
            mm = meta['linhaMinPt'] * (larg_cm * 10) / (meta['larguraPt'])
            if mm < LINHA_MINIMA_MM: avisos.append({'nivel': 'atencao', 'texto': f'Traço mais fino com {mm:.2f} mm: abaixo de {LINHA_MINIMA_MM:g} mm pode não fixar no DTF.'})
        if meta.get('imagensEmbutidas'): avisos.append({'nivel': 'info', 'texto': 'O arquivo tem imagens dentro: confira a resolução delas no programa de origem.'})
    else:
        dpi = meta['px'][0] / (larg_cm / 2.54)
        if dpi < DPI_MINIMO: avisos.append({'nivel': 'erro', 'texto': f'Resolução baixa: {dpi:.0f} dpi neste tamanho (mínimo {DPI_MINIMO}). Pode sair pixelado.'})
        elif dpi < DPI_IDEAL: avisos.append({'nivel': 'atencao', 'texto': f'{dpi:.0f} dpi neste tamanho; o ideal é {DPI_IDEAL}.'})
    return avisos


def aviso_contraste(meta, cor):
    """A cor principal da estampa quase igual à da camisa: ela some no tecido."""
    hexa = COR_HEX.get(cor)
    if not hexa or not meta.get('corPrincipal') or contraste(meta['corPrincipal'], hexa) >= 1.6: return None
    nome = next(n for c, n, _ in CORES if c == cor)
    return {'nivel': 'atencao', 'texto': f'A cor principal da estampa tem pouco contraste com a camisa {nome}: ela pode sumir no tecido.'}


def avisos_gerais(meta):
    avisos = []
    if meta.get('fundoBranco'):
        avisos.append({'nivel': 'erro', 'tipo': 'fundo', 'texto': 'A arte tem fundo branco: no DTF ele sai impresso como um retângulo branco.' +
                       (' Remova o fundo no programa de origem e exporte de novo.' if meta['vetor'] else ' Use "Remover fundo branco".')})
    if meta.get('textosSvg'): avisos.append({'nivel': 'atencao', 'texto': 'O SVG tem textos que não estão em curvas: a fonte pode mudar. Converta em curvas antes de exportar.'})
    if meta.get('avisoPaginas'): avisos.append({'nivel': 'info', 'texto': meta['avisoPaginas']})
    return avisos


# ---------- saída ----------
def pdf_estampa(arte, larg_cm, alt_cm):
    """PDF com exatamente a medida da arte; vetor continua vetor, imagem entra na resolução original."""
    return pdf_lado([(arte, larg_cm, alt_cm, 0, 0)])


def caixa_lado(itens):
    """Retângulo que envolve todas as estampas de um lado: (x, y, largura, altura) em cm, dentro da área."""
    x0 = min(i[3] for i in itens); y0 = min(i[4] for i in itens)
    x1 = max(i[3] + i[1] for i in itens); y1 = max(i[4] + i[2] for i in itens)
    return x0, y0, round(x1 - x0, 2), round(y1 - y0, 2)


def pdf_lado(itens):
    """Um PDF por lado da camisa: todas as estampas desse lado nas posições exatas entre si, numa página do tamanho do
    conjunto. `itens`: [(arte, largura, altura, dx, dy)] em cm, com dx/dy dentro da área de estampa."""
    x0, y0, w, h = caixa_lado(itens)
    doc = pymupdf.open()
    page = doc.new_page(width=w * CM, height=h * CM)
    for arte, lw, lh, dx, dy in itens:
        alvo = pymupdf.Rect((dx - x0) * CM, (dy - y0) * CM, (dx - x0 + lw) * CM, (dy - y0 + lh) * CM)
        if arte['vetor']: page.show_pdf_page(alvo, pymupdf.open('pdf', arte['pdf']), 0, keep_proportion=True)
        else:
            buf = io.BytesIO(); arte['imagem'].save(buf, 'PNG'); page.insert_image(alvo, stream=buf.getvalue(), keep_proportion=True)
    doc.set_metadata({'title': 'Estampa DTF', 'creator': 'Assistente de Edições · Indoor Channel'})
    return doc.tobytes(garbage=3, deflate=True)


def nome_arquivo(cliente, tipo, tamanho, local, larg, alt):
    """Um arquivo por lado: com várias estampas no lado, a medida é a do conjunto."""
    medida = lambda v: f'{v:g}'.replace('.', ',')
    return f'Estampa {cliente} - {TIPOS[tipo]} {tamanho} - {LOCAIS[local]} ({medida(larg)} x {medida(alt)} cm)'


# ---------- camisa desenhada (prévia, diagrama de medidas e folha de conferência) ----------
# Cores da camiseta Algodão 30.1 Vortex (Click Camisetas), tiradas das fotos do site: tons aproximados.
CORES = [
    ('branca', 'Branca', '#F5F2F3'), ('preta', 'Preta', '#0E0C0D'), ('cinza-mescla', 'Cinza Mescla', '#D9D5D3'),
    ('amarelo-canario', 'Amarelo Canário', '#F7EA51'), ('laranja', 'Laranja', '#F9A420'), ('salmao', 'Salmão', '#FEC2B0'),
    ('vermelha', 'Vermelha', '#D52F2E'), ('bordo', 'Bordô', '#810505'), ('rosa-bebe', 'Rosa Bebê', '#FEC3DC'),
    ('rosa-pink', 'Rosa Pink', '#FA5E8E'), ('roxa', 'Roxa', '#4F0882'), ('azul-bebe', 'Azul Bebê', '#AEE1F2'),
    ('azul-turquesa', 'Azul Turquesa', '#429FEB'), ('azul-royal', 'Azul Royal', '#013F99'), ('azul-marinho', 'Azul Marinho', '#1E2853'),
    ('verde-limao', 'Verde Limão', '#C9E2A6'), ('verde-bandeira', 'Verde Bandeira', '#3FA766'), ('verde-militar', 'Verde Militar', '#2A3F20'),
]
COR_HEX = {c: h for c, _, h in CORES}


def _rgb(hexa): return tuple(int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))


def _lum(hexa):
    lin = lambda v: v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in _rgb(hexa))
    return .2126 * r + .7152 * g + .0722 * b


def contraste(a, b):
    x, y = sorted((_lum(a), _lum(b)), reverse=True)
    return (x + .05) / (y + .05)


def marcacao_para(cor):
    """Cor da área segura e das medidas: vermelho, ou a primeira que se destaca na camisa."""
    return next((c for c in ('#D7192D', '#1F6FD1', '#20203C', '#FFFFFF') if contraste(c, cor) >= 2.4), '#20203C')


def traco_para(cor):
    """Cor das linhas do desenho: escuras na camisa clara, claras na camisa escura."""
    return '#20203C' if _lum(cor) > .18 else '#E6E6EE'


def _fmt(p): return f'{p[0]:.2f} {p[1]:.2f}'


def _espelho(segs, inicio):
    """Lado esquerdo = o direito espelhado e percorrido ao contrário (de baixo para cima)."""
    pontos = [inicio] + [s[-1] for s in segs]
    out = []
    for i in range(len(segs) - 1, -1, -1):
        s, de = segs[i], pontos[i]
        if s[0] == 'L': out.append(('L', (-de[0], de[1])))
        else: out.append(('C', (-s[2][0], s[2][1]), (-s[1][0], s[1][1]), (-de[0], de[1])))
    return out


def _d(segs):
    return ' '.join(f'L{_fmt(s[1])}' if s[0] == 'L' else f'C{_fmt(s[1])} {_fmt(s[2])} {_fmt(s[3])}' for s in segs)


# Desenhos das camisas (SVG em mm, na proporção real), já medidos: silhueta, linhas, centro, topo, barra, peito, fundo da
# gola e centro das mangas. Para trocar o desenho, salve os SVGs novos e gere de novo o camisas.json (ver README).
DESENHOS = json.loads((Path(__file__).parent / 'estampas_dados' / 'camisas.json').read_text(encoding='utf-8'))


def camisa(w, h, costas=False, tipo='comum'):
    """Desenho ajustado às medidas reais do tamanho: largura do peito = w e do ombro à barra = h (cm).
    Origem no centro, no topo do ombro. Devolve a silhueta (recebe a cor da camisa), as linhas (traço desenhado por cima)
    e a espessura do traço em cm."""
    v = DESENHOS[tipo]['costas' if costas else 'frente']
    kx, ky = w / v['peito'], h / (v['barra'] - v['topo'])
    para = lambda d: re.sub(r'(-?\d+\.?\d*) (-?\d+\.?\d*)', lambda m: f'{(float(m[1]) - v["cx"]) * kx:.2f} {(float(m[2]) - v["topo"]) * ky:.2f}', d)
    mangas = [((x - v['cx']) * kx, (y - v['topo']) * ky) for x, y in v['mangas']]   # da esquerda para a direita no desenho
    return {'contorno': para(v['silhueta']), 'linhas': para(v['linhas']), 'espessura': round(v['espessura'] * (kx + ky) / 2, 3),
            'fundoGola': (v['fundoGola'] - v['topo']) * ky, 'mangas': mangas}


def posicao_area(tipo, local, w, h, aw, ah):
    """Onde a área fica no desenho (ilustrativo): frente 7 cm abaixo da gola (6 cm na baby look), costas 10 cm (8 cm);
    mangas no meio da manga."""
    g = camisa(w, h, costas=local == 'costas', tipo=tipo)
    if local in ('frente', 'costas'):
        abaixo = {('comum', 'frente'): 7, ('baby', 'frente'): 6, ('comum', 'costas'): 10, ('baby', 'costas'): 8}[(tipo, local)]
        return -aw / 2, g['fundoGola'] + abaixo
    # vista de frente: a manga esquerda de quem veste fica à direita de quem olha (e vice-versa)
    cx, cy = g['mangas'][1 if local == 'manga-esquerda' else 0]
    return cx - aw / 2, cy - ah / 2


def ajuste_valido(a):
    """Tamanho (20% a 100% do máximo) e posição da arte dentro da área (0 a 1 do espaço livre), iguais em todos os tamanhos."""
    a = a or {}
    try: escala, fx, fy = float(a.get('escala', 1)), float(a.get('x', .5)), float(a.get('y', 0))
    except (TypeError, ValueError): raise ValueError('Ajuste da estampa inválido.') from None
    if not (.2 <= escala <= 1 and 0 <= fx <= 1 and 0 <= fy <= 1): raise ValueError('Ajuste da estampa fora da área segura.')
    return {'escala': escala, 'x': fx, 'y': fy}


def colocar(proporcao, aw, ah, ajuste=None):
    """Medida final da arte e o deslocamento dentro da área (cm). Nunca passa da área: a escala só reduz o encaixe máximo."""
    a = ajuste_valido(ajuste)
    w, h = encaixe(proporcao, aw, ah)
    w, h = round(w * a['escala'], 2), round(h * a['escala'], 2)
    return w, h, (aw - w) * a['x'], (ah - h) * a['y']


def folha_conferencia(cliente, pecas, tamanhos, cor='branca'):
    """PDF A3 deitado, uma página por local: cada tamanho escolhido com a camisa (na cor escolhida), a área e as artes.
    `pecas`: [{'local', 'ajuste', 'n', 'dados': arte carregada}]."""
    fundo = COR_HEX.get(cor, '#F5F2F3'); linha = _rgb(traco_para(fundo))
    nome_cor = next((n for c, n, _ in CORES if c == cor), 'Branca')
    doc = pymupdf.open()
    W, H = 42 * CM, 29.7 * CM
    for local in LOCAIS:
        doLocal = [p for p in pecas if p['local'] == local]
        if not doLocal: continue
        page = doc.new_page(width=W, height=H)
        page.insert_text((1.5 * CM, 1.8 * CM), f'Conferência de estampa · {cliente} · {LOCAIS[local]} · camisa {nome_cor}', fontsize=16, fontname='hebo')
        page.insert_text((1.5 * CM, 2.6 * CM), 'Camisas e áreas em escala; a posição na camisa é ilustrativa. Medidas marcadas com * são a confirmar.',
                         fontsize=9, color=(.35, .35, .45))
        n = len(tamanhos); colunas = min(4, n); linhas = math.ceil(n / colunas)
        cw, chh = (W - 2 * CM) / colunas, (H - 4 * CM) / linhas
        escala = min(cw * .8 / max(TAMANHOS[t][s]['camisa'][0] * 1.6 for t, s in tamanhos),
                     chh * .78 / max(TAMANHOS[t][s]['camisa'][1] * 1.05 for t, s in tamanhos))
        for i, (tipo, tam) in enumerate(tamanhos):
            w, h = TAMANHOS[tipo][tam]['camisa']; aw, ah, conf = area(tipo, tam, local)
            ox = CM + (i % colunas) * cw + cw / 2; oy = 3.4 * CM + (i // colunas) * chh
            P = lambda x, y: pymupdf.Point(ox + x * escala, oy + y * escala)
            g = camisa(w, h, costas=local == 'costas', tipo=tipo)
            s = page.new_shape()
            _caminho(s, g['contorno'], P); s.finish(color=None, closePath=True, fill=_rgb(fundo))
            _caminho(s, g['linhas'], P); s.finish(color=linha, width=max(.5, g['espessura'] * escala), closePath=False, lineCap=1, lineJoin=1)
            ax, ay = posicao_area(tipo, local, w, h, aw, ah)
            s.draw_rect(pymupdf.Rect(P(ax, ay), P(ax + aw, ay + ah))); s.finish(color=_rgb(marcacao_para(fundo)), width=.8, dashes='[3 2] 0')
            s.commit()
            medidas = []
            for p in doLocal:
                arte = p['dados']
                lw, lh, dx, dy = colocar(arte['proporcao'], aw, ah, p['ajuste'])
                alvo = pymupdf.Rect(P(ax + dx, ay + dy), P(ax + dx + lw, ay + dy + lh))
                if arte['vetor']: page.show_pdf_page(alvo, pymupdf.open('pdf', arte['pdf']), 0)
                else:
                    buf = io.BytesIO(); arte['previa'].save(buf, 'PNG'); page.insert_image(alvo, stream=buf.getvalue())
                medidas.append((p['n'], lw, lh))
            topo = P(0, h).y + 14
            page.insert_text((ox - 2.2 * CM, topo), f'{TIPOS[tipo]} {tam}', fontsize=11, fontname='hebo')
            med = lambda v: f'{v:g}'.replace('.', ',')
            page.insert_text((ox - 2.2 * CM, topo + 13), f'Camisa {med(w)} × {med(h)} · área {med(aw)} × {med(ah)}{" *" if conf else ""}', fontsize=8, color=(.35, .35, .45))
            for k, (n, lw, lh) in enumerate(medidas):
                page.insert_text((ox - 2.2 * CM, topo + 24 + 10 * k), f'Estampa{f" {n}" if n else ""} {med(lw)} × {med(lh)} cm', fontsize=8, color=(.85, .1, .2))
    if not len(doc): raise ValueError('Nenhuma estampa para conferir.')
    doc.set_metadata({'title': f'Conferência de estampa {cliente}', 'creator': 'Assistente de Edições · Indoor Channel'})
    return doc.tobytes(garbage=3, deflate=True)


def _caminho(shape, d, P):
    toks = re.findall(r'[MLCZ]|-?\d+\.?\d*', d); i = 0; cur = ini = None
    while i < len(toks):
        c = toks[i]; i += 1
        num = lambda k: [float(v) for v in toks[i:i + k]]
        if c == 'M': x, y = num(2); i += 2; cur = ini = P(x, y)
        elif c == 'L': x, y = num(2); i += 2; nxt = P(x, y); shape.draw_line(cur, nxt); cur = nxt
        elif c == 'C':
            a = num(6); i += 6; nxt = P(a[4], a[5]); shape.draw_bezier(cur, P(a[0], a[1]), P(a[2], a[3]), nxt); cur = nxt
        elif c == 'Z' and cur != ini: shape.draw_line(cur, ini); cur = ini
