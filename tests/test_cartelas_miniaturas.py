import json
import unittest
from modules.ofertas.miniaturas_cartelas import chaves, grupos

class CacheMiniaturasTests(unittest.TestCase):
    def test_uma_cartela_alterada_nao_invalida_as_outras(self):
        dados={'validade':'hoje','produtos':[{'nome':str(i),'por':'9,99','edicao':'{}'} for i in range(4)]}
        antes=chaves(dados,'v1');dados['produtos'][0]['edicao']='{"elementos":{"titulo":{"x":4}}}'
        depois=chaves(dados,'v1');self.assertNotEqual(antes[0],depois[0]);self.assertEqual(antes[1],depois[1])
        dados['validade']='amanha';self.assertTrue(all(a!=b for a,b in zip(depois,chaves(dados,'v1'))))
        self.assertNotEqual(chaves(dados,'v1'),chaves(dados,'v2'))
    def test_trio_final_e_produto_sozinho_preservam_a_ordem(self):
        self.assertEqual(list(grupos(5)),[[0,1],[2,3],[4]])
        self.assertEqual(list(grupos(5,True)),[[0,1],[2,3,4]])
        self.assertEqual(list(grupos(1,True)),[[0]])

if __name__=='__main__':unittest.main()
