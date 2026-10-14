"""Geometria das molduras de TV, medida nas facas de corte reais (pasta "Impressões Moldura Clientes").

Tudo em centímetros, com origem no canto superior esquerdo da folha:
- janela: a medida da TV (ex.: 40" = 88 × 49 cm), cantos de 0,2 cm;
- bordas fixas de 5,5 cm (4,5 cm nas TVs até 75 cm de largura, como a de 32");
- embaixo, à esquerda, a aba onde vai a logo do cliente: 58,5 × 5,5 cm, ampliada junto com a moldura
  quando ela passa de 105,5 cm de largura (como na de 46");
- folha = moldura + 1,25 cm de margem em volta; o fundo sangra 0,5 cm além do corte."""
import math

# Tamanhos em uso: polegadas → largura × altura da janela (cm)
TAMANHOS = [(32, 70, 40), (39, 85.5, 48.5), (40, 88, 49), (42, 93, 53), (43, 94.5, 53), (46, 102, 57.5), (50, 109, 62)]
MARGEM = 1.25           # da folha até o corte
SANGRIA = .5            # fundo além do corte
RAIO_EXTERNO = 1.5
RAIO_JANELA = .2
LARGURA_REFERENCIA = 105.5   # até esta largura externa a aba tem o tamanho original
KAPPA = .5523


def estimar(polegadas):
    """Medida sugerida para uma TV fora da tabela: proporção média das TVs em uso (≈ 2,2 cm de largura por polegada)."""
    p = float(polegadas)
    if not 15 <= p <= 120: raise ValueError('Use de 15 a 120 polegadas.')
    for pol, w, h in TAMANHOS:
        if pol == p: return {'largura': w, 'altura': h, 'tabela': True}
    lw = sum(w / pol for pol, w, _ in TAMANHOS) / len(TAMANHOS)
    hw = sum(h / w for _, w, h in TAMANHOS) / len(TAMANHOS)
    meio = lambda v: round(v * 2) / 2
    largura = meio(p * lw)
    return {'largura': largura, 'altura': meio(largura * hw), 'tabela': False}


def validar(largura, altura):
    try: w, h = float(largura), float(altura)
    except (TypeError, ValueError): raise ValueError('Informe a largura e a altura da TV em cm.') from None
    if not (30 <= w <= 260 and 20 <= h <= 160 and math.isfinite(w) and math.isfinite(h)):
        raise ValueError('A TV precisa ter de 30 a 260 cm de largura e de 20 a 160 cm de altura.')
    if not .35 <= h / w <= 1: raise ValueError('Confira a medida: a altura da TV costuma ser pouco mais que a metade da largura.')
    return w, h


def n(v): return f'{v:.3f}'.rstrip('0').rstrip('.') if abs(v) >= .0005 else '0'
def pt(x, y): return f'{n(x)} {n(y)}'


def retangulo_arredondado(x0, y0, x1, y1, r):
    k = r * KAPPA
    return (f'M{pt(x0, y0 + r)} C{pt(x0, y0 + r - k)} {pt(x0 + r - k, y0)} {pt(x0 + r, y0)} L{pt(x1 - r, y0)} '
            f'C{pt(x1 - r + k, y0)} {pt(x1, y0 + r - k)} {pt(x1, y0 + r)} L{pt(x1, y1 - r)} '
            f'C{pt(x1, y1 - r + k)} {pt(x1 - r + k, y1)} {pt(x1 - r, y1)} L{pt(x0 + r, y1)} '
            f'C{pt(x0 + r - k, y1)} {pt(x0, y1 - r + k)} {pt(x0, y1 - r)} Z')


def geometria(largura, altura):
    w, h = validar(largura, altura)
    b = 4.5 if w <= 75 else 5.5
    ox0 = oy0 = MARGEM
    ow, oh = w + 2 * b, h + 2 * b
    ox1, yb = ox0 + ow, oy0 + oh
    k = max(1.0, ow / LARGURA_REFERENCIA)
    aba = 5.5 * k
    r, kr = RAIO_EXTERNO, RAIO_EXTERNO * KAPPA
    X = lambda v: ox0 + v * k          # pontos da aba, medidos na faca de 43" a partir do canto esquerdo
    corte = (f'M{pt(ox0, oy0 + r)} C{pt(ox0, oy0 + r - kr)} {pt(ox0 + r - kr, oy0)} {pt(ox0 + r, oy0)} '
             f'L{pt(ox1 - r, oy0)} C{pt(ox1 - r + kr, oy0)} {pt(ox1, oy0 + r - kr)} {pt(ox1, oy0 + r)} '
             f'L{pt(ox1, yb - r)} C{pt(ox1, yb - r + kr)} {pt(ox1 - r + kr, yb)} {pt(ox1 - r, yb)} '
             f'L{pt(X(58.5), yb)} C{pt(X(49.5), yb)} {pt(X(38.25), yb + aba)} {pt(X(24.75), yb + aba)} '
             f'C{pt(X(13.5), yb + aba)} {pt(X(4.5), yb + 3 * k)} {pt(X(1.5), yb + 1.5 * k)} '
             f'C{pt(ox0, yb + .75 * k)} {pt(ox0, yb - .75 * k)} {pt(ox0, yb - 1.5 * k)} L{pt(ox0, oy0 + r)} Z')
    jx0, jy0 = ox0 + b, oy0 + b
    jx1, jy1 = jx0 + w, jy0 + h
    yc = yb + aba
    folha = (ox1 + MARGEM, yc + MARGEM)
    return {
        'tv': {'largura': w, 'altura': h}, 'borda': b, 'escalaAba': round(k, 4),
        'folha': {'largura': round(folha[0], 3), 'altura': round(folha[1], 3)},
        'moldura': {'x0': ox0, 'y0': oy0, 'x1': round(ox1, 3), 'y1': round(yb, 3), 'yAba': round(yc, 3),
                    'largura': round(ow, 3), 'altura': round(yc - oy0, 3)},
        'janela': {'x0': jx0, 'y0': jy0, 'x1': round(jx1, 3), 'y1': round(jy1, 3), 'raio': RAIO_JANELA},
        'sangria': {'x0': ox0 - SANGRIA, 'y0': oy0 - SANGRIA, 'x1': round(ox1 + SANGRIA, 3), 'y1': round(yc + SANGRIA, 3)},
        'corte': corte,
        'janelaPath': retangulo_arredondado(jx0, jy0, jx1, jy1, RAIO_JANELA),
        # caixa de identificação (cliente, tamanho, quantidade, material): 10 × 3 cm, 1 cm para dentro da janela
        'etiqueta': {'x0': round(jx1 - 11, 3), 'y0': jy0 + 1, 'x1': round(jx1 - 1, 3), 'y1': jy0 + 4},
        # logo Indoor Channel: 10 cm, alinhada à direita da janela e centralizada na borda de cima
        'logoIC': {'x0': round(jx1 - 10, 3), 'y0': round(oy0 + b / 2 - .885, 3), 'largura': 10.0, 'altura': 1.77},
        # logo do cliente: centralizada na parte mais funda da aba, entre a janela e o fim da aba
        'logoCliente': {'cx': round(X(24.75), 3), 'cy': round((jy1 + yc) / 2, 3),
                        'largura': round(min(30 * k, X(46) - X(3.5)), 3), 'altura': round(yc - jy1 - 1.6, 3)},
    }


def nome_tamanho(polegadas, largura, altura):
    medida = lambda v: f'{v:g}'.replace('.', ',')
    pol = f'{polegadas:g} Polegadas ' if polegadas else ''
    return f'{pol}({medida(largura)} x {medida(altura)} cm)'
