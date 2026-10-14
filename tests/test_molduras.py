import io
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-molduras-tests-')
os.environ.setdefault('INDOOR_DATA', str(Path(SANDBOX.name) / 'data'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pymupdf
from PIL import Image, ImageDraw
import server
from storage import init
from modules import molduras as M, molduras_geometria as G, molduras_layouts as L, molduras_padroes as P

init()
CM = 72 / 2.54


def api(path, data=None, query=None, raw=None, method='POST'):
    return server.api(method, path, query or {}, raw if raw is not None else json.dumps(data or {}).encode())


def logo_png():
    im = Image.new('RGBA', (900, 400), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse((20, 50, 320, 350), fill=(122, 61, 28, 255)); d.ellipse((80, 110, 260, 290), fill=(242, 177, 52, 255))
    d.rectangle((360, 150, 880, 250), fill=(217, 82, 29, 255))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


LOGO_SVG = (b'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">'
            b'<rect x="40" y="40" width="320" height="120" rx="20" fill="#2e9e4f"/><circle cx="200" cy="100" r="40" fill="#ffffff"/></svg>')


def operadores_cor(pdf):
    doc = pymupdf.open('pdf', pdf); page = doc[0]
    s = b''.join(doc.xref_stream(x) or b'' for x in page.get_contents()).decode('latin-1')
    return {op: len(re.findall(r'(?<![A-Za-z])' + op + r'(?![A-Za-z])', s)) for op in ('k', 'K', 'rg', 'RG')}


class GeometriaTests(unittest.TestCase):
    def test_tamanhos_em_uso_batem_com_as_facas_reais(self):
        # medidas tiradas das facas de corte em "Impressões Moldura Clientes" (folha em cm)
        reais = {32: (81.5, 57.0), 39: (99.0, 67.5), 40: (101.5, 68.0), 43: (108.0, 72.0), 46: (115.5, 76.9)}
        for pol, w, h in G.TAMANHOS:
            g = G.geometria(w, h)
            if pol in reais:
                self.assertAlmostEqual(g['folha']['largura'], reais[pol][0], delta=.05, msg=pol)
                self.assertAlmostEqual(g['folha']['altura'], reais[pol][1], delta=.05, msg=pol)
            j = g['janela']
            self.assertAlmostEqual(j['x1'] - j['x0'], w); self.assertAlmostEqual(j['y1'] - j['y0'], h)
        self.assertEqual(G.geometria(70, 40)['borda'], 4.5)
        self.assertEqual(G.geometria(88, 49)['borda'], 5.5)
        self.assertEqual(G.geometria(88, 49)['escalaAba'], 1.0)
        self.assertGreater(G.geometria(102, 57.5)['escalaAba'], 1.07)  # 46": a aba cresce como no arquivo real

    def test_tv_fora_da_tabela_e_validacao(self):
        e = G.estimar(60)
        self.assertFalse(e['tabela']); self.assertAlmostEqual(e['largura'], 132, delta=2); self.assertAlmostEqual(e['altura'] / e['largura'], .565, delta=.02)
        self.assertEqual(G.estimar(40), {'largura': 88, 'altura': 49, 'tabela': True})
        g = G.geometria(e['largura'], e['altura'])
        self.assertEqual(g['borda'], 5.5)  # bordas fixas também nas TVs grandes
        for ruim in [(10, 10), (300, 150), (100, 20), ('x', 50)]:
            with self.assertRaises(ValueError): G.geometria(*ruim)
        with self.assertRaises(ValueError): G.estimar(200)


class LayoutTests(unittest.TestCase):
    def test_todos_os_layouts_em_varios_tamanhos_geram_pdf_valido(self):
        self.assertEqual([len(s['layouts']) for s in L.catalogo()], [4] * 10)
        self.assertIn('padarias', [s['id'] for s in L.catalogo()])
        for w, h in [(70, 40), (88, 49), (109, 62), (132, 74.5)]:
            g = G.geometria(w, h)
            for seg in L.catalogo():
                for meta in seg['layouts']:
                    r = L.gerar(g, meta['id'])
                    formas = M.validar_formas(r['formas'], seg['paleta'])
                    self.assertGreater(len(formas), 1, meta['id'])
                    self.assertEqual(r['formas'][0]['cor'], r['formas'][0]['cor'])
        g = G.geometria(88, 49)
        proj = {'cliente': 'Teste', 'tv': {'polegadas': 40, 'largura': 88, 'altura': 49}, 'quantidade': 2, 'material': 'PS',
                'cores': L.PALETAS['academias'], 'formas': L.gerar(g, 'academia-cortes')['formas'], 'logoIC': 'auto'}
        pdf = M.folha_pdf(proj, g)
        page = pymupdf.open('pdf', pdf)[0]
        self.assertAlmostEqual(page.rect.width / CM, 101.5, delta=.01); self.assertAlmostEqual(page.rect.height / CM, 68, delta=.01)
        self.assertIn('Quantidade: 2', page.get_text())
        ops = operadores_cor(pdf)
        self.assertGreater(ops['k'], 5); self.assertEqual(ops['rg'], 0)  # tudo em CMYK

    def test_logo_indoor_contrasta_com_o_fundo(self):
        g = G.geometria(88, 49)
        for layout, esperado in [('academia-cortes', 'clara'), ('clinica-cruz', 'escura')]:
            seg = next(s for s in L.catalogo() if any(m['id'] == layout for m in s['layouts']))
            formas = M.validar_formas(L.gerar(g, layout)['formas'], seg['paleta'])
            self.assertEqual(M.variante_logo_ic({'logoIC': 'auto'}, seg['paleta'], formas, g), esperado, layout)
        self.assertEqual(M.variante_logo_ic({'logoIC': 'escura'}, L.PALETAS['academias'], [], g), 'escura')

    def test_cores_da_logo_viram_a_paleta(self):
        im = Image.open(io.BytesIO(logo_png()))
        cores = M.sugerir_papeis(M.juntar([M.cores_da_imagem(im)]), L.PALETAS['restaurantes'])
        perto = lambda a, b: __import__('math').dist(M.rgb(a), M.rgb(b)) < .03
        self.assertTrue(perto(cores['principal'], '#D9521D'))  # a cor com mais área na logo
        trio = [cores['principal'], cores['secundaria'], cores['destaque']]
        for esperada in ('#7A3D1C', '#F2B134', '#D9521D'): self.assertTrue(any(perto(c, esperada) for c in trio), esperada)
        self.assertLess(M.luminancia(cores['escura']), .05); self.assertGreater(M.luminancia(cores['clara']), .8)

    def test_caminhos_invalidos_sao_recusados(self):
        cores = L.PALETAS['corporativo']
        for ruim in ['M0 0 L1', 'M0 0 X1 1 Z', 'L1 1', 'M0 0 L1e9 1 Z', '<script>', 42]:
            with self.assertRaises(ValueError): M.validar_formas([{'d': ruim, 'cor': 'principal'}], cores)
        for ruim in [{'d': 'M0 0 L1 1 Z', 'cor': 'roxo'}, {'d': 'M0 0 L1 1 Z', 'cor': 'principal', 'opacidade': 2}]:
            with self.assertRaises(ValueError): M.validar_formas([ruim], cores)
        with self.assertRaises(ValueError): M.validar_cores({**cores, 'clara': 'branco'})


class PatternTests(unittest.TestCase):
    def test_prontos_no_fundo_ficam_na_folha_e_fora_da_tela(self):
        from shapely.geometry import box
        g = G.geometria(88, 49); s, j = g['sangria'], g['janela']
        for chave in {k for ks in P.POR_SEGMENTO.values() for k in ks}:
            r = P.aplicar_vetor([(None, P.PRONTOS[chave][1])], g, None, 2.5, 1, 30)
            area = P.geometria_d(r[0]['d'])
            self.assertTrue(box(s['x0'] - .01, s['y0'] - .01, s['x1'] + .01, s['y1'] + .01).contains(area), chave)
            self.assertLess(area.intersection(box(j['x0'] + 1, j['y0'] + 1, j['x1'] - 1, j['y1'] - 1)).area, .01, chave)  # nada escondido atrás da tela
        with self.assertRaises(ValueError): P.parametros({'tamanho': 0.1})
        with self.assertRaises(ValueError): P.parametros({'tamanho': 2, 'espacamento': 9})

    def test_pattern_dentro_de_uma_forma_e_recortado_nela(self):
        g = G.geometria(88, 49)
        alvo = {'d': L.ret_d(1, 56, 40, 66), 'regra': None}
        r = P.aplicar_vetor([(None, P.PRONTOS['espiga'][1])], g, alvo, 2, .5, 0)
        x0, y0, x1, y1 = P.geometria_d(r[0]['d']).bounds
        self.assertTrue(x0 >= .99 and y0 >= 55.99 and x1 <= 40.01 and y1 <= 66.01)

    def test_importar_vetor_por_cor_e_imagem(self):
        svg = (b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#c0392b"/>'
               b'<rect x="35" y="35" width="30" height="30" fill="#f1c40f"/></svg>')
        tipo, grupos, aviso = P.importar(svg, '.svg')
        self.assertEqual((tipo, sorted(c for c, _ in grupos)), ('vetor', ['#C0392B', '#F1C40F']))
        vermelho = next(gm for c, gm in grupos if c == '#C0392B'); amarelo = next(gm for c, gm in grupos if c == '#F1C40F')
        self.assertLess(vermelho.intersection(amarelo).area, 1e-4)  # o quadrado amarelo vazou o círculo, como no arquivo
        self.assertEqual(P.importar(logo_png(), '.png')[0], 'imagem')

    def test_api_pattern_de_imagem_vira_camada_no_pdf(self):
        png = api('/api/molduras/padrao', query={'name': ['textura.png']}, raw=logo_png())
        self.assertEqual(png['tipo'], 'imagem')
        tv = {'polegadas': 40, 'largura': 88, 'altura': 49}
        r = api('/api/molduras/padrao-aplicar', {'tv': tv, 'fonte': 'imagem:' + png['id'], 'alvo': 'fundo', 'tamanho': 3, 'espacamento': .5, 'giro': 15})
        vet = api('/api/molduras/padrao-aplicar', {'tv': tv, 'fonte': 'pronto:pao', 'alvo': 'fundo', 'tamanho': 3, 'espacamento': 1, 'giro': 0})
        layout = api('/api/molduras/gerar', {'tv': tv, 'layouts': ['padaria-toldo']})['layouts']['padaria-toldo']['formas']
        formas = layout[:1] + [{'d': r['area'], 'regra': 'evenodd', 'cor': '#FFFFFF', 'opacidade': .6,
                                'imagem': {'id': png['id'], 'tamanho': 3, 'espacamento': .5, 'giro': 15}}]                  + [{'d': f['d'], 'regra': 'evenodd', 'cor': 'destaque'} for f in vet['formas']] + layout[1:]
        proj = {'cliente': 'Padaria', 'tv': tv, 'quantidade': 1, 'material': 'PS', 'segmento': 'padarias', 'layout': 'padaria-toldo',
                'cores': L.PALETAS['padarias'], 'formas': formas, 'logoIC': 'auto'}
        with tempfile.TemporaryDirectory() as pasta:
            saida = api('/api/molduras/exportar', {'projeto': proj, 'folder': pasta})
            dados = Path(next(a for a in saida['arquivos'] if 'Folha' in a)).read_bytes()
            self.assertEqual(len(pymupdf.open('pdf', dados)[0].get_images()), 1)
        with self.assertRaises(ValueError):
            api('/api/molduras/padrao-aplicar', {'tv': tv, 'fonte': 'pronto:inexistente', 'alvo': 'fundo', 'tamanho': 3})
        with self.assertRaises(ValueError):
            api('/api/molduras/salvar', {'projeto': proj | {'formas': [{'d': 'M0 0 L1 1 Z', 'imagem': {'id': '../x', 'tamanho': 3}}]}})


class ApiTests(unittest.TestCase):
    def projeto(self, logo=None, **extra):
        tv = {'polegadas': 43, 'largura': 94.5, 'altura': 53}
        r = api('/api/molduras/gerar', {'tv': tv, 'layouts': ['salao-organico']})
        p = {'cliente': 'Salão Teste', 'tv': tv, 'quantidade': 1, 'material': 'PS', 'segmento': 'saloes', 'layout': 'salao-organico',
             'cores': L.PALETAS['saloes'], 'formas': r['layouts']['salao-organico']['formas'], 'logoIC': 'auto',
             'logo': logo and {'id': logo['id'], 'escala': .8, 'placa': 'bolha', 'placaCor': '#FFFFFF'}}
        return p | extra

    def test_fluxo_completo_logo_projeto_e_pdfs(self):
        cat = api('/api/molduras/catalogo', method='GET')
        self.assertEqual(len(cat['segmentos']), 10); self.assertIn('a', cat['logoIndoor'])
        self.assertEqual(set(cat['padroes']['porSegmento']), {s['id'] for s in cat['segmentos']})
        self.assertEqual(api('/api/molduras/estimar', query={'polegadas': ['43']}, method='GET')['largura'], 94.5)
        png = api('/api/molduras/logo', query={'name': ['logo.png']}, raw=logo_png())
        self.assertFalse(png['vetor']); self.assertAlmostEqual(png['proporcao'], 860 / 300, delta=.05)  # margens vazias não contam
        svg = api('/api/molduras/logo', query={'name': ['logo.svg']}, raw=LOGO_SVG)
        self.assertTrue(svg['vetor']); self.assertAlmostEqual(svg['proporcao'], 320 / 120, delta=.05)
        self.assertTrue(api('/api/molduras/referencia', query={'name': ['post.png']}, raw=logo_png())['cores'])
        sug = api('/api/molduras/sugerir', {'cores': png['cores'], 'segmento': 'restaurantes'})['cores']
        self.assertLess(__import__('math').dist(M.rgb(sug['principal']), M.rgb('#D9521D')), .03)
        placa = api('/api/molduras/placa', {'tv': {'largura': 94.5, 'altura': 53}, 'logo': svg['id'], 'escala': .5, 'placa': 'placa'})
        x0, y0, x1, y1 = placa['rect']; self.assertTrue(placa['placa'].startswith('M'))
        self.assertAlmostEqual((x1 - x0) / (y1 - y0), 320 / 120, delta=.05)

        salvo = api('/api/molduras/salvar', {'projeto': self.projeto(svg)})
        lista = api('/api/molduras/projetos', method='GET')['projetos']
        self.assertIn(salvo['id'], [p['id'] for p in lista])
        aberto = api('/api/molduras/projeto', query={'id': [salvo['id']]}, method='GET')
        self.assertEqual((aberto['cliente'], aberto['logo']['placa'], aberto['tv']['polegadas']), ('Salão Teste', 'bolha', 43))
        api('/api/molduras/salvar', {'id': salvo['id'], 'projeto': self.projeto(svg, cliente='Salão Novo')})
        self.assertEqual(api('/api/molduras/projeto', query={'id': [salvo['id']]}, method='GET')['cliente'], 'Salão Novo')

        with tempfile.TemporaryDirectory() as pasta:
            r = api('/api/molduras/exportar', {'projeto': self.projeto(svg), 'folder': pasta})
            nomes = sorted(Path(a).name for a in r['arquivos'])
            self.assertEqual(nomes, ['Faca de Corte Salão Teste - 43 Polegadas (94,5 x 53 cm).pdf',
                                     'Folha de Impressão Salão Teste - 43 Polegadas (94,5 x 53 cm).pdf'])
            folha = (Path(pasta) / nomes[1]).read_bytes(); faca = (Path(pasta) / nomes[0]).read_bytes()
            fp, kp = pymupdf.open('pdf', folha)[0], pymupdf.open('pdf', faca)[0]
            for p in (fp, kp):
                self.assertAlmostEqual(p.rect.width / CM, 108, delta=.01); self.assertAlmostEqual(p.rect.height / CM, 72, delta=.01)
                self.assertIn('Tamanho: 43" (94,5 x 53 cm)', p.get_text())
            self.assertEqual(operadores_cor(folha)['rg'], 0); self.assertEqual(operadores_cor(faca)['rg'], 0)
            self.assertGreater(len(fp.get_xobjects()), 0)  # logo vetorial entra como forma (não como imagem)
            self.assertEqual(len(fp.get_images()), 0)
            vermelhas = [x for x in kp.get_drawings() if x.get('color') and x['color'][0] > .8 and x['color'][1] < .4]
            self.assertEqual(len(vermelhas), 2)  # contorno externo com a aba + janela da TV
            with self.assertRaises(server.Conflict): api('/api/molduras/exportar', {'projeto': self.projeto(svg), 'folder': pasta})
            r2 = api('/api/molduras/exportar', {'projeto': self.projeto(png), 'folder': pasta, 'folha': 'Folha PNG', 'faca': 'Faca PNG.pdf'})
            self.assertEqual(sorted(Path(a).name for a in r2['arquivos']), ['Faca PNG.pdf', 'Folha PNG.pdf'])
            self.assertEqual(len(pymupdf.open(Path(pasta) / 'Folha PNG.pdf')[0].get_images()), 1)
        api('/api/molduras/excluir', {'id': salvo['id']})
        self.assertNotIn(salvo['id'], [p['id'] for p in api('/api/molduras/projetos', method='GET')['projetos']])

    def test_dados_invalidos(self):
        for ruim in [self.projeto(cliente=' '), self.projeto(layout='inexistente'), self.projeto(quantidade=0), self.projeto(material='Papelão'),
                     self.projeto(tv={'largura': 5, 'altura': 3}), self.projeto(formas=[{'d': 'M0 0 Q1 1 Z', 'cor': 'principal'}])]:
            with self.assertRaises(ValueError): api('/api/molduras/salvar', {'projeto': ruim})
        for ruim in [b'', b'nao e imagem']:
            with self.assertRaises(ValueError): api('/api/molduras/logo', query={'name': ['x.png']}, raw=ruim)
        with self.assertRaises(ValueError): api('/api/molduras/logo', query={'name': ['x.exe']}, raw=logo_png())
        with self.assertRaises(ValueError): api('/api/molduras/projeto', query={'id': ['../../etc']}, method='GET')
        with self.assertRaises(ValueError): api('/api/molduras/gerar', {'tv': {'largura': 88, 'altura': 49}, 'layouts': []})


if __name__ == '__main__':
    unittest.main()
