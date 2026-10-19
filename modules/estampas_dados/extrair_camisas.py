"""Lê os desenhos das camisas (SVG em mm) e grava a geometria usada pelo sistema em camisas.json.

uso: python modules/estampas_dados/extrair_camisas.py "<pasta com camisa-comum.svg e camisa-baby-look.svg>"

Cada SVG tem as vistas "frente" e "costas", e em cada uma: contorno-<vista> (silhueta fechada), detalhes-<vista>
(linhas com traço), largura-<vista> (axila a axila) e altura-<vista> (do topo do ombro ao fim da barra). As linhas de
referência dizem onde estão o peito e a altura; o centro das mangas e o fundo da gola são medidos no desenho."""
import json
import math
import re
import sys
from pathlib import Path
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

ORIGEM = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
DESTINO = Path(__file__).with_name('camisas.json')
ARQUIVOS = {'comum': 'camisa-comum.svg', 'baby': 'camisa-baby-look.svg'}


def caminho(d):
    """Caminho SVG absoluto (M, L, H, V, Q, C, Z) → texto só com M/L/C/Z e a lista de subcaminhos achatados."""
    toks = re.findall(r'[MLHVQCZmlhvqcz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?', d)
    if any(t.islower() for t in toks if t.isalpha()): raise ValueError('Use só coordenadas absolutas no SVG.')
    i, cmd, cur, ini = 0, None, None, None
    saida, subs = [], []
    num = lambda: float(toks[i])
    while i < len(toks):
        if toks[i].isalpha(): cmd = toks[i]; i += 1
        if cmd == 'Z':
            saida.append('Z'); cur = ini; continue
        if cmd == 'M':
            cur = ini = (float(toks[i]), float(toks[i + 1])); i += 2; saida.append(f'M{cur[0]:g} {cur[1]:g}'); subs.append([cur]); cmd = 'L'; continue
        if cmd in 'LHV':
            if cmd == 'L': p = (float(toks[i]), float(toks[i + 1])); i += 2
            elif cmd == 'H': p = (float(toks[i]), cur[1]); i += 1
            else: p = (cur[0], float(toks[i])); i += 1
            saida.append(f'L{p[0]:g} {p[1]:g}'); subs[-1].append(p); cur = p; continue
        if cmd == 'Q':
            q = (float(toks[i]), float(toks[i + 1])); p = (float(toks[i + 2]), float(toks[i + 3])); i += 4
            c1 = (cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])); c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
        elif cmd == 'C':
            c1 = (float(toks[i]), float(toks[i + 1])); c2 = (float(toks[i + 2]), float(toks[i + 3])); p = (float(toks[i + 4]), float(toks[i + 5])); i += 6
        else: raise ValueError(f'Comando {cmd} não suportado.')
        saida.append(f'C{c1[0]:g} {c1[1]:g} {c2[0]:g} {c2[1]:g} {p[0]:g} {p[1]:g}')
        for s in range(1, 13):
            t = s / 12; m = 1 - t
            subs[-1].append(tuple(m ** 3 * a + 3 * m * m * t * b + 3 * m * t * t * c + t ** 3 * e for a, b, c, e in zip(cur, c1, c2, p)))
        cur = p
    return ' '.join(saida), subs


def atributo(svg, id_, nome):
    m = re.search(r'<[^>]*\bid="' + re.escape(id_) + r'"[^>]*>', svg, re.S)
    if not m: raise ValueError(f'Falta o elemento "{id_}" no SVG.')
    v = re.search(r'\b' + nome + r'="([^"]*)"', m.group(0), re.S)
    return v.group(1) if v else None


def vista(svg, nome):
    contorno, subs = caminho(atributo(svg, f'contorno-{nome}', 'd'))
    silhueta = Polygon(subs[0]).buffer(0)
    grupo = re.search(r'<g[^>]*\bid="detalhes-' + nome + r'"[^>]*>(.*?)</g>', svg, re.S).group(1)
    linhas, segmentos = [], []
    for d in re.findall(r'\bd="([^"]*)"', grupo, re.S):
        t, s = caminho(d); linhas.append(t); segmentos += s
    espessura = float(re.search(r'stroke-width="([\d.]+)"', grupo).group(1))
    lx1, ly, lx2 = (float(atributo(svg, f'largura-{nome}', k)) for k in ('x1', 'y1', 'x2'))
    ay1, ay2 = (float(atributo(svg, f'altura-{nome}', k)) for k in ('y1', 'y2'))
    cx = (lx1 + lx2) / 2
    centro = silhueta.intersection(LineString([(cx, ay1 - 50), (cx, ay2 + 50)]))
    fundo_gola = centro.bounds[1]
    # mangas: a parte da silhueta do lado de fora de cada costura da cava (a linha que termina na axila)
    mangas = []
    for ax in (lx1, lx2):
        costura = min((s for s in segmentos if s[0][1] < ly), key=lambda s: math.dist(s[-1], (ax, ly)))
        fora = -1 if ax < cx else 1
        borda = ax + fora * 2000
        lado = Polygon(costura + [(borda, costura[-1][1] + 100), (borda, costura[0][1] - 300)]).buffer(0)
        peca = silhueta.intersection(lado)
        mangas.append([round(peca.centroid.x, 1), round(peca.centroid.y, 1)])
    # a faixa da gola pode passar um pouco da silhueta (sobe acima do ombro): ela também recebe a cor da camisa
    golas = [Polygon(s).buffer(0) for s in segmentos if len(s) > 2 and min(x for x, _ in s) < cx < max(x for x, _ in s)
             and max(y for _, y in s) <= fundo_gola + 40 and s[0][1] < fundo_gola]
    preenchimento = unary_union([silhueta, *golas]).simplify(.2)
    if preenchimento.geom_type != 'Polygon': preenchimento = max(preenchimento.geoms, key=lambda g: g.area)
    contorno = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in list(preenchimento.exterior.coords)[:-1]) + ' Z'
    return {'silhueta': contorno, 'linhas': ' '.join(linhas), 'espessura': espessura, 'cx': cx, 'topo': ay1, 'barra': ay2,
            'peito': lx2 - lx1, 'yPeito': ly, 'fundoGola': round(fundo_gola, 1), 'mangas': sorted(mangas)}


dados = {}
for tipo, arquivo in ARQUIVOS.items():
    svg = (ORIGEM / arquivo).read_text(encoding='utf-8')
    dados[tipo] = {v: vista(svg, v) for v in ('frente', 'costas')}
DESTINO.write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
for t, vs in dados.items():
    for v, m in vs.items():
        print(t, v, {k: m[k] for k in ('cx', 'topo', 'barra', 'peito', 'yPeito', 'fundoGola', 'mangas', 'espessura')},
              f"proporção {(m['barra'] - m['topo']) / m['peito']:.3f}")
