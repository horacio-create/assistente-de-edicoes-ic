"""Divisão do pedido salvo preserva os ajustes e enfileira todos os vídeos."""
import unittest, copy, contextlib, sqlite3, json
from unittest.mock import patch
from modules import ofertas

class SaidaVideosTests(unittest.TestCase):
    def executar(self, revisar=False, distribuicao='sequencia', revision=7, erros=False):
        lista={'id':'produtos','tipo':'lista','min':1,'itens':30,'grupo':{'tamanho':2,'incompleto':True,'finalTres':True}}
        produtos=[{'nome':f'Produto {i}', 'por':'9,99','de':'12,99','unidade':'KG','imagem':f'biblioteca:{i:032x}', 'edicao':json.dumps({'v':1,'elementos':{'titulo':{'x':i,'y':2,'escala':1.1}}}), 'estiloselo':'vermelho','tamanho':.8} for i in range(11)]
        origem={'id':'a'*32,'template':'flexivel','revision':7,'titulo':'Sadia','dados':{'produtos':produtos,'validade':'26 a 28 de outubro de 2026','animacoes':False,'ultimacartela':'sozinho','estiloselo':'vermelho'}}
        copia=copy.deepcopy(origem)
        schema={'id':'flexivel','campos':[lista,{'id':'estiloselo','opcoes':['padrao','vermelho']}],'padrao':{'produtos':[{}]}}
        db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
        db.executescript('CREATE TABLE ofertas_pedidos(id,template,titulo,dados,revision,criado,atualizado,owner); CREATE TABLE ofertas_lotes(id,owner,nome,dados,criado);')
        @contextlib.contextmanager
        def conectar():
            with db:yield db
        fila=[]
        with patch.object(ofertas,'get_pedido',return_value=origem),patch.object(ofertas,'esquema',return_value=schema),patch.object(ofertas,'connect',conectar),patch.object(ofertas,'preparar',side_effect=lambda t,d:{'erros':['Título excede o limite'] if erros and d['produtos'][0]['nome']=='Produto 0' else []}),patch.object(ofertas,'registrar'),patch.object(ofertas,'enfileirar',side_effect=lambda p:fila.append(copy.deepcopy(p)) or str(len(fila))):
            try:
                r=ofertas.gerar_todos({'pedido':origem['id'],'revision':revision,'cartelas':4,'impar':'sozinho','distribuicao':distribuicao,'nome':'Sadia','animacoes':False,'revisar':revisar})
            except ValueError:
                self.assertEqual(fila,[]);self.assertEqual(db.execute('SELECT COUNT(*) FROM ofertas_pedidos').fetchone()[0],0);raise
        self.assertEqual(origem,copia)
        pedidos=[json.loads(row['dados']) for row in db.execute('SELECT dados FROM ofertas_pedidos ORDER BY rowid')]
        self.assertEqual([p for d in pedidos for p in d['produtos']],produtos)
        for d in pedidos:
            self.assertEqual(d['validade'],origem['dados']['validade']);self.assertEqual(d['estiloselo'],'vermelho');self.assertFalse(d['animacoes'])
        return r,pedidos,fila
    def test_quatro_cartelas_enfileiram_dois_videos_com_ajustes(self):
        r,pedidos,fila=self.executar()
        self.assertEqual([len(d['produtos']) for d in pedidos],[8,3]);self.assertEqual(len(fila),2)
        self.assertEqual(len(r['videos']),2);self.assertTrue(all(v['render'] for v in r['videos']))
    def test_equilibrar_muda_distribuicao_mantendo_todos(self):
        r,pedidos,fila=self.executar(distribuicao='equilibrar');self.assertEqual([len(d['produtos']) for d in pedidos],[6,5]);self.assertEqual(len(fila),2)
    def test_preparar_para_revisao_cria_dois_sem_renderizar(self):
        r,pedidos,fila=self.executar(revisar=True);self.assertEqual(len(pedidos),2);self.assertEqual(fila,[]);self.assertTrue(r['revisar'])
    def test_revisao_antiga_nao_gera_videos(self):
        with self.assertRaisesRegex(ValueError,'pedido foi alterado'):self.executar(revision=6)

    def test_erro_em_um_video_nao_gera_parte_do_conjunto(self):
        with self.assertRaisesRegex(ValueError,'Vídeo 1: Título excede o limite'):self.executar(erros=True)
