"""Distribuição sem perda de produtos e migração dos pedidos do template local."""
import unittest
import contextlib
import copy
import json
import sqlite3
from unittest.mock import patch
from modules import ofertas
from modules.ofertas import plano_lote

LISTA = {'min': 1, 'itens': 30, 'grupo': {'tamanho': 2, 'incompleto': True, 'finalTres': True}}

class DistribuicaoLocalTests(unittest.TestCase):
    def test_lote_grava_preferencias_e_mantem_ordem_sem_repetir(self):
        db = sqlite3.connect(':memory:')
        db.row_factory = sqlite3.Row
        db.executescript('CREATE TABLE ofertas_encartes(id,nome,status,itens); CREATE TABLE ofertas_pedidos(id,template,titulo,dados,revision,criado,atualizado,owner);')
        itens = [dict(nome=f'Produto {i}', imagem=str(i), de='5,99', por='3,99', unidade='KG') for i in range(23)]
        db.execute('INSERT INTO ofertas_encartes VALUES(?,?,?,?)', ('a'*32, 'Teste.pdf', 'pronto', json.dumps(itens)))
        lista = copy.deepcopy(LISTA) | {'id':'produtos', 'tipo':'lista', 'campos':[{'id':s} for s in ('nome','imagem','de','por','unidade')]}
        schema = {'id':'flexivel', 'campos':[lista], 'padrao':{'produtos':[dict(nome='',imagem='',de='',por='',unidade='KG')], 'animacoes':True, 'ultimacartela':'sozinho'}}
        @contextlib.contextmanager
        def conexao():
            with db: yield db
        capturados=[]
        def fila(pedido):
            capturados.append(copy.deepcopy(pedido))
            return 'render-teste'
        with patch.object(ofertas,'connect',conexao), patch.object(ofertas,'esquema',return_value=schema), patch.object(ofertas,'preparar',return_value={'erros':[]}), patch.object(ofertas,'registrar'), patch.object(ofertas,'enfileirar',side_effect=fila):
            resultado=ofertas.gerar_todos({'encarte':'a'*32,'template':'flexivel','cartelas':3,'impar':'tres','distribuicao':'sequencia','animacoes':False})
        self.assertEqual(resultado['completados'],0)
        self.assertEqual([len(p['dados']['produtos']) for p in capturados],[6,6,6,5])
        self.assertEqual([it['nome'] for p in capturados for it in p['dados']['produtos']], [it['nome'] for it in itens])
        self.assertTrue(all(p['dados']['animacoes'] is False and p['dados']['ultimacartela']=='tres' for p in capturados))
        with patch.object(ofertas,'connect',conexao), patch.object(ofertas,'esquema',return_value=schema), patch.object(ofertas,'preparar',return_value={'erros':[]}), patch.object(ofertas,'registrar'), patch.object(ofertas,'enfileirar') as renderizar:
            revisao=ofertas.gerar_todos({'encarte':'a'*32,'template':'flexivel','cartelas':3,'impar':'tres','revisar':True})
            renderizar.assert_not_called()
        self.assertTrue(revisao['revisar'])
        self.assertEqual(len(revisao['videos']),4)
        self.assertTrue(all(v['render'] is None and not v['erros'] for v in revisao['videos']))
        self.assertEqual(db.execute('SELECT COUNT(*) FROM ofertas_pedidos').fetchone()[0],8)
        db.close()

    def test_sequencia_e_equilibrado(self):
        self.assertEqual(plano_lote(22, LISTA, 5, 'sozinho', 'sequencia'), [10, 10, 2])
        self.assertEqual(plano_lote(22, LISTA, 5, 'sozinho', 'equilibrar'), [8, 8, 6])

    def test_trio_nao_se_separa_entre_videos(self):
        self.assertEqual(plano_lote(7, LISTA, 3, 'tres', 'sequencia'), [7])
        self.assertEqual(plano_lote(9, LISTA, 3, 'tres', 'sequencia'), [6, 3])
        self.assertEqual(plano_lote(9, LISTA, 3, 'tres', 'equilibrar'), [4, 5])
        self.assertEqual(plano_lote(7, LISTA, 3, 'sozinho', 'sequencia'), [6, 1])

    def test_extremos_sem_perda_repeticao_ou_capacidade_excedida(self):
        for n in range(1, 102):
            for cartelas in (1, 3, 15):
                for impar in ('sozinho', 'tres'):
                    for dist in ('sequencia', 'equilibrar'):
                        tamanhos = plano_lote(n, LISTA, cartelas, impar, dist)
                        self.assertEqual(sum(tamanhos), n, (n, cartelas, impar, dist, tamanhos))
                        self.assertTrue(all(1 <= t <= 30 for t in tamanhos))
                        self.assertTrue(all(t % 2 == 0 for t in tamanhos[:-1]))

    def test_templates_antigos_e_opcoes_invalidas(self):
        fixa = {'itens': 6, 'grupo': {'tamanho': 2}}
        self.assertEqual(plano_lote(7, fixa), [6, 6])
        for opcao in ('sozinho', 'tres', 'inexistente'):
            with self.assertRaises(ValueError): plano_lote(7, fixa, impar=opcao)
        with self.assertRaises(ValueError): plano_lote(7, LISTA, 16)
        with self.assertRaises(ValueError): plano_lote(7, LISTA, distribuicao='errado')

if __name__ == '__main__': unittest.main()
