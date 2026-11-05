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
    def test_complemento_so_na_oferta_com_legenda_sem_trocar_preco_principal(self):
        from modules.ofertas.encarte import extrair
        with pymupdf.open() as doc:
            pg = doc.new_page(width=600, height=360)
            for x in (0, 300):
                pg.insert_image(pymupdf.Rect(x+40,80,x+115,200),stream=png('green'))
                pg.insert_image(pymupdf.Rect(x+150,210,x+250,268),stream=png('red',(100,58),True))
                pg.insert_text((x+40,60),'Produto Verde 100g',fontsize=10)
                pg.insert_text((x+160,253),'3,29',fontsize=24)
                pg.insert_text((x+80,252),'3,79',fontsize=17)
                pg.insert_text((x+215,265),'100g',fontsize=7)
            for y,texto in [(274,'No Clube de'),(280,'Desconto o'),(286,'preco do Kg'),(292,'sai por:')]:
                pg.insert_text((160,y),texto,fontsize=5)
            pg.insert_text((204,294),'32,90',fontsize=14)
            pg.insert_text((225,302),'kg',fontsize=4)
            pg.insert_text((461,110),'Nessa Promo',fontsize=5)
            pg.insert_text((459,117),'500g saem por:',fontsize=5)
            pg.insert_text((465,143),'4,99',fontsize=14)
            itens=extrair(doc.tobytes())
        self.assertEqual(len(itens),2)
        self.assertEqual(itens[0]['equivalenciapreco'],'32,90')
        self.assertEqual(itens[0]['equivalenciaunidade'],'kg')
        self.assertIn('No Clube de',itens[0]['equivalenciatexto'])
        self.assertNotIn('equivalenciapreco',itens[1])
        self.assertNotIn('promopreco',itens[0])
        self.assertEqual(itens[1]['promopreco'],'4,99')
        self.assertEqual(itens[1]['promotexto'],'Nessa Promo 500g saem por:')
        for it in itens:
            self.assertEqual((it['por'],it['de']),('3,29','3,79'))
            self.assertEqual(it['unidade'],'100g')

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


class SelosComTextoVetorialTests(unittest.TestCase):
    def test_base_sem_amarelo_com_mascote_e_mascara_repetida(self):
        from modules.ofertas.encarte import extrair
        with pymupdf.open() as doc:
            pg=doc.new_page(width=600,height=600)
            pg.insert_image(pymupdf.Rect(440,5,560,280),stream=png('blue'))
            for x in (0,300):
                pg.insert_text((x+40,220),'Produto Verde',fontsize=20)
                pg.insert_text((x+40,242),'Congelado Kg',fontsize=20)
                pg.insert_image(pymupdf.Rect(x+40,235,x+130,420),stream=png('green'))
                pg.insert_image(pymupdf.Rect(x+140,400,x+288,486),stream=png('white',(148,86)))
                pg.insert_image(pymupdf.Rect(x+139,400,x+287,486),stream=png('#ef302b',(148,86)))
                pg.insert_text((x+150,414),'CLUBE DE DESCONTO',fontsize=8)
                pg.insert_text((x+155,467),'13,99',fontsize=24)
                pg.insert_text((x+65,470),'19,99',fontsize=17)
                pg.insert_text((x+220,482),'KG',fontsize=7)
            itens=extrair(doc.tobytes())
        self.assertEqual(len(itens),2)
        for it in itens:
            self.assertEqual((it['nome'],it['por'],it['de']),('Produto Verde Congelado Kg','13,99','19,99'))
            with Image.open(io.BytesIO(it['png'])) as im:
                cores={c[:3] for c in im.convert('RGBA').get_flattened_data() if c[3]>128}
            self.assertEqual(cores,{(0,128,0)})


def opaco(cor, tamanho):
    """Imagem sem transparência (sem smask no PDF), como um fundo decorativo."""
    out = io.BytesIO()
    Image.new('RGB', tamanho, cor).save(out, 'PNG')
    return out.getvalue()


class FundosSemTransparenciaTests(unittest.TestCase):
    def test_faixa_de_fundo_atras_do_produto_nao_entra_na_foto(self):
        from modules.ofertas.encarte import extrair
        with pymupdf.open() as doc:
            pg = doc.new_page(width=600, height=320)
            for x in (0, 300):
                pg.insert_image(pymupdf.Rect(x+10, 70, x+290, 205), stream=opaco('pink', (280, 135)))
                pg.insert_image(pymupdf.Rect(x+60, 80, x+160, 200), stream=png('green'))
                pg.insert_image(pymupdf.Rect(x+150, 210, x+250, 268), stream=png('red', (100, 58), True))
                pg.insert_text((x+40, 60), 'Produto Verde 150ml', fontsize=10)
                pg.insert_text((x+160, 253), '7,99', fontsize=24)
                pg.insert_text((x+80, 252), '10,99', fontsize=17)
            itens = extrair(doc.tobytes())
        self.assertEqual(len(itens), 2)
        for it in itens:
            with Image.open(io.BytesIO(it['png'])) as im:
                cores = {c[:3] for c in im.convert('RGBA').get_flattened_data() if c[3] > 128}
            self.assertEqual(cores, {(0, 128, 0)})
            self.assertFalse(any('fundo' in a for a in it['avisos']))

    def test_painel_com_produto_titulo_e_preco_recorta_so_a_foto(self):
        from modules.ofertas.encarte_selos import _foto_sem_transparencia
        with pymupdf.open() as doc:
            pg = doc.new_page(width=600, height=320)
            painel = pymupdf.Rect(10, 40, 290, 200)
            pg.insert_image(painel, stream=opaco('orange', (280, 160)))
            pg.insert_text((170, 70), 'Produto Laranja', fontsize=10)
            selo = pymupdf.Rect(160, 130, 280, 190)
            partes = [(painel, 0, 0, None)]
            png_foto = _foto_sem_transparencia(pg, partes, [(pymupdf.Rect(170, 62, 260, 72), 'Produto Laranja', 10)], selo, None)
        self.assertIsNotNone(png_foto)
        with Image.open(io.BytesIO(png_foto)) as im:
            self.assertLess(im.width / im.height, (160 - 10) / 160 + .05)  # só o lado esquerdo do painel


class CopiasEFundosTests(unittest.TestCase):
    def test_grade_densa_junta_copias_da_mesma_foto_longe_do_selo(self):
        """4 garrafas iguais em fila num destaque: as mais distantes do selo também são do produto."""
        from modules.ofertas.encarte import extrair
        with pymupdf.open() as doc:
            pg = doc.new_page(width=900, height=1300)
            selo = png('red', (100, 58), True)
            for n in range(25):  # grade densa (>= 25 selos) com fotos simples
                x, y = 20 + (n % 5) * 175, 20 + (n // 5) * 200
                pg.insert_image(pymupdf.Rect(x, y+30, x+60, y+120), stream=png('green', (60, 90)))
                pg.insert_image(pymupdf.Rect(x+60, y+130, x+160, y+188), stream=selo)
                pg.insert_text((x, y+20), f'Produto {n} Verde', fontsize=9)
                pg.insert_text((x+70, y+175), '3,29', fontsize=22)
            y = 1050  # destaque: 4 garrafas iguais à esquerda do selo
            garrafa = png('blue', (40, 140))
            xref = pg.insert_image(pymupdf.Rect(20, y, 60, y+140), stream=garrafa)
            for x in (65, 110, 155): pg.insert_image(pymupdf.Rect(x, y, x+40, y+140), xref=xref)
            pg.insert_text((260, y+20), 'Whisky Azul 1L', fontsize=9)
            pg.insert_image(pymupdf.Rect(260, y+70, 360, y+128), stream=selo)
            pg.insert_text((270, y+115), '46,99', fontsize=22)
            itens = extrair(doc.tobytes())
        whisky = next(it for it in itens if it['nome'].startswith('Whisky'))
        with Image.open(io.BytesIO(whisky['png'])) as im:
            self.assertGreater(im.width / im.height, 1.0)  # as 4 garrafas (cada uma é 40x140)

    def test_tirar_fundos_usa_recorte_e_tira_aviso_ou_mantem_foto(self):
        from unittest import mock
        import modules.ofertas as ofertas
        from modules.ofertas import recorte_objetos
        itens = [{'png': b'a', 'avisos': ['Foto com o fundo do encarte: x', 'Sem preço normal'], 'removerfundo': True},
                 {'png': b'b', 'avisos': ['Foto com o fundo do encarte: x'], 'removerfundo': True},
                 {'png': b'c', 'avisos': []}]
        def isolar(png):
            if png == b'b': raise ValueError('Separação incerta')
            return b'sem-fundo'
        with mock.patch.object(recorte_objetos, 'isolar', isolar):
            ofertas.tirar_fundos(itens)
        self.assertEqual((itens[0]['png'], itens[0]['avisos']), (b'sem-fundo', ['Sem preço normal']))
        self.assertEqual((itens[1]['png'], len(itens[1]['avisos'])), (b'b', 1))
        self.assertEqual(itens[2]['png'], b'c')
        self.assertFalse(any('removerfundo' in it for it in itens))
