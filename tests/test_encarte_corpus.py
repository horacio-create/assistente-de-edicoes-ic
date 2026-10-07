"""Extrator de encartes contra encartes reais conferidos à mão (fixtures/encartes-conferidos.json).

Os PDFs são de clientes e ficam fora do repositório: aponte OFERTAS_ENCARTES para a pasta que os contém
(procurados em subpastas, identificados pelo SHA-256). Sem a variável, os testes são pulados.
    OFERTAS_ENCARTES="/caminho/dos/encartes" .venv/bin/python -m unittest tests.test_encarte_corpus -v
"""
import hashlib
import json
import os
import re
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
from modules.ofertas.encarte import extrair  # noqa: E402

ESPERADO = json.loads((RAIZ / 'tests' / 'fixtures' / 'encartes-conferidos.json').read_text('utf-8'))
PASTA = os.environ.get('OFERTAS_ENCARTES')
PDFS = {}
if PASTA and Path(PASTA).is_dir():
    for f in Path(PASTA).rglob('*.pdf'):
        PDFS.setdefault(hashlib.sha256(f.read_bytes()).hexdigest(), f)

palavras = lambda t: set(re.findall(r'[a-zà-ú0-9]{2,}', t.lower()))


def parecido(a, b):
    a, b = palavras(a), palavras(b)
    return len(a & b) / max(1, min(len(a), len(b)))


@unittest.skipUnless(PDFS, 'defina OFERTAS_ENCARTES com a pasta dos encartes de referência')
class EncartesConferidosTests(unittest.TestCase):
    def test_encontra_cada_oferta_conferida_com_os_precos_certos(self):
        for sha, ref in ESPERADO.items():
            if sha not in PDFS: continue
            with self.subTest(encarte=ref['arquivo']):
                itens = extrair(PDFS[sha].read_bytes())
                faltando = []
                for o in ref['ofertas']:
                    achou = [i for i in itens if i['por'] == o['por'] and parecido(i['nome'], o['nome']) >= .6]
                    if not achou: faltando.append(f"{o['nome']} ({o['por']})"); continue
                    i = max(achou, key=lambda i: parecido(i['nome'], o['nome']))  # "Peito de Frango" ≠ "Filezinho de Peito de Frango"
                    if o['de']: self.assertEqual(i['de'], o['de'], o['nome'])
                    if o['unidade']: self.assertEqual(i['unidade'].upper(), o['unidade'], o['nome'])
                self.assertEqual(faltando, [], f"{ref['arquivo']}: ofertas não encontradas")
                if ref['completo']: self.assertEqual(len(itens), len(ref['ofertas']), 'produtos a mais ou a menos')


if __name__ == '__main__':
    unittest.main()
