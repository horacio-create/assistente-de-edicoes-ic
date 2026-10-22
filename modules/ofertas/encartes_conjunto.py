"""Receber vários encartes e montar um PDF contínuo na ordem escolhida."""
import os
import shutil
import tempfile
from email import policy
from email.parser import BytesParser
from pathlib import Path

import pymupdf
from PIL import Image, ImageOps

from .pdf_preparacao import MAX_PDF, MAX_PAGINAS, preparar_pdf, _mesma_pagina

MAX_ARQUIVOS = 20
MAX_PAGINAS_CONJUNTO = 100


def receber(raw, content_type):
    if '\r' in content_type or '\n' in content_type or len(raw) > MAX_PDF:
        raise ValueError('O conjunto deve ter até 200 MB.')
    if not content_type.lower().startswith('multipart/form-data;'):
        raise ValueError('Envie os encartes como arquivos separados no mesmo envio.')
    mensagem = BytesParser(policy=policy.default).parsebytes(
        b'Content-Type: ' + content_type.encode('ascii') + b'\r\nMIME-Version: 1.0\r\n\r\n' + raw)
    if not mensagem.is_multipart() or mensagem.defects:
        raise ValueError('Envio de arquivos incompleto. Selecione os encartes novamente.')
    arquivos = []
    for parte in mensagem.iter_parts():
        nome = parte.get_filename()
        if parte.is_multipart() or not nome or parte.get_param('name', header='content-disposition') != 'encartes':
            raise ValueError('Arquivo inválido no conjunto.')
        nome = nome.replace('\\', '/').rsplit('/', 1)[-1][:160]
        ext = Path(nome).suffix.lower()
        if ext not in ('.pdf', '.png', '.jpg', '.jpeg'):
            raise ValueError('Selecione apenas encartes PDF, PNG ou JPG.')
        dados = parte.get_payload(decode=True)
        limite = MAX_PDF if ext == '.pdf' else 100 * 1024 * 1024
        if not dados or len(dados) > limite:
            raise ValueError(f'{nome}: arquivo vazio ou acima do limite permitido.')
        arquivos.append((nome, dados))
        if len(arquivos) > MAX_ARQUIVOS:
            raise ValueError('Selecione até 20 encartes por conjunto.')
    if not arquivos:
        raise ValueError('Selecione pelo menos um encarte.')
    return arquivos


def montar(pasta_fontes, fontes, destino, comprimir):
    """Preserva os originais e confere a cópia combinada página por página."""
    destino = Path(destino)
    total_original = sum((pasta_fontes / f['arquivo']).stat().st_size for f in fontes)
    novas_fontes = []
    with tempfile.TemporaryDirectory(prefix='.encartes-uniao-', dir=destino.parent) as temporaria, pymupdf.open() as conjunto:
        temporaria = Path(temporaria)
        for fonte in fontes:
            original = pasta_fontes / fonte['arquivo']
            if original.suffix == '.pdf':
                trabalho = temporaria / original.name
                shutil.copyfile(original, trabalho)
                if comprimir:
                    preparar_pdf(trabalho)
                documento = pymupdf.open(trabalho)
            else:
                with Image.open(original) as im:
                    if im.width * im.height > 40_000_000:
                        raise ValueError(f"{fonte['nome']}: limite de 40 megapixels por imagem.")
                    trabalho = temporaria / (original.stem + '.png')
                    ImageOps.exif_transpose(im).convert('RGB').save(trabalho)
                imagem = pymupdf.open(trabalho)
                try: documento = pymupdf.open(stream=imagem.convert_to_pdf(), filetype='pdf')
                finally: imagem.close()
            with documento:
                if documento.needs_pass:
                    raise ValueError(f"{fonte['nome']}: PDF protegido por senha.")
                if not 1 <= len(documento) <= MAX_PAGINAS:
                    raise ValueError(f"{fonte['nome']}: importe até 20 páginas por arquivo.")
                inicio = len(conjunto)
                if inicio + len(documento) > MAX_PAGINAS_CONJUNTO:
                    raise ValueError('O conjunto pode reunir até 100 páginas.')
                conjunto.insert_pdf(documento)
                for i in range(len(documento)):
                    if not _mesma_pagina(documento[i], conjunto[inicio+i]):
                        raise ValueError(f"Não foi possível unir {fonte['nome']} preservando sua aparência e seus dados.")
                novas_fontes.append(fonte | {'paginas': list(range(inicio+1, len(conjunto)+1))})
        temp = temporaria / 'conjunto.pdf'
        conjunto.save(temp, garbage=4, deflate=True)
        # Conferir também o PDF salvo, antes de adotar a cópia de trabalho.
        with pymupdf.open(temp) as salvo:
            if len(salvo) != len(conjunto) or any(not _mesma_pagina(conjunto[i], salvo[i]) for i in range(len(conjunto))):
                raise ValueError('A cópia unificada não passou na conferência.')
        os.replace(temp, destino)
    tamanho = destino.stat().st_size
    return {'estado': 'concluido', 'original': total_original, 'final': tamanho,
            'reduzido': comprimir and tamanho < total_original, 'fontes': novas_fontes,
            'mensagem': f'{len(fontes)} encartes unidos na ordem escolhida. '
                        + ('Texto e imagens conferidos.' if comprimir else 'Compressão desativada.')}
