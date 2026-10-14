"""Rotas da ferramenta Molduras de TV (/api/molduras/*): catálogo, layouts, logo, cores, projetos e exportação.
Os projetos ficam no banco e são da equipe toda (mesmo cliente, várias TVs, várias pessoas); cada um guarda quem criou."""
import io
import json
import math
import re
import threading
from PIL import Image
from storage import DATA, connect, now, uid
from . import molduras as M, molduras_geometria as G, molduras_layouts as L, molduras_padroes as P

PASTA = DATA / 'molduras'
_ready, _lock = False, threading.Lock()
ID = re.compile(r'[0-9a-f]{32}')
MATERIAIS = ('PS', 'PVC', 'ACM', 'MDF', 'Acrílico')


def init():
    global _ready
    with _lock:
        if _ready: return
        (PASTA / 'logos').mkdir(parents=True, exist_ok=True); (PASTA / 'padroes').mkdir(parents=True, exist_ok=True)
        with connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS molduras (id TEXT PRIMARY KEY, autor TEXT, cliente TEXT NOT NULL, dados TEXT NOT NULL,
                          criado TEXT NOT NULL, atualizado TEXT NOT NULL)''')
        _ready = True


def ident(valor, o_que='Arquivo'):
    if not isinstance(valor, str) or not ID.fullmatch(valor): raise ValueError(f'{o_que} inválido.')
    return valor


def logo_meta(lid):
    meta = PASTA / 'logos' / (ident(lid, 'Logo') + '.json')
    if not meta.is_file(): raise ValueError('Logo não encontrada. Envie a logo de novo.')
    return json.loads(meta.read_text(encoding='utf-8'))


def tv_validada(tv):
    if not isinstance(tv, dict): raise ValueError('Informe o tamanho da TV.')
    w, h = G.validar(tv.get('largura'), tv.get('altura'))
    pol = tv.get('polegadas')
    if pol not in (None, ''):
        try: pol = float(pol)
        except (TypeError, ValueError): raise ValueError('Polegadas inválidas.') from None
        if not 15 <= pol <= 120: raise ValueError('Use de 15 a 120 polegadas.')
        pol = int(pol) if pol == int(pol) else pol
    else: pol = None
    return {'polegadas': pol, 'largura': w, 'altura': h}


def placa_d(rect, tipo):
    """Fundo atrás da logo do cliente, para ela não brigar com o desenho: placa arredondada, círculo ou bolha."""
    x0, y0, x1, y1 = rect
    cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    folga = max(1.0, min(w, h) * .22)
    if tipo == 'placa':
        return G.retangulo_arredondado(x0 - folga, y0 - folga, x1 + folga, y1 + folga, min(1.2, (h + 2 * folga) / 2))
    if tipo == 'circulo':
        return L.circulo_d(cx, cy, math.hypot(w, h) / 2 + folga * .6)
    if tipo == 'bolha':
        rx, ry = w / 2 + folga * 1.6, h / 2 + folga * 1.6
        forma = [(1, 0), (.72, .72), (0, 1.05), (-.7, .78), (-1.06, .05), (-.74, -.7), (.04, -1.04), (.7, -.74)]
        return L.suave_d([(cx + rx * x, cy + ry * y) for x, y in forma])
    raise ValueError('Fundo da logo inválido.')


def projeto_validado(p, user):
    if not isinstance(p, dict): raise ValueError('Projeto inválido.')
    cliente = re.sub(r'\s+', ' ', str(p.get('cliente') or '')).strip()[:60]
    if not cliente: raise ValueError('Informe o nome do cliente.')
    try: quantidade = int(p['quantidade'] if p.get('quantidade') is not None else 1)
    except (TypeError, ValueError): raise ValueError('Quantidade inválida.') from None
    if not 1 <= quantidade <= 999: raise ValueError('Quantidade de 1 a 999.')
    material = str(p.get('material') or 'PS')
    if material not in MATERIAIS: raise ValueError('Material inválido.')
    cores = M.validar_cores(p.get('cores'))
    M.validar_formas(p.get('formas'), cores)
    layout = str(p.get('layout') or '')
    if not any(f.meta['id'] == layout for f in L.CATALOGO): raise ValueError('Layout não encontrado.')
    logo = None
    if p.get('logo'):
        meta = logo_meta(p['logo'].get('id'))
        try: escala = max(.3, min(1.0, float(p['logo'].get('escala', .7))))
        except (TypeError, ValueError): raise ValueError('Tamanho da logo inválido.') from None
        placa = p['logo'].get('placa') or 'nenhuma'
        if placa not in ('nenhuma', 'placa', 'circulo', 'bolha'): raise ValueError('Fundo da logo inválido.')
        cor_placa = p['logo'].get('placaCor') or 'clara'
        M.cor_de(cor_placa, cores)
        logo = {'id': meta['id'], 'nome': meta['nome'], 'cor': meta.get('cor'), 'vetor': meta['vetor'], 'escala': escala, 'placa': placa, 'placaCor': cor_placa}
    logo_ic = p.get('logoIC') or 'auto'
    if logo_ic not in ('auto', 'clara', 'escura'): raise ValueError('Logo Indoor Channel inválida.')
    return {'cliente': cliente, 'tv': tv_validada(p.get('tv')), 'quantidade': quantidade, 'material': material,
            'segmento': str(p.get('segmento') or '')[:40], 'layout': layout, 'cores': cores, 'formas': p['formas'],
            'editado': bool(p.get('editado')), 'logo': logo, 'logoIC': logo_ic}


def para_pdf(proj):
    """Completa o projeto com o que o PDF precisa: geometria, retângulo e fundo da logo, arquivo da logo."""
    g = G.geometria(proj['tv']['largura'], proj['tv']['altura'])
    logo_pdf = logo_png = None
    pronto = dict(proj)
    imagens = {}
    for f in proj['formas']:
        img = (f.get('imagem') or {}).get('id')
        if img and img not in imagens:
            meta = padrao_meta(img)
            if meta['tipo'] != 'imagem': raise ValueError('Pattern inválido.')
            imagens[img] = (Image.open(PASTA / 'padroes' / (img + '.png')).convert('RGBA'), meta['proporcao'])
    pronto['_imagens'] = imagens
    if proj['logo']:
        meta = logo_meta(proj['logo']['id'])
        rect = M.logo_rect(g, meta['proporcao'], proj['logo']['escala'])
        pronto['logo'] = proj['logo'] | {'rect': rect}
        if proj['logo']['placa'] != 'nenhuma': pronto['placa'] = {'d': placa_d(rect, proj['logo']['placa']), 'cor': proj['logo']['placaCor']}
        arquivo = PASTA / 'logos' / (meta['id'] + ('.pdf' if meta['vetor'] else '.png'))
        if meta['vetor']: logo_pdf = arquivo.read_bytes()
        else: logo_png = Image.open(arquivo).convert('RGBA')
    return pronto, g, logo_pdf, logo_png


def resumo(row):
    d = json.loads(row['dados'])
    return {'id': row['id'], 'cliente': row['cliente'], 'tv': d['tv'], 'layout': d['layout'], 'cores': d['cores'],
            'logo': d['logo'] and {'id': d['logo']['id']}, 'autor': row['autor_nome'], 'atualizado': row['atualizado']}


def api(method, path, value, query, raw, user, salvar_arquivos):
    """`salvar_arquivos(folder, [(nome, bytes)])` grava na pasta escolhida (ou entrega pelo navegador) e devolve os caminhos."""
    init()
    if path == '/api/molduras/catalogo':
        return {'segmentos': L.catalogo(), 'papeis': list(L.PAPEIS), 'materiais': list(MATERIAIS),
                'tamanhos': [{'polegadas': p, 'largura': w, 'altura': h} for p, w, h in G.TAMANHOS],
                'logoIndoor': {k: M.LOGO_IC[k] for k in ('largura', 'altura', 'a', 'b')} | {'tinta': M.TINTA_IC}, 'padroes': P.catalogo()}
    if path == '/api/molduras/estimar':
        return G.estimar(query.get('polegadas', [''])[0])
    if path == '/api/molduras/projetos':
        with connect() as db:
            rows = db.execute('''SELECT molduras.*, users.name AS autor_nome FROM molduras LEFT JOIN users ON users.id=molduras.autor
                                 ORDER BY atualizado DESC LIMIT 300''').fetchall() if _tem_users(db) else \
                   db.execute('SELECT molduras.*, NULL AS autor_nome FROM molduras ORDER BY atualizado DESC LIMIT 300').fetchall()
        return {'projetos': [resumo(r) for r in rows]}
    if path == '/api/molduras/projeto':
        with connect() as db: row = db.execute('SELECT * FROM molduras WHERE id=?', (ident(query.get('id', [''])[0], 'Projeto'),)).fetchone()
        if not row: raise ValueError('Projeto não encontrado.')
        return {'id': row['id'], **json.loads(row['dados'])}
    if path.startswith('/molduras/logo/'):
        raise ValueError('Operação não encontrada.')
    if method != 'POST': raise ValueError('Operação não encontrada.')
    if path == '/api/molduras/gerar':
        tv = tv_validada(value.get('tv'))
        ids = value.get('layouts') or []
        if not isinstance(ids, list) or not 1 <= len(ids) <= 40: raise ValueError('Escolha os layouts.')
        g = G.geometria(tv['largura'], tv['altura'])
        return {'geometria': g, 'layouts': {i: L.gerar(g, i) for i in dict.fromkeys(map(str, ids))}}
    if path == '/api/molduras/placa':
        tv = tv_validada(value.get('tv')); meta = logo_meta(value.get('logo'))
        g = G.geometria(tv['largura'], tv['altura'])
        rect = M.logo_rect(g, meta['proporcao'], value.get('escala', .7))
        tipo = value.get('placa') or 'nenhuma'
        return {'rect': rect, 'placa': None if tipo == 'nenhuma' else placa_d(rect, tipo)}
    if path in ('/api/molduras/logo', '/api/molduras/referencia'):
        nome = query.get('name', ['logo'])[0].replace('\\', '/').split('/')[-1][:120]
        ext = ('.' + nome.rsplit('.', 1)[-1].lower()) if '.' in nome else ''
        if not raw: raise ValueError('Arquivo vazio.')
        pdf, previa, proporcao = M.preparar_logo(raw, ext)
        cores = M.cores_da_imagem(previa, 2.0 if path.endswith('logo') else 1.0)
        if path.endswith('referencia'): return {'cores': cores}
        lid = uid()
        if pdf: (PASTA / 'logos' / (lid + '.pdf')).write_bytes(pdf)
        else: previa.save(PASTA / 'logos' / (lid + '.png'))
        mini = previa.copy(); mini.thumbnail((900, 900)); mini.save(PASTA / 'logos' / (lid + '-previa.png'))
        meta = {'id': lid, 'nome': nome, 'vetor': bool(pdf), 'proporcao': proporcao, 'cor': cores[0][0] if cores else None}
        (PASTA / 'logos' / (lid + '.json')).write_text(json.dumps(meta), encoding='utf-8')
        return meta | {'cores': cores}
    if path == '/api/molduras/padrao':
        nome = query.get('name', ['pattern'])[0].replace(chr(92), '/').split('/')[-1][:120]
        ext = ('.' + nome.rsplit('.', 1)[-1].lower()) if '.' in nome else ''
        if not raw: raise ValueError('Arquivo vazio.')
        tipo, dados, aviso = P.importar(raw, ext)
        pid = uid()
        meta = {'id': pid, 'nome': nome, 'tipo': tipo, 'aviso': aviso}
        if tipo == 'vetor':
            meta['grupos'] = P.grupos_json(dados)
        else:
            dados.save(PASTA / 'padroes' / (pid + '.png'))
            meta['proporcao'] = dados.width / dados.height
            mini = dados.copy(); mini.thumbnail((600, 600)); mini.save(PASTA / 'padroes' / (pid + '-previa.png'))
        (PASTA / 'padroes' / (pid + '.json')).write_text(json.dumps(meta), encoding='utf-8')
        return meta
    if path == '/api/molduras/padrao-aplicar':
        tv = tv_validada(value.get('tv')); g = G.geometria(tv['largura'], tv['altura'])
        tamanho, espacamento, giro = P.parametros(value)
        alvo = value.get('alvo')
        if alvo not in (None, 'fundo'):
            if not isinstance(alvo, dict): raise ValueError('Escolha onde aplicar o pattern.')
            M.subcaminhos(alvo.get('d'))
        fonte = str(value.get('fonte') or '')
        tipo, _, chave = fonte.partition(':')
        if tipo == 'pronto':
            if chave not in P.PRONTOS: raise ValueError('Pattern não encontrado.')
            return {'formas': P.aplicar_vetor([(None, P.PRONTOS[chave][1])], g, alvo, tamanho, espacamento, giro)}
        meta = padrao_meta(chave)
        if tipo == 'vetor' and meta['tipo'] == 'vetor':
            return {'formas': P.aplicar_vetor(P.grupos_de_json(meta['grupos']), g, alvo, tamanho, espacamento, giro)}
        if tipo == 'imagem' and meta['tipo'] == 'imagem':
            area = P.area_alvo(g, alvo)
            if area.is_empty: raise ValueError('A forma escolhida fica toda atrás da tela da TV. Escolha outra.')
            return {'area': P.d_geometria(area), 'proporcao': meta['proporcao']}
        raise ValueError('Pattern não encontrado.')
    if path == '/api/molduras/sugerir':
        segmento = value.get('segmento')
        base = L.PALETAS.get(segmento, L.PALETAS['supermercados'])
        cores = [(c, float(w)) for c, w in (value.get('cores') or []) if isinstance(c, str) and M.HEX.fullmatch(c)]
        return {'cores': M.sugerir_papeis(M.juntar([cores]), base)}
    if path == '/api/molduras/salvar':
        proj = projeto_validado(value.get('projeto'), user)
        pid = value.get('id')
        with connect() as db:
            if pid:
                ident(pid, 'Projeto')
                if not db.execute('SELECT 1 FROM molduras WHERE id=?', (pid,)).fetchone(): raise ValueError('Projeto não encontrado.')
                db.execute('UPDATE molduras SET cliente=?, dados=?, atualizado=? WHERE id=?', (proj['cliente'], json.dumps(proj), now(), pid))
            else:
                pid = uid()
                db.execute('INSERT INTO molduras VALUES(?,?,?,?,?,?)', (pid, user and user['id'], proj['cliente'], json.dumps(proj), now(), now()))
        return {'id': pid}
    if path == '/api/molduras/excluir':
        with connect() as db: db.execute('DELETE FROM molduras WHERE id=?', (ident(value.get('id'), 'Projeto'),))
        return {'ok': True}
    if path == '/api/molduras/exportar':
        proj = projeto_validado(value.get('projeto'), user)
        pronto, g, logo_pdf, logo_png = para_pdf(proj)
        folha_nome, faca_nome = M.nomes_arquivos(proj)
        folha_nome = _nome(value.get('folha') or folha_nome); faca_nome = _nome(value.get('faca') or faca_nome)
        if folha_nome == faca_nome: raise ValueError('Os dois arquivos precisam de nomes diferentes.')
        arquivos = [(folha_nome + '.pdf', M.folha_pdf(pronto, g, logo_pdf, logo_png, pronto.pop('_imagens'))), (faca_nome + '.pdf', M.faca_pdf(pronto, g))]
        caminhos = salvar_arquivos(value.get('folder'), arquivos)
        return {'arquivos': caminhos, 'folha': g['folha'], 'logoIC': M.variante_logo_ic(pronto, proj['cores'], M.validar_formas(proj['formas'], proj['cores']), g)}
    raise ValueError('Operação não encontrada.')


def _nome(valor):
    valor = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', str(valor)).strip(' .')
    if valor.lower().endswith('.pdf'): valor = valor[:-4].strip(' .')
    if not valor or len(valor) > 150: raise ValueError('Preencha os nomes dos arquivos (até 150 caracteres).')
    return valor


def _tem_users(db):
    return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").fetchone())


def padrao_meta(pid):
    meta = PASTA / 'padroes' / (ident(pid, 'Pattern') + '.json')
    if not meta.is_file(): raise ValueError('Pattern não encontrado. Importe o arquivo de novo.')
    return json.loads(meta.read_text(encoding='utf-8'))


def previa_padrao(pid):
    arquivo = PASTA / 'padroes' / (ident(pid, 'Pattern') + '-previa.png')
    if not arquivo.is_file(): raise FileNotFoundError()
    return arquivo.read_bytes()


def previa_logo(lid):
    arquivo = PASTA / 'logos' / (ident(lid, 'Logo') + '-previa.png')
    if not arquivo.is_file(): raise FileNotFoundError()
    return arquivo.read_bytes()
