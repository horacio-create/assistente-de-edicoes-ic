"""Rotas da ferramenta Estampas de camisa (/api/estampas/*): arte, remoção de fundo, conferência e exportação."""
import base64
import io
import json
import re
import zipfile
from PIL import Image
from storage import DATA, uid
from . import estampas as E
from . import estampas_mockups as M

PASTA = DATA / 'estampas'
ID = re.compile(r'[0-9a-f]{32}')


def _id(v):
    if not isinstance(v, str) or not ID.fullmatch(v): raise ValueError('Estampa inválida.')
    return v


def meta(aid):
    arq = PASTA / (_id(aid) + '.json')
    if not arq.is_file(): raise ValueError('Estampa não encontrada. Importe o arquivo de novo.')
    return json.loads(arq.read_text(encoding='utf-8'))


def carregar(aid):
    """Meta + conteúdo da arte (PDF de uma página ou imagem RGBA)."""
    m = meta(aid)
    if m['vetor']: return m | {'pdf': (PASTA / (aid + '.pdf')).read_bytes(), 'previa': Image.open(PASTA / (aid + '-previa.png')).convert('RGBA')}
    im = Image.open(PASTA / (aid + '.png')).convert('RGBA')
    return m | {'imagem': im, 'previa': im}


def guardar(nome, arte):
    aid = uid()
    PASTA.mkdir(parents=True, exist_ok=True)
    if arte['vetor']: (PASTA / (aid + '.pdf')).write_bytes(arte['pdf'])
    else: arte['imagem'].save(PASTA / (aid + '.png'))
    arte['previa'].save(PASTA / (aid + '-previa.png'))
    m = {k: v for k, v in arte.items() if k not in ('pdf', 'imagem', 'previa')} | {'id': aid, 'nome': nome}
    m['avisos'] = E.avisos_gerais(m)
    (PASTA / (aid + '.json')).write_text(json.dumps(m), encoding='utf-8')
    return m


def tamanhos_validos(lista):
    if not isinstance(lista, list) or not lista: raise ValueError('Escolha ao menos um tamanho.')
    out = []
    for item in lista:
        if not (isinstance(item, (list, tuple)) and len(item) == 2 and item[0] in E.TAMANHOS and item[1] in E.TAMANHOS[item[0]]):
            raise ValueError('Tamanho inválido.')
        if tuple(item) not in out: out.append(tuple(item))
    return out


MAX_POR_LOCAL = 6


def pecas_validas(pecas):
    """[{local, arte, ajuste}] → peças com o ajuste validado e o número dentro do local (0 quando é a única)."""
    if not isinstance(pecas, list) or not pecas: raise ValueError('Importe ao menos uma estampa.')
    out = []
    for p in pecas:
        if not isinstance(p, dict) or p.get('local') not in E.LOCAIS: raise ValueError('Local da estampa inválido.')
        out.append({'local': p['local'], 'arte': _id(p.get('arte')), 'ajuste': E.ajuste_valido(p.get('ajuste'))})
    for local in E.LOCAIS:
        doLocal = [p for p in out if p['local'] == local]
        if len(doLocal) > MAX_POR_LOCAL: raise ValueError(f'No máximo {MAX_POR_LOCAL} estampas por local.')
        for i, p in enumerate(doLocal): p['n'] = i + 1 if len(doLocal) > 1 else 0
    return out


def rotulo(p):
    return E.LOCAIS[p['local']] + (f' {p["n"]}' if p['n'] else '')


def sobreposicoes(pecas, tamanhos):
    """Pares de estampas do mesmo local que se cruzam em algum tamanho (a posição é relativa à área, então muda um pouco)."""
    out = []
    for tipo, tam in tamanhos:
        caixas = []
        for p in pecas:
            aw, ah, _ = E.area(tipo, tam, p['local'])
            lw, lh, dx, dy = E.colocar(meta(p['arte'])['proporcao'], aw, ah, p['ajuste'])
            caixas.append((p, dx, dy, dx + lw, dy + lh))
        for i, (p, x0, y0, x1, y1) in enumerate(caixas):
            for q, u0, v0, u1, v1 in caixas[i + 1:]:
                if p['local'] == q['local'] and min(x1, u1) - max(x0, u0) > .05 and min(y1, v1) - max(y0, v0) > .05:
                    out.append(f'{E.TIPOS[tipo]} {tam} · {rotulo(p)} e {rotulo(q)} se sobrepõem. Afaste ou diminua uma delas.')
    return out


def cor_valida(cor):
    cor = cor or 'branca'
    if cor not in E.COR_HEX: raise ValueError('Cor de camisa inválida.')
    return cor


def plano(pecas, tamanhos, cor='branca'):
    """Para cada estampa e tamanho: medida final da arte (com o ajuste de tamanho), área usada e avisos de impressão."""
    out = []
    for p in pecas:
        m = meta(p['arte'])
        extra = [a for a in [E.aviso_contraste(m, cor)] if a]
        for tipo, tam in tamanhos:
            aw, ah, conf = E.area(tipo, tam, p['local'])
            lw, lh, dx, dy = E.colocar(m['proporcao'], aw, ah, p['ajuste'])
            out.append({'local': p['local'], 'n': p['n'], 'rotulo': rotulo(p), 'arte': p['arte'], 'tipo': tipo, 'tamanho': tam, 'area': [aw, ah],
                        'confirmar': conf, 'medida': [lw, lh], 'deslocamento': [round(dx, 2), round(dy, 2)], 'avisos': E.conferir(m, lw, lh)})
        if extra and out: out[-1]['avisosGerais'] = extra
    return out


def _com_artes(pecas):
    cache = {aid: carregar(aid) for aid in {p['arte'] for p in pecas}}
    return [p | {'dados': cache[p['arte']]} for p in pecas]


def api(method, path, value, query, raw, salvar_arquivos):
    if path == '/api/estampas/catalogo': return E.catalogo()
    if method != 'POST': raise ValueError('Operação não encontrada.')
    if path == '/api/estampas/arte':
        nome = query.get('name', ['estampa'])[0].replace(chr(92), '/').split('/')[-1][:120]
        ext = ('.' + nome.rsplit('.', 1)[-1].lower()) if '.' in nome else ''
        if not raw: raise ValueError('Arquivo vazio.')
        return guardar(nome, E.ler(raw, ext))
    if path == '/api/estampas/remover-fundo':
        m = carregar(value.get('id'))
        if m['vetor']: raise ValueError('Em arquivos vetoriais, remova o fundo no programa de origem e exporte de novo.')
        im = E.remover_fundo(m['imagem'])
        return guardar(m['nome'], {'vetor': False, 'imagem': im, 'previa': E._miniatura(im), 'proporcao': im.width / im.height,
                                   'fundoBranco': False, 'px': (im.width, im.height), 'corPrincipal': E.cor_principal(im)})
    if path == '/api/estampas/conferir':
        pecas = pecas_validas(value.get('pecas')); tamanhos = tamanhos_validos(value.get('tamanhos'))
        return {'itens': plano(pecas, tamanhos, cor_valida(value.get('cor'))), 'sobreposicoes': sobreposicoes(pecas, tamanhos)}
    if path == '/api/estampas/mockups':
        pecas = pecas_validas(value.get('pecas')); cor = cor_valida(value.get('cor'))
        tipo, tam = tamanhos_validos([value.get('tamanho')])[0]
        if not M.disponivel(tipo, tam): return {'vistas': []}
        usadas = _com_artes(pecas)
        return {'vistas': [{'vista': v, 'nome': M.VISTAS[v], 'imagem': 'data:image/jpeg;base64,' + base64.b64encode(
            M.jpeg(M.gerar(tipo, tam, v, cor, usadas), largura=720, qualidade=85)).decode()} for v in M.VISTAS]}
    if path == '/api/estampas/exportar':
        cliente = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', re.sub(r'\s+', ' ', str(value.get('cliente') or ''))).strip(' .')[:60]
        if not cliente: raise ValueError('Informe o nome do cliente.')
        pecas = pecas_validas(value.get('pecas')); tamanhos = tamanhos_validos(value.get('tamanhos')); cor = cor_valida(value.get('cor'))
        if conflito := sobreposicoes(pecas, tamanhos): raise ValueError(conflito[0])
        usadas = _com_artes(pecas)
        cache = {p['arte']: p['dados'] for p in usadas}
        organizar = len(tamanhos) > E.ORGANIZAR_ACIMA_DE
        arquivos = []
        # um PDF por lado e tamanho, com todas as estampas daquele lado
        lados = {}
        for item in plano(pecas, tamanhos, cor):
            lados.setdefault((item['tipo'], item['tamanho'], item['local']), []).append(
                (cache[item['arte']], *item['medida'], *item['deslocamento']))
        for (tipo, tam, local), itens in lados.items():
            _, _, w, h = E.caixa_lado(itens)
            nome = E.nome_arquivo(cliente, tipo, tam, local, w, h) + '.pdf'
            if organizar: nome = E.PASTAS[tipo, 'impressao'] + '/' + nome
            arquivos.append((nome, E.pdf_lado(itens)))
        if value.get('mockups', True):
            for tipo, tam in tamanhos:
                if not M.disponivel(tipo, tam): continue
                for v in M.VISTAS:
                    nome = M.nome_arquivo(cliente, tipo, tam, v)
                    if organizar: nome = E.PASTAS[tipo, 'mockups'] + '/' + nome
                    arquivos.append((nome, M.jpeg(M.gerar(tipo, tam, v, cor, usadas))))
        if value.get('conferencia', True):
            arquivos.append((f'Conferência de estampa {cliente}.pdf', E.folha_conferencia(cliente, usadas, tamanhos, cor)))
        if value.get('zip'):
            pacote = io.BytesIO()
            with zipfile.ZipFile(pacote, 'w', zipfile.ZIP_DEFLATED) as z:
                for nome, dados in arquivos: z.writestr(nome, dados)
            arquivos = [(f'Estampa {cliente}.zip', pacote.getvalue())]
        return {'arquivos': salvar_arquivos(value.get('folder'), arquivos), 'organizado': organizar}
    raise ValueError('Operação não encontrada.')


def previa(aid):
    arq = PASTA / (_id(aid) + '-previa.png')
    if not arq.is_file(): raise FileNotFoundError()
    return arq.read_bytes()
