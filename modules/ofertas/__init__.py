"""Módulo Ofertas de supermercados: VTs de oferta gerados de templates (motor HyperFrames em ofertas/motor).

Registra-se no server.py por handle(environ): rotas /api/ofertas/* e /ofertas/*. Usa o banco e o
histórico do toolkit. Requer Node.js + `npm install` em ofertas/motor; sem isso o módulo explica
como habilitar em vez de quebrar (ex.: executável portátil).
"""
import hashlib
import io
import json
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, quote
from storage import DATA, ROOT, connect, event, now, uid

BASE = ROOT / 'ofertas'                      # motor, templates de fábrica, kit, contrato (versionados)
MOTOR = BASE / 'motor'
PASTA = DATA / 'ofertas'                     # dados do módulo (fora do Git)
TEMPLATES = Path(os.environ.get('OFERTAS_TEMPLATES', PASTA / 'templates')).resolve()
NODE = os.environ.get('OFERTAS_NODE') or shutil.which('node') or 'node'
HF_CLI = MOTOR / 'node_modules' / 'hyperframes' / 'bin' / 'hyperframes.mjs'
RENDERS_SIMULTANEOS = int(os.environ.get('OFERTAS_RENDERS', '1'))
MAX_UPLOAD = 100 * 1024 * 1024
SEM_JANELA = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
MODULO = 'Ofertas de supermercados'

LOCK = threading.RLock()
PUBLICAR = threading.Lock()
FILA = threading.Event()
RODANDO = {}   # render id -> Popen
PREVIEW = {}   # pedido id -> {'entrada/x.png': caminho}
_iniciado = False

ID = re.compile(r'[0-9a-f]{32}')
ID_TEMPLATE = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
HF = {'runtime.js': MOTOR / 'node_modules/hyperframes/dist/hyperframe.runtime.iife.js',
      'player.js': MOTOR / 'node_modules/hyperframes/dist/hyperframes-player.global.js',
      'gsap.min.js': MOTOR / 'node_modules/gsap/dist/gsap.min.js'}
KIT = {'SKILL.md': BASE / 'kit' / 'criar-template' / 'SKILL.md', 'CONTRATO.md': BASE / 'CONTRATO.md'}
KIT_ZIP = 'criar-template-ofertas.zip'
KIT_MOTOR = ('contrato.mjs', 'validar-template.mjs', 'gerar.mjs', 'hyperframes.mjs', 'package.json', 'package-lock.json')
KIT_LEIA_ME = '''Kit para o Claude criar templates de Ofertas de supermercados (Assistente de Edições).

1. Descompacte esta pasta na pasta de skills do Claude Code:
     macOS/Linux: ~/.claude/skills/criar-template-ofertas
     Windows:     %USERPROFILE%\\.claude\\skills\\criar-template-ofertas
2. Instale o motor uma vez (precisa de Node.js 20+):
     cd ~/.claude/skills/criar-template-ofertas/motor && npm install
3. Abra o Claude Code e peça: "crie um template de ofertas a partir desta arte".
   O Claude segue o SKILL.md, cria a pasta do template e valida com as ferramentas de motor/.
4. Publique: compacte a pasta do template em .zip e arraste em
   Ofertas de supermercados > Templates > Publicar template.

Referência completa: CONTRATO.md. Exemplo: templates/uniforca-hora-da-carne/.
'''

def kit_zip():
    """Pasta de skill pronta para o Claude: SKILL.md + contrato + ferramentas de validação + exemplo.
    Montada na hora a partir do repositório, então nunca fica desatualizada em relação ao motor."""
    raiz = 'criar-template-ofertas/'
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(KIT['SKILL.md'], raiz + 'SKILL.md')
        z.write(KIT['CONTRATO.md'], raiz + 'CONTRATO.md')
        z.writestr(raiz + 'LEIA-ME.txt', KIT_LEIA_ME)
        for nome in KIT_MOTOR: z.write(MOTOR / nome, raiz + 'motor/' + nome)
        exemplo = BASE / 'templates'
        for f in sorted(exemplo.rglob('*')):
            if f.is_file() and not any(p.startswith('.') for p in f.relative_to(exemplo).parts):
                z.write(f, raiz + 'templates/' + f.relative_to(exemplo).as_posix())
    return out.getvalue()
GSAP_CDN = re.compile(r'https://cdn\.jsdelivr\.net/npm/gsap@[\d.]+/dist/gsap\.min\.js')

CSP_PREVIEW = ("default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
               "font-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; frame-ancestors 'self'")
CSP_APP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"

class Conflict(Exception): pass

# ---------- disponibilidade e inicialização ----------

def status():
    if not shutil.which(NODE) and not Path(NODE).is_file():
        return {'pronto': False, 'motivo': 'O Node.js não está instalado neste computador. Instale o Node.js 20 ou superior (nodejs.org) e rode Instalar.bat de novo.'}
    if not HF_CLI.is_file():
        return {'pronto': False, 'motivo': 'O motor de vídeo não foi instalado. Rode Instalar.bat de novo (ele executa "npm install" em ofertas/motor).'}
    return {'pronto': True, 'motivo': ''}

def garantir():
    """Prepara pastas, tabelas e a fila na primeira requisição do módulo (servidor, testes e portátil)."""
    global _iniciado
    with LOCK:
        if _iniciado: return
        for d in ('imagens', 'miniaturas', 'renders', 'encartes'): (PASTA / d).mkdir(parents=True, exist_ok=True)
        TEMPLATES.mkdir(parents=True, exist_ok=True)
        # templates que vêm com o sistema entram uma vez; publicar de novo pela tela substitui
        if (BASE / 'templates').is_dir():
            for origem in (BASE / 'templates').iterdir():
                if origem.is_dir() and not origem.name.startswith('.') and not (TEMPLATES / origem.name).exists() and origem.name not in removidos():
                    shutil.copytree(origem, TEMPLATES / origem.name)
        with connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS ofertas_pedidos (id TEXT PRIMARY KEY, template TEXT, titulo TEXT, dados TEXT, revision INTEGER DEFAULT 0, criado TEXT, atualizado TEXT);
            CREATE TABLE IF NOT EXISTS ofertas_renders (id TEXT PRIMARY KEY, pedido TEXT, template TEXT, titulo TEXT, revision INTEGER, status TEXT, criado TEXT, iniciado TEXT, terminado TEXT, erro TEXT);
            CREATE TABLE IF NOT EXISTS ofertas_imagens (id TEXT PRIMARY KEY, nome TEXT, origem TEXT, largura INTEGER, altura INTEGER, transparente INTEGER, criado TEXT);
            CREATE TABLE IF NOT EXISTS ofertas_encartes (id TEXT PRIMARY KEY, nome TEXT, status TEXT, criado TEXT, terminado TEXT, erro TEXT, itens TEXT DEFAULT '[]');
            ''')
            # hash do arquivo enviado: o mesmo encarte importado de novo não duplica a biblioteca
            if 'hash' not in {c['name'] for c in db.execute('PRAGMA table_info(ofertas_imagens)')}:
                db.execute('ALTER TABLE ofertas_imagens ADD COLUMN hash TEXT')
            # renders que estavam em andamento quando o servidor caiu não vão terminar sozinhos
            db.execute("UPDATE ofertas_renders SET status='interrompido', terminado=? WHERE status='gerando'", (now(),))
            pendentes = [r['id'] for r in db.execute("SELECT id FROM ofertas_encartes WHERE status='lendo'")]
        if status()['pronto']:
            threading.Thread(target=worker, daemon=True).start()
            FILA.set()
        # leituras de encarte interrompidas por uma queda do servidor recomeçam do PDF guardado
        for ident in pendentes: threading.Thread(target=ler_encarte, args=(ident,), daemon=True).start()
        _iniciado = True

REMOVIDOS = 'removidos.txt'  # em .versoes/: templates de fábrica removidos pela tela (não são recopiados)

def removidos():
    f = TEMPLATES / '.versoes' / REMOVIDOS
    return set(f.read_text('utf-8').split()) if f.is_file() else set()

def marcar_removido(ident, removido):
    f = TEMPLATES / '.versoes' / REMOVIDOS
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text('\n'.join(sorted(removidos() - {ident} | ({ident} if removido else set()))), 'utf-8')

def registrar(db, acao, resumo, **detalhe):
    """Evento no Histórico do toolkit; 'arquivo' é o texto que a lista mostra."""
    event(db, None, acao, {'módulo': MODULO, 'arquivo': resumo, **detalhe})

# ---------- motor ----------

def motor(*args, entrada=None, timeout=60):
    r = subprocess.run([NODE, str(MOTOR / 'cli.mjs'), *map(str, args)], input=entrada, capture_output=True, timeout=timeout, creationflags=SEM_JANELA)
    if r.returncode: raise ValueError('Falha no motor: ' + r.stderr.decode('utf-8', 'replace')[-500:])
    return json.loads(r.stdout)

def template_dir(ident):
    if not isinstance(ident, str) or not ID_TEMPLATE.fullmatch(ident): raise ValueError('Template inválido.')
    d = TEMPLATES / ident
    if not (d / 'template.json').is_file(): raise ValueError('Template não encontrado.')
    return d

def esquema(template):
    result = motor('esquema', template_dir(template))
    if result['erros']: raise ValueError('Template com problemas: ' + '; '.join(result['erros'][:3]))
    return result

def resolver_imagens(valor):
    """Troca "biblioteca:<id>" pelo caminho do arquivo da biblioteca (o motor copia para entrada/)."""
    if isinstance(valor, dict): return {k: resolver_imagens(v) for k, v in valor.items()}
    if isinstance(valor, list): return [resolver_imagens(v) for v in valor]
    if isinstance(valor, str) and valor.startswith('biblioteca:') and ID.fullmatch(valor[11:]):
        return str(PASTA / 'imagens' / f'{valor[11:]}.png')
    return valor

def preparar(template, dados):
    return motor('preparar', template_dir(template), PASTA, entrada=json.dumps(resolver_imagens(dados)).encode())

def get_pedido(ident):
    with connect() as db:
        row = db.execute('SELECT * FROM ofertas_pedidos WHERE id=?', (ident,)).fetchone()
        if not row: raise ValueError('Pedido não encontrado.')
        result = dict(row)
        result['dados'] = json.loads(result['dados'])
        result['renders'] = [dict(r) for r in db.execute('SELECT * FROM ofertas_renders WHERE pedido=? ORDER BY criado DESC LIMIT 20', (ident,))]
        return result

# ---------- imagens ----------

def salvar_imagem(raw, nome, origem):
    from PIL import Image, ImageOps
    resumo = hashlib.sha256(raw).hexdigest()
    with connect() as db: igual = db.execute('SELECT * FROM ofertas_imagens WHERE hash=?', (resumo,)).fetchone()
    if igual: return dict(igual)
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGBA')
    except Exception as exc:
        raise ValueError(f'Não foi possível abrir {nome}. Use PNG, JPG ou WEBP.') from exc
    im.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
    ident = uid()
    im.save(PASTA / 'imagens' / f'{ident}.png', optimize=True)
    mini = im.copy()
    mini.thumbnail((320, 320), Image.Resampling.LANCZOS)
    mini.save(PASTA / 'miniaturas' / f'{ident}.png')
    transparente = int(im.getchannel('A').getextrema()[0] < 250)
    nome = re.sub(r'\.(png|jpe?g|webp)$', '', Path(nome).name, flags=re.I)[:120] or 'imagem'
    row = dict(id=ident, nome=nome, origem=origem, largura=im.width, altura=im.height, transparente=transparente, criado=now(), hash=resumo)
    with connect() as db: db.execute(f"INSERT INTO ofertas_imagens({','.join(row)}) VALUES({','.join('?' * len(row))})", tuple(row.values()))
    return row

def remover_fundo(ident):
    with connect() as db: row = db.execute('SELECT * FROM ofertas_imagens WHERE id=?', (ident,)).fetchone()
    if not row: raise ValueError('Imagem não encontrada.')
    saida = PASTA / 'renders' / f'fundo-{uid()}.png'
    try:
        r = subprocess.run([NODE, str(HF_CLI), 'remove-background', str(PASTA / 'imagens' / f'{ident}.png'), '-o', str(saida)],
                           capture_output=True, timeout=600, cwd=MOTOR, creationflags=SEM_JANELA)
        if r.returncode or not saida.exists():
            raise ValueError('Não foi possível remover o fundo: ' + r.stderr.decode('utf-8', 'replace')[-300:])
        return salvar_imagem(saida.read_bytes(), row['nome'] + ' (sem fundo)', 'fundo removido')
    finally:
        saida.unlink(missing_ok=True)

# ---------- fila de render ----------

def worker():
    while True:
        FILA.wait(timeout=3)
        FILA.clear()
        while True:
            with LOCK, connect() as db:
                if len(RODANDO) >= RENDERS_SIMULTANEOS: break
                row = db.execute("SELECT * FROM ofertas_renders WHERE status='na_fila' ORDER BY criado LIMIT 1").fetchone()
                if not row: break
                db.execute("UPDATE ofertas_renders SET status='gerando', iniciado=? WHERE id=?", (now(), row['id']))
                pasta = PASTA / 'renders' / row['id']
                log = (pasta / 'log.txt').open('wb')
                RODANDO[row['id']] = subprocess.Popen(
                    [NODE, str(MOTOR / 'gerar.mjs'), str(TEMPLATES / row['template']), str(pasta / 'dados.json'), '-o', str(pasta / 'video.mp4')],
                    stdout=log, stderr=subprocess.STDOUT, cwd=MOTOR, creationflags=SEM_JANELA)
            threading.Thread(target=acompanhar, args=(row['id'], log), daemon=True).start()

def acompanhar(ident, log):
    proc = RODANDO[ident]
    proc.wait()
    log.close()
    pasta = PASTA / 'renders' / ident
    with LOCK, connect() as db:
        del RODANDO[ident]
        atual = db.execute('SELECT status, titulo FROM ofertas_renders WHERE id=?', (ident,)).fetchone()
        if atual['status'] == 'cancelado': pass
        elif proc.returncode == 0 and (pasta / 'video.mp4').exists():
            db.execute("UPDATE ofertas_renders SET status='pronto', terminado=? WHERE id=?", (now(), ident))
            registrar(db, 'Vídeo gerado', atual['titulo'], render=ident)
        else:
            texto = (pasta / 'log.txt').read_text('utf-8', 'replace')
            linhas = [l.strip() for l in texto.splitlines() if l.strip().startswith(('✗', '-', 'Error'))]
            erro = '\n'.join(linhas[-6:]) or texto[-600:]
            db.execute("UPDATE ofertas_renders SET status='falhou', terminado=?, erro=? WHERE id=?", (now(), erro, ident))
            registrar(db, 'Falha ao gerar vídeo', atual['titulo'], render=ident, motivo=erro)
    FILA.set()
    try: miniatura_video(ident)  # pronta antes de alguém abrir o card
    except (FileNotFoundError, OSError, subprocess.SubprocessError): pass

_CAPAS = {}
def capa_em(template):
    """Segundo da capa do template (o player e a miniatura do vídeo pronto mostram esse momento)."""
    if template not in _CAPAS:
        try: _CAPAS[template] = json.loads((TEMPLATES / template / 'template.json').read_text('utf-8')).get('capaEm', 0)
        except (OSError, ValueError): _CAPAS[template] = 0
    return _CAPAS[template]

def miniatura_video(ident):
    """JPG de um quadro do vídeo pronto (no momento da capa). Abrir o card mostra só esta imagem: criar o
    <video> com controles e carregá-lo travava a tela; o player só nasce quando a pessoa clica para assistir."""
    if not ID.fullmatch(ident): raise FileNotFoundError()
    pasta = PASTA / 'renders' / ident
    jpg = pasta / 'capa.jpg'
    if not jpg.is_file():
        mp4 = pasta / 'video.mp4'
        ffmpeg = shutil.which('ffmpeg')
        if not mp4.is_file() or not ffmpeg: raise FileNotFoundError()
        with connect() as db: row = db.execute('SELECT template FROM ofertas_renders WHERE id=?', (ident,)).fetchone()
        temp = pasta / f'capa-{uid()}.jpg'
        subprocess.run([ffmpeg, '-v', 'error', '-y', '-ss', str(capa_em(row['template']) if row else 0), '-i', str(mp4),
                        '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', str(temp)], timeout=60, creationflags=SEM_JANELA)
        if not temp.is_file(): raise FileNotFoundError()
        os.replace(temp, jpg)
    return jpg.read_bytes()

# ---------- encartes (leitura em segundo plano) ----------

LEITURA = threading.Semaphore(1)  # um PDF por vez: a extração usa bastante CPU

def ler_encarte(ident):
    """Extrai produtos do PDF guardado e salva o resultado no banco. Roda fora da requisição: quem enviou
    pode fechar a janela; o resultado fica na aba Encartes e no modal do editor."""
    from modules.ofertas.encarte import extrair
    with LEITURA:
        with connect() as db: nome = db.execute('SELECT nome FROM ofertas_encartes WHERE id=?', (ident,)).fetchone()['nome']
        try:
            itens = extrair((PASTA / 'encartes' / f'{ident}.pdf').read_bytes())
            if not itens: raise ValueError('nenhum produto encontrado. O PDF precisa ter texto selecionável e recortes com fundo transparente.')
            result = [item | {'imagem': salvar_imagem(item.pop('png'), item['nome'], f'encarte: {nome}')['id']} for item in itens]
            with connect() as db:
                db.execute("UPDATE ofertas_encartes SET status='pronto', terminado=?, itens=? WHERE id=?", (now(), json.dumps(result, ensure_ascii=False), ident))
                registrar(db, 'Encarte importado', nome, produtos=len(result))
        except Exception as exc:
            with connect() as db:
                db.execute("UPDATE ofertas_encartes SET status='falhou', terminado=?, erro=? WHERE id=?", (now(), f'Não foi possível ler {nome}: {exc}', ident))

def apagar_encarte(ident):
    """Apaga o encarte do card: o PDF e a lista de produtos. As imagens extraídas continuam na biblioteca."""
    if not ID.fullmatch(ident): raise ValueError('Encarte inválido.')
    with LOCK, connect() as db:
        row = db.execute('SELECT nome, status FROM ofertas_encartes WHERE id=?', (ident,)).fetchone()
        if not row: raise ValueError('Encarte não encontrado.')
        if row['status'] == 'lendo': raise ValueError('Espere a leitura do encarte terminar para apagá-lo.')
        db.execute('DELETE FROM ofertas_encartes WHERE id=?', (ident,))
        registrar(db, 'Encarte apagado', row['nome'])
    (PASTA / 'encartes' / f'{ident}.pdf').unlink(missing_ok=True)
    return {'ok': True}

def apagar_imagem(ident):
    """Apaga da biblioteca. Recusa se um pedido ou um encarte ainda usa a imagem (o vídeo/lista quebraria)."""
    if not ID.fullmatch(ident): raise ValueError('Imagem inválida.')
    with LOCK, connect() as db:
        row = db.execute('SELECT nome FROM ofertas_imagens WHERE id=?', (ident,)).fetchone()
        if not row: raise ValueError('Imagem não encontrada.')
        pedidos = [r['titulo'] for r in db.execute('SELECT titulo FROM ofertas_pedidos WHERE dados LIKE ?', (f'%biblioteca:{ident}%',))]
        encartes = [r['nome'] for r in db.execute('SELECT nome FROM ofertas_encartes WHERE itens LIKE ?', (f'%{ident}%',))]
        fila = [r['titulo'] for r in db.execute("SELECT id, titulo FROM ofertas_renders WHERE status IN ('na_fila','gerando')")
                if (f := PASTA / 'renders' / r['id'] / 'dados.json').is_file() and ident in f.read_text('utf-8', 'replace')]
        if fila: raise ValueError(f'{row["nome"]} está num vídeo na fila de geração. Espere terminar para apagar.')
        if pedidos or encartes:
            onde = [f'pedido “{n}”' for n in pedidos[:3]] + [f'encarte “{n}”' for n in encartes[:3]]
            raise ValueError(f'{row["nome"]} está em uso ({", ".join(onde)}). Troque a imagem no pedido ou apague o encarte antes.')
        db.execute('DELETE FROM ofertas_imagens WHERE id=?', (ident,))
        registrar(db, 'Imagem apagada', row['nome'])
    for pasta in ('imagens', 'miniaturas'): (PASTA / pasta / f'{ident}.png').unlink(missing_ok=True)
    return {'ok': True}

def remover_template(ident):
    """Tira o template do catálogo. A pasta vai para .versoes (publicar de novo traz de volta)."""
    if not ID_TEMPLATE.fullmatch(ident) or not (TEMPLATES / ident).is_dir(): raise ValueError('Template não encontrado.')
    with PUBLICAR:
        with connect() as db:
            if db.execute("SELECT 1 FROM ofertas_renders WHERE template=? AND status IN ('na_fila','gerando')", (ident,)).fetchone():
                raise ValueError('Há vídeos deste template na fila. Espere terminar ou cancele antes de remover.')
        destino = TEMPLATES / '.versoes' / ident / time.strftime('%Y%m%d-%H%M%S')
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(TEMPLATES / ident), str(destino))
        marcar_removido(ident, True)
        _CAPAS.pop(ident, None)
        with connect() as db: registrar(db, 'Template removido', ident, template=ident)
    return {'ok': True}

def duracao_media():
    with connect() as db:
        rows = db.execute("SELECT iniciado, terminado FROM ofertas_renders WHERE status='pronto' ORDER BY terminado DESC LIMIT 10").fetchall()
    tempos = [(datetime.fromisoformat(r['terminado']) - datetime.fromisoformat(r['iniciado'])).total_seconds() for r in rows]
    return round(sum(tempos) / len(tempos)) if tempos else 30

# ---------- publicação de templates ----------

def publicar(raw):
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise ValueError('Envie a pasta do template compactada em .zip.')
    nomes = [n for n in z.namelist() if not n.startswith('__MACOSX/') and not n.endswith('.DS_Store')]
    raiz = min((n[:-len('template.json')] for n in nomes if n.endswith('template.json') and n.count('/') <= 1), key=len, default=None)
    if raiz is None: raise ValueError('O .zip precisa ter template.json na raiz (ou dentro de uma única pasta).')
    try:
        meta = json.loads(z.read(raiz + 'template.json'))
    except Exception:
        raise ValueError('template.json não é um JSON válido.')
    ident = meta.get('id', '')
    if not isinstance(ident, str) or not ID_TEMPLATE.fullmatch(ident):
        raise ValueError('O "id" do template.json deve usar letras minúsculas, números e hífens (ex.: cliente-promocao).')
    if sum(i.file_size for i in z.infolist()) > 800 * 1024 * 1024 or len(nomes) > 3000:
        raise ValueError('Template grande demais (limite: 800 MB, 3000 arquivos).')
    with PUBLICAR:
        staging = TEMPLATES / '.staging' / uid()
        destino = staging / ident
        try:
            for n in nomes:
                if not n.startswith(raiz) or n.endswith('/'): continue
                rel = Path(n[len(raiz):])
                if rel.is_absolute() or '..' in rel.parts or rel.parts[0] in ('node_modules', 'snapshots', 'renders', '.hyperframes'): continue
                alvo = destino / rel
                alvo.parent.mkdir(parents=True, exist_ok=True)
                alvo.write_bytes(z.read(n))
            r = subprocess.run([NODE, str(MOTOR / 'validar-template.mjs'), str(destino)], capture_output=True, timeout=600, cwd=MOTOR, creationflags=SEM_JANELA)
            saida = (r.stdout + r.stderr).decode('utf-8', 'replace')
            if r.returncode:
                erros = [l.strip()[2:] for l in saida.splitlines() if l.strip().startswith('- ')] or [saida.strip()[-800:]]
                return {'ok': False, 'template': ident, 'erros': erros}
            avisos = [l.strip()[1:].strip() for l in saida.splitlines() if l.strip().startswith('⚠')]
            versao = None
            if (TEMPLATES / ident).exists():
                versao = time.strftime('%Y%m%d-%H%M%S')
                arquivo = TEMPLATES / '.versoes' / ident / versao
                arquivo.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(TEMPLATES / ident), str(arquivo))
            shutil.move(str(destino), str(TEMPLATES / ident))
            marcar_removido(ident, False)
            with connect() as db: registrar(db, 'Template publicado', meta.get('nome', ident), template=ident, versaoAnterior=versao)
            _CAPAS.pop(ident, None)
            return {'ok': True, 'template': ident, 'nome': meta.get('nome', ident), 'substituiu': bool(versao), 'erros': [], 'avisos': avisos}
        finally:
            shutil.rmtree(staging, ignore_errors=True)

# ---------- API (/api/ofertas/...) ----------

def api(method, path, query, raw):
    value = json.loads(raw) if raw and path not in ('/imagem', '/encarte', '/templates-publicar') else {}
    q = lambda k: query.get(k, [''])[0]
    if path == '/status': return status()
    if not status()['pronto'] and path not in ('/imagens',): raise ValueError(status()['motivo'])
    if path == '/templates': return motor('catalogo', TEMPLATES)
    if path == '/esquema': return esquema(q('template'))
    if path == '/pedidos' and method == 'GET':
        with connect() as db:
            return [dict(r) for r in db.execute('''SELECT p.id, p.titulo, p.template, p.atualizado,
                (SELECT status FROM ofertas_renders WHERE pedido=p.id ORDER BY criado DESC LIMIT 1) AS ultimo
                FROM ofertas_pedidos p ORDER BY p.atualizado DESC LIMIT 100''')]
    if path == '/pedido' and method == 'GET':
        pedido = get_pedido(q('id'))
        pedido['validacao'] = preparar(pedido['template'], pedido['dados'])['detalhes']
        return pedido
    if path == '/imagens':
        with connect() as db:
            if q('ids'):
                ids = [i for i in q('ids').split(',') if ID.fullmatch(i)][:100]
                return [dict(r) for r in db.execute(f"SELECT * FROM ofertas_imagens WHERE id IN ({','.join('?' * len(ids))})", ids)]
            return [dict(r) for r in db.execute('SELECT * FROM ofertas_imagens WHERE nome LIKE ? ORDER BY criado DESC LIMIT 300', (f"%{q('busca').strip()}%",))]
    if path == '/encartes':
        with connect() as db:
            rows = [dict(r) for r in db.execute('SELECT * FROM ofertas_encartes ORDER BY criado DESC LIMIT 50')]
        for r in rows: r['itens'] = json.loads(r['itens'] or '[]')
        return rows
    if path == '/renders':
        with connect() as db:
            rows = [dict(r) for r in db.execute('SELECT * FROM ofertas_renders ORDER BY criado DESC LIMIT 60')]
        for r in rows: r['capaEm'] = capa_em(r['template'])  # o player do vídeo pronto abre no momento da capa
        return {'renders': rows, 'mediaSegundos': duracao_media()}
    if method != 'POST': raise ValueError('Operação não encontrada.')

    if path == '/pedidos':
        schema = esquema(value.get('template'))
        titulo = f"{schema['nome']} · {time.strftime('%d/%m')}"
        padrao = json.dumps(schema['padrao'], ensure_ascii=False)
        with LOCK, connect() as db:
            # rascunho nunca salvo (revision 0) e nunca gerado = só os valores padrão: reabre em vez de empilhar cópias
            intocados = [r['id'] for r in db.execute('''SELECT id FROM ofertas_pedidos p WHERE template=? AND revision=0
                AND NOT EXISTS (SELECT 1 FROM ofertas_renders WHERE pedido=p.id) ORDER BY criado DESC''', (schema['id'],))]
            if intocados:
                ident = intocados[0]
                db.execute('UPDATE ofertas_pedidos SET titulo=?, dados=?, atualizado=? WHERE id=?', (titulo, padrao, now(), ident))
                db.executemany('DELETE FROM ofertas_pedidos WHERE id=?', [(i,) for i in intocados[1:]])
            else:
                ident = uid()
                db.execute('INSERT INTO ofertas_pedidos VALUES(?,?,?,?,?,?,?)', (ident, schema['id'], titulo, padrao, 0, now(), now()))
        return api('GET', '/pedido', {'id': [ident]}, b'')
    if path == '/pedido-salvar':
        ident = value['id']
        with LOCK, connect() as db:
            row = db.execute('SELECT revision, template FROM ofertas_pedidos WHERE id=?', (ident,)).fetchone()
            if not row: raise ValueError('Pedido não encontrado.')
            if row['revision'] != value['revision']: raise Conflict('Este pedido mudou em outra janela. Reabra-o em Pedidos recentes.')
            dados = value['dados']
            if not isinstance(dados, dict): raise ValueError('Dados inválidos.')
            db.execute('UPDATE ofertas_pedidos SET titulo=?, dados=?, revision=revision+1, atualizado=? WHERE id=?',
                       (str(value.get('titulo') or 'Novo vídeo')[:160], json.dumps(dados, ensure_ascii=False), now(), ident))
        return {'revision': row['revision'] + 1, 'validacao': preparar(row['template'], dados)['detalhes']}
    if path == '/pedido-excluir':
        with connect() as db: db.execute('DELETE FROM ofertas_pedidos WHERE id=?', (value['id'],))
        return {'ok': True}
    if path == '/gerar':
        pedido = get_pedido(value['id'])
        if pedido['revision'] != value['revision']: raise Conflict('Salve o pedido antes de gerar.')
        prep = preparar(pedido['template'], pedido['dados'])
        if prep['erros']: return {'ok': False, 'validacao': prep['detalhes'], 'erros': prep['erros']}
        ident = uid()
        pasta = PASTA / 'renders' / ident
        pasta.mkdir(parents=True)
        # foto dos dados no momento do pedido: editar depois não muda o vídeo que está na fila
        (pasta / 'dados.json').write_text(json.dumps(resolver_imagens(pedido['dados']), ensure_ascii=False), 'utf-8')
        with connect() as db:
            db.execute("INSERT INTO ofertas_renders VALUES(?,?,?,?,?,'na_fila',?,NULL,NULL,NULL)",
                       (ident, pedido['id'], pedido['template'], pedido['titulo'], pedido['revision'], now()))
        FILA.set()
        return {'ok': True, 'render': ident}
    if path == '/render-cancelar':
        with LOCK, connect() as db:
            row = db.execute('SELECT status FROM ofertas_renders WHERE id=?', (value['id'],)).fetchone()
            if not row or row['status'] not in ('na_fila', 'gerando'): raise ValueError('Este vídeo não está na fila.')
            db.execute("UPDATE ofertas_renders SET status='cancelado', terminado=? WHERE id=?", (now(), value['id']))
            if value['id'] in RODANDO: RODANDO[value['id']].terminate()
        return {'ok': True}
    if path == '/imagem': return salvar_imagem(raw, q('nome') or 'imagem.png', 'envio')
    if path == '/imagem-remover-fundo': return remover_fundo(value['id'])
    if path == '/encarte':
        nome = Path(q('nome') or 'encarte.pdf').name[:160]
        if not raw.startswith(b'%PDF'): raise ValueError(f'{nome} não é um PDF.')
        ident = uid()
        (PASTA / 'encartes' / f'{ident}.pdf').write_bytes(raw)
        with connect() as db: db.execute("INSERT INTO ofertas_encartes(id,nome,status,criado) VALUES(?,?,'lendo',?)", (ident, nome, now()))
        threading.Thread(target=ler_encarte, args=(ident,), daemon=True).start()
        return {'id': ident, 'nome': nome, 'status': 'lendo'}
    if path == '/imagem-excluir': return apagar_imagem(str(value.get('id', '')))
    if path == '/template-remover': return remover_template(str(value.get('id', '')))
    if path == '/encarte-excluir':
        return apagar_encarte(str(value.get('id', '')))
    if path == '/templates-publicar': return publicar(raw)
    raise ValueError('Operação não encontrada.')

# ---------- arquivos (/ofertas/...) ----------

def preview(pedido_id, resto):
    """Template com os dados do pedido em window.__hfVariables (lido pelo runtime do HyperFrames)."""
    if not ID.fullmatch(pedido_id): raise FileNotFoundError()
    if resto == 'index.html':
        pedido = get_pedido(pedido_id)
        prep = preparar(pedido['template'], pedido['dados'])
        PREVIEW[pedido_id] = {c['para']: c['de'] for c in prep['copias']}
        html = (template_dir(pedido['template']) / 'index.html').read_text('utf-8')
        injecao = ('<script>window.__hfVariables=' + json.dumps(prep['variaveis'], ensure_ascii=False).replace('</', '<\\/')
                   + ';</script><script src="/ofertas/hf/runtime.js"></script>')
        html = re.sub(r'<head[^>]*>', lambda m: m.group(0) + injecao, html, count=1)
        return GSAP_CDN.sub('/ofertas/hf/gsap.min.js', html).encode(), 'text/html; charset=utf-8'
    if resto.startswith('entrada/'):
        origem = PREVIEW.get(pedido_id, {}).get(resto)
        if not origem: raise FileNotFoundError()
        return Path(origem).read_bytes(), 'image/png'
    with connect() as db: row = db.execute('SELECT template FROM ofertas_pedidos WHERE id=?', (pedido_id,)).fetchone()
    if not row: raise FileNotFoundError()
    base = template_dir(row['template']).resolve()
    alvo = (base / resto).resolve()
    if base not in alvo.parents or not alvo.is_file(): raise FileNotFoundError()
    return alvo.read_bytes(), mimetypes.guess_type(alvo.name)[0] or 'application/octet-stream'

def video(environ, ident):
    if not ID.fullmatch(ident): raise FileNotFoundError()
    arquivo = PASTA / 'renders' / ident / 'video.mp4'
    if not arquivo.is_file(): raise FileNotFoundError()
    tamanho = arquivo.stat().st_size
    faixa = re.fullmatch(r'bytes=(\d*)-(\d*)', environ.get('HTTP_RANGE', ''))
    inicio, fim = 0, tamanho - 1
    if faixa and (faixa[1] or faixa[2]):
        inicio = int(faixa[1]) if faixa[1] else tamanho - int(faixa[2])
        fim = min(int(faixa[2]), tamanho - 1) if faixa[1] and faixa[2] else tamanho - 1
    with arquivo.open('rb') as f:
        f.seek(inicio)
        data = f.read(fim - inicio + 1)
    headers = [('Accept-Ranges', 'bytes')]
    if faixa: headers.append(('Content-Range', f'bytes {inicio}-{fim}/{tamanho}'))
    if 'baixar=1' in environ.get('QUERY_STRING', ''):
        with connect() as db: row = db.execute('SELECT titulo FROM ofertas_renders WHERE id=?', (ident,)).fetchone()
        nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', row['titulo'] if row else 'video').strip(' .') or 'video'
        headers.append(('Content-Disposition', f"attachment; filename*=UTF-8''{quote(nome + '.mp4')}"))
    return data, headers, '206 Partial Content' if faixa else '200 OK'

def arquivo(environ, path):
    """-> (status, content_type, data, extra_headers, csp, frame)"""
    if path.startswith('/ofertas/preview/'):
        partes = path.split('/', 4)
        if len(partes) < 5: raise FileNotFoundError()
        data, tipo = preview(partes[3], partes[4])
        return '200 OK', tipo, data, [], CSP_PREVIEW, 'SAMEORIGIN'
    if path.startswith('/ofertas/video/') and path.endswith('.jpg'):
        return '200 OK', 'image/jpeg', miniatura_video(path.split('/')[-1].removesuffix('.jpg')), [('Cache-Control', 'private, max-age=86400')], CSP_APP, 'DENY'
    if path.startswith('/ofertas/video/'):
        data, extra, st = video(environ, path.split('/')[-1].removesuffix('.mp4'))
        return st, 'video/mp4', data, extra, CSP_APP, 'DENY'
    if path.startswith(('/ofertas/imagem/', '/ofertas/miniatura/')):
        ident = path.split('/')[-1].removesuffix('.png')
        if not ID.fullmatch(ident): raise FileNotFoundError()
        pasta = 'imagens' if path.startswith('/ofertas/imagem/') else 'miniaturas'
        return '200 OK', 'image/png', (PASTA / pasta / f'{ident}.png').read_bytes(), [('Cache-Control', 'private, max-age=31536000, immutable')], CSP_APP, 'DENY'
    if path.startswith('/ofertas/capa/'):
        return '200 OK', 'image/png', (template_dir(path.split('/')[-1].removesuffix('.png')) / 'capa.png').read_bytes(), [], CSP_APP, 'DENY'
    if path.startswith('/ofertas/hf/') and path[12:] in HF:
        return '200 OK', 'text/javascript; charset=utf-8', HF[path[12:]].read_bytes(), [], CSP_APP, 'DENY'
    if path == '/ofertas/kit/' + KIT_ZIP:
        return '200 OK', 'application/zip', kit_zip(), [('Content-Disposition', f'attachment; filename="{KIT_ZIP}"')], CSP_APP, 'DENY'
    if path.startswith('/ofertas/kit/') and path[13:] in KIT:
        return '200 OK', 'text/markdown; charset=utf-8', KIT[path[13:]].read_bytes(), [], CSP_APP, 'DENY'
    raise FileNotFoundError()

def handle(environ):
    """Atende rotas do módulo. -> (status, headers, corpo) ou None se a rota não é deste módulo.
    Host e origem já foram validados pelo server.py."""
    path = environ['PATH_INFO']
    if not (path.startswith('/api/ofertas/') or path.startswith('/ofertas/')): return None
    status_http, tipo, extra, csp, frame = '200 OK', 'application/json; charset=utf-8', [], CSP_APP, 'DENY'
    try:
        garantir()
        if path.startswith('/api/ofertas/'):
            metodo = environ['REQUEST_METHOD']
            if metodo == 'POST' and environ.get('HTTP_X_INDOOR') != '1': raise ValueError('Requisição inválida.')
            tamanho = int(environ.get('CONTENT_LENGTH') or 0)
            if tamanho > MAX_UPLOAD: raise ValueError('Limite de 100 MB por arquivo.')
            corpo = environ['wsgi.input'].read(tamanho)
            resultado = api(metodo, path[len('/api/ofertas'):], parse_qs(environ.get('QUERY_STRING', '')), corpo)
            data = json.dumps(resultado, ensure_ascii=False).encode()
        else:
            status_http, tipo, data, extra, csp, frame = arquivo(environ, path)
    except Conflict as exc:
        status_http, tipo, data = '409 Conflict', 'application/json; charset=utf-8', json.dumps({'error': str(exc)}, ensure_ascii=False).encode()
    except FileNotFoundError:
        status_http, tipo, data = '404 Not Found', 'application/json; charset=utf-8', b'{"error":"Arquivo indisponivel."}'
    except Exception as exc:
        status_http, tipo, data = '400 Bad Request', 'application/json; charset=utf-8', json.dumps({'error': str(exc)}, ensure_ascii=False).encode()
    cache = next((v for k, v in extra if k == 'Cache-Control'), 'no-store')
    # arquivos (prévia, capas, runtime): o navegador guarda e pergunta se mudou — sem isso cada edição
    # baixava de novo fontes, fundo e imagens do template (~5 MB)
    if status_http == '200 OK' and path.startswith('/ofertas/') and not path.endswith('.mp4'):
        if cache == 'no-store': cache = 'private, no-cache'
        etag = '"' + hashlib.sha1(data).hexdigest()[:20] + '"'
        extra = [*extra, ('ETag', etag)]
        if etag in environ.get('HTTP_IF_NONE_MATCH', ''): status_http, data = '304 Not Modified', b''
    headers = [('Content-Type', tipo), ('Content-Length', str(len(data))), ('Cache-Control', cache), ('X-Content-Type-Options', 'nosniff'),
               ('X-Frame-Options', frame), ('Content-Security-Policy', csp), *[h for h in extra if h[0] != 'Cache-Control']]
    return status_http, headers, data
