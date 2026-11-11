"""Leitor de encartes em imagem: partes que não dependem dos modelos (OCR e U²-Net ficam fora dos testes)."""
import io
import unittest
from unittest import mock

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter

from modules.ofertas import encarte_imagem as ei


class CorrecoesDoOcrTests(unittest.TestCase):
    def test_letras_trocadas_por_digitos_nas_medidas(self):
        casos = {'YPE SOOML ÁRABE': 'YPE 500ML ÁRABE', 'SACHÊ 9OOML': 'SACHÊ 900ML', 'LAVA LOUÇAS 5OOML': 'LAVA LOUÇAS 500ML',
                 'SABÃO SXI60G (EXCETO COCO)': 'SABÃO 5X160G (EXCETO COCO)', 'TIJUCA IKG': 'TIJUCA 1KG',
                 'XIS SALADA': 'XIS SALADA', 'SIX PACK': 'SIX PACK', 'OVOS BRANCOS': 'OVOS BRANCOS'}
        for antes, depois in casos.items(): self.assertEqual(ei._numeros(antes), depois)

    def test_unidade_pelos_textos_do_preco(self):
        self.assertEqual(ei._unidade('R$ 15,99 cada'), 'CADA')
        self.assertEqual(ei._unidade('R$ 4,29 100g'), '100g')
        self.assertEqual(ei._unidade('R$ 29,90 Kg'), 'KG')
        self.assertEqual(ei._unidade('R$ 29,90Kg'), 'KG')
        self.assertEqual(ei._unidade('R$ 9,99'), '')


class AncorasTests(unittest.TestCase):
    def test_selos_em_linhas_mesmo_desalinhados_e_rotulo_partido(self):
        c = lambda x, y, t, w=120: {'x0': x, 'y0': y, 'x1': x + w, 'y1': y + 12, 'h': 12, 't': t}
        caixas = [c(130, 806, 'Clube de Desconto'), c(460, 807, 'Clube de Desconto'), c(845, 806, 'Clube de Desconto'),
                  c(135, 1190, 'Clube de Desconto'), c(466, 1193, 'Clube de', 52), c(522, 1195, 'Desconto', 60),
                  c(868, 1156, 'CLUBE DE DESCONTO'), c(60, 500, 'PEITO DE FRANGO')]
        ancoras = ei._ancoras(caixas)
        self.assertEqual(len(ancoras), 6)
        self.assertEqual([a['linha'] for a in ancoras], [0, 0, 0, 1, 1, 1])   # o selo do queijo, mais alto, fica na mesma linha
        self.assertEqual(ancoras[4]['x1'], 582)                                # "Clube de" + "Desconto" unidos


def _png(img):
    b = io.BytesIO(); img.save(b, 'PNG'); return b.getvalue()


class RecorteDaFotoTests(unittest.TestCase):
    def test_bandeja_amarela_sobre_fundo_amarelo_sem_sombra_e_sem_selo(self):
        # fundo amarelo com onda mais clara, bandeja de outro amarelo com rótulo azul, sombra alaranjada e um selo vermelho
        img = Image.new('RGB', (300, 240), (255, 185, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((-80, 150, 200, 320), fill=(255, 194, 1))
        sombra = Image.new('L', img.size, 0)                                       # sombra suave, mesmo tom e mais escura
        ImageDraw.Draw(sombra).rounded_rectangle((66, 58, 218, 198), 18, fill=255)
        img = Image.composite(Image.new('RGB', img.size, (232, 150, 5)), img, sombra.filter(ImageFilter.GaussianBlur(4)))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((60, 50, 210, 190), 18, fill=(250, 214, 18))         # bandeja
        d.rectangle((90, 120, 180, 175), fill=(30, 70, 160))                     # rótulo
        d.rectangle((230, 180, 300, 240), fill=(220, 20, 30))                    # selo (apagado antes do recorte)
        with mock.patch('modules.ofertas.recorte_objetos.mascara', lambda im: np.zeros((im.height, im.width))):
            out = Image.open(io.BytesIO(ei.recortar_foto(img, [(228, 178, 300, 240)])))
        alpha = np.asarray(out.getchannel('A'))
        self.assertLess(abs(out.width - 150), 8)                  # só a bandeja: sem sombra (à direita) nem selo
        self.assertLess(abs(out.height - 140), 8)
        self.assertGreater(alpha[out.height // 2, out.width // 2], 250)
        self.assertGreater(alpha[20, out.width // 2], 250)        # topo da bandeja inteiro, apesar da cor parecida com o fundo


class PrecosTests(unittest.TestCase):
    def test_leitura_mais_longa_vence_o_empate_sem_virgula(self):
        # "104,99" lido sem vírgula: "10499", "1049" e "104" — o OCR perde dígito, não inventa
        self.assertEqual(ei._melhor({'1,04': 2, '10,49': 2, '104,99': 2}), '104,99')
        self.assertEqual(ei._melhor({'12,99': 3, '129,90': 1}), '12,99')

    def test_par_de_precos_incoerente_escolhe_candidatos_coerentes(self):
        self.assertEqual(ei._par_coerente('9,99', '12,99', {}, {}), ('9,99', '12,99'))             # já coerente
        self.assertEqual(ei._par_coerente('9,99', '112,99', {'9,99': 12}, {'112,99': 11}), ('9,99', '12,99'))  # "1" do R$
        self.assertEqual(ei._par_coerente('10,49', '149,99', {'10,49': 2, '104,99': 3}, {'149,99': 12}), ('104,99', '149,99'))
        self.assertEqual(ei._par_coerente('5,00', '90,00', {}, {}), ('5,00', '90,00'))            # sem saída: mantém (aviso)

    def test_textos_do_selo_nao_sao_titulo(self):
        for t in ('NO CLUBE DE', 'PREÇO SAIPOR:', 'NESSA PROMOÇÃO', 'LEVE 2 POR:', 'cada', 'EMBALAGEM', 'Leve MAIS, pague MENOS'):
            self.assertTrue(ei.TEXTO_SELO.search(t), t)
        for t in ('WHISKY CHIVAS REGAL 1LT', 'CAIXA TÉRMICA', 'KIT DESODORANTE AEROSOL'):
            self.assertFalse(ei.TEXTO_SELO.search(t), t)


class SeloDaOfertaTests(unittest.TestCase):
    def test_rotulo_solto_na_arte_clara_nao_e_oferta(self):
        img = Image.new('RGB', (400, 100), (245, 245, 250))
        d = ImageDraw.Draw(img)
        d.rectangle((210, 20, 390, 50), fill=(210, 70, 35))                       # selo vermelho
        d.text((220, 28), 'Clube de Desconto', fill='white')
        d.text((20, 28), 'Clube de Descontos', fill=(20, 40, 120))                 # frase do cabeçalho
        self.assertTrue(ei._no_selo(img, {'x0': 215, 'y0': 25, 'x1': 330, 'y1': 42}))
        self.assertFalse(ei._no_selo(img, {'x0': 18, 'y0': 25, 'x1': 135, 'y1': 42}))


class BaseRetaTests(unittest.TestCase):
    def test_produto_atras_do_selo_termina_reto_sem_dente(self):
        img = Image.new('RGB', (200, 200), 'white')
        d = ImageDraw.Draw(img)
        d.rectangle((30, 20, 90, 190), fill=(120, 30, 30))                        # garrafa à esquerda, inteira
        d.rectangle((110, 20, 170, 190), fill=(30, 90, 30))                       # garrafa que desce atrás do selo
        selo = (100, 150, 200, 200)
        with mock.patch('modules.ofertas.recorte_objetos.mascara', lambda im: np.zeros((im.height, im.width))):
            out = Image.open(io.BytesIO(ei.recortar_foto(img, [selo], base=selo)))
        alpha = np.asarray(out.getchannel('A'))
        self.assertLess(out.height, 135)                                         # termina na altura do selo
        self.assertGreater(alpha[-6, 10], 200)                                   # base reta nas duas garrafas
        self.assertGreater(alpha[-6, out.width - 10], 200)


class PaginasSoImagemTests(unittest.TestCase):
    def test_pdf_que_e_foto_da_pagina(self):
        foto = _png(Image.new('RGB', (1228, 1754), (240, 240, 255)))
        with pymupdf.open() as doc:
            p = doc.new_page(width=595, height=842); p.insert_image(p.rect, stream=foto)
            q = doc.new_page(width=595, height=842); q.insert_image(q.rect, stream=foto); q.insert_text((50, 50), 'Peito de frango')
            r = doc.new_page(width=595, height=842); r.insert_image(pymupdf.Rect(0, 0, 200, 200), stream=foto)
            paginas = ei.paginas_so_imagem(doc)
        self.assertEqual(list(paginas), [1])                       # com texto ou imagem pequena: leitor do PDF
        img, fator = paginas[1]
        self.assertAlmostEqual(fator, 1228 / 595, places=1)
        self.assertAlmostEqual(img.width, 1228, delta=25)

    @mock.patch.dict('os.environ', {'INDOOR_OCR': '1'})
    def test_falha_na_leitura_da_imagem_mantem_a_importacao(self):
        from modules import ofertas
        foto = _png(Image.new('RGB', (600, 800), 'white'))
        with pymupdf.open() as doc:
            p = doc.new_page(width=595, height=842); p.insert_image(p.rect, stream=foto)
            pdf = doc.tobytes()
        with mock.patch('modules.ofertas.encarte_imagem.ler_pagina', side_effect=RuntimeError('sem modelo')):
            self.assertEqual(ofertas.ler_paginas_imagem(pdf, []), [])
        lido = {'nome': 'X', 'pagina': 1, 'png': b''}
        with mock.patch('modules.ofertas.encarte_imagem.ler_pagina', return_value=[lido]) as ler:
            self.assertEqual(ofertas.ler_paginas_imagem(pdf, []), [lido])
            self.assertEqual(ofertas.ler_paginas_imagem(pdf, [{'pagina': 1}]), [{'pagina': 1}])   # página já lida pelo PDF
            self.assertEqual(ler.call_count, 1)


if __name__ == '__main__':
    unittest.main()
