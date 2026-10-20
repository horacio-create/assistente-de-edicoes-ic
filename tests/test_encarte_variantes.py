"""Embalagens de sabores distintos com caixas transparentes sobrepostas."""
import io
import unittest

import pymupdf
from PIL import Image

from modules.ofertas.encarte import _agrupar, _foto, _recortes


class VariantesDaMesmaOfertaTests(unittest.TestCase):
    def exemplo(self):
        doc = pymupdf.open()
        pagina = doc.new_page(width=400, height=300)
        for x, cor in [(100, 'red'), (130, 'blue'), (195, 'green')]:
            imagem = Image.new('RGBA', (80, 80))
            imagem.paste(cor, (10, 5, 40, 75))
            png = io.BytesIO()
            imagem.save(png, format='PNG')
            pagina.insert_image(pymupdf.Rect(x, 100, x+80, 180), stream=png.getvalue())
        titulos = [(pymupdf.Rect(110, 80, 200, 95), 'Produto Sabores', 10),
                   (pymupdf.Rect(210, 80, 270, 95), 'Outro Produto', 10)]
        return doc, _recortes(pagina), titulos

    def test_duas_variantes_com_mesmo_titulo_saem_na_mesma_foto(self):
        doc, recortes, titulos = self.exemplo()
        try:
            grupos = _agrupar(recortes, doc, titulos)
            self.assertEqual(len(grupos), 2)
            self.assertEqual(tuple(grupos[0]), (100, 100, 210, 180))
            foto = Image.open(io.BytesIO(_foto(doc, [r for r in recortes if grupos[0].contains(r[0])])))
            cores = {c[:3] for _, c in foto.convert('RGBA').getcolors(foto.width*foto.height) if c[3]}
            self.assertIn((255, 0, 0), cores)
            self.assertIn((0, 0, 255), cores)
            self.assertNotIn((0, 128, 0), cores)  # o vizinho fica fora
        finally:
            doc.close()

    def test_caixas_transparentes_sem_titulo_comum_nao_bastam_para_unir(self):
        doc, recortes, _ = self.exemplo()
        try:
            self.assertEqual(len(_agrupar(recortes, doc)), 3)
        finally:
            doc.close()


if __name__ == '__main__':
    unittest.main()
