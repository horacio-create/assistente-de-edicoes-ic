# Conferência de encartes (Ofertas de supermercados)

Raio-X da feature que fecha o ciclo **encarte → produtos conferidos → vídeos**: o extrator lê o PDF
com mais precisão e diz o que está inseguro, o usuário confere cada produto vendo de onde ele foi
lido, marca à mão o que o automático não reconheceu (inclusive encartes em PNG/JPG) e, se quiser,
gera de uma vez todos os vídeos do encarte.

Inspirada no Encarte Studio (protótipo do Allan): dele vieram a ideia de **avisos por oferta**,
**conferência lado a lado com a página**, **marcação manual** e **lote do encarte inteiro**, além dos
encartes conferidos à mão que viraram o banco de testes do extrator. A montagem com pixels originais
e os vídeos de cartelas estáticas dele **não** foram trazidos (ver a análise na conversa de 06/10/2026).

## Visão geral

```
                    PDF ──────────────┐                    PNG/JPG
                                      ▼                       │
 POST /api/ofertas/encarte ── grava encartes/<id>.pdf         │ grava encartes/<id>.png
        │                     status 'lendo'                  │ status 'pronto', itens []
        ▼  (thread, LEITURA=1)                                │
 ler_encarte → encarte.extrair(pdf)                           │
        │  itens: nome, por, de, unidade, avisos,             │
        │         pagina, area, png → biblioteca              │
        ▼                                                     ▼
 ofertas_encartes.itens (JSON)  ◄────────────────────────────────────────┐
        │                                                                │
        ▼ GET /encartes (polling 1,5 s enquanto 'lendo')                  │
 card "Produtos do encarte" no editor                                    │
   ├─ card de produto: aviso / ✓ conferido / botão Conferir             │
   ├─ Conferir ── diálogo: página (/ofertas/encarte/<id>/<n>.png)        │
   │              + destaque da área + formulário                        │
   │              └─ POST /encarte-item-salvar | /encarte-item-excluir ──┤
   ├─ Marcar oferta na página ── arrastar retângulo (frações 0–1)        │
   │              └─ POST /encarte-recortar → encarte.ler_area ──────────┘
   ├─ Preencher N de M (seleção → formulário do pedido, no navegador)
   └─ Gerar vídeos de todo o encarte
                  └─ POST /encarte-gerar-todos → gerar_todos
                         ├─ 1 pedido por grupo de N produtos (revision 1)
                         └─ enfileirar → ofertas_renders 'na_fila' → worker
```

| Arquivo | O que mudou |
|---|---|
| `modules/ofertas/encarte.py` | Agrupamento de cópias encostadas; preço normal por distância e tamanho; legenda de equivalência por kg; unidade pelo preço em destaque; `UNID.`; `avisos()`; `pagina`/`area` por item; `paginas`, `imagem_pagina`, `ler_area` |
| `modules/ofertas/__init__.py` | Encarte sem produtos vira `pronto`; upload PNG/JPG; `arquivo_encarte`, `paginas_encarte`, `pagina_encarte`, `alterar_itens`, `conferir_item`, `excluir_item`, `recortar_encarte`, `preencher_lista`, `enfileirar`, `gerar_todos`; rotas novas |
| `static/index.html` | Linha de ações no card (dica + Marcar + Gerar todos); diálogo `of-conferir-dialog`; input aceita `.png,.jpg,.jpeg` |
| `static/ofertas.js` | Avisos e Conferir nos cards; diálogo conferir/marcar; Gerar todos |
| `static/ofertas.css` | Selos de aviso/conferido, linha de ações, diálogo com página |
| `tests/test_ofertas.py` | 5 testes novos de encarte (conferir, excluir, marcar, imagem, lote) |
| `tests/test_encarte_corpus.py` + `tests/fixtures/encartes-conferidos.json` | Extrator contra 49 ofertas conferidas à mão em 3 encartes reais |

## 1. Motivação

Antes, o card do encarte mostrava os produtos extraídos sem nenhuma indicação de confiança: um preço
normal trocado ou uma unidade errada só apareciam no vídeo pronto. Encartes que a heurística não
entendia (ou PNG/JPG) simplesmente falhavam ("nenhum produto encontrado"), e um encarte de 21
produtos exigia montar 4 vídeos à mão, escolhendo 6 produtos por vez.

## 2. Dados

Não há tabela nova: tudo vive na coluna `ofertas_encartes.itens` (JSON), que já guardava a lista de
produtos. Cada item ganhou campos:

| Campo | Origem | Para quê |
|---|---|---|
| `avisos` | `encarte.avisos()` na extração/marcação | O que conferir; esvazia ao salvar a conferência |
| `pagina`, `area` | extrator / marcação | "Ver no encarte": desenhar o destaque na página. Unidades do encarte (pontos do PDF; pixels numa imagem) |
| `conferido` | `conferir_item` | Mostrar "✓ conferido" no card |
| `manual` | `recortar_encarte` | Diferenciar ofertas marcadas à mão |

Itens de encartes importados **antes** desta feature não têm esses campos; o frontend trata a ausência
(`avisosDe = (it) => it.avisos || []`, destaque só `if (area)`).

O arquivo do encarte define o tipo: `encartes/<id>.pdf` ou `encartes/<id>.png` (PNG/JPG são
normalizados para PNG no upload). Páginas renderizadas ficam em cache como `encartes/<id>-p<n>.png`.

```python
def arquivo_encarte(ident):
    """-> (caminho, 'pdf' | 'imagem'). Encartes em PNG/JPG são guardados como PNG."""
    if not ID.fullmatch(ident): raise FileNotFoundError()
    for ext, tipo in (('pdf', 'pdf'), ('png', 'imagem')):
        f = PASTA / 'encartes' / f'{ident}.{ext}'
        if f.is_file(): return f, tipo
    raise FileNotFoundError()
```

O `ID.fullmatch` é a defesa contra caminho arbitrário: `ident` vem da URL/JSON e entra num nome de
arquivo.

## 3. O extrator (`modules/ofertas/encarte.py`)

A estrutura não mudou: imagens com transparência (`smask`) são as fotos de produto; cada pedaço de
texto vai para o grupo de fotos mais próximo (`_dist`, com dx pesando o dobro e números acima da foto
×3); de cada grupo saem nome, preços e unidade. As mudanças corrigem os erros que o banco de testes
revelou.

### 3.1 Cópias da mesma imagem encostadas = um produto

```python
def _agrupar(recortes):
    grupos = [(pymupdf.Rect(r), {xref}) for r, xref, _ in recortes]
    def juntar(a, b):
        (ra, xa), (rb, xb) = a, b
        inter = ra & rb
        if not inter.is_empty and inter.width * inter.height > 0.15 * min(ra.width * ra.height, rb.width * rb.height): return True
        perto = pymupdf.Rect(ra.x0 - ra.width * .15, ra.y0 - ra.height * .15, ra.x1 + ra.width * .15, ra.y1 + ra.height * .15)
        return bool(xa & xb) and perto.intersects(rb)
```

**Exemplo real (Creatina, encarte FLV):** a mesma imagem (xref 100) aparece duas vezes, em
`(159.8, 984.2)–(219.3, 1060.1)` e `(216.8, 988.5)–(276.3, 1064.4)`.

- Regra antiga (sobreposição): interseção 2,5 × 71,7 ≈ 179 pt², menor que 15% de 59,5 × 75,9 ≈ 678 pt² → **não** unia.
  Viravam dois "produtos"; o nome caía num e o preço no outro, e os dois eram descartados (`if not nome or not por: continue`).
- Regra nova: margem de 15% da largura = 8,9 pt → o retângulo ampliado vai até x = 228,2, que alcança
  o segundo (x0 = 216,8), **e** o xref é o mesmo → unidos. A Creatina passou a ser encontrada.

Exigir o mesmo xref evita colar dois produtos diferentes que só estão próximos.

### 3.2 Preço normal: perto do destaque *e* grande

```python
def _precos(precos):
    """-> (por, de, retângulo do por). Maior fonte = preço em destaque."""
    if not precos: return '', '', None
    rect_por, por, _ = max(precos, key=lambda p: p[2])
    centro = (rect_por.tl + rect_por.br) / 2
    outros = [p for p in precos if p[1] != por]
    de = min(outros, key=lambda p: abs((p[0].tl + p[0].br) / 2 - centro) / p[2] ** 2)[1] if outros else ''
    return por, de, rect_por
```

O critério antigo ("segundo maior preço do grupo") pegava o preço de um **vizinho** quando ele caía no
grupo (Melão Amarelo saía com `de=9,99` em vez de `8,99`). "O mais perto" sozinho pegava a
equivalência miúda colada no selo. Dividir a distância pelo **quadrado** do tamanho da fonte favorece
o preço normal (médio, perto) sobre a equivalência (pequena, perto) e sobre o vizinho (grande, longe).
O `por` continua sendo o de maior fonte; o retângulo dele é devolvido para a escolha da unidade.

### 3.3 Equivalência por quilo não é preço normal

```python
EQUIVALENCIA = re.compile(r'sai por|pre[çc]o d[oa] (kg|quilo)', re.I)
...
equivalencia = lambda r: any(l.y0 - r.height < r.y0 < l.y1 + r.height and -5 < r.x0 - l.x1 < 40 for l in legendas)
precos = [p for p in _tokens_preco(spans) if not equivalencia(p[0])]
```

Produtos vendidos a cada 100 g trazem "No Clube de Desconto o preço do Kg sai por: R$ 19,90". Na
Mortadela (encarte de carnes) o `19,90` começa em x = 744, logo à direita da legenda (que começa em
x = 718, mesmas linhas y 995–1010). A legenda tem fonte 4 — abaixo do mínimo de 5 dos `spans` — por
isso as legendas são coletadas **separadamente**, antes desse filtro. O preço que começa até 40 pt
depois do fim de uma legenda, na mesma faixa vertical, é descartado.

### 3.4 Unidade = a colada no preço em destaque

```python
def _unidade(unidades, rect_por):
    if not unidades: return ''
    if rect_por is None: escolhida = max(unidades, key=lambda u: u[2])
    else: escolhida = min(unidades, key=lambda u: abs(u[0].x0 - rect_por.x1) + abs(u[0].y0 - rect_por.y1))
    texto = escolhida[1].replace(' ', '')
    return 'UN' if texto.startswith('UNID') else texto
```

"Maior fonte" errava no Doce de Leite: "350g" (fonte 7, parte da descrição) vencia o "CADA" do selo
(fonte 5). A unidade do selo fica no canto inferior direito do preço em destaque, então a distância
Manhattan até `(x1, y1)` do `por` acerta. `UNID.` (Abacaxi) passou a ser reconhecida e vira `UN`, que é
uma opção do template.

As unidades são atribuídas aos grupos com alcance maior (`1.5` × altura da foto, contra `.9` para nome
e preços): no layout FLV o selo fica bem abaixo da foto (no Abacaxi, 79 pt para um limite antigo de
76). Isso não importa unidade do vizinho porque a escolha final é pela proximidade do *próprio* `por`.

### 3.5 Avisos, página e área

```python
def avisos(nome, por, de, unidade):
    avisos = []
    if not nome: avisos.append('Nome não identificado')
    elif len(nome) < 6 or len(nome.split()) < 2: avisos.append('Nome curto: confira se está completo')
    if not por: return avisos + ['Preço em destaque não identificado']
    if not de: avisos.append('Sem preço normal: confira se o encarte tem um')
    elif _valor(de) <= _valor(por): avisos.append('Preço normal menor ou igual ao preço em destaque: confira se não estão trocados')
    if not unidade: avisos.append('Unidade não identificada')
    return avisos
```

Os avisos são **regras de plausibilidade**, não confiança estatística: nome vazio ou de uma palavra,
preço normal ausente ou não maior que o destaque, unidade ausente. Nos três encartes de referência o
extrator corrigido gera **zero** avisos (todos os campos conferem com a conferência manual). O sem-`por`
retorna cedo porque `_valor('')` quebraria — e porque sem preço em destaque as outras comparações não
fazem sentido; esse caso só acontece na marcação manual (o automático descarta grupo sem `por`).

`area` é a união da foto do grupo com todos os textos atribuídos a ele, em pontos do PDF — o que o
destaque desenha na página.

### 3.6 Marcação manual: `ler_area`

Mesma leitura do automático, restrita à área marcada:

- Lê `get_text('dict')` **sem** `clip` e filtra por centro dentro da área — com `clip`, o PyMuPDF corta o
  texto na borda e o nome saía "Clube d".
- A foto é o grupo de imagens transparentes **mais perto do preço**: uma área folgada pegava a foto
  maior de um vizinho.
- Sem nenhuma imagem transparente na área, renderiza a área a 3× (`transparente: False`) — a foto vem
  com o fundo do encarte; o usuário pode usar "Remover fundo" na Biblioteca.

Exemplo verificado: área `[150, 880, 300, 1125]` no encarte FLV → `Creatina Atlhetica 100% Pure`,
`44,99`/`49,99`, `CADA`, foto transparente.

## 4. Backend (`modules/ofertas/__init__.py`)

### 4.1 Rotas

| Rota | Método | Função | Observação |
|---|---|---|---|
| `/api/ofertas/encarte?nome=` | POST (corpo cru) | upload | `%PDF` → thread de leitura; senão tenta abrir como imagem (limite 40 MP) e já fica `pronto` com `itens: []` |
| `/api/ofertas/encarte-paginas?id=` | GET | `paginas_encarte` | `[[w, h], …]` nas unidades das áreas |
| `/ofertas/encarte/<id>/<n>.png` | GET | `pagina_encarte` | PDF renderizado a 1600 px de largura, em cache; imagem servida como está (só `n=1`) |
| `/api/ofertas/encarte-item-salvar` | POST | `conferir_item` | valida e marca `conferido` |
| `/api/ofertas/encarte-item-excluir` | POST | `excluir_item` | remove da lista; imagem fica na Biblioteca |
| `/api/ofertas/encarte-recortar` | POST | `recortar_encarte` | área em frações → item novo |
| `/api/ofertas/encarte-gerar-todos` | POST | `gerar_todos` | lote do encarte inteiro |

Todas passam pelo `handle()` do módulo: POST exige `X-Indoor: 1`, corpo até 100 MB, e as respostas
de arquivo ganham ETag (a página do encarte revalida e volta 304).

### 4.2 Alterar a lista com segurança

```python
def alterar_itens(ident, mudar):
    with LOCK, connect() as db:
        row = db.execute('SELECT nome, status, itens FROM ofertas_encartes WHERE id=?', (ident,)).fetchone()
        if not row: raise ValueError('Encarte não encontrado.')
        if row['status'] != 'pronto': raise ValueError('Espere a leitura do encarte terminar.')
        itens = json.loads(row['itens'] or '[]')
        resultado = mudar(itens, row['nome'])
        db.execute('UPDATE ofertas_encartes SET itens=? WHERE id=?', (json.dumps(itens, ensure_ascii=False), ident))
    return resultado
```

Ler-alterar-gravar o JSON inteiro sob o `LOCK` global evita que duas edições simultâneas se percam
(a última gravaria por cima da primeira). Recusar `lendo` impede editar uma lista que a thread de
leitura ainda vai sobrescrever.

### 4.3 Conferir

`conferir_item` valida no servidor (nome obrigatório; `por` em `\d{1,4},\d{2}`; `de` vazio ou no
mesmo formato) e grava `avisos=[]`, `conferido=True`: quem conferiu assumiu os dados. A unidade é texto
livre (até 12 caracteres) — ver Lacunas.

### 4.4 Recortar

`recortar_encarte` recebe a área em **frações** (0–1) e converte com o tamanho da página:

```python
w, h = tamanhos[numero - 1]
caixa = [area[0] * w, area[1] * h, area[2] * w, area[3] * h]
```

Frações deixam o navegador independente da resolução da imagem exibida. Em PDF chama `ler_area`; em
imagem, recorta com Pillow e devolve campos vazios. A foto vai para a Biblioteca (`salvar_imagem`, que
deduplica por hash) e o item entra no fim da lista com `manual: True` e o aviso
"Marcado à mão: confira os dados" + os avisos normais.

### 4.5 Gerar todos

```python
n = lista['itens']
total = -(-len(itens) // n)
for g in range(total):
    dados = json.loads(json.dumps(schema['padrao']))
    preencher_lista(lista, dados[lista['id']], [itens[(g * n + i) % len(itens)] for i in range(n)])
```

**Exemplo:** encarte de carnes, 21 produtos, template de 6 → `total = ceil(21/6) = 4`. Vídeo 4 usa os
índices 18, 19, 20 e — pelo `% 21` — 0, 1, 2: `completados = 4·6 − 21 = 3`. Completar com os primeiros
produtos evita vídeo com espaços vazios (a quantidade da lista é fixa por template). No teste, 1
produto num template de 6 dá 1 vídeo com o mesmo produto 6 vezes e `completados = 5`.

Detalhes que importam:

- **Recusa o lote se algum produto não tem `por` válido** (listando até 4). Avisos *não* bloqueiam — o
  frontend avisa na confirmação; a decisão é do usuário.
- Cada pedido nasce com **`revision 1`**. O "Novo vídeo" reaproveita (e apaga duplicatas de) rascunhos
  com `revision 0` sem render; um pedido do lote com erro de validação não tem render e seria engolido.
- Pedido com erro de validação (`preparar(...)['erros']`, ex.: nome acima do limite do template) é
  criado mesmo assim, **sem** render, para ser corrigido em Pedidos recentes.
- `enfileirar` foi extraído do `/gerar` e é usado pelos dois: grava a foto dos dados (`dados.json` com
  imagens resolvidas para caminho) e insere o render `na_fila`.

`preencher_lista` é a mesma regra do botão "Preencher" do editor (nome, imagem `biblioteca:<id>`, por,
de, e unidade só se for uma das `opcoes` do template).

## 5. Frontend (`static/ofertas.js`, `index.html`, `ofertas.css`)

**Card do encarte.** Cada produto mostra `Conferir` (com avisos, sempre visível) ou `Editar` (no hover),
um selo "Conferir"/"N avisos" com os textos no `title`, ou "✓ conferido". A dica soma
"· N produtos para conferir". Encarte pronto sem produtos mostra a orientação para marcar à mão — o
texto muda se o nome termina em `.png/.jpg`.

**Diálogo `of-conferir-dialog`**, dois modos (`modoDialogo(marcar)`):

- *Conferir* — página com o destaque da `area` (convertida para porcentagem com o tamanho de
  `/encarte-paginas`), rolada até o destaque; formulário com avisos, nome, preços e unidade (datalist
  com as `opcoes` do template). Salvar atualiza `enc.itens[k]` localmente e zera `state.encarte` para
  forçar o redesenho.
- *Marcar* — página em largura total, navegação entre páginas, arrastar com Pointer Events
  (`setPointerCapture`, `touch-action:none` → mouse, toque e caneta). A seleção é guardada em frações;
  "Recortar" exige área mínima de 0,04% da página. Depois do recorte, abre direto em *Conferir* no item
  novo.

**Gerar todos.** A confirmação calcula vídeos e completados com a mesma conta do servidor e cita os
produtos com aviso; em seguida abre Vídeos gerados (ou Pedidos recentes, se algum pedido falhou na
validação). As tarefas no painel aparecem sozinhas: `carregarFila` cria uma por render `na_fila`.

## 6. Testes

- `tests/test_ofertas.py` (22 no total; os de encarte):
  - leitura em segundo plano com `pagina`, `avisos == []`, página PNG e `encarte-paginas == [[600, 400]]`; apagar remove também a página em cache (404);
  - conferir: `por: '49'` é recusado; salvar zera avisos; excluir; excluir índice inexistente → 400;
  - PDF sem produtos fica `pronto` com `[]`; marcar `[0.05, 0.1, 0.5, 0.8]` no PDF da picanha lê nome e `49,90`;
  - JPG 800×600: `pronto` direto, área `[0.1, 0.1, 0.4, 0.5]` → `[80, 60, 320, 300]`; gerar todos recusa (sem preço);
  - gerar todos: título `Semana 12 · vídeo 1 de 1`, 6 itens iguais, e o pedido sobrevive a um "Novo vídeo". Os renders são cancelados logo após enfileirar para o teste não renderizar de verdade.
- `tests/test_encarte_corpus.py`: para cada encarte em `fixtures/encartes-conferidos.json` (identificado
  por SHA-256), toda oferta conferida precisa ser encontrada (mesmo `por` + nome com ≥ 60% das palavras,
  escolhendo o **mais parecido** — "Peito de Frango" não pode casar com "Filezinho de Peito de Frango"),
  com `de` e unidade iguais; encartes completos precisam ter exatamente o mesmo número de produtos.
  Os PDFs são de clientes e **não** estão no repositório: `OFERTAS_ENCARTES=<pasta>`; sem ela, o teste é
  pulado. Duas referências foram corrigidas após conferir no PDF (campo `obs`): Osso Buco é `KG`, não
  `CADA`; Abacaxi é `UN` (o selo diz `UNID.`).

Resultado: carnes 21/21, FLV 23/23 (era 22 — Creatina), SEMANAL-4-3 5/5 conferidas (o extrator acha 17;
a referência só tinha 5 aprovadas).

## 7. Lacunas e pontos de atenção

1. **Itens endereçados por índice `k`.** Duas abas no mesmo encarte: se uma exclui o item 3, a outra
   salva a conferência do "item 3" — que agora é outro produto. O `LOCK` evita perder gravações, não
   isso. Um id estável por item resolveria.
2. **Regra de preencher duplicada** em `preencher_lista` (Python) e no clique de "Preencher"
   (`ofertas.js`). Se uma mudar sem a outra, o lote e o editor passam a preencher diferente.
3. **Unidade da conferência é texto livre.** Digitar "kg" (minúsculo) ou "UND" salva, mas o template só
   usa unidades que estejam nas `opcoes` (`KG`, `CADA`, `100g`, `UN`, `PCT`) — a unidade é ignorada em
   silêncio no vídeo. A datalist sugere, não obriga.
4. **`gerar_todos` não é transacional.** Se algo falhar no meio (ex.: o motor cair no `preparar` do
   3º vídeo), os pedidos e renders dos grupos anteriores já foram criados.
5. **Avisos não bloqueiam o lote**, só `por` inválido. É intencional (a confirmação mostra quantos têm
   aviso), mas um preço normal trocado vai para o vídeo se o usuário confirmar.
6. **Encartes antigos** (antes desta feature) não têm `pagina`/`area`/`avisos`: sem destaque na página e
   sem avisos, mesmo que tenham os erros que o extrator novo corrige. Reimportar o PDF resolve.
7. **Tipo "imagem" no frontend é deduzido pelo nome** (`/\.(png|jpe?g)$/`), enquanto o servidor decide
   pelo conteúdo (`%PDF`). Um PDF chamado `x.png` mostraria a mensagem de "encarte em imagem".
8. **Heurísticas calibradas em encartes da Uniforça.** A legenda de equivalência (`sai por|preço do kg`),
   o peso `1/tamanho²` e o alcance `1.5` das unidades foram ajustados nesses três encartes. Layouts de
   outras redes podem precisar de novos casos no banco de testes — por isso ele existe.
9. **Recorte manual em imagem vem com fundo**; o item não troca sozinho para a versão sem fundo se o
   usuário remover o fundo na Biblioteca (teria de escolher a nova imagem no formulário).
10. **No modo Conferir não dá para navegar entre páginas** (`pagina-nav` some quando `conf.k !== null`):
    mostra só a página de onde o item veio.
