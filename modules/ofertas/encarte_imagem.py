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

Conferido nos encartes Super Oferta Tijuca (PNG 1080×1350), Química Ypê (PDF-imagem 1228×1754) e Dia dos
Supermercados (PDF-imagem de 2 páginas a 150 dpi, título acima da foto e selo embaixo à direita, com um banner):
48 de 48 produtos com nome e preços, e as fotos recortadas. Os textos são sugestão; o usuário confere no editor.
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
    r = _motor(rec)(buf.getvalue(), use_det=True, use_cls=False, use_rec=True)  # explícito: a leitura direta muda o padrão
    if r is None or getattr(r, 'boxes', None) is None: return []
    out = []
    for box, t in zip(r.boxes, r.txts):
        xs = [float(p[0]) / escala for p in box]; ys = [float(p[1]) / escala for p in box]
        out.append({'x0': min(xs), 'y0': min(ys), 'x1': max(xs), 'y1': max(ys), 'h': max(ys) - min(ys), 't': str(t).strip()})
    return out


def _textos(img, rec='numeros'):
    return [c['t'] for c in _ler(img, rec)]


def _linha(img):
    """Leitura direta de um recorte como UMA linha de texto (sem o detector). Acerta números grandes e
    isolados que o detector perde: o "4" do selo do queijo saía "Z,29" ou só ",29"."""
    buf = io.BytesIO(); img.save(buf, 'PNG')
    r = _motor('numeros')(buf.getvalue(), use_det=False, use_cls=False, use_rec=True)
    return ' '.join(str(t) for t in (r.txts or [])) if r is not None else ''


def _votos(texto, modo, votos, fracos):
    for m in re.finditer(r'(?<![\d,.])(\d{1,3})\s*[,.]\s*(\d{2})(?!\d)', texto): votos[f'{m[1]},{m[2]}'] += 1
    # centavos elevados com a vírgula minúscula: o OCR lê "12 99" ou, na leitura direta, "1899"
    for m in re.finditer(r'(?<![\d,.])(\d{1,3})\s+(\d{2})(?![\d,.])', texto): fracos[f'{m[1]},{m[2]}'] += 1
    if modo == 'linha':
        for m in re.finditer(r'(?<![\d,.])(\d{1,3})(\d{2})(?![\d,.]|\s?g\b)', texto): fracos[f'{m[1]},{m[2]}'] += 1
    else:  # o detector também junta tudo quando a vírgula some: "10499" sozinho
        for m in re.finditer(r'(?<![\d,.\w])(\d{1,3})(\d{2})(?![\d,.\w])', texto): fracos[f'{m[1]},{m[2]}'] += 1


def _melhor(cont):
    """Leitura mais votada; no empate entre leituras sem vírgula, a mais longa que contém as outras
    ("104,99" contra "10,49" e "1,04"): o OCR perde dígito muito mais do que inventa."""
    digitos = {k: k.replace(',', '') for k in cont}
    nota = lambda k: cont[k] + .5 * sum(1 for o in cont if o != k and digitos[k].startswith(digitos[o]))
    return max(cont, key=nota)


def _preco(img, linha=None, pagina=(), todos=False):
    """-> (valor "12,99", textos lidos) de um recorte. Leituras diretas da linha do preço (`linha`, sem o R$
    de cima e o que vem embaixo) e com detector (margem branca, cinza, dobro, metade) até duas concordarem.
    A margem branca é essencial para o detector: sem ela ele não acha os números grandes do selo.
    `pagina`: textos que a leitura da página inteira achou no recorte (valem um voto). `todos`: lê todas as
    variantes e devolve também os candidatos ({valor: votos}), para escolher o par de preços coerente."""
    alvo = linha or img
    dobro = lambda im: im.resize((im.width * 2, im.height * 2), Image.Resampling.LANCZOS)
    variantes = [lambda: ('linha', alvo),
                 lambda: ('linha', ImageOps.autocontrast(alvo.convert('L')).convert('RGB')),
                 lambda: ('det', ImageOps.expand(img, 40, fill=(255, 255, 255))),
                 lambda: ('det', ImageOps.expand(ImageOps.autocontrast(img.convert('L')), 40, fill=255).convert('RGB')),
                 lambda: ('det', ImageOps.expand(dobro(img), 60, fill=(255, 255, 255))),
                 lambda: ('det', ImageOps.expand(img.resize((max(1, img.width // 2), max(1, img.height // 2))), 30, fill=(255, 255, 255))),
                 # encarte em baixa resolução (PDF exportado a 150 dpi): a linha ampliada lê o dígito que some
                 lambda: ('linha', dobro(alvo)),
                 lambda: ('linha', dobro(ImageOps.autocontrast(alvo.convert('L')).convert('RGB')))]
    votos, fracos, lidos = Counter(), Counter(), []
    for t in pagina: _votos(t, 'det', votos, fracos)
    for v in variantes:
        modo, imagem = v()
        texto = _linha(imagem) if modo == 'linha' else ' '.join(_textos(imagem))
        lidos.append(texto)
        _votos(texto, modo, votos, fracos)
        if not todos and votos and votos.most_common(1)[0][1] >= 2: break
    escolha = votos or fracos
    valor = (escolha.most_common(1)[0][0] if votos else _melhor(fracos)) if escolha else ''
    if todos: return valor, ' '.join(lidos), dict(fracos) | {k: n + 10 for k, n in votos.items()}
    return valor, ' '.join(lidos)


def _num(v):
    return float(v.replace(',', '.')) if v else 0.0


def _par_coerente(por, de, cand_por, cand_de):
    """Preço do clube e preço normal lidos separadamente às vezes ganham ou perdem um dígito ("R$12,99" lido
    "112,99"; "104,99" lido "10,48"). Se o par não faz sentido (normal até 3× o do clube), escolhe entre os
    candidatos lidos o par coerente com mais votos; sem nenhum, mantém a leitura (o aviso pede conferência)."""
    ok = lambda p, d: not d or (_num(p) > 0 and _num(p) < _num(d) <= _num(p) * 3)
    if ok(por, de): return por, de
    pares = [(cp, cd) for cp in cand_por for cd in cand_de if ok(cp, cd)]
    # dígito a mais vindo do "R$": "112,99" -> "12,99"
    for cd in cand_de:
        if len(cd.split(',')[0]) == 3 and cd[0] == '1' and ok(por, cd[1:]): pares.append((por, cd[1:]))
    if not pares: return por, de
    return max(pares, key=lambda pd: cand_por.get(pd[0], 0) + cand_de.get(pd[1], 0))


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


def recortar_foto(img, apagar=(), so_ia=False, base=None, escala=1):
    """Foto do produto (RGB, com fundo da arte) -> PNG transparente. `apagar`: caixas (selo, preço) a cobrir
    com a cor do fundo antes do recorte. `so_ia`: fundo fotográfico (banner), sem cor de fundo para a
    varinha: vale só a máscara da IA. `base`: caixa do selo; se o produto desce por trás dele, a foto
    termina reta na altura do selo (sem o "dente" retangular onde o selo cobria o produto). `escala`: a foto
    foi ampliada (contornos mais suaves: o limite do contorno acompanha)."""
    import cv2
    from .recorte_objetos import mascara
    # a IA vê a foto como está: com o selo apagado, o retângulo liso que sobra parecia ser o objeto
    # (frascos brancos sumiam). A área apagada sai da máscara depois.
    ia = mascara(img.convert('RGB')) > .5
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    borda = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    q = (borda // 12).astype(int)
    chaves, cont = np.unique(q, axis=0, return_counts=True)
    cor_fundo = borda[(q == chaves[cont.argmax()]).all(1)].mean(0)
    for x0, y0, x1, y1 in apagar:
        a[max(0, int(y0)):max(0, int(y1)), max(0, int(x0)):max(0, int(x1))] = cor_fundo
        ia[max(0, int(y0)):max(0, int(y1)), max(0, int(x0)):max(0, int(x1))] = False
    img = Image.fromarray(a.astype(np.uint8))
    if so_ia: return _png_mascara(img, ia.astype(np.uint8))
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
    barreira = cv2.dilate((grad > 35 / escala).astype(np.uint8), k3) > 0
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
    if base is not None:
        x0, y0, x1, _ = (int(max(0, v)) for v in base)
        faixa = produto[max(0, y0 - 4):y0, x0:x1]
        if y0 > 0 and faixa.size and faixa.mean() > .15: produto[y0:] = 0
    return _png_mascara(img, produto)


def _png_mascara(img, produto):
    """Máscara 0/1 -> PNG transparente recortado no produto (sobras soltas pequenas saem)."""
    import cv2
    n, rot, stats, _ = cv2.connectedComponentsWithStats(produto, connectivity=8)
    if n > 2:
        maior = stats[1:, cv2.CC_STAT_AREA].max()
        produto = np.isin(rot, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= maior * .04]).astype(np.uint8)
    alpha = Image.fromarray(produto * 255).filter(ImageFilter.GaussianBlur(1))
    out = img.convert('RGBA'); out.putalpha(alpha)
    caixa = alpha.point(lambda p: 255 if p > 32 else 0).getbbox()
    if caixa: out = out.crop(caixa)
    buf = io.BytesIO(); out.save(buf, 'PNG'); return buf.getvalue()


# ---------- leitura da página ----------

# textos do selo e das chamadas de preço: nunca são título de produto
TEXTO_SELO = re.compile(r'clube|desconto|sai\s*por|promo[çc]|\bness[ae]\b|\bnest[ae]\b|embalagem|leve\s*\d|pague|^\W*(cada|kg|un|r\$)\W*$', re.I)


def _no_selo(img, a):
    """O rótulo "Clube de Desconto" de uma oferta está sobre o selo colorido; o mesmo texto solto na arte
    (cabeçalho "Para ter acesso ao preço Clube de Descontos…") está sobre fundo claro e não é oferta."""
    caixa = np.asarray(img.crop((int(a['x0']), int(a['y0']), int(a['x1']) + 1, int(a['y1']) + 1)).convert('RGB'))
    return caixa.size == 0 or (caixa.min(axis=2) > 200).mean() < .3


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
        ancoras = [a for a in _ancoras(caixas) if _no_selo(img, a)]
        if not ancoras: return []
        hm = sorted(max(b['h'], 11) for b in ancoras)[len(ancoras) // 2]
        # a primeira linha começa abaixo da faixa larga do cabeçalho ("OFERTAS VÁLIDAS DE…"): logos e textos
        # da arte acima dela não são título de produto
        faixas = [c['y1'] for c in caixas if c['x1'] - c['x0'] > W * .45 and c['y1'] < ancoras[0]['y0']]
        inicio = max(faixas, default=0)
        celulas = []
        for a in ancoras:
            h = max(a['h'], 11)
            mesma = [b for b in ancoras if b['linha'] == a['linha']]
            i = mesma.index(a)
            esq = 0 if i == 0 else (mesma[i - 1]['x1'] + a['x0']) / 2
            dir_ = W if i == len(mesma) - 1 else (a['x1'] + mesma[i + 1]['x0']) / 2
            acima = [b for b in ancoras if b['linha'] < a['linha']]
            topo = max((b['y1'] + hm * 3.2 for b in acima), default=inicio)   # abaixo dos preços da linha de cima
            celulas.append(dict(a=a, h=h, esq=esq, dir=dir_, topo=topo, i=i, mesma=mesma,
                                selo=(a['x0'] - 6, a['y0'] - 4, a['x1'] + 16, a['y1'] + h * 5.6),
                                normal=(max(esq, a['x0'] - h * 7.5), a['y1'] - h * .2, a['x0'] + 2, a['y1'] + h * 4.8)))
        larguras = sorted(o['dir'] - o['esq'] for o in celulas)
        for cl in celulas:
            a, h, esq, dir_, topo = cl['a'], cl['h'], cl['esq'], cl['dir'], cl['topo']
            # oferta em banner (foto de fundo, produto ao lado do preço, título logo acima do selo)
            cl['banner'] = len(celulas) > 2 and dir_ - esq > larguras[len(larguras) // 2] * 2.2
            # candidatos a título: textos da coluna (pelo centro: o título é mais largo que o selo e fica
            # centrado na foto, que nem sempre está alinhada ao selo), sem as chamadas de preço
            limite = a['y0'] - h * (1.5 if cl['banner'] else 3)
            cl['cel'] = sorted([c for c in caixas if esq - 8 <= c['cx'] <= dir_ + 8 and topo <= c['y0'] < limite
                                and hm * .7 <= c['h'] <= hm * 2.2 and re.search('[A-Za-zÀ-ú]', c['t']) and not TEXTO_SELO.search(c['t'])],
                               key=lambda c: (round(c['y0'] / 6), c['x0']))
        for cl in celulas:
            a, h, cel = cl['a'], cl['h'], cl['cel']
            # o título de cada oferta fica na mesma altura nas colunas da linha: o primeiro texto alinhado com
            # outra coluna é o título (textos da arte acima dele, como o "Para ter acesso…", ficam de fora)
            vizinhas = [o['cel'] for o in celulas if o is not cl and o['a']['linha'] == a['linha']]
            alinhado = lambda c: any(abs(o['y0'] - c['y0']) <= max(hm, 12) for v in vizinhas for o in v)
            inicio_titulo = next((c for c in cel if alinhado(c)), cel[0] if cel else None)
            bloco = []
            for c in cel:
                if inicio_titulo is None or c['y0'] < inicio_titulo['y0'] - 2: continue
                if bloco and c['y0'] - max(b['y1'] for b in bloco) > h * 1.2: break
                bloco.append(c)
            cl['bloco'] = bloco
        itens = []
        for cl in celulas:
            a, h, esq, dir_, topo, bloco = cl['a'], cl['h'], cl['esq'], cl['dir'], cl['topo'], cl['bloco']
            # linhas do título em ordem de leitura: pedaços da mesma linha (alturas um pouco diferentes) da
            # esquerda para a direita ("INTEIRO" + "CONGELADO 1,01KG")
            linhas = []
            for c in sorted(bloco, key=lambda c: c['y0']):
                if linhas and abs(c['y0'] - linhas[-1][0]['y0']) < min(c['h'], linhas[-1][0]['h']) * .6: linhas[-1].append(c)
                else: linhas.append([c])
            nome = re.sub(r'\s+', ' ', ' '.join(c['t'] for l in linhas for c in sorted(l, key=lambda c: c['x0']))).strip()
            nome = _numeros(nome)
            fim_titulo = max((c['y1'] for c in bloco), default=topo)
            selo, normal = cl['selo'], cl['normal']
            corte = lambda r: img.crop(tuple(int(max(0, min(lim, v))) for v, lim in zip(r, (W, H, W, H))))
            dentro = lambda r: [c['t'] for c in caixas if r[0] - 4 <= c['x0'] and c['x1'] <= r[2] + 4 and r[1] - 4 <= c['y0'] and c['y1'] <= r[3] + 4]
            r_por = (a['x0'] - 5, a['y1'], a['x1'] + 15, a['y1'] + h * 5.5)
            r_por_linha = (a['x0'] - 5, a['y1'], a['x1'] + 15, a['y1'] + h * 4.4)
            r_de = (normal[0], a['y1'] + h * .5, a['x0'] + 2, a['y1'] + h * 4.6)
            por, lido_por = _preco(corte(r_por), corte(r_por_linha), dentro(r_por))
            de, lido_de = _preco(corte(r_de), corte(r_de), dentro(r_de))
            if de and not (0 < _num(por) < _num(de) <= _num(por) * 3):  # par incoerente: relê tudo e escolhe
                _, lp, cand_por = _preco(corte(r_por), corte(r_por_linha), dentro(r_por), todos=True)
                _, ld, cand_de = _preco(corte(r_de), corte(r_de), dentro(r_de), todos=True)
                por, de = _par_coerente(por, de, cand_por, cand_de)
                lido_por += ' ' + lp; lido_de += ' ' + ld
            if not por and not de: continue   # sem preço nenhum não é oferta
            # unidade ("cada", "kg", "100g"): textos da página na linha dos preços, mais o que os recortes leram
            na_linha = [c['t'] for c in caixas if normal[0] - h <= c['x0'] and c['x1'] <= a['x1'] + h * 2
                        and a['y1'] <= c['y0'] <= a['y1'] + h * 5]
            unidade = _unidade(' '.join(na_linha) + ' ' + lido_por + ' ' + lido_de)
            # equivalência por quilo na parte de baixo do selo ("No Clube de Desconto o preço do Kg sai por: 42,99")
            extra = {}
            chamadas = [c for c in caixas if re.search(r'clube\s*de', c['t'], re.I)
                        and a['y1'] + h * 2.5 < c['y0'] < a['y1'] + h * 8 and a['x0'] - h * 2 <= c['x0'] <= a['x1']
                        and not any(abs(c['x0'] - b['x0']) < 2 and abs(c['y0'] - b['y0']) < 2 for b in ancoras)]
            if chamadas:
                c = min(chamadas, key=lambda c: c['y0'])
                regiao = corte((c['x1'] - 4, c['y0'] - h * .8, selo[2] + 20, c['y0'] + h * 2.8))
                valor, _ = _preco(regiao, regiao)
                if valor and valor not in (por, de):
                    extra = {'equivalenciatexto': 'No Clube de Desconto o preço do Kg sai por:', 'equivalenciapreco': valor,
                             'equivalenciaunidade': 'kg'}
                    selo = (selo[0], selo[1], selo[2], max(selo[3], c['y0'] + h * 2.8))
            banner = cl['banner']
            linha = [o for o in celulas if o['a']['linha'] == a['linha']]
            k = linha.index(cl)
            ant, prox = (linha[k - 1] if k > 0 else None), (linha[k + 1] if k < len(linha) - 1 else None)
            if banner:
                # a foto do banner é o que fica à direita do selo
                foto = [int(selo[2] + h), int(topo), int(dir_ - 4), int(min(H, a['y1'] + h * 6.5))]
            else:
                # a foto pode descer ao lado do selo (queijo): vai até a linha dos preços; nos lados, cobre a
                # largura do título (a foto fica centrada nele), sem entrar no título da coluna vizinha
                x0 = min(esq + 4, min((c['x0'] for c in bloco), default=esq) - 8)
                x1 = max(dir_ - 4, max((c['x1'] for c in bloco), default=dir_) + 8)
                if ant and ant['bloco']: x0 = max(x0, max(c['x1'] for c in ant['bloco']) + 4)
                if prox and prox['bloco']: x1 = min(x1, min(c['x0'] for c in prox['bloco']) - 4)
                foto = [int(max(0, x0)), int(fim_titulo + 6), int(min(W, x1)), int(min(H, a['y1'] + h * 4.2))]
            if foto[3] - foto[1] < 30 or foto[2] - foto[0] < 30: continue
            # encarte em baixa resolução: o recorte é feito na foto ampliada (bordas mais limpas, a limpeza
            # das bordas come menos do produto e a foto sai maior)
            esc = 2 if max(foto[2] - foto[0], foto[3] - foto[1]) < 500 else 1
            recorte = img.crop(foto)
            if esc > 1: recorte = recorte.resize((recorte.width * esc, recorte.height * esc), Image.Resampling.LANCZOS)
            # selo e preço normal desta oferta e os das vizinhas que entram na foto
            caixas_preco = [selo, normal] + ([ant['selo']] if ant else []) + ([prox['normal']] if prox else [])
            apagar = [((x0 - foto[0]) * esc, (y0 - foto[1]) * esc, (x1 - foto[0]) * esc, (y1 - foto[1]) * esc)
                      for x0, y0, x1, y1 in caixas_preco]
            png = recortar_foto(recorte, [] if banner else apagar, so_ia=banner, base=None if banner else apagar[0], escala=esc)
            area = [min(foto[0], normal[0]), min(foto[1], fim_titulo - h * 3 if bloco else foto[1]), max(foto[2], selo[2]), max(foto[3], selo[3])]
            itens.append({'nome': nome, 'por': por, 'de': de, 'unidade': unidade, **extra, 'pagina': pagina, 'png': png,
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
        # página que é exatamente uma imagem: os pixels originais, sem reamostrar (a página redesenhada
        # numa escala um pouco diferente borra os centavos pequenos: "6,99" saía "6,92")
        imagens = page.get_images(full=True)
        if len(imagens) == 1 and abs(bb.x0 - page.rect.x0) < 2 and abs(bb.y0 - page.rect.y0) < 2 \
                and abs(bb.x1 - page.rect.x1) < 2 and abs(bb.y1 - page.rect.y1) < 2 and page.rotation == 0:
            try:
                pix = pymupdf.Pixmap(doc, imagens[0][0])
                if pix.n - pix.alpha != 3: pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                if pix.alpha: pix = pymupdf.Pixmap(pix, 0)
                img = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
                out[page.number + 1] = (img, img.width / page.rect.width)
                continue
            except Exception:
                pass
        pix = page.get_pixmap(matrix=pymupdf.Matrix(fator, fator), alpha=False)
        out[page.number + 1] = (Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB'), fator)
    return out
