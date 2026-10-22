"""Atualização pontual dos três templates de fábrica; personalizações são preservadas."""
import hashlib
import json
import shutil
from pathlib import Path

def resumo(arquivo):
    if not arquivo.is_file(): return None
    dados = arquivo.read_bytes()
    if arquivo.suffix in ('.html', '.js', '.css', '.json', '.md'): dados = dados.replace(b'\r\n', b'\n')
    return hashlib.sha256(dados).hexdigest()

def _atualizar_manifesto(base, publicados, arquivo, backup):
    manifest = base / 'atualizacoes' / arquivo
    if not manifest.is_file(): return []
    resultados = []
    for ident, arquivos in json.loads(manifest.read_text('utf-8')).items():
        origem, destino = base / 'templates' / ident, publicados / ident
        if not destino.is_dir() or origem.resolve() == destino.resolve(): continue
        if ident not in ('uniforca-hora-da-carne-flexivel', 'uniforca-hora-da-feira-flexivel', 'uniforca-momento-do-bebe-flexivel', 'uniforca-sadia-flexivel', 'uniforca-perdigao-flexivel'): continue
        # Mudanças de conteúdo do designer impedem a atualização do conjunto; capa personalizada é mantida.
        seguros = all(resumo(destino / nome) in (info['antes'], info['depois'], *info.get('intermediarios', []))
                      for nome, info in arquivos.items() if nome != 'capa.png')
        if not seguros:
            resultados.append((ident, 'personalizado — preservado')); continue
        alterar = [(nome, info) for nome, info in arquivos.items()
                   if resumo(destino / nome) != info['depois']
                   and (nome != 'capa.png' or resumo(destino / nome) == info['antes'])]
        if not alterar: continue
        copia = publicados / '.versoes' / ident / backup
        if not copia.exists():
            copia.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(destino, copia)
        for nome, info in alterar:
            entrada, saida = origem / nome, destino / nome
            if resumo(entrada) != info['depois']: raise ValueError('Template de fábrica não corresponde à atualização conferida.')
            saida.parent.mkdir(parents=True, exist_ok=True)
            temporario = saida.with_name(saida.name + '.atualizando')
            shutil.copyfile(entrada, temporario)
            temporario.replace(saida)
        resultados.append((ident, 'atualizado com backup'))
    return resultados


def atualizar(base, publicados):
    resultados = []
    for arquivo, backup in [('templates-20261022.json', 'antes-editor-lotes-20261022'),
                            ('titulos-20261022.json', 'antes-quebra-titulos-20261022'),
                            ('selo-original-20261022.json', 'antes-selo-original-20261022')]:
        resultados.extend(_atualizar_manifesto(base, publicados, arquivo, backup))
    return resultados
