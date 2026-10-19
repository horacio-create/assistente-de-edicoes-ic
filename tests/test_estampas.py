import io
import json
import os
import re
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-estampas-tests-')
os.environ.setdefault('INDOOR_DATA', str(Path(SANDBOX.name) / 'data'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pymupdf
from PIL import Image, ImageDraw
import server
from storage import init
from modules import estampas as E

init()
CM = 72 / 2.54


def P(artes):
    """{local: id} → lista de peças da API (uma estampa por local)."""
    return [{'local': l, 'arte': a} for l, a in artes.items()]


def api(path, data=None, query=None, raw=None, method='POST'):
    return server.api(method, path, query or {}, raw if raw is not None else json.dumps(data or {}).encode())


def png(w=3000, h=2000, fundo=None):
    im = Image.new('RGBA' if fundo is None else 'RGB', (w, h), (0, 0, 0, 0) if fundo is None else fundo)
    d = ImageDraw.Draw(im); d.ellipse((w * .1, h * .1, w * .9, h * .9), fill=(30, 120, 210)); d.ellipse((w * .4, h * .4, w * .6, h * .6), fill=(255, 255, 255))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


SVG = (b'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect x="10" y="10" width="280" height="80" fill="#c0392b"/>'
       b'<path d="M20 50 L280 50" stroke="#fff" stroke-width="0.3"/></svg>')


class MedidasTests(unittest.TestCase):
    def test_tabela_e_areas(self):
        self.assertEqual(E.area('comum', 'M', 'frente'), (26, 36, False))
        self.assertEqual(E.area('baby', 'P', 'frente'), (20, 30, False))
        self.assertEqual(E.area('comum', 'XGG', 'frente'), (31, 39.5, True))   # estimado: a confirmar
        self.assertEqual(E.area('comum', 'GG', 'frente'), (28, 38, True))
        self.assertEqual(E.area('comum', 'P', 'costas'), (24, 34, True))       # igual à frente, a confirmar
        self.assertEqual(E.area('baby', 'G', 'manga-direita'), (7, 7, True))
        with self.assertRaises(ValueError): E.area('comum', 'M', 'bolso')

    def test_arte_nunca_passa_da_area_e_nao_distorce(self):
        for prop in (.2, .7, 1, 1.4, 5):
            for tipo, tams in E.TAMANHOS.items():
                for t in tams:
                    for local in E.LOCAIS:
                        aw, ah, _ = E.area(tipo, t, local)
                        w, h = E.encaixe(prop, aw, ah)
                        self.assertLessEqual(w, aw + 1e-9); self.assertLessEqual(h, ah + .011)
                        self.assertTrue(abs(w - aw) < .01 or abs(h - ah) < .02)        # encosta num dos lados
                        self.assertAlmostEqual(w / h, prop, delta=prop * .01)

    def test_ajuste_de_tamanho_e_posicao_nunca_sai_da_area(self):
        for escala in (.2, .55, 1):
            for x in (0, .3, 1):
                for y in (0, .7, 1):
                    w, h, dx, dy = E.colocar(1.6, 26, 36, {'escala': escala, 'x': x, 'y': y})
                    self.assertGreaterEqual(dx, 0); self.assertGreaterEqual(dy, 0)
                    self.assertLessEqual(dx + w, 26 + .01); self.assertLessEqual(dy + h, 36 + .01)
        self.assertEqual(E.colocar(1, 26, 36, {'escala': .5, 'x': .5, 'y': 0})[:2], (13, 13))
        for ruim in ({'escala': 1.2}, {'escala': .1}, {'x': -.1}, {'y': 2}, {'escala': 'grande'}):
            with self.assertRaises(ValueError): E.ajuste_valido(ruim)

    def test_cores_da_camisa_e_contraste(self):
        self.assertEqual(len(E.CORES), 18); self.assertIn('azul-marinho', E.COR_HEX)
        marinho = {'corPrincipal': '#1E2853'}
        self.assertIsNotNone(E.aviso_contraste(marinho, 'azul-marinho'))   # some no tecido
        self.assertIsNone(E.aviso_contraste(marinho, 'branca'))
        self.assertEqual(E.marcacao_para(E.COR_HEX['vermelha']), '#20203C')   # área segura visível na camisa vermelha
        # desenho da equipe ajustado às medidas: do topo do ombro à barra = altura da camisa; mangas espelhadas
        for tipo, tams in E.TAMANHOS.items():
            for tam, dados in tams.items():
                w, h = dados['camisa']; g = E.camisa(w, h, tipo=tipo)
                ys = [float(v) for v in re.findall(r'-?\d+\.?\d*', g['contorno'])[1::2]]
                self.assertAlmostEqual(min(ys), 0, delta=.3); self.assertAlmostEqual(max(ys), h, delta=.3)   # alças das curvas passam um pouco do traço
                (xe, ye), (xd, yd) = g['mangas']
                self.assertAlmostEqual(xe, -xd, delta=w * .02); self.assertGreater(g['fundoGola'], 0)
                self.assertTrue(g['linhas'].startswith('M')); self.assertAlmostEqual(g['espessura'], .3, delta=.05)   # traço de 3 mm

    def test_manga_esquerda_fica_a_direita_na_vista_de_frente(self):
        x_esq, _ = E.posicao_area('comum', 'manga-esquerda', 52, 72, 9, 9)
        x_dir, _ = E.posicao_area('comum', 'manga-direita', 52, 72, 9, 9)
        self.assertGreater(x_esq, 0); self.assertLess(x_dir, 0)


class ArteTests(unittest.TestCase):
    def test_imagem_resolucao_e_fundo_branco(self):
        a = E.ler(png(1000, 1000, fundo=(255, 255, 255)), '.png')
        self.assertTrue(a['fundoBranco'])
        self.assertEqual([v['nivel'] for v in E.avisos_gerais(a)], ['erro'])
        self.assertEqual(E.conferir(a, 26, 26)[0]['nivel'], 'erro')       # 1000 px em 26 cm = 98 dpi
        sem = E.remover_fundo(a['imagem'])
        self.assertEqual(sem.getpixel((2, 2))[3], 0)                         # canto: o fundo ficou transparente
        self.assertEqual(sem.getpixel((sem.width // 2, sem.height // 2))[3], 255)  # o miolo branco da arte continua
        boa = E.ler(png(4000, 4000), '.png')
        self.assertFalse(boa['fundoBranco']); self.assertEqual(E.conferir(boa, 26, 26), [])   # 3200 px em 26 cm > 300 dpi

    def test_vetor_continua_vetor_e_acusa_traco_fino(self):
        a = E.ler(SVG, '.svg')
        self.assertTrue(a['vetor']); self.assertAlmostEqual(a['proporcao'], 280 / 80, delta=.02)
        self.assertTrue(any('fino' in v['texto'] for v in E.conferir(a, 20, 20 / a['proporcao'])))
        pdf = pymupdf.open('pdf', E.pdf_estampa(a, 26, 26 / a['proporcao']))[0]
        self.assertAlmostEqual(pdf.rect.width / CM, 26, delta=.01)
        self.assertEqual(len(pdf.get_images()), 0); self.assertGreater(len(pdf.get_drawings()), 0)
        with self.assertRaises(ValueError): E.ler(b'x', '.cdr')


class ApiTests(unittest.TestCase):
    def test_exporta_todos_os_tamanhos_e_a_conferencia(self):
        cat = api('/api/estampas/catalogo', method='GET')
        self.assertEqual(len(cat['tamanhos']), 8); self.assertEqual(set(cat['tamanhos'][0]['locais']), set(E.LOCAIS))
        frente = api('/api/estampas/arte', query={'name': ['logo.png']}, raw=png(4000, 2000))
        costas = api('/api/estampas/arte', query={'name': ['eap.svg']}, raw=SVG)
        todos = [[t['tipo'], t['tamanho']] for t in cat['tamanhos']]
        conf = api('/api/estampas/conferir', {'pecas': P({'frente': frente['id'], 'costas': costas['id']}), 'tamanhos': todos})
        self.assertEqual(len(conf['itens']), 16)
        with tempfile.TemporaryDirectory() as pasta:
            r = api('/api/estampas/exportar', {'cliente': 'EAP', 'pecas': P({'frente': frente['id'], 'costas': costas['id']}), 'tamanhos': todos, 'folder': pasta})
            # 8 tamanhos (mais de 6): impressão separada em pastas de camisa comum e baby look, conferência na raiz
            nomes = sorted(Path(a).relative_to(Path(pasta).resolve()).as_posix() for a in r['arquivos'])
            # 8 PDFs × 2 locais + 32 mockups (4 vistas × 8 tamanhos) + conferência
            self.assertTrue(r['organizado']); self.assertEqual(len(nomes), 49)
            self.assertIn('Camisa comum - mockups/Mockup EAP - Comum M - Frente.jpg', nomes)
            self.assertEqual(sum(n.startswith('Camisa baby look - mockups/') for n in nomes), 12)
            with Image.open(Path(pasta) / 'Camisa comum - mockups/Mockup EAP - Comum M - Frente.jpg') as im: self.assertEqual(im.size, (1080, 1350))
            self.assertIn('Camisa comum - impressão/Estampa EAP - Comum M - Frente (26 x 13 cm).pdf', nomes)
            self.assertEqual(sum(n.startswith('Camisa baby look - impressão/') for n in nomes), 6)
            self.assertIn('Conferência de estampa EAP.pdf', nomes)
            for nome in nomes:
                if not nome.endswith('cm).pdf'): continue
                w, h = (float(v.replace(',', '.')) for v in re.search(r'\(([\d,]+) x ([\d,]+) cm\)', nome).groups())
                pagina = pymupdf.open('pdf', (Path(pasta) / nome).read_bytes())[0]
                self.assertAlmostEqual(pagina.rect.width / CM, w, delta=.02); self.assertAlmostEqual(pagina.rect.height / CM, h, delta=.02)
            self.assertEqual(len(pymupdf.open('pdf', (Path(pasta) / 'Conferência de estampa EAP.pdf').read_bytes())), 2)
            r2 = api('/api/estampas/exportar', {'cliente': 'EAP Ajuste', 'pecas': [{'local': 'frente', 'arte': frente['id'], 'ajuste': {'escala': .5, 'x': 1, 'y': .5}}], 'tamanhos': [['comum', 'M']], 'folder': pasta, 'mockups': False,
                                                'cor': 'preta', 'conferencia': True})
            self.assertIn('Estampa EAP Ajuste - Comum M - Frente (13 x 6,5 cm).pdf', [Path(a).name for a in r2['arquivos']])
            self.assertIn('camisa Preta', pymupdf.open('pdf', (Path(pasta) / 'Conferência de estampa EAP Ajuste.pdf').read_bytes())[0].get_text())
            self.assertFalse(r2['organizado'])
            with self.assertRaises(server.Conflict):
                api('/api/estampas/exportar', {'cliente': 'EAP', 'pecas': P({'frente': frente['id']}), 'tamanhos': [['comum', 'M']], 'folder': pasta})
            # compactado: um único .zip com a mesma organização dentro
            r3 = api('/api/estampas/exportar', {'cliente': 'EAP Zip', 'pecas': P({'frente': frente['id']}), 'tamanhos': todos, 'folder': pasta, 'zip': True})
            self.assertEqual([Path(a).name for a in r3['arquivos']], ['Estampa EAP Zip.zip'])
            with zipfile.ZipFile(r3['arquivos'][0]) as z: dentro = z.namelist()
            self.assertEqual(len(dentro), 41); self.assertIn('Conferência de estampa EAP Zip.pdf', dentro)
            self.assertIn('Camisa baby look - impressão/Estampa EAP Zip - Baby look P - Frente (20 x 10 cm).pdf', dentro)
        # pela rede: a entrega lista as subpastas para o navegador recriá-las
        token = 'ab' * 16
        api('/api/estampas/exportar', {'cliente': 'Rede', 'pecas': P({'frente': frente['id']}), 'tamanhos': todos, 'folder': 'navegador:' + token, 'conferencia': False, 'mockups': False})
        entregues = server.arquivos_entrega(token)
        self.assertEqual(len(entregues), 8); self.assertTrue(all('/' in n for n in entregues))
        api('/api/entrega-limpar', {'token': token})
        sem = api('/api/estampas/remover-fundo', {'id': api('/api/estampas/arte', query={'name': ['fundo.png']}, raw=png(1200, 1200, fundo=(255, 255, 255)))['id']})
        self.assertEqual(sem['avisos'], [])

    def test_mockups(self):
        from modules import estampas_mockups as M
        logo = api('/api/estampas/arte', query={'name': ['logo.png']}, raw=png(1600, 800))
        r = api('/api/estampas/mockups', {'pecas': P({'frente': logo['id'], 'manga-direita': logo['id']}), 'tamanho': ['baby', 'M'], 'cor': 'preta'})
        self.assertEqual([v['vista'] for v in r['vistas']], list(M.VISTAS))
        self.assertTrue(all(v['imagem'].startswith('data:image/jpeg;base64,') for v in r['vistas']))
        # todas as fotos existem, com medidas; a arte entra só na vista do seu local e só dentro da camisa
        for tipo, tams in E.TAMANHOS.items():
            for tam in tams: self.assertTrue(M.disponivel(tipo, tam), (tipo, tam))
        arte = [{'local': 'frente', 'dados': {'previa': Image.new('RGBA', (400, 200), (255, 0, 0, 255)), 'proporcao': 2}}]
        branca = np.asarray(M.gerar('comum', 'M', 'costas', 'branca', arte)).astype(int)
        frente = np.asarray(M.gerar('comum', 'M', 'frente', 'branca', arte)).astype(int)
        vermelho = lambda a: (a[..., 0] - a[..., 1] > 120)
        self.assertFalse(vermelho(branca).any())
        self.assertGreater(vermelho(frente).sum(), 5000)
        _, mascara, *_ = M._foto('comum-M-frente')
        self.assertFalse((vermelho(frente) & (mascara < .1)).any())
        # recolorir muda só a camisa
        preta = np.asarray(M.gerar('comum', 'M', 'costas', 'preta', arte)).astype(int)
        _, costas, *_ = M._foto('comum-M-costas')
        self.assertLess(preta[costas > .9].mean(), branca[costas > .9].mean() - 100)
        self.assertLessEqual(np.abs(preta[costas < .01] - branca[costas < .01]).max(), 2)

    def test_duas_estampas_no_mesmo_lado(self):
        """Duas logos no peito: cada uma com seu tamanho; na exportação, a frente vira um PDF só com o conjunto."""
        a = api('/api/estampas/arte', query={'name': ['indoor.png']}, raw=png(2000, 500))
        b = api('/api/estampas/arte', query={'name': ['senha.png']}, raw=png(1500, 1500))
        pecas = [{'local': 'frente', 'arte': a['id'], 'ajuste': {'escala': .4, 'x': 0, 'y': 0}},
                 {'local': 'frente', 'arte': b['id'], 'ajuste': {'escala': .3, 'x': 1, 'y': 0}}]
        conf = api('/api/estampas/conferir', {'pecas': pecas, 'tamanhos': [['comum', 'M']]})
        self.assertEqual(conf['sobreposicoes'], [])
        self.assertEqual([i['rotulo'] for i in conf['itens']], ['Frente 1', 'Frente 2'])
        (w1, h1), (w2, h2) = (i['medida'] for i in conf['itens'])
        self.assertAlmostEqual(w1, 26 * .4, delta=.02); self.assertAlmostEqual(w2, h2, delta=.02)   # tamanhos individuais
        with tempfile.TemporaryDirectory() as pasta:
            r = api('/api/estampas/exportar', {'cliente': 'IC', 'pecas': pecas, 'tamanhos': [['comum', 'M']], 'folder': pasta, 'mockups': False, 'conferencia': False})
            self.assertEqual(len(r['arquivos']), 1)
            nome = Path(r['arquivos'][0]).name
            # o conjunto: da borda esquerda da área (logo 1) à direita (logo 2); altura = a maior das duas
            self.assertEqual(nome, f'Estampa IC - Comum M - Frente (26 x {max(h1, h2):g} cm).pdf'.replace('.', ',', 1).replace(',pdf', '.pdf'))
            pagina = pymupdf.open('pdf', Path(r['arquivos'][0]).read_bytes())[0]
            self.assertAlmostEqual(pagina.rect.width / CM, 26, delta=.03)
            self.assertEqual(len(pagina.get_images()), 2)
        # sobrepostas: a conferência acusa e a exportação recusa
        pecas[1]['ajuste'] = {'escala': .4, 'x': 0, 'y': 0}
        self.assertTrue(api('/api/estampas/conferir', {'pecas': pecas, 'tamanhos': [['comum', 'M']]})['sobreposicoes'])
        with self.assertRaises(ValueError):
            api('/api/estampas/exportar', {'cliente': 'IC', 'pecas': pecas, 'tamanhos': [['comum', 'M']], 'folder': SANDBOX.name})

    def test_dados_invalidos(self):
        a = api('/api/estampas/arte', query={'name': ['logo.png']}, raw=png(800, 800))
        for ruim in [{'cliente': '', 'pecas': P({'frente': a['id']}), 'tamanhos': [['comum', 'M']]},
                     {'cliente': 'X', 'pecas': P({}), 'tamanhos': [['comum', 'M']]},
                     {'cliente': 'X', 'pecas': P({'bolso': a['id']}), 'tamanhos': [['comum', 'M']]},
                     {'cliente': 'X', 'pecas': P({'frente': a['id']}), 'tamanhos': [['comum', 'XXG']]},
                     {'cliente': 'X', 'pecas': P({'frente': '../x'}), 'tamanhos': [['comum', 'M']]},
                     {'cliente': 'X', 'pecas': P({'frente': a['id']}), 'tamanhos': []},
                     {'cliente': 'X', 'pecas': P({'frente': a['id']}), 'tamanhos': [['comum', 'M']], 'cor': 'furta-cor'},
                     {'cliente': 'X', 'pecas': [{'local': 'frente', 'arte': a['id'], 'ajuste': {'escala': 3}}], 'tamanhos': [['comum', 'M']]}]:
            with self.assertRaises(ValueError): api('/api/estampas/exportar', ruim | {'folder': SANDBOX.name})
        with self.assertRaises(ValueError): api('/api/estampas/remover-fundo', {'id': api('/api/estampas/arte', query={'name': ['v.svg']}, raw=SVG)['id']})


if __name__ == '__main__':
    unittest.main()
