"""Importação de encarte em PDF: recortes de produtos (com transparência) + sugestão de nome e preços.

Heurística, não OCR: usa a camada de texto e as imagens com máscara (smask) do PDF. O resultado
é uma SUGESTÃO que o usuário revisa no formulário.
"""
import io
import re
import pymupdf
from PIL import Image

# rótulos soltos do layout; KG/CADA em maiúsculas são unidade, "Kg" faz parte do nome
RUIDO = re.compile(r'^([Cc]lube de [Dd]escontos?|R\$|KG|CADA|UN|UNID\.?|PCT|\d+\s?g)$')
LETRAS = re.compile(r'[A-Za-zÀ-ú]{2}')
# legenda da equivalência por quilo ("No Clube de Desconto o preço do Kg sai por: R$ 19,90"): o preço ao lado não é o normal
EQUIVALENCIA = re.compile(r'sai por|pre[çc]o d[oa] (kg|quilo)', re.I)
UNIDADE = re.compile(r'^(KG|CADA|UN|UNID\.?|PCT|\d+\s?g)$')


def _dist(rect, p, numerico):
    dx = max(rect.x0 - p.x, 0, p.x - rect.x1)
    dy = max(rect.y0 - p.y, 0, p.y - rect.y1)
    # distância horizontal pesa o dobro: nome e preço ficam na coluna do próprio produto
    d = ((2 * dx) ** 2 + dy * dy) ** .5
    # preço quase nunca fica ACIMA da foto do próprio produto
    return d * 3 if numerico and p.y < rect.y0 else d


def _agrupar(recortes, doc):
    """Une recortes do mesmo produto: os que se sobrepõem de verdade (ex.: pacotes de hambúrguer empilhados)
    e cópias da mesma imagem encostadas (ex.: três peças de maminha, dois potes de creatina)."""
    mascaras = {}
    def opaco(rec, p):
        r, _, smask, t = rec
        if smask not in mascaras: mascaras[smask] = pymupdf.Pixmap(doc, smask)
        m = mascaras[smask]
        u, v = (p.x - r.x0) / r.width, (p.y - r.y0) / r.height
        if t[0] < 0: u = 1 - u
        if t[3] < 0: v = 1 - v
        return m.pixel(min(int(u * m.width), m.width - 1), min(int(v * m.height), m.height - 1))[0] > 128
    def juntar(a, b):
        ra, rb = a[0], b[0]
        inter = ra & rb
        if not inter.is_empty:
            # conta só onde as duas são opacas: numa coluna de ofertas, as bordas transparentes de
            # vizinhos se cruzam (melão sobre o tomate) sem que um produto cubra o outro. Nos encartes
            # conferidos, vizinhos dão 0 a 1% e peças do mesmo produto, 7% ou mais
            n = 12
            pontos = [pymupdf.Point(inter.x0 + inter.width * (i + .5) / n, inter.y0 + inter.height * (j + .5) / n) for i in range(n) for j in range(n)]
            ambos = sum(opaco(a, p) and opaco(b, p) for p in pontos) / len(pontos)
            if ambos * inter.get_area() > 0.05 * min(ra.get_area(), rb.get_area()): return True
        perto = pymupdf.Rect(ra.x0 - ra.width * .15, ra.y0 - ra.height * .15, ra.x1 + ra.width * .15, ra.y1 + ra.height * .15)
        return a[1] == b[1] and perto.intersects(rb)
    grupo = list(range(len(recortes)))
    def raiz(i):
        while grupo[i] != i: i = grupo[i]
        return i
    for i in range(len(recortes)):
        for j in range(i + 1, len(recortes)):
            if raiz(i) != raiz(j) and juntar(recortes[i], recortes[j]): grupo[raiz(j)] = raiz(i)
    caixas = {}
    for i, rec in enumerate(recortes):
        k = raiz(i)
        caixas[k] = caixas[k] | rec[0] if k in caixas else pymupdf.Rect(rec[0])
    return list(caixas.values())


def _nome(spans, rect):
    """Linhas de texto contíguas mais próximas do recorte = nome do produto."""
    linhas = sorted([s for s in spans if LETRAS.search(s[1])], key=lambda s: (round(s[0].y0), s[0].x0))
    blocos = []
    for s in linhas:
        b = blocos[-1] if blocos else None
        if b and s[0].y0 - b['rect'].y1 < s[0].height * 1.2 and not (s[0].x0 > b['rect'].x1 + 20 or s[0].x1 < b['rect'].x0 - 20):
            b['rect'] |= s[0]; b['textos'].append(s[1])
        else:
            blocos.append({'rect': pymupdf.Rect(s[0]), 'textos': [s[1]]})
    if not blocos: return ''
    centro = lambda r: (r.tl + r.br) / 2
    melhor = min(blocos, key=lambda b: _dist(rect, centro(b['rect']), False))
    return re.sub(r'\s+', ' ', ' '.join(melhor['textos'])).strip()


def _tokens_preco(spans):
    """Junta "46" + ",99" num preço só ANTES de atribuir ao produto: nos cards o selo de preço
    encosta no card vizinho, e os pedaços iriam para produtos diferentes."""
    inteiros = [s for s in spans if re.fullmatch(r'\d+', s[1])]
    centavos = [s for s in spans if re.fullmatch(r',\d ?\d', s[1])]
    precos, usados = [], set()
    for r, t, z in inteiros:
        cand = [c for c in centavos if id(c) not in usados and c[0].x0 >= r.x1 - 3 and abs(c[0].y0 - r.y0) < r.height * 0.6]
        if cand:
            c = min(cand, key=lambda c: c[0].x0 - r.x1)
            usados.add(id(c))
            precos.append((r, t + c[1].replace(' ', ''), z))
    precos += [(r, t.replace(' ', ''), z) for r, t, z in spans if re.fullmatch(r'\d+,\d ?\d', t)]
    return precos


def _precos(precos):
    """-> (por, de, retângulo do por). Maior fonte = preço em destaque."""
    if not precos: return '', '', None
    rect_por, por, _ = max(precos, key=lambda p: p[2])
    # preço normal = perto do destaque E grande. Só o 2º maior do grupo pegava o de um vizinho; só o
    # mais perto pegava a equivalência miúda ("R$ 19,90 o kg") colada no selo.
    centro = (rect_por.tl + rect_por.br) / 2
    outros = [p for p in precos if p[1] != por]
    de = min(outros, key=lambda p: abs((p[0].tl + p[0].br) / 2 - centro) / p[2] ** 2)[1] if outros else ''
    return por, de, rect_por


def _unidade(unidades, rect_por):
    """A unidade do selo fica colada no preço em destaque ("14,99 KG"). Escolher a maior fonte errava
    quando a descrição tem um peso maior que o selo ("Doce de Leite 350g")."""
    if not unidades: return ''
    if rect_por is None: escolhida = max(unidades, key=lambda u: u[2])
    else: escolhida = min(unidades, key=lambda u: abs(u[0].x0 - rect_por.x1) + abs(u[0].y0 - rect_por.y1))
    texto = escolhida[1].replace(' ', '')
    return 'UN' if texto.startswith('UNID') else texto


def avisos(nome, por, de, unidade):
    """O que o usuário deve conferir antes de usar (mostrado no card do encarte)."""
    avisos = []
    if not nome: avisos.append('Nome não identificado')
    elif len(nome) < 6 or len(nome.split()) < 2: avisos.append('Nome curto: confira se está completo')
    if not por: return avisos + ['Preço em destaque não identificado']
    if not de: avisos.append('Sem preço normal: confira se o encarte tem um')
    elif _valor(de) <= _valor(por): avisos.append('Preço normal menor ou igual ao preço em destaque: confira se não estão trocados')
    if not unidade: avisos.append('Unidade não identificada')
    return avisos


_valor = lambda p: float(p.replace(',', '.'))


def _pixmap(doc, xref, smask):
    pix = pymupdf.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.n == 4:  # CMYK -> RGB
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    if smask:
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
    return pix


def _recortes(page):
    """Imagens com transparência da página, uma por posição e na ordem de pintura: (rect, xref, smask, transform)."""
    smasks = {img[0]: img[1] for img in page.get_images(full=True) if img[1]}
    vistos, out = set(), []
    for info in page.get_image_info(xrefs=True):
        r, xref = pymupdf.Rect(info['bbox']), info['xref']
        chave = (xref, tuple(round(v, 1) for v in r))
        if xref in smasks and chave not in vistos:
            vistos.add(chave)
            out.append((r, xref, smasks[xref], info['transform']))
    return out


def _foto(doc, partes):
    """PNG do produto: todas as partes do grupo (ex.: 3 peças de maminha) coladas na posição do encarte,
    na ordem de pintura, na resolução da parte mais nítida."""
    if len(partes) == 1: return _pixmap(doc, partes[0][1], partes[0][2]).tobytes('png')
    caixa = pymupdf.Rect(partes[0][0])
    for parte in partes[1:]: caixa |= parte[0]
    imagens = [(r, Image.open(io.BytesIO(_pixmap(doc, xref, smask).tobytes('png'))).convert('RGBA'), t) for r, xref, smask, t in partes]
    escala = min(max(im.width / r.width for r, im, _ in imagens), 3000 / max(caixa.width, caixa.height))
    tela = Image.new('RGBA', (round(caixa.width * escala), round(caixa.height * escala)))
    for r, im, t in imagens:
        # ponytail: só espelhamento; parte girada (b/c da matriz) sai sem girar
        if t[0] < 0: im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if t[3] < 0: im = im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        x, y = round((r.x0 - caixa.x0) * escala), round((r.y0 - caixa.y0) * escala)
        im = im.resize((max(1, min(round(r.width * escala), tela.width - x)), max(1, min(round(r.height * escala), tela.height - y))), Image.Resampling.LANCZOS)
        tela.alpha_composite(im, (x, y))
    out = io.BytesIO(); tela.save(out, 'PNG'); return out.getvalue()


def extrair(pdf_bytes):
    """-> [{'nome', 'por', 'de', 'unidade', 'avisos', 'pagina', 'area', 'png': bytes}] na ordem de leitura do encarte."""
    doc = pymupdf.open(stream=pdf_bytes, filetype='pdf')
    itens = []
    for page in doc:
        area = page.rect.width * page.rect.height
        spans, unidades, legendas = [], [], []
        for b in page.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    t = s['text'].strip()
                    if EQUIVALENCIA.search(t): legendas.append(pymupdf.Rect(s['bbox']))
                    if UNIDADE.match(t): unidades.append((pymupdf.Rect(s['bbox']), t, s['size']))
                    if t and s['size'] >= 5 and len(t) <= 60 and not RUIDO.match(t):
                        spans.append((pymupdf.Rect(s['bbox']), t, s['size']))
        # sem transparência = fundo, logo de cartão etc. (ficam de fora em _recortes)
        recortes = [x for x in _recortes(page) if x[0].width >= 25 and x[0].height >= 25 and x[0].get_area() <= area * 0.3]
        grupos = [{'rect': g, 'spans': [], 'precos': [], 'unidades': []} for g in _agrupar(recortes, doc)]
        if not grupos: continue
        textos = [s for s in spans if LETRAS.search(s[1])]
        equivalencia = lambda r: any(l.y0 - r.height < r.y0 < l.y1 + r.height and -5 < r.x0 - l.x1 < 40 for l in legendas)
        precos = [p for p in _tokens_preco(spans) if not equivalencia(p[0])]
        # unidades vão mais longe (o selo pode ficar bem abaixo da foto); a escolha final é a mais
        # próxima do preço do próprio produto, então a de um vizinho não é usada
        for chave, itens_, num, alcance in (('spans', textos, False, .9), ('precos', precos, True, .9), ('unidades', unidades, True, 1.5)):
            for s in itens_:
                c = (s[0].tl + s[0].br) / 2
                g = min(grupos, key=lambda g: _dist(g['rect'], c, num))
                if _dist(g['rect'], c, num) < g['rect'].height * alcance: g[chave].append(s)
        for g in sorted(grupos, key=lambda g: (round(g['rect'].y0 / 60), g['rect'].x0)):
            nome = _nome(g['spans'], g['rect'])
            por, de, rect_por = _precos(g['precos'])
            if not nome or not por: continue  # sem nome ou preço não é produto (ex.: logo do SAC)
            unidade = _unidade(g['unidades'], rect_por)
            # área da oferta (foto + textos) em pontos do PDF, para o "ver no encarte"
            area_oferta = pymupdf.Rect(g['rect'])
            for x in g['spans'] + g['precos'] + g['unidades']: area_oferta |= x[0]
            itens.append({'nome': nome, 'por': por, 'de': de, 'unidade': unidade, 'avisos': avisos(nome, por, de, unidade),
                          'pagina': page.number + 1, 'area': [round(v, 1) for v in area_oferta],
                          'png': _foto(doc, [x for x in recortes if g['rect'].contains(x[0])])})
    return itens


# ---------- conferência e marcação manual ----------
# Coordenadas de um encarte: pontos do PDF; num encarte em imagem (PNG/JPG), pixels da imagem.

def paginas(pdf_bytes):
    """-> [[largura, altura], ...] em pontos."""
    return [[round(pg.rect.width, 1), round(pg.rect.height, 1)] for pg in pymupdf.open(stream=pdf_bytes, filetype='pdf')]


def imagem_pagina(pdf_bytes, numero, largura=1600):
    """PNG da página para conferir e marcar ofertas na tela."""
    pg = pymupdf.open(stream=pdf_bytes, filetype='pdf')[numero - 1]
    z = largura / pg.rect.width
    return pg.get_pixmap(matrix=pymupdf.Matrix(z, z)).tobytes('png')


def ler_area(pdf_bytes, numero, area):
    """Oferta marcada à mão: a mesma leitura do automático, só dentro da área. A imagem são os
    recortes com transparência do grupo mais perto do preço; sem nenhum, a área renderizada (com o fundo do encarte)."""
    doc = pymupdf.open(stream=pdf_bytes, filetype='pdf')
    pg = doc[numero - 1]
    rect = pymupdf.Rect(area) & pg.rect
    if rect.is_empty or rect.width < 10 or rect.height < 10: raise ValueError('Marque uma área maior.')
    spans, unidades, legendas = [], [], []
    for b in pg.get_text('dict')['blocks']:  # sem clip: o clip corta o texto na borda ("Clube d")
        for l in b.get('lines', []):
            for sp in l['spans']:
                t, r = sp['text'].strip(), pymupdf.Rect(sp['bbox'])
                if not rect.contains((r.tl + r.br) / 2): continue
                if EQUIVALENCIA.search(t): legendas.append(r)
                if UNIDADE.match(t): unidades.append((r, t, sp['size']))
                if t and sp['size'] >= 5 and len(t) <= 60 and not RUIDO.match(t): spans.append((r, t, sp['size']))
    equivalencia = lambda r: any(l.y0 - r.height < r.y0 < l.y1 + r.height and -5 < r.x0 - l.x1 < 40 for l in legendas)
    por, de, rect_por = _precos([x for x in _tokens_preco(spans) if not equivalencia(x[0])])
    candidatos = [x for x in _recortes(pg) if (x[0] & rect).get_area() > 0.6 * x[0].get_area() and x[0].width >= 25]
    if candidatos:
        # a área pode pegar a foto de um vizinho: vale o grupo de fotos mais perto do preço
        grupos = _agrupar(candidatos, doc)
        alvo = (rect_por.tl + rect_por.br) / 2 if rect_por else None
        foto = min(grupos, key=lambda g: _dist(g, alvo, True)) if alvo else max(grupos, key=lambda g: g.get_area())
        png = _foto(doc, [c for c in candidatos if foto.contains(c[0])])
    else:
        foto = rect
        png = pg.get_pixmap(matrix=pymupdf.Matrix(3, 3), clip=rect).tobytes('png')
    nome = _nome([x for x in spans if LETRAS.search(x[1])], foto)
    unidade = _unidade(unidades, rect_por)
    return {'nome': nome, 'por': por, 'de': de, 'unidade': unidade, 'png': png, 'transparente': bool(candidatos)}


if __name__ == '__main__':
    import sys
    for i in extrair(open(sys.argv[1], 'rb').read()):
        print(f"{i['nome']!r:70} por={i['por']:7} de={i['de']:7} {i['unidade']:5} png={len(i['png'])//1024}KB")
