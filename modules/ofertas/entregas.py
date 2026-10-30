"""Entrega de MP4s prontos ou em geração, com nomes fixados antes de copiar."""
import json
import os
import re
import shutil
import threading
from pathlib import Path

from storage import ROOT,DATA,connect,mine,owner,uid,now

LOCK=threading.Lock()


def garantir():
    with connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS ofertas_entregas (id TEXT PRIMARY KEY,owner TEXT,pasta TEXT,navegador INTEGER,rotulo TEXT,itens TEXT,criado TEXT)')


def destino(value):
    p=Path(str(value)).expanduser()
    if not p.is_absolute() or not p.is_dir():raise ValueError('Escolha uma pasta existente para receber os vídeos.')
    p=p.resolve()
    if p==ROOT or ROOT in p.parents or p==DATA or DATA in p.parents:
        raise ValueError('Escolha uma pasta de saída fora da aplicação.')
    return p


def criar(value):
    ids=value.get('ids');inicio=value.get('inicio',1);browser=value.get('navegador',False)
    if not isinstance(ids,list) or not 1<=len(ids)<=200 or not all(isinstance(i,str) for i in ids) or len(set(ids))!=len(ids):raise ValueError('Selecione de 1 a 200 vídeos diferentes.')
    if type(inicio) is not int or not 1<=inicio<=99999:raise ValueError('Use uma numeração inicial de 1 a 99999.')
    if type(browser) is not bool:raise ValueError('Destino inválido.')
    pasta='' if browser else str(destino(value.get('pasta','')))
    with LOCK,connect() as db:
        renders=[]
        for ident in ids:
            if not isinstance(ident,str) or not re.fullmatch('[0-9a-f]{32}',ident):raise ValueError('Vídeo inválido.')
            mine(db,'ofertas_renders',ident)
            r=db.execute('SELECT id,status FROM ofertas_renders WHERE id=?',(ident,)).fetchone()
            if r['status'] not in ('pronto','gerando','na_fila'):raise ValueError('Selecione vídeos prontos ou ainda em geração.')
            renders.append(r)
        reservados=set()
        if not browser:
            for r in db.execute('SELECT itens FROM ofertas_entregas WHERE pasta=?',(pasta,)):
                reservados.update(i['nome'].casefold() for i in json.loads(r['itens']) if i['estado']!='falhou')
        itens=[];numero=inicio
        for r in renders:
            nome=f'VT {numero}.mp4'
            while not browser and ((Path(pasta)/nome).exists() or nome.casefold() in reservados):
                numero+=1;nome=f'VT {numero}.mp4'
            itens.append(dict(render=r['id'],nome=nome,estado='aguardando',erro=None))
            reservados.add(nome.casefold());numero+=1
        ident=uid()
        db.execute('INSERT INTO ofertas_entregas VALUES(?,?,?,?,?,?,?)',
                   (ident,owner(),pasta,int(browser),str(value.get('rotulo') or pasta)[:300],json.dumps(itens),now()))
    return ident


def listar():
    with connect() as db:
        return [dict(r)|{'itens':json.loads(r['itens'])} for r in db.execute(
            'SELECT * FROM ofertas_entregas WHERE (? IS NULL OR owner=?) ORDER BY criado DESC LIMIT 100',(owner(),owner()))]


def confirmar(value):
    with LOCK,connect() as db:
        mine(db,'ofertas_entregas',value.get('id'))
        r=db.execute('SELECT * FROM ofertas_entregas WHERE id=?',(value['id'],)).fetchone()
        if not r['navegador']:raise ValueError('Esta entrega é feita pelo servidor.')
        itens=json.loads(r['itens'])
        for item in itens:
            if item['render']==value.get('render') and item['estado']=='disponivel':
                item['estado']='falhou' if value.get('erro') else 'salvo'
                item['erro']=str(value.get('erro') or '')[:500] or None
        db.execute('UPDATE ofertas_entregas SET itens=? WHERE id=?',(json.dumps(itens),r['id']))


def cancelar(ident):
    with LOCK,connect() as db:
        mine(db,'ofertas_entregas',ident)
        r=db.execute('SELECT itens FROM ofertas_entregas WHERE id=?',(ident,)).fetchone()
        itens=json.loads(r['itens'])
        for item in itens:
            if item['estado'] in ('aguardando','disponivel'):item.update(estado='cancelado',erro=None)
        db.execute('UPDATE ofertas_entregas SET itens=? WHERE id=?',(json.dumps(itens),ident))


def copiar(origem,saida):
    # O original renderizado é preservado. Publicação exclusiva nunca substitui arquivos.
    temp=saida.with_name('.ofertas-'+uid()+'.tmp')
    try:
        shutil.copyfile(origem,temp)
        try:os.link(temp,saida)
        except FileExistsError:raise ValueError(f'{saida.name} já existe. Escolha outra numeração.')
        except OSError:
            criado=False
            try:
                with saida.open('xb') as destino_,temp.open('rb') as fonte:
                    criado=True;shutil.copyfileobj(fonte,destino_,1024*1024)
            except Exception:
                if criado:saida.unlink(missing_ok=True)
                raise
    finally:temp.unlink(missing_ok=True)


def processar(pasta_ofertas):
    if not LOCK.acquire(blocking=False):return
    try:
        with connect() as db:
            for row in db.execute('SELECT * FROM ofertas_entregas').fetchall():
                itens=json.loads(row['itens']);mudou=False
                for item in itens:
                    if item['estado']!='aguardando':continue
                    r=db.execute('SELECT status FROM ofertas_renders WHERE id=?',(item['render'],)).fetchone()
                    if not r or r['status'] in ('cancelado','falhou','interrompido'):
                        item.update(estado='falhou',erro='O vídeo não foi finalizado.');mudou=True
                    elif r['status']=='pronto':
                        try:
                            fonte=pasta_ofertas/'renders'/item['render']/'video.mp4'
                            if not fonte.is_file():raise ValueError('O MP4 deste vídeo não está disponível.')
                            if row['navegador']:item['estado']='disponivel'
                            else:
                                copiar(fonte,destino(row['pasta'])/item['nome']);item['estado']='salvo'
                        except Exception as exc:item.update(estado='falhou',erro=str(exc)[:500])
                        mudou=True
                if mudou:
                    db.execute('UPDATE ofertas_entregas SET itens=? WHERE id=?',(json.dumps(itens),row['id']));db.commit()
    finally:LOCK.release()
