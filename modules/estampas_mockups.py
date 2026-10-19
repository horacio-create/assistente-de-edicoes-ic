"""Mockups das estampas: a foto da camisa branca vestida, recolorida na cor escolhida e com a arte aplicada na medida
real (a escala de cada foto vem do comprimento da camisa), acompanhando as dobras do tecido.

As fotos, as máscaras e as medidas são preparadas uma vez por estampas_dados/preparar_mockups.py."""
import io
import json
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from . import estampas as E

PASTA = Path(__file__).parent / 'estampas_dados' / 'mockups'
MEDIDAS = json.loads((PASTA.parent / 'mockups.json').read_text(encoding='utf-8'))
VISTAS = {'frente': 'Frente', 'costas': 'Costas', 'lateral-esquerda': 'Lateral esquerda', 'lateral-direita': 'Lateral direita'}
LOCAL_DA_VISTA = {'frente': 'frente', 'costas': 'costas', 'lateral-esquerda': 'manga-esquerda', 'lateral-direita': 'manga-direita'}
ABAIXO_DA_GOLA = {('comum', 'frente'): 7, ('baby', 'frente'): 6, ('comum', 'costas'): 10, ('baby', 'costas'): 8}  # cm, como na folha
DOBRA_PX = 2          # quanto a arte se desloca acompanhando as dobras pequenas (no máximo)
VOLUME = 3.2          # força do encurtamento onde o tecido se inclina (busto, barriga): 0 desliga
CILINDRO = 1.15       # raio da curva do tronco em relação à meia largura visível (maior = mais plano)


def _campo(luz, mascara, raio, maximo):
    """Deslocamento pela inclinação da luz do tecido (onde a luz muda, a superfície se curva), normalizado."""
    suave = np.asarray(Image.fromarray((np.clip(luz, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(raio))).astype(np.float32)
    gy, gx = np.gradient(suave)
    escala = maximo / max(float(np.percentile(np.hypot(gx, gy)[mascara > .5], 99)), 1e-3)
    return gx * escala, gy * escala


def disponivel(tipo, tamanho):
    return all(f'{tipo}-{tamanho}-{v}' in MEDIDAS for v in VISTAS)


@lru_cache(maxsize=4)   # as 4 vistas de um tamanho (a prévia do passo 6); ~40 MB cada
def _foto(nome):
    """Tudo da foto que não depende da cor nem da arte: foto, máscara (0–1), luz do tecido (1 = branco), deslocamento das
    dobras, volume, relevo das dobras e a foto com a borda da camisa já trocada pela cor de fora."""
    foto = np.asarray(Image.open(PASTA / f'{nome}.jpg').convert('RGB')).astype(np.float32)
    mascara = np.asarray(Image.open(PASTA / f'{nome}-mascara.png').convert('L')).astype(np.float32) / 255
    lum = foto @ np.float32([.3, .6, .1])
    luz = np.clip(lum / MEDIDAS[nome]['branco'], 0, 1.15)
    dobras = _campo(luz, mascara, 10, DOBRA_PX)
    volume = np.asarray(Image.fromarray((np.clip(luz, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(16))).astype(np.float32) / 255
    # relevo das dobras; a média só considera o tecido: perto da borda, a pele e o fundo não entram na conta
    # (senão a borda da camisa ganha um brilho)
    detalhe = (luz - _borrar_dentro(luz, mascara, 14)) * (mascara > .5)
    # pixels da borda misturam o branco da camisa com o que está fora dela: troca essa parte pela cor de fora (pele,
    # fundo), senão a camisa colorida ganha um fio claro no contorno
    fora = foto.copy()
    borda = (mascara > .01) & (mascara < .99)
    if borda.any():
        vizinhos = np.stack([_borrar_dentro(foto[..., c], 1 - mascara, 4, 1) for c in range(3)], -1)
        fora[borda] = vizinhos[borda]
    f16 = lambda a: a.astype(np.float16)
    return foto, f16(mascara), f16(luz), tuple(map(f16, dobras)), f16(volume), f16(detalhe), fora.astype(np.uint8)


def _recolorir(foto, mascara, luz, cor, detalhe, fora):
    if cor == 'branca': return foto.copy()
    alvo = np.float32(E._rgb(E.COR_HEX[cor])) * 255
    escura = 1 - E._lum(E.COR_HEX[cor])
    # a cor vezes a luz do tecido; em cores escuras, o relevo das dobras é reforçado para não virar uma mancha chapada
    tecido = alvo * luz[..., None].astype(np.float32) + (escura * 160 * detalhe.astype(np.float32))[..., None]
    m = mascara[..., None].astype(np.float32)
    return fora * (1 - m) + np.clip(tecido, 0, 255) * m


def _borrar_dentro(canal, peso, raio, passadas=3):
    """Desfoque (três médias móveis ≈ gaussiano) que só mistura pixels com peso: não puxa cor de fora da região."""
    r = max(1, round(raio * .6))
    def f(a):
        for _ in range(passadas): a = _media(_media(a, r, 0), r, 1)
        return a
    return f(canal * peso) / np.maximum(f(peso), 1e-4)


def _caixa(nome, tipo, tamanho, vista, proporcao, ajuste):
    """Retângulo da arte na foto (px): área de impressão do tamanho, medida final e deslocamento do ajuste."""
    md = MEDIDAS[nome]; ppc = md['ppc']
    local = LOCAL_DA_VISTA[vista]
    aw, ah, _ = E.area(tipo, tamanho, local)
    w, h, dx, dy = E.colocar(proporcao, aw, ah, ajuste)
    if vista in ('frente', 'costas'): x0, y0 = md['cx'] - aw * ppc / 2, md['gola'] + ABAIXO_DA_GOLA[tipo, vista] * ppc
    else: x0, y0 = md['mx'] - aw * ppc / 2, md['my'] - ah * ppc / 2
    return x0 + dx * ppc, y0 + dy * ppc, w * ppc, h * ppc


def _media(a, raio, eixo):
    """Média móvel (2·raio + 1) ao longo de um eixo, repetindo as bordas."""
    pad = [(0, 0)] * a.ndim; pad[eixo] = (raio + 1, raio)
    c = np.cumsum(np.pad(a, pad, mode='edge'), eixo, dtype=np.float32)
    fim, ini = [slice(None)] * a.ndim, [slice(None)] * a.ndim
    fim[eixo], ini[eixo] = slice(2 * raio + 1, None), slice(0, -2 * raio - 1)
    return (c[tuple(fim)] - c[tuple(ini)]) / (2 * raio + 1)


def _amostrar(im, sy, sx):
    """Leitura bilinear da arte RGBA em coordenadas fracionárias; fora dela, transparente. Mistura com o alfa
    pré-multiplicado para a borda não escurecer."""
    pad = np.zeros((im.shape[0] + 2, im.shape[1] + 2, 4), np.float32)
    pad[1:-1, 1:-1, :3] = im[..., :3] * im[..., 3:] / 255; pad[1:-1, 1:-1, 3] = im[..., 3]
    sy = np.clip(sy + 1, 0, pad.shape[0] - 1.001); sx = np.clip(sx + 1, 0, pad.shape[1] - 1.001)
    y0, x0 = sy.astype(int), sx.astype(int); fy, fx = (sy - y0)[..., None], (sx - x0)[..., None]
    p = (pad[y0, x0] * (1 - fx) + pad[y0, x0 + 1] * fx) * (1 - fy) + (pad[y0 + 1, x0] * (1 - fx) + pad[y0 + 1, x0 + 1] * fx) * fy
    p[..., :3] /= np.maximum(p[..., 3:], 1e-3) / 255
    return p


def gerar(tipo, tamanho, vista, cor='branca', pecas=()):
    """Imagem RGB do mockup. `pecas`: [{'local', 'ajuste', 'dados': {'previa': imagem RGBA, 'proporcao': l/a}}]."""
    nome = f'{tipo}-{tamanho}-{vista}'
    foto, mascara, luz, (gx, gy), volume, detalhe, fora = _foto(nome)
    mascara, luz, gx, gy, volume = (a.astype(np.float32) for a in (mascara, luz, gx, gy, volume))
    out = _recolorir(foto, mascara, luz, cor, detalhe, fora)
    for p in pecas:
        if p['local'] != LOCAL_DA_VISTA[vista]: continue
        arte = p['dados']
        x, y, w, h = _caixa(nome, tipo, tamanho, vista, arte['proporcao'], p.get('ajuste'))
        pw, ph = max(1, round(w)), max(1, round(h))
        im = np.asarray(arte['previa'].convert('RGBA').resize((pw, ph), Image.LANCZOS)).astype(np.float32)
        H, W = mascara.shape
        x0, y0 = round(x), round(y)
        # recorte da caixa que cai dentro da foto, com folga para o deslocamento das dobras
        folga = DOBRA_PX + 2
        a0, b0 = max(0, y0 - folga), max(0, x0 - folga)
        a1, b1 = min(H, y0 + ph + folga), min(W, x0 + pw + folga)
        if a1 > a0 and b1 > b0:
            yy, xx = np.mgrid[a0:a1, b0:b1].astype(np.float32)
            md = MEDIDAS[nome]
            if 'tronco' in md:
                # o tronco é um cilindro: perto das laterais, a arte se comprime ao contornar o corpo
                R = md['tronco'] / 2 * CILINDRO
                xx = md['cx'] + R * np.arcsin(np.clip((xx - md['cx']) / R, -.999, .999))
            # volume: onde a luz foge da do peito reto (mais clara em cima do busto, mais escura embaixo), o tecido está
            # inclinado e aparece encurtado na foto: cada linha da foto cobre mais da arte. Integra coluna a coluna.
            v = volume[a0:a1, b0:b1]; m = mascara[a0:a1, b0:b1] > .5
            # referência de cada coluna: a luz lateral do estúdio muda de uma coluna para outra e não é volume
            ref = np.nanmedian(np.where(m, v, np.nan), 0, keepdims=True)
            ref = np.where(np.isnan(ref), 1, ref)
            encurta = np.where(m, np.clip(1 - VOLUME * np.abs(v / ref - 1), .5, 1), 1)
            # colunas vizinhas deformam juntas, como um tecido contínuo (sem degraus entre elas)
            encurta = _media(_media(encurta, 24, 1), 6, 0)
            passo = 1 / encurta
            topo = min(max(y0 - a0, 0), a1 - a0 - 1)
            acum = np.cumsum(passo, 0); acum -= acum[topo]
            vy = acum + (a0 + topo - y0)  # linha da arte em cada pixel (0 no topo da estampa)
            # cada pixel da foto pega a arte desse ponto, mais o leve deslocamento das dobras
            px = _amostrar(im, vy - gy[a0:a1, b0:b1], xx - x0 - gx[a0:a1, b0:b1])
            alfa = px[..., 3] / 255 * mascara[a0:a1, b0:b1]
            # a tinta segue a luz do tecido (dobras e sombras), sem clarear acima do branco
            tinta = px[..., :3] * np.clip(luz[a0:a1, b0:b1], 0, 1.02)[..., None]
            out[a0:a1, b0:b1] = out[a0:a1, b0:b1] * (1 - alfa[..., None]) + tinta * alfa[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def jpeg(im, largura=None, qualidade=90):
    if largura: im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=qualidade, optimize=True); return buf.getvalue()


def nome_arquivo(cliente, tipo, tamanho, vista):
    return f'Mockup {cliente} - {E.TIPOS[tipo]} {tamanho} - {VISTAS[vista]}.jpg'
