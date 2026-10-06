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
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from waitress import serve
from version import VERSION
from modules.images import DEFAULT, SUPPORTED, decode, dominant, encoded, render, settings
from modules import ofertas
from modules import vector
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

# INDOOR_ALLOWED_HOSTS: nomes/IPs extras aceitos, separados por vírgula. "*" aceita qualquer nome — só para
# quando o sistema está atrás de um proxy e a porta do servidor não é exposta diretamente (ver deploy/).
ALLOWED_HOSTS = local_hosts() | {h.strip().lower() for h in os.environ.get('INDOOR_ALLOWED_HOSTS', '').split(',') if h.strip()}

def validate_host(host):
    try:
        parsed = urlsplit('//' + (host or ''))
        port = parsed.port
        if ((parsed.hostname not in ALLOWED_HOSTS and '*' not in ALLOWED_HOSTS) or not parsed.hostname or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment
                or (port is not None and not 1 <= port <= 65535)):
            raise ValueError()
    except ValueError:
        raise ValueError('Host não autorizado.') from None
MODULES = [{'id': 'images', 'name': 'Imagens', 'active': True}, {'id': 'video', 'name': 'Vídeo', 'active': False}, {'id': 'offers', 'name': 'Ofertas de supermercados', 'active': True}, {'id': 'eap', 'name': 'Logo EAP', 'active': False}, {'id': 'ms6', 'name': 'Vetorização MS6', 'active': True}]

class Conflict(Exception): pass

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
    value = json.loads(raw) if raw and path not in ('/api/upload', '/api/logo', '/api/vector/upload') else {}
    if path == '/api/info':
        return dict(host=socket.gethostname(), modules=MODULES, defaultFolder=str(Path.home() / 'Pictures'), version=VERSION, portable=bool(os.environ.get('INDOOR_PORTABLE')), nativePicker=(os.name == 'nt' or sys.platform == 'darwin') and (environ or {}).get('REMOTE_ADDR') in ('127.0.0.1','::1'))
    if path == '/api/jobs' and method == 'GET':
        with connect() as db: return [dict(r) for r in db.execute('SELECT id,title,updated,revision,(SELECT count(*) FROM media WHERE job=jobs.id) AS count FROM jobs ORDER BY updated DESC LIMIT 100')]
    if path == '/api/jobs' and method == 'POST':
        ident = uid()
        with connect() as db:
            db.execute('INSERT INTO jobs(id,title,updated) VALUES(?,?,?)', (ident, 'Nova edição', now()))
            event(db, ident, 'Trabalho criado', {})
        return get_job(ident)
    if path == '/api/job' and method == 'GET': return get_job(query['id'][0])
    if path == '/api/history':
        with connect() as db:
            return [dict(r) | {'detail': json.loads(r['detail'])} for r in db.execute('SELECT events.*,jobs.title FROM events LEFT JOIN jobs ON events.job=jobs.id WHERE events.hidden=0 ORDER BY events.id DESC LIMIT 500')]
    if method != 'POST': raise ValueError('Operação não encontrada.')
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
        ext = Path(query['name'][0]).suffix.lower()
        if ext not in SUPPORTED - {'.pdf'}: raise ValueError('Use uma imagem para a logo, preferencialmente PNG transparente.')
        with LOCK:
            with connect() as db: check_revision(db, job, revision)
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
            with connect() as db:
                db.execute('INSERT INTO logos VALUES(?,?,?,?)', (ident, job, im.width, im.height))
                db.execute('UPDATE jobs SET updated=?, revision=revision+1 WHERE id=?', (now(), job))
                event(db, job, 'Logo adicionada', {'logo': ident})
        return {'job': get_job(job), 'logoId': ident}
    if path == '/api/upload':
        job, name = query['job'][0], query['name'][0]
        revision = int(query['revision'][0])
        name = name.replace('\\', '/').split('/')[-1][:180]
        ext = Path(name).suffix.lower()
        with LOCK:
            with connect() as db: check_revision(db, job, revision)
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
                with connect() as db:
                    db.executemany('INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)', added)
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
                logo_path(m['settings'], job)
                db.execute('UPDATE media SET settings=? WHERE id=? AND job=?', (json.dumps(settings(m['settings'])), m['id'], job))
            order = [m['id'] for m in value['media']]
            known = {r['id'] for r in db.execute('SELECT id FROM media WHERE job=?', (job,))}
            if len(order) != len(set(order)) or set(order) != known:
                raise ValueError('A ordem precisa incluir cada imagem desta edição uma única vez.')
            meta = dict(value.get('meta', {})) | {'mediaOrder': order}
            db.execute('UPDATE jobs SET title=?,meta=?,updated=?,revision=revision+1 WHERE id=?', (str(value.get('title', 'Nova edição'))[:180], json.dumps(meta), now(), job))
            event(db, job, 'Ajustes salvos', {'midias': len(value['media'])})
        return get_job(job)
    if path == '/api/preview':
        with connect() as db: row = db.execute('SELECT * FROM media WHERE id=?', (value['id'],)).fetchone()
        if not row: raise ValueError('Mídia não encontrada.')
        with PROCESS: im, notes = render(DATA / 'midias' / f"{row['id']}.png", value['settings'], logo_path(value['settings'], row['job']))
        import base64
        im.thumbnail((1280,1280))
        return {'image': 'data:image/jpeg;base64,' + base64.b64encode(encoded(im, 'jpg')).decode(), 'notes': notes}
    if path == '/api/plan':
        job = get_job(value['job'])
        folder = directory(value['folder'])
        fmt = value['format']
        if fmt not in ('jpg', 'png'): raise ValueError('Formato inválido.')
        ids = value['ids']
        media = [m for m in job['media'] if m['id'] in ids]
        if not media: raise ValueError('Selecione ao menos uma mídia.')
        template = value.get('template')
        if template is not None:
            template = clean(template)
        else:
            client, campaign, date = (clean(value[k]) for k in ('client', 'campaign', 'date'))
        files = []
        names = value.get('names', [])
        for i, m in enumerate(media):
            if names: name = clean(names[i])
            elif template is not None:
                base = re.sub(r'^VT\s*\d*\s*-\s*', '', template, flags=re.IGNORECASE)
                name = clean(f"VT{' '+str(i+1) if len(media)>1 else ''} - {base}")
            else: name = f"VT{' '+str(i+1) if len(media)>1 else ''} - {client} - {campaign} {date}"
            dest = folder / (name + '.' + fmt)
            existing = digest(dest)
            if dest.exists():
                with connect() as db: known = db.execute('SELECT digest FROM exports WHERE path=?', (str(dest).casefold(),)).fetchone()
                if not known or known['digest'] != existing:
                    raise Conflict(f'O arquivo {dest.name} já existe e não é uma exportação intacta desta aplicação. Altere o nome para preservar o original.')
            files.append({'id': m['id'], 'name': dest.name, 'path': str(dest), 'existing': existing, 'settings': m['settings']})
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
        results = []
        for f in plan['files']:
            dest = Path(f['path'])
            temp = dest.parent / ('.indoor-' + uid() + '.tmp')
            try:
                with PROCESS:
                    im, notes = render(DATA / 'midias' / f"{f['id']}.png", f['settings'], logo_path(f['settings'], row['job']))
                    data = encoded(im, plan['format'])
                with LOCK, connect() as validation_db:
                    check_revision(validation_db, row['job'], row['revision'])
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
                    db.execute('INSERT OR REPLACE INTO exports VALUES(?,?,?)', (str(dest).casefold(), hashlib.sha256(data).hexdigest(), f['id']))
                    detail = dict(arquivo=str(dest), bytes=len(data), dimensoes=[im.width, im.height], ajustes=f['settings'], avisos=notes)
                    event(db, row['job'], 'Exportado', detail)
                results.append({'name': dest.name, 'ok': True})
            except Exception as exc:
                with LOCK, connect() as db:
                    event(db, row['job'], 'Falha na exportação', {'arquivo': str(dest), 'motivo': str(exc)})
                results.append({'name': dest.name, 'ok': False, 'error': str(exc)})
            finally:
                temp.unlink(missing_ok=True)
        return {'results': results}
    if path.startswith('/api/vector/'):
        return vector_api(path, query, value, raw)
    raise ValueError('Operação não encontrada.')

def vector_source(ident):
    if not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f]{32}', ident): raise ValueError('Logo inválida.')
    source = DATA / 'vetores' / (ident + '.png')
    if not source.is_file(): raise ValueError('Logo não encontrada. Adicione-a novamente.')
    from PIL import Image
    with Image.open(source) as im: return im.convert('RGBA')

def vector_api(path, query, value, raw):
    if path == '/api/vector/upload':
        name = query['name'][0].replace('\\', '/').split('/')[-1][:180]
        ext = Path(name).suffix.lower()
        if ext not in vector.SUPPORTED: raise ValueError('Formato não suportado. Use PNG, JPG, WebP, BMP, TIFF, PDF, AI ou SVG.')
        with PROCESS:
            try: im = vector.load(raw, ext)
            except ValueError: raise
            except Exception as exc: raise ValueError(f'Não foi possível abrir {name}.') from exc
            ident = uid()
            im.save(DATA / 'vetores' / (ident + '.png'))
        with connect() as db: event(db, None, 'Logo para vetorização', {'arquivo': name, 'dimensoes': [im.width, im.height]})
        return {'id': ident, 'name': name, 'width': im.width, 'height': im.height}
    if path == '/api/vector/trace':
        with PROCESS: result = vector.trace(vector_source(value.get('id')), value.get('settings'))
        return {k: result[k] for k in ('width', 'height', 'threshold', 'points', 'notes')} | {'contours': len(result['contours']), 'path': vector.svg_path(result['contours'])}
    if path == '/api/vector/export':
        folder, name = directory(value['folder']), clean(value['name'])
        dest = folder / (name + '.dxf')
        if dest.exists(): raise Conflict(f'O arquivo {dest.name} já existe. Altere o nome para preservar o arquivo existente.')
        with PROCESS:
            result = vector.trace(vector_source(value.get('id')), value.get('settings'))
            data = vector.dxf(result['contours'])
        temp = folder / ('.indoor-' + uid() + '.tmp')
        try:
            with temp.open('xb') as out:
                out.write(data); out.flush(); os.fsync(out.fileno())
            publish_new(temp, dest)
        except FileExistsError:
            raise Conflict(f'O arquivo {dest.name} apareceu na pasta durante o processamento. Altere o nome.') from None
        except Exception as exc:
            with connect() as db: event(db, None, 'Falha na exportação DXF', {'arquivo': str(dest), 'motivo': str(exc)})
            raise
        finally: temp.unlink(missing_ok=True)
        with connect() as db:
            event(db, None, 'DXF exportado', {'arquivo': str(dest), 'origem': str(value.get('source', ''))[:180], 'mm': [result['width'], result['height']], 'contornos': len(result['contours']), 'ajustes': vector.settings(value.get('settings'))})
        return {'name': dest.name, 'path': str(dest), 'width': result['width'], 'height': result['height']}
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
        resposta = ofertas.handle(environ)  # /api/ofertas/* e /ofertas/*; o módulo trata os próprios erros
        if resposta:
            start_response(resposta[0], resposta[1])
            return [resposta[2]]
        if path.startswith('/api/'):
            if method == 'POST' and environ.get('HTTP_X_INDOOR') != '1': raise ValueError('Requisição inválida.')
            length = int(environ.get('CONTENT_LENGTH') or 0)
            if length > MAX_UPLOAD: raise ValueError('Limite de 100 MB por arquivo.')
            body = environ['wsgi.input'].read(length)
            result = api(method, path, parse_qs(environ.get('QUERY_STRING', '')), body, environ)
            data = json.dumps(result, ensure_ascii=False).encode()
        elif path.startswith(('/media/', '/logo/', '/vetor/')):
            ident = path.split('/')[-1]
            if not re.fullmatch(r'[0-9a-f]{32}', ident): raise ValueError('Mídia inválida.')
            data = (DATA / {'logo': 'logos', 'vetor': 'vetores'}.get(path.split('/')[1], 'midias') / (ident + '.png')).read_bytes()
            content_type = 'image/png'
        else:
            name = 'index.html' if path == '/' else path.lstrip('/')
            if name not in ('index.html','app.js','undo-history.js','vector.js','style.css','favicon.svg','logo-indoor.png','ofertas.js','ofertas.css','tarefas.js','tarefas.css'): raise FileNotFoundError()
            data = (ROOT / 'static' / name).read_bytes()
            content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    except Conflict as exc:
        status, data = '409 Conflict', json.dumps({'error': str(exc)}).encode()
    except FileNotFoundError:
        status, data = '404 Not Found', b'{"error":"Arquivo indisponivel."}'
    except Exception as exc:
        status, data = '400 Bad Request', json.dumps({'error': str(exc)}, ensure_ascii=False).encode()
    start_response(status, [('Content-Type',content_type),('Content-Length',str(len(data))),('Cache-Control','no-store'),('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY'),('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")])
    return [data]

if __name__ == '__main__':
    init()
    port = int(os.environ.get('INDOOR_PORT', '8080'))
    print(f'Indoor Channel: http://localhost:{port} | Rede: http://{socket.gethostname()}:{port}', flush=True)
    serve(app, host=os.environ.get('INDOOR_HOST','0.0.0.0'), port=port, threads=6, max_request_body_size=MAX_UPLOAD, channel_timeout=300)
