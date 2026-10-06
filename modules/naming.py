"""Short local edition names. OCR reads visible lettering, never uploads media."""
import json
import os
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from PIL import Image
from modules import videos


def folded(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))


def filename_title(name):
    text = Path(name.replace('\\', '/')).stem
    text = re.sub(r'[_]+', ' ', text)
    text = re.sub(r'(?i)\b(?:final|export|exportado|render|copia)(?:\s*\(?\d*\)?)?$', '', text)
    text = re.sub(r'\s+', ' ', text).strip(' -.') or 'Nova edição'
    return text[:70].rstrip()


def generic_filename(name):
    text = folded(filename_title(name))
    return bool(re.fullmatch(r'(?:telas?\s*)?(?:indoor\s*channel|ic)|(?:nova\s*)?edicao|(?:video|imagem|foto|clip|midia|arquivo|img|dsc|pxl|mov|vt|untitled|sem titulo)(?:[\s-]*\d+)*|[\d\s-]+|[a-f\d-]{20,}|(?:whatsapp|screen recording|gravacao de tela).*', text))


def content_title(lines):
    """Prefer a named business or a specific theme over fine print and dates."""
    useful = []
    for line in lines:
        text = re.sub(r'\s+', ' ', str(line.get('text', ''))).strip(' .|:-')
        if len(text) < 4 or len(text) > 90 or sum(c.isalpha() for c in text) < len(text)*.65:
            continue
        if re.search(r'www\.|https?://|@|\b(?:imagens ilustrativas|enquanto durar|todos os direitos|siga|acesse|consulte|valido|válido|somente nesta)\b', folded(text)):
            continue
        useful.append((text, float(line.get('height') or 0)))
    all_text = folded(' '.join(text for text, _ in useful))
    categories = [
        (r'odont|dentista|implante dentario|clareamento dental', 'Clínica odontológica', r'\b(?:clinica|odonto)\b'),
        (r'supermercado|supermercados|ofertas', 'Ofertas de supermercado', r'\b(?:supermercado|supermercados)\b'),
        (r'pizzaria', 'Pizzaria', r'\bpizzaria\b'),
        (r'restaurante', 'Restaurante', r'\brestaurante\b'),
        (r'academia|musculacao', 'Academia', r'\bacademia\b'),
        (r'clinica|consultorio', 'Clínica', r'\bclinica\b'),
        (r'farmacia|drogaria', 'Farmácia', r'\b(?:farmacia|drogaria)\b'),
    ]
    for evidence, label, business in categories:
        if re.search(evidence, all_text):
            named = [(t, h) for t, h in useful if re.search(business, folded(t)) and 2 <= len(t.split()) <= 6
                     and not re.search(r'\b(?:sua|nossa|profissional|agende|venha|melhor|consulta)\b', folded(t))]
            if named:
                text = max(named, key=lambda item: item[1])[0]
                return (text.title() if text.isupper() else text)[:70]
            return label
    candidates = [(t, h) for t, h in useful if len(t.split()) <= 7 and not generic_filename(t)
                  and not re.search(r'\b(?:agende|venha|compre|promocao|contato|telefone|endereco|rua|avenida|horario)\b', folded(t))]
    if not candidates:
        return None
    text = max(candidates, key=lambda item: item[1])[0]
    return (text.title() if text.isupper() else text)[:70]


def read_text(images):
    if os.name != 'nt':
        return []
    with tempfile.TemporaryDirectory(prefix='indoor-name-') as directory:
        paths = []
        for i, image in enumerate(images):
            with Image.open(image) as bitmap:
                bitmap = bitmap.convert('RGB');bitmap.thumbnail((1600, 1600))
                path = Path(directory) / f'{i}.png';bitmap.save(path);paths.append(str(path))
        manifest = Path(directory) / 'images.json'
        manifest.write_text(json.dumps(paths), encoding='utf-8')
        script = Path(__file__).with_name('read-media-text.ps1')
        result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                                 '-File', str(script), '-Manifest', str(manifest)], capture_output=True, timeout=24,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode:
            return []
        value = json.loads(result.stdout.decode('utf-8-sig'))
        return value if isinstance(value, list) else [value]


def suggest(name, poster, source=None, duration=0):
    fallback = filename_title(name)
    if not generic_filename(name):
        return {'title': fallback, 'origin': 'filename'}
    try:
        with tempfile.TemporaryDirectory(prefix='indoor-name-frames-') as directory:
            images = [poster]
            if source and duration:
                for i, fraction in enumerate((.3, .65)):
                    path = Path(directory) / f'{i}.png'
                    videos.run([videos.tool('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-ss', str(duration*fraction),
                                '-i', str(source), '-frames:v', '1', '-vf', 'scale=1600:1600:force_original_aspect_ratio=decrease',
                                '-y', str(path)], timeout=8)
                    images.append(path)
            title = content_title(read_text(images))
            if title:
                return {'title': title, 'origin': 'content'}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass  # A naming suggestion must never prevent a successful import.
    return {'title': fallback, 'origin': 'filename'}
