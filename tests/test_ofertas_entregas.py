import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_workflow import api
from modules import ofertas
from modules.ofertas import entregas
from storage import connect,uid,now,USUARIO


class EntregaOfertasTests(unittest.TestCase):
    def setUp(self):
        self.user=uid();self.context=USUARIO.set({'id':self.user})
        with patch('threading.Thread.start'):ofertas.garantir()
        entregas.garantir()
        self.temp=tempfile.TemporaryDirectory();self.pasta=Path(self.temp.name)

    def tearDown(self):
        with connect() as db:db.execute('DELETE FROM ofertas_entregas WHERE owner=?',(self.user,))
        USUARIO.reset(self.context);self.temp.cleanup()

    def render(self,status='pronto'):
        ident=uid()
        with connect() as db:db.execute('INSERT INTO ofertas_renders(id,pedido,template,titulo,revision,status,criado,owner) VALUES(?,?,?,?,?,?,?,?)',
            (ident,'pedido','modelo','Campanha',0,status,now(),self.user))
        p=ofertas.PASTA/'renders'/ident;p.mkdir(parents=True)
        if status=='pronto':(p/'video.mp4').write_bytes(b'mp4 original '+ident.encode())
        return ident

    def job(self,ident):return next(j for j in entregas.listar() if j['id']==ident)

    def test_espera_geracao_e_entrega_com_numeracao_sem_zero(self):
        video=self.render('gerando')
        ident=entregas.criar({'ids':[video],'pasta':str(self.pasta),'inicio':1})
        entregas.processar(ofertas.PASTA)
        self.assertEqual(self.job(ident)['itens'][0]['estado'],'aguardando')
        fonte=ofertas.PASTA/'renders'/video/'video.mp4';fonte.write_bytes(b'finalizado')
        with connect() as db:db.execute("UPDATE ofertas_renders SET status='pronto' WHERE id=?",(video,))
        entregas.processar(ofertas.PASTA)
        self.assertEqual((self.pasta/'VT 1.mp4').read_bytes(),b'finalizado')
        self.assertEqual(self.job(ident)['itens'][0]['estado'],'salvo')
        self.assertTrue(fonte.exists())

    def test_ja_prontos_preservam_arquivos_e_numeracao_continua(self):
        (self.pasta/'VT 1.mp4').write_bytes(b'existente')
        ident=entregas.criar({'ids':[self.render(),self.render()],'pasta':str(self.pasta)})
        entregas.processar(ofertas.PASTA)
        self.assertEqual([i['nome'] for i in self.job(ident)['itens']],['VT 2.mp4','VT 3.mp4'])
        self.assertEqual((self.pasta/'VT 1.mp4').read_bytes(),b'existente')

    def test_colisao_depois_do_agendamento_nao_substitui_arquivo(self):
        ident=entregas.criar({'ids':[self.render()],'pasta':str(self.pasta)})
        (self.pasta/'VT 1.mp4').write_bytes(b'outro arquivo')
        entregas.processar(ofertas.PASTA)
        self.assertEqual(self.job(ident)['itens'][0]['estado'],'falhou')
        self.assertEqual((self.pasta/'VT 1.mp4').read_bytes(),b'outro arquivo')

    def test_navegador_so_confirma_apos_receber_e_respeita_dono(self):
        video=self.render();ident=entregas.criar({'ids':[video],'navegador':True,'rotulo':'Minha pasta'})
        entregas.processar(ofertas.PASTA)
        self.assertEqual(self.job(ident)['itens'][0]['estado'],'disponivel')
        context=USUARIO.set({'id':uid()})
        try:
            self.assertEqual(entregas.listar(),[])
            with self.assertRaises(ValueError):entregas.confirmar({'id':ident,'render':video})
            with self.assertRaises(ValueError):entregas.criar({'ids':[video],'navegador':True})
        finally:USUARIO.reset(context)
        entregas.confirmar({'id':ident,'render':video})
        self.assertEqual(self.job(ident)['itens'][0]['estado'],'salvo')

    def test_cancelamento_e_falha_de_render_nao_geram_arquivos(self):
        video=self.render('na_fila');ident=entregas.criar({'ids':[video],'pasta':str(self.pasta)})
        entregas.cancelar(ident);entregas.processar(ofertas.PASTA)
        self.assertEqual(self.job(ident)['itens'][0]['estado'],'cancelado')
        ident=entregas.criar({'ids':[video],'pasta':str(self.pasta)})
        with connect() as db:db.execute("UPDATE ofertas_renders SET status='falhou' WHERE id=?",(video,))
        entregas.processar(ofertas.PASTA)
        self.assertEqual(self.job(ident)['itens'][0]['estado'],'falhou')
        self.assertFalse(list(self.pasta.glob('*.mp4')))

    def test_editor_de_videos_usa_vt_1_vt_2_e_nomes_originais_continuam(self):
        from test_projects_queue import ProjectQueueTests
        job=ProjectQueueTests().queued()
        result=api('/api/plan',dict(job=job['id'],queue=True,folder=str(self.pasta),format='mp4',template='VT'))
        self.assertEqual([f['name'] for f in result['files']],['VT 1.mp4','VT 2.mp4'])
