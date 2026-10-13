"""Relatórios a partir do Clockify: a equipe registra o tempo lá; aqui o superadmin vê e exporta o mês.
A chave fica na variável de ambiente CLOCKIFY_API_KEY (nunca no código). CLOCKIFY_WORKSPACE escolhe o espaço
de trabalho; sem ela, vale o espaço ativo do dono da chave. Os registros do mês ficam 2 minutos em memória."""
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

API = 'https://api.clockify.me/api/v1'
REPORTS = 'https://reports.api.clockify.me/v1'
FUSO = timezone(timedelta(hours=-3))   # America/Sao_Paulo, sem horário de verão desde 2019
CACHE_S = 120
PAGINA = 1000
# Cores das barras por etiqueta: as etiquetas do Clockify não têm cor; nomes conhecidos ganham sempre a mesma
CORES = ['#6A4FD1', '#1E7FD6', '#0F8C8C', '#2E9E4F', '#B8860B', '#E8710A', '#D93F3F', '#C2368D', '#8A5A3B', '#4F5F73']
ALTERACAO = re.compile(r'altera[çc][ãa]o', re.I)
SUFIXO_ALTERACAO = re.compile(r'\s*[\(\[\-–—]?\s*altera[çc][ãa]o\s*\d*\s*[\)\]]?\s*$', re.I)
_cache, _lock = {}, threading.Lock()


class Indisponivel(ValueError):
    """Clockify sem chave, fora do ar ou recusando a chave: a tela mostra a mensagem."""


def chave_api():
    return (os.environ.get('CLOCKIFY_API_KEY') or '').strip()


def configurado(): return bool(chave_api())


def _chamar(url, corpo=None):
    if not configurado():
        raise Indisponivel('O Clockify não está conectado: falta a variável de ambiente CLOCKIFY_API_KEY no servidor.')
    req = urllib.request.Request(url, data=json.dumps(corpo).encode() if corpo is not None else None, method='POST' if corpo is not None else 'GET',
                                 headers={'X-Api-Key': chave_api(), 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read())
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403): raise Indisponivel('O Clockify recusou a chave de API. Gere uma nova chave e atualize CLOCKIFY_API_KEY.') from None
        raise Indisponivel(f'O Clockify respondeu com erro {exc.code}. Tente de novo em instantes.') from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise Indisponivel('Não foi possível falar com o Clockify. Confira a internet do servidor e tente de novo.') from None


def espaco():
    """Id do espaço de trabalho: CLOCKIFY_WORKSPACE ou o ativo do dono da chave (guardado na primeira consulta)."""
    if os.environ.get('CLOCKIFY_WORKSPACE'): return os.environ['CLOCKIFY_WORKSPACE'].strip()
    if 'espaco' not in _cache: _cache['espaco'] = _chamar(API + '/user')['activeWorkspace']
    return _cache['espaco']


def intervalo(mes):
    """Início e fim do mês no horário de Brasília, em UTC (o formato que a API de relatórios aceita)."""
    ano, m = map(int, mes.split('-'))
    inicio = datetime(ano, m, 1, tzinfo=FUSO)
    fim = datetime(ano + (m == 12), m % 12 + 1, 1, tzinfo=FUSO) - timedelta(milliseconds=1)
    z = lambda d: d.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    return z(inicio), z(fim)


def buscar(mes):
    """Todos os registros de tempo da equipe no mês (relatório detalhado, página a página)."""
    inicio, fim = intervalo(mes)
    ws, registros, pagina = espaco(), [], 1
    while True:
        dados = _chamar(f'{REPORTS}/workspaces/{ws}/reports/detailed', {
            'dateRangeStart': inicio, 'dateRangeEnd': fim, 'sortOrder': 'ASCENDING',
            'detailedFilter': {'page': pagina, 'pageSize': PAGINA, 'sortColumn': 'DATE'}})
        lote = dados.get('timeentries') or []
        registros += lote
        if len(lote) < PAGINA or pagina >= 50: return registros
        pagina += 1


def registros_do_mes(mes, atualizar=False):
    with _lock:
        guardado = _cache.get(mes)
        if guardado and not atualizar and time.monotonic() - guardado[0] < CACHE_S: return guardado[1], guardado[2]
    entradas = buscar(mes)
    quando = datetime.now(FUSO).isoformat(timespec='seconds')
    with _lock: _cache[mes] = (time.monotonic(), entradas, quando)
    return entradas, quando


def norm(text): return re.sub(r'\s+', ' ', str(text or '')).strip()
def chave(text): return norm(text).casefold()
def base_tarefa(desc): return SUFIXO_ALTERACAO.sub('', desc).strip() or desc


def cor(nome, posicao=0):
    """Cor fixa das etiquetas conhecidas; as demais seguem a paleta pela posição no ranking, para vizinhas não repetirem."""
    conhecidas = {'alteração de arte': '#D93F3F', 'adaptação de encarte': '#E8710A', 'arte moldura': '#B8860B', 'atualização de ofertas': '#2E9E4F',
                  'edição imagens': '#0F8C8C', 'edição imagens (slide)': '#1E7FD6', 'edição vt': '#6A4FD1', 'impressão': '#C2368D',
                  'totem': '#8A5A3B', 'vertical': '#4F5F73'}
    return conhecidas.get(chave(nome)) or CORES[posicao % len(CORES)]


def converter(e, agora):
    """Um registro do Clockify no formato da tela e das exportações. Cronômetro ainda ligado conta até `agora`."""
    intervalo_ = e.get('timeInterval') or {}
    inicio, fim = intervalo_.get('start'), intervalo_.get('end')
    andamento = not fim
    segundos = intervalo_.get('duration')
    if andamento and inicio: segundos = (agora - datetime.fromisoformat(inicio)).total_seconds()
    tarefa = norm(e.get('description')) or 'Sem descrição'
    etiquetas = [norm(t.get('name')) for t in e.get('tags') or [] if norm(t.get('name'))]
    return {'id': e.get('_id'), 'inicio': inicio, 'fim': fim, 'pessoa': norm(e.get('userName')) or 'Sem nome',
            'projeto': norm(e.get('projectName')) or 'Sem projeto', 'cliente': norm(e.get('clientName')),
            'tarefa': tarefa, 'etiquetas': etiquetas, 'segundos': max(0.0, float(segundos or 0)), 'andamento': andamento,
            'alteracao': bool(ALTERACAO.search(tarefa) or any(ALTERACAO.search(t) for t in etiquetas))}


def montar(mes, entradas, atualizado=None):
    """Totais do mês. "Tarefa" é a descrição do registro: vários registros com a mesma descrição são a mesma tarefa.
    Alteração é a tarefa com "alteração" na descrição ou numa etiqueta; ela conta para a tarefa original (sem o sufixo)."""
    # cronômetro esquecido ligado conta só até o fim do mês do relatório
    agora = min(datetime.now(timezone.utc), datetime.fromisoformat(intervalo(mes)[1].replace('Z', '+00:00')))
    registros = sorted((converter(e, agora) for e in entradas), key=lambda r: r['inicio'] or '')
    alteracoes = {chave(r['tarefa']) for r in registros if r['alteracao']}

    def soma(chaves):
        acc = defaultdict(lambda: {'nome': None, 'segundos': 0.0, 'tarefas': set(), 'alteracoes': set(), 'registros': 0})
        for r in registros:
            for k in chaves(r):
                item = acc[chave(k)]; item['nome'] = item['nome'] or k
                item['segundos'] += r['segundos']; item['registros'] += 1; item['tarefas'].add(chave(r['tarefa']))
                if r['alteracao']: item['alteracoes'].add(chave(r['tarefa']))
        return sorted(({**x, 'tarefas': len(x['tarefas']), 'alteracoes': len(x['alteracoes'])} for x in acc.values()), key=lambda x: -x['segundos'])

    por_original = defaultdict(lambda: {'nome': None, 'alteracoes': set(), 'segundos': 0.0})
    for r in registros:
        if not r['alteracao']: continue
        item = por_original[chave(base_tarefa(r['tarefa']))]
        item['nome'] = item['nome'] or base_tarefa(r['tarefa'])
        item['alteracoes'].add(chave(r['tarefa'])); item['segundos'] += r['segundos']
    alteracoes_por_tarefa = sorted(({**x, 'alteracoes': len(x['alteracoes'])} for x in por_original.values()),
                                   key=lambda x: (-x['alteracoes'], -x['segundos']))
    return {
        'mes': mes, 'fonte': 'clockify', 'atualizado': atualizado, 'registros': registros,
        'totais': {'segundos': sum(r['segundos'] for r in registros), 'registros': len(registros),
                   'tarefas': len({chave(r['tarefa']) for r in registros}), 'alteracoes': len(alteracoes),
                   'colaboradores': len({chave(r['pessoa']) for r in registros}), 'emAndamento': sum(r['andamento'] for r in registros)},
        'porEtiqueta': [x | {'cor': cor(x['nome'], i)} for i, x in enumerate(soma(lambda r: r['etiquetas']))],
        'porProjeto': soma(lambda r: [r['projeto']]),
        'porPessoa': soma(lambda r: [r['pessoa']]),
        'porTarefa': soma(lambda r: [r['tarefa']]),
        'alteracoesPorTarefa': alteracoes_por_tarefa,
    }


def relatorio(mes, atualizar=False):
    entradas, quando = registros_do_mes(mes, atualizar)
    return montar(mes, entradas, quando)
