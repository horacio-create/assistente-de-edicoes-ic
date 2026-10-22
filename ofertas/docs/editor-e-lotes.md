# Melhorias do editor e conferência de lotes — 22/10/2026

Implementação local, restrita ao módulo de Ofertas.

- Alinhar à esquerda/direita/topo/base e centros. Um elemento alinha à área útil da cartela; vários podem alinhar entre si ou à cartela. Distribuição horizontal/vertical para três ou mais elementos. As coordenadas respeitam as escalas herdadas e os limites do painel.
- Guias de alinhamento e encaixe ao arrastar, opcionais. Setas e campos numéricos continuam livres do encaixe.
- Padronizar várias cartelas: produto ativo é o modelo, escolha de imagem/título/preço normal/selo/conjunto de preços; seleção das cartelas e deslocamento opcional. Prévia navegável, cancelar sem gravar, aplicar como uma ação única de histórico. Valores, nomes, imagens e ajustes de caracteres permanecem preservados. A escala é relativa à composição do template; não substitui diferenças intrínsecas das fotografias.
- Lotes novos ficam disponíveis em Pedidos recentes > Conferência dos lotes. A montagem inicial registra referências aos produtos de origem, permitindo listar repetidos e excluídos. As cartelas exibem nomes/preços atuais dos pedidos e abrem diretamente na cartela escolhida. Lotes antigos sem esse registro não são agrupados por aproximação.
- Miniaturas JPEG 480x270, em vez de um iframe por cartela. Cache por conteúdo, revisão do template e motor. Mudanças em ajustes de uma cartela não invalidam as outras; títulos podem afetar o layout comum e por isso invalidam o conjunto. Uma fila serial gera as imagens em um navegador por pedido, fora das threads HTTP; imagens já prontas aparecem gradualmente. O botão Atualizar miniaturas permite repetir falhas.
- Acesso a lotes, manifesto e imagens estáticas verifica o dono do pedido. Nenhuma publicação no GitHub nesta etapa.

Validação: testes de navegação/zoom/histórico, persistência dos ajustes, fluxo, layout, cache e distribuição em lote; integração de lotes com nomes alterados, sobras/repetidos e isolamento de usuário. Teste visual no navegador: alinhamento de título, distribuição e alinhamento de três caracteres, prévia/cancelar/aplicar/desfazer/refazer em duas cartelas, lote CAPA+VERSO com 45 produtos e 23 cartelas e abertura direta da cartela 2. Verificação HyperFrames do Momento do Bebê sem erros de runtime/layout/movimento; 165/165 verificações de contraste.
