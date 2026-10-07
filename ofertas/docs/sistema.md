# Raio-x: o sistema da Fábrica de Vídeos (fases 2 a 4)

Complementa [contrato-de-template.md](contrato-de-template.md), que cobre a fase 1 (contrato e motor).
Este documento cobre o servidor, a interface, a fila de render, a publicação de templates, a biblioteca
de imagens, a remoção de fundo e a importação de encartes.

> **Nota de integração:** este raio-x foi escrito quando o módulo era o serviço separado "Fábrica de
> Vídeos". Hoje ele vive no Assistente de Edições: `servidor/server.py` virou `modules/ofertas/__init__.py`
> (rotas com prefixo `/api/ofertas` e `/ofertas`, cabeçalho `X-Indoor`, tabelas `ofertas_*` no banco do
> toolkit, eventos no Histórico); `static/app.js` virou `static/ofertas.js`. A lógica descrita é a mesma.

## 1. Motivação e forma

O contrato e o motor fazem o vídeo sair de um `dados.json`, mas ninguém deve escrever JSON à mão.
O sistema é a camada humana:
- formulário gerado do template;
- prévia ao vivo;
- fila de geração;
- biblioteca de imagens;
- publicação de templates pelos designers;
- leitura do encarte em PDF para não digitar produto por produto.

A stack copia o **Assistente de Edições IC** (`~/orca/assistente-de-edicoes-ic`): Python 3.12, Waitress,
SQLite e HTML/CSS/JS sem framework, com o mesmo `style.css` copiado sem alteração. O `MODULES` daquele
servidor já prevê "Vídeo" e "Ofertas de supermercados" como módulos futuros, e a mesma stack torna a
integração uma mudança de pasta, não uma reescrita. O motor continua em Node porque o HyperFrames é Node.
O servidor fala com ele por subprocesso, e a regra de validação continua morando num lugar só,
`motor/contrato.mjs`.

```
 navegador (static/app.js)                     servidor/server.py                         motor/ (Node)
 ─────────────────────────                     ──────────────────                         ─────────────
 catálogo ─ GET /api/templates ───────────────▶ motor('catalogo') ─────────────────────▶ cli.mjs catalogo
 formulário ─ GET /api/esquema ───────────────▶ motor('esquema') ──────────────────────▶ cli.mjs esquema
 digita → (650ms) POST /api/pedido-salvar ────▶ SQLite + motor('preparar') ───────────▶ cli.mjs preparar
     ◀── {revision, validacao:[{campo,mensagem}]}                                         (detalhes por campo)
 <hyperframes-player src=/preview/<id>/index.html?v=rev>
     └─ GET /preview/<id>/index.html ─────────▶ index.html do template
                                                  + window.__hfVariables + /hf/runtime.js
 "Gerar" ─ POST /api/gerar ───────────────────▶ renders(na_fila) + dados.json congelado
                                                 worker() ─ Popen ─────────────────────▶ gerar.mjs → MP4
 fila ─ GET /api/renders (poll 2s) ◀──────────── status / erro / capaEm
```

| Arquivo | Papel |
|---|---|
| `servidor/server.py` | API WSGI, prévia, fila de render, publicação, vídeo com Range |
| `servidor/storage.py` | SQLite (pedidos, renders, imagens, eventos), caminhos configuráveis por ambiente |
| `servidor/encarte.py` | Extração de produtos de PDF (recorte + nome + preços + unidade) |
| `servidor/static/` | `index.html`, `app.js`, `fabrica.css` (componentes novos) e `style.css` (cópia do toolkit) |
| `motor/cli.mjs` | Interface JSON do motor: `catalogo`, `esquema`, `preparar` |
| `kit/criar-template/SKILL.md` | Skill para o Claude do designer, baixável em *Templates* |
| `servidor/tests/test_servidor.py` | 11 testes (API, segurança de upload, encarte) |

## 2. Dados (`storage.py`)

```sql
pedidos (id, template, titulo, dados, revision, criado, atualizado)
renders (id, pedido, template, titulo, revision, status, criado, iniciado, terminado, erro)
imagens (id, nome, origem, largura, altura, transparente, criado)
eventos (id, pedido, time, action, detail)
```

- `pedidos.dados` guarda o JSON **no formato do formulário** (agrupado: `produtos: [...]`), e não as
  variáveis achatadas. Assim o pedido sobrevive a mudanças internas de nome de variável e é o mesmo
  formato que o `gerar.mjs` aceita.
- `revision` é a mesma concorrência otimista do toolkit (`check_revision`): salvar com revisão
  antiga dá **409** ("Este pedido mudou em outra janela").
- `renders.titulo` e `renders.template` são cópias, não chaves. O vídeo continua listável e baixável
  mesmo se o pedido for excluído.
- Imagens da biblioteca entram nos dados como `"biblioteca:<id>"`. `resolver_imagens()` só troca isso
  pelo caminho real (`dados/imagens/<id>.png`) na hora de chamar o motor. O pedido nunca guarda
  caminho de disco.

`init()` marca como `interrompido` todo render que estava `gerando`. Um processo filho não sobrevive
à queda do servidor, e sem isso a fila mostraria "Gerando" para sempre.

## 3. Prévia ao vivo (a peça mais delicada)

O player oficial do HyperFrames (`hyperframes-player.global.js`, web component `<hyperframes-player>`)
não tem API de variáveis. Ele carrega uma URL num iframe e só injeta o runtime (do CDN) se a página
não tiver um. O runtime, por sua vez, lê `window.__hfVariables`, que é exatamente onde o CLI injeta o
`--variables-file` no render. Então o servidor entrega o template **já com os dados dentro**
(`server.py:308`):

```python
injecao = ('<script>window.__hfVariables=' + json.dumps(prep['variaveis'], ensure_ascii=False).replace('</', '<\\/')
           + ';</script><script src="/hf/runtime.js"></script>')
html = re.sub(r'<head[^>]*>', lambda m: m.group(0) + injecao, html, count=1)
return GSAP_CDN.sub('/hf/gsap.min.js', html).encode(), 'text/html; charset=utf-8'
```

- **`replace('</', '<\\/')`:** um nome de produto digitado como `</script><script>…` fecharia a tag e
  executaria código. O teste `test_preview_injeta_variaveis_runtime_e_gsap_local` cobre isso.
- **Runtime e GSAP locais (`/hf/*`, servidos do `motor/node_modules`):** a prévia funciona sem
  internet e na mesma versão do render.
- **Prévia com campo inválido:** `preparar` só devolve as variáveis válidas, e o runtime completa as
  outras com os `default` declarados. O vídeo continua aparecendo, com o valor padrão no lugar do
  campo errado.
- **Imagens enviadas:** o motor responde `copias: [{de, para: 'entrada/produtos_2_imagem.png'}]`, e
  o servidor guarda esse mapa em `PREVIEW[pedido]` para servir `/preview/<id>/entrada/...` do arquivo
  da biblioteca, sem copiar nada.
- Os assets do template são servidos com checagem de contenção (`base not in alvo.parents` →
  404), o que impede `/preview/<id>/../../motor/package.json`.

No navegador (`app.js`, `atualizarPreview`), cada salvamento troca o `src` com `?v=<revision>`. O
ponto da reprodução é preservado pelo evento `ready` do player:

```js
player.addEventListener('ready', () => { if (tempo) player.seek(tempo); if (tocando) player.play(); }, { once: true });
player.setAttribute('src', `/preview/${state.pedido.id}/index.html?v=${state.pedido.revision}`);
```

Ao abrir um pedido, o tempo inicial é o `capaEm` do template (2,6s no Hora da Carne). Em 0s o quadro
está vazio, porque os produtos ainda não caíram.

**Fontes:** a prévia roda o HTML puro, sem o compilador do HyperFrames, que embute Montserrat/Inter no
render. Por isso o contrato passou a exigir `@font-face` local para **toda** fonte, e o Hora da Carne
ganhou `assets/fonts/montserrat-{400,700,900}.woff2`.

**CSP:** o app usa a mesma política restrita do toolkit (`script-src 'self'`, `frame-ancestors 'none'`).
A prévia precisa de scripts inline (template + runtime), então tem política própria
(`CSP_PREVIEW`, com `'unsafe-inline'`) e `frame-ancestors 'self'`. Ela só pode ser embutida pelo
próprio app.

## 4. Formulário (`app.js`)

`montarFormulario()` percorre `esquema.campos` (saída de `cli.mjs esquema`: o `template.json`
enriquecido com `opcoes`/`min`/`max` do `index.html` e com `padrao`):

- campo simples → `campo(def, [id], id)`;
- lista → um `<section class="grupo">` por `grupo.tamanho` ("Painel 1") e um `.item-card` por item.
  Os subcampos usam o caminho `[lista, i, sub]` e o id de variável `` `${lista}_${i+1}_${sub}` ``. É a
  mesma convenção do contrato, e é por ela que o erro volta para o campo certo.

```js
const el = d.campo && document.querySelector(`#formulario [data-var="${d.campo}"]`);
```

Esse é o motivo dos `detalhes: [{campo, mensagem}]` que o `prepararDados` passou a devolver na fase 2.
Erros sem campo (ex.: lista com tamanho errado) aparecem em `#resumo-erros`. O botão "Gerar" fica
desabilitado enquanto houver erro, e o servidor revalida de qualquer forma (`/api/gerar` devolve
`ok:false`).

**Autosave:** cada digitação agenda `salvarAgora()` em 650ms. Um salvamento por vez (`state.salvando`).
Se o usuário digitar durante o salvamento, `state.pendente` faz um segundo salvamento logo depois.
Trocar de tela ou clicar em "Gerar" faz `await salvarAgora()` antes, para nunca gerar dados velhos.

**Imagens no formulário:** para mostrar nome e "Remover fundo" só em imagem com fundo, o formulário
busca `GET /api/imagens?ids=...` das imagens `biblioteca:` usadas e guarda em `state.imagens`. Um bug
encontrado no teste de interface usava o objeto como chave (`state.imagens[i] = i`), e o nome da imagem
recém-recortada nunca aparecia. Foi corrigido para `state.imagens[i.id]`.

## 5. Fila de render

```python
def worker():
    while True:
        FILA.wait(timeout=3)
        FILA.clear()
        while True:
            with LOCK, connect() as db:
                if len(RODANDO) >= RENDERS_SIMULTANEOS: break
                row = db.execute("SELECT * FROM renders WHERE status='na_fila' ORDER BY criado LIMIT 1").fetchone()
                ...
                RODANDO[row['id']] = subprocess.Popen([NODE, 'gerar.mjs', template, 'dados.json', '-o', 'video.mp4'], ...)
            threading.Thread(target=acompanhar, args=(row['id'], log), daemon=True).start()
```

- A fila é a própria tabela `renders`. Não há Redis nem broker: um servidor único, como pedido para o
  MVP. `FILA` (um `threading.Event`) acorda o worker na hora em que algo entra ou termina. O `timeout=3`
  é só uma rede de segurança.
- `FABRICA_RENDERS=1` por padrão, porque cada render do HyperFrames já usa vários núcleos.
- `/api/gerar` grava `renders/<id>/dados.json` **no momento do clique**. Editar o pedido depois não
  muda o vídeo que já está na fila.
- **Cancelar:** muda o status para `cancelado` e dá `terminate()` no processo.
  `acompanhar()` respeita o `cancelado` e não sobrescreve com `falhou`.
- **Falha:** o erro mostrado são as últimas linhas do log que começam com `✗`, `-` ou `Error`. São as
  mensagens legíveis do `gerar.mjs` ("Produto 1 › …").
- **Progresso** é uma estimativa: tempo decorrido sobre a média dos últimos 10 renders prontos
  (`duracao_media()`, 30s antes do primeiro), limitada a 95%. O HyperFrames não reporta progresso pela
  saída não interativa.
- `/video/<id>.mp4` aceita `Range` (206), sem o qual o `<video>` do navegador não consegue pular
  trechos. `?baixar=1` adiciona `Content-Disposition` com o título do pedido. O `#t=<capaEm>` no `src`
  abre a prévia do vídeo pronto num quadro com conteúdo.

## 6. Publicação de templates (`publicar`, `server.py:151`)

1. Abre o .zip, ignora `__MACOSX/` e `.DS_Store`, e acha o `template.json` mais raso (raiz ou uma
   pasta de profundidade).
2. Valida o `id` (`[a-z0-9]+(-[a-z0-9]+)*`) **antes** de tocar o disco, porque ele vira nome de pasta.
3. Limites: 800 MB descompactados e 3000 arquivos.
4. Extrai em `templates/.staging/<uuid>/<id>/`, pulando caminhos absolutos, `..`, `node_modules`,
   `snapshots` e `renders`.
5. Roda `validar-template.mjs` na pasta de staging (contrato + `hyperframes check` + capa).
6. Se falhar, devolve `{ok:false, erros}` (as linhas `- ...` do validador) e o template publicado
   não é tocado.
7. Se passar, a versão atual vai para `templates/.versoes/<id>/<AAAAMMDD-HHMMSS>/` e a nova entra no
   lugar. Tudo isso acontece sob o lock `PUBLICAR`.

O `finally` sempre apaga o staging. O catálogo ignora pastas que começam com `.`, então staging e
versões nunca aparecem como templates.

## 7. Biblioteca e remoção de fundo

`salvar_imagem()` normaliza todo envio para PNG RGBA. Aplica a rotação EXIF (fotos de celular), limita
o lado maior a 2400px, gera uma miniatura de 320px e calcula
`transparente = alpha mínimo < 250`, que decide se o "Remover fundo" é oferecido.

`remover_fundo()` chama `hyperframes remove-background <png> -o <saida.png>`, que usa um modelo
U²-Net local via ONNX/CoreML. Medido nesta máquina: o primeiro uso baixa cerca de 168 MB e leva ~19s;
depois, **~0,5s por imagem**. O resultado é uma **nova** imagem ("… (sem fundo)") e o original é
preservado, mesma regra do toolkit.

## 8. Importação de encarte (`encarte.py`)

É uma heurística sobre a camada vetorial do PDF, não OCR. Funciona com encartes exportados de
programas de layout, que têm texto real e recortes com máscara (`smask`).

1. **Recortes:** apenas imagens com `smask` (transparência). Fundos, logos de cartão e fotos
   retangulares não têm. Imagens maiores que 30% da página são descartadas.
2. **`_agrupar`:** une recortes que se sobrepõem mais de 15% da menor área, repetindo até estabilizar.
   A Maminha PUL são 3 cópias da mesma embalagem, e o Hambúrguer são 4 caixas de 2 marcas: cada um
   vira um produto.
3. **`_tokens_preco`:** junta `"46"` + `",99"` **antes** de atribuir ao produto. Nos cards grandes do
   encarte, o selo de preço encosta na foto do card vizinho, e sem isso o inteiro ia para um produto e
   os centavos para outro (era o bug que dava `Coxão Mole por=54,99`).
4. **Atribuição** de cada texto ao recorte mais próximo, com duas regras do domínio em `_dist`:

```python
d = ((2 * dx) ** 2 + dy * dy) ** .5     # nome e preço ficam na coluna do próprio produto
return d * 3 if numerico and p.y < rect.y0 else d   # preço quase nunca fica ACIMA da foto
```

   Exemplo real (Peito Bovino, preço normal "34"): o centro do texto ficava a 72pt da foto do Peito e
   a 71,5pt da foto da Paleta. Com `dx` pesando o dobro, a distância até a Paleta vai para 90,5 e o
   preço volta para o Peito.
5. **`_nome`:** linhas de texto contíguas (gap < 1,2× a altura da linha) formam blocos, e o nome é o
   bloco mais próximo do recorte. Isso impede que o texto do cabeçalho ("Faça seu cadastro…") cole no
   nome da Maminha, que fica logo abaixo dele.
6. **Preços:** a maior fonte é o preço em destaque (`por`) e a segunda é o preço normal (`de`).
   **Unidade:** a de maior fonte entre `KG/CADA/UN/PCT/\d+g`. O filtro é sensível a maiúsculas:
   `KG` é unidade, `Kg` faz parte do nome ("Peito Bovino Com Osso Kg").
7. Grupos sem nome ou sem preço são descartados (ex.: o ícone do SAC).

**Resultado no encarte real da Uniforça: 21/21 produtos** com nome, preço do clube, preço normal e
unidade corretos, conferidos linha a linha contra o PDF. Na interface, os itens viram cards. O usuário
clica na ordem desejada (limitada ao `itens` da lista) e `usar-encarte` preenche `nome`, `imagem`,
`por`, `de` e `unidade`, esta só se for uma das opções do template.

## 9. Testes e verificação

- `servidor/tests/test_servidor.py` (11 testes, chamando o app WSGI direto, sem rede):
  - pedido → salvar com erro → `gerar` recusado → 409 com revisão velha;
  - POST sem `X-Fabrica` e origem externa recusados;
  - prévia com injeção segura, GSAP local e travessia de diretório bloqueada;
  - imagem da biblioteca chegando à prévia, e PNG transparente versus opaco;
  - imagem inválida;
  - zip sem `template.json`, `id` malicioso (`../Fora`), republicação com versão guardada e entradas
    `../../fora.txt` ignoradas, template quebrado sem afetar o publicado;
  - encarte num **PDF sintético** gerado no teste (recorte transparente + nome + "49" ",90" + "59,99" +
    "KG" → `('Picanha Bovina Kg', '49,90', '59,99', 'KG')`), e PDF sem produtos.
- **Interface:** percorrida com Chrome headless (puppeteer-core do motor) e conferida por screenshots:
  catálogo, editor com prévia, erro de campo, importação do encarte (21 itens, 6 escolhidos),
  troca de imagem por envio, remoção de fundo, geração com o vídeo pronto na fila, publicação válida e
  quebrada, biblioteca e pedidos. Nenhum erro no console.

## 10. Lacunas e pontos de atenção

- **Sem login.** Como no toolkit, qualquer pessoa na rede local pode publicar templates. O JS do
  template roda na prévia **na mesma origem do app**, já que o iframe do player tem
  `allow-scripts allow-same-origin`, e portanto pode chamar a API. Aceitável para templates de
  designers da casa. Antes de abrir para clientes ou nuvem, é preciso de autenticação e de servir a
  prévia por outro host/porta.
- **Uma máquina só:** fila em SQLite e processos locais. Para escalar, a tabela `renders` já é a fila;
  bastaria trocar o `worker()` por workers remotos que leiam dela. O HyperFrames também suporta Lambda
  e Cloud Run.
- **Encarte é heurística:** foi validada num encarte (Uniforça). Layouts muito diferentes, PDFs
  achatados em imagem ou sem `smask` vão extrair pouco ou nada. Para esses casos a mensagem é
  "Nenhum produto encontrado", e o formulário manual continua funcionando. O resultado é sempre
  sugestão para revisar.
- **O tamanho da imagem não é ajustado ao importar do encarte:** embalagens entram com o tamanho
  padrão (1) e o usuário ajusta para ~0,8.
- **A prévia recarrega a cada salvamento** (~650ms após parar de digitar). É simples e correto, mas
  pisca. Atualizar só as variáveis via `postMessage` exigiria mexer no runtime.
- `PREVIEW` (mapa das imagens da prévia) fica em memória e cresce com o número de pedidos abertos
  desde o início do servidor. São bytes por pedido, irrelevante no uso local.
- **Biblioteca sem exclusão nem tags**, e **versões de template sem tela de restauração**: restaurar
  hoje é mover a pasta de `templates/.versoes/<id>/<data>` de volta.
- **Envio do vídeo para o `poc-digital-signage`** ficou fora, como combinado: a integração vem depois.
- O projeto antigo `videos/hora-da-carne` (CSV) segue divergente e pode ser apagado.
