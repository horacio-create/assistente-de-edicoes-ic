"""Importação de encarte em PDF: recortes de produtos (com transparência) + sugestão de nome e preços.

Heurística, não OCR: usa a camada de texto e as imagens com máscara (smask) do PDF. O resultado
é uma SUGESTÃO que o usuário revisa no formulário.
"""
import re
import pymupdf

# rótulos soltos do layout; KG/CADA em maiúsculas são unidade, "Kg" faz parte do nome
RUIDO = re.compile(r'^([Cc]lube de [Dd]escontos?|R\$|KG|CADA|UN|PCT|\d+\s?g)$')
LETRAS = re.compile(r'[A-Za-zÀ-ú]{2}')
UNIDADE = re.compile(r'^(KG|CADA|UN|PCT|\d+\s?g)$')


def _dist(rect, p, numerico):
    dx = max(rect.x0 - p.x, 0, p.x - rect.x1)
    dy = max(rect.y0 - p.y, 0, p.y - rect.y1)
    # distância horizontal pesa o dobro: nome e preço ficam na coluna do próprio produto
    d = ((2 * dx) ** 2 + dy * dy) ** .5
    # preço quase nunca fica ACIMA da foto do próprio produto
    return d * 3 if numerico and p.y < rect.y0 else d


def _agrupar(rects):
    """Une recortes que se sobrepõem (ex.: 3 peças da mesma maminha) até estabilizar."""
    grupos = [pymupdf.Rect(r) for r in rects]
    mudou = True
    while mudou:
        mudou = False
        for i in range(len(grupos)):
            for j in range(i + 1, len(grupos)):
                a, b = grupos[i], grupos[j]
                inter = a & b
                if not inter.is_empty and inter.width * inter.height > 0.15 * min(a.width * a.height, b.width * b.height):
                    grupos[i] = a | b
                    del grupos[j]
                    mudou = True
                    break
            if mudou: break
    return grupos


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
    ordenados = [p for _, p, _ in sorted(precos, key=lambda p: -p[2])]  # maior fonte = preço em destaque
    unicos = list(dict.fromkeys(ordenados))
    return (unicos[0] if unicos else ''), (unicos[1] if len(unicos) > 1 else '')


def _pixmap(doc, xref, smask):
    pix = pymupdf.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.n == 4:  # CMYK -> RGB
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    if smask:
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
    return pix


def extrair(pdf_bytes):
    """-> [{'nome', 'por', 'de', 'unidade', 'png': bytes}] na ordem de leitura do encarte."""
    doc = pymupdf.open(stream=pdf_bytes, filetype='pdf')
    itens = []
    for page in doc:
        area = page.rect.width * page.rect.height
        spans, unidades = [], []
        for b in page.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    t = s['text'].strip()
                    if UNIDADE.match(t): unidades.append((pymupdf.Rect(s['bbox']), t, s['size']))
                    if t and s['size'] >= 5 and len(t) <= 60 and not RUIDO.match(t):
                        spans.append((pymupdf.Rect(s['bbox']), t, s['size']))
        recortes = []  # (rect, xref, smask)
        for img in page.get_images(full=True):
            xref, smask = img[0], img[1]
            if not smask: continue  # sem transparência = fundo, logo de cartão etc.
            for r in page.get_image_rects(xref):
                if r.width >= 25 and r.height >= 25 and r.width * r.height <= area * 0.3:
                    recortes.append((r, xref, smask))
        grupos = [{'rect': g, 'spans': [], 'precos': [], 'unidades': []} for g in _agrupar([r for r, _, _ in recortes])]
        if not grupos: continue
        textos = [s for s in spans if LETRAS.search(s[1])]
        for chave, itens_, num in (('spans', textos, False), ('precos', _tokens_preco(spans), True), ('unidades', unidades, True)):
            for s in itens_:
                c = (s[0].tl + s[0].br) / 2
                g = min(grupos, key=lambda g: _dist(g['rect'], c, num))
                if _dist(g['rect'], c, num) < g['rect'].height * 0.9: g[chave].append(s)
        for g in sorted(grupos, key=lambda g: (round(g['rect'].y0 / 60), g['rect'].x0)):
            nome = _nome(g['spans'], g['rect'])
            por, de = _precos(g['precos'])
            if not nome or not por: continue  # sem nome ou preço não é produto (ex.: logo do SAC)
            # a imagem do produto = o maior recorte dentro do grupo
            dentro = [x for x in recortes if g['rect'].contains(x[0])]
            r, xref, smask = max(dentro, key=lambda x: x[0].width * x[0].height)
            # a unidade do selo (maior fonte) é a que vale
            unidade = max(g['unidades'], key=lambda u: u[2])[1].replace(' ', '') if g['unidades'] else ''
            itens.append({'nome': nome, 'por': por, 'de': de, 'unidade': unidade, 'png': _pixmap(doc, xref, smask).tobytes('png')})
    return itens


if __name__ == '__main__':
    import sys
    for i in extrair(open(sys.argv[1], 'rb').read()):
        print(f"{i['nome']!r:70} por={i['por']:7} de={i['de']:7} {i['unidade']:5} png={len(i['png'])//1024}KB")
