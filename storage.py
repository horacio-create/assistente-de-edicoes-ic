import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('INDOOR_DATA', ROOT / 'dados')).resolve()

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

def event(db, job, action, detail):
    db.execute('INSERT INTO events(job,time,action,detail) VALUES(?,?,?,?)', (job, now(), action, json.dumps(detail, ensure_ascii=False)))

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
