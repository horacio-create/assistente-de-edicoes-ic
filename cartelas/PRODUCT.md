# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Atendimento e vendedores da Indoor Channel. Não são designers: recebem o pedido do cliente (roteiro, mensagens de WhatsApp, prints, áudios), montam as cartelas do VT e preparam a entrega. Usam o app várias vezes ao dia, muitas vezes com o cliente esperando a aprovação.

## Product Purpose

Transformar o pedido de um cliente em um conjunto de cartelas de VT prontas para aprovação e produção, sem exigir conhecimento de design. Sucesso: o vendedor sai do pedido recebido para a montagem aprovada e os PSDs em camadas no mesmo atendimento, preservando a identidade do cliente e permitindo edição posterior no Photoshop.

## Positioning

Ferramenta interna da Indoor Channel feita para o formato dos VTs exibidos nas TVs da Indoor em comércios, clínicas e restaurantes: entende o pedido no jeito que ele chega (texto, prints, áudio), aplica coleções visuais baseadas em VTs reais de clientes e entrega PSDs editáveis no padrão da produção.

## Operating Context

- Os VTs são exibidos nas TVs da Indoor Channel nos estabelecimentos (mídia indoor), vistos de longe e por poucos segundos por cartela.
- Formato de produção: cartelas individuais 1280 × 720; saídas em PNG por cartela, imagem de aprovação (montagem) e PSDs em camadas (textos nativos, fotos como objetos inteligentes com máscara).
- Fluxo em cinco etapas: Pedido → Materiais (logo, fotos, QR) → Estilo (coleção visual) → Edição → Revisão e entrega.
- Roda localmente no Windows (Node, 127.0.0.1:3210), com Photoshop aberto na máquina para gerar os PSDs; dados ficam no navegador e em cópias em disco.
- Identidade do cliente: perfis salvos de clientes, leitura do site do cliente e captura do Instagram por extensão do Chrome.

## Capabilities and Constraints

- Leitura local de pedidos (OCR e transcrição) sem depender de API; interpretação por IA é opcional.
- Coleções prontas por segmento (saúde e estética, comércio e alimentação, educação, eventos/academias) e coleções/layouts pessoais reutilizáveis.
- Pendências por cartela (materiais solicitados, QR legível, texto que não cabe) e revisão interna separada da aprovação do cliente.
- O app não inventa produtos, preços ou contatos: o que não veio no pedido fica vazio e sinalizado.
- A interface (chrome) não altera as cores, fontes ou elementos das artes dos clientes; a arte é desenhada em Canvas.

## Brand Commitments

- Produto da Indoor Channel. O Cartelas pode ter visual próprio, independente do Assistente de Edições (decisão do usuário em 10/11/2026); a identidade atual em `public/indoor-theme.css` é a referência incumbente, não uma obrigação.
- Interface em português do Brasil.

## Evidence on Hand

- 47 VTs reais de clientes em `Referências Cartelas/` (base das coleções Vitrine, Onda, Oferta, Consultório, Impacto).
- Projetos de exemplo em `Exemplos/` (Dra. Victoria, Restaurante Mangai, Simulação Aurora).
- Não há depoimentos, métricas de uso ou dados de clientes para citar na interface.

## Product Principles

1. Quem não é designer precisa chegar a um resultado profissional: a melhor escolha deve ser a mais óbvia.
2. O pedido do cliente é a fonte de verdade: nada é inventado, tudo que falta fica visível.
3. A tela deve servir para mostrar ao cliente: a prévia da cartela é o centro.
4. Nada se perde: desfazer, versões e confirmação antes de substituir trabalho.
5. A entrega precisa estar certa na primeira vez: pendências aparecem antes da exportação, não depois.
