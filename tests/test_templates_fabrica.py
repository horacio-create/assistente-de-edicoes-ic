import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from modules.ofertas.templates_fabrica import atualizar, resumo

class FabricaTests(unittest.TestCase):
    def test_complementos_atualizam_cinco_templates_com_backup_sem_alterar_personalizados(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t)/'base';dados=Path(t)/'dados';(base/'atualizacoes').mkdir(parents=True)
            manifest={}
            ids=['hora-da-carne','hora-da-feira','momento-do-bebe','sadia','perdigao']
            for nome in ids:
                ident=f'uniforca-{nome}-flexivel';src=base/'templates'/ident;dst=dados/ident
                src.mkdir(parents=True);dst.mkdir(parents=True)
                (src/'index.html').write_text('novo');(dst/'index.html').write_text('antigo')
                manifest[ident]={'index.html':{'antes':resumo(dst/'index.html'),'depois':resumo(src/'index.html')}}
            personalizado=dados/'uniforca-perdigao-flexivel/index.html';personalizado.write_text('personalizado')
            (base/'atualizacoes/complementos-20261023.json').write_text(json.dumps(manifest))
            r=atualizar(base,dados)
            self.assertEqual(sum(status=='atualizado com backup' for _,status in r),4)
            self.assertEqual(personalizado.read_text(),'personalizado')
            for nome in ids[:-1]:
                ident=f'uniforca-{nome}-flexivel'
                self.assertEqual((dados/ident/'index.html').read_text(),'novo')
                self.assertEqual((dados/'.versoes'/ident/'antes-complementos-20261023/index.html').read_text(),'antigo')
            self.assertTrue(all(status!='atualizado com backup' for _,status in atualizar(base,dados)))

    def test_selo_20261026_atualiza_com_backup_sem_sobrescrever_arte_personalizada(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t)/'base';publicados=Path(t)/'dados'
            (base/'atualizacoes').mkdir(parents=True)
            ident='uniforca-hora-da-feira-flexivel'
            src=base/'templates'/ident;dst=publicados/ident
            src.mkdir(parents=True);dst.mkdir(parents=True)
            (src/'index.html').write_text('arte aprovada');(dst/'index.html').write_text('arte aprovada')
            (src/'edicao.js').write_text('novo');(dst/'edicao.js').write_text('anterior')
            manifest={ident:{'index.html':{'antes':resumo(dst/'index.html'),'depois':resumo(src/'index.html')},
                             'edicao.js':{'antes':resumo(dst/'edicao.js'),'depois':resumo(src/'edicao.js')}}}
            (base/'atualizacoes/selos-editor-20261026.json').write_text(json.dumps(manifest))
            self.assertEqual(atualizar(base,publicados),[(ident,'atualizado com backup')])
            self.assertEqual((dst/'edicao.js').read_text(),'novo')
            self.assertEqual((publicados/'.versoes'/ident/'antes-selos-editor-20261026/edicao.js').read_text(),'anterior')
            self.assertEqual(atualizar(base,publicados),[])
            (dst/'index.html').write_text('arte personalizada');(dst/'edicao.js').write_text('anterior')
            self.assertEqual(atualizar(base,publicados),[(ident,'personalizado — preservado')])
            self.assertEqual((dst/'edicao.js').read_text(),'anterior')

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
    def test_quebra_titulo_atualiza_marcas_preserva_personalizacao_e_cria_backup(self):
        with tempfile.TemporaryDirectory() as t:
            base,dados,atual,ident=self.ambiente(Path(t))
            marca='uniforca-sadia-flexivel';novo=base/'templates'/marca;dest=dados/marca
            novo.mkdir();dest.mkdir();(novo/'layout.js').write_text('novo');(dest/'layout.js').write_text('antigo')
            manifest={marca:{'layout.js':{'antes':resumo(dest/'layout.js'),'depois':resumo(novo/'layout.js')}}}
            (base/'atualizacoes/titulos-20261022.json').write_text(json.dumps(manifest))
            atualizar(base,dados)
            self.assertEqual((dest/'layout.js').read_text(),'novo')
            self.assertEqual((dados/'.versoes'/marca/'antes-quebra-titulos-20261022/layout.js').read_text(),'antigo')
            self.assertEqual(atualizar(base,dados),[])
            (dest/'layout.js').write_text('personalizado');atualizar(base,dados)
            self.assertEqual((dest/'layout.js').read_text(),'personalizado')

    def test_manifesto_inclui_somente_os_arquivos_publicados_conferidos(self):
        base=Path(__file__).resolve().parents[1]/'ofertas'
        for arquivo in (base/'atualizacoes').glob('*.json'):
            for ident,arquivos in json.loads(arquivo.read_text()).items():
                for nome,info in arquivos.items():self.assertEqual(resumo(base/'templates'/ident/nome),info['depois'],nome)

if __name__=='__main__':unittest.main()
