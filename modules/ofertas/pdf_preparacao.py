"""Redução conservadora de encartes: mantém imagens, texto e transparência."""
import os
from pathlib import Path

import pymupdf

MAX_PDF = 200 * 1024 * 1024
MAX_PAGINAS = 20


def _mesma_pagina(antes, depois):
    if antes.rect != depois.rect or antes.rotation != depois.rotation:
        return False
    # O leitor de ofertas depende da camada de texto e dos objetos de imagem.
    if antes.get_text('words') != depois.get_text('words'):
        return False
    def imagens(pagina):
        return [(i['bbox'], i['transform'], i['width'], i['height'], i['digest'])
                for i in pagina.get_image_info(hashes=True)]
    if imagens(antes) != imagens(depois):
        return False
    escala = min(1, 900 / max(antes.rect.width, antes.rect.height))
    a = antes.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=True)
    b = depois.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=True)
    return (a.width, a.height, a.samples) == (b.width, b.height, b.samples)


def preparar_pdf(arquivo):
    """Só troca a cópia de trabalho após conferir TODAS as páginas.

    O original é mantido ao lado; falhas na otimização não impedem a leitura.
    Não usa JPEG, redução de resolução, OCR nem rasterização do documento.
    """
    arquivo = Path(arquivo)
    tamanho = arquivo.stat().st_size
    if tamanho > MAX_PDF:
        raise ValueError('O limite para encartes PDF é 200 MB por arquivo.')
    resultado = {'original': tamanho, 'final': tamanho, 'reduzido': False,
                 'mensagem': 'O PDF já está compacto. Original mantido.'}
    copia = arquivo.with_suffix('.preparando.pdf')
    try:
        with pymupdf.open(arquivo) as original:
            if original.needs_pass:
                raise ValueError('Este PDF está protegido por senha. Envie uma cópia desbloqueada.')
            if not 1 <= len(original) <= MAX_PAGINAS:
                raise ValueError('Importe PDFs com 1 a 20 páginas por arquivo.')
            try:
                with pymupdf.open() as novo:
                    novo.insert_pdf(original)
                    for pagina in novo:
                        # Dados privados de edição de Illustrator/Corel podem ser enormes.
                        for chave in ('PieceInfo', 'Metadata'):
                            novo.xref_set_key(pagina.xref, chave, 'null')
                    novo.set_metadata({})
                    novo.save(copia, garbage=4, deflate=True)
                if copia.stat().st_size >= tamanho:
                    return resultado
                with pymupdf.open(copia) as novo:
                    if len(novo) != len(original) or any(
                            not _mesma_pagina(original[i], novo[i]) for i in range(len(original))):
                        return resultado | {'mensagem': 'A cópia reduzida não passou na conferência. Original mantido.'}
            except Exception:
                return resultado | {'mensagem': 'Não foi possível reduzir com segurança. Original mantido.'}
        # Guarda o original sem uma janela em que o PDF de trabalho desapareça.
        original_guardado = arquivo.with_suffix('.original.pdf')
        if not original_guardado.exists():
            import shutil
            shutil.copyfile(arquivo, original_guardado)
        os.replace(copia, arquivo)
        return resultado | {'final': arquivo.stat().st_size, 'reduzido': True,
                            'mensagem': 'PDF reduzido e conferido. Texto e imagens preservados.'}
    finally:
        copia.unlink(missing_ok=True)
