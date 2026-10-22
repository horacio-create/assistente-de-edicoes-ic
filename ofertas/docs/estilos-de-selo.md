# Estilos de selo nas cartelas flexíveis

Cada template declara seu `seloPadrao`: amarelo arredondado em Carnes/Feira e
vermelho com faixa em Momento do Bebê. O vermelho segue o formato do selo de
CAPA.pdf de 09 a 12.10; os tons foram ajustados levemente para dar contraste aos
textos pequenos. Usa Montserrat Black (fonte local, peso 900) nos nomes dos
produtos, preço normal e preço do clube. O amarelo conserva Bw Seido Round.

O editor tem `estiloselo` no projeto e em cada produto. `padrao` no produto
herda o projeto; `padrao` no projeto herda o template. Os botões “Aplicar a todas
as cartelas” e “Restaurar padrão do template” redefinem apenas essas escolhas,
preservando valores, imagens, datas e os ajustes visuais em `edicao`.

As três pastas de templates incluem a mesma versão portátil de
`assets/selos.js` e `assets/selos.css`. O componente é aplicado antes da
preparação das camadas editáveis. O layout mede a altura real do selo; o modelo
vermelho é mais largo em proporção e não é esticado para o formato amarelo.
A seleção também acompanha os pedidos criados pela organização em vários vídeos.

Os campos novos são opcionais para aceitar pedidos anteriores. As prévias,
miniaturas, cartelas estáticas e vídeos usam os mesmos arquivos do template.

Validação local: troca global, exceção em um produto, restauração do padrão,
carregamento da fonte Montserrat 900 e preço 149,99 dentro dos limites. O
`hyperframes check` do Momento do Bebê passou com 0 problemas de layout em 9
amostras, 0 erros de movimento e 165/165 verificações de contraste aprovadas.
`node --test` em ofertas/motor cobre contrato, herança, dados antigos, rejeição
de estilos inválidos e preservação dos valores e ajustes visuais.

Refino visual de 22/10: selo vermelho com proporção 229 × 128, faixa mais estreita, dobra superior, cantos inferiores ajustados e hierarquia Montserrat Black com vírgula elevada e unidade em minúsculas. Componente compartilhado pelos três templates. Verificação: 18 testes aprovados; check do Momento do Bebê sem erros de execução, layout ou movimento, 165/165 verificações de contraste aprovadas. Prévia: dados/validacao-selos/momento-bebe-selo-vermelho-refinado.png.
