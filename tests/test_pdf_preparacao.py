import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf

class PreparacaoPDFTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Importar só após a descoberta: outros testes configuram o banco isolado.
        global preparar_pdf
        from modules.ofertas.pdf_preparacao import preparar_pdf

    def exemplo(self, pasta, paginas=2):
        arquivo = Path(pasta) / 'encarte.pdf'
        with pymupdf.open() as doc:
            for i in range(paginas):
                page = doc.new_page()
                page.insert_text((40, 60), f'Produto {i+1} - R$ 19,99')
            doc.set_metadata({'subject': 'dados de edicao ' * 20000})
            doc.save(arquivo)
        return arquivo

    def test_reduz_sem_perder_texto_paginas_nem_original(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = self.exemplo(pasta)
            original = arquivo.read_bytes()
            resultado = preparar_pdf(arquivo)
            self.assertTrue(resultado['reduzido'])
            self.assertLess(resultado['final'], resultado['original'])
            self.assertEqual(arquivo.with_suffix('.original.pdf').read_bytes(), original)
            with pymupdf.open(arquivo) as doc:
                self.assertEqual(len(doc), 2)
                self.assertIn('19,99', doc[1].get_text())
            self.assertFalse(arquivo.with_suffix('.preparando.pdf').exists())

    def test_diferenca_visual_em_qualquer_pagina_mantem_original(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = self.exemplo(pasta)
            original = arquivo.read_bytes()
            with patch('modules.ofertas.pdf_preparacao._mesma_pagina', side_effect=[True, False]):
                resultado = preparar_pdf(arquivo)
            self.assertFalse(resultado['reduzido'])
            self.assertEqual(arquivo.read_bytes(), original)
            self.assertFalse(arquivo.with_suffix('.preparando.pdf').exists())

    def test_falha_na_otimizacao_mantem_original(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = self.exemplo(pasta)
            original = arquivo.read_bytes()
            with patch.object(pymupdf.Document, 'insert_pdf', side_effect=RuntimeError('falha')):
                self.assertFalse(preparar_pdf(arquivo)['reduzido'])
            self.assertEqual(arquivo.read_bytes(), original)

    def test_limite_de_paginas(self):
        with tempfile.TemporaryDirectory() as pasta:
            with self.assertRaisesRegex(ValueError, '20 páginas'):
                preparar_pdf(self.exemplo(pasta, paginas=21))

    def test_pdf_protegido_tem_erro_claro(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = Path(pasta) / 'senha.pdf'
            with pymupdf.open() as doc:
                doc.new_page()
                doc.save(arquivo, encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw='owner', user_pw='user')
            with self.assertRaisesRegex(ValueError, 'senha'):
                preparar_pdf(arquivo)
