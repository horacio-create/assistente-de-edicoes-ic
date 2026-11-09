"""Encarte que chega só como imagem (PNG/JPG, ou PDF que é uma foto da página): sem camada de texto nem
fotos separadas, o leitor do PDF não acha nada. Aqui:

1. OCR local (RapidOCR, modelo latino, roda no servidor) lê os textos com a posição de cada um;
2. cada rótulo "Clube de Desconto" é a âncora de uma oferta: o título é o primeiro bloco de texto acima
   dele na mesma coluna, e os preços são relidos em recortes ampliados (os centavos pequenos e elevados
   saem errados na leitura da página inteira);
3. a foto é a área entre o título e a linha dos preços, com o selo e o preço normal apagados, e o fundo
   sai por "varinha mágica" (cores que dominam a borda e estão ligadas a ela, sem atravessar o contorno do
   produto) somada à máscara do U²-Net. A varinha resolve produto da mesma cor geral do fundo (bandeja
   amarela sobre fundo amarelo), a IA resolve o que a cor confunde (caixa branca encostada na borda).

Conferido nos encartes Super Oferta Tijuca (PNG 1080×1350) e Química Ypê (PDF-imagem 1228×1754): 14 de 14
produtos com nome e preços, e as 14 fotos recortadas. Os textos são sugestão; o usuário confere no editor.
"""
import colorsys
import hashlib
import io
import os
import re
import threading
import urllib.request
from collections import Counter

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from storage import DATA

LOCK = threading.Lock()
BASE = 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/'
MODELOS = {  # nome: (caminho no repositório do RapidOCR, SHA-256 conferido)
    'det': ('det/ch_PP-OCRv5_det_mobile.onnx', '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae'),
    'latino': ('rec/latin_PP-OCRv5_rec_mobile.onnx', 'b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a'),
    'numeros': ('rec/en_PP-OCRv5_rec_mobile.onnx', 'c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8'),
}
AVISO = 'Lido da imagem do encarte: confira nome, preços e o recorte da foto'
_motores = {}


def ativo():
    """INDOOR_OCR=0 desliga a leitura por OCR (testes, que não baixam os modelos)."""
    return os.environ.get('INDOOR_OCR', '1') != '0'


def _modelo(nome):
    pasta = DATA / 'ofertas' / 'modelos'
    pasta.mkdir(parents=True, exist_ok=True)
    caminho, sha = MODELOS[nome]
    arquivo = pasta / caminho.rsplit('/', 1)[1]
    if not arquivo.exists():
        with urllib.request.urlopen(BASE + caminho, timeout=120) as r: dados = r.read(60 * 1024 * 1024)
        if hashlib.sha256(dados).hexdigest() != sha: raise ValueError('Modelo de leitura de imagem não corresponde à versão conferida.')
        temp = arquivo.with_suffix('.tmp'); temp.write_bytes(dados); temp.replace(arquivo)
    elif hashlib.sha256(arquivo.read_bytes()).hexdigest() != sha:
        raise ValueError('Modelo de leitura de imagem inválido.')
    return str(arquivo)


def _motor(rec):
    """RapidOCR com os modelos da pasta de dados. Sem correção de rotação: ela vira de cabeça para baixo os
    preços grandes ("19,99" saía "666L") e o encarte está sempre em pé."""
    if rec not in _motores:
        from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
        _motores[rec] = RapidOCR(params={
            'Global.use_cls': False, 'Global.log_level': 'error',
            'Det.ocr_version': OCRVersion.PPOCRV5, 'Det.model_type': ModelType.MOBILE, 'Det.model_path': _modelo('det'),
            'Rec.ocr_version': OCRVersion.PPOCRV5, 'Rec.model_type': ModelType.MOBILE, 'Rec.model_path': _modelo(rec),
            'Rec.lang_type': LangRec.LATIN if rec == 'latino' else LangRec.EN})
    return _motores[rec]


def _ler(img, rec='latino', escala=1):
    """-> [{'x0','y0','x1','y1','h','t'}] em pixels de `img` (antes da escala)."""
    buf = io.BytesIO(); img.save(buf, 'PNG')
    r = _motor(rec)(buf.getvalue())
    if r is None or r.boxes is None: return []
    out = []
    for box, t in zip(r.boxes, r.txts):
        xs = [float(p[0]) / escala for p in box]; ys = [float(p[1]) / escala for p in box]
        out.append({'x0': min(xs), 'y0': min(ys), 'x1': max(xs), 'y1': max(ys), 'h': max(ys) - min(ys), 't': str(t).strip()})
    return out


def _textos(img, rec='numeros'):
    return [c['t'] for c in _ler(img, rec)]


def _preco(img):
    """-> (valor "12,99", textos lidos) de um recorte: leituras com margem branca, em cinza, metade e dobro,
    até duas concordarem. A margem branca é essencial: sem ela o detector não acha os números grandes do selo."""
    variantes = [lambda: ImageOps.expand(img, 40, fill=(255, 255, 255)),
                 lambda: ImageOps.expand(ImageOps.autocontrast(img.convert('L')), 40, fill=255).convert('RGB'),
                 lambda: ImageOps.expand(img.resize((img.width * 2, img.height * 2)), 60, fill=(255, 255, 255)),
                 lambda: ImageOps.expand(img.resize((max(1, img.width // 2), max(1, img.height // 2))), 30, fill=(255, 255, 255))]
    votos, fracos, lidos = Counter(), Counter(), []
    for v in variantes:
        texto = ' '.join(_textos(v())); lidos.append(texto)
        for m in re.finditer(r'(?<![\d,.])(\d{1,3})\s*[,.]\s*(\d{2})(?!\d)', texto): votos[f'{m[1]},{m[2]}'] += 1
        # centavos elevados com a vírgula minúscula: o OCR lê "12" e "99" separados
        for m in re.finditer(r'(?<![\d,.])(\d{1,3})\s+(\d{2})(?![\d,.])', texto): fracos[f'{m[1]},{m[2]}'] += 1
        if votos and votos.most_common(1)[0][1] >= 2: break
    escolha = votos or fracos
    return (escolha.most_common(1)[0][0] if escolha else ''), ' '.join(lidos)


def _unidade(texto):
    t = texto.lower()
    if re.search(r'100\s?g\b', t): return '100g'
    if re.search(r'(^|\s|,\d\d)kg\b', t): return 'KG'   # "29,90 Kg" ou "29,90Kg"; não "1KG" do nome
    return 'CADA' if 'cada' in t else ''


def _numeros(nome):
    """Letras que o OCR troca por dígitos em medidas: "SOOML" -> "500ML", "9OOML" -> "900ML", "IKG" -> "1KG"."""
    nome = re.sub(r'\b[S5]([O0]{2,})(?=\s?(?:ML|G|L|KG)\b)', lambda m: '5' + '0' * len(m[1]), nome)
    nome = re.sub(r'\bS(?=X[\dIO])', '5', nome)                  # "SXI60G" -> "5X160G"
    nome = re.sub(r'(?<=[\dX])I(?=[\dO])', '1', nome)
    while True:
        novo = re.sub(r'(?<=\d)O|O(?=\d)', '0', nome)
        if novo == nome: break
        nome = novo
    return re.sub(r'\bIKG\b', '1KG', nome)


def _ancoras(caixas):
    """Rótulos "Clube de Desconto" (às vezes partidos em duas caixas), agrupados em linhas da grade."""
    out = []
    for c in caixas:
        if re.search(r'clube\s*de\s*desconto', c['t'], re.I): out.append(dict(c))
        elif re.fullmatch(r'clube\s*de', c['t'], re.I):
            par = next((o for o in caixas if o['t'].lower() == 'desconto' and abs(o['y0'] - c['y0']) < c['h']
                        and -8 < o['x0'] - c['x1'] < 3 * c['h']), None)
            if par: out.append({**c, 'x1': par['x1'], 't': 'Clube de Desconto'})
    out.sort(key=lambda a: a['y0'])
    linha, inicio = -1, -1e9
    for a in out:   # selos da mesma linha variam algumas dezenas de px (o do queijo fica mais alto)
        if a['y0'] - inicio > max(a['h'], 11) * 6: linha += 1; inicio = a['y0']
        a['linha'] = linha
    return sorted(out, key=lambda a: (a['linha'], a['x0']))


# ---------- recorte da foto ----------

def _reconstruir(semente, permitido):
    """Pixels de `permitido` ligados a `semente` (preenchimento por inundação em máscara binária)."""
    import cv2
    n, rot = cv2.connectedComponents(permitido.astype(np.uint8), connectivity=4)
    ids = np.unique(rot[semente & permitido]); ids = ids[ids > 0]
    return np.isin(rot, ids)


def recortar_foto(img, apagar=()):
    """Foto do produto (RGB, com fundo da arte) -> PNG transparente. `apagar`: caixas (selo, preço) a cobrir
    com a cor do fundo antes do recorte."""
    import cv2
    from .recorte_objetos import mascara
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    borda = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    q = (borda // 12).astype(int)
    chaves, cont = np.unique(q, axis=0, return_counts=True)
    cor_fundo = borda[(q == chaves[cont.argmax()]).all(1)].mean(0)
    for x0, y0, x1, y1 in apagar:
        a[max(0, int(y0)):max(0, int(y1)), max(0, int(x0)):max(0, int(x1))] = cor_fundo
    img = Image.fromarray(a.astype(np.uint8))
    ia = mascara(img) > .5
    # paleta do fundo: só cores que dominam a borda (>= 8% dela); uma caixa branca encostada não vira "fundo"
    pal = [borda[(q == ch).all(1)].mean(0) for ch, n in zip(chaves, cont) if n >= len(borda) * .08]
    cor_de_fundo = np.min([np.abs(a - p).max(axis=2) for p in pal], axis=0) < 18
    # sombra do produto no fundo: mesmo tom, mais escuro (matiz até 8° abaixo, saturada)
    hsv = np.asarray(img.convert('HSV')).astype(np.float32) / 255
    for p in pal:
        hp, sp, vp = colorsys.rgb_to_hsv(*(p / 255))
        if sp < .5: continue
        dh = (hsv[..., 0] - hp + .5) % 1 - .5
        cor_de_fundo |= (dh > -8 / 360) & (dh < 2.5 / 360) & (hsv[..., 1] > .6) & (hsv[..., 2] > vp * .45) & (hsv[..., 2] < vp * .985)
    # o contorno do produto é barreira: a varinha não vaza para a bandeja amarela pela borda encostada no fundo
    cinza = np.asarray(img.convert('L')).astype(np.float32)
    grad = np.hypot(cv2.Sobel(cinza, cv2.CV_32F, 1, 0), cv2.Sobel(cinza, cv2.CV_32F, 0, 1))
    k3 = np.ones((3, 3), np.uint8)
    barreira = cv2.dilate((grad > 35).astype(np.uint8), k3) > 0
    semente = np.zeros(cinza.shape, bool); semente[0] = semente[-1] = semente[:, 0] = semente[:, -1] = True
    fundo = _reconstruir(semente, cor_de_fundo & ~barreira)
    for _ in range(3):  # barreira com cor de fundo encostada no fundo (borda das ondas da arte) também é fundo
        fundo |= cor_de_fundo & (cv2.dilate(fundo.astype(np.uint8), k3, iterations=2) > 0)
    produto = (~fundo | ia).astype(np.uint8)
    produto = cv2.morphologyEx(produto, cv2.MORPH_CLOSE, k3, iterations=2)
    produto = cv2.morphologyEx(produto, cv2.MORPH_OPEN, k3, iterations=3)   # linhas finas soltas
    fora = _reconstruir(semente, produto == 0)
    produto = (~fora).astype(np.uint8)                                       # buracos internos fechados
    n, rot, stats, _ = cv2.connectedComponentsWithStats(produto, connectivity=8)
    if n > 1:
        maior = stats[1:, cv2.CC_STAT_AREA].max()
        produto = np.isin(rot, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= maior * .04]).astype(np.uint8)
    produto = cv2.erode(produto, k3)                                         # tira o filete do fundo na borda
    alpha = Image.fromarray(produto * 255).filter(ImageFilter.GaussianBlur(1))
    out = img.convert('RGBA'); out.putalpha(alpha)
    caixa = alpha.point(lambda p: 255 if p > 32 else 0).getbbox()
    if caixa: out = out.crop(caixa)
    buf = io.BytesIO(); out.save(buf, 'PNG'); return buf.getvalue()


# ---------- leitura da página ----------

def ler_pagina(img, pagina=1, fator=1.0):
    """Imagem da página -> [{'nome','por','de','unidade','avisos','pagina','area','png'}] (area em unidades
    da página: pixels / fator). Sem rótulos "Clube de Desconto" reconhecidos: lista vazia."""
    from .encarte import avisos
    img = img.convert('RGB')
    W, H = img.size
    with LOCK:  # um por vez: OCR e recorte são pesados
        grande = img.resize((W * 2, H * 2), Image.Resampling.LANCZOS)
        caixas = _ler(grande, 'latino', 2)
        for c in caixas: c['cx'] = (c['x0'] + c['x1']) / 2
        ancoras = _ancoras(caixas)
        if not ancoras: return []
        hm = sorted(max(b['h'], 11) for b in ancoras)[len(ancoras) // 2]
        # a primeira linha começa abaixo da faixa larga do cabeçalho ("OFERTAS VÁLIDAS DE…"): logos e textos
        # da arte acima dela não são título de produto
        faixas = [c['y1'] for c in caixas if c['x1'] - c['x0'] > W * .45 and c['y1'] < ancoras[0]['y0']]
        inicio = max(faixas, default=0)
        itens = []
        for a in ancoras:
            h = max(a['h'], 11)
            mesma = [b for b in ancoras if b['linha'] == a['linha']]
            i = mesma.index(a)
            esq = 0 if i == 0 else (mesma[i - 1]['x1'] + a['x0']) / 2
            dir_ = W if i == len(mesma) - 1 else (a['x1'] + mesma[i + 1]['x0']) / 2
            acima = [b for b in ancoras if b['linha'] < a['linha']]
            topo = max((b['y1'] + hm * 3.2 for b in acima), default=inicio)   # abaixo dos preços da linha de cima
            # título: primeiro bloco de texto da coluna, de cima para baixo
            cel = sorted([c for c in caixas if esq - 8 <= c['x0'] and c['x1'] <= dir_ + 8 and topo <= c['y0'] < a['y0'] - h * 3
                          and hm * .7 <= c['h'] <= hm * 1.5 and re.search('[A-Za-zÀ-ú]', c['t'])],
                         key=lambda c: (round(c['y0'] / 6), c['x0']))
            bloco = []
            for c in cel:
                if bloco and c['y0'] - max(b['y1'] for b in bloco) > h * 1.2: break
                bloco.append(c)
            nome = re.sub(r'\s+', ' ', ' '.join(c['t'] for c in bloco)).strip()
            nome = _numeros(nome)
            fim_titulo = max((c['y1'] for c in bloco), default=topo)
            selo = (a['x0'] - 6, a['y0'] - 4, a['x1'] + 16, a['y1'] + h * 5.6)
            normal = (max(esq, a['x0'] - h * 7.5), a['y1'] - h * .2, a['x0'] + 2, a['y1'] + h * 4.8)
            corte = lambda r: img.crop(tuple(int(max(0, min(lim, v))) for v, lim in zip(r, (W, H, W, H))))
            por, lido_por = _preco(corte((a['x0'] - 5, a['y1'], a['x1'] + 15, a['y1'] + h * 5.5)))
            de, lido_de = _preco(corte((normal[0], a['y1'] + h * .5, a['x0'] + 2, a['y1'] + h * 4.6)))
            unidade = _unidade(lido_por + ' ' + lido_de)
            # a foto pode descer ao lado do selo (queijo): vai até a linha dos preços
            foto = [int(esq + 4), int(fim_titulo + 6), int(dir_ - 4), int(min(H, a['y1'] + h * 4.2))]
            if foto[3] - foto[1] < 30 or foto[2] - foto[0] < 30: continue
            png = recortar_foto(img.crop(foto), [(x0 - foto[0], y0 - foto[1], x1 - foto[0], y1 - foto[1]) for x0, y0, x1, y1 in (selo, normal)])
            area = [min(foto[0], normal[0]), min(foto[1], fim_titulo - h * 3 if bloco else foto[1]), max(foto[2], selo[2]), max(foto[3], selo[3])]
            itens.append({'nome': nome, 'por': por, 'de': de, 'unidade': unidade, 'pagina': pagina, 'png': png,
                          'area': [round(v / fator, 1) for v in area], 'avisos': [AVISO] + avisos(nome, por, de, unidade)})
    return itens


def paginas_so_imagem(doc):
    """Páginas do PDF sem texto e cobertas por uma imagem (encarte exportado como foto): número -> imagem PIL
    na resolução da própria imagem, e o fator pixels/ponto."""
    import pymupdf
    out = {}
    for page in doc:
        if page.get_text('words'): continue
        infos = page.get_image_info()
        if not infos: continue
        maior = max(infos, key=lambda i: (i['bbox'][2] - i['bbox'][0]) * (i['bbox'][3] - i['bbox'][1]))
        bb = pymupdf.Rect(maior['bbox'])
        if bb.get_area() < page.rect.get_area() * .8: continue
        fator = min(4, max(1, maior['width'] / max(1, bb.width)))
        pix = page.get_pixmap(matrix=pymupdf.Matrix(fator, fator), alpha=False)
        out[page.number + 1] = (Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB'), fator)
    return out
