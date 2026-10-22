import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from modules.ofertas.templates_fabrica import atualizar, resumo

class FabricaTests(unittest.TestCase):
    def ambiente(self,pasta):
        base=pasta/'base';dados=pasta/'dados';ident='uniforca-hora-da-carne-flexivel'
        novo=base/'templates'/ident;atual=dados/ident;novo.mkdir(parents=True);atual.mkdir(parents=True)
        (atual/'index.html').write_text('antigo\n');(novo/'index.html').write_text('novo\n')
        (novo/'assets').mkdir();(novo/'assets/selo.js').write_text('novo selo')
        arquivos={'index.html':{'antes':resumo(atual/'index.html'),'depois':resumo(novo/'index.html')},'assets/selo.js':{'antes':None,'depois':resumo(novo/'assets/selo.js')}}
        (base/'atualizacoes').mkdir();(base/'atualizacoes/templates-20261022.json').write_text(json.dumps({ident:arquivos}))
        return base,dados,atual,ident
    def test_atualiza_com_backup_e_segunda_execucao_nao_modifica(self):
        with tempfile.TemporaryDirectory() as t:
            base,dados,atual,ident=self.ambiente(Path(t))
            (atual/'index.html').write_bytes(b'antigo\r\n')
            self.assertEqual(atualizar(base,dados),[(ident,'atualizado com backup')])
            self.assertEqual((atual/'index.html').read_text(),'novo\n')
            self.assertEqual((dados/'.versoes'/ident/'antes-editor-lotes-20261022/index.html').read_bytes(),b'antigo\r\n')
            self.assertEqual(atualizar(base,dados),[])
    def test_personalizacao_impede_substituicao_do_conjunto(self):
        with tempfile.TemporaryDirectory() as t:
            base,dados,atual,ident=self.ambiente(Path(t));(atual/'index.html').write_text('personalizado')
            self.assertEqual(atualizar(base,dados),[(ident,'personalizado — preservado')])
            self.assertEqual((atual/'index.html').read_text(),'personalizado');self.assertFalse((atual/'assets/selo.js').exists())
    def test_manifesto_inclui_somente_os_arquivos_publicados_conferidos(self):
        base=Path(__file__).resolve().parents[1]/'ofertas'
        manifesto=json.loads((base/'atualizacoes/templates-20261022.json').read_text())
        for ident,arquivos in manifesto.items():
            for nome,info in arquivos.items():self.assertEqual(resumo(base/'templates'/ident/nome),info['depois'],nome)

if __name__=='__main__':unittest.main()
