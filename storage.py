import contextvars
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('INDOOR_DATA', ROOT / 'dados')).resolve()

# usuário logado da requisição (None no modo local, sem login): grava e filtra o dono dos registros
USUARIO = contextvars.ContextVar('usuario', default=None)

def owner(): return (USUARIO.get() or {}).get('id')

# ferramenta da requisição (ofertas, ms6, eap), definida pelo caminho em server.app; eventos do editor usam o tipo da edição
FERRAMENTA = contextvars.ContextVar('ferramenta', default=None)
EDITOR = {'image': 'images', 'video': 'video', None: 'images'}

def now(): return datetime.now(timezone.utc).isoformat()
def uid(): return uuid.uuid4().hex

@contextmanager
def connect():
    db = sqlite3.connect(DATA / 'historico.sqlite', timeout=30)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()

def init():
    (DATA / 'logos').mkdir(parents=True, exist_ok=True)
    (DATA / 'midias').mkdir(parents=True, exist_ok=True)
    (DATA / 'vetores').mkdir(parents=True, exist_ok=True)
    (DATA / 'eap').mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, title TEXT, updated TEXT, revision INTEGER DEFAULT 0, meta TEXT DEFAULT '{}');
        CREATE TABLE IF NOT EXISTS logos (id TEXT PRIMARY KEY, job TEXT, width INTEGER, height INTEGER);
        CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, job TEXT, name TEXT, page INTEGER, width INTEGER, height INTEGER, color TEXT, settings TEXT, notes TEXT);
        CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT, time TEXT, action TEXT, detail TEXT);
        CREATE TABLE IF NOT EXISTS exports (path TEXT PRIMARY KEY, digest TEXT, media TEXT);
        CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, job TEXT, revision INTEGER, payload TEXT, created REAL);
        ''')
        if 'hidden' not in {r[1] for r in db.execute('PRAGMA table_info(events)')}:
            db.execute('ALTER TABLE events ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0')
        columns = {r[1] for r in db.execute('PRAGMA table_info(media)')}
        for name, definition in [('kind', "TEXT NOT NULL DEFAULT 'image'"),
                                 ('duration', 'REAL'), ('has_audio', 'INTEGER NOT NULL DEFAULT 0'),
                                 ('original_bytes', 'INTEGER'), ('fps', 'REAL'),
                                 ('waveform', "TEXT NOT NULL DEFAULT '[]'")]:
            if name not in columns:
                db.execute(f'ALTER TABLE media ADD COLUMN {name} {definition}')
        if 'role' not in columns:
            db.execute("ALTER TABLE media ADD COLUMN role TEXT NOT NULL DEFAULT 'media'")
        for table in ('jobs', 'events'):
            if 'owner' not in {r[1] for r in db.execute(f'PRAGMA table_info({table})')}:
                db.execute(f'ALTER TABLE {table} ADD COLUMN owner TEXT')
        # relatórios: quem fez o quê, em qual ferramenta e quando. "Apagar" no Histórico só esconde (hidden=1); o registro fica
        if 'module' not in {r[1] for r in db.execute('PRAGMA table_info(events)')}:
            db.execute('ALTER TABLE events ADD COLUMN module TEXT')
            db.execute("""UPDATE events SET module=CASE COALESCE((SELECT json_extract(meta,'$.editorKind') FROM jobs WHERE jobs.id=events.job),'image')
                          WHEN 'video' THEN 'video' ELSE 'images' END WHERE job IS NOT NULL""")
            db.execute("UPDATE events SET module='offers' WHERE job IS NULL AND json_extract(detail,'$.módulo') IS NOT NULL")
            db.execute("UPDATE events SET module='ms6' WHERE job IS NULL AND action IN ('Logo para vetorização','DXF exportado','Falha na exportação DXF')")
            db.execute("UPDATE events SET module='eap' WHERE job IS NULL AND action IN ('Logo EAP recebida','Logo EAP exportada','Falha na exportação da logo EAP')")
        db.execute('CREATE INDEX IF NOT EXISTS events_owner_time ON events(owner, time)')

def event(db, job, action, detail, dono=None, module=None):
    if not module and job:
        row = db.execute("SELECT json_extract(meta,'$.editorKind') FROM jobs WHERE id=?", (job,)).fetchone()
        module = EDITOR.get(row[0], 'images') if row else None
    db.execute('INSERT INTO events(job,time,action,detail,owner,module) VALUES(?,?,?,?,?,?)',
               (job, now(), action, json.dumps(detail, ensure_ascii=False), dono or owner(), module or FERRAMENTA.get()))

def mine(db, table, ident):
    """Recusa registro de outro usuário como se não existisse. Sem login (modo local), tudo é de todos."""
    if owner() and not db.execute(f'SELECT 1 FROM {table} WHERE id=? AND owner=?', (ident, owner())).fetchone():
        raise ValueError('Não encontrado.')

def get_job(job):
    with connect() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=?', (job,)).fetchone()
        if not row: raise ValueError('Trabalho não encontrado.')
        result = dict(row)
        result['meta'] = json.loads(result['meta'])
        result['logos'] = [dict(r) for r in db.execute('SELECT * FROM logos WHERE job=?', (job,))]
        result['media'] = []
        for m in db.execute('SELECT * FROM media WHERE job=? ORDER BY rowid', (job,)):
            item = dict(m)
            for key in ('settings', 'notes', 'waveform'): item[key] = json.loads(item[key])
            result['media'].append(item)
        order = {ident: n for n, ident in enumerate(result['meta'].get('mediaOrder', []))}
        result['media'].sort(key=lambda m: order.get(m['id'], len(order)))
        return result
