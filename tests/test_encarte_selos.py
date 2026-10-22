"""Selos são âncoras de ofertas, nunca fotos dos produtos."""
import io
import unittest

import pymupdf
from PIL import Image, ImageDraw


def png(cor, tamanho=(80, 100), selo=False):
    im = Image.new('RGBA', tamanho, cor)
    if selo:
        ImageDraw.Draw(im).rectangle((0, 0, tamanho[0], 8), fill='yellow')
    out = io.BytesIO()
    im.save(out, 'PNG')
    return out.getvalue()


class SelosComoAncorasTests(unittest.TestCase):
    def test_duas_ofertas_com_precos_e_variantes_sem_incluir_selo(self):
        from modules.ofertas.encarte import extrair
        with pymupdf.open() as doc:
            pg = doc.new_page(width=600, height=320)
            for x in (0, 300):
                foto = pg.insert_image(pymupdf.Rect(x+40, 80, x+115, 200), stream=png('green'))
                pg.insert_image(pymupdf.Rect(x+80, 90, x+155, 210), xref=foto)
                pg.insert_image(pymupdf.Rect(x+150, 210, x+250, 268), stream=png('red', (100, 58), True))
                pg.insert_text((x+40, 60), 'Produto Verde Sabores 500g', fontsize=10)
                pg.insert_text((x+160, 253), '13,99', fontsize=24)
                pg.insert_text((x+80, 252), '19,99', fontsize=17)
                pg.insert_text((x+215, 265), 'CADA', fontsize=7)
            itens = extrair(doc.tobytes())
        self.assertEqual(len(itens), 2)
        for it in itens:
            self.assertEqual((it['nome'], it['de'], it['por'], it['unidade']),
                             ('Produto Verde Sabores 500g', '19,99', '13,99', 'CADA'))
            with Image.open(io.BytesIO(it['png'])) as im:
                pixels = list(im.convert('RGBA').get_flattened_data())
                self.assertFalse(any(r > 225 and g < 45 and b < 45 and a > 128 for r, g, b, a in pixels))
                self.assertGreater(im.width, 80)  # as duas embalagens, não só uma

    def test_embalagens_vermelhas_sem_preco_dentro_nao_ativam_perfil(self):
        from modules.ofertas.encarte_selos import extrair_pagina
        with pymupdf.open() as doc:
            pg = doc.new_page(width=600, height=320)
            for x in (30, 330):
                pg.insert_image(pymupdf.Rect(x, 50, x+100, 108), stream=png('red', (100, 58), True))
                pg.insert_text((x, 180), '19,99', fontsize=22)
            self.assertIsNone(extrair_pagina(pg, doc))
