import io
import unittest

import pymupdf
from PIL import Image,ImageDraw

from modules.ofertas.encarte import extrair


def imagem(cor,tamanho=(80,100),selo=False):
    im=Image.new('RGBA',tamanho,cor)
    if selo:ImageDraw.Draw(im).rectangle((0,0,tamanho[0],5),fill='yellow')
    out=io.BytesIO();im.save(out,'PNG');return out.getvalue()


class GradeMistaTests(unittest.TestCase):
    def exemplo(self):
        with pymupdf.open() as doc:
            pg=doc.new_page(width=600,height=830)
            for i in range(25):
                x=i%5*120;y=i//5*160
                pg.insert_text((x+12,y+16),f'Produto Teste {i+1:02} 1kg',fontsize=6)
                if i==0:
                    # Produto e fundo unidos; a foto fica abaixo do selo.
                    base=Image.new('RGB',(110,130),'#ddddee')
                    ImageDraw.Draw(base).rectangle((20,65,90,120),fill='green')
                    out=io.BytesIO();base.save(out,'PNG')
                    pg.insert_image(pymupdf.Rect(x+5,y+20,x+115,y+150),stream=out.getvalue())
                    sy=y+40
                else:
                    pg.insert_image(pymupdf.Rect(x+12,y+30,x+76,y+105),stream=imagem('green'))
                    # Duas peças do mesmo produto com fotos acima da descrição.
                    if i==5:
                        pg.insert_text((x+2,y+117),'Oferta Sabores',fontsize=6)
                    sy=y+100
                pg.insert_image(pymupdf.Rect(x+50,sy,x+108,sy+34),stream=imagem('red',(58,34),True))
                pg.insert_text((x+57,sy+27),'2,99',fontsize=18)
                pg.insert_text((x+18,sy+25),'3,99',fontsize=11)
                pg.insert_text((x+88,sy+32),'cada',fontsize=4)
                if i==1:
                    for yy,txt in [(sy+40,'No Clube de'),(sy+44,'Desconto o'),(sy+48,'preco do Kg'),(sy+52,'sai por:')]:
                        pg.insert_text((x+50,yy),txt,fontsize=3)
                    pg.insert_text((x+78,sy+50),'29,90',fontsize=11)
                    pg.insert_text((x+98,sy+57),'KG',fontsize=3)

            return doc.tobytes()

    def test_grade_com_faixas_diferentes_nao_interrompe_e_nao_recorta_selos(self):
        itens=extrair(self.exemplo())
        self.assertEqual(len(itens),25)
        segundo=next(i for i in itens if 'Teste 02' in i['nome'])
        self.assertEqual((segundo['de'],segundo['por'],segundo['equivalenciapreco']),('3,99','2,99','29,90'))
        primeiro=next(i for i in itens if 'Teste 01' in i['nome'])
        self.assertTrue(any('unida ao fundo' in a for a in primeiro['avisos']))
        for item in itens:
            self.assertEqual(item['por'],'2,99')
            with Image.open(io.BytesIO(item['png'])) as foto:
                pixels=list(foto.convert('RGB').get_flattened_data())
                self.assertFalse(any(r>225 and g<45 and b<45 for r,g,b in pixels),item['nome'])
        # A próxima linha não recebe a imagem verde da arte composta anterior.
        regular=next(i for i in itens if 'Teste 06' in i['nome'])
        self.assertFalse(any('unida ao fundo' in a for a in regular['avisos']))
