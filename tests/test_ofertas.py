"""Módulo Ofertas de supermercados, testado pelo app WSGI do toolkit (roteamento + segurança + módulo).
Pula os testes que precisam do motor quando o Node/`npm install` não estão disponíveis."""
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

SANDBOX = tempfile.TemporaryDirectory(prefix='indoor-ofertas-')
TMP = Path(SANDBOX.name)
os.environ['INDOOR_DATA'] = str(TMP / 'data')
os.environ['OFERTAS_TEMPLATES'] = str(TMP / 'templates')
RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
from PIL import Image  # noqa: E402
import server  # noqa: E402
from storage import init, connect  # noqa: E402
from modules import ofertas  # noqa: E402

init()
MODELO = RAIZ / 'ofertas' / 'templates' / 'uniforca-hora-da-carne'
SEM_MOTOR = not ofertas.status()['pronto']


def chamar(metodo, caminho, corpo=None, raw=None, headers=None):
    dados = raw if raw is not None else (json.dumps(corpo).encode() if corpo is not None else b'')
    caminho, _, qs = caminho.partition('?')
    env = {'REQUEST_METHOD': metodo, 'PATH_INFO': caminho, 'QUERY_STRING': qs, 'HTTP_HOST': 'localhost:8080',
           'CONTENT_LENGTH': str(len(dados)), 'wsgi.input': io.BytesIO(dados), 'HTTP_X_INDOOR': '1', **(headers or {})}
    resposta = {}
    corpo = b''.join(server.app(env, lambda s, h: resposta.update(status=s, headers=dict(h))))
    return int(resposta['status'][:3]), corpo, resposta['headers']


def json_de(metodo, caminho, corpo=None, raw=None):
    status, data, _ = chamar(metodo, caminho, corpo, raw)
    return status, json.loads(data)


def png(transparente=True):
    im = Image.new('RGBA', (120, 80), (200, 30, 30, 255))
    if transparente:
        for x in range(30): im.putpixel((x, 0), (0, 0, 0, 0))
    out = io.BytesIO(); im.save(out, 'PNG'); return out.getvalue()


def zipar(pasta, prefixo='', extras=()):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        for f in pasta.rglob('*'):
            if f.is_file(): z.write(f, prefixo + str(f.relative_to(pasta)))
        for nome, conteudo in extras: z.writestr(nome, conteudo)
    return out.getvalue()


class TamanhosDosVideosTests(unittest.TestCase):
    """Gerar todos: quantos produtos vão em cada vídeo."""
    def test_lista_fixa_completa_o_ultimo_video(self):
        fixa = {'itens': 6, 'grupo': {'tamanho': 2}}
        self.assertEqual(ofertas.tamanhos_dos_videos(21, fixa), [6, 6, 6, 6])
        self.assertEqual(ofertas.tamanhos_dos_videos(1, fixa), [6])

    def test_lista_variavel_repete_o_minimo(self):
        variavel = {'itens': 6, 'min': 4, 'grupo': {'tamanho': 2}}
        self.assertEqual(ofertas.tamanhos_dos_videos(10, variavel), [6, 4])  # sem repetir nenhum
        self.assertEqual(ofertas.tamanhos_dos_videos(7, variavel), [4, 4])   # repete 1 (e não 5)
        self.assertEqual(ofertas.tamanhos_dos_videos(14, variavel), [6, 4, 4])
        self.assertEqual(ofertas.tamanhos_dos_videos(3, variavel), [4])

    def test_usuario_escolhe_cartelas_por_video_e_os_videos_saem_equilibrados(self):
        cartelas = {'itens': 30, 'min': 2, 'grupo': {'tamanho': 2}}
        self.assertEqual(ofertas.tamanhos_dos_videos(22, cartelas, 5), [8, 8, 6])  # 11 cartelas: 4 + 4 + 3, não 5 + 5 + 1
        self.assertEqual(ofertas.tamanhos_dos_videos(22, cartelas, 1), [2] * 11)
        self.assertEqual(ofertas.tamanhos_dos_videos(21, cartelas, 2), [4] * 5 + [2])  # ímpar: a última cartela repete 1
        with self.assertRaises(ValueError): ofertas.tamanhos_dos_videos(22, cartelas, 16)
        with self.assertRaises(ValueError): ofertas.tamanhos_dos_videos(22, {'itens': 6, 'grupo': {'tamanho': 2}}, 2)  # lista fixa: 3


class IntegracaoTests(unittest.TestCase):
    def test_modulo_ativo_no_info_e_arquivos_estaticos(self):
        info = server.api('GET', '/api/info', {}, b'')
        self.assertTrue(next(m for m in info['modules'] if m['id'] == 'offers')['active'])
        for nome in ('ofertas.js', 'ofertas.css'):
            self.assertEqual(chamar('GET', '/' + nome)[0], 200)
        html = chamar('GET', '/')[1].decode()
        self.assertIn('data-view="ofertas"', html)
        self.assertNotIn('Ofertas de supermercados · Em breve', html)

    def test_seguranca_do_toolkit_vale_para_o_modulo(self):
        self.assertEqual(chamar('POST', '/api/ofertas/pedidos', {'template': MODELO.name}, headers={'HTTP_X_INDOOR': ''})[0], 400)
        self.assertEqual(chamar('GET', '/api/ofertas/status', headers={'HTTP_HOST': 'malicioso.example'})[0], 400)
        self.assertEqual(chamar('GET', '/api/ofertas/status', headers={'HTTP_ORIGIN': 'http://malicioso.example'})[0], 400)

    def test_status_explica_quando_falta_o_motor(self):
        status, s = json_de('GET', '/api/ofertas/status')
        self.assertEqual(status, 200)
        self.assertIn('pronto', s)
        if not s['pronto']: self.assertIn('Instalar.bat', s['motivo'])

    def test_templates_de_fabrica_sao_copiados_para_os_dados(self):
        chamar('GET', '/api/ofertas/status')
        self.assertTrue((ofertas.TEMPLATES / MODELO.name / 'template.json').is_file())


@unittest.skipIf(SEM_MOTOR, 'motor de Ofertas não instalado (Node.js + npm install em ofertas/motor)')
class FluxoTests(unittest.TestCase):
    def test_pedido_salvar_validar_conflito_e_historico(self):
        status, p = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        self.assertEqual(status, 200, p)
        self.assertEqual(p['validacao'], [])
        p['dados']['produtos'][0]['por'] = 'abc'
        _, r = json_de('POST', '/api/ofertas/pedido-salvar', {'id': p['id'], 'revision': 0, 'titulo': 'X', 'dados': p['dados']})
        self.assertEqual(r['validacao'][0]['campo'], 'produtos_1_por')
        _, g = json_de('POST', '/api/ofertas/gerar', {'id': p['id'], 'revision': 1})
        self.assertFalse(g['ok'])
        self.assertEqual(json_de('POST', '/api/ofertas/pedido-salvar', {'id': p['id'], 'revision': 0, 'dados': p['dados']})[0], 409)

    def test_preview_injeta_dados_com_seguranca(self):
        _, p = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        _, img = json_de('POST', '/api/ofertas/imagem?nome=produto.png', raw=png())
        p['dados']['validade'] = 'Hoje </script><script>alert(1)</script>'
        p['dados']['produtos'][1]['imagem'] = 'biblioteca:' + img['id']
        json_de('POST', '/api/ofertas/pedido-salvar', {'id': p['id'], 'revision': 0, 'dados': p['dados']})
        status, html, headers = chamar('GET', f"/ofertas/preview/{p['id']}/index.html")
        html = html.decode()
        self.assertEqual(status, 200)
        self.assertIn('window.__hfVariables=', html)
        self.assertIn('/ofertas/hf/runtime.js', html)
        self.assertIn('/ofertas/hf/gsap.min.js', html)
        self.assertNotIn('</script><script>alert', html)
        self.assertEqual(headers['X-Frame-Options'], 'SAMEORIGIN')
        self.assertEqual(chamar('GET', f"/ofertas/preview/{p['id']}/entrada/produtos_2_imagem.png")[0], 200)
        self.assertEqual(chamar('GET', f"/ofertas/preview/{p['id']}/assets/fundo.png")[0], 200)
        self.assertEqual(chamar('GET', f"/ofertas/preview/{p['id']}/../../ofertas/motor/package.json")[0], 404)

    def test_publicar_republica_com_versao_e_recusa_quebrado(self):
        dados = zipar(MODELO, 'uniforca-hora-da-carne/', extras=[('uniforca-hora-da-carne/../../fora.txt', 'x')])
        _, r = json_de('POST', '/api/ofertas/templates-publicar', raw=dados)
        self.assertTrue(r['ok'], r)
        self.assertTrue(r['substituiu'])
        self.assertFalse((TMP / 'fora.txt').exists())
        quebrado = TMP / 'quebrado' / MODELO.name
        shutil.copytree(MODELO, quebrado)
        (quebrado / 'index.html').write_text((quebrado / 'index.html').read_text().replace('"id": "produtos_6_tamanho"', '"id": "sobrou"'))
        _, r = json_de('POST', '/api/ofertas/templates-publicar', raw=zipar(quebrado))
        self.assertFalse(r['ok'])
        self.assertTrue(any('sobrou' in e for e in r['erros']))
        with connect() as db:
            acoes = [row['action'] for row in db.execute('SELECT action FROM events')]
        self.assertIn('Template publicado', acoes)  # aparece no Histórico do toolkit

    def test_novo_video_reabre_rascunho_intocado(self):
        _, a = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        _, b = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        self.assertEqual(a['id'], b['id'])  # nada editado: não empilha cópias
        json_de('POST', '/api/ofertas/pedido-salvar', {'id': b['id'], 'revision': 0, 'titulo': 'Editado', 'dados': b['dados']})
        _, c = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        self.assertNotEqual(c['id'], b['id'])  # o editado fica; nasce um novo

    def test_apagar_imagem_recusa_em_uso(self):
        _, img = json_de('POST', '/api/ofertas/imagem?nome=apagar.png', raw=png() + b'apagar')
        _, p = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        p['dados']['produtos'][0]['imagem'] = 'biblioteca:' + img['id']
        json_de('POST', '/api/ofertas/pedido-salvar', {'id': p['id'], 'revision': p['revision'], 'titulo': 'Usa a imagem', 'dados': p['dados']})
        status, r = json_de('POST', '/api/ofertas/imagem-excluir', {'id': img['id']})
        self.assertEqual(status, 400)
        self.assertIn('Usa a imagem', r['error'])
        json_de('POST', '/api/ofertas/pedido-excluir', {'id': p['id']})
        self.assertEqual(json_de('POST', '/api/ofertas/imagem-excluir', {'id': img['id']})[0], 200)
        self.assertEqual(chamar('GET', f"/ofertas/imagem/{img['id']}.png")[0], 404)

    def test_remover_template_e_publicar_de_novo(self):
        copia = TMP / 'copia' / 'teste-remover'
        shutil.copytree(MODELO, copia)
        meta = json.loads((copia / 'template.json').read_text())
        (copia / 'template.json').write_text(json.dumps(meta | {'id': 'teste-remover'}))
        self.assertTrue(json_de('POST', '/api/ofertas/templates-publicar', raw=zipar(copia))[1]['ok'])
        self.assertEqual(json_de('POST', '/api/ofertas/template-remover', {'id': 'teste-remover'})[0], 200)
        self.assertNotIn('teste-remover', [t['id'] for t in json_de('GET', '/api/ofertas/templates')[1]])
        self.assertIn('teste-remover', ofertas.removidos())  # templates de fábrica removidos não são recopiados
        self.assertTrue(json_de('POST', '/api/ofertas/templates-publicar', raw=zipar(copia))[1]['ok'])
        self.assertNotIn('teste-remover', ofertas.removidos())

    def test_arquivos_da_previa_revalidam_por_etag(self):
        _, p = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        caminho = f"/ofertas/preview/{p['id']}/assets/fundo.png"
        status, data, h = chamar('GET', caminho)
        self.assertEqual((status, h['Cache-Control']), (200, 'private, no-cache'))
        status, data, _ = chamar('GET', caminho, headers={'HTTP_IF_NONE_MATCH': h['ETag']})
        self.assertEqual((status, data), (304, b''))

    def test_biblioteca_paginada_no_servidor(self):
        for n in range(5): json_de('POST', f'/api/ofertas/imagem?nome=pagina-{n}.png', raw=png() + f'pagina{n}'.encode())
        _, p1 = json_de('GET', '/api/ofertas/imagens?busca=pagina-&por=2&pagina=1')
        _, p3 = json_de('GET', '/api/ofertas/imagens?busca=pagina-&por=2&pagina=3')
        self.assertEqual((p1['total'], p1['paginas'], len(p1['itens'])), (5, 3, 2))
        self.assertEqual(len(p3['itens']), 1)
        self.assertEqual(json_de('GET', '/api/ofertas/imagens?busca=pagina-&por=2&pagina=99')[1]['pagina'], 3)  # além do fim: última
        _, todas = json_de('GET', '/api/ofertas/imagens?busca=pagina-&por=10')
        self.assertEqual(len({i['id'] for i in todas['itens']}), 5)

    def test_imagem_invalida(self):
        status, r = json_de('POST', '/api/ofertas/imagem?nome=x.png', raw=b'nao e imagem')
        self.assertEqual(status, 400)
        self.assertIn('Não foi possível abrir', r['error'])

    def test_mesma_imagem_nao_duplica_a_biblioteca(self):
        raw = png() + b'dedup'  # bytes extras depois do IEND: arquivo único para este teste
        _, a = json_de('POST', '/api/ofertas/imagem?nome=a.png', raw=raw)
        _, b = json_de('POST', '/api/ofertas/imagem?nome=b.png', raw=raw)
        self.assertEqual(a['id'], b['id'])
        self.assertNotEqual(a['id'], json_de('POST', '/api/ofertas/imagem?nome=c.png', raw=png(False))[1]['id'])

    def test_sem_motor_o_modulo_explica_em_vez_de_quebrar(self):
        from unittest.mock import patch
        with patch.object(ofertas, 'NODE', '/nao/existe/node'):
            status, r = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        self.assertEqual(status, 400)
        self.assertIn('Node.js', r['error'])

    @unittest.skipIf(not shutil.which('ffmpeg'), 'ffmpeg não instalado')
    def test_miniatura_do_video_pronto(self):
        import subprocess
        from storage import uid, now
        ident = uid()
        pasta = ofertas.PASTA / 'renders' / ident
        pasta.mkdir(parents=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=3', '-pix_fmt', 'yuv420p', str(pasta / 'video.mp4')], check=True)
        with connect() as db:
            db.execute("INSERT INTO ofertas_renders(id,pedido,template,titulo,revision,status,criado,iniciado,terminado) VALUES(?,?,?,?,?,'pronto',?,?,?)", (ident, 'p', MODELO.name, 'Teste', 0, now(), now(), now()))
        status, data, headers = chamar('GET', f'/ofertas/video/{ident}.jpg')
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-Type'], 'image/jpeg')
        self.assertTrue(data.startswith(b'\xff\xd8'))  # JPEG
        self.assertTrue((pasta / 'capa.jpg').is_file())  # fica em cache
        self.assertEqual(chamar('GET', f'/ofertas/video/{uid()}.jpg')[0], 404)

    def esperar_encarte(self, ident):
        import time
        for _ in range(200):
            e = next(x for x in json_de('GET', '/api/ofertas/encartes')[1] if x['id'] == ident)
            if e['status'] != 'lendo': return e
            time.sleep(0.05)
        self.fail('leitura do encarte não terminou')

    def pdf_picanha(self):
        import pymupdf
        doc = pymupdf.open()
        page = doc.new_page(width=600, height=400)
        page.insert_image(pymupdf.Rect(50, 80, 250, 220), stream=png())
        page.insert_text((60, 70), 'Picanha Bovina Kg', fontsize=12)
        page.insert_text((80, 270), '49', fontsize=40)
        page.insert_text((128, 255), ',90', fontsize=20)
        page.insert_text((175, 270), 'KG', fontsize=8)
        page.insert_text((60, 300), '59,99', fontsize=16)
        return doc.tobytes()

    def test_produto_em_varias_copias_sai_com_todas_na_foto(self):
        import pymupdf
        from modules.ofertas.encarte import extrair
        doc = pymupdf.open()
        page = doc.new_page(width=600, height=400)
        xref = page.insert_image(pymupdf.Rect(50, 80, 150, 220), stream=png(), keep_proportion=False)
        for x in (120, 190): page.insert_image(pymupdf.Rect(x, 85, x + 100, 225), xref=xref, keep_proportion=False)  # 3 peças encostadas
        page.insert_text((60, 70), 'Maminha Bovina Kg', fontsize=12)
        page.insert_text((80, 270), '49', fontsize=40)
        page.insert_text((128, 255), ',90', fontsize=20)
        page.insert_text((175, 270), 'KG', fontsize=8)
        [item] = extrair(doc.tobytes())
        foto = Image.open(io.BytesIO(item['png']))
        self.assertAlmostEqual(foto.width / foto.height, 240 / 145, delta=0.05)  # as 3 lado a lado, não só uma

    def test_encarte_lido_em_segundo_plano_e_guardado(self):
        status, r = json_de('POST', '/api/ofertas/encarte?nome=teste.pdf', raw=self.pdf_picanha())
        self.assertEqual(status, 200, r)
        self.assertEqual(r['status'], 'lendo')  # responde na hora; quem enviou pode fechar a janela
        e = self.esperar_encarte(r['id'])
        self.assertEqual(e['status'], 'pronto', e)
        item = e['itens'][0]
        self.assertEqual((item['nome'], item['por'], item['de'], item['unidade']), ('Picanha Bovina Kg', '49,90', '59,99', 'KG'))
        self.assertEqual((item['pagina'], item['avisos']), (1, []))  # página e área para o "ver no encarte"
        self.assertEqual(chamar('GET', f"/ofertas/miniatura/{item['imagem']}.png")[0], 200)
        self.assertEqual(chamar('GET', f"/ofertas/encarte/{r['id']}/1.png")[0], 200)
        self.assertEqual(json_de('GET', f"/api/ofertas/encarte-paginas?id={r['id']}")[1], [[600, 400]])
        self.assertEqual(json_de('POST', '/api/ofertas/encarte-excluir', {'id': r['id']})[0], 200)
        self.assertNotIn(r['id'], [x['id'] for x in json_de('GET', '/api/ofertas/encartes')[1]])
        self.assertEqual(chamar('GET', f"/ofertas/miniatura/{item['imagem']}.png")[0], 200)  # a imagem fica na biblioteca
        self.assertEqual(chamar('GET', f"/ofertas/encarte/{r['id']}/1.png")[0], 404)

    def test_conferir_e_excluir_produto_do_encarte(self):
        _, r = json_de('POST', '/api/ofertas/encarte?nome=conferir.pdf', raw=self.pdf_picanha())
        self.esperar_encarte(r['id'])
        status, erro = json_de('POST', '/api/ofertas/encarte-item-salvar', {'id': r['id'], 'k': 0, 'nome': 'Picanha', 'por': '49'})
        self.assertEqual(status, 400)
        self.assertIn('14,99', erro['error'])
        _, it = json_de('POST', '/api/ofertas/encarte-item-salvar', {'id': r['id'], 'k': 0, 'nome': 'Picanha Maturada Kg', 'por': '47,90', 'de': '', 'unidade': 'KG'})
        self.assertEqual((it['nome'], it['por'], it['conferido'], it['avisos']), ('Picanha Maturada Kg', '47,90', True, []))
        self.assertEqual(json_de('POST', '/api/ofertas/encarte-item-excluir', {'id': r['id'], 'k': 0})[0], 200)
        self.assertEqual(next(x for x in json_de('GET', '/api/ofertas/encartes')[1] if x['id'] == r['id'])['itens'], [])
        self.assertEqual(json_de('POST', '/api/ofertas/encarte-item-excluir', {'id': r['id'], 'k': 0})[0], 400)

    def test_encarte_sem_produtos_reconhecidos_permite_marcar_a_mao(self):
        import pymupdf
        doc = pymupdf.open(); doc.new_page().insert_text((50, 50), 'Só texto')
        _, r = json_de('POST', '/api/ofertas/encarte?nome=vazio.pdf', raw=doc.tobytes())
        e = self.esperar_encarte(r['id'])
        self.assertEqual((e['status'], e['itens']), ('pronto', []))
        # marcação na página do encarte da picanha: lê nome e preços dentro da área
        _, r = json_de('POST', '/api/ofertas/encarte?nome=marcar.pdf', raw=self.pdf_picanha())
        self.esperar_encarte(r['id'])
        _, m = json_de('POST', '/api/ofertas/encarte-recortar', {'id': r['id'], 'pagina': 1, 'area': [0.05, 0.1, 0.5, 0.8]})
        self.assertEqual((m['k'], m['item']['nome'], m['item']['por'], m['item']['manual']), (1, 'Picanha Bovina Kg', '49,90', True))
        self.assertIn('Marcado à mão: confira os dados', m['item']['avisos'])
        self.assertEqual(json_de('POST', '/api/ofertas/encarte-recortar', {'id': r['id'], 'pagina': 2, 'area': [0, 0, 1, 1]})[0], 400)

    def test_encarte_em_imagem_e_marcado_a_mao(self):
        foto = io.BytesIO(); Image.new('RGB', (800, 600), 'white').save(foto, 'JPEG')
        _, r = json_de('POST', '/api/ofertas/encarte?nome=encarte.jpg', raw=foto.getvalue())
        self.assertEqual(r['status'], 'pronto')  # imagem não tem texto para ler: vai direto para a marcação
        self.assertEqual(json_de('GET', f"/api/ofertas/encarte-paginas?id={r['id']}")[1], [[800, 600]])
        _, m = json_de('POST', '/api/ofertas/encarte-recortar', {'id': r['id'], 'pagina': 1, 'area': [0.1, 0.1, 0.4, 0.5]})
        self.assertEqual((m['item']['area'], m['item']['nome']), ([80, 60, 320, 300], ''))
        self.assertIn('Preço em destaque não identificado', m['item']['avisos'])
        status, erro = json_de('POST', '/api/ofertas/encarte-gerar-todos', {'encarte': r['id'], 'template': MODELO.name})
        self.assertEqual(status, 400)  # sem preço: precisa conferir antes de gerar
        self.assertIn('sem preço em destaque', erro['error'])

    def test_gerar_todos_os_videos_do_encarte(self):
        _, r = json_de('POST', '/api/ofertas/encarte?nome=Semana 12.pdf', raw=self.pdf_picanha())
        self.esperar_encarte(r['id'])
        _, g = json_de('POST', '/api/ofertas/encarte-gerar-todos', {'encarte': r['id'], 'template': MODELO.name})
        for v in g['videos']:  # não renderiza de verdade no teste
            if v['render']: json_de('POST', '/api/ofertas/render-cancelar', {'id': v['render']})
        self.assertEqual((len(g['videos']), g['completados']), (1, 5))  # 1 produto; template de 6: completa com ele mesmo
        v = g['videos'][0]
        self.assertEqual((v['titulo'], v['erros']), ('Semana 12', []))
        pedido = json_de('GET', f"/api/ofertas/pedido?id={v['pedido']}")[1]
        self.assertTrue(all(p['nome'] == 'Picanha Bovina Kg' and p['por'] == '49,90' for p in pedido['dados']['produtos']))
        # o pedido do lote não é "rascunho intocado": o Novo vídeo não o reaproveita nem apaga
        _, novo = json_de('POST', '/api/ofertas/pedidos', {'template': MODELO.name})
        self.assertNotEqual(novo['id'], v['pedido'])
        self.assertEqual(json_de('GET', f"/api/ofertas/pedido?id={v['pedido']}")[0], 200)

    def test_template_com_quantidade_variavel_de_produtos(self):
        """Lista com "min": o pedido aceita 4 ou 6 produtos e o Gerar todos não repete produtos à toa."""
        pasta = TMP / 'variavel' / 'carne-variavel'
        shutil.copytree(MODELO, pasta)
        meta = json.loads((pasta / 'template.json').read_text())
        meta['id'] = 'carne-variavel'
        meta['campos'][1]['min'] = 4
        (pasta / 'template.json').write_text(json.dumps(meta))
        total = '{ "id": "produtos_total", "type": "number", "label": "Quantidade", "default": 6, "min": 4, "max": 6, "step": 2 },'
        (pasta / 'index.html').write_text((pasta / 'index.html').read_text().replace("data-composition-variables='[", "data-composition-variables='[" + total, 1))
        _, r = json_de('POST', '/api/ofertas/templates-publicar', raw=zipar(pasta, 'carne-variavel/'))
        self.assertTrue(r['ok'], r)
        _, esquema = json_de('GET', '/api/ofertas/esquema?template=carne-variavel')
        lista = esquema['campos'][1]
        self.assertEqual((lista['min'], lista['itens'], len(esquema['padrao']['produtos'])), (4, 6, 6))

        _, pedido = json_de('POST', '/api/ofertas/pedidos', {'template': 'carne-variavel'})
        dados = pedido['dados']
        self.assertEqual(len(dados['produtos']), 4)  # começa com o mínimo, não com o máximo; "Adicionar" traz o resto
        _, salvo = json_de('POST', '/api/ofertas/pedido-salvar', {'id': pedido['id'], 'revision': pedido['revision'], 'titulo': 't', 'dados': dados})
        self.assertEqual(salvo['validacao'], [])
        dados['produtos'] = dados['produtos'][:3]
        _, salvo = json_de('POST', '/api/ofertas/pedido-salvar', {'id': pedido['id'], 'revision': salvo['revision'], 'titulo': 't', 'dados': dados})
        self.assertIn('de 4 a 6 itens', salvo['validacao'][0]['mensagem'])

        _, enc = json_de('POST', '/api/ofertas/encarte?nome=Semana 13.pdf', raw=self.pdf_picanha())
        self.esperar_encarte(enc['id'])
        _, g = json_de('POST', '/api/ofertas/encarte-gerar-todos', {'encarte': enc['id'], 'template': 'carne-variavel'})
        for v in g['videos']:
            if v['render']: json_de('POST', '/api/ofertas/render-cancelar', {'id': v['render']})
        self.assertEqual((len(g['videos']), g['completados'], g['videos'][0]['erros']), (1, 3, []))  # 1 produto: vídeo de 4, não de 6
        lote = json_de('GET', f"/api/ofertas/pedido?id={g['videos'][0]['pedido']}")[1]
        self.assertEqual(len(lote['dados']['produtos']), 4)

        # 9 produtos (ímpar), até 2 cartelas por vídeo: "fora" deixa o 9º de fora; "repetir" completa com o 1º
        import pymupdf
        nove = pymupdf.open()
        for _ in range(9): nove.insert_pdf(pymupdf.open(stream=self.pdf_picanha(), filetype='pdf'))
        _, enc = json_de('POST', '/api/ofertas/encarte?nome=Semana 14.pdf', raw=nove.tobytes())
        self.assertEqual(len(self.esperar_encarte(enc['id'])['itens']), 9)
        def lote(**opcoes):
            _, g = json_de('POST', '/api/ofertas/encarte-gerar-todos', {'encarte': enc['id'], 'template': 'carne-variavel', **opcoes})
            for v in g['videos']:
                if v['render']: json_de('POST', '/api/ofertas/render-cancelar', {'id': v['render']})
            return g
        g = lote(cartelas=2, impar='fora')
        self.assertEqual(([v['titulo'] for v in g['videos']], g['completados']), (['Semana 14 (1)', 'Semana 14 (2)'], 0))
        g = lote(cartelas=2, impar='repetir', nome='  Ofertas FLV  ')
        self.assertEqual([v['titulo'] for v in g['videos']], ['Ofertas FLV (1)', 'Ofertas FLV (2)', 'Ofertas FLV (3)'])
        self.assertEqual((len(g['videos']), g['completados']), (3, 3))  # 5 cartelas em vídeos de no mínimo 2
        self.assertEqual(json_de('POST', '/api/ofertas/encarte-gerar-todos', {'encarte': enc['id'], 'template': 'carne-variavel', 'cartelas': 9})[0], 400)
        self.assertEqual(json_de('POST', '/api/ofertas/encarte-gerar-todos', {'encarte': enc['id'], 'template': 'carne-variavel', 'impar': 'sozinho'})[0], 400)

        # grupo.incompleto: o 9º produto aparece sozinho na última cartela, sem repetir nem descartar
        meta['campos'][1].update(min=1, grupo={**meta['campos'][1]['grupo'], 'incompleto': True})
        (pasta / 'template.json').write_text(json.dumps(meta))
        (pasta / 'index.html').write_text((pasta / 'index.html').read_text().replace('"default": 6, "min": 4, "max": 6, "step": 2', '"default": 6, "min": 1, "max": 6, "step": 1'))
        self.assertTrue(json_de('POST', '/api/ofertas/templates-publicar', raw=zipar(pasta, 'carne-variavel/'))[1]['ok'])
        g = lote(cartelas=3, impar='sozinho')
        self.assertEqual((g['completados'], [v['erros'] for v in g['videos']]), (0, [[], []]))
        ultimo = json_de('GET', f"/api/ofertas/pedido?id={g['videos'][1]['pedido']}")[1]
        self.assertEqual(len(ultimo['dados']['produtos']), 3)  # 6 + 3: a 2ª cartela do último vídeo tem 1 produto

    def test_encarte_recusa_o_que_nao_e_pdf_nem_imagem(self):
        status, r = json_de('POST', '/api/ofertas/encarte?nome=x.pdf', raw=b'nao e pdf')
        self.assertEqual(status, 400)
        self.assertIn('não é um PDF, PNG ou JPG', r['error'])

if __name__ == '__main__':
    unittest.main()
