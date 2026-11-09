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


class TagsDoProdutoTests(unittest.TestCase):
    def _pagina(self, nome, com_balao=False):
        from modules.ofertas.encarte import extrair
        with pymupdf.open() as doc:
            pg = doc.new_page(width=600, height=320)
            for x in (0, 300):
                pg.insert_image(pymupdf.Rect(x+40, 80, x+140, 200), stream=png('green'))
                # +18: círculo branco com mão vermelha, pequeno, colado na foto
                selo18 = Image.new('RGBA', (60, 60), (0, 0, 0, 0))
                d = ImageDraw.Draw(selo18); d.ellipse((0, 0, 59, 59), fill='white', outline='red', width=5); d.rectangle((20, 15, 40, 40), fill='red')
                out = io.BytesIO(); selo18.save(out, 'PNG')
                pg.insert_image(pymupdf.Rect(x+120, 70, x+150, 100), stream=out.getvalue())
                pg.insert_image(pymupdf.Rect(x+150, 210, x+250, 268), stream=png('red', (100, 58), True))
                pg.insert_text((x+40, 60), nome, fontsize=10)
                pg.insert_text((x+160, 253), '4,19', fontsize=24)
                pg.insert_text((x+80, 252), '4,59', fontsize=17)
            if com_balao:  # balão vermelho, texto branco, preço amarelo (como nos encartes da Uniforça)
                pg.draw_circle((222, 136), 26, color=None, fill=(189/255, 28/255, 30/255))
                for y, t in [(120, 'Nesta'), (127, 'Embalagem'), (134, '1L Sai Por:')]: pg.insert_text((205, y), t, fontsize=6, color=(1, 1, 1))
                pg.insert_text((205, 152), '1', fontsize=16, color=(236/255, 227/255, 26/255)); pg.insert_text((216, 146), ',59', fontsize=9, color=(236/255, 227/255, 26/255))
            return extrair(doc.tobytes())

    def test_mais18_sai_da_foto_e_vira_tag(self):
        itens = self._pagina('Cerveja Verde Lata 350ml')
        self.assertEqual(len(itens), 2)
        for it in itens:
            self.assertEqual([t['tipo'] for t in it['tags']], ['Maiores de 18'])
            with Image.open(io.BytesIO(it['png'])) as im:
                cores = {c[:3] for c in im.convert('RGBA').get_flattened_data() if c[3] > 128}
            self.assertEqual(cores, {(0, 128, 0)})  # só o produto, sem o selo

    def test_imagem_pequena_em_produto_sem_alcool_e_marca(self):
        itens = self._pagina('Linguica Verde Kg')
        self.assertEqual([t['tipo'] for t in itens[0]['tags']], ['Marca'])

    def test_balao_nesta_embalagem_vira_tag_promocional(self):
        itens = self._pagina('Agua Sanitaria Verde 5L', com_balao=True)
        self.assertEqual((itens[0].get('promopreco'), itens[0].get('promotexto')), ('1,59', 'Nesta Embalagem 1L Sai Por:'))
        self.assertEqual(itens[0].get('promocores'), '#bd1c1e;#ffffff;#ece31a')  # cores do balão no PDF
        self.assertNotIn('promopreco', itens[1])
        self.assertEqual((itens[0]['por'], itens[0]['de']), ('4,19', '4,59'))  # o balão não troca os preços

    def test_salvar_tags_vira_campos_do_produto(self):
        from unittest import mock
        import modules.ofertas as ofertas
        itens = [{'tags': [{'png': b'a', 'tipo': 'Maiores de 18'}, {'png': b'b', 'tipo': 'Marca'}]}, {'tags': []}]
        with mock.patch.object(ofertas, 'salvar_imagem', lambda raw, nome, origem: {'id': 'img-' + raw.decode()}):
            ofertas.salvar_tags(itens, 'encarte.pdf')
        self.assertEqual(itens[0], {'tag1': 'img-a', 'tag1nome': 'Maiores de 18', 'tag2': 'img-b', 'tag2nome': 'Marca'})
        self.assertEqual(itens[1], {})
        lista = {'campos': [{'id': 'nome'}, {'id': 'tag1'}, {'id': 'tag1nome'}, {'id': 'tag2'}, {'id': 'tag2nome'}]}
        destino = [{}]
        ofertas.preencher_lista(lista, destino, [{'nome': 'X', 'imagem': 'i', 'por': '1,00', 'de': '', 'tag1': 'img-a', 'tag1nome': 'Maiores de 18'}])
        self.assertEqual(destino[0], {'nome': 'X', 'tag1': 'biblioteca:img-a', 'tag1nome': 'Maiores de 18', 'tag2': '', 'tag2nome': ''})


class CapacidadeTests(unittest.TestCase):
    def test_editor_comporta_o_encarte_e_cada_video_mantem_15_cartelas(self):
        from modules.ofertas import plano_lote, tamanhos_dos_videos, por_video
        lista = {'id': 'produtos', 'min': 1, 'itens': 150, 'porVideo': 30, 'grupo': {'tamanho': 2, 'incompleto': True, 'finalTres': True}}
        self.assertEqual(por_video(lista), 30)
        self.assertEqual(plano_lote(44, lista, distribuicao='sequencia'), [30, 14])  # padrão: 15 cartelas por vídeo
        self.assertEqual(sum(plano_lote(140, lista)), 140)
        with self.assertRaises(ValueError): tamanhos_dos_videos(44, lista, 16)  # 16 cartelas não cabem num vídeo
        self.assertEqual(por_video({'itens': 30}), 30)  # template antigo, sem porVideo


class TagComTextoPorCimaTests(unittest.TestCase):
    def test_tabela_de_tamanhos_sai_com_os_numeros_de_cada_fralda(self):
        # a moldura da tabela é a mesma imagem em todas as fraldas; os números são texto do PDF por cima
        from modules.ofertas.tags import completar
        moldura = io.BytesIO(); Image.new('RGB', (60, 60), 'white').save(moldura, 'PNG')
        with pymupdf.open() as doc:
            pg = doc.new_page(width=400, height=200)
            itens = []
            for x, numeros in ((20, ('M 18', 'G 16')), (220, ('M 52', 'G 44'))):
                r = pymupdf.Rect(x, 20, x + 120, 140)
                pg.insert_image(r, stream=moldura.getvalue())
                for k, t in enumerate(numeros): pg.insert_text((x + 10, 50 + k * 30), t, fontsize=14)
                itens.append({'nome': 'Fralda', 'pagina': 1, 'area': [x, 0, x + 150, 190],
                              'tags': [{'png': moldura.getvalue(), 'tipo': 'Tamanhos e quantidades', 'rect': pymupdf.Rect(r)}]})
            sem_texto = {'png': b'logo', 'tipo': 'Marca', 'rect': pymupdf.Rect(300, 150, 320, 170)}
            itens[1]['tags'].append(sem_texto)
            completar(pg, itens)
        a, b = itens[0]['tags'][0], itens[1]['tags'][0]
        self.assertNotIn('rect', a)
        self.assertNotEqual(a['png'], moldura.getvalue())
        self.assertNotEqual(a['png'], b['png'])  # cada fralda com a própria tabela
        self.assertEqual(sem_texto['png'], b'logo')  # sem texto por cima: imagem original
        self.assertNotIn('rect', sem_texto)


class GerarMesmoComAvisosTests(unittest.TestCase):
    def test_campos_opcionais_voltam_ao_padrao_e_obrigatorios_continuam(self):
        from modules.ofertas import contornar_avisos
        lista = {'id': 'produtos', 'campos': [
            {'id': 'nome', 'tipo': 'texto', 'max': 10}, {'id': 'por', 'tipo': 'preco'},
            {'id': 'edicao', 'tipo': 'texto', 'opcional': True}, {'id': 'tag1', 'tipo': 'imagem', 'opcional': True}]}
        dados = {'produtos': [{'nome': 'Fralda', 'por': '1,00', 'edicao': '{"x":1}', 'tag1': 'sumiu.png'},
                              {'nome': 'Nome comprido demais', 'por': '', 'edicao': '', 'tag1': ''}]}
        detalhes = [{'campo': 'produtos_1_edicao'}, {'campo': 'produtos_1_tag1'}, {'campo': 'produtos_2_nome'},
                    {'campo': 'produtos_2_por'}, {'campo': 'produtos_9_edicao'}, {'campo': None}]
        self.assertEqual(contornar_avisos(lista, dados, detalhes), 3)
        um, dois = dados['produtos']
        self.assertEqual((um['edicao'], um['tag1']), ('', ''))
        self.assertEqual(dois['nome'], 'Nome compr')
        self.assertEqual(dois['por'], '')  # sem preço: continua impedindo o vídeo
