"""Miniaturas estáticas por conteúdo, geradas fora das threads HTTP e reutilizadas entre revisões."""
import hashlib
import json
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix='ofertas-miniaturas')
LOCK = threading.RLock()
JOBS = {}

def grupos(total, trio=False):
    tamanhos = [2] * (total // 2)
    if total % 2:
        if trio and total >= 3: tamanhos[-1] = 3
        else: tamanhos.append(1)
    inicio = 0
    for tamanho in tamanhos:
        yield list(range(inicio, inicio + tamanho))
        inicio += tamanho

def chaves(dados, versao):
    produtos = dados.get('produtos', [])
    comuns = {k: v for k, v in dados.items() if k != 'produtos'}
    # O layout mede títulos e preços de todas as ofertas para definir escalas comuns.
    comuns['_medidas'] = [{k: p.get(k) for k in ('nome', 'de', 'estiloselo')} for p in produtos]
    return [hashlib.sha256(json.dumps([versao, comuns, indices, [produtos[i] for i in indices]],
        sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:32]
        for indices in grupos(len(produtos), dados.get('ultimacartela') == 'tres')]

def manifestar(pedido, template, preparar, pasta, motor, node, repetir=False):
    versao = [(str(f.relative_to(template)), f.stat().st_mtime_ns, f.stat().st_size)
        for f in template.rglob('*') if f.is_file() and not any(p in ('snapshots', '.hyperframes', 'renders') for p in f.relative_to(template).parts)]
    versao.append(('miniaturas-motor', (motor / 'miniaturas.mjs').stat().st_mtime_ns))
    keys = chaves(pedido['dados'], versao)
    destino = pasta / 'cartelas' / pedido['id']; destino.mkdir(parents=True, exist_ok=True)
    faltam = [{'numero': i, 'destino': str(destino / f'{key}.jpg')} for i, key in enumerate(keys) if not (destino / f'{key}.jpg').is_file()]
    erro = None
    with LOCK:
        job = JOBS.get(pedido['id'])
        assinatura = tuple(keys)
        if job and job['assinatura'] == assinatura and job['future'].done(): erro = job.get('erro')
        if repetir and job and job['future'].done(): erro = None
        precisa = faltam and not erro and (not job or job['assinatura'] != assinatura or job['future'].done())
        if precisa:
            if job and not job['future'].running() and job['future'].cancel():
                Path(job['entrada']).unlink(missing_ok=True)
            # Limita pedidos pendentes para não competir com a geração dos vídeos.
            if sum(not j['future'].done() for j in JOBS.values()) < 32:
                prep = preparar(pedido['template'], pedido['dados'])
                tarefa = {'template': str(template), 'variaveis': prep['variaveis'], 'copias': {c['para']: c['de'] for c in prep['copias']}, 'itens': faltam}
                entrada = destino / f'tarefa-{uuid.uuid4().hex}.json'
                entrada.write_text(json.dumps(tarefa, ensure_ascii=False), 'utf-8')
                job = {'assinatura': assinatura, 'erro': None, 'entrada': str(entrada)}
                job['future'] = EXECUTOR.submit(executar, job, entrada, motor, node)
                JOBS[pedido['id']] = job
        pendente = bool(faltam and not erro)
    return {'revision': pedido['revision'], 'pendente': pendente, 'erro': erro,
        'cartelas': [{'numero': i, 'url': f"/ofertas/cartela/{pedido['id']}/{key}.jpg" if (destino / f'{key}.jpg').is_file() else None} for i, key in enumerate(keys)]}

def executar(job, entrada, motor, node):
    try:
        r = subprocess.run([node, str(motor / 'miniaturas.mjs'), str(entrada)], cwd=motor,
            capture_output=True, timeout=100, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if r.returncode:
            (entrada.parent / 'miniaturas-erro.log').write_bytes(r.stderr[-12000:])
            job['erro'] = 'Miniaturas indisponíveis. Use Atualizar miniaturas para tentar novamente.'
    except Exception:
        job['erro'] = 'Miniaturas indisponíveis. O editor e a geração continuam disponíveis.'
    finally:
        entrada.unlink(missing_ok=True)
        # Mantém apenas um histórico recente por pedido; miniaturas antigas não crescem indefinidamente.
        arquivos = sorted(entrada.parent.glob('*.jpg'), key=lambda p: p.stat().st_mtime, reverse=True)
        for p in arquivos[300:]: p.unlink(missing_ok=True)
