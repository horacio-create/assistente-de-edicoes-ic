"""Tela Home: fotos dos colaboradores (todos veem) e um tutorial em vídeo por ferramenta
(só quem tem a ferramenta vê). Só superadmins trocam o conteúdo; no app local, sem login, qualquer um."""
import io
import json
import os
import re
import threading
from PIL import Image, ImageOps
from storage import DATA, uid

TOOLS = ('images', 'video', 'offers', 'ms6', 'eap')
MAX_FOTOS = 12
LOCK = threading.Lock()


def pasta(): return DATA / 'home'
def foto_path(ident): return pasta() / 'fotos' / f'{ident}.jpg'
def tutorial_path(tool): return pasta() / 'tutoriais' / f'{tool}.mp4'


def conteudo():
    try:
        return json.loads((pasta() / 'conteudo.json').read_text(encoding='utf-8'))
    except FileNotFoundError:
        return {'fotos': []}


def gravar(data):
    (pasta() / 'fotos').mkdir(parents=True, exist_ok=True)
    temp = pasta() / 'conteudo.json.tmp'
    temp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(temp, pasta() / 'conteudo.json')


def view(tools, editar):
    """O que a Home mostra: todas as fotos e só os tutoriais das ferramentas liberadas."""
    fotos = [{'id': f, 'url': f'/home/foto/{f}'} for f in conteudo()['fotos'] if foto_path(f).exists()]
    tutoriais = [{'tool': t, 'url': f'/home/tutorial/{t}'} for t in TOOLS if t in tools and tutorial_path(t).exists()]
    return {'fotos': fotos, 'tutoriais': tutoriais, 'editar': editar}


def adicionar_foto(raw):
    try:
        with Image.open(io.BytesIO(raw)) as original:
            im = ImageOps.exif_transpose(original).convert('RGB')
    except Exception:
        raise ValueError('Envie uma foto em JPG, PNG ou WebP.') from None
    im.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    out = io.BytesIO(); im.save(out, 'JPEG', quality=85, optimize=True)
    with LOCK:
        data = conteudo()
        if len(data['fotos']) >= MAX_FOTOS: raise ValueError(f'A Home aceita até {MAX_FOTOS} fotos. Remova uma antes.')
        ident = uid()
        (pasta() / 'fotos').mkdir(parents=True, exist_ok=True)
        foto_path(ident).write_bytes(out.getvalue())
        data['fotos'].append(ident); gravar(data)
    return ident


def remover_foto(ident):
    if not re.fullmatch(r'[0-9a-f]{32}', str(ident)): raise ValueError('Foto inválida.')
    with LOCK:
        data = conteudo()
        data['fotos'] = [f for f in data['fotos'] if f != ident]; gravar(data)
        foto_path(ident).unlink(missing_ok=True)


def enviar_tutorial(tool, raw):
    if tool not in TOOLS: raise ValueError('Ferramenta inválida.')
    if raw[4:8] != b'ftyp': raise ValueError('Envie o tutorial em MP4.')
    (pasta() / 'tutoriais').mkdir(parents=True, exist_ok=True)
    temp = tutorial_path(tool).with_suffix('.tmp')
    temp.write_bytes(raw)
    os.replace(temp, tutorial_path(tool))


def remover_tutorial(tool):
    if tool not in TOOLS: raise ValueError('Ferramenta inválida.')
    tutorial_path(tool).unlink(missing_ok=True)
