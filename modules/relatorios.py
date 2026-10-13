"""Relatórios: cada demanda vira uma atividade (cliente, tarefa e etiquetas) com cronômetro.
Só no servidor com login; o cargo de marca EAP (Colaborador EAP) é outro centro de custos e não registra.
Uma atividade aberta por pessoa; pausar fecha um período e retomar abre outro. Superadmin vê e exporta o mês."""
import json
import re
import threading
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from storage import connect, now, uid

# Etiquetas fixas: id estável no banco, nome e cor (tons distintos também em claridade, para quem não distingue matiz)
TAGS = [
    {'id': 'alteracao-arte', 'name': 'Alteração de arte', 'color': '#D93F3F'},
    {'id': 'adaptacao-encartes', 'name': 'Adaptação de encartes', 'color': '#E8710A'},
    {'id': 'arte-moldura', 'name': 'Arte moldura', 'color': '#B8860B'},
    {'id': 'atualizacao-ofertas', 'name': 'Atualização de ofertas', 'color': '#2E9E4F'},
    {'id': 'edicao-imagens', 'name': 'Edição de imagens', 'color': '#0F8C8C'},
    {'id': 'edicao-imagens-slide', 'name': 'Edição de imagens (slide)', 'color': '#1E7FD6'},
    {'id': 'edicao-vt', 'name': 'Edição de VT', 'color': '#6A4FD1'},
    {'id': 'impressao', 'name': 'Impressão', 'color': '#C2368D'},
    {'id': 'totem', 'name': 'Totem', 'color': '#8A5A3B'},
    {'id': 'vertical', 'name': 'Vertical', 'color': '#4F5F73'},
]
TAG_IDS = {t['id'] for t in TAGS}
REPETICAO = timedelta(days=1)   # mesmo cliente e mesma tarefa em menos de um dia: pergunta se é alteração
_ready, _lock = False, threading.Lock()


def init():
    global _ready
    with _lock:
        if _ready: return
        with connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS atividades (id TEXT PRIMARY KEY, user TEXT NOT NULL, cliente TEXT NOT NULL, tarefa TEXT NOT NULL,
                etiquetas TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL, alteracao_de TEXT, inicio TEXT NOT NULL, fim TEXT,
                segundos_corrigidos REAL);
            CREATE TABLE IF NOT EXISTS atividade_periodos (atividade TEXT NOT NULL, inicio TEXT NOT NULL, fim TEXT);
            CREATE TABLE IF NOT EXISTS atividade_correcoes (atividade TEXT NOT NULL, user TEXT NOT NULL, quando TEXT NOT NULL,
                antes REAL, depois REAL, motivo TEXT);
            CREATE INDEX IF NOT EXISTS atividades_user ON atividades(user, status);
            CREATE INDEX IF NOT EXISTS atividades_inicio ON atividades(inicio);
            CREATE INDEX IF NOT EXISTS periodos_atividade ON atividade_periodos(atividade);
            ''')
        _ready = True


def parse(iso): return datetime.fromisoformat(iso)
def norm(text): return re.sub(r'\s+', ' ', str(text or '')).strip()
def chave(text): return norm(text).casefold()


def segundos(db, ident, agora=None):
    """Tempo trabalhado: soma dos períodos (o aberto conta até agora), ou o valor corrigido."""
    row = db.execute('SELECT segundos_corrigidos FROM atividades WHERE id=?', (ident,)).fetchone()
    if row and row['segundos_corrigidos'] is not None: return row['segundos_corrigidos']
    agora = agora or datetime.now(timezone.utc)
    total = 0.0
    for p in db.execute('SELECT inicio, fim FROM atividade_periodos WHERE atividade=?', (ident,)):
        total += ((parse(p['fim']) if p['fim'] else agora) - parse(p['inicio'])).total_seconds()
    return max(0.0, total)


def publica(db, row):
    if not row: return None
    aberto = db.execute('SELECT inicio FROM atividade_periodos WHERE atividade=? AND fim IS NULL', (row['id'],)).fetchone()
    return {'id': row['id'], 'cliente': row['cliente'], 'tarefa': row['tarefa'], 'etiquetas': json.loads(row['etiquetas']),
            'status': row['status'], 'alteracaoDe': row['alteracao_de'], 'inicio': row['inicio'], 'fim': row['fim'],
            'segundos': segundos(db, row['id']), 'corrigido': row['segundos_corrigidos'] is not None,
            'periodoDesde': aberto['inicio'] if aberto else None}


def atual(db, user_id):
    return db.execute("SELECT * FROM atividades WHERE user=? AND status IN ('andamento','pausada') ORDER BY inicio DESC LIMIT 1",
                      (user_id,)).fetchone()


def validar(value):
    cliente, tarefa = norm(value.get('cliente'))[:120], norm(value.get('tarefa'))[:200]
    etiquetas = list(dict.fromkeys(t for t in value.get('etiquetas') or [] if t in TAG_IDS))
    if not cliente: raise ValueError('Informe o cliente.')
    if not tarefa: raise ValueError('Informe o nome da tarefa.')
    if not etiquetas: raise ValueError('Escolha ao menos uma etiqueta.')
    return cliente, tarefa, etiquetas


def repeticao(db, cliente, tarefa):
    """A atividade original mais recente com o mesmo cliente e a mesma tarefa nas últimas 24 h (de qualquer pessoa)."""
    limite = (datetime.now(timezone.utc) - REPETICAO).isoformat()
    for row in db.execute('''SELECT atividades.*, users.name AS pessoa FROM atividades LEFT JOIN users ON users.id=atividades.user
                             WHERE inicio>=? ORDER BY inicio DESC''', (limite,)):
        if chave(row['cliente']) == chave(cliente) and chave(row['tarefa']) == chave(tarefa):
            return {'id': row['alteracao_de'] or row['id'], 'cliente': row['cliente'], 'tarefa': row['tarefa'],
                    'inicio': row['inicio'], 'pessoa': row['pessoa']}
    return None


def grafia(db, cliente, tarefa):
    """Reaproveita a grafia já usada ("vantagem supermercado" vira "Vantagem Supermercado"), para o relatório não duplicar."""
    rows = db.execute('SELECT cliente, tarefa FROM atividades ORDER BY inicio').fetchall()
    cliente = next((r['cliente'] for r in rows if chave(r['cliente']) == chave(cliente)), cliente)
    tarefa = next((r['tarefa'] for r in rows if chave(r['cliente']) == chave(cliente) and chave(r['tarefa']) == chave(tarefa)), tarefa)
    return cliente, tarefa


def api(method, path, value, query, user):
    """Rotas do colaborador: /api/atividades/*. `user` já é alguém que registra tempo."""
    init()
    with connect() as db:
        aberta = atual(db, user['id'])
        if path == '/api/atividades/atual':
            return {'atividade': publica(db, aberta), 'etiquetas': TAGS, 'agora': now()}
        if path == '/api/atividades/sugestoes':
            rows = db.execute('SELECT cliente, tarefa, MAX(inicio) AS ultimo FROM atividades GROUP BY cliente, tarefa ORDER BY ultimo DESC LIMIT 400').fetchall()
            clientes = list(dict.fromkeys(r['cliente'] for r in rows))
            return {'clientes': clientes[:200], 'tarefas': [{'cliente': r['cliente'], 'tarefa': r['tarefa']} for r in rows]}
        if path == '/api/atividades/minhas':
            mes = query.get('mes', [now()[:7]])[0]
            rows = db.execute("SELECT * FROM atividades WHERE user=? AND substr(inicio,1,7)=? ORDER BY inicio DESC", (user['id'], mes)).fetchall()
            return {'atividades': [publica(db, r) for r in rows], 'etiquetas': TAGS, 'mes': mes}
        if method != 'POST': raise ValueError('Operação não encontrada.')
        agora = now()
        if path == '/api/atividades/verificar':
            cliente, tarefa = norm(value.get('cliente')), norm(value.get('tarefa'))
            return {'repeticao': repeticao(db, cliente, tarefa) if cliente and tarefa else None}
        if path == '/api/atividades/iniciar':
            if aberta: raise ValueError('Finalize a atividade em andamento antes de iniciar outra.')
            cliente, tarefa, etiquetas = validar(value)
            cliente, tarefa = grafia(db, cliente, tarefa)
            original = value.get('alteracaoDe')
            if original and not db.execute('SELECT 1 FROM atividades WHERE id=?', (original,)).fetchone(): original = None
            ident = uid()
            db.execute('INSERT INTO atividades(id,user,cliente,tarefa,etiquetas,status,alteracao_de,inicio) VALUES(?,?,?,?,?,?,?,?)',
                       (ident, user['id'], cliente, tarefa, json.dumps(etiquetas), 'andamento', original, agora))
            db.execute('INSERT INTO atividade_periodos(atividade,inicio) VALUES(?,?)', (ident, agora))
            return {'atividade': publica(db, db.execute('SELECT * FROM atividades WHERE id=?', (ident,)).fetchone())}
        if path in ('/api/atividades/pausar', '/api/atividades/retomar', '/api/atividades/finalizar'):
            if not aberta: raise ValueError('Nenhuma atividade em andamento.')
            ident = aberta['id']
            if path.endswith('retomar'):
                if aberta['status'] == 'pausada':
                    db.execute('INSERT INTO atividade_periodos(atividade,inicio) VALUES(?,?)', (ident, agora))
                    db.execute("UPDATE atividades SET status='andamento' WHERE id=?", (ident,))
            else:
                db.execute('UPDATE atividade_periodos SET fim=? WHERE atividade=? AND fim IS NULL', (agora, ident))
                if path.endswith('pausar'): db.execute("UPDATE atividades SET status='pausada' WHERE id=?", (ident,))
                else: db.execute("UPDATE atividades SET status='finalizada', fim=? WHERE id=?", (agora, ident))
            return {'atividade': publica(db, db.execute('SELECT * FROM atividades WHERE id=?', (ident,)).fetchone())}
        if path == '/api/atividades/corrigir':
            return corrigir(db, value, user, superadmin=False)
    raise ValueError('Operação não encontrada.')


def corrigir(db, value, user, superadmin):
    """Corrige o tempo de uma atividade finalizada. O colaborador corrige as próprias, no mês corrente; superadmin, qualquer uma."""
    row = db.execute('SELECT * FROM atividades WHERE id=?', (value.get('id'),)).fetchone()
    if not row: raise ValueError('Atividade não encontrada.')
    if not superadmin:
        if row['user'] != user['id']: raise ValueError('Você só corrige as suas atividades.')
        if row['inicio'][:7] != now()[:7]: raise ValueError('Atividades de meses anteriores só um superadmin corrige.')
    if row['status'] != 'finalizada': raise ValueError('Finalize a atividade antes de corrigir o tempo.')
    try: minutos = float(value.get('minutos'))
    except (TypeError, ValueError): raise ValueError('Informe o tempo em minutos.') from None
    if not 0 <= minutos <= 24 * 60: raise ValueError('Use de 0 a 1.440 minutos.')
    motivo = norm(value.get('motivo'))[:200]
    if not motivo: raise ValueError('Conte o motivo da correção.')
    antes = segundos(db, row['id'])
    db.execute('UPDATE atividades SET segundos_corrigidos=? WHERE id=?', (minutos * 60, row['id']))
    db.execute('INSERT INTO atividade_correcoes VALUES(?,?,?,?,?,?)', (row['id'], user['id'], now(), antes, minutos * 60, motivo))
    return {'atividade': publica(db, db.execute('SELECT * FROM atividades WHERE id=?', (row['id'],)).fetchone())}


def mes_valido(mes):
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', str(mes or '')): raise ValueError('Mês inválido.')
    return mes


def relatorio(mes):
    """Dados do mês: registros e totais por etiqueta, cliente, colaborador e tarefa com alterações."""
    init()
    mes = mes_valido(mes)
    nomes = {t['id']: t['name'] for t in TAGS}
    with connect() as db:
        rows = db.execute('''SELECT atividades.*, users.name AS pessoa FROM atividades LEFT JOIN users ON users.id=atividades.user
                             WHERE substr(inicio,1,7)=? ORDER BY inicio''', (mes,)).fetchall()
        correcoes = {r['atividade'] for r in db.execute('SELECT DISTINCT atividade FROM atividade_correcoes')}
        registros = []
        for r in rows:
            item = publica(db, r) | {'pessoa': r['pessoa'] or 'Usuário removido', 'alteracao': bool(r['alteracao_de']),
                                     'etiquetaNomes': [nomes[t] for t in json.loads(r['etiquetas']) if t in nomes],
                                     'temCorrecao': r['id'] in correcoes}
            registros.append(item)
    def soma(chaves):
        # agrupa sem diferenciar maiúsculas/espaços; mostra a primeira grafia encontrada
        acc = defaultdict(lambda: {'nome': None, 'segundos': 0.0, 'atividades': 0, 'alteracoes': 0})
        for r in registros:
            for k in chaves(r):
                item = acc[chave(k)]; item['nome'] = item['nome'] or k
                item['segundos'] += r['segundos']; item['atividades'] += 1; item['alteracoes'] += r['alteracao']
        return sorted(acc.values(), key=lambda x: -x['segundos'])
    por_tarefa = soma(lambda r: [f"{r['cliente']} — {r['tarefa']}"])
    return {
        'mes': mes, 'registros': registros,
        'totais': {'segundos': sum(r['segundos'] for r in registros), 'atividades': len(registros),
                   'alteracoes': sum(r['alteracao'] for r in registros), 'clientes': len({chave(r['cliente']) for r in registros}),
                   'emAndamento': sum(r['status'] != 'finalizada' for r in registros)},
        'porEtiqueta': [x | {'cor': next(t['color'] for t in TAGS if t['name'] == x['nome'])} for x in soma(lambda r: r['etiquetaNomes'])],
        'porCliente': soma(lambda r: [r['cliente']]),
        'porPessoa': soma(lambda r: [r['pessoa']]),
        'alteracoesPorTarefa': [x for x in sorted(por_tarefa, key=lambda x: -x['alteracoes']) if x['alteracoes']],
    }
