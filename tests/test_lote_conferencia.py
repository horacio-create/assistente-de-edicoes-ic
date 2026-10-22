"""Lotes persistidos, rastreio de sobras e isolamento por dono; sem renderizar vídeos."""
import json
import unittest
from unittest.mock import patch
try:
    from test_ofertas import ofertas, connect, json_de, chamar, SEM_MOTOR
except ModuleNotFoundError:
    from tests.test_ofertas import ofertas, connect, json_de, chamar, SEM_MOTOR
from storage import now, uid

@unittest.skipIf(SEM_MOTOR,'motor não instalado')
class LoteConferenciaTests(unittest.TestCase):
    def preparar(self, impar):
        chamar('GET','/api/ofertas/status')
        ident=uid()
        itens=[{'nome':f'Produto {i+1}','por':'9,99','de':'12,99','unidade':'KG','imagem':''} for i in range(5)]
        with connect() as db:
            db.execute('INSERT INTO ofertas_encartes(id,nome,status,criado,itens) VALUES(?,?,?, ?,?)',(ident,'Teste lote','pronto',now(),json.dumps(itens)))
        status,r=json_de('POST','/api/ofertas/encarte-gerar-todos',{'encarte':ident,'template':'uniforca-momento-do-bebe-flexivel','cartelas':2,'impar':impar,'revisar':True})
        self.assertEqual(status,200,r)
        status,lote=json_de('GET','/api/ofertas/lote?id='+r['lote']);self.assertEqual(status,200,lote)
        return lote
    def test_lote_preserva_ordem_sem_repetir_e_le_conteudo_atual(self):
        lote=self.preparar('sozinho')
        self.assertEqual([i for v in lote['videos'] for i in v['indices']],[0,1,2,3,4])
        pedido=lote['videos'][0]['pedido'];p=ofertas.get_pedido(pedido);p['dados']['produtos'][0]['nome']='Nome corrigido'
        self.assertEqual(json_de('POST','/api/ofertas/pedido-salvar',{'id':pedido,'revision':p['revision'],'titulo':p['titulo'],'dados':p['dados']})[0],200)
        atual=json_de('GET','/api/ofertas/lote?id='+lote['id'])[1]
        self.assertEqual(atual['videos'][0]['produtos'][0]['nome'],'Nome corrigido')
        self.assertEqual(atual['origem'][0]['nome'],'Produto 1')
    def test_rastreia_produto_repetido_e_produto_fora(self):
        repetido=self.preparar('repetir');indices=[i for v in repetido['videos'] for i in v['indices']]
        self.assertEqual(indices,[0,1,2,3,4,0])
        fora=self.preparar('fora');indices=[i for v in fora['videos'] for i in v['indices']]
        self.assertEqual(indices,[0,1,2,3]);self.assertEqual(len(fora['origem']),5)
    def test_lote_e_miniaturas_nao_expoem_pedidos_de_outro_dono(self):
        lote=self.preparar('sozinho');pedido=lote['videos'][0]['pedido']
        with patch('storage.owner',return_value='outro'),patch.object(ofertas,'owner',return_value='outro'):
            self.assertEqual(json_de('GET','/api/ofertas/lote?id='+lote['id'])[0],400)
            self.assertEqual(json_de('GET','/api/ofertas/cartelas-miniaturas?id='+pedido)[0],400)
            self.assertEqual(chamar('GET',f'/ofertas/cartela/{pedido}/'+32*'a'+'.jpg')[0],400)

if __name__=='__main__':unittest.main()
