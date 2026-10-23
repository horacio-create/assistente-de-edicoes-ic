"""Perfil de encartes com selos vermelhos rasterizados e preços vetoriais.

Os selos ancoram as ofertas, mas nunca entram nas fotos dos produtos.
Adaptado da divisão geométrica usada no Encarte Studio.
"""
import io
import re
import statistics

import pymupdf
from PIL import Image


def extrair_pagina(page, doc):
    from .encarte import _pixmap, _foto, _unidade, avisos

    mascaras = {im[0]: im[1] for im in page.get_images(full=True)}
    imagens = []
    vistos = set()
    for info in page.get_image_info(xrefs=True):
        r, xref = pymupdf.Rect(info['bbox']), info['xref']
        chave = (xref, tuple(round(v, 2) for v in r))
        if not xref or chave in vistos or r.is_empty:
            continue
        vistos.add(chave)
        imagens.append((r, xref, mascaras.get(xref, 0), info['transform']))
    spans = []
    for bloco in page.get_text('dict', flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)['blocks']:
        for linha in bloco.get('lines', []):
            for sp in linha['spans']:
                if sp['text'].strip():
                    spans.append((pymupdf.Rect(sp['bbox']), sp['text'].strip(), sp['size']))
    centro = lambda r: (r.tl + r.br) / 2
    caracteres = [(pymupdf.Rect(c['bbox']), c['c'], sp['size'])
                  for b in page.get_text('rawdict', flags=pymupdf.TEXTFLAGS_RAWDICT & ~pymupdf.TEXT_PRESERVE_IMAGES)['blocks']
                  for l in b.get('lines', []) for sp in l['spans'] for c in sp['chars']]
    def numero(chars):
        digitos = [c for c in chars if c[1] in '0123456789,']
        if not digitos: return None
        maior = max(c[2] for c in digitos)
        semente = max(digitos, key=lambda c: c[2])
        digitos = [c for c in digitos if c[2] >= maior*.4 and abs(c[0].y0-semente[0].y0) < maior*.4]
        valor = ''.join(c[1] for c in sorted(digitos, key=lambda c: c[0].x0))
        if not re.fullmatch(r'\d{1,4},\d{2}', valor): return None
        caixa = pymupdf.Rect(digitos[0][0])
        for c in digitos[1:]: caixa |= c[0]
        return caixa, valor, maior
    precos_selo = {}
    cores = {}
    selos = []
    ids_selos = set()
    for im in imagens:
        r, xref, mascara, _ = im
        if not 1.4 < r.width / r.height < 2.1 or r.width > page.rect.width * .3:
            continue
        cabecalho = any(re.sub(r'\s+', ' ', t.upper()) == 'CLUBE DE DESCONTO'
                         and r.contains(centro(caixa)) and -.05 <= (caixa.y0-r.y0)/r.height <= .30
                         and .5 <= caixa.width/r.width <= 1.1 for caixa,t,_ in spans)
        if xref not in cores:
            with Image.open(io.BytesIO(_pixmap(doc, xref, mascara).tobytes('png'))) as original:
                amostra = original.convert('RGBA').resize((64, 40))
                pixels = list(amostra.get_flattened_data())
                vermelho = sum(a > 128 and rr > 225 and g < 45 and b < 45 for rr, g, b, a in pixels) / len(pixels)
                amarelo = sum(a > 128 and rr > 190 and g > 130 and b < 90 for rr, g, b, a in pixels) / len(pixels)
                cores[xref] = vermelho > .55 and amarelo > .01
        # A embalagem de um produto pode ser vermelha/amarela: exigir preço
        # do PDF dentro do selo evita ativar o perfil só pela cor.
        preco = numero([c for c in caracteres if r.contains(centro(c[0]))]) if cabecalho or cores[xref] else None
        if preco:
            ids_selos.add(xref)
            # Certos PDFs repetem a base como imagem e máscara, quase no mesmo lugar.
            if any((r & outro[0]).get_area() / min(r.get_area(), outro[0].get_area()) > .9 for outro in selos):
                continue
            selos.append(im)
            precos_selo[id(im)] = preco
    if len(selos) < 2:
        return None  # os demais layouts continuam com o leitor existente

    altura = statistics.median(s[0].height for s in selos)
    largura = statistics.median(s[0].width for s in selos)
    linhas = []
    for selo in sorted(selos, key=lambda s: s[0].y0):
        linha = next((l for l in linhas if abs(statistics.median(s[0].y0 for s in l) - selo[0].y0) < altura * .85), None)
        if linha is None:
            linhas.append([selo])
        else:
            linha.append(selo)
    objetos = [im for im in imagens if im[1] not in ids_selos
               and im[0].x1 <= page.rect.width + 2 and im[0].width > 12 and im[0].height > 12
               and im[0].get_area() < page.rect.get_area() * .25]
    # Caixas coloridas de destaque podem conter duas fotos independentes.
    objetos = [im for im in objetos if not (im[0].width > largura * 1.7
               and sum(im is not outro and im[0].contains(outro[0]) for outro in objetos) >= 2)]
    resultado = []
    anterior = 0
    for linha in linhas:
        linha.sort(key=lambda s: s[0].x0)
        centros = [centro(s[0]).x - s[0].width * .35 for s in linha]
        limites = [0] + [(a + b) / 2 for a, b in zip(centros, centros[1:])] + [page.rect.width]
        fundo = max(s[0].y1 for s in linha) + 4
        # Na primeira linha, logotipos e mascotes do cabeçalho podem alcançar
        # a altura das ofertas. Sua origem acima da faixa de produtos os exclui.
        inicio_fotos = anterior
        if not anterior and not any(cores[s[1]] for s in linha):
            inicio_fotos = max(0, min(s[0].y0 for s in linha)-altura*3.2)
        fotos = [im for im in objetos if inicio_fotos <= im[0].y0 < max(s[0].y0 for s in linha)
                 and im[0].y1 <= fundo + 8]
        def coluna(x):
            return next((i for i in range(len(linha)) if limites[i] <= x < limites[i+1]), len(linha)-1)
        donos = {}
        for im in fotos:
            c = centro(im[0])
            if im[0].width < largura * .6 and im[0].height < altura * .9:
                pais = [p for p in fotos if p is not im and p[0].contains(c) and p[0].get_area() > im[0].get_area() * 2]
                if pais:
                    c = centro(min(pais, key=lambda p: p[0].get_area())[0])
            donos[id(im)] = coluna(c.x)
        # Cópias encostadas do mesmo produto ficam juntas mesmo quando uma
        # das caixas transparentes atravessa a divisão nominal da coluna.
        pendentes = list(fotos)
        while pendentes:
            grupo = [pendentes.pop(0)]
            mudou = True
            while mudou:
                mudou = False
                for candidato in pendentes[:]:
                    if any(candidato[1] == outro[1]
                           and abs(candidato[0].y0-outro[0].y0) < min(candidato[0].height, outro[0].height) * .25
                           and max(candidato[0].x0, outro[0].x0) - min(candidato[0].x1, outro[0].x1) < max(candidato[0].width, outro[0].width) * .6 for outro in grupo):
                        grupo.append(candidato)
                        pendentes.remove(candidato)
                        mudou = True
            caixa = pymupdf.Rect(grupo[0][0])
            for im in grupo[1:]: caixa |= im[0]
            if len(grupo) > 1:
                dono = coluna(centro(caixa).x)
                for im in grupo: donos[id(im)] = dono
        topo = anterior if anterior else max(0, min((im[0].y0 for im in fotos), default=min(s[0].y0 for s in linha)-100)-5)
        for i, selo in enumerate(linha):
            r = selo[0]
            celula = pymupdf.Rect(limites[i], topo, limites[i+1], fundo)
            destaque = precos_selo[id(selo)]
            normal = numero([c for c in caracteres if celula.contains(centro(c[0])) and not r.contains(centro(c[0]))
                             and r.y0-r.height*.75 <= c[0].y0 < fundo])
            limite_titulo = min(r.y0-1, normal[0].y0-3 if normal else r.y0-1)
            titulos = [s for s in spans if celula.contains(centro(s[0])) and s[0].y0 < limite_titulo
                       and s[2] > altura*.08 and re.search('[A-Za-zÀ-ú]', s[1])
                       and '$' not in s[1] and s[1].upper() not in ('KG', 'CADA', 'UN')]
            partes = [im for im in fotos if donos[id(im)] == i]
            if partes:
                # Alguns layouts põem a descrição acima da foto, em vez de
                # entre a foto e o selo. Buscar só a faixa imediatamente acima.
                teto = max(anterior, min(im[0].y0 for im in partes)-altura*.8)
                acima = pymupdf.Rect(celula.x0, teto, celula.x1, celula.y0)
                extras = [s for s in spans if acima.contains(centro(s[0])) and re.search('[A-Za-zÀ-ú]', s[1])
                          and s[2] > altura*.08 and '$' not in s[1]
                          and s[1].upper() != 'CLUBE DE DESCONTO']
                titulos.extend(s for s in extras if s not in titulos)
                if titulos: celula.y0 = min(s[0].y0 for s in titulos)
            if titulos:
                fontes = {}
                for s in titulos:
                    tamanho = round(s[2], 1)
                    fontes[tamanho] = fontes.get(tamanho, 0) + sum(c.isalpha() for c in s[1])
                predominante = max(t for t, letras in fontes.items() if letras >= max(fontes.values())*.6)
                titulos = [s for s in titulos if predominante*.85 <= s[2] <= predominante*1.15]
            nome = ' '.join(s[1] for s in sorted(titulos, key=lambda s: (round(s[0].y0, 1), s[0].x0)))
            unidades = [s for s in spans if celula.contains(centro(s[0])) and re.fullmatch(r'KG|CADA|UN|100g', s[1], re.I)]
            unidade = _unidade(unidades, destaque[0]).upper()
            por, de = destaque[1], normal[1] if normal else ''
            # Não substituir uma foto ausente pelo selo: deixar a revisão clara.
            if not partes:
                raise ValueError(f'Não foi possível isolar a foto de {nome or "uma oferta"}. Marque essa oferta na página.')
            area_oferta = pymupdf.Rect(celula)
            for im in partes: area_oferta |= im[0]
            for t in titulos: area_oferta |= t[0]
            resultado.append({'nome': nome, 'por': por, 'de': de, 'unidade': unidade,
                              'avisos': avisos(nome, por, de, unidade), 'pagina': page.number+1,
                              'area': [round(v, 1) for v in area_oferta], 'png': _foto(doc, partes)})
        anterior = fundo
    return resultado
