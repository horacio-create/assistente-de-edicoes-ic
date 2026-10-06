# Ofertas de supermercados

Módulo do Assistente de Edições que gera VTs de oferta (MP4) a partir de **templates**. Designers criam
o layout uma vez, com o Claude deles e seguindo o [contrato](CONTRATO.md). Quem opera escolhe o
template, preenche os produtos com prévia ao vivo e gera o vídeo. O HyperFrames é só o motor.

## Habilitar

Requer **Node.js 20+**. O `Instalar.bat` roda `npm install` em `ofertas/motor` quando encontra o Node;
sem ele, o módulo aparece na barra lateral com a explicação de como habilitar (o executável portátil
não inclui Node, então lá o módulo fica desativado). Em macOS/Linux: `cd ofertas/motor && npm install`.

A primeira remoção de fundo baixa um modelo de IA local (~168 MB, uma vez).

## Telas

| Aba | Para quê |
|---|---|
| Novo vídeo | Catálogo de templates → formulário gerado do `template.json` + prévia ao vivo + importar encarte (PDF) |
| Pedidos recentes | Retomar um vídeo (salvo automaticamente) |
| Vídeos gerados | Fila de geração, progresso, prévia e download do MP4 |
| Biblioteca | Imagens enviadas e recortes de encartes; remover fundo |
| Templates | Publicar template (.zip) com validação; a versão anterior é guardada |

Eventos importantes (vídeo gerado, encarte importado, template publicado) aparecem no Histórico do toolkit.

## Onde fica cada coisa

```
ofertas/motor/         Node: contrato.mjs, cli.mjs, gerar.mjs, validar-template.mjs (HyperFrames fixado)
ofertas/templates/     templates que vêm com o sistema (copiados para os dados na primeira execução)
ofertas/kit/           skill para o Claude do designer criar templates
ofertas/CONTRATO.md    o que um template precisa ter
ofertas/docs/          raio-x técnico (escrito quando era um serviço separado; a lógica é a mesma)
modules/ofertas/       Python: rotas /api/ofertas/* e /ofertas/*, fila, publicação, encarte.py
static/ofertas.{js,css} interface do módulo
dados/ofertas/         banco usa o historico.sqlite do toolkit (tabelas ofertas_*); imagens, vídeos e templates publicados
```

Variáveis opcionais: `OFERTAS_RENDERS` (vídeos gerados ao mesmo tempo, padrão 1), `OFERTAS_NODE`
(caminho do Node), `OFERTAS_TEMPLATES` (pasta dos templates publicados).
