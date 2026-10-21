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


## Saída HD

Vídeos horizontais 16:9 são entregues em 1280×720. O canvas do template e seus ajustes continuam nas coordenadas originais; a conversão é feita pelo motor depois da renderização, sem cortar ou esticar a arte. H.264, pixels yuv420p, SAR 1:1, áudio copiado e faststart são usados na conversão. Arquivos já em HD não são recodificados, e templates verticais/quadrados preservam a resolução declarada.

O esquema informa a resolução de saída e a interface mostra essa medida no pedido. O kit inclui saida.mjs, necessário ao contrato e ao gerador. FFmpeg pode ser localizado em tools/ffmpeg, no PATH ou pela variável OFERTAS_FFMPEG. Não há dependências novas nem alterações no banco ou no deploy. Vídeos antigos precisam ser gerados novamente.

Teste: node --test tests/saida_hd.test.mjs. O teste de integração cria um MP4 1920×1080 com áudio, exporta em HD e verifica dimensões, duração, áudio e proporção com FFprobe.


## Hora da Feira e Momento do Bebê

Os novos templates `uniforca-hora-da-feira-flexivel` e `uniforca-momento-do-bebe-flexivel` usam as mesmas rotinas de layout, edição e animação do modelo flexível de carnes. As artes e os elementos da marca foram reaproveitados dos modelos já publicados. Datas continuam editáveis; cada tema reserva sua própria área branca e posição da validade. O selo infantil mantém faixa e caixa vermelhas com valores amarelos, com contraste ajustado. Valores de um dígito usam a mesma escala tipográfica dos valores de dois dígitos para preservar a separação do título e do R$.

No bebê, a imagem de presente do modelo anterior é mantida como demonstração, com título explícito orientando sua substituição; o usuário pode escolher os produtos reais da biblioteca/encarte. Não há ilustrações que simulem embalagens reais.

Os três modelos anteriores saem de **Novo vídeo** quando o respectivo flexível está disponível e válido. Os arquivos antigos, pedidos e vídeos são preservados. Em **Templates**, esses modelos ficam identificados como anteriores. Se um substituto não existir ou tiver erro, o modelo anterior continua visível como alternativa. A classificação é informada pelo catálogo do servidor, sem migração ou exclusão de dados.

Validação: testes de contrato exercitam 1, 2, 3, 7 e 30 produtos, slides/animações, final sozinho/trio e persistência dos ajustes. O catálogo tem teste de substituição e de fallback quando o novo modelo está inválido. Conferências visuais de ambos os temas (entradas, repouso e final de três produtos com título longo e ajustes de caracteres) passaram no renderizador, sem erros de layout, execução ou contraste. Testes novos do contrato estão no diretório do motor para serem executados pela CI existente.

## Fluxo guiado e editor integrado

A criação de Ofertas passa por três etapas: **Conferir ofertas**, **Montar cartelas** e **Montar vídeos**. Importar e conferir um encarte não depende de escolher um template. O preenchimento manual continua disponível. O template escolhido recebe os produtos do encarte; quando excedem a capacidade de um vídeo, a interface orienta a organização do lote completo.

Nos templates com `editorCartelas`, a segunda etapa reúne o canvas estático e o formulário do produto selecionado. A seleção na arte, as setas, o seletor de cartela e as miniaturas mantêm o painel sincronizado. Ajustes de posição/tamanho são salvos automaticamente; o salvamento desses ajustes não recarrega o canvas nem apaga seu histórico. Alterações de conteúdo recarregam a composição salva, preservando a cartela e a seleção quando possível. Mensagens de pedidos ou conteúdos anteriores não são aplicadas à montagem atual.

A barra compacta mantém descrições acessíveis nos ícones, seleção de elementos/caracteres, zoom, desfazer/refazer, reprodução da prévia e expansão do editor. Esc recolhe a área expandida. A reprodução usa o mesmo espaço; os campos ficam ocultos durante a animação para evitar confundir o produto selecionado com o que está em reprodução. A terceira etapa concentra nome, animações, último produto sozinho/trio, organização de lotes e geração. Pedidos antigos e templates sem editor integrado continuam acessíveis.

As miniaturas mostram a composição completa do próprio template, com fontes, imagens, preços e ajustes salvos. Apenas as próximas da faixa visível são carregadas; as demais são descarregadas. Uma alteração de layout atualiza a miniatura correspondente sem recarregar o canvas principal. Setas, Home e End permitem navegar pela faixa com teclado.

Escopo da publicação: quatro arquivos da interface de Ofertas (`static/index.html`, somente a seção Ofertas, `static/ofertas.js`, `static/ofertas-editor.js` e `static/ofertas.css`, com regras específicas), testes e esta documentação. Não há alteração de outros módulos, dependências, banco de dados, templates, motor de exportação ou configuração de deploy. Não são enviados dados de clientes, projetos locais, backups ou capturas de tela.

Validação: 20 testes direcionados passaram na preparação local, incluindo saída HD real, seleção, histórico, sincronização, conferência, lotes e miniaturas. A CI existente passa a executar os testes da interface por `ofertas/motor/interface.test.mjs`. A conferência no navegador cobriu seleção direta e com Shift, movimento e desfazer após salvamento, edição de preços, prévia, expansão/Esc, teclado, último trio e atualização da miniatura sem perder o canvas.
