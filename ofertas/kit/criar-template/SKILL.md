---
name: criar-template-ofertas
description: Cria ou adapta um template de Ofertas de supermercados (Assistente de Edições · Indoor Channel) — um projeto HyperFrames que segue o contrato do módulo, para que o sistema gere o formulário e os vídeos sozinho. Use quando o designer pedir "crie um template de ofertas", "transforme esta arte/VT em template", "adapte este vídeo para o Assistente de Edições" ou mencionar template.json / contrato de template.
---

# Criar template de Ofertas de supermercados

Um template é um VT com layout fixo cujo **conteúdo** (produtos, preços, imagens, datas) é preenchido
por outra pessoa num formulário. Você entrega a pasta do template; o sistema monta o formulário, a
prévia e o render.

**Esta pasta (a pasta desta skill) traz tudo o que você precisa:**

```
CONTRATO.md                         a referência completa — leia antes de começar
motor/validar-template.mjs          valida o contrato + hyperframes check + gera a capa
motor/gerar.mjs                     renderiza um MP4 de teste (com os valores padrão ou um dados.json)
motor/contrato.mjs, hyperframes.mjs bibliotecas usadas pelos dois acima
templates/uniforca-hora-da-carne/   template de exemplo, completo e válido
```

Na primeira vez, instale o motor (precisa de Node.js 20+; baixa o HyperFrames e o GSAP):

```bash
cd "<pasta desta skill>/motor" && npm install
```

## O que entregar

```
<id>/                 id = minúsculas, números e hífens (ex.: rede-x-feira-hortifruti)
  template.json       os campos do formulário
  index.html          composição HyperFrames ÚNICA que lê tudo de getVariables()
  assets/             fundo, fontes (.woff2), imagens padrão
```

## Tamanho: 1280×720

Crie a composição em **1280×720** (`data-width="1280" data-height="720"` no elemento raiz) — ou
**720×1280** se o VT for vertical — e meça tudo (posições, fontes, imagens) nesse tamanho.

O HyperFrames renderiza no tamanho que a composição declara: o Chrome captura cada quadro nesse
tamanho. 720p é o padrão do sistema — é suficiente para as telas, renderiza bem mais rápido que 1080p
(menos de metade dos pixels por quadro) e gera arquivos menores. Um template em outro tamanho é aceito,
mas o validador avisa e o vídeo sai mais lento e mais pesado. Exporte o fundo e as imagens já no
tamanho de uso (fundo 1280×720), sem sobra de resolução.

O template de exemplo foi criado em 1920×1080, antes desse padrão: use-o como referência de
**estrutura** (contrato, variáveis, `<template>` + `cloneNode`, animação), não de medidas.

## Passo a passo

1. **Entenda a peça.** Com o designer, identifique o que muda a cada semana (vira campo) e o que é
   fixo (fica no HTML/fundo). Pergunte quantos itens a lista tem e se a quantidade varia de vídeo
   para vídeo. Fixa (ex.: sempre 6): `"itens": 6`. Variável (ex.: 2 ou 3 painéis de 2): `"itens": 6,
   "min": 4` + a variável `produtos_total`, e o template divide os 15s entre os painéis usados — veja
   CONTRATO.md §3.1.
2. **Use HyperFrames** para o layout e a animação (skills `/hyperframes`, `/hyperframes-core`,
   `/hyperframes-animation`, se instaladas). Restrições do contrato:
   - **Uma composição só** em `index.html`. **Nunca** use `data-composition-src` — sub-composições não
     recebem os dados do sistema. Para repetir um bloco (card de produto, painel), use `<template>` +
     `cloneNode(true)` no script.
   - **Toda fonte com `@font-face`** apontando para `assets/fonts/*.woff2`, inclusive Montserrat/Inter
     (a prévia do sistema roda o HTML direto no navegador, sem as fontes embutidas do HyperFrames).
   - Imagens padrão em `assets/`; nada de URLs externas (o GSAP do CDN `gsap@3.14.2` é aceito: o
     motor troca por uma cópia local).
   - Textos digitados pelo usuário entram com `textContent`, nunca `innerHTML`.
3. **Escreva o `template.json`** (`"contrato": 1`, `id` igual ao nome da pasta, `nome`, `cliente`,
   `descricao`, `capaEm` = segundo bonito para a capa, `campos`). Tipos: `texto` (com `max`), `preco`,
   `imagem`, `numero` (`min`/`max`/`passo`), `opcoes`, `cor`, `booleano`, `lista` (`itens`, `min` opcional, `campos`,
   `rotuloItem`, `grupo: {tamanho, rotulo}` para agrupar no formulário). Rótulos em português, do jeito
   que quem preenche fala ("Preço Clube de Desconto", não "price2"). Use `ajuda` para orientar.
4. **Declare uma variável por campo** em `data-composition-variables` no `<html>`:
   campo simples → mesmo id; lista → `<lista>_<n>_<campo>` (n começa em 1). Tipos HyperFrames:
   texto/preco/imagem → `string`, numero → `number`, opcoes → `enum` (com `options`), cor → `color`,
   booleano → `boolean`. O `default` de cada uma é o conteúdo de exemplo (aparece no formulário vazio).
5. **Leia os valores no script** uma vez, no início:
   ```js
   const v = window.__hyperframes.getVariables();
   const campo = (n, id) => v[`produtos_${n}_${id}`];
   ```
   Preço chega como texto `"14,99"` — separe inteiro e centavos com `split(",")` se o layout pedir.
   Campo `opcional` vazio chega como `""`: esconda/remova o elemento correspondente.
6. **Valide** antes de entregar. A pasta do template precisa ter o nome igual ao `id`:
   ```bash
   node "<pasta desta skill>/motor/validar-template.mjs" caminho/para/<id>
   node "<pasta desta skill>/motor/gerar.mjs" caminho/para/<id> -o teste.mp4            # valores padrão
   node "<pasta desta skill>/motor/gerar.mjs" caminho/para/<id> dados.json -o teste.mp4 # dados de teste
   ```
   `validar-template` precisa terminar sem `✗`; trate também os avisos `⚠` (tamanho fora de
   1280×720, por exemplo). Teste com dados extremos num `dados.json` no formato do formulário (nome no
   limite de caracteres, preço `1,99` e `999,99`, campo opcional vazio) e confira o MP4.
7. **Publique:** compacte a pasta `<id>` em .zip e arraste em *Ofertas de supermercados → Templates →
   Publicar template* no Assistente de Edições. Publicar de novo com o mesmo `id` substitui o template e
   guarda a versão anterior.

## Erros comuns que o validador recusa

- variável declarada no HTML sem campo no `template.json` (ou o contrário);
- tipo da variável diferente do tipo do campo;
- valor padrão inválido (preço `"abc"`), imagem padrão inexistente;
- `id` diferente do nome da pasta; sub-composições.
