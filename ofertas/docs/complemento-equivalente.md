# Complemento de preço equivalente por produto

Os cinco templates flexíveis aceitam `equivalenciapreco`,
`equivalenciaunidade` e `equivalenciatexto` em cada produto. São opcionais:
sem valor equivalente, o selo mantém seu formato normal. Pedidos antigos
continuam válidos. Esvaziar o valor remove a extensão.

A leitura dos selos procura uma legenda de equivalência imediatamente abaixo
do selo, como “No Clube de Desconto o preço do Kg sai por:”, junto de um preço.
O valor e a unidade são copiados do PDF; não há conversão automática ou inferência
pela unidade do preço principal. A informação acompanha a oferta na importação,
no preenchimento e na divisão em vários vídeos. Trocar por uma oferta sem
complemento limpa os campos anteriores. Encartes já importados precisam ser
importados novamente para obter a informação adicional.

O contorno da extensão foi extraído do desenho vetorial do SADIA.pdf, com
cor #7a142b. O componente mantém a base vermelha original e reserva a altura
adicional no layout. Texto, valor e unidade podem ser ajustados no editor visual;
os campos de conteúdo ficam na edição do produto. Prévia e exportação usam o
mesmo componente. O selo amarelo aceita a mesma informação em marrom.

Validação local: SADIA.pdf identifica exatamente uma extensão, no Presunto Peru
Sadia 100g, mantendo 3,29/100g e 3,79 como preços principais e 32,90/kg como
equivalente. PERDIGAO.pdf não identifica extensões. Teste sintético comprova que
uma oferta vizinha sem legenda não recebe o complemento. Contratos dos cinco
templates verificam dados antigos, valores inválidos e ajustes preservados.
Snapshot de conferência: dados/teste-complemento-selo/snapshots/frame-00-at-2s.png.
Consulta de créditos HyperFrames indisponível nesta sessão (usage_request_failed).

## Tag circular de promoção e seta

Cada produto também aceita `promopreco` e `promotexto`, opcionais. O leitor
reconhece “Nessa Promo” na célula da oferta e captura a legenda e o valor
próximos, mantendo os preços normal e clube separados. No PERDIGAO.pdf,
somente Margarina Claybom recebe “Nessa Promo 500g saem por:”, 4,99;
o selo principal conserva 9,98. O SADIA.pdf não recebe tags circulares.
Esvaziar o valor remove a tag; substituir uma oferta limpa os campos ausentes.

A tag amarela aparece junto à foto e pode ser movida e redimensionada por
conta própria, com texto e valor também selecionáveis. A seta dos preços
passou a ter seu próprio elemento `seta` no editor dos cinco templates.
Seus ajustes são salvos e aplicados na exportação, com desfazer/refazer
iguais aos demais elementos. O grupo geral de preços continua disponível.

Prévia local: dados/teste-tag-perdigao/snapshots/frame-00-at-2s.png.
