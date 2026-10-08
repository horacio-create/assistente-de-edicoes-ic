# Raio-x: fila de exportação, vagas separadas e processamento em paralelo

## 1. Motivação

A produção passou de uma e2-medium (2 vCPUs compartilhadas, cerca de 1 sustentada, 4 GB) para uma **e2-standard-4** (4 vCPUs, 16 GB). Só que o código e o container não aproveitavam a máquina nova, e tinham quatro problemas de concorrência:

1. **Uma vaga só para tudo.** Exportar, importar, a prévia, as logos de MS6 e EAP e a vetorização disputavam o mesmo `threading.Semaphore(2)`. Duas exportações longas travavam a prévia e a importação de todo mundo.
2. **Exportação presa à requisição.** O `/api/export` processava dentro da própria chamada HTTP. Fechar a aba ou perder a conexão derrubava a exportação, e cada exportação longa ocupava uma das 6 threads do servidor web.
3. **"Remover fundo" sem limite.** Cada pedido abria um processo Node com um modelo de IA pesado; vários pedidos juntos esgotavam CPU e memória.
4. **Vídeos de Ofertas perdidos em reinícios.** O que estava sendo gerado quando o servidor parava (inclusive a cada deploy) virava `interrompido` para sempre.

## 2. Fluxo da exportação, antes e depois

```
ANTES   navegador ── POST /api/export ───────────── (espera minutos) ───────────── resposta com resultados
                                    └ valida → processa cada arquivo (vaga de 2, dividida com prévia/importação)

DEPOIS  navegador ── POST /api/export ── resposta na hora {queued, position}
                       └ prepare_export: valida (conflito → 409 na hora), consome o plano, registra "Exportação iniciada"
                       └ export_queue.submit → fila (deque) → N threads (INDOOR_EXPORTS) → run_export → export_progress.result
        navegador ── GET /api/export-progress (a cada 0,5–0,7 s) ── {state: waiting, position} → {running, percent} → {…, result}
                       └ janela de progresso mostra "Na fila…" / porcentagem; no fim entrega os arquivos (rede) e devolve o resultado
```

## 3. Arquivos

| Arquivo | O que mudou |
|---|---|
| `modules/export_queue.py` (novo) | A fila: `submit`, `position` e as threads de trabalho |
| `modules/export_progress.py` | Estado `waiting` (`queued`), resultado final (`result`) e falha (`fail`) |
| `server.py` | `prepare_export` / `run_export`; parâmetro `background`; três semáforos (`EXPORTAR`, `IMPORTAR`, `LEVE`); posição em `/api/export-progress` |
| `static/export-progress.js` | Espera o resultado da fila e mostra a posição |
| `static/app.js` | Não baixa arquivos enquanto a exportação está só na fila |
| `modules/ofertas/__init__.py` | Semáforo `FUNDO`; vídeos interrompidos voltam à fila (coluna `tentativas`) |
| `deploy/compose.yaml` | Limites para a e2-standard-4 e os números de trabalhos simultâneos |
| `tests/test_export_queue.py` (novo) | 8 testes |

## 4. A fila: `modules/export_queue.py`

```python
WORKERS = max(1, int(os.environ.get('INDOOR_EXPORTS', '2')))
LOCK = threading.Condition()
PENDING = collections.deque()  # (token, run, usuário)

def submit(token, name, run):
    global _workers
    with LOCK:
        export_progress.queued(token, name)
        PENDING.append((token, run, USUARIO.get()))
        while _workers < WORKERS:  # as threads nascem no primeiro uso e ficam esperando trabalho
            threading.Thread(target=_worker, name=f'exportacao-{_workers}', daemon=True).start()
            _workers += 1
        LOCK.notify()
        return {'queued': True, 'token': token, 'position': len(PENDING)}
```

- **Ordem de chegada (FIFO).** Um `deque` com uma `Condition`, em vez de um semáforo, porque o semáforo não garante ordem (quem chega por último pode passar na frente) e não sabe dizer a **posição** de ninguém. A posição é o índice na fila (`position()`): 1 significa "a próxima a começar".
- **Threads criadas no primeiro uso.** Importar o `server` (testes, app portátil) não cria threads à toa.
- **O usuário viaja junto com o trabalho.** O Histórico grava o dono de cada evento lendo um `ContextVar` (`storage.USUARIO`), que **não passa** de uma thread para outra. Sem levar o usuário na fila, os eventos "Exportado" sairiam sem dono:

```python
def _worker():
    while True:
        with LOCK:
            while not PENDING:
                LOCK.wait()
            token, run, user = PENDING.popleft()
        USUARIO.set(user)  # a thread é reaproveitada: o Histórico fica com o dono desta exportação
        try:
            export_progress.result(token, run())
        except Exception as exc:  # erro inesperado: o navegador recebe a mensagem em vez de esperar para sempre
            export_progress.fail(token, str(exc))
```

## 5. `prepare_export` / `run_export` (`server.py:254`, `server.py:270`)

O antigo bloco de `/api/export` foi dividido **sem mudar a lógica**. Na parte de processamento, só `value['token']` virou `token`:

- **`prepare_export(value)`:** tudo o que pode dar errado **antes** de processar: plano vencido, revisão da edição mudou, arquivo existente sem confirmação, pasta mudou depois da revisão. Roda **na hora**, então um `Conflict` continua voltando como 409 ao navegador, que mostra a mensagem como antes. Também consome o plano e registra "Exportação iniciada".
- **`run_export(token, row, plan)`:** o laço de processamento, igual ao de antes, inclusive o cancelamento entre arquivos e a atualização da fila de timelines (`response['job']`).

A rota escolhe pelo parâmetro explícito `background`:

```python
    if path == '/api/export':
        row, plan = prepare_export(value)
        if background: return export_queue.submit(value['token'], plan['files'][0]['name'], lambda: run_export(value['token'], row, plan))
        return run_export(value['token'], row, plan)
```

`app()` chama `api(..., background=True)`. Os testes chamam `server.api(...)` direto e continuam recebendo o resultado na hora, por isso as 28 chamadas existentes não precisaram mudar.

**Cancelar com a exportação ainda na fila:** `export_progress.cancel` já aceitava o estado `waiting`. Quando a thread pega o trabalho, `export_progress.start` preserva o pedido de cancelamento, o laço sai antes do primeiro arquivo e o resultado volta com `cancelled: True` e nenhum arquivo processado (verificado em `test_queue_order_position_and_cancel_before_start`).

## 6. As vagas: três semáforos (`server.py:29-31`)

```python
EXPORTAR = threading.Semaphore(export_queue.WORKERS)                   # exportar (fila de fundo): pesado e longo
IMPORTAR = threading.Semaphore(int(os.environ.get('INDOOR_IMPORTS', '2')))  # importar: recodifica o vídeo enviado
LEVE = threading.Semaphore(int(os.environ.get('INDOOR_LEVES', '4')))       # prévia, logos de MS6/EAP, vetorização
```

| Grupo | Usado em |
|---|---|
| `EXPORTAR` | `export_slot` (cada arquivo da exportação) |
| `IMPORTAR` | `import_video`, `import_audio`, `upload_media`, `/api/logo` |
| `LEVE` | `/api/preview`, `receive_logo`, `/api/vector/trace`, `/api/vector/export`, `/api/eap/upload`, `/api/eap/preview`, `/api/eap/export` |

`EXPORTAR` tem o mesmo tamanho da fila (`export_queue.WORKERS`). Pela web, as threads da fila nunca esperam por ele; ele só limita exportações chamadas direto (testes) para não passarem do total. O teste `test_preview_is_not_blocked_by_busy_exports` ocupa todas as vagas de exportação e confere que a prévia responde mesmo assim.

## 7. Frontend

`request` é redefinida em camadas (scripts clássicos, carregados nesta ordem): `app.js` (entrega dos arquivos exportados pela rede) → `export-progress.js` (janela de progresso) → `project-controls.js` (atualiza a fila de timelines com o `job` do resultado).

Com a fila, `/api/export` responde antes de existir qualquer arquivo, então a primeira camada não pode baixar nada nesse momento:

```js
  // exportação na fila: os arquivos só existem no fim; quem entrega é export-progress.js, depois do resultado
  const delivery=path==='/api/export'?(data.queued?null:planTarget):['/api/vector/export','/api/eap/export'].includes(path)?target:null;
```

A segunda camada espera o resultado e só então entrega:

```js
  if(result.queued){result=await queuedResult(token);if(planTarget)await deliver(planTarget);}
```

```js
async function queuedResult(token){
 for(;;){
  const state=await progressRequest('/api/export-progress?token='+encodeURIComponent(token)).catch(()=>null);// queda de rede: tenta de novo
  if(state?.result){if(state.result.error)throw new Error(state.result.error);return state.result;}
  await new Promise(resolve=>setTimeout(resolve,700));
 }
}
```

O resultado que sai daqui tem o **mesmo formato** do `/api/export` antigo (`{results, cancelled, job?}`). Por isso a terceira camada e a tela de exportação (`app.js`, "Processando e salvando os arquivos…") não mudaram. Enquanto espera, a janela mostra `waitingText(position)`: "Na fila: N exportações antes desta" ou "Aguardando uma vaga para começar…".

## 8. Ofertas

**Remover fundo, um por vez** (`OFERTAS_FUNDO`, padrão 1):

```python
        with FUNDO:  # um por vez (OFERTAS_FUNDO): quem pede durante outro espera a vez
            r = subprocess.run([NODE, str(HF_CLI), 'remove-background', ...
```

Quem pede durante outro pedido espera dentro da própria requisição. Funciona porque o pedido leva segundos, não minutos.

**Retomar vídeos interrompidos** (em `garantir()`, que roda quando o servidor sobe):

```python
            db.execute("UPDATE ofertas_renders SET status='na_fila', iniciado=NULL, tentativas=tentativas+1 WHERE status='gerando' AND tentativas<?", (RETOMADAS,))
            db.execute("UPDATE ofertas_renders SET status='interrompido', terminado=? WHERE status='gerando'", (now(),))
```

- Funciona porque os dados do pedido foram congelados em `renders/<id>/dados.json` quando ele entrou na fila (`enfileirar`). O vídeo é refeito do zero com exatamente o mesmo conteúdo, mesmo que o pedido tenha sido editado depois.
- **Limite de 2 retomadas** (coluna nova `tentativas`). Se um vídeo for justamente o que derruba o servidor (falta de memória, por exemplo), ele não fica em laço infinito de "sobe, tenta, cai": na terceira vez vira `interrompido`.
- Os retomados mantêm o `criado` original, e como a fila anda por `ORDER BY criado`, **voltam para a frente**.

## 9. `deploy/compose.yaml` (e2-standard-4)

| | Antes | Agora | Por quê |
|---|---|---|---|
| `cpus` | 1,5 | 3,5 | Das 4 vCPUs, meia fica para o sistema e o Caddy |
| `mem_limit` | 2g | 12g | Dos 16 GB, folga para sistema, Docker e Caddy |
| `shm_size` | 512m | 1g | Dois renders de Ofertas (vários Chromes) ao mesmo tempo |
| `INDOOR_EXPORTS` | 2 (fixo) | 3 | Exportações do editor em paralelo |
| `INDOOR_IMPORTS` | (compartilhado) | 2 | Importações em paralelo |
| `INDOOR_LEVES` | (compartilhado) | 6 | Prévias e logos em paralelo |
| `OFERTAS_RENDERS` | 1 | 2 | Vídeos de Ofertas ao mesmo tempo |
| `OFERTAS_FUNDO` | sem limite | 1 | Remoções de fundo ao mesmo tempo |

Sem essas variáveis (app local, portátil), valem os padrões entre parênteses nos comentários do arquivo. Ao trocar de máquina, os números mudam juntos com `cpus` e `mem_limit`.

## 10. Verificação

- `tests/test_export_queue.py`, 8 testes:
  - exportação pela web responde na hora e o resultado chega pelo progresso;
  - conflito continua imediato;
  - ordem, posição e cancelamento antes de começar;
  - dono no Histórico;
  - erro inesperado chega ao navegador;
  - prévia não trava com as exportações ocupadas;
  - vídeo de Ofertas volta à fila no máximo 2 vezes;
  - remover fundo roda um por vez.
- A suíte Python inteira (189 testes) passa, exceto o `test_desktop_paths`, que já falhava antes e não está no git.
- Testes de navegador (Chromium):
  - `test_export_delivery_browser`: exportação **pela rede** com pasta, Downloads, cancelamento e fila de 6 arquivos;
  - `test_import_preview_browser`;
  - uma exportação real chamada pela `request` da página, que passou pelas três camadas, mostrou "Aguardando uma vaga para começar…" e gravou o arquivo.
- `test_queue_cancel_browser`, `test_projects_browser` e `test_composition_browser` falham **igual no código anterior** (conferido com `git stash`), antes de chegarem à exportação: estão desatualizados em relação à tela.

## 11. Lacunas conhecidas

1. **A fila mora na memória.** Um reinício do servidor (deploy) com exportações na fila ou rodando perde essas exportações; o plano já foi consumido, e a pessoa precisa exportar de novo. Diferente do Ofertas, que guarda a fila no banco.
2. **Fechar a aba não para a exportação, mas a tela não "reencontra" o trabalho.** Na exportação para uma pasta do servidor, os arquivos ficam prontos e aparecem no Histórico. Na exportação **pela rede** (o navegador baixa ou grava os arquivos), é a aba que faz a entrega: sem ela, os arquivos ficam na pasta temporária do servidor até a limpeza.
3. **`EXPORTAR` e `export_queue.WORKERS` são o mesmo número por construção.** Se alguém aumentar um sem o outro (mudando o código, não a variável), as exportações da fila podem voltar a esperar vaga.
4. **Os workers do HyperFrames usam `auto`.** Com `OFERTAS_RENDERS=2` numa máquina de 4 vCPUs, cada render pode abrir vários Chromes. A memória é suficiente (cada um tem ~256 MB, num limite de 12 GB), mas não foi medido sob carga real.
5. **Três testes de navegador desatualizados** (seção 10) deixam a fila de timelines e o cancelamento pela tela sem teste de ponta a ponta automatizado.
