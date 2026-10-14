"""Layouts de moldura: 4 por segmento, desenhados só com formas vetoriais que se adaptam a qualquer tamanho de TV.

Cada forma é {'d': caminho SVG absoluto em cm (M/L/C/Z), 'cor': papel da paleta, 'opacidade'?, 'regra'?}.
Os papéis são principal, secundaria, destaque, escura e clara; trocar uma cor da paleta recolore o layout inteiro.
A janela (área da TV) é coberta de branco depois, então os desenhos só aparecem nas bordas e na aba."""
import math
import random
from .molduras_geometria import n, pt, KAPPA

PAPEIS = ('principal', 'secundaria', 'destaque', 'escura', 'clara')
SEGMENTOS = [
    ('supermercados', 'Supermercados'), ('academias', 'Academias'), ('restaurantes', 'Restaurantes'),
    ('lanchonetes', 'Lanchonetes'), ('clinicas', 'Clínicas'), ('saloes', 'Salões de beleza'),
    ('padarias', 'Padarias'), ('confeitarias', 'Confeitarias'), ('conveniencias', 'Conveniências'), ('corporativo', 'Ambientes corporativos'),
]
# Paletas sugeridas quando o cliente não tem identidade visual
PALETAS = {
    'supermercados': {'principal': '#E8312F', 'secundaria': '#FFC20E', 'destaque': '#2E9E4F', 'escura': '#7A1513', 'clara': '#FFF4E0'},
    'academias': {'principal': '#FFD000', 'secundaria': '#3A3A3A', 'destaque': '#FF5A1F', 'escura': '#111111', 'clara': '#F2F2F2'},
    'restaurantes': {'principal': '#B5332E', 'secundaria': '#E9A23B', 'destaque': '#5B7F3A', 'escura': '#3B1F1A', 'clara': '#F7EEDC'},
    'lanchonetes': {'principal': '#F25C05', 'secundaria': '#FFC93C', 'destaque': '#D7263D', 'escura': '#3D1F0F', 'clara': '#FFF6E5'},
    'clinicas': {'principal': '#1E7FB8', 'secundaria': '#4BC0C8', 'destaque': '#7BC67E', 'escura': '#0D3B5C', 'clara': '#EEF7FB'},
    'saloes': {'principal': '#E06C9F', 'secundaria': '#F4B6C2', 'destaque': '#B8860B', 'escura': '#5A2340', 'clara': '#FDEFF3'},
    'padarias': {'principal': '#E8742A', 'secundaria': '#F2C14E', 'destaque': '#7A9A3A', 'escura': '#5A3214', 'clara': '#FBF1E1'},
    'confeitarias': {'principal': '#F48FB1', 'secundaria': '#8D5A3B', 'destaque': '#7FD1C7', 'escura': '#4E2A1E', 'clara': '#FFF3E6'},
    'conveniencias': {'principal': '#0057B8', 'secundaria': '#FFD100', 'destaque': '#E4002B', 'escura': '#002855', 'clara': '#EAF2FB'},
    'corporativo': {'principal': '#1F3A5F', 'secundaria': '#4F8FC0', 'destaque': '#F2A541', 'escura': '#0F1E33', 'clara': '#EEF2F6'},
}


# ---------- primitivas ----------
def forma(d, cor, opacidade=None, regra=None):
    f = {'d': d, 'cor': cor}
    if opacidade is not None and opacidade < 1: f['opacidade'] = round(opacidade, 3)
    if regra: f['regra'] = regra
    return f


def circulo_d(cx, cy, r, reverso=False):
    k = r * KAPPA
    if reverso:
        return (f'M{pt(cx + r, cy)} C{pt(cx + r, cy - k)} {pt(cx + k, cy - r)} {pt(cx, cy - r)} '
                f'C{pt(cx - k, cy - r)} {pt(cx - r, cy - k)} {pt(cx - r, cy)} C{pt(cx - r, cy + k)} {pt(cx - k, cy + r)} {pt(cx, cy + r)} '
                f'C{pt(cx + k, cy + r)} {pt(cx + r, cy + k)} {pt(cx + r, cy)} Z')
    return (f'M{pt(cx + r, cy)} C{pt(cx + r, cy + k)} {pt(cx + k, cy + r)} {pt(cx, cy + r)} '
            f'C{pt(cx - k, cy + r)} {pt(cx - r, cy + k)} {pt(cx - r, cy)} C{pt(cx - r, cy - k)} {pt(cx - k, cy - r)} {pt(cx, cy - r)} '
            f'C{pt(cx + k, cy - r)} {pt(cx + r, cy - k)} {pt(cx + r, cy)} Z')


def anel_d(cx, cy, r, espessura):
    return circulo_d(cx, cy, r) + ' ' + circulo_d(cx, cy, r - espessura, reverso=True)


def poligono_d(pontos):
    return 'M' + ' L'.join(pt(x, y) for x, y in pontos) + ' Z'


def girar(pontos, cx, cy, ang):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pontos]


def _curvas(p, fechado, tensao=1.0):
    """Segmentos C de uma curva suave pelos pontos (Catmull-Rom convertida em Bézier)."""
    m = len(p); segs = []
    for i in range(m if fechado else m - 1):
        if fechado: p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % m], p[(i + 2) % m]
        else: p0, p1, p2, p3 = p[max(i - 1, 0)], p[i], p[i + 1], p[min(i + 2, m - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * tensao, p1[1] + (p2[1] - p0[1]) / 6 * tensao)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * tensao, p2[1] - (p3[1] - p1[1]) / 6 * tensao)
        segs.append(f'C{pt(*c1)} {pt(*c2)} {pt(*p2)}')
    return segs


def suave_d(pontos, fechado=True, tensao=1.0):
    return f'M{pt(*pontos[0])} ' + ' '.join(_curvas(pontos, fechado, tensao)) + (' Z' if fechado else '')


def onda_d(pontos, fecho):
    """Área limitada por uma curva suave (pontos) e fechada por segmentos retos (fecho)."""
    return suave_d(pontos, fechado=False) + ' ' + ' '.join(f'L{pt(x, y)}' for x, y in fecho) + ' Z'


def bolha_d(cx, cy, r, semente, irregular=.22, pontos=7, achatado=1.0):
    rnd = random.Random(semente)
    pts = []
    for i in range(pontos):
        a = 2 * math.pi * i / pontos + rnd.uniform(-.25, .25)
        rr = r * (1 + rnd.uniform(-irregular, irregular))
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * achatado))
    return suave_d(pts)


def pilula_d(cx, cy, comprimento, espessura, ang):
    r = espessura / 2; L = comprimento / 2 - r; k = r * KAPPA
    base = [(-L, -r), (L, -r)]
    d_pts = lambda x, y: girar([(cx + x, cy + y)], cx, cy, ang)[0]
    a, b = d_pts(-L, -r), d_pts(L, -r)
    c1, c2, e = d_pts(L + k, -r), d_pts(L + r, -k), d_pts(L + r, 0)
    c3, c4, f2 = d_pts(L + r, k), d_pts(L + k, r), d_pts(L, r)
    g = d_pts(-L, r)
    c5, c6, h = d_pts(-L - k, r), d_pts(-L - r, k), d_pts(-L - r, 0)
    c7, c8 = d_pts(-L - r, -k), d_pts(-L - k, -r)
    return (f'M{pt(*a)} L{pt(*b)} C{pt(*c1)} {pt(*c2)} {pt(*e)} C{pt(*c3)} {pt(*c4)} {pt(*f2)} L{pt(*g)} '
            f'C{pt(*c5)} {pt(*c6)} {pt(*h)} C{pt(*c7)} {pt(*c8)} {pt(*a)} Z')


def arco_pontos(cx, cy, r, a0, a1, passos=None):
    passos = passos or max(6, int(abs(a1 - a0) / .12))
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / passos), cy + r * math.sin(a0 + (a1 - a0) * i / passos)) for i in range(passos + 1)]


def faixa_arco_d(cx, cy, r, espessura, a0, a1):
    """Arco grosso (setor de anel), como as linhas curvas das molduras."""
    fora = arco_pontos(cx, cy, r, a0, a1)
    dentro = arco_pontos(cx, cy, r - espessura, a1, a0)
    return (f'M{pt(*fora[0])} ' + ' '.join(_curvas(fora, False)) + f' L{pt(*dentro[0])} ' + ' '.join(_curvas(dentro, False)) + ' Z')


def folha_d(bx, by, comprimento, largura, ang):
    tip = (bx + comprimento, by)
    pts = [(bx, by)]
    c1, c2 = (bx + comprimento * .3, by - largura), (bx + comprimento * .75, by - largura * .8)
    c3, c4 = (bx + comprimento * .75, by + largura * .8), (bx + comprimento * .3, by + largura)
    g = lambda p: girar([p], bx, by, ang)[0]
    return (f'M{pt(*g((bx, by)))} C{pt(*g(c1))} {pt(*g(c2))} {pt(*g(tip))} C{pt(*g(c3))} {pt(*g(c4))} {pt(*g((bx, by)))} Z')


def mais_d(cx, cy, tam, espessura):
    a, e = tam / 2, espessura / 2
    return poligono_d([(cx - e, cy - a), (cx + e, cy - a), (cx + e, cy - e), (cx + a, cy - e), (cx + a, cy + e), (cx + e, cy + e),
                       (cx + e, cy + a), (cx - e, cy + a), (cx - e, cy + e), (cx - a, cy + e), (cx - a, cy - e), (cx - e, cy - e)])


def ret_d(x0, y0, x1, y1, r=0):
    if r <= 0: return poligono_d([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    from .molduras_geometria import retangulo_arredondado
    return retangulo_arredondado(x0, y0, x1, y1, min(r, (x1 - x0) / 2, (y1 - y0) / 2))


class Quadro:
    """Atalhos de posição para desenhar em volta da janela, independentes do tamanho da TV."""
    def __init__(self, g):
        s = g['sangria']; j = g['janela']; m = g['moldura']
        self.x0, self.y0, self.x1, self.y1 = s['x0'], s['y0'], s['x1'], s['y1']      # área com sangria
        self.mx0, self.my0, self.mx1, self.myb, self.mya = m['x0'], m['y0'], m['x1'], m['y1'], m['yAba']
        self.jx0, self.jy0, self.jx1, self.jy1 = j['x0'], j['y0'], j['x1'], j['y1']
        self.w, self.h = self.x1 - self.x0, self.y1 - self.y0
        self.b = g['borda']; self.k = g['escalaAba']
        # unidade de desenho: 1.0 na TV de 40"; cresce só um terço do que a TV cresce, porque a borda é fixa
        self.u = 1 + ((self.mx1 - self.mx0) / 99 - 1) * .35
        self.lx, self.ly = g['logoCliente']['cx'], g['logoCliente']['cy']

    def fundo(self, cor):
        return forma(ret_d(self.x0 - 1, self.y0 - 1, self.x1 + 1, self.y1 + 1), cor)

    def visivel(self, x, y, r):
        """Fora da janela (ao menos em parte) e dentro da folha."""
        dentro_janela = self.jx0 + r < x < self.jx1 - r and self.jy0 + r < y < self.jy1 - r
        return not dentro_janela and self.x0 - r < x < self.x1 + r and self.y0 - r < y < self.y1 + r

    def perto_logo(self, x, y, folga=0):
        return abs(x - self.lx) < 15 * self.k + folga and y > self.jy1 - 1

    def perto_ic(self, x, y):
        """Área da logo Indoor Channel (canto superior direito), mantida limpa nos padrões miúdos."""
        return self.jx1 - 11 < x < self.jx1 + 1 and y < self.jy0


# ---------- layouts ----------
def L(id_, nome, segmento, logo_ic, placa=None):
    def deco(fn):
        fn.meta = {'id': id_, 'nome': nome, 'segmento': segmento, 'logoIC': logo_ic, 'placa': placa}
        CATALOGO.append(fn); return fn
    return deco


CATALOGO = []

# Supermercados
@L('super-circulos', 'Círculos de oferta', 'supermercados', 'principal', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    # campo diagonal à direita (como as molduras do Hipermarket)
    out.append(forma(poligono_d([(q.x1 - 30 * u, q.y0 - 1), (q.x1 + 1, q.y0 - 1), (q.x1 + 1, q.y1 + 1), (q.x1 - 4 * u, q.y1 + 1), (q.x1 - 4 * u, q.y0 + 40 * u)]), 'principal'))
    out.append(forma(poligono_d([(q.x1 - 40 * u, q.y0 - 1), (q.x1 - 31 * u, q.y0 - 1), (q.x1 - 5 * u, q.y0 + 26 * u), (q.x1 - 5 * u, q.y0 + 35 * u)]), 'secundaria'))
    out.append(forma(poligono_d([(q.x1 + 1, q.y0 + 30 * u), (q.x1 + 1, q.y0 + 46 * u), (q.x1 - 22 * u, q.y1 + 1), (q.x1 - 40 * u, q.y1 + 1)]), 'destaque'))
    # alvos e anéis pela esquerda e no alto
    for cx, cy, r, e, cor, miolo in [(q.x0 + 3 * u, q.y0 + 3 * u, 9 * u, 3.2 * u, 'secundaria', None), (q.x0 + 22 * u, q.y0 + 1 * u, 6 * u, 2.4 * u, 'destaque', 'secundaria'),
                                     (q.x0 + 2.5 * u, q.jy0 + 15 * u, 5.5 * u, 2.2 * u, 'principal', 'destaque'), (q.x0 + 1 * u, q.jy0 + 30 * u, 7 * u, 2.6 * u, 'destaque', None),
                                     (q.x0 + 40 * u, q.y0 + 3 * u, 4 * u, 1.6 * u, 'principal', None), (q.x0 + 62 * u, q.y1 + 2 * u, 9 * u, 3 * u, 'principal', 'secundaria'),
                                     (q.x0 + 77 * u, q.y1 - 2 * u, 3.5 * u, 1.4 * u, 'secundaria', None)]:
        out.append(forma(anel_d(cx, cy, r, e), cor, regra='evenodd'))
        if miolo: out.append(forma(circulo_d(cx, cy, (r - e) * .55), miolo))
    return out


@L('super-faixas', 'Faixas diagonais', 'supermercados', 'principal')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    inc = 1.0   # inclinação das faixas: 45°
    for dx, larg, cor in [(0, 12, 'secundaria'), (15, 5, 'destaque'), (23, 2, 'clara')]:
        x = q.x1 - (46 - dx) * u
        out.append(forma(poligono_d([(x, q.y0 - 1), (x + larg * u, q.y0 - 1), (x + larg * u + 70 * u * inc, q.y0 + 70 * u), (x + 70 * u * inc, q.y0 + 70 * u)]), cor))
    for dx, larg, cor in [(0, 8, 'destaque'), (11, 3, 'secundaria')]:
        x = q.x0 + (6 + dx) * u
        out.append(forma(poligono_d([(x, q.y0 - 1), (x + larg * u, q.y0 - 1), (x + larg * u - 30 * u, q.y0 + 30 * u), (x - 30 * u, q.y0 + 30 * u)]), cor))
    return out


@L('super-folhas', 'Feira fresca', 'supermercados', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 3 * u), (q.x0 + 25 * u, q.myb + 1.5 * u), (q.x0 + 60 * u, q.myb - 2 * u), (q.x1 + 1, q.myb + 1 * u)],
                            [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'principal'))
    out.append(forma(bolha_d(q.x1 + 1 * u, q.y0 - 1 * u, 13 * u, 4, achatado=.9), 'principal'))
    for cx, cy, r, cor in [(q.x1 - 15 * u, q.y0 + 2.5 * u, 4.5 * u, 'secundaria'), (q.x0 + 4 * u, q.y0 + 3 * u, 6 * u, 'secundaria'), (q.x1 - 2 * u, q.jy0 + 26 * u, 4 * u, 'secundaria'),
                           (q.x1 - 26 * u, q.y0 + 1 * u, 2.6 * u, 'principal')]:
        out.append(forma(circulo_d(cx, cy, r), cor))
    for bx, by, comp, larg, ang in [(q.x1 - 13 * u, q.y0 + 6 * u, 14 * u, 4 * u, -2.7), (q.x1 - 12 * u, q.y0 + 7 * u, 12 * u, 3.4 * u, -1.9),
                                    (q.x0 + 9 * u, q.y0 + 5 * u, 14 * u, 4 * u, -.25), (q.x0 + 8 * u, q.y0 + 6 * u, 12 * u, 3.4 * u, .6),
                                    (q.x0 + 1 * u, q.jy0 + 22 * u, 10 * u, 3 * u, .15), (q.x1 - 1 * u, q.jy1 - 10 * u, 10 * u, 3 * u, 3.0)]:
        out.append(forma(folha_d(bx, by, comp, larg, ang), 'destaque'))
    return out


@L('super-ondas', 'Ondas de oferta', 'supermercados', 'principal')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    out.append(forma(onda_d([(q.x1 - 55 * u, q.y0 - 1), (q.x1 - 35 * u, q.y0 + 4 * u), (q.x1 - 6 * u, q.y0 + 8 * u), (q.x1 + 1, q.y0 + 26 * u)], [(q.x1 + 1, q.y0 - 1)]), 'escura'))
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 1 * u), (q.x0 + 32 * u, q.myb - 4 * u), (q.x0 + 66 * u, q.myb + 1 * u), (q.x1 + 1, q.myb - 5 * u)],
                            [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'secundaria'))
    out.append(forma(onda_d([(q.x0 + 48 * u, q.y1 + 1), (q.x0 + 72 * u, q.myb + 2 * u), (q.x1 + 1, q.myb - 1 * u)], [(q.x1 + 1, q.y1 + 1)]), 'destaque'))
    out.append(forma(bolha_d(q.x0 - 3 * u, q.jy0 + 16 * u, 9 * u, 17, achatado=1.4), 'destaque'))
    return out


# Academias
@L('academia-cortes', 'Cortes de energia', 'academias', 'escura')
def _(q):
    u = q.u; out = [q.fundo('escura')]
    for x, larg, cor in [(q.x1 - 24 * u, 13, 'principal'), (q.x1 - 8 * u, 3.5, 'destaque'), (q.x1 - 2.5 * u, 1.2, 'clara')]:
        out.append(forma(poligono_d([(x, q.y0 - 1), (x + larg * u, q.y0 - 1), (x + larg * u - 26 * u, q.y1 + 1), (x - 26 * u, q.y1 + 1)]), cor))
    for x, larg, cor in [(q.x0 + 14 * u, 7, 'principal'), (q.x0 + 23 * u, 2.4, 'destaque')]:
        out.append(forma(poligono_d([(x, q.y0 - 1), (x + larg * u, q.y0 - 1), (x + larg * u - 22 * u, q.y0 + 22 * u), (x - 22 * u, q.y0 + 22 * u)]), cor))
    return out


@L('academia-chevron', 'Setas de força', 'academias', 'escura')
def _(q):
    u = q.u; out = [q.fundo('escura')]
    def seta(x, y, a, cor, op=1):
        return forma(poligono_d([(x, y), (x + a, y), (x + 2 * a, y + a), (x + a, y + 2 * a), (x, y + 2 * a), (x + a, y + a)]), cor, op)
    for i in range(6):
        out.append(seta(q.x0 + .8 * u, q.jy0 - 2 * u + i * 8 * u, 2.6 * u, 'principal' if i % 2 == 0 else 'destaque', 1 - i * .1))
    for i in range(7):
        out.append(seta(q.x1 - 22 * u - i * 6.5 * u, q.y0 + 1.6 * u, 1.9 * u, 'principal', 1 - i * .13))
    out.append(forma(poligono_d([(q.x1 + 1, q.myb - 30 * u), (q.x1 + 1, q.y1 + 1), (q.x1 - 46 * u, q.y1 + 1), (q.x1 - 46 * u + 12 * u, q.myb - 1 * u), (q.x1 - 6 * u, q.myb - 1 * u)]), 'principal'))
    out.append(forma(poligono_d([(q.x1 - 49 * u, q.y1 + 1), (q.x1 - 46.5 * u, q.y1 + 1), (q.x1 - 34.5 * u, q.myb - 1 * u), (q.x1 - 37 * u, q.myb - 1 * u)]), 'destaque'))
    return out


@L('academia-reticula', 'Retícula', 'academias', 'escura')
def _(q):
    u = q.u; out = [q.fundo('escura')]
    out.append(forma(poligono_d([(q.x0 - 1, q.y0 - 1), (q.x0 + 34 * u, q.y0 - 1), (q.x0 - 1, q.y0 + 34 * u)]), 'principal'))
    passo = 2.4 * u; pontos = []
    for i in range(30):
        for j in range(20):
            x = q.x1 - (i * passo + passo / 2); y = q.y1 - (j * passo + passo / 2)
            r = passo * .5 * (1 - math.hypot(i, j * 1.3) / 24)
            if r > .15 * u and q.visivel(x, y, r): pontos.append(circulo_d(x, y, r))
    out.append(forma(' '.join(pontos), 'destaque'))
    out.append(forma(poligono_d([(q.x0 - 1, q.y0 + 22 * u), (q.x0 + 22 * u, q.y0 - 1), (q.x0 + 25 * u, q.y0 - 1), (q.x0 - 1, q.y0 + 25 * u)]), 'clara'))
    return out


@L('academia-pista', 'Pista de corrida', 'academias', 'escura')
def _(q):
    u = q.u; out = [q.fundo('escura')]
    def faixa(y, comp, alt, cor, direita=True):
        if direita: x1 = q.x1 + 1; x0 = x1 - comp * u; return forma(poligono_d([(x0 + alt, y), (x1, y), (x1, y + alt), (x0, y + alt)]), cor)
        x0 = q.x0 - 1; x1 = x0 + comp * u; return forma(poligono_d([(x0, y), (x1, y), (x1 - alt, y + alt), (x0, y + alt)]), cor)
    for y, comp, cor in [(q.y0 + 1.2 * u, 58, 'principal'), (q.y0 + 3.6 * u, 40, 'destaque')]:
        out.append(faixa(y, comp, 1.8 * u, cor))
    for y, comp, cor in [(q.myb + .6 * u, 70, 'principal'), (q.myb + 3 * u, 54, 'destaque'), (q.myb + 5.4 * u, 38, 'clara')]:
        out.append(faixa(y, comp, 1.8 * u, cor))
    for i, comp in enumerate([16, 11, 7]):
        out.append(faixa(q.jy0 + (4 + i * 3.2) * u, comp, 1.8 * u, 'principal', direita=False))
    return out


# Restaurantes
@L('restaurante-xadrez', 'Toalha xadrez', 'restaurantes', 'principal', 'placa')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    topo = q.jy1 + .9 * u
    out.append(forma(ret_d(q.x0 - 1, topo, q.x1 + 1, q.y1 + 1), 'clara'))
    passo = 2.6 * u; xs, ys = [], []
    x = q.x0
    while x < q.x1: xs.append(ret_d(x, topo, x + passo, q.y1 + 1)); x += 2 * passo
    y = topo
    while y < q.y1: ys.append(ret_d(q.x0 - 1, y, q.x1 + 1, min(y + passo, q.y1 + 1))); y += 2 * passo
    out.append(forma(' '.join(xs), 'principal', opacidade=.45))
    out.append(forma(' '.join(ys), 'principal', opacidade=.45))
    out.append(forma(ret_d(q.x0 - 1, topo - .7 * u, q.x1 + 1, topo), 'escura'))
    out.append(forma(circulo_d(q.x0 + 2 * u, q.y0 + 2 * u, 9 * u), 'escura'))
    out.append(forma(anel_d(q.x0 + 2 * u, q.y0 + 2 * u, 6.5 * u, .8 * u), 'secundaria', regra='evenodd'))
    out.append(forma(faixa_arco_d(q.x1 - 2 * u, q.y0 + 2 * u, 9 * u, 1 * u, math.pi * .5, math.pi * 1.0), 'secundaria'))
    return out


@L('restaurante-organico', 'Formas orgânicas', 'restaurantes', 'principal')
def _(q):
    """Na linha da moldura do Mini Momento: campos orgânicos grandes e dois arcos finos."""
    u = q.u; out = [q.fundo('principal')]
    out.append(forma(onda_d([(q.x1 - 50 * u, q.y0 - 1), (q.x1 - 35 * u, q.y0 + 4 * u), (q.x1 - 22 * u, q.y0 + 8 * u), (q.x1 - 8 * u, q.y0 + 22 * u), (q.x1 + 1, q.y0 + 30 * u)],
                            [(q.x1 + 1, q.y0 - 1)]), 'escura'))
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 8 * u), (q.x0 + 8 * u, q.myb - 4 * u), (q.x0 + 14 * u, q.myb + 1 * u), (q.x0 + 50 * u, q.myb - 1 * u), (q.x0 + 64 * u, q.myb + 3 * u), (q.x0 + 75 * u, q.y1 + 1)],
                            [(q.x0 - 1, q.y1 + 1)]), 'escura'))
    out.append(forma(onda_d([(q.x0 - 1, q.jy0 + 21 * u), (q.x0 + 4 * u, q.jy0 + 25 * u), (q.x0 + 3 * u, q.jy0 + 36 * u), (q.x0 - 1, q.jy0 + 40 * u)], []), 'escura'))
    for i in range(2):
        out.append(forma(faixa_arco_d(q.x0 + 20 * u, q.y0 - 18 * u, (40 - i * 3.5) * u, .9 * u, math.pi * .55, math.pi * .9), 'escura'))
    return out


@L('restaurante-ervas', 'Ervas e temperos', 'restaurantes', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 1 * u), (q.x0 + 35 * u, q.myb + 2 * u), (q.x0 + 70 * u, q.myb - 1 * u), (q.x1 + 1, q.myb + 2 * u)],
                            [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'principal'))
    rnd = random.Random(11)
    for cx, cy, base, qtd, tam in [(q.x0 + 1 * u, q.y0 + 1 * u, .75, 7, 13), (q.x1 - 1 * u, q.y0 + 2 * u, 2.4, 6, 12), (q.x1 + 1 * u, q.jy1 - 6 * u, 3.4, 5, 10)]:
        for i in range(qtd):
            ang = base + (i - (qtd - 1) / 2) * .3 + rnd.uniform(-.06, .06)
            out.append(forma(folha_d(cx, cy, (tam - abs(i - (qtd - 1) / 2) * 1.4) * u, 2.4 * u, ang), 'destaque' if i % 2 else 'secundaria'))
    for cx, cy, r in [(q.x0 + 20 * u, q.y0 + 2.5 * u, 2.6 * u), (q.x1 - 22 * u, q.y0 + 3 * u, 2 * u), (q.x0 + 2.5 * u, q.jy0 + 26 * u, 2.2 * u)]:
        out.append(forma(circulo_d(cx, cy, r), 'principal'))
    return out


@L('restaurante-classico', 'Clássico elegante', 'restaurantes', 'escura')
def _(q):
    u = q.u; out = [q.fundo('escura')]
    d = 1.8 * u
    out.append(forma(ret_d(q.mx0 + d, q.my0 + d, q.mx1 - d, q.myb - d, 1 * u) + ' ' +
                     ret_d(q.mx0 + d + .35 * u, q.my0 + d + .35 * u, q.mx1 - d - .35 * u, q.myb - d - .35 * u, .7 * u), 'secundaria', regra='evenodd'))
    for cx, cy in [(q.mx0 + d, q.my0 + d), (q.mx1 - d, q.my0 + d), (q.mx1 - d, q.myb - d), (q.mx0 + d, q.myb - d)]:
        out.append(forma(poligono_d([(cx, cy - 1.6 * u), (cx + 1.6 * u, cy), (cx, cy + 1.6 * u), (cx - 1.6 * u, cy)]), 'secundaria'))
    out.append(forma(onda_d([(q.x0 + 50 * u, q.y1 + 1), (q.x0 + 70 * u, q.myb + 1 * u), (q.x1 + 1, q.myb - 6 * u)], [(q.x1 + 1, q.y1 + 1)]), 'principal'))
    return out


# Lanchonetes
@L('lanche-pop', 'Pop', 'lanchonetes', 'principal', 'placa')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    for cx, cy, r, cor in [(q.x1 + 2 * u, q.y0 - 3 * u, 22 * u, 'secundaria'), (q.x1 - 22 * u, q.y0 + 1 * u, 6 * u, 'destaque'),
                           (q.x0 + 74 * u, q.y1 + 9 * u, 18 * u, 'secundaria'), (q.x0 - 4 * u, q.jy0 + 16 * u, 10 * u, 'destaque'),
                           (q.x0 + 30 * u, q.y0 - 1 * u, 5 * u, 'secundaria')]:
        out.append(forma(circulo_d(cx, cy, r), cor))
    rnd = random.Random(4); pts = {'clara': [], 'escura': []}
    for i in range(70):
        x = rnd.uniform(q.x0, q.x1); y = rnd.uniform(q.y0, q.y1); r = rnd.uniform(.5, 1.1) * u
        if q.visivel(x, y, r) and not q.perto_logo(x, y, 4 * u) and not q.perto_ic(x, y): pts[rnd.choice(['clara', 'escura'])].append(circulo_d(x, y, r))
    for cor, ds in pts.items(): out.append(forma(' '.join(ds), cor))
    return out


@L('lanche-zigue', 'Zigue-zague', 'lanchonetes', 'principal', 'placa')
def _(q):
    u = q.u; out = [q.fundo('secundaria')]
    def zig(y, alt, passo, cor, cima=True):
        pts = []; x = q.x0 - 1; i = 0
        while x <= q.x1 + passo:
            pts.append((x, y + (alt if i % 2 else 0))); x += passo; i += 1
        borda = q.y0 - 1 if cima else q.y1 + 1
        return forma(poligono_d([(q.x0 - 1, borda)] + pts + [(pts[-1][0], borda)]), cor)
    out.append(zig(q.y0 + 3.4 * u, 2.2 * u, 2.6 * u, 'principal'))
    out.append(zig(q.y0 + 1.2 * u, 2.2 * u, 2.6 * u, 'destaque'))
    out.append(zig(q.myb - .5 * u, 2.2 * u, 2.6 * u, 'principal', cima=False))
    out.append(zig(q.myb + 2.6 * u, 2.2 * u, 2.6 * u, 'destaque', cima=False))
    return out


@L('lanche-respingos', 'Respingos', 'lanchonetes', 'clara')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    for cx, cy, r, seed, cor in [(q.x1 - 4 * u, q.y0 - 2 * u, 22 * u, 21, 'principal'), (q.x0 - 4 * u, q.y1 + 4 * u, 30 * u, 5, 'principal'),
                                 (q.x1 + 2 * u, q.y1 + 2 * u, 15 * u, 9, 'destaque'), (q.x0 + 1 * u, q.y0 + 1 * u, 10 * u, 13, 'secundaria'),
                                 (q.x0 + 38 * u, q.y0 - 2 * u, 6 * u, 3, 'secundaria')]:
        out.append(forma(bolha_d(cx, cy, r, seed, irregular=.33, pontos=12), cor))
    rnd = random.Random(8); gotas = []
    for cx, cy in [(q.x1 - 28 * u, q.y0 + 3 * u), (q.x0 + 32 * u, q.y1 - 2 * u), (q.x1 - 18 * u, q.y1 - 5 * u), (q.x0 + 13 * u, q.y0 + 4 * u)]:
        for i in range(5):
            gotas.append(circulo_d(cx + rnd.uniform(-4, 4) * u, cy + rnd.uniform(-2, 2) * u, rnd.uniform(.5, 1.3) * u))
    out.append(forma(' '.join(gotas), 'principal'))
    return out


@L('lanche-retro', 'Listras retrô', 'lanchonetes', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    cores = ['principal', 'secundaria', 'destaque']
    for i, cor in enumerate(cores):
        y = q.y0 + (.6 + i * 1.9) * u
        out.append(forma(ret_d(q.x0 - 1, y, q.x1 + 1, y + 1.4 * u), cor))
    for i, cor in enumerate(cores):
        y = q.myb + (.6 + i * 2.1) * u
        out.append(forma(ret_d(q.x0 - 1, y, q.x1 + 1, y + 1.6 * u), cor))
    for cx, cy, r in [(q.x1 - 9 * u, q.myb + 1.5 * u, 8 * u), (q.x0 + 3 * u, q.jy0 + 20 * u, 6 * u)]:
        out.append(forma(circulo_d(cx, cy, r), 'secundaria'))
        out.append(forma(anel_d(cx, cy, r * .72, r * .14), 'clara', regra='evenodd'))
    return out


# Clínicas
@L('clinica-cruz', 'Cuidado', 'clinicas', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 2 * u), (q.x0 + 36 * u, q.myb + 2 * u), (q.x0 + 72 * u, q.myb - 2 * u), (q.x1 + 1, q.myb + 1 * u)],
                            [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'principal'))
    out.append(forma(onda_d([(q.x0 - 1, q.y0 + 26 * u), (q.x0 + 4 * u, q.y0 + 10 * u), (q.x0 + 16 * u, q.y0 + 3 * u), (q.x0 + 36 * u, q.y0 - 1)], [(q.x0 - 1, q.y0 - 1)]), 'secundaria'))
    cruzes = []
    for i in range(9):
        for j in range(9):
            x = q.x1 - 2.6 * u - i * 4.2 * u; y = q.y0 + 2.6 * u + j * 4.2 * u
            if i + j < 8 and q.visivel(x, y, -1.4 * u) and not q.perto_ic(x, y): cruzes.append(mais_d(x, y, 2.6 * u, .8 * u))
    out.append(forma(' '.join(cruzes), 'secundaria'))
    out.append(forma(mais_d(q.x1 - 30 * u, q.y0 + 3.2 * u, 3 * u, .9 * u), 'destaque'))
    return out


@L('clinica-ondas', 'Ondas calmas', 'clinicas', 'principal')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    for i, (cor, op) in enumerate([('secundaria', .65), ('clara', 1), ('destaque', 1)]):
        dy = i * 2.4 * u - 2 * u
        out.append(forma(onda_d([(q.x0 - 1, q.myb + dy), (q.x0 + 30 * u, q.myb + 3 * u + dy), (q.x0 + 65 * u, q.myb - 1.5 * u + dy), (q.x1 + 1, q.myb + 2 * u + dy)],
                                [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), cor, opacidade=op))
    out.append(forma(onda_d([(q.x1 - 60 * u, q.y0 - 1), (q.x1 - 40 * u, q.y0 + 4.5 * u), (q.x1 - 15 * u, q.y0 + 3 * u), (q.x1 + 1, q.y0 + 9 * u)], [(q.x1 + 1, q.y0 - 1)]), 'secundaria', opacidade=.65))
    return out


@L('clinica-geometrico', 'Geométrico limpo', 'clinicas', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(ret_d(q.x0 - 1, q.y0 - 1, q.x0 + 3 * u, q.y1 + 1), 'principal'))
    out.append(forma(ret_d(q.x0 + 3.6 * u, q.y0 - 1, q.x0 + 4.3 * u, q.y1 + 1), 'secundaria'))
    for i in range(5):
        r = (4 + i * 3) * u
        out.append(forma(faixa_arco_d(q.x1 + 1 * u, q.y0 - 1 * u, r, .7 * u, math.pi * .5, math.pi), 'principal' if i % 2 else 'secundaria'))
    for i, cor in enumerate(['secundaria', 'principal', 'destaque']):
        x = q.x1 - (10 + i * 7) * u
        out.append(forma(ret_d(x, q.myb + (1 + i * .9) * u, x + 5.5 * u, q.myb + (5.5 + i * .9) * u, 1.2 * u), cor))
    return out


@L('clinica-bolhas', 'Bolhas leves', 'clinicas', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    for cx, cy, r, cor, op in [(q.x1 - 2 * u, q.y0 - 2 * u, 17 * u, 'principal', .9), (q.x1 - 22 * u, q.y0 + 3 * u, 7 * u, 'secundaria', .75),
                               (q.x0 - 4 * u, q.y1 + 2 * u, 20 * u, 'principal', .9), (q.x0 + 16 * u, q.y1 + 4 * u, 10 * u, 'secundaria', .7),
                               (q.x1 + 3 * u, q.y1 + 3 * u, 13 * u, 'destaque', .8), (q.x0 + 1 * u, q.y0 + 4 * u, 6 * u, 'secundaria', .6),
                               (q.x1 - .5 * u, q.jy0 + 27 * u, 4 * u, 'secundaria', .7)]:
        out.append(forma(circulo_d(cx, cy, r), cor, opacidade=op))
    return out


# Salões de beleza
@L('salao-organico', 'Orgânico delicado', 'saloes', 'clara', 'bolha')
def _(q):
    """Na linha da moldura da Cleane: manchas suaves, arcos finos e pontilhado."""
    u = q.u; out = [q.fundo('clara')]
    for cx, cy, r, seed, cor, op in [(q.x0 - 4 * u, q.y0 + 4 * u, 16 * u, 2, 'secundaria', .85), (q.x1 + 2 * u, q.jy0 + 30 * u, 13 * u, 6, 'secundaria', .75),
                                     (q.x1 + 2 * u, q.y1 + 2 * u, 14 * u, 9, 'principal', .5), (q.x0 + 1 * u, q.jy1 - 2 * u, 10 * u, 4, 'secundaria', .6),
                                     (q.x1 - 18 * u, q.y0 - 3 * u, 8 * u, 12, 'secundaria', .55)]:
        out.append(forma(bolha_d(cx, cy, r, seed, irregular=.25), cor, opacidade=op))
    for i in range(3):
        out.append(forma(faixa_arco_d(q.x0 + 4 * u, q.y0 + 4 * u, (8 + i * 2) * u, .3 * u, -.3, math.pi * .8), 'principal'))
    pontos = []; passo = 1.6 * u
    for i in range(7):
        for j in range(6):
            x = q.x1 - 2 * u - i * passo; y = q.y1 - 1.5 * u - j * passo
            if q.visivel(x, y, .4 * u): pontos.append(circulo_d(x, y, .42 * u))
    out.append(forma(' '.join(pontos), 'principal', opacidade=.85))
    out.append(forma(faixa_arco_d(q.x1 - 34 * u, q.y1 + 24 * u, 32 * u, .3 * u, -math.pi * .95, -math.pi * .55), 'principal'))
    return out


@L('salao-arcos', 'Arcos', 'saloes', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    def arco(x, base, larg, alt, cor, op=1):
        r = larg / 2; k = r * KAPPA
        d = (f'M{pt(x, base)} L{pt(x, base - alt + r)} C{pt(x, base - alt + r - k)} {pt(x + r - k, base - alt)} {pt(x + r, base - alt)} '
             f'C{pt(x + r + k, base - alt)} {pt(x + larg, base - alt + r - k)} {pt(x + larg, base - alt + r)} L{pt(x + larg, base)} Z')
        return forma(d, cor, op)
    out.append(arco(q.x1 - 18 * u, q.y1 + 1, 17 * u, 40 * u, 'secundaria', .85))
    out.append(arco(q.x1 - 28 * u, q.y1 + 1, 11 * u, 22 * u, 'principal'))
    out.append(arco(q.x0 - 6 * u, q.jy0 + 34 * u, 12 * u, 50 * u, 'secundaria', .75))
    out.append(forma(circulo_d(q.x1 - 6 * u, q.y0 + 3 * u, 5 * u), 'destaque'))
    out.append(forma(circulo_d(q.x0 + 26 * u, q.y0 + 2.5 * u, 1.6 * u), 'principal'))
    return out


@L('salao-pontilhado', 'Pontilhado', 'saloes', 'principal', 'bolha')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    out.append(forma(bolha_d(q.x1 - 2 * u, q.y0 - 2 * u, 22 * u, 31, achatado=.75), 'secundaria', opacidade=.65))
    out.append(forma(bolha_d(q.x0 + 70 * u, q.y1 + 6 * u, 16 * u, 33, achatado=.6), 'secundaria', opacidade=.5))
    rnd = random.Random(2); pil = []
    for i in range(18):
        x = q.x1 - rnd.uniform(2, 34) * u; y = q.y1 - rnd.uniform(1, 10) * u
        if q.visivel(x, y, 1.2 * u): pil.append(pilula_d(x, y, 2.8 * u, .9 * u, -1.1))
    out.append(forma(' '.join(pil), 'clara', opacidade=.85))
    pts = []; passo = 1.7 * u
    for i in range(8):
        for j in range(8):
            x = q.x0 + 1.5 * u + i * passo; y = q.y0 + 1.5 * u + j * passo
            if q.visivel(x, y, .4 * u): pts.append(circulo_d(x, y, .4 * u))
    out.append(forma(' '.join(pts), 'clara', opacidade=.9))
    return out


@L('salao-folhagem', 'Folhagem fina', 'saloes', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(bolha_d(q.x1 + 3 * u, q.y1 + 2 * u, 16 * u, 41), 'secundaria', opacidade=.55))
    out.append(forma(bolha_d(q.x0 - 3 * u, q.y0 - 2 * u, 14 * u, 43), 'secundaria', opacidade=.55))
    rnd = random.Random(19)
    # leques de folhas correndo ao longo das bordas (não para dentro da tela)
    for cx, cy, base, qtd in [(q.x0 + 1 * u, q.y0 + 3 * u, .1, 8), (q.x0 + 2 * u, q.y0 + 2 * u, 1.45, 6), (q.x1 - 2 * u, q.jy1 + 2 * u, 4.55, 8), (q.x1 - 3 * u, q.y0 + 3 * u, 3.05, 6)]:
        for i in range(qtd):
            ang = base + (i - (qtd - 1) / 2) * .13 + rnd.uniform(-.03, .03)
            out.append(forma(folha_d(cx, cy, (13 - abs(i - (qtd - 1) / 2) * 1.6) * u, 1.6 * u, ang), 'principal' if i % 3 else 'destaque', opacidade=.92))
    return out


# Padarias
def espiga_d(bx, by, comp, ang):
    """Espiga de trigo: haste fina e grãos em pares ao longo dela, apontando para a ponta."""
    partes = [pilula_d(*girar([(bx + comp * .5, by)], bx, by, ang)[0], comp, comp * .045, ang)]
    for i in range(6):
        t = .38 + i * .1
        cx, cy = girar([(bx + comp * t, by)], bx, by, ang)[0]
        for lado in (-1, 1):
            gx, gy = girar([(bx + comp * t + comp * .03, by + lado * comp * .055)], bx, by, ang)[0]
            partes.append(pilula_d(gx, gy, comp * .13, comp * .065, ang + lado * .55))
    tx, ty = girar([(bx + comp * 1.0, by)], bx, by, ang)[0]
    partes.append(pilula_d(tx, ty, comp * .12, comp * .06, ang))
    return ' '.join(partes)


@L('padaria-toldo', 'Toldo listrado', 'padarias', 'clara', 'placa')
def _(q):
    """Toldo de padaria: listras verticais no alto com a borda recortada em ondas."""
    u = q.u; out = [q.fundo('clara')]
    base = q.jy0 - 2.2 * u; larg = 3.6 * u; r = larg / 2
    listras = []; x = q.x0 - 1; i = 0
    while x < q.x1 + 1:
        if i % 2 == 0:
            listras.append(f'M{pt(x, q.y0 - 1)} L{pt(x + larg, q.y0 - 1)} L{pt(x + larg, base)} '
                           f'C{pt(x + larg, base + r * 1.33)} {pt(x, base + r * 1.33)} {pt(x, base)} Z')
        x += larg; i += 1
    out.append(forma(ret_d(q.x0 - 1, q.y0 - 1, q.x1 + 1, base), 'secundaria'))
    out.append(forma(' '.join(listras), 'principal'))
    out.append(forma(onda_d([(q.x0 - 1, q.myb), (q.x0 + 40 * u, q.myb + 2 * u), (q.x1 + 1, q.myb - 1 * u)], [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'principal'))
    for ang, bx in [(-2.0, q.x1 - 2 * u), (-2.35, q.x1 - 5 * u), (-2.7, q.x1 - 8 * u)]:
        out.append(forma(espiga_d(bx, q.y1 - .5 * u, 17 * u, ang), 'destaque'))
    return out


@L('padaria-trigo', 'Espigas de trigo', 'padarias', 'principal', 'placa')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    out.append(forma(onda_d([(q.x0 - 1, q.myb + 1 * u), (q.x0 + 30 * u, q.myb - 1.5 * u), (q.x0 + 70 * u, q.myb + 2 * u), (q.x1 + 1, q.myb - 1 * u)],
                            [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'escura'))
    espigas = []
    # feixes correndo ao longo das bordas: no alto à esquerda, descendo a lateral direita e subindo do canto de baixo
    for bx, by, ang in [(q.x0 - 1 * u, q.y0 + 4.5 * u, -.12), (q.x0 - 1 * u, q.y0 + 3.4 * u, -.32), (q.x0 - 1 * u, q.y0 + 5.6 * u, .1),
                        (q.x1 - 3 * u, q.y0 - 1 * u, math.pi / 2 + .06), (q.x1 - 2 * u, q.y0 - 1 * u, math.pi / 2 - .12),
                        (q.x1 - 2.5 * u, q.y1 + 1 * u, -math.pi / 2 - .1), (q.x1 - 1.5 * u, q.y1 + 1 * u, -math.pi / 2 + .12)]:
        espigas.append(espiga_d(bx, by, 22 * u, ang))
    out.append(forma(' '.join(espigas), 'secundaria'))
    return out


@L('padaria-organica', 'Forno a lenha', 'padarias', 'principal')
def _(q):
    """Na linha da moldura do Mini Momento: campos orgânicos grandes, arcos finos e a aba escura."""
    u = q.u; out = [q.fundo('principal')]
    out.append(forma(onda_d([(q.x1 - 46 * u, q.y0 - 1), (q.x1 - 30 * u, q.y0 + 5 * u), (q.x1 - 12 * u, q.y0 + 10 * u), (q.x1 + 1, q.y0 + 28 * u)],
                            [(q.x1 + 1, q.y0 - 1)]), 'escura'))
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 6 * u), (q.x0 + 12 * u, q.myb + 2 * u), (q.x0 + 48 * u, q.myb - 1 * u), (q.x0 + 70 * u, q.y1 + 1)],
                            [(q.x0 - 1, q.y1 + 1)]), 'escura'))
    out.append(forma(bolha_d(q.x0 - 2 * u, q.jy0 + 26 * u, 8 * u, 27, achatado=1.4), 'escura'))
    for i in range(2):
        out.append(forma(faixa_arco_d(q.x0 + 22 * u, q.y0 - 20 * u, (38 - i * 3.5) * u, .9 * u, math.pi * .55, math.pi * .9), 'escura'))
    out.append(forma(circulo_d(q.x1 - 6 * u, q.myb + 2 * u, 3.5 * u), 'destaque'))
    return out


@L('padaria-migalhas', 'Grãos e migalhas', 'padarias', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 2 * u), (q.x0 + 35 * u, q.myb + 2 * u), (q.x0 + 70 * u, q.myb - 1.5 * u), (q.x1 + 1, q.myb + 1.5 * u)],
                            [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'principal'))
    out.append(forma(bolha_d(q.x1 + 2 * u, q.y0 - 2 * u, 14 * u, 51, achatado=.8), 'secundaria'))
    rnd = random.Random(31); graos = {'principal': [], 'destaque': []}
    for i in range(140):
        x = rnd.uniform(q.x0, q.x1); y = rnd.uniform(q.y0, q.myb)
        if q.visivel(x, y, 1.4 * u) and not q.perto_ic(x, y):
            graos['principal' if i % 3 else 'destaque'].append(pilula_d(x, y, rnd.uniform(1.8, 2.6) * u, rnd.uniform(.9, 1.2) * u, rnd.uniform(0, math.pi)))
    for cor, ds in graos.items(): out.append(forma(' '.join(ds), cor, opacidade=.85))
    return out


# Confeitarias
@L('doce-granulado', 'Granulado', 'confeitarias', 'principal', 'placa')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    rnd = random.Random(7); grupos = {c: [] for c in ('clara', 'secundaria', 'destaque')}
    cores = list(grupos)
    for i in range(320):
        x = rnd.uniform(q.x0, q.x1); y = rnd.uniform(q.y0, q.y1)
        if q.visivel(x, y, 1.2 * u) and not q.perto_logo(x, y, 2 * u) and not q.perto_ic(x, y):
            grupos[cores[i % 3]].append(pilula_d(x, y, 2.2 * u, .65 * u, rnd.uniform(0, math.pi)))
    for cor, ds in grupos.items(): out.append(forma(' '.join(ds), cor))
    return out


@L('doce-cobertura', 'Cobertura', 'confeitarias', 'secundaria', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    base = q.y0 + 3 * u
    d = [f'M{pt(q.x0 - 1, q.y0 - 1)} L{pt(q.x1 + 1, q.y0 - 1)} L{pt(q.x1 + 1, base)}']
    rnd = random.Random(3); x = q.x1 + 1
    while x > q.x0 - 1:
        larg = rnd.uniform(2.6, 4.4) * u; queda = rnd.uniform(1.5, 3.2) * u if rnd.random() < .55 else 0
        if queda:
            r = larg * .32; k = r * KAPPA; cx = x - larg / 2
            d.append(f'L{pt(x, base)} C{pt(x - larg * .2, base)} {pt(cx + r, base + .4 * u)} {pt(cx + r, base + queda - r)} '
                     f'C{pt(cx + r, base + queda - r + k)} {pt(cx + k, base + queda)} {pt(cx, base + queda)} '
                     f'C{pt(cx - k, base + queda)} {pt(cx - r, base + queda - r + k)} {pt(cx - r, base + queda - r)} '
                     f'C{pt(cx - r, base + .4 * u)} {pt(x - larg * .8, base)} {pt(x - larg, base)}')
        else: d.append(f'L{pt(x - larg, base)}')
        x -= larg
    d.append(f'L{pt(q.x0 - 1, base)} Z')
    out.append(forma(' '.join(d), 'secundaria'))
    out.append(forma(onda_d([(q.x0 - 1, q.myb - 1 * u), (q.x0 + 35 * u, q.myb + 2 * u), (q.x1 + 1, q.myb - 2 * u)], [(q.x1 + 1, q.y1 + 1), (q.x0 - 1, q.y1 + 1)]), 'principal'))
    rnd = random.Random(5); gran = []
    for i in range(40):
        x = rnd.uniform(q.x0 + 40 * u, q.x1); y = rnd.uniform(q.myb, q.y1)
        gran.append(pilula_d(x, y, 1.8 * u, .55 * u, rnd.uniform(0, math.pi)))
    out.append(forma(' '.join(gran), 'destaque'))
    return out


@L('doce-bolinhas', 'Bolinhas', 'confeitarias', 'principal', 'bolha')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    passo = 4 * u; j = 0; y = q.y0; bol = []
    while y < q.y1 + passo:
        x = q.x0 + (passo / 2 if j % 2 else 0)
        while x < q.x1 + passo:
            if q.visivel(x, y, 1.1 * u) and not q.perto_logo(x, y, 3 * u) and not q.perto_ic(x, y): bol.append(circulo_d(x, y, 1.1 * u))
            x += passo
        y += passo * .87; j += 1
    out.append(forma(' '.join(bol), 'clara', opacidade=.8))
    out.append(forma(bolha_d(q.x1 - 2 * u, q.y1, 13 * u, 14), 'destaque'))
    out.append(forma(bolha_d(q.x0 + 2 * u, q.y0 + 1 * u, 9 * u, 15), 'secundaria'))
    return out


@L('doce-festao', 'Festão', 'confeitarias', 'principal', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    def festao(y, r, cor, para_baixo=True):
        borda = q.y0 - 1 if para_baixo else q.y1 + 1
        d = [f'M{pt(q.x0 - 1, borda)} L{pt(q.x0 - 1, y)}']
        x = q.x0 - 1; s = 1 if para_baixo else -1
        while x < q.x1 + 1:
            d.append(f'C{pt(x, y + s * r * 1.33)} {pt(x + 2 * r, y + s * r * 1.33)} {pt(x + 2 * r, y)}'); x += 2 * r
        d.append(f'L{pt(x, borda)} Z')
        return forma(' '.join(d), cor)
    out.append(festao(q.y0 + 3 * u, 2 * u, 'principal'))
    out.append(festao(q.y0 + 1.2 * u, 2 * u, 'secundaria'))
    out.append(festao(q.myb + 1 * u, 2.2 * u, 'principal', para_baixo=False))
    out.append(festao(q.myb + 3.8 * u, 2.2 * u, 'secundaria', para_baixo=False))
    return out


# Conveniências
@L('conv-velocidade', 'Velocidade', 'conveniencias', 'principal')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    rnd = random.Random(12); linhas = {'secundaria': [], 'clara': []}
    for i in range(12):
        y = q.y0 + rnd.uniform(.6, 5) * u; comp = rnd.uniform(8, 28) * u; x = q.x0 + rnd.uniform(5, 70) * u
        linhas['secundaria' if i % 3 else 'clara'].append(pilula_d(x, y, comp, .8 * u, 0))
    for cor, ds in linhas.items(): out.append(forma(' '.join(ds), cor))
    out.append(forma(poligono_d([(q.x0 + 46 * u, q.y1 + 1), (q.x0 + 53 * u, q.myb - 1.5 * u), (q.x1 + 1, q.myb - 1.5 * u), (q.x1 + 1, q.y1 + 1)]), 'secundaria'))
    out.append(forma(poligono_d([(q.x0 + 56 * u, q.y1 + 1), (q.x0 + 60.5 * u, q.myb + 2 * u), (q.x1 + 1, q.myb + 2 * u), (q.x1 + 1, q.y1 + 1)]), 'destaque'))
    out.append(forma(poligono_d([(q.x1 + 1, q.y0 + 14 * u), (q.x1 + 1, q.myb - 1.5 * u), (q.x1 - 4 * u, q.myb - 1.5 * u), (q.x1 - 4 * u, q.y0 + 18 * u)]), 'secundaria'))
    return out


@L('conv-blocos', 'Blocos', 'conveniencias', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    t = 4.6 * u
    for bx, by, bw, bh, cor in [(0, 0, 2, 1, 'principal'), (2, 0, 1, 1, 'destaque'), (3, 0, 1, 2, 'secundaria'), (-1, 0, 1, 1, 'secundaria'), (1, 1, 2, 1, 'escura'), (3, 2, 1, 1, 'principal')]:
        x0 = q.x0 - 1 + (bx + 1) * t
        out.append(forma(ret_d(x0, q.y0 - 1 + by * t, x0 + bw * t, q.y0 - 1 + (by + bh) * t), cor))
    for bx, by, bw, bh, cor in [(0, 0, 1, 2, 'principal'), (1, 1, 2, 1, 'secundaria'), (3, 0, 1, 2, 'destaque'), (4, 1, 2, 1, 'principal'), (2, 0, 1, 1, 'escura')]:
        x0 = q.x1 - 6 * t + bx * t
        out.append(forma(ret_d(x0, q.y1 + 1 - 2 * t + by * t, x0 + bw * t, q.y1 + 1 - 2 * t + (by + bh) * t), cor))
    out.append(forma(ret_d(q.x1 - t, q.jy0 + 14 * u, q.x1 + 1, q.jy0 + 14 * u + t), 'secundaria'))
    out.append(forma(ret_d(q.x1 - t * .6, q.jy0 + 14 * u + t, q.x1 + 1, q.jy0 + 14 * u + 2 * t), 'principal'))
    return out


@L('conv-diagonal', 'Diagonal dupla', 'conveniencias', 'escura')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    out.append(forma(poligono_d([(q.x0 + q.w * .6, q.y0 - 1), (q.x1 + 1, q.y0 - 1), (q.x1 + 1, q.y1 + 1), (q.x0 + q.w * .42, q.y1 + 1)]), 'escura'))
    out.append(forma(poligono_d([(q.x0 + q.w * .57, q.y0 - 1), (q.x0 + q.w * .6, q.y0 - 1), (q.x0 + q.w * .42, q.y1 + 1), (q.x0 + q.w * .39, q.y1 + 1)]), 'secundaria'))
    out.append(forma(poligono_d([(q.x1 - 26 * u, q.y1 + 1), (q.x1 + 1, q.y1 - 26 * u), (q.x1 + 1, q.y1 + 1)]), 'destaque'))
    out.append(forma(poligono_d([(q.x0 - 1, q.y0 - 1), (q.x0 + 16 * u, q.y0 - 1), (q.x0 - 1, q.y0 + 16 * u)]), 'secundaria'))
    return out


@L('conv-selos', 'Selos', 'conveniencias', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(ret_d(q.x0 - 1, q.myb - 1 * u, q.x1 + 1, q.y1 + 1), 'principal'))
    out.append(forma(ret_d(q.x0 - 1, q.y0 - 1, q.x1 + 1, q.y0 + 2.2 * u), 'principal'))
    for cx, cy, r, cor in [(q.x1 - 30 * u, q.y0 + 3.2 * u, 2.9 * u, 'secundaria'), (q.x1 - 38 * u, q.y0 + 3.2 * u, 2.2 * u, 'destaque'), (q.x1 - 7 * u, q.myb + 2.5 * u, 6 * u, 'secundaria'),
                           (q.x0 + 2.5 * u, q.jy0 + 20 * u, 5 * u, 'destaque')]:
        pts = [(cx + (r if i % 2 == 0 else r * .84) * math.cos(i * math.pi / 14), cy + (r if i % 2 == 0 else r * .84) * math.sin(i * math.pi / 14)) for i in range(28)]
        out.append(forma(poligono_d(pts), cor))
        out.append(forma(anel_d(cx, cy, r * .68, .25 * u), 'clara', regra='evenodd'))
    return out


# Ambientes corporativos
@L('corp-linhas', 'Linhas finas', 'corporativo', 'principal')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    linhas = []
    for i in range(14):
        x = q.x1 - 2 * u - i * 1.6 * u
        linhas.append(ret_d(x, q.y0 - 1, x + .22 * u, q.y0 + (30 - i * 2) * u))
    out.append(forma(' '.join(linhas), 'secundaria', opacidade=.8))
    out.append(forma(ret_d(q.x0 - 1, q.myb + 2 * u, q.x0 + 76 * u, q.myb + 2.4 * u), 'destaque'))
    out.append(forma(circulo_d(q.x0 + 76 * u, q.myb + 2.2 * u, .8 * u), 'destaque'))
    out.append(forma(ret_d(q.x0 - 1, q.y0 + 3 * u, q.x0 + 30 * u, q.y0 + 3.3 * u), 'secundaria', opacidade=.8))
    return out


@L('corp-poligonos', 'Geometria', 'corporativo', 'escura')
def _(q):
    u = q.u; out = [q.fundo('escura')]
    rnd = random.Random(23); t = 6 * u
    for i in range(9):
        for j in range(6):
            x = q.x1 + 1 - i * t; y = q.y0 - 1 + j * t
            if (i + j) > 7 or not q.visivel(x - t / 2, y + t / 2, t): continue
            op = .3 + .7 * (1 - (i + j) / 8)
            out.append(forma(poligono_d([(x, y), (x - t, y), (x, y + t)]), rnd.choice(['principal', 'secundaria']), opacidade=op))
            out.append(forma(poligono_d([(x - t, y), (x - t, y + t), (x, y + t)]), rnd.choice(['principal', 'secundaria']), opacidade=op * .8))
    out.append(forma(ret_d(q.x0 - 1, q.y1 - 2 * u, q.x0 + 46 * u, q.y1 + 1), 'destaque'))
    return out


@L('corp-faixa', 'Faixa lateral', 'corporativo', 'clara', 'placa')
def _(q):
    u = q.u; out = [q.fundo('clara')]
    out.append(forma(ret_d(q.x1 - 4.2 * u, q.y0 - 1, q.x1 + 1, q.y1 + 1), 'principal'))
    out.append(forma(ret_d(q.x1 - 5.2 * u, q.y0 - 1, q.x1 - 4.6 * u, q.y1 + 1), 'destaque'))
    out.append(forma(ret_d(q.x0 - 1, q.y0 - 1, q.x1 - 5.2 * u, q.jy0), 'principal'))
    out.append(forma(ret_d(q.x0 + 30 * u, q.myb + 3 * u, q.x1 - 5.2 * u, q.myb + 3.5 * u), 'secundaria'))
    return out


@L('corp-blocos', 'Camadas', 'corporativo', 'principal')
def _(q):
    u = q.u; out = [q.fundo('principal')]
    for dx, dy, cor, op in [(0, 0, 'secundaria', .45), (7, 4, 'secundaria', .7), (14, 8, 'destaque', .95)]:
        out.append(forma(ret_d(q.x1 - (40 - dx) * u, q.y0 - 8 * u + dy * u, q.x1 + 8 * u, q.y0 + (6 + dy) * u, 3 * u), cor, opacidade=op))
    for dx, dy, cor, op in [(0, 0, 'secundaria', .45), (10, 2.2, 'secundaria', .75)]:
        out.append(forma(ret_d(q.x0 + (46 + dx) * u, q.myb + (dy - .5) * u, q.x1 + 6 * u, q.y1 + 6 * u, 3 * u), cor, opacidade=op))
    return out


def catalogo():
    return [{'id': s, 'nome': nome, 'paleta': PALETAS[s], 'layouts': [f.meta for f in CATALOGO if f.meta['segmento'] == s]} for s, nome in SEGMENTOS]


def gerar(geo, layout_id):
    fn = next((f for f in CATALOGO if f.meta['id'] == layout_id), None)
    if not fn: raise ValueError('Layout não encontrado.')
    return {'formas': fn(Quadro(geo)), **{k: fn.meta[k] for k in ('logoIC', 'placa')}}
