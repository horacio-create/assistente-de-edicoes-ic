"""Prepara as fotos dos mockups (camisa branca vestida) para o sistema: foto em JPG, máscara da camisa e as medidas de
cada foto em mockups.json.

uso: python modules/estampas_dados/preparar_mockups.py "<pasta com as fotos>"

As fotos se chamam <tipo>-<tamanho>-<vista>.png (ex.: comum-M-frente.png; vistas frente, costas, lateral-esquerda e
lateral-direita). A máscara de cada foto fica na mesma pasta como mask-<nome>.png (ou em Mascaras/<nome>-mascara.png):
branco = tecido da camisa, preto (ou transparente) = o resto. Foto sem máscara usa um recorte automático por cor, menos preciso nos cantos.
Precisa de scipy, só para este script (pip install scipy); o sistema em si não usa.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from modules import estampas as E  # noqa: E402

ORIGEM = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
DESTINO = Path(__file__).with_name('mockups')
VISTAS = ('frente', 'costas', 'lateral-esquerda', 'lateral-direita')


def maiores(mask, minimo):
    lab, n = ndi.label(mask)
    if not n: return mask
    tam = ndi.sum(mask, lab, range(1, n + 1))
    return np.isin(lab, 1 + np.nonzero(tam >= minimo)[0])


def mascara_automatica(a):
    """Recorte por cor e textura: o fundo é liso e ligado às bordas; a camisa é clara, nem pele nem jeans."""
    h, w, _ = a.shape
    r, b = a[..., 0], a[..., 2]
    lum = a @ [.3, .6, .1]
    m = ndi.uniform_filter(lum, 7)
    desvio = np.sqrt(np.maximum(ndi.uniform_filter(lum * lum, 7) - m * m, 0))
    linha = np.median(np.concatenate([a[:, :30], a[:, -30:]], 1), 1)[:, None, :]
    dif = np.abs(a - linha).max(2)
    liso = desvio < 1.3
    lab, _ = ndi.label(liso)
    borda = np.unique(np.concatenate([lab[:, :2].ravel(), lab[:, -2:].ravel(), lab[:2].ravel()]))
    fundo = np.isin(lab, borda[borda > 0])
    tinta = (b - r) - (linha[..., 2] - linha[..., 0])  # a sombra do tecido puxa para o azul; o fundo, não
    fundo |= maiores(liso & (dif < 8) & (tinta < 5) & ~fundo, 800)
    fundo = ndi.binary_dilation(fundo, iterations=1)
    pele = r - b > 24
    jeans = (b - r > 18) & (a.max(2) - a.min(2) > 25)
    cabelo = ndi.binary_dilation(lum < 80, iterations=5)
    camisa = ~fundo & ~pele & ~jeans & ~cabelo & (lum > 95)
    camisa &= ~(ndi.binary_dilation(lum < 80, iterations=25) & (dif < 10))
    candidata = camisa
    camisa = ndi.binary_opening(camisa, iterations=6)  # corta as pontes finas por onde vazaria para o fundo
    lab, _ = ndi.label(camisa)
    centro = lab[int(h * .15):int(h * .6), int(w * .4):int(w * .6)]
    ids, cont = np.unique(centro[centro > 0], return_counts=True)
    camisa = ndi.binary_dilation(lab == ids[np.argmax(cont)], iterations=7) & candidata
    buracos = ~camisa & ndi.binary_fill_holes(camisa)
    lab, n = ndi.label(buracos)
    if n:
        tam = ndi.sum(buracos, lab, range(1, n + 1)); calor = ndi.mean(r - b, lab, range(1, n + 1))
        camisa |= np.isin(lab, 1 + np.nonzero((tam < 3000) | (calor < 38))[0])
    return Image.fromarray(camisa.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(.7))


def mascara_da_equipe(arquivo, tamanho):
    im = Image.open(arquivo)
    if im.size != tamanho: raise ValueError(f'{arquivo.name}: a máscara precisa ter {tamanho[0]} × {tamanho[1]} px, como a foto.')
    if 'A' in im.getbands() and np.asarray(im.getchannel('A')).min() < 255:
        return im.getchannel('A')  # fundo transparente: a camisa é o que está pintado
    return im.convert('L')


def medidas(tipo, tam, vista, a, m):
    """Escala (px por cm, pelo comprimento da camisa) e as referências para posicionar as áreas de impressão."""
    h, w = m.shape
    larg = m.sum(1)
    ys = np.nonzero(larg > 0)[0]
    y0, y1 = int(ys[0]), int(np.nonzero(larg > .3 * larg.max())[0][-1])
    info = {'ppc': round((y1 - y0) / E.TAMANHOS[tipo][tam]['camisa'][1], 3)}
    xs = np.arange(w)
    if vista in ('frente', 'costas'):
        # axila: onde a largura cai de vez ao sair das mangas; o centro do tronco vem logo abaixo dela
        H = y1 - y0
        faixa = range(int(y0 + .1 * H), int(y0 + .5 * H))
        axila = faixa[int(np.argmax([larg[y] - larg[y + 10] for y in faixa]))] + 10
        linhas = range(axila + 15, axila + 60)
        cx = float(np.median([(xs[m[y]].min() + xs[m[y]].max()) / 2 for y in linhas]))
        tronco = float(np.median([xs[m[y]].max() - xs[m[y]].min() for y in linhas]))
        gola = int(np.nonzero(m[:, int(cx) - 4:int(cx) + 5].any(1))[0][0])
        return info | {'cx': round(cx, 1), 'gola': gola, 'tronco': round(tronco, 1)}
    # lateral: o braço sai por baixo da manga; o alto do braço marca a barra da manga e o centro dela
    pele = (a[..., 0] - a[..., 2] > 24) & (a @ [.3, .6, .1] > 60)
    lab, n = ndi.label(ndi.binary_opening(pele, iterations=2))
    melhor = None
    for i in range(1, n + 1):
        yy, xx = np.nonzero(lab == i)
        if len(yy) < 3000 or yy.min() < y0 + 30: continue  # pescoço e rosto ficam no topo
        if melhor is None or len(yy) > len(melhor[0]): melhor = (yy, xx)
    yy, xx = melhor
    bainha = int(yy.min()); mx = float(xx[yy < bainha + 25].mean())
    ombro = int(np.nonzero(m[:, int(mx)])[0][0])
    return info | {'mx': round(mx, 1), 'my': round(ombro + .55 * (bainha - ombro), 1)}


DESTINO.mkdir(exist_ok=True)
dados = {}
for foto in sorted(ORIGEM.glob('*.png')):
    tipo, tam, vista = foto.stem.split('-', 2)
    if tipo not in E.TAMANHOS or tam not in E.TAMANHOS[tipo] or vista not in VISTAS: continue
    im = Image.open(foto).convert('RGB')
    a = np.asarray(im).astype(float)
    propria = next((p for p in (ORIGEM / f'mask-{foto.stem}.png', ORIGEM / 'Mascaras' / f'{foto.stem}-mascara.png') if p.is_file()),
                   ORIGEM / f'mask-{foto.stem}.png')
    mk = mascara_da_equipe(propria, im.size) if propria.is_file() else mascara_automatica(a)
    m = np.asarray(mk) > 127
    lum = a @ [.3, .6, .1]
    info = medidas(tipo, tam, vista, a, m) | {'branco': round(float(np.percentile(lum[m], 92)), 1),
                                              'mascara': 'equipe' if propria.is_file() else 'automática'}
    im.save(DESTINO / f'{foto.stem}.jpg', quality=90, optimize=True)
    mk.save(DESTINO / f'{foto.stem}-mascara.png', optimize=True)
    dados[foto.stem] = info
    print(foto.stem, info)
Path(__file__).with_name('mockups.json').write_text(json.dumps(dados, ensure_ascii=False, indent=0), encoding='utf-8')
