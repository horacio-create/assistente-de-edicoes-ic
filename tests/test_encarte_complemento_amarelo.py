import io
import unittest

import pymupdf
from PIL import Image

from modules.ofertas.encarte import extrair, ler_area


class ComplementoAmareloTests(unittest.TestCase):
    def exemplo(self, legenda=True):
        out = io.BytesIO()
        Image.new('RGBA', (80,100), (100,160,80,230)).save(out,'PNG')
        with pymupdf.open() as doc:
            pg = doc.new_page(width=400,height=300)
            for x in (0,200):
                pg.insert_image(pymupdf.Rect(x+20,60,x+90,160),stream=out.getvalue())
                pg.insert_text((x+20,45),'Alho Granel 100g' if not x else 'Outro Produto Kg',fontsize=10)
                pg.insert_text((x+100,176),'2,49',fontsize=22)
                pg.insert_text((x+60,175),'3,49',fontsize=15)
                pg.insert_text((x+125,184),'100g',fontsize=6)
            if legenda:
                for y,t in [(192,'No Clube de'),(196,'Desconto o'),(200,'preco do Kg'),(204,'sai por:')]:
                    pg.insert_text((100,y),t,fontsize=3)
            pg.insert_text((123,202),'24,90',fontsize=12)
            pg.insert_text((147,209),'KG',fontsize=3)
            return doc.tobytes()

    def test_fonte_pequena_e_complemento_apenas_na_oferta_correta(self):
        itens=extrair(self.exemplo())
        self.assertEqual(len(itens),2)
        alho=next(i for i in itens if 'Alho' in i['nome'])
        self.assertEqual((alho['por'],alho['de'],alho['unidade']),('2,49','3,49','100g'))
        self.assertEqual(alho['equivalenciapreco'],'24,90')
        self.assertEqual(alho['equivalenciaunidade'],'kg')
        self.assertNotIn('equivalenciapreco',next(i for i in itens if 'Outro' in i['nome']))

    def test_marcacao_manual_preserva_complemento(self):
        alho=ler_area(self.exemplo(),1,[0,20,190,220])
        self.assertEqual(alho['equivalenciapreco'],'24,90')
        self.assertEqual(alho['por'],'2,49')

    def test_nao_inventa_equivalencia_sem_legenda(self):
        self.assertTrue(all('equivalenciapreco' not in i for i in extrair(self.exemplo(False))))
