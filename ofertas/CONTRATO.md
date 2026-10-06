# Contrato de template — Fábrica de Vídeos (versão 1)

Um **template** é um projeto HyperFrames que segue este contrato. O sistema monta o formulário a
partir do `template.json`, e o **motor** (`motor/`) transforma o que foi preenchido em vídeo.
O template nunca é alterado: cada vídeo é gerado numa cópia temporária.

```
designer + Claude ──▶ templates/<id>/ ──▶ validar-template ──▶ catálogo
                                                                  │
                          formulário (dados.json) ──▶ gerar ──▶ MP4
```

## 1. Estrutura da pasta

```
templates/<id>/
  template.json   campos do formulário (este contrato)
  index.html      composição HyperFrames ÚNICA que lê tudo das variáveis
  assets/         fundo, fontes, imagens padrão
  capa.png        gerada por validar-template (miniatura do catálogo)
```

- `<id>`: minúsculas, números e hífens, por exemplo `uniforca-hora-da-carne`. Tem que ser igual ao `id` do `template.json`.
- **Uma composição só.** Sub-composições (`data-composition-src`) não recebem os dados do motor:
  o runtime isola cada uma e só entrega os valores escritos no próprio HTML. Repita blocos com
  `<template>` + `cloneNode` dentro do `index.html` (veja o modelo).
- Nada de rede durante o render. O GSAP do CDN padrão (`gsap@3.14.2`) é trocado automaticamente por uma cópia local.
- **Toda fonte com `@font-face` apontando para `assets/fonts/`**, inclusive as que o HyperFrames embute
  no render (Montserrat, Inter…). O preview ao vivo do sistema roda o HTML direto no navegador e não tem essas fontes.

### Tamanho: 1280×720

A composição raiz declara **1280×720** (`data-width="1280" data-height="720"`) — ou **720×1280** na
vertical. O HyperFrames renderiza no tamanho declarado (o Chrome captura cada quadro nesse tamanho;
o `--resolution` do CLI só aumenta, nunca reduz), então o tamanho do template é o tamanho do vídeo.
720p é o padrão do sistema: suficiente para as telas, mais rápido de renderizar e mais leve. Outros
tamanhos são aceitos, mas `validar-template` avisa.

## 2. `template.json`

```json
{
  "contrato": 1,
  "id": "uniforca-hora-da-carne",
  "nome": "Hora da Carne — 3 painéis × 2 produtos",
  "cliente": "Rede Uniforça",
  "descricao": "Texto curto para o catálogo.",
  "capaEm": 2.6,
  "campos": [
    { "id": "validade", "tipo": "texto", "rotulo": "Datas da oferta", "max": 40 },
    { "id": "produtos", "tipo": "lista", "rotulo": "Produtos", "rotuloItem": "Produto",
      "itens": 6, "grupo": { "tamanho": 2, "rotulo": "Painel" },
      "campos": [
        { "id": "nome", "tipo": "texto", "rotulo": "Nome", "max": 60 },
        { "id": "imagem", "tipo": "imagem", "rotulo": "Imagem" },
        { "id": "de", "tipo": "preco", "rotulo": "Preço normal", "opcional": true },
        { "id": "por", "tipo": "preco", "rotulo": "Preço Clube de Desconto" },
        { "id": "unidade", "tipo": "opcoes", "rotulo": "Unidade" },
        { "id": "tamanho", "tipo": "numero", "rotulo": "Tamanho da imagem", "min": 0.3, "max": 1, "passo": 0.05 }
      ] }
  ]
}
```

| Chave | Obrigatória | Significado |
|---|---|---|
| `contrato` | sim | Sempre `1` nesta versão |
| `id`, `nome` | sim | Identificador (igual à pasta) e nome exibido |
| `cliente`, `descricao` | não | Usados no catálogo |
| `capaEm` | não | Segundo usado para a capa; padrão: 40% da duração |
| `campos` | sim | O que o formulário pede, na ordem |

### Campos

Todo campo tem `id` (minúsculas e números, começando por letra), `tipo` e `rotulo`. Opcionais:
`ajuda` (texto de apoio no formulário) e `opcional: true` (aceita vazio).

| `tipo` | Variável HyperFrames | Regras | O formulário mostra |
|---|---|---|---|
| `texto` | `string` | `max` = limite de caracteres | campo de texto |
| `preco` | `string` | aceita `14,99`, `R$ 14,99`, `14.99`, `14`; sempre vira `14,99` | campo com máscara R$ |
| `imagem` | `string` | PNG, JPG ou WEBP; o motor copia para `entrada/` | área de arrastar imagem |
| `numero` | `number` | `min`, `max`, `passo`; aceita `0,8` e `80%` | controle deslizante |
| `opcoes` | `enum` | as opções vêm do `options` declarado no `index.html` | lista de escolha |
| `cor` | `color` | `#RRGGBB` | seletor de cor |
| `booleano` | `boolean` | | liga/desliga |
| `lista` | — | `itens` (quantidade **fixa**), `campos` (sem lista dentro de lista), `rotuloItem`, `grupo` opcional (`tamanho` divide `itens`; serve só para agrupar no formulário) | um card por item |

## 3. `index.html` ↔ `template.json`

Cada campo vira **uma variável declarada** em `data-composition-variables` no `<html>`:

- campo simples → variável com o mesmo id: `validade`
- campo de lista → `<lista>_<n>_<campo>`, com `n` começando em 1: `produtos_1_nome`, `produtos_1_por`, …

Os **valores padrão ficam só no `index.html`** (o `default` de cada declaração). São eles que
preenchem o formulário vazio e o preview do Studio. As imagens padrão ficam em `assets/`.

O script lê tudo de uma vez no início:

```js
const v = window.__hyperframes.getVariables();
const campo = (n, id) => v[`produtos_${n}_${id}`];
```

O validador recusa o template se:
- faltar uma variável;
- uma variável estiver declarada no `index.html` sem campo correspondente no `template.json`;
- o tipo não bater com a tabela acima;
- um valor padrão for inválido (preço mal formatado, imagem padrão inexistente, número fora do intervalo…).

Como a duração do vídeo é fixa no HTML (`data-duration` do `#root`), listas têm quantidade fixa de
itens. Uma variação com outra quantidade (por exemplo, 4 produtos em 2 painéis) é **outro template**.

## 4. Dados (o que o formulário envia)

```json
{
  "validade": "14 e 15 de Outubro de 2026.",
  "produtos": [
    { "nome": "Coxão Duro Bovino Kg", "imagem": "fotos/coxao-duro.png", "de": "49,99", "por": "41,99", "unidade": "KG", "tamanho": 1 }
  ]
}
```

- Os campos são agrupados como no `template.json`. Listas são arrays com exatamente `itens` elementos.
- `imagem`: caminho relativo ao `dados.json`, ou `assets/...` para reaproveitar uma imagem do template.
- Campos desconhecidos, obrigatórios vazios e valores inválidos geram erros legíveis, um por campo
  (`Produto 1 › Preço Clube de Desconto: preço "abc" inválido — use o formato 14,99.`), e nada é gerado.

## 5. Motor

```bash
cd motor && npm install                                   # uma vez (HyperFrames fixado em package.json)
node validar-template.mjs ../templates/<id>               # contrato + hyperframes check + capa.png
node gerar.mjs ../templates/<id> pedido/dados.json -o saida/video.mp4
node gerar.mjs ../templates/<id>                          # sem dados = valores padrão
npm test                                                  # testes do contrato
```

A versão do HyperFrames é a do `motor/package.json`. Para atualizá-la, rode `validar-template`
de novo em todos os templates.
