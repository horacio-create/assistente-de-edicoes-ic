"""Servidor WSGI local. Novos módulos registram processadores sem alterar o histórico."""
import hashlib
import io
import json
import mimetypes
import os
import re
import socket
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from waitress import serve
from version import VERSION
from modules.images import DEFAULT, SUPPORTED, decode, dominant, encoded, render, settings
from modules import videos, audio, composition, naming, export_progress, projects
from modules import eap, vector
from PIL import Image
from storage import DATA, ROOT, connect, event, get_job, init, now, uid

LOCK = threading.RLock()
PROCESS = threading.Semaphore(2)
PICKER = threading.Lock()
MAX_UPLOAD = 100 * 1024 * 1024

def local_hosts():
    names = {'localhost', '127.0.0.1', '::1', socket.gethostname().lower(), socket.getfqdn().lower()}
    for name in tuple(names):
        try: names.update(address[4][0].lower() for address in socket.getaddrinfo(name, None))
        except socket.gaierror: pass
    if sys.platform == 'darwin':
        # Colegas acessam o Mac pelo nome Bonjour (NOME.local), que difere do hostname.
        names.add(socket.gethostname().lower().removesuffix('.local') + '.local')
        try: names.add(subprocess.run(['scutil', '--get', 'LocalHostName'], capture_output=True, text=True, timeout=5).stdout.strip().lower() + '.local')
        except (OSError, subprocess.SubprocessError): pass
    return frozenset(names)

ALLOWED_HOSTS = local_hosts()

def validate_host(host):
    try:
        parsed = urlsplit('//' + (host or ''))
        port = parsed.port
        if (parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment
                or (port is not None and not 1 <= port <= 65535)):
            raise ValueError()
    except ValueError:
        raise ValueError('Host não autorizado.') from None
MODULES = [{'id': 'images', 'name': 'Imagens', 'active': True}, {'id': 'video', 'name': 'Vídeos', 'active': True}, {'id': 'offers', 'name': 'Ofertas de supermercados', 'active': False}, {'id': 'eap', 'name': 'Logo EAP', 'active': True}, {'id': 'ms6', 'name': 'Vetorização MS6', 'active': True}]

class Conflict(Exception): pass

@contextmanager
def export_slot(cancelled):
    while not PROCESS.acquire(timeout=.1):
        if cancelled(): raise videos.ExportCancelled('Exportação cancelada.')
    try:
        if cancelled(): raise videos.ExportCancelled('Exportação cancelada.')
        yield
    finally:
        PROCESS.release()

def name_first_import(db, job, suggestion, added=1):
    row = db.execute('SELECT title,meta FROM jobs WHERE id=?', (job,)).fetchone()
    meta = json.loads(row['meta'])
    count = db.execute('SELECT count(*) FROM media WHERE job=?', (job,)).fetchone()[0]
    if suggestion and count == added and row['title'] == 'Nova edição' and meta.get('titleOrigin') != 'manual':
        meta.update(titleOrigin=suggestion['origin'], titleSuggestion=suggestion['title'])
        db.execute('UPDATE jobs SET title=?,meta=? WHERE id=?', (suggestion['title'], json.dumps(meta), job))

def import_video(job, name, revision, raw):
    with LOCK, connect() as db:
        check_revision(db, job, revision)
        first = not db.execute('SELECT 1 FROM media WHERE job=? LIMIT 1', (job,)).fetchone()
    ident = uid()
    source, proxy, poster = (DATA / 'midias' / (ident + ext) for ext in ('.source', '.mp4', '.png'))
    try:
        source.write_bytes(raw)
        with PROCESS:
            info, image = videos.import_video(source, proxy, poster)
        color = dominant(image)
        value = videos.settings(DEFAULT | videos.DEFAULT_VIDEO | {'color': color, 'trimEnd': info['duration']}, info['duration'])
        suggestion = naming.suggest(name, poster, source, info['duration']) if first else None
        with LOCK, connect() as db:
            check_revision(db, job, revision)
            db.execute('INSERT INTO media(id,job,name,page,width,height,color,settings,notes,kind,duration,has_audio,original_bytes,fps) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (ident, job, name, None, info['width'], info['height'], color, json.dumps(value), '[]',
                        'video', info['duration'], info['hasAudio'], len(raw), info['fps']))
            name_first_import(db, job, suggestion)
            db.execute('UPDATE jobs SET updated=?, revision=revision+1 WHERE id=?', (now(), job))
            event(db, job, 'Vídeo importado', {'arquivo': name, **info})
        return {'job': get_job(job)}
    except Exception:
        for path in (source, proxy, poster): path.unlink(missing_ok=True)
        raise

def import_audio(job, name, revision, raw):
    with LOCK, connect() as db:
        check_revision(db, job, revision)
        row = db.execute('SELECT meta FROM jobs WHERE id=?', (job,)).fetchone()
        if json.loads(row['meta']).get('editorKind') != 'video':
            raise ValueError('Importe áudio na seção Vídeos.')
    ident = uid()
    source, proxy, poster = (DATA / 'midias' / (ident + ext) for ext in ('.source', '.m4a', '.png'))
    try:
        source.write_bytes(raw)
        with PROCESS:
            info, peaks = audio.import_audio(source, proxy, poster)
        value = settings(DEFAULT | {'color': '#6a67ce'})
        with LOCK, connect() as db:
            check_revision(db, job, revision)
            db.execute('INSERT INTO media(id,job,name,page,width,height,color,settings,notes,kind,duration,has_audio,original_bytes,waveform) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (ident, job, name, None, 400, 100, '#6a67ce', json.dumps(value), '[]',
                        'audio', info['duration'], True, len(raw), json.dumps(peaks)))
            name_first_import(db, job, {'title': naming.filename_title(name), 'origin': 'filename'})
            db.execute('UPDATE jobs SET updated=?, revision=revision+1 WHERE id=?', (now(), job))
            event(db, job, 'Áudio importado', {'arquivo': name, **info})
        return {'job': get_job(job)}
    except Exception:
        for path in (source, proxy, poster): path.unlink(missing_ok=True)
        raise


def digest(path):
    if not path.is_file(): return None
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def publish_new(temp, dest):
    """Publish a complete file, atomically and without replacing a late arrival."""
    try:
        os.link(temp, dest)
    except FileExistsError:
        raise
    except OSError:
        # Windows rename refuses an existing destination, including on volumes
        # without hard links. POSIX rename replaces files, so fail safely there.
        if os.name != 'nt': raise
        os.rename(temp, dest)
    else:
        temp.unlink()

def clean(value):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', str(value)).strip(' .')
    if not value or len(value) > 90: raise ValueError('Preencha nomes com até 90 caracteres.')
    if value.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))}:
        raise ValueError('Esse nome é reservado pelo Windows. Escolha outro.')
    return value

def directory(value):
    p = Path(value).expanduser()
    if not p.is_absolute() or not p.is_dir(): raise ValueError('Escolha uma pasta existente acessível pelo PC que hospeda a aplicação.')
    p = p.resolve()
    if p == ROOT or ROOT in p.parents or p == DATA or DATA in p.parents:
        raise ValueError('Escolha uma pasta de saída fora da pasta da aplicação.')
    return p

def check_revision(db, job, revision):
    row = db.execute('SELECT revision FROM jobs WHERE id=?', (job,)).fetchone()
    if not row or row['revision'] != revision: raise Conflict('Este trabalho mudou em outra janela. Reabra-o em Trabalhos recentes antes de continuar.')

def logo_path(value, job):
    ident = value.get('logoId')
    if not ident: return None
    if not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f]{32}', ident): raise ValueError('Logo inválida.')
    with connect() as db:
        row = db.execute('SELECT id FROM logos WHERE id=? AND job=?', (ident, job)).fetchone()
    if not row: raise ValueError('Logo não pertence a esta edição.')
    return DATA / 'logos' / (ident + '.png')

def api(method, path, query, raw, environ=None):
    value = json.loads(raw) if raw and path not in ('/api/upload', '/api/logo', '/api/vector/upload', '/api/eap/upload') else {}
    if path == '/api/info':
        return dict(host=socket.gethostname(), modules=MODULES, videoReady=videos.available(), defaultFolder=str(Path.home() / 'Pictures'), version=VERSION, portable=bool(os.environ.get('INDOOR_PORTABLE')), nativePicker=(os.name == 'nt' or sys.platform == 'darwin') and (environ or {}).get('REMOTE_ADDR') in ('127.0.0.1','::1'))
    if path == '/api/jobs' and method == 'GET':
        with connect() as db: return [dict(r) for r in db.execute('SELECT id,title,updated,revision,(SELECT count(*) FROM media WHERE job=jobs.id) AS count FROM jobs ORDER BY updated DESC LIMIT 100')]
    if path == '/api/jobs' and method == 'POST':
        ident = uid()
        with connect() as db:
            kind = value.get('kind', 'image')
            if kind not in ('image', 'video'): raise ValueError('Tipo de edição inválido.')
            db.execute('INSERT INTO jobs(id,title,updated,meta) VALUES(?,?,?,?)', (ident, 'Nova edição', now(), json.dumps({'editorKind': kind})))
            event(db, ident, 'Trabalho criado', {})
        return get_job(ident)
    if path == '/api/job' and method == 'GET': return get_job(query['id'][0])
    if path == '/api/export-progress' and method == 'GET':
        return export_progress.get(query.get('token', [''])[0]) or {'state': 'waiting', 'percent': 0, 'remaining': None}
    if path == '/api/history':
        with connect() as db:
            return [dict(r) | {'detail': json.loads(r['detail'])} for r in db.execute('SELECT events.*,jobs.title FROM events LEFT JOIN jobs ON events.job=jobs.id WHERE events.hidden=0 ORDER BY events.id DESC LIMIT 500')]
    if method != 'POST': raise ValueError('Operação não encontrada.')
    if path == '/api/export-cancel':
        token = value.get('token', '')
        if export_progress.cancel(token): return {'accepted': True}
        with LOCK, connect() as db:
            pending = db.execute('SELECT 1 FROM plans WHERE id=? AND created>?', (token, time.time()-3600)).fetchone()
            return {'accepted': export_progress.cancel(token, pending=bool(pending))}
    if path == '/api/rename':
        title = value.get('title')
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 90 or re.search(r'[\x00-\x1f]', title):
            raise ValueError('Escreva um nome com até 90 caracteres.')
        with LOCK, connect() as db:
            check_revision(db, value['id'], value['revision'])
            row = db.execute('SELECT meta FROM jobs WHERE id=?', (value['id'],)).fetchone()
            meta = json.loads(row['meta']);meta['titleOrigin'] = 'manual'
            db.execute('UPDATE jobs SET title=?,meta=?,updated=?,revision=revision+1 WHERE id=?',
                       (title.strip(), json.dumps(meta), now(), value['id']))
            event(db, value['id'], 'Edição renomeada', {'nome': title.strip()})
        return get_job(value['id'])
    if path in ('/api/history-delete', '/api/history-restore'):
        with LOCK, connect() as db:
            restore = path.endswith('restore')
            if value.get('all') and not restore:
                ids = [r['id'] for r in db.execute('SELECT id FROM events WHERE hidden=0')]
            else:
                ids = list({int(i) for i in value.get('ids', [])})
            db.executemany('UPDATE events SET hidden=? WHERE id=?', [(0 if restore else 1, i) for i in ids])
        return {'ids': ids, 'count':len(ids)}
    if path == '/api/pick-folder':
        if (environ or {}).get('REMOTE_ADDR') not in ('127.0.0.1', '::1'):
            raise ValueError('Abra pelo localhost no PC anfitrião para usar a janela nativa. Pela rede, informe uma pasta compartilhada acessível pelo anfitrião.')
        if not PICKER.acquire(blocking=False): raise Conflict('Já existe uma janela de seleção de pasta aberta.')
        try:
            result = subprocess.run([sys.executable, str(ROOT / 'modules' / 'native_folder.py')], capture_output=True, timeout=180, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.returncode: raise ValueError('Não foi possível abrir o seletor de pastas do sistema.')
            chosen = json.loads(result.stdout.decode('utf-8'))
            if chosen.get('error'): raise ValueError(chosen['error'])
            return {'path': str(directory(chosen['path'])) if chosen.get('path') else None}
        except subprocess.TimeoutExpired:
            raise ValueError('A seleção de pasta expirou. Clique em Exportar para tentar novamente.')
        finally: PICKER.release()
    if path == '/api/logo':
        job, revision = query['job'][0], int(query['revision'][0])
        as_clip = query.get('composition', ['0'])[0] == '1'
        ext = Path(query['name'][0]).suffix.lower()
        if ext not in SUPPORTED - {'.pdf'}: raise ValueError('Use uma imagem para a logo, preferencialmente PNG transparente.')
        with LOCK:
            with connect() as db:
                check_revision(db, job, revision)
                meta = json.loads(db.execute('SELECT meta FROM jobs WHERE id=?', (job,)).fetchone()['meta'])
                if as_clip and meta.get('editorKind') != 'video': raise ValueError('Faixas de logo estão disponíveis na edição de vídeos.')
            with PROCESS:
                from PIL import Image
                try:
                    decoded = subprocess.run([sys.executable, str(ROOT/'modules'/'logo_decode.py')], input=raw, capture_output=True, timeout=90, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                except subprocess.TimeoutExpired:
                    raise ValueError('Esta logo levou muito tempo para abrir. Tente uma cópia com menor resolução.')
                if decoded.returncode: raise ValueError(decoded.stderr.decode('utf-8', errors='replace'))
                im = Image.open(io.BytesIO(decoded.stdout)).convert('RGBA')
                ident = uid()
                im.save(DATA / 'logos' / (ident + '.png'))
                if as_clip: im.save(DATA / 'midias' / (ident + '.png'))
            with connect() as db:
                db.execute('INSERT INTO logos VALUES(?,?,?,?)', (ident, job, im.width, im.height))
                if as_clip:
                    output = meta.get('composition', {}).get('settings', {})
                    w, h = output.get('width', 1280), output.get('height', 720)
                    fit = min(w/im.width, h/im.height)
                    factor = min(w*.12/im.width, h*.8/im.height)
                    zoom = max(.1, min(5, factor/fit));rw, rh = im.width*fit*zoom, im.height*fit*zoom
                    adjusted = settings(DEFAULT | {'width': w, 'height': h, 'zoom': zoom,
                                                  'x': (w-rw)*.47/w, 'y': -(h-rh)*.47/h})
                    name = Path(query['name'][0]).name[:180]
                    db.execute('INSERT INTO media(id,job,name,page,width,height,color,settings,notes,role) VALUES(?,?,?,?,?,?,?,?,?,?)',
                               (ident, job, name, None, im.width, im.height, DEFAULT['color'], json.dumps(adjusted), '[]', 'logo'))
                db.execute('UPDATE jobs SET updated=?, revision=revision+1 WHERE id=?', (now(), job))
                event(db, job, 'Logo adicionada', {'logo': ident})
        return {'job': get_job(job), 'logoId': ident, 'mediaId': ident if as_clip else None}
    if path == '/api/upload':
        job, name = query['job'][0], query['name'][0]
        revision = int(query['revision'][0])
        name = name.replace('\\', '/').split('/')[-1][:180]
        ext = Path(name).suffix.lower()
        if ext in videos.SUPPORTED:
            return import_video(job, name, revision, raw)
        if ext in audio.SUPPORTED:
            return import_audio(job, name, revision, raw)
        with LOCK:
            with connect() as db:
                check_revision(db, job, revision)
                first = not db.execute('SELECT 1 FROM media WHERE job=? LIMIT 1', (job,)).fetchone()
            if ext not in SUPPORTED:
                with connect() as db: event(db, job, 'Formato não suportado', {'arquivo': name})
                return {'unsupported': name, 'job': get_job(job)}
            added = []
            try:
                with PROCESS:
                    for page, im, notes in decode(raw, ext):
                        ident = uid()
                        color = dominant(im)
                        im.save(DATA / 'midias' / f'{ident}.png')
                        added.append((ident, job, name, page, im.width, im.height, color, json.dumps(DEFAULT | {'color': color}), json.dumps(notes)))
                suggestion = naming.suggest(name, DATA / 'midias' / f'{added[0][0]}.png') if first and added else None
                with connect() as db:
                    db.executemany('INSERT INTO media(id,job,name,page,width,height,color,settings,notes) VALUES(?,?,?,?,?,?,?,?,?)', added)
                    name_first_import(db, job, suggestion, len(added))
                    db.execute('UPDATE jobs SET updated=?, revision=revision+1 WHERE id=?', (now(), job))
                    event(db, job, 'Importação', {'arquivo': name, 'midias': len(added)})
            except Exception as exc:
                for row in added: (DATA / 'midias' / f'{row[0]}.png').unlink(missing_ok=True)
                with connect() as db: event(db, job, 'Falha na importação', {'arquivo': name, 'motivo': str(exc)})
                raise ValueError(f'Não foi possível abrir {name}: {exc}') from exc
        return {'job': get_job(job)}
    if path == '/api/save':
        job = value['id']
        with LOCK, connect() as db:
            check_revision(db, job, value['revision'])
            for m in value['media']:
                original = db.execute('SELECT kind,duration FROM media WHERE id=? AND job=?', (m['id'], job)).fetchone()
                if not original: raise ValueError('Mídia não pertence a esta edição.')
                logo_path(m['settings'], job)
                adjusted = videos.settings(m['settings'], original['duration']) if original['kind'] == 'video' else settings(m['settings'])
                db.execute('UPDATE media SET settings=? WHERE id=? AND job=?', (json.dumps(adjusted), m['id'], job))
            order = [m['id'] for m in value['media']]
            known = {r['id'] for r in db.execute('SELECT id FROM media WHERE job=?', (job,))}
            if len(order) != len(set(order)) or set(order) != known:
                raise ValueError('A ordem precisa incluir cada imagem desta edição uma única vez.')
            meta = dict(value.get('meta', {})) | {'mediaOrder': order}
            if any(key in meta for key in ('composition', 'timelines', 'exportQueue')):
                rows = [dict(r) for r in db.execute('SELECT * FROM media WHERE job=?', (job,))]
                for m in rows: m['settings'] = json.loads(m['settings'])
                meta = projects.validate(meta, rows, lambda s: logo_path(s, job))
            db.execute('UPDATE jobs SET title=?,meta=?,updated=?,revision=revision+1 WHERE id=?', (str(value.get('title', 'Nova edição'))[:180], json.dumps(meta), now(), job))
            event(db, job, 'Ajustes salvos', {'midias': len(value['media'])})
        return get_job(job)
    if path == '/api/preview':
        with connect() as db: row = db.execute('SELECT * FROM media WHERE id=?', (value['id'],)).fetchone()
        if not row: raise ValueError('Mídia não encontrada.')
        with PROCESS:
            logo = logo_path(value['settings'], row['job'])
            if row['kind'] == 'video':
                im, notes = videos.preview(DATA / 'midias' / f"{row['id']}.source", value['settings'], row['duration'], logo, value.get('time'))
            else:
                im, notes = render(DATA / 'midias' / f"{row['id']}.png", value['settings'], logo)
        import base64
        im.thumbnail((1280,1280))
        return {'image': 'data:image/jpeg;base64,' + base64.b64encode(encoded(im, 'jpg')).decode(), 'notes': notes}
    if path == '/api/plan':
        job = get_job(value['job'])
        folder = directory(value['folder'])
        fmt = value['format']
        if fmt not in ('jpg', 'png', 'mp4'): raise ValueError('Formato inválido.')
        if value.get('queue'):
            if fmt != 'mp4': raise ValueError('Exporte a fila em MP4.')
            meta = projects.validate(job['meta'], job['media'], lambda s: logo_path(s, job['id']))
            media = [dict(id=item['id'], queueId=item['id'], number=item['number'], kind='composition',
                          settings=item['composition'], sources=job['media']) for item in meta.get('exportQueue', [])]
            if not media: raise ValueError('Adicione ao menos uma timeline à fila.')
        elif value.get('composition'):
            if fmt != 'mp4': raise ValueError('Exporte a montagem em MP4.')
            project = composition.validate(job['meta'].get('composition'), job['media'])
            composition.check_coverage(project)
            for clip in project['clips']: logo_path(clip['settings'], job['id'])
            media = [dict(id=job['id'], kind='composition', settings=project, sources=job['media'])]
        else:
            ids = value['ids']
            media = [m for m in job['media'] if m['id'] in ids]
        if not media: raise ValueError('Selecione ao menos uma mídia.')
        if any(m['kind'] == 'audio' for m in media):
            raise ValueError('Adicione o áudio à timeline e exporte a montagem em MP4.')
        if any((m['kind'] in ('video','composition')) != (fmt == 'mp4') for m in media):
            raise ValueError('Exporte vídeos em MP4 e imagens em JPG ou PNG, em lotes separados.')
        template = value.get('template')
        if template is not None:
            template = clean(template)
        else:
            client, campaign, date = (clean(value[k]) for k in ('client', 'campaign', 'date'))
        files = []
        names = value.get('names', [])
        for i, m in enumerate(media):
            number = (' '+str(m['number']).zfill(2)) if value.get('queue') else (' '+str(i+1) if len(media)>1 else '')
            if names: name = clean(names[i])
            elif template is not None:
                base = re.sub(r'^VT\s*\d*\s*-\s*', '', template, flags=re.IGNORECASE)
                name = clean(f"VT{number} - {base}")
            else: name = f"VT{number} - {client} - {campaign} {date}"
            dest = folder / (name + '.' + fmt)
            existing = digest(dest)
            if dest.exists():
                with connect() as db: known = db.execute('SELECT digest FROM exports WHERE path=?', (str(dest).casefold(),)).fetchone()
                if not known or known['digest'] != existing:
                    raise Conflict(f'O arquivo {dest.name} já existe e não é uma exportação intacta desta aplicação. Altere o nome para preservar o original.')
            files.append({'id': m['id'], 'name': dest.name, 'path': str(dest), 'existing': existing, 'settings': m['settings'], 'kind': m['kind']})
            if m['kind'] == 'composition': files[-1]['sources'] = m['sources']
            if m.get('queueId'): files[-1]['queueId'] = m['queueId']
        if len({f['path'].casefold() for f in files}) != len(files): raise ValueError('Os nomes do lote precisam ser diferentes.')
        plan = {'files': files, 'format': fmt}
        token = uid()
        with connect() as db:
            db.execute('INSERT INTO plans VALUES(?,?,?,?,?)', (token, job['id'], job['revision'], json.dumps(plan), time.time()))
            db.execute('DELETE FROM plans WHERE created<?', (time.time()-3600,))
        return {'token': token, **plan}
    if path == '/api/export':
        with LOCK, connect() as db:
            row = db.execute('SELECT * FROM plans WHERE id=?', (value['token'],)).fetchone()
            if not row or time.time()-row['created'] > 3600: raise ValueError('Confirmação expirada. Revise os nomes novamente.')
            check_revision(db, row['job'], row['revision'])
            plan = json.loads(row['payload'])
            if any(f['existing'] for f in plan['files']) and not value.get('overwrite'):
                raise Conflict('Confirme a substituição das exportações existentes.')
            for f in plan['files']:
                if digest(Path(f['path'])) != f['existing']: raise Conflict('A pasta mudou depois da revisão. Revise os nomes novamente.')
            db.execute('DELETE FROM plans WHERE id=?', (value['token'],))
            event(db, row['job'], 'Exportação iniciada', {'arquivos': [f['path'] for f in plan['files']]})
            db.commit()
        export_progress.start(value['token'], plan['files'][0]['name'])
        cancelled = lambda: export_progress.is_cancelled(value['token'])
        results = []
        was_cancelled = False
        for index, f in enumerate(plan['files']):
            if cancelled():
                was_cancelled = True
                break
            def progress(fraction, retry=0):
                export_progress.update(value['token'], (index+fraction*.97)/len(plan['files']), f['name'], retry,
                                       f"Arquivo {index+1} de {len(plan['files'])}" if len(plan['files']) > 1 else '')
            progress(0)
            dest = Path(f['path'])
            temp = dest.parent / ('.indoor-' + uid() + '.tmp')
            try:
                with export_slot(cancelled):
                    logo = logo_path(f['settings'], row['job'])
                    if f.get('kind') == 'composition':
                        report = composition.export(f['sources'], DATA / 'midias', temp, f['settings'],
                                                    lambda s: logo_path(s, row['job']), progress=progress, cancelled=cancelled)
                        notes, data = report['notes'], None
                        dims = [report['width'], report['height']]
                    elif f.get('kind') == 'video':
                        report = videos.export(DATA / 'midias' / f"{f['id']}.source", temp, f['settings'], logo, progress=progress, cancelled=cancelled)
                        notes = report['notes']
                        data = None
                        dims = [report['width'], report['height']]
                    else:
                        im, notes = render(DATA / 'midias' / f"{f['id']}.png", f['settings'], logo)
                        data = encoded(im, plan['format'])
                        dims = [im.width, im.height]
                if cancelled(): raise videos.ExportCancelled('Exportação cancelada.')
                with LOCK, connect() as validation_db:
                    check_revision(validation_db, row['job'], row['revision'])
                if data is not None:
                    with temp.open('xb') as out:
                        out.write(data)
                        out.flush()
                        os.fsync(out.fileno())
                if f['existing']:
                    if digest(dest) != f['existing']: raise Conflict('O arquivo mudou durante o processamento; não foi substituído.')
                    os.replace(temp, dest)
                else:
                    publish_new(temp, dest)
                with LOCK, connect() as db:
                    db.execute('INSERT OR REPLACE INTO exports VALUES(?,?,?)', (str(dest).casefold(), digest(dest), f['id']))
                    detail = dict(arquivo=str(dest), bytes=dest.stat().st_size, dimensoes=dims, ajustes=f['settings'], avisos=notes)
                    event(db, row['job'], 'Exportado', detail)
                results.append({'name': dest.name, 'ok': True, **({'queueId': f['queueId']} if f.get('queueId') else {})})
            except videos.ExportCancelled:
                was_cancelled = True
                break
            except Exception as exc:
                with LOCK, connect() as db:
                    event(db, row['job'], 'Falha na exportação', {'arquivo': str(dest), 'motivo': str(exc)})
                results.append({'name': dest.name, 'ok': False, 'error': str(exc)})
            finally:
                temp.unlink(missing_ok=True)
            export_progress.update(value['token'], (index+1)/len(plan['files']), f['name'])
        export_progress.finish(value['token'], all(result['ok'] for result in results), was_cancelled)
        if was_cancelled:
            with LOCK, connect() as db:
                event(db, row['job'], 'Exportação cancelada', {'concluidos': len(results)})
        response = {'results': results, 'cancelled': was_cancelled}
        if any(f.get('queueId') for f in plan['files']):
            completed = {result['queueId'] for result in results if result.get('queueId') and result['ok']}
            with LOCK, connect() as db:
                current = db.execute('SELECT meta,revision FROM jobs WHERE id=?', (row['job'],)).fetchone()
                if completed and current['revision'] == row['revision']:
                    meta = json.loads(current['meta'])
                    meta['exportQueue'] = [item for item in meta.get('exportQueue', []) if item['id'] not in completed]
                    db.execute('UPDATE jobs SET meta=?,updated=?,revision=revision+1 WHERE id=?', (json.dumps(meta), now(), row['job']))
                    event(db, row['job'], 'Fila atualizada', {'concluidos': len(completed)})
            response['job'] = get_job(row['job'])
        return response
    if path.startswith('/api/vector/'):
        return vector_api(path, query, value, raw)
    if path.startswith('/api/eap/'):
        return eap_api(path, query, value, raw)
    raise ValueError('Operação não encontrada.')

def stored(folder, ident):
    if not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f]{32}', ident): raise ValueError('Logo inválida.')
    source = DATA / folder / (ident + '.png')
    if not source.is_file(): raise ValueError('Logo não encontrada. Adicione-a novamente.')
    with Image.open(source) as im: return im.convert('RGBA')

def receive_logo(folder, query, raw, supported, action):
    """Normaliza a logo enviada em PNG na pasta interna do módulo."""
    name = query['name'][0].replace('\\', '/').split('/')[-1][:180]
    ext = Path(name).suffix.lower()
    if ext not in supported: raise ValueError('Formato não suportado. Use PNG, JPG, WebP, BMP, TIFF, PDF, AI ou SVG.')
    with PROCESS:
        try: im = vector.load(raw, ext)
        except ValueError: raise
        except Exception as exc: raise ValueError(f'Não foi possível abrir {name}.') from exc
        ident = uid()
        im.save(DATA / folder / (ident + '.png'))
    with connect() as db: event(db, None, action, {'arquivo': name, 'dimensoes': [im.width, im.height]})
    return ident, name, im

def write_new(dest, data):
    """Grava um arquivo novo completo, sem nunca substituir um existente."""
    temp = dest.parent / ('.indoor-' + uid() + '.tmp')
    try:
        with temp.open('xb') as out:
            out.write(data); out.flush(); os.fsync(out.fileno())
        publish_new(temp, dest)
    except FileExistsError:
        raise Conflict(f'O arquivo {dest.name} apareceu na pasta durante o processamento. Altere o nome.') from None
    finally: temp.unlink(missing_ok=True)

def refuse_existing(paths):
    taken = [p.name for p in paths if p.exists()]
    if taken: raise Conflict(f'Já existe{"m" if len(taken) > 1 else ""} na pasta: {", ".join(taken)}. Altere o nome para preservar os arquivos existentes.')

def vector_api(path, query, value, raw):
    if path == '/api/vector/upload':
        ident, name, im = receive_logo('vetores', query, raw, vector.SUPPORTED, 'Logo para vetorização')
        return {'id': ident, 'name': name, 'width': im.width, 'height': im.height}
    if path == '/api/vector/trace':
        with PROCESS: result = vector.trace(stored('vetores', value.get('id')), value.get('settings'))
        return {k: result[k] for k in ('width', 'height', 'threshold', 'points', 'notes')} | {'contours': len(result['contours']), 'path': vector.svg_path(result['contours'])}
    if path == '/api/vector/export':
        folder, name = directory(value['folder']), clean(value['name'])
        dest = folder / (name + '.dxf')
        refuse_existing([dest])
        with PROCESS:
            result = vector.trace(stored('vetores', value.get('id')), value.get('settings'))
            data = vector.dxf(result['contours'])
        try: write_new(dest, data)
        except Exception as exc:
            with connect() as db: event(db, None, 'Falha na exportação DXF', {'arquivo': str(dest), 'motivo': str(exc)})
            raise
        with connect() as db:
            event(db, None, 'DXF exportado', {'arquivo': str(dest), 'origem': str(value.get('source', ''))[:180], 'mm': [result['width'], result['height']], 'contornos': len(result['contours']), 'ajustes': vector.settings(value.get('settings'))})
        return {'name': dest.name, 'path': str(dest), 'width': result['width'], 'height': result['height']}
    raise ValueError('Operação não encontrada.')

def eap_quality(ident):
    meta = DATA / 'eap' / (ident + '.json')
    return json.loads(meta.read_text()).get('quality') if meta.is_file() else None

def eap_api(path, query, value, raw):
    if path == '/api/eap/upload':
        ident, name, im = receive_logo('eap', query, raw, eap.SUPPORTED, 'Logo EAP recebida')
        quality = eap.jpeg_quality(raw)
        (DATA / 'eap' / (ident + '.json')).write_text(json.dumps({'name': name, 'quality': quality}))
        with PROCESS:
            cut, info = eap.matte(im, eap.settings({}))
            try: assessment = eap.assess(eap.crop_art(cut), quality, eap.DEFAULT['margin'])
            except ValueError: assessment = eap.assess(im, quality, eap.DEFAULT['margin'])
        return {'id': ident, 'name': name, 'width': im.width, 'height': im.height, 'assessment': assessment, 'flatBackground': info['flatBackground']}
    if path == '/api/eap/preview':
        import base64
        with PROCESS:
            result = eap.compose(stored('eap', value.get('id')), value.get('settings'), eap_quality(value['id']))
            previews = {}
            for key, im in result['images'].items():
                small = im.copy(); small.thumbnail((512, 512), Image.Resampling.LANCZOS)
                previews[key] = 'data:image/png;base64,' + base64.b64encode(eap.png(small)).decode()
        return {k: result[k] for k in ('assessment', 'notes', 'threshold', 'colors', 'darkShare', 'flatBackground', 'outlineColor', 'fixSeams')} | {'previews': previews, 'vector': result['svg'] is not None}
    if path == '/api/eap/export':
        folder, name = directory(value['folder']), clean(value['name'])
        versions = [v for v in eap.VERSIONS if v in value.get('versions', [])]
        s = eap.settings(value.get('settings'))
        files = [(folder / f'{name} - {eap.VERSIONS[v]}.png', v) for v in versions]
        if value.get('svg') and s['mode'] == 'vector': files.append((folder / f'{name}.svg', 'svg'))
        if not files: raise ValueError('Escolha ao menos uma versão para exportar.')
        refuse_existing([f for f, _ in files])
        with PROCESS:
            result = eap.compose(stored('eap', value.get('id')), s, eap_quality(value['id']))
            payload = [(dest, result['svg'].encode() if kind == 'svg' else eap.png(result['images'][kind])) for dest, kind in files]
        saved = []
        try:
            for dest, data in payload:
                write_new(dest, data); saved.append(dest.name)
        except Exception as exc:
            with connect() as db: event(db, None, 'Falha na exportação da logo EAP', {'arquivo': str(dest), 'salvos': saved, 'motivo': str(exc)})
            raise
        with connect() as db:
            event(db, None, 'Logo EAP exportada', {'arquivo': str(files[0][0]), 'arquivos': [str(f) for f, _ in files], 'origem': str(value.get('source', ''))[:180], 'ajustes': s})
        return {'files': saved, 'folder': str(folder)}
    raise ValueError('Operação não encontrada.')

def app(environ, start_response):
    status, content_type = '200 OK', 'application/json; charset=utf-8'
    try:
        method, path = environ['REQUEST_METHOD'], environ['PATH_INFO']
        origin, host = environ.get('HTTP_ORIGIN'), environ.get('HTTP_HOST')
        validate_host(host)
        if origin and origin not in (f'http://{host}', f'https://{host}'):
            raise ValueError('Origem não autorizada.')
        if environ.get('HTTP_SEC_FETCH_SITE') == 'cross-site': raise ValueError('Origem não autorizada.')
        if path.startswith('/api/'):
            if method == 'POST' and environ.get('HTTP_X_INDOOR') != '1': raise ValueError('Requisição inválida.')
            length = int(environ.get('CONTENT_LENGTH') or 0)
            if length > MAX_UPLOAD: raise ValueError('Limite de 100 MB por arquivo.')
            body = environ['wsgi.input'].read(length)
            result = api(method, path, parse_qs(environ.get('QUERY_STRING', '')), body, environ)
            data = json.dumps(result, ensure_ascii=False).encode()
        elif path.startswith(('/video/', '/audio/')):
            ident = path.split('/')[-1]
            if not re.fullmatch(r'[0-9a-f]{32}', ident): raise ValueError('Mídia inválida.')
            is_audio = path.startswith('/audio/')
            video = DATA / 'midias' / (ident + ('.m4a' if is_audio else '.mp4'))
            size = video.stat().st_size
            first, last = 0, size - 1
            range_header = environ.get('HTTP_RANGE')
            if range_header:
                match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header)
                if not match or not any(match.groups()):
                    start_response('416 Range Not Satisfiable', [('Content-Range', f'bytes */{size}')]); return []
                a, b = match.groups()
                if a:
                    first, last = int(a), min(int(b), size-1) if b else size-1
                else:
                    first = max(0, size-int(b))
                if first > last or first >= size:
                    start_response('416 Range Not Satisfiable', [('Content-Range', f'bytes */{size}')]); return []
                status = '206 Partial Content'
            headers = [('Content-Type', 'audio/mp4' if is_audio else 'video/mp4'), ('Content-Length', str(last-first+1)),
                       ('Accept-Ranges', 'bytes'), ('X-Content-Type-Options', 'nosniff')]
            if range_header: headers.append(('Content-Range', f'bytes {first}-{last}/{size}'))
            start_response(status, headers)
            def chunks():
                with video.open('rb') as stream:
                    stream.seek(first)
                    remaining = last-first+1
                    while remaining:
                        chunk = stream.read(min(65536, remaining))
                        if not chunk: break
                        remaining -= len(chunk)
                        yield chunk
            return chunks() if method != 'HEAD' else []
        elif path.startswith(('/media/', '/logo/', '/vetor/', '/eap/')):
            ident = path.split('/')[-1]
            if not re.fullmatch(r'[0-9a-f]{32}', ident): raise ValueError('Mídia inválida.')
            data = (DATA / {'logo': 'logos', 'vetor': 'vetores', 'eap': 'eap'}.get(path.split('/')[1], 'midias') / (ident + '.png')).read_bytes()
            content_type = 'image/png'
        else:
            name = 'index.html' if path == '/' else path.lstrip('/')
            if name not in ('index.html','app.js','video-controls.js','composition-controls.js','project-controls.js','editor-layout.js','audio-panels.js','transform-controls.js', 'edition-names.js','export-progress.js','undo-history.js','vector.js','eap.js','style.css','favicon.svg','logo-indoor.png'): raise FileNotFoundError()
            data = (ROOT / 'static' / name).read_bytes()
            content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    except Conflict as exc:
        status, data = '409 Conflict', json.dumps({'error': str(exc)}).encode()
    except FileNotFoundError:
        status, data = '404 Not Found', b'{"error":"Arquivo indisponivel."}'
    except Exception as exc:
        status, data = '400 Bad Request', json.dumps({'error': str(exc)}, ensure_ascii=False).encode()
    start_response(status, [('Content-Type',content_type),('Content-Length',str(len(data))),('Cache-Control','no-store'),('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY'),('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")])
    return [data]

if __name__ == '__main__':
    init()
    port = int(os.environ.get('INDOOR_PORT', '8080'))
    print(f'Indoor Channel: http://localhost:{port} | Rede: http://{socket.gethostname()}:{port}', flush=True)
    serve(app, host=os.environ.get('INDOOR_HOST','0.0.0.0'), port=port, threads=6, max_request_body_size=MAX_UPLOAD, channel_timeout=300)
