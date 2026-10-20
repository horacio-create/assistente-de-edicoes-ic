# Cartelas flexíveis e editor visual de Ofertas

No catálogo, use **Hora da Carne — cartelas flexíveis**. Esse template acrescenta:

- Animações opcionais ou slides estáticos; entrada dos produtos com escala e giro, informações em sequência e repouso para leitura.
- Dois produtos por cartela; produto final sozinho ou os últimos três juntos.
- Divisão dos vídeos por preenchimento sequencial ou distribuição equilibrada.
- Conferência antes de gerar, com navegação por cartela, seleção de elementos e caracteres dos preços, movimento e redimensionamento.
- Shift para seleção múltipla, Alt + rolagem para zoom, botão direito + arraste para navegar, Ctrl + Z / Ctrl + Shift + Z para desfazer/refazer.
- Gravação dos ajustes no pedido, aplicados também na exportação. Cancelar descarta a edição temporária.
- Lote com preparação dos pedidos para conferência antes de enfileirar os vídeos.

O layout separa fotografia e informações, reserva a altura real do título e mantém os preços dentro de cada oferta. O leitor de PDF também agrupa embalagens de sabores diferentes quando pertencem ao mesmo título, sem incluir o produto vizinho.

## Integração

O template flexível tem identificador próprio. Templates publicados e pedidos anteriores continuam disponíveis. Na inicialização normal do servidor, o novo template de fábrica é copiado para os dados se ainda não existir, conforme o comportamento existente do módulo. Templates previamente publicados não são sobrescritos automaticamente.

Um template importado separadamente precisa implementar o suporte às funções desejadas. O editor é habilitado por `editorCartelas: true`; os ajustes de cada produto ficam no campo opcional `edicao`, validado pelo formato `ajustesVisuais`. Os assets `layout.js`, `edicao.js` e `animacao.js` do template flexível servem como implementação de referência. Preserve também seus campos, declarações de variáveis e sequência de inicialização.

As mudanças de interface ficam em Ofertas. No HTML compartilhado são acrescentados seus controles e script; no servidor compartilhado, somente a permissão para servir `ofertas-editor.js`. Autenticação, infraestrutura de deploy, dependências e demais módulos não são alterados.

## Verificação

Testes novos cobrem distribuição e resumo dos lotes, compatibilidade de pedidos antigos, validação dos ajustes, hierarquia dos preços, layout, animações e navegação do editor. O corpus de PDFs mantém apenas os resultados esperados; os arquivos dos clientes ficam fora do repositório.

Para verificar os testes JavaScript específicos:

```sh
node --test ofertas/motor/flexivel.test.mjs tests/animacao_ofertas.test.cjs tests/edicao_cartelas.test.cjs tests/editor_navegacao.test.cjs tests/layout_ofertas.test.cjs tests/lote_interface.test.cjs tests/selos.test.cjs
```

Testes Python do módulo e dos novos cenários:

```sh
python -m unittest tests.test_ofertas -q
python -m unittest tests.test_encarte_variantes tests.test_lote_local -q
```

Não são incluídos bancos de dados, PDFs de clientes, encartes importados, vídeos exportados, caches ou configurações da instalação local. Vídeos já exportados precisam ser gerados novamente para usar o novo layout ou as novas animações.
