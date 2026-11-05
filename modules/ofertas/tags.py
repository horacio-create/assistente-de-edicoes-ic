"""Tags dos produtos do encarte: selos que acompanham a foto, mas não são o produto.

- Imagens (recortadas do próprio encarte): aviso +18, logo da marca (Sadia, Perdigão…), tabela de tamanhos
  das fraldas. Saem da foto do produto e viram até 4 tags editáveis na cartela.
- Balões "Nesta Embalagem 1L Sai Por: R$ 1,59": viram dados (promopreco/promotexto), desenhados pela
  "tag promocional" do template, como os balões "Nessa Promo" que o leitor já reconhecia.

Nos encartes conferidos (28 PDFs), todas as imagens pequenas coladas à foto eram tags: logos e o +18.
"""
import re

import pymupdf

MAX_TAGS = 4
ALCOOL = re.compile(r'cerveja|vinho|whisk|aguardente|alco[oó]lica|vodka|\bgin\b|licor|cacha[cç]a|espumante|chopp?\b|rum\b|conhaque|sak[eê]', re.I)
BALAO = re.compile(r'^(?:Nest[ae]|Ness[ae])(?:\s+Promo)?$', re.I)
TAMANHOS = re.compile(r'^(?:RN|P|M|G|XG|XXG|XXXG|EG|EXG)$')


def separar(doc, partes, nome=''):
    """-> (fotos, tags): imagens bem menores que a maior parte da foto são tags, até 4. Uma parte só = sem tags."""
    if len(partes) < 2: return list(partes), []
    maior = max(partes, key=lambda p: p[0].get_area())
    base = maior[0]
    pequenas = [p for p in partes if p is not maior and p[0].height < base.height * .5 and p[0].get_area() < base.get_area() * .24]
    pequenas = pequenas[:MAX_TAGS]  # imagens extras continuam na foto em vez de sumir
    return [p for p in partes if p not in pequenas], [_tag_imagem(doc, p, nome) for p in pequenas]


def _tag_imagem(doc, parte, nome):
    from PIL import Image
    import io
    from .encarte import _pixmap
    png = _pixmap(doc, parte[1], parte[2]).tobytes('png')
    with Image.open(io.BytesIO(png)) as im:
        pixels = list(im.convert('RGBA').resize((32, 32)).get_flattened_data())
    branco = sum(r > 210 and g > 210 and b > 210 and a > 128 for r, g, b, a in pixels) / 1024
    vermelho = sum(r > 150 and r > g * 1.7 and r > b * 1.5 and a > 128 for r, g, b, a in pixels) / 1024
    # o +18 é um círculo branco com mão vermelha, e só faz sentido em bebida alcoólica
    if ALCOOL.search(nome) and branco > .18 and vermelho > .06: tipo = 'Maiores de 18'
    elif re.search(r'fralda', nome, re.I): tipo = 'Tamanhos e quantidades'
    else: tipo = 'Marca'
    return {'png': png, 'tipo': tipo}


def _linhas(page):
    return [(pymupdf.Rect(sp['bbox']), sp['text'].strip(), sp['size'])
            for b in page.get_text('dict', flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)['blocks']
            for l in b.get('lines', []) for sp in l['spans'] if sp['text'].strip()]


def _mais_proximo(itens, alvo, pagina):
    centro = lambda a: pymupdf.Point((a[0] + a[2]) / 2, (a[1] + a[3]) / 2)
    perto = [it for it in itens if it.get('pagina') == pagina and pymupdf.Rect(it['area']).intersects(alvo)]
    if not perto: return None
    c = (alvo.tl + alvo.br) / 2
    return min(perto, key=lambda it: abs(centro(it['area']) - c))


def completar(page, itens):
    """Tags que estão no desenho da página (não em imagens): balões de embalagem e tabela de tamanhos."""
    from .encarte import _tokens_preco
    linhas = _linhas(page)
    pagina = page.number + 1
    # Balão "Nesta Embalagem 1L Sai Por: R$ 1,59": texto em até 4 linhas logo abaixo de "Nesta" e o preço ao lado/abaixo
    for rect, texto, tam in linhas:
        if not BALAO.match(texto): continue
        regiao = pymupdf.Rect(rect.x0 - rect.height * 4, rect.y0 - 1, rect.x1 + rect.height * 8, rect.y1 + rect.height * 9)
        textos = [l for l in linhas if regiao.contains((l[0].tl + l[0].br) / 2) and re.search('[A-Za-zÀ-ú]', l[1])
                  and '$' not in l[1] and not re.fullmatch(r'cada|kg|un', l[1], re.I) and abs(l[0].x0 - rect.x0) < rect.height * 3]
        legenda = ' '.join(t for _, t, _ in sorted(textos, key=lambda l: (round(l[0].y0, 1), l[0].x0)))
        if not re.search(r'sai(?:em)? por', legenda, re.I): continue
        fim = max(l[0].y1 for l in textos)
        precos = [p for p in _tokens_preco(linhas) if regiao.contains((p[0].tl + p[0].br) / 2) and p[0].y0 >= fim - p[0].height * .6]
        if not precos: continue
        preco = min(precos, key=lambda p: p[0].y0 - fim)
        it = _mais_proximo(itens, regiao, pagina)
        if not it or it.get('promopreco') or preco[1] in (it.get('por'), it.get('de')): continue
        it['promopreco'], it['promotexto'] = preco[1], legenda
    # Tabela de tamanhos das fraldas ("TAM P M G XG…") é texto vetorial: recorta a área renderizada
    for rect, texto, _ in linhas:
        if texto.upper() != 'TAM': continue
        entorno = pymupdf.Rect(rect.x0 - 2, rect.y0 - 2, rect.x0 + rect.width * 5, rect.y0 + rect.height * 12)
        textos = [l for l in linhas if entorno.contains((l[0].tl + l[0].br) / 2) and l[0].height < rect.height * 1.6]
        if sum(bool(TAMANHOS.match(t)) for _, t, _ in textos) < 3: continue
        it = _mais_proximo([i for i in itens if re.search('fralda', i['nome'], re.I)], entorno, pagina)
        if not it or len(it.get('tags', [])) >= MAX_TAGS: continue
        caixa = pymupdf.Rect(rect)
        for r, _, _ in textos: caixa |= r
        caixa += (-1, -1, 1, 1)
        it.setdefault('tags', []).append({'png': page.get_pixmap(matrix=pymupdf.Matrix(6, 6), clip=caixa, alpha=False).tobytes('png'),
                                         'tipo': 'Tamanhos e quantidades'})
    return itens
