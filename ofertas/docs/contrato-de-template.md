# Raio-x: Contrato de template e motor (Fase 1 da Fábrica de Vídeos)

## 1. Motivação

A equipe produz muitos VTs de oferta (encartes de supermercado, promoções de clientes diferentes).
Cada VT é um layout fixo em que só o conteúdo muda a cada semana: produtos, preços, imagens, datas.
O objetivo da Fábrica de Vídeos é separar três papéis:

- **Designer + Claude** criam um *template* (layout + animação) uma vez.
- **Quem opera** preenche um formulário ("Produto 1: nome, preço, preço com desconto, imagem").
- **O HyperFrames** é só o motor que transforma template + dados em MP4.

A Fase 1 entrega a peça que liga os três: um **contrato** que diz o que um template precisa declarar
para que o formulário seja gerado automaticamente e o render receba os dados. Também converte o VT
"Hora da Carne" para esse contrato, como template de referência.

```
templates/<id>/template.json ──┐                ┌─▶ (Fase 2) formulário gerado dos campos
templates/<id>/index.html ─────┼─▶ validarTemplate ─▶ capa.png / catálogo
  (data-composition-variables) ┘        │
                                         ▼
dados.json (formato do formulário) ─▶ prepararDados ─▶ variaveis.json + entrada/*.png
                                         │
                                         ▼
                         cópia temporária do template ─▶ hyperframes render
                                 --variables-file --strict-variables ─▶ MP4
```

| Arquivo | Papel |
|---|---|
| `CONTRATO.md` | Especificação para quem cria templates e para quem constrói o sistema |
| `motor/contrato.mjs` | Biblioteca: leitura, validação de template, normalização e conversão dos dados |
| `motor/validar-template.mjs` | CLI: porta de entrada de um template (contrato + `hyperframes check` + capa) |
| `motor/gerar.mjs` | CLI: dados → MP4 |
| `motor/hyperframes.mjs` | Executa o HyperFrames fixado no `motor/package.json` |
| `motor/contrato.test.mjs` | Testes `node --test` do contrato |
| `templates/uniforca-hora-da-carne/` | Template de referência (composição única) |

## 2. A descoberta que definiu o contrato

A versão anterior do Hora da Carne (`videos/hora-da-carne`) usava **sub-composições**: um arquivo
`tela-produtos.html` montado 3 vezes, com os dados de cada painel em `data-variable-values` no host.
O runtime do HyperFrames isola cada sub-composição. Dentro dela, `window.__hyperframes.getVariables()`
é trocado por uma versão restrita àquela composição (trecho do runtime em
`node_modules/hyperframes/dist/hyperframe-runtime.js`):

```js
getVariables: function() {
  var byComp = window.__hfVariablesByComp;
  var scoped = byComp && __hfTimelineCompId ? byComp[__hfTimelineCompId] : null;
  return scoped ? Object.assign({}, scoped) : {};
},
```

`__hfVariablesByComp[id]` é montado só com os *defaults* declarados na sub-composição mais o
`data-variable-values` do host. Os valores passados ao render com `--variables-file` **não chegam**
lá dentro. Já a função global (`Jc`) mescla as declarações com `window.__hfVariables`, que é onde o
CLI injeta o arquivo de variáveis.

Isso foi confirmado com um render mínimo: uma composição única com `produtos_1_nome` (padrão
`"PADRAO"`), renderizada com `--variables-file` contendo `"INJETADO"` e `--strict-variables`.
O frame mostrou `INJETADO 0.8`.

Daí vem a regra central do contrato: **o template é uma composição única e lê tudo de
`getVariables()`**. Repetição visual (vários produtos e painéis) é feita com `<template>` +
`cloneNode` dentro do próprio `index.html`.

## 3. O contrato: `template.json` ↔ variáveis do `index.html`

### 3.1 Tipos

`motor/contrato.mjs:9`:

```js
// tipo do contrato -> tipo de variável HyperFrames
const TIPOS = {
  texto: "string",
  preco: "string",
  imagem: "string",
  numero: "number",
  opcoes: "enum",
  cor: "color",
  booleano: "boolean",
  lista: null,
};
```

O contrato tem tipos **semânticos** (`preco`, `imagem`), e o HyperFrames só conhece os técnicos
(`string`, `number`, `enum`…). O tipo semântico é o que permite ao formulário mostrar uma máscara de
R$ ou uma área de arrastar imagem, e ao motor normalizar o valor. `lista` não tem variável própria:
ela se desdobra em várias.

### 3.2 Desdobramento de listas

Variáveis do HyperFrames são planas (sem arrays). A lista do formulário é achatada por convenção de
nome (`motor/contrato.mjs:60`):

```js
export function variaveisEsperadas(campos) {
  const out = [];
  for (const c of campos) {
    if (c.tipo !== "lista") out.push({ id: c.id, campo: c, rotulo: c.rotulo });
    else
      for (let n = 1; n <= c.itens; n++)
        for (const sub of c.campos)
          out.push({ id: `${c.id}_${n}_${sub.id}`, campo: sub, rotulo: `${c.rotuloItem || c.rotulo} ${n} › ${sub.rotulo}` });
  }
  return out;
}
```

Exemplo com o Hora da Carne: `validade` + 6 produtos × 6 subcampos = 1 + 36 = **37 variáveis**,
o número que o `validar-template` imprime. O `_` foi escolhido em vez de `.` porque o HyperFrames
transforma cada variável escalar em uma propriedade CSS `--{id}`, e ponto não é válido num
identificador CSS. O `rotulo` composto ("Produto 3 › Imagem") é guardado junto para que os erros
apontem o campo como o usuário o vê no formulário, não pelo nome técnico.

Os ids de campo são restritos a `^[a-z][a-z0-9]*$` (`ID`, linha 21). Sem `_` dentro de um id,
o nome achatado `produtos_1_nome` não é ambíguo.

### 3.3 Onde ficam os valores padrão

Os defaults ficam **só** no `index.html` (`default` de cada declaração), e não no `template.json`.
Assim existe uma única fonte para "como o template aparece vazio", que é a mesma que o Studio do
HyperFrames usa no preview. O formulário pega esses valores com `dadosPadrao`
(`motor/contrato.mjs:229`), que faz o caminho inverso do achatamento:

```js
dados[c.id] = Array.from({ length: c.itens }, (_, i) =>
  Object.fromEntries(c.campos.map((s) => [s.id, decl.get(`${c.id}_${i + 1}_${s.id}`)])),
);
```

Pela mesma lógica, as opções de um campo `opcoes` vêm do `options` do `enum` declarado no HTML
(o campo `unidade` no `template.json` não lista opções).

### 3.4 Lendo as declarações (`lerDeclaracoes`)

```js
export function lerDeclaracoes(html) {
  const tag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  const m = /data-composition-variables\s*=\s*(?:'([^']*)'|"([^"]*)")/.exec(tag);
  if (!m) return [];
  return JSON.parse(desescapar(m[1] ?? m[2]));
}
```

Aceita aspas simples **e** duplas com entidades (`&quot;`) porque o Studio do HyperFrames, ao salvar
uma edição, re-serializa o atributo como `data-composition-variables="[{&quot;id&quot;…`. Isso
aconteceu durante o desenvolvimento do projeto anterior. Um template editado no Studio continua
legível pelo motor.

## 4. Validação

### 4.1 Valores (`validarValor`, `motor/contrato.mjs:74`)

Uma única função valida tanto os *defaults* do template quanto os dados do formulário, para que as
duas validações nunca divirjam. A diferença entre os dois casos fica no `ctx.imagem`, a estratégia
para resolver imagens (veja 4.3 e 5).

Normalizadores aceitam o que um humano digita:

```js
// "R$ 14,99" | "14.99" | "14" | "14,9" -> "14,99"
export function normalizarPreco(bruto) {
  const s = String(bruto).replace(/R\$|\s/gi, "").replace(".", ",");
  const m = /^(\d+)(?:,(\d{1,2}))?$/.exec(s);
  return m ? `${m[1]},${(m[2] || "00").padEnd(2, "0")}` : null;
}
```

Exemplo do teste (`contrato.test.mjs`): `"R$ 41.9"` → remove `R$` e espaço → `"41.9"` → troca o
ponto → `"41,9"` → casa `(\d+),(\d{1,2})` com `41` e `9` → `padEnd` → **`"41,90"`**. O render
real de ponta a ponta mostrou exatamente `41 90` no selo.

O preço sai sempre como texto `"14,99"`, e não como número, porque o template precisa separar
inteiro e centavos (`"14,99".split(",")`) para desenhar o selo do VT original (14 grande, 99
elevado). Um número `14.9` perderia o zero final.

Campo `opcional` vazio retorna `""` (ou o default, se for `numero`). É assim que o "preço normal"
vazio faz o template esconder o preço riscado e a seta.

### 4.2 Template (`validarTemplate`, `motor/contrato.mjs:114`)

Roda em camadas e retorna cedo quando uma camada falha, para que um `template.json` malformado não
gere uma cascata de erros sem sentido:

1. **Metadados:** `contrato === 1`, `id` igual ao nome da pasta, `nome`, `campos` não vazio.
   O id igual à pasta deixa o catálogo endereçar o template pelo diretório sem índice separado.
2. **Campos:** id válido, tipo conhecido, `rotulo`, ids únicos; em listas, `itens` inteiro ≥ 1,
   `itens` múltiplo de `grupo.tamanho`, sem lista dentro de lista.
3. **HTML ↔ JSON:**

```js
if (!html.includes("getVariables")) erros.push("index.html não lê as variáveis (window.__hyperframes.getVariables()).");
if (/data-composition-src/.test(html))
  erros.push("index.html usa sub-composições (data-composition-src): elas não recebem os dados do motor — use uma composição única.");
```

   Depois, para cada variável esperada: precisa estar declarada, com o tipo da tabela, e com default
   válido. Por fim, a checagem inversa: toda variável declarada precisa ter um campo. Essa checagem
   pega a variável "órfã" que o designer adicionou ao HTML e esqueceu no `template.json`. Sem ela,
   o campo nunca apareceria no formulário e ficaria preso no padrão.

### 4.3 Imagens padrão

Nos defaults, `ctx.imagem` só confere se o arquivo existe dentro do template:

```js
imagem: (p) => (existsSync(join(t.dir, p)) ? { valor: p } : { erro: `imagem padrão "${p}" não existe no template.` }),
```

## 5. Dados → variáveis (`prepararDados`, `motor/contrato.mjs:184`)

Recebe os dados no formato do formulário (agrupado) e devolve `{ variaveis, copias, erros }`.

Imagens enviadas pelo usuário viram cópias para dentro da pasta de trabalho:

```js
const imagem = (destino) => (p) => {
  if (p.startsWith("assets/") && existsSync(join(template.dir, p))) return { valor: p };
  const origem = resolve(baseDir, p);
  if (!existsSync(origem)) return { erro: `arquivo "${p}" não encontrado.` };
  if (!EXT_IMAGEM.includes(extname(origem).toLowerCase())) return { erro: `"${basename(origem)}" não é PNG, JPG ou WEBP.` };
  const para = `entrada/${destino}${extname(origem).toLowerCase()}`;
  copias.push({ de: origem, para });
  return { valor: para };
};
```

- `assets/...` reaproveita uma imagem que já existe no template (os padrões).
- Qualquer outro caminho é resolvido em relação ao `dados.json`. Na Fase 2 será a pasta de upload.
- O destino recebe o **id da variável** como nome (`entrada/produtos_2_imagem.png`), e não o nome
  original. Isso evita colisão quando dois uploads se chamam `foto.png`, e nomes com espaços e
  acentos nunca chegam ao HTML.
- A variável recebe um caminho **relativo** (`entrada/...`). O render não faz requisição de rede
  para buscar imagens, o que mantém o resultado determinístico.

Exemplo do teste "erros legíveis por campo": partindo dos padrões, o teste altera 7 coisas e espera
**6 erros**. O 7º, `produtos[5].de = ""`, é um opcional vazio e é aceito como `""`:

```
campo "extra" não existe neste template.
Produto 1 › Preço Clube de Desconto: preço "abc" inválido — use o formato 14,99.
Produto 2 › Unidade: "LITRO" não é uma opção (KG, CADA, 100g, UN, PCT).
Produto 3 › Imagem: arquivo "nao-existe.png" não encontrado.
Produto 4 › Tamanho da imagem: deve ficar entre 0.3 e 1.
Produto 5 › Nome: máximo de 60 caracteres (tem 61).
```

Todos os erros são coletados de uma vez, e não só o primeiro, porque no formulário cada erro vai ser
exibido ao lado do seu campo.

## 6. Pontos de entrada (CLIs)

### 6.1 `validar-template.mjs`

Contrato → `hyperframes check` (silencioso, filtra só linhas de erro) → capa:

```js
const duracao = Number(/id="root"[^>]*data-duration="([\d.]+)"/.exec(template.html)?.[1] || 0);
const em = template.meta.capaEm ?? +(duracao * 0.4).toFixed(2);
```

Os 40% da duração são um chute genérico. No Hora da Carne isso dava 6s, que cai no meio da queda
dos produtos do painel 2, por isso o template define `"capaEm": 2.6` (painel 1 parado). A capa é
gerada com `hyperframes snapshot`, renomeada para `capa.png`, e a pasta `snapshots/` é apagada.

### 6.2 `gerar.mjs`

```js
const trabalho = mkdtempSync(join(tmpdir(), `fabrica-${template.meta.id}-`));
try {
  cpSync(template.dir, trabalho, {
    recursive: true,
    filter: (p) => !/[/\\](snapshots|renders|node_modules|\.hyperframes)([/\\]|$)/.test(p),
  });
  mkdirSync(join(trabalho, "entrada"), { recursive: true });
  for (const { de, para } of copias) copyFileSync(de, join(trabalho, para));
  writeFileSync(join(trabalho, "variaveis.json"), JSON.stringify(variaveis, null, 2));
  const r = hyperframes(["render", "--variables-file", "variaveis.json", "--strict-variables", "-o", "saida.mp4"], trabalho);
  ...
} finally {
  rmSync(trabalho, { recursive: true, force: true });
}
```

- **Cópia temporária:** o template publicado nunca é alterado. Isso permite renders em paralelo do
  mesmo template na Fase 2, e uma falha no meio não deixa lixo no catálogo.
- **`--strict-variables`:** é uma segunda rede de segurança. Se `prepararDados` deixar passar uma
  chave não declarada ou um tipo errado, o HyperFrames recusa em vez de renderizar com o padrão.
- Validação de template e de dados acontecem **antes** de criar a pasta de trabalho, então dados
  inválidos não custam nenhum render ("nada foi gerado").
- Sem `dados.json`, usa `dadosPadrao`. É útil para gerar o "vídeo de exemplo" do catálogo.

### 6.3 `hyperframes.mjs`

```js
const BIN = fileURLToPath(new URL("./node_modules/.bin/hyperframes", import.meta.url));
```

Todos os templates rodam na versão do `motor/package.json` (`hyperframes: 0.8.137`), e não na
versão que cada projeto fixava no próprio `package.json`. Com isso o render de um template validado
hoje é reproduzível. Atualizar o HyperFrames vira uma decisão central: troca a versão e revalida
todos os templates.

## 7. O template de referência: `uniforca-hora-da-carne`

Estrutura estática (`index.html:631`): os 3 painéis são clips com tempos fixos, e a sobreposição
de 0,35s é o que cria a transição (o painel seguinte começa a cair enquanto o anterior sai):

```html
<div id="painel-1" class="clip painel" data-start="0" data-duration="5.35" data-track-index="2"></div>
<div id="painel-2" class="clip painel" data-start="5" data-duration="5.35" data-track-index="3"></div>
<div id="painel-3" class="clip painel" data-start="10" data-duration="5" data-track-index="2"></div>
```

O último painel dura 5s, e não 5,35s, para terminar exatamente em 15s, no quadro vazio. O loop
na TV emenda sem corte.

Leitura dos dados e montagem (`index.html:652` e `:669`):

```js
const v = window.__hyperframes.getVariables();
const campo = (n, id) => v[`produtos_${n}_${id}`];
const POR_PAINEL = 2;
```

```js
function montarProduto(n) {
  const p = document.getElementById("tpl-produto").content.firstElementChild.cloneNode(true);
  p.querySelector(".nome").textContent = campo(n, "nome");
  const foto = p.querySelector(".foto");
  foto.src = campo(n, "imagem");
  foto.style.width = foto.style.height = (Number(campo(n, "tamanho")) || 1) * 100 + "%";
  preencherPreco(p.querySelector(".selo-preco"), campo(n, "por"), campo(n, "unidade"), true);
  if (String(campo(n, "de") || "").trim()) preencherPreco(p.querySelector(".de"), campo(n, "de"), campo(n, "unidade"), false);
  else p.querySelectorAll(".de, .seta").forEach((el) => el.remove());
  return p;
}
```

- `<template id="tpl-produto">` substitui a antiga sub-composição. É o mesmo reaproveitamento de
  layout, sem o isolamento que bloqueava os dados.
- `textContent` (e não `innerHTML`) para o nome: um nome digitado no formulário com `<` não vira HTML.
- O preço sem `de` **remove** o preço riscado e a seta em vez de escondê-los, e a animação só
  anima o que sobrou (`precoNormal = [...p.querySelectorAll(".de, .seta")]`).

As animações por produto (`animarProduto`, `index.html:683`) recebem o `inicio` do painel e
posicionam tudo em tempo global numa timeline só. O quique contínuo calcula quantas repetições
cabem até a saída:

```js
const meios = Math.floor((D - 0.5 - 1.35 - i * 0.14) / 0.42);
tl.to(box, { y: -18, duration: 0.42, ease: "sine.out", yoyo: true, repeat: Math.max(1, meios % 2 ? meios - 2 : meios - 1) }, t + 1.35);
```

Exemplo, painel 1, produto da esquerda (`D = 5.35`, `i = 0`): `(5.35 − 0.5 − 1.35) / 0.42 = 8.33`
→ `meios = 8` (par) → `repeat = 7`. 7 repetições = 8 meios-ciclos de 0,42s = 3,36s; começa em
1,35s e termina em **4,71s**, antes da saída (`D − 0.5 = 4,85s`). O `repeat` precisa ser ímpar: num
`yoyo`, um número par de meios-ciclos termina de volta em `y: 0`, então o produto sai de uma posição
de repouso e não do alto de um quique.

## 8. Testes

`motor/contrato.test.mjs` (`npm test`, 7 testes, todos passando):

| Teste | O que garante |
|---|---|
| normalizadores | formatos aceitos de preço e número |
| template modelo cumpre o contrato | o template de referência está válido (pega regressão ao editá-lo) |
| variável faltando, tipo errado, órfã | as três checagens HTML ↔ JSON |
| sub-composição e id ≠ pasta | regra da composição única e a parada antecipada da camada de metadados |
| dados padrão viram variáveis | `dadosPadrao` ∘ `prepararDados` é identidade e não copia imagens |
| erros legíveis por campo | 6 erros, com rótulos humanos; opcional vazio aceito |
| quantidade de itens é fixa | lista com 5 itens em template de 6 é recusada |

Os testes trabalham sobre **cópias** do template de referência (`copia()`) com o mesmo nome de
pasta, porque o contrato exige `id === pasta`.

O render de ponta a ponta foi verificado manualmente (fora da suíte, porque leva cerca de 26s): um
`dados.json` com 2 imagens externas, `"R$ 41.9"`, preço normal vazio e data nova gerou um MP4
1920×1080 de 15,0s. O frame em 2,6s mostrou os valores injetados.

## 9. Lacunas e pontos de atenção

- **Duplicação template.json ↔ index.html não validada:** `itens: 6` e `grupo.tamanho: 2` no JSON e
  `POR_PAINEL = 2` + 3 painéis estáticos no HTML precisam concordar, e o validador não confere isso.
  Se alguém mudar `itens` para 8 e declarar as variáveis, o contrato passa, mas os produtos 7 e 8
  nunca aparecem. Possível mitigação: o template derivar o número de painéis de `.painel` e o
  validador conferir `painéis × POR_PAINEL === itens` (exigiria uma convenção a mais).
- **GSAP vem de CDN** (`cdn.jsdelivr.net`): é a única dependência de rede do render. Num worker sem
  internet, o render quebra. Vale servir o GSAP localmente na Fase 2.
- **Imagens só são checadas pela extensão.** Um `.png` corrompido ou com fundo opaco passa. A remoção
  de fundo e a checagem de transparência ficaram para a Fase 2.
- `normalizarPreco` troca só o **primeiro** ponto e não entende separador de milhar: `"1.234,56"`
  é recusado. Para encartes é raro, mas é uma limitação.
- O texto fixo "Ofertas válidas para os dias" está no HTML, não é campo. Só as datas são editáveis.
- `capaEm` padrão (40% da duração) depende da regex `id="root"[^>]*data-duration`, que exige `id`
  antes de `data-duration` na tag. Se o Studio reordenar atributos, cai para `0s`.
- O filtro de cópia do `gerar` testa o caminho **absoluto**. Um template guardado sob uma pasta
  chamada `renders/` ou `snapshots/` seria copiado vazio.
- `capa.png` é um artefato gerado que mora dentro da pasta do template, e o `.gitignore` não o exclui.
- `validar-template` filtra a saída do `hyperframes check` por linhas com `✗`/`error`. Se o formato
  do CLI mudar, a mensagem de falha pode sair vazia (o código de saída continua correto).
- O projeto antigo `videos/hora-da-carne` (sub-composições + CSV + `atualizar.mjs`) continua existindo
  e está **divergente** deste template. Deve ser aposentado para não haver duas versões do mesmo VT.
