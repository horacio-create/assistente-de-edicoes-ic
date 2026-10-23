# Histórico de versões

## 1.13.4 — Ofertas e edição de vídeos em lote — 23/10/2026

- Ofertas: opções de divisão e geração na terceira etapa, com preservação dos ajustes e geração de todos os vídeos previstos; títulos com até 150 caracteres.
- Complemento de preço equivalente e tag promocional opcionais, identificados por produto no encarte. Seta selecionável e ajustável separadamente.
- Vídeos: escolha de uma timeline única ou uma por arquivo na importação, envio de todas à fila sem duplicar itens e opção de manter os nomes originais na exportação.
- Novos vídeos e timelines começam sem áudio; a opção de restaurar o áudio continua disponível.
- Templates de fábrica recebem atualização com backup, preservando personalizações.

## 1.13.3 — Nome do DXF da M6S — 20/10/2026

- O DXF da Vetorização M6S sugere o nome no padrão da equipe, com a medida do vetor:
  "Impressão logo M6S - PAPITO (33,18mm x 12mm).dxf".

## 1.13.2 — Cores da marca Indoor Channel — 19/10/2026

- A interface usa as cores da marca: textos em #2d3144, secundários em #626266, linhas em #dadae5,
  fundos claros em #f9f9f9, barra lateral em #1a1a39, roxo #6a68cb (hover #4336b9), lavanda #b6b9f1 e
  verde #46d880 (hover #75dba9). Arte de cliente, cores das camisas e cores de alerta ficam como estavam.
- Contornos de foco finos (1,5 px, colados no elemento) em todo o sistema, inclusive no login.
- Medida da estampa: campos menores, alinhados com "Estampa" e "cm", com arredondamento em duas casas.

## 1.13.1 — Visualizador de mockups — 19/10/2026

- As setas do mockup ampliado respondem a todo clique (antes, ao apertar, a seta pulava para baixo e o
  clique podia se perder); a janela não muda de tamanho ao trocar de vista nem seleciona texto no duplo clique.
- Troca de vista com uma animação de escala simples; a seta some na primeira e na última vista.
- Mais espaço entre a contagem ("1 de 4") e a borda da janela.

## 1.13.0 — Estampas de camisa — 19/10/2026

- Nova ferramenta Estampas de camisa (permissão própria por cargo): a arte do cliente vira um PDF por
  tamanho e local, pronto para o DTF, na medida exata da arte.
- O cargo "Colaborador EAP" passa a usar as Estampas, junto com a Vetorização M6S e a Logo EAP (liberado
  uma única vez na atualização; o administrador pode tirar depois sem a permissão voltar).
- Tamanhos: comum P, M, G, GG e XGG; baby look P, M e G, todos marcados por padrão. A arte ocupa o maior
  tamanho que cabe na área segura (longe das costuras), sem distorcer, alinhada pelo topo.
- Áreas da frente conforme a gráfica; GG (28 × 38) e XGG (31 × 39,5) calculados pela proporção dos outros
  tamanhos; costas iguais à frente; mangas 9 × 9 cm (comum) e 7 × 7 cm (baby look). Os calculados e os
  padrões aparecem como "a confirmar" até a gráfica validar.
- Locais: frente, costas e mangas. Ao importar, uma janela pergunta onde a estampa vai; dá para usar
  artes diferentes por local (ex.: logo do cliente na frente e logo EAP nas costas).
- Conferência: resolução em cada tamanho (abaixo de 150 dpi e de 300 dpi), fundo branco (com remoção
  automática em PNG/JPG), traços abaixo de 0,5 mm e textos de SVG fora de curvas.
- Folha de conferência em PDF (A3): todos os tamanhos lado a lado, em escala, com camisa, área e arte.
- Mockups: fotos com modelo em cada tamanho (frente, costas e as duas laterais), com a camisa recolorida na cor
  escolhida e a estampa na medida real. A arte acompanha o corpo: curva nas laterais do tronco, se deforma sobre o
  busto e a barriga e segue as dobras do tecido. Prévia no passo 6 e exportação em JPG (4 por tamanho), nas
  pastas "Camisa comum - mockups" e "Camisa baby look - mockups" quando houver mais de 6 tamanhos.
- Várias estampas no mesmo lado (ex.: duas logos no peito): cada uma com o seu tamanho e posição no editor, com
  um X para remover; nenhuma pode ficar por cima de outra, e um aviso pede para remover ou diminuir quando não
  cabem. Na exportação, cada lado vira um PDF só, do tamanho do conjunto, com as estampas nas posições exatas.
- Medida da estampa editável em cm (largura ou altura), com a proporção travada.
- Mockup ampliado com setas (e ← →) para passar pelas 4 vistas.
- Exportação com mais de 6 tamanhos (comum e baby look juntos): os PDFs saem em pastas separadas,
  "Camisa comum - impressão" e "Camisa baby look - impressão" (as de mockups virão com eles); a folha de
  conferência fica na raiz. Opção de compactar tudo em um único .zip.
- Cor da camisa: as 18 cores da Algodão 30.1 Vortex (Click Camisetas), perguntada ao importar e trocável a
  qualquer momento; a prévia e a folha de conferência mostram a camisa nessa cor, e o sistema avisa quando a
  estampa tem pouco contraste com o tecido.
- Tamanho e posição da estampa: arrastar na prévia, puxar o canto ou usar o controle de tamanho (20% a 100%);
  ela nunca sai da área segura e o ajuste vale para todos os tamanhos.
  Ao arrastar, gruda no centro horizontal da área (com guia); a altura fica livre. Alt solta o snap.
- Desenho novo da camisa (comum e baby look, frente e costas), na proporção real: a silhueta recebe a cor da
  camisa e as linhas mudam de cor para continuar visíveis; cada tamanho ajusta o desenho às suas medidas.
- Prévia com a camisa do tamanho, as medidas LARGURA e ALTURA, a área tracejada e a arte.
- Mockups com modelo: espaço reservado na tela; prompts para gerar as fotos em
  docs/prompts-mockups-estampas.md.

## 1.12.1 — Vídeos de até 200 MB — 14/10/2026

- Editor de vídeos aceita arquivos de até 200 MB (antes, 100 MB). Imagens, logos, patterns e as outras
  ferramentas continuam com 100 MB.
- No servidor, o limite do proxy (Caddy) vem de INDOOR_UPLOAD_MAX no compose.yaml (210 MB): mudar a
  variável recria o proxy no deploy, o que só editar o Caddyfile não fazia.
- Teste de carga com vídeos 2K (2560 × 1440) e o servidor preso a 4 núcleos, como a VM: 187 MB / 100 s
  importado em 16 s; 174 MB / 10 min em 60 s; os dois ao mesmo tempo em 36 s e 73 s. Pico de memória
  ~1 GB no total (de 12 GB); o sistema seguiu respondendo em 0,1 s; quadros da prévia em menos de 1 s.

## 1.12.0 — Molduras de TV — 14/10/2026

- Nova ferramenta Molduras de TV (permissão própria por cargo): moldura personalizada na identidade
  do cliente, com folha de impressão e faca de corte em PDF.
- Medidas tiradas das facas reais: janela = medida da TV; bordas fixas de 5,5 cm (4,5 cm na de 32");
  aba da logo de 58,5 × 5,5 cm, ampliada nas molduras maiores que 105,5 cm; folha com 1,25 cm de
  margem, sangria de 0,5 cm e marcas de corte. Os sete tamanhos em uso já vêm na lista; para outra
  TV, as polegadas sugerem a medida (≈ 2,2 cm por polegada) e a medida real pode ser corrigida.
- 40 layouts vetoriais, 4 por ramo: supermercados, academias, restaurantes, lanchonetes, clínicas,
  salões de beleza, padarias, confeitarias, conveniências e ambientes corporativos. Cada um usa cinco papéis
  de cor; trocar uma cor recolore a moldura inteira.
- Cores do cliente lidas da logo e de referências (prints de posts, fachada, cardápio), com
  distribuição automática; sem identidade visual, cada ramo tem uma paleta própria.
- Logo do cliente na aba, com tamanho ajustável e fundo opcional (placa, círculo ou forma orgânica);
  PDF, AI e SVG continuam vetoriais no arquivo final. Aviso quando a logo fica com pouco contraste.
- Logo Indoor Channel automática: branca sobre fundo escuro e escura sobre fundo claro.
- Editar desenho: clicar numa forma, trocar a cor, trazer para frente, enviar para trás, duplicar,
  apagar, arrastar e mover pontos (avançado); desfazer e voltar ao layout original.
- PDFs em CMYK no tamanho real, com a caixa Cliente/Tamanho/Quantidade/Material; nomes no padrão
  "Folha de Impressão <Cliente> - <N> Polegadas (L x A cm)" e "Faca de Corte ...".
- Patterns: um grafismo repetido no fundo ou dentro de uma forma, com tamanho, espaçamento, giro,
  opacidade e cor (paleta, branco, cores originais, qualquer cor ou "Tom suave", perto da cor de fundo).
  Quatro prontos por ramo (espiga, pão, baguete, grão de café, halter, cruz, cupcake...) e importação
  de SVG, AI e PDF (vetoriais, recortados no contorno, recoloríveis) ou PNG e JPG (imagem).
  Lista "Patterns aplicados" no passo 5 para editar ou remover cada um, ou remover todos.
- Editor de molduras na altura da janela, sem rolar a página (como o editor de vídeos): a prévia
  cresce, a barra de exportação fica sempre visível e só o painel de ajustes rola. Botão
  "Exportar PDFs" numa linha só.
- Molduras salvas por cliente, para a equipe toda reabrir, ajustar ou gerar outro tamanho.
- Prévia "Faca de corte" só com o guia de corte (contorno, janela e identificação): sem logo Indoor
  Channel e sem as etapas de logo, cores, layout e desenho, que ficam na folha de impressão.
- Ícone da ferramenta no formato da moldura Indoor Channel, com a aba da logo.
- Zoom nas prévias da Vetorização M6S e das Molduras: lupa no canto inferior direito ou Alt + roda
  do mouse, de 100% a 800%. Com zoom, a vista se move segurando Espaço e arrastando, arrastando
  com o botão da roda ou com Alt + arrastar.
- Pontos de âncora de "Mover pontos" menores e sempre do mesmo tamanho na tela, em qualquer zoom.

## 1.11.0 — Relatórios do Clockify e edição de vetores M6S — 13/10/2026

### Relatórios

- Nova tela Relatórios (só superadmin), com os dados do Clockify pela API: horas, tarefas,
  alterações e colaboradores do mês; horas por etiqueta, projeto, colaborador e tarefa; tarefas
  com mais alterações; todos os registros com filtro. Botão Atualizar.
- Exporta PDF (resumo com gráficos) e Excel (resumo, cortes, alterações e todos os registros).
- Alteração: tarefa com "alteração" na descrição ou numa etiqueta; conta para a tarefa original.
- Chave em CLOCKIFY_API_KEY (no servidor, em deploy/.env); sem ela, a tela explica o que falta.
- O cronômetro próprio (caixa "Nova atividade" antes das ferramentas, etiquetas, pausa e
  correções) fica guardado e desligado: a equipe registra o tempo no Clockify.
  INDOOR_CRONOMETRO=1 religa.
- Nova dependência: openpyxl 3.1.5, para gerar a planilha.

### Vetorização M6S

- Altura fixa de 12 mm, a medida do microfone M6S; a largura acompanha a proporção da logo,
  sem limite. O campo de largura saiu da tela.
- SVG, AI e PDF com formas vetoriais usam as curvas do próprio arquivo, sem redesenhar; partes
  brancas viram furos. Texto não convertido em curvas, imagem embutida ou só linhas fazem o
  sistema redesenhar a partir da imagem, com o motivo explicado. Dá para escolher a origem.
- Nova seção "Editar vetores": clique numa parte da prévia para Apagar parte ou Preencher furo;
  Suavizar bordas e Engrossar traços (na parte escolhida ou no desenho todo); Mover pontos
  (avançado) com pontos verdes arrastáveis; Desfazer (Ctrl+Z) e Voltar ao automático.
  Toda edição recalcula a largura mantendo 12 mm, e o DXF exporta o que foi editado.
- Aviso de traços com menos de 0,1 mm sugere usar "Engrossar traços".
- Nova dependência: shapely 2.1.2, para as operações de forma.

## 1.10.0 — Tela Home e marca por cargo — 09/10/2026

- Tela Home, aberta ao entrar, pela logo do menu ou pelo novo ícone de casa no topo da barra:
  faixa de boas-vindas ("Bem-vindo, nome") com fotos dos colaboradores que se alternam com
  esmaecimento e leve aproximação, cartões das ferramentas liberadas pelo cargo e tutoriais.
- Tutoriais filtrados no servidor: cada vídeo só aparece, e só abre, para quem tem a ferramenta.
- Conteúdo da Home (só superadmin, ou qualquer um no app local): enviar e remover fotos (até 12)
  e um tutorial MP4 por ferramenta. Acesso pela própria Home ou pela tela Usuários.
- Cargos ganham o campo Marca (Indoor Channel ou EAP). Marca EAP troca a logo do menu, o ícone
  e o nome da aba para "EAP · Assistente de edições". O cargo "Colaborador EAP" já vem criado,
  com Vetorização M6S e Logo EAP. Superadmins continuam com a marca Indoor Channel.
- "Vetorização MS6" passa a se chamar "Vetorização M6S" na interface e nos arquivos sugeridos.
- Inicialização espera todos os scripts da página antes de aplicar acesso e marca.

## 1.9.0 — Desfocar fundo — 09/10/2026

- Novo enquadramento "Desfocar fundo" no editor de vídeos: a própria mídia, ampliada até cobrir
  a tela e desfocada, fica sob o trecho, coberta por uma cor a 50% (padrão: cor predominante).
  Desfoque de 0 a 100% e cor ajustáveis em Ajustes; a faixa "Fundo desfocado" aparece na
  timeline logo abaixo do trecho, acompanha cortes e posição e tem olho só para a prévia.
  Vale para vídeos e imagens da montagem, na prévia e na exportação.
- Exportação mistura a cor do preenchimento em RGB, sem desbotar o fundo; teste automático
  confere a cor das áreas de fundo em vídeos e imagens.

## 1.8.1 — refinamentos de interface — 08/10/2026

- Alinhamento e espaçamentos dos menus, campos, ícones e ações de Imagens, Vídeos,
  Ofertas, Usuários e Tarefas; ajustes responsivos em janelas menores.
- Guias de edição, título e botão + compartilham o centro vertical; adicionar e
  fechar usam vetores. Preservadas as curvas da guia ativa e o limite de cinco guias.
- Ferramentas laterais alinhadas à régua da timeline, com botões de mesmo tamanho
  e recuos iguais aos da biblioteca de mídias.
- Chaves de início/fim em vetores espelhados e centralizados. Ícone Fila menor,
  alinhado ao texto e com espaçamento regular; mantido o desenho de mídias empilhadas.
- Botão + das guias de edição logo após a curva da guia ativa, sem espaço sobrando.
- Tempo atual da timeline maior (18 px), à esquerda e alinhado à coluna de ferramentas,
  como o timecode do Premiere; largura estável durante a reprodução.
- Coluna de ferramentas da timeline com o mesmo recuo dos dois lados; setas de mover
  trecho redesenhadas no tamanho dos demais ícones e opticamente centralizadas.
- Ícones unificados no conjunto Lucide (via Iconify, fonte da skill Better Icons), com
  traço único de 1,75 em `static/icons.js`; caracteres usados como ícone (▶, ×, ↶, ↗, 🔒, ⚠)
  trocados por SVG. Mantidos o ✓ dos resultados de exportação e o X vermelho do áudio mudo.
- Auditoria de espaçamentos: mesma borda esquerda para formatos, título, biblioteca e
  timeline; espaçamentos de 4/8 px na prévia, na barra de exportação e nas guias da biblioteca;
  botões de texto do painel alinhados à coluna; rotação e espelhos nas mesmas duas colunas
  de posição e escala; controles das faixas em 28 × 28 px.
- Editor de imagens: frase de apoio logo abaixo do título e guias de edição encaixadas no
  cartão Formato da tela; título do cartão, formatos e miniaturas em espaçamentos de 8 px;
  ＋ de Nova seção, Importar, Adicionar e telas vazias trocado pelo ícone Lucide.
- Mantidos os cortes, cancelamento de importação, login e fila de exportação em
  segundo plano da main, sem alterações nas edições ou mídias dos usuários.

## 1.8.0 — versão oficial — 06/10/2026

### Guias e transformação de 08/10/2026

- Até cinco guias de edição por seção, com +, fechar, renomear e aviso do limite.
  Fechar mantém o trabalho salvo; guias, timeline aberta e ajustes são recuperáveis.
- Corrente clicável liga/libera largura e altura, incluindo alças de esticamento,
  prévia, exportação e persistência. Home e Ajustar à tela restauram a proporção.
- Medidas superiores retiradas da vista de vídeo; Personalizado abre Tamanho da tela.
- Espelhamentos padronizados nos editores de imagem e vídeo, com dicas por hover.
  Em vídeo ficam à direita da rotação, num campo compacto com ° junto ao número.
- Rotação preserva o sentido anti-horário com valores negativos; voltas completas
  são reduzidas ao ângulo equivalente.

### Refinamentos visuais da fila de 07/10/2026

- Adicionar à fila e Fila recebem rótulos separados e ícones de mídias empilhadas.
  Contagem oculta quando vazia; quantidade em elipse verde quando houver itens.
- Tempo atual mantém edição sem caixa e usa o verde da barra de reprodução.
- Ícone de áudio mais próximo do texto; setas da timeline ampliadas e preenchidas em SVG,
  com as mesmas dimensões dos demais ícones; seta de Exportar maior e próxima do nome.

### Controles de tempo e medidas de 07/10/2026

- Relógio ao lado do olho/mudo abre velocidade e duração do trecho, com porcentagem
  de duração: abaixo de 100% acelera, acima desacelera. Porcentagem e segundos ligados.
- Duplo clique no bloco da timeline abre Ajustar trecho, preservando a barra verde
  e suas duas alças para início/fim. Aplicar confirma; Cancelar e Esc preservam o corte.
- Painel direito concentra transformação: posição cartesiana X/Y em pixels,
  rotação em graus e largura/altura proporcionais em pixels, além do modelo de timelines.
- Tempo sai do painel direito; tamanho máximo continua editável na revisão da exportação.
  Nas selecionadas deixa de aparecer em edições de vídeo. T abre duração; P abre exportação.
- Mantidos desfazer/refazer, bloqueios e velocidades entre 0,25× e 4×; imagens e áudio
  continuam com duração editável. Exportação real conferida com o novo tempo e geometria.

### Reutilização de timelines de 07/10/2026

- Em todas utiliza a timeline aberta como modelo completo: saída, rotação, escala,
  posição, cortes, duração e camadas. Cada destino mantém seu arquivo principal.
- Com uma única timeline, cria uma por arquivo do mesmo tipo, até dez por edição.
  Lista os arquivos excedentes e orienta a continuar em outra edição.
- Cortes são adaptados à duração disponível, com aviso por arquivo quando a montagem
  é encurtada ou alongada; logos e áudio acompanham o tempo adaptado.
- Mantém nomes, números e identificadores da fila, atualizando os modelos das timelines
  afetadas. Timelines bloqueadas são preservadas. Ctrl+Z desfaz a operação inteira.

### Correção de exportação de 07/10/2026

- Exportação individual e em fila detecta a opção de leitura de filtros disponível no
  FFmpeg instalado: compatível com o FFmpeg 5.1 do servidor e com motores recentes
  do portátil, preservando os filtros em arquivos para montagens com muitos trechos.
- Seleção de pasta pelo navegador sugere Downloads, explica pastas protegidas e oferece
  Baixar em Downloads mesmo quando o seletor de pastas está disponível. Cancelar a
  seleção não inicia downloads; pastas permitidas mantêm a gravação direta.

### Empacotamento Windows de 07/10/2026

- Portátil atualizado com FFmpeg/FFprobe e inclusão do código/templates de Ofertas.
- Teste de regressão do ZIP interno e validação automatizada do executável para imagens, vídeo, DXF, EAP e limpeza temporária.

### Melhorias de 07/10/2026

- Seção redundante Logo na montagem removida do editor de vídeos: imagens e logos
  usam a importação da biblioteca e faixas superiores. Transparência preservada
  para imagens comuns na prévia e no MP4, com propriedade Escala.
- Ícones centralizados, distância menor até seus nomes e estado Áudio mantido em negrito na fila.
- Biblioteca Mídias/Edição e divisão entre prévia e timeline redimensionáveis, com limites,
  ajuste por teclado, restauração por duplo clique e preferência preservada neste navegador.
- Importação de músicas e áudio, ícones de tipo na biblioteca e faixas roxas abaixo dos vídeos.
- Ondas sonoras reais acompanham os cortes; faixas recebem Vídeo 01… e Áudio 01….
- Cadeado e mudo por faixa de áudio, respeitados na prévia, nas timelines salvas e na exportação.
- Cortes, velocidade, copiar/colar entre timelines, fila e limite de tamanho também aceitam áudio.
- Identificadores compatíveis com a importação em conexões HTTP da rede local.
- Caixa de transformação para imagens, vídeos e logos, com alças de escala e rotação livre,
  botão para ocultar os controles e arraste restrito ao objeto selecionado.
- Home restaura posição, rotação e escala sem alterar o corte; propriedades da logo usam Escala.
- Validação: 112 testes Python, cinco JavaScript e testes de navegador com exportação real.
- Integração com o módulo Ofertas já enviado à main, preservando suas rotas, templates e interface.
  Suite integrada: 135 testes Python executados, 116 aprovados e 19 pulados por ausência
  do motor de Ofertas/encartes de referência; 13 testes JavaScript aprovados. Caminho do
  template nos testes de contrato corrigido para Windows e URLs com caracteres escapados.

- Editor de vídeos, composição com imagens, múltiplas timelines, fila de exportação,
  navegação precisa e ajustes de experiência reunidos na versão oficial 1.8.0.
- Integração das alterações de Logo EAP, Vetorização MS6 e suporte ao macOS já
  presentes na branch principal. Entradas ativas substituem os avisos Em breve.
- 101 testes Python e cinco JavaScript aprovados no Windows após a integração.
- Identificadores 1.7.0 a 1.10.0 abaixo registram etapas internas de desenvolvimento
  do editor de vídeos, sem constituir lançamentos oficiais separados.

- Logo EAP ativa: logo em PNG, JPG, WebP, BMP, TIFF, PDF, AI ou SVG sai em PNG 1024 × 1024 com fundo branco, preto e transparente, centralizada com margem ajustável (padrão 10%).
- Avaliação automática da qualidade (ampliação necessária e qualidade estimada do JPEG) com recomendação entre Remover fundo e Vetorizar; a equipe pode trocar.
- Remover fundo: borda suave pela distância de cor, sem halo do fundo; opção de preservar áreas internas da cor do fundo (texto branco em selo).
- Vetorizar: mantém as cores principais (automático ou 1 a 8), corrige emendas escuras de JPEG entre cores e redesenha com curvas limpas; SVG opcional.
- Fundos difíceis: detecção de fundo não liso (estampa, foto), modos Manter arte inteira e Isolar por cor (clique na cor da logo) e contorno uniforme com espessura e cor.
- Correção de emendas de JPEG automática só em JPEG comprimido, para não apagar contornos finos de propósito.
- Vetorização até 4× mais rápida: busca de contornos do potrace em tempo linear, com resultado idêntico, e resolução de trabalho de 1600 px.
- Fundo preto: aviso quando preto ou cinza escuro some, com opção de clarear só esses tons nessa versão; cores da marca não mudam.
- Exportação nunca substitui arquivos existentes. Gravação atômica compartilhada com a Vetorização MS6.
- Logo EAP validada anteriormente no macOS com 63 testes Python e cinco JavaScript.


### Etapas de desenvolvimento do editor de vídeos

#### Etapa interna 1.10.0 — 06/10/2026
- Campos de tempo/tamanho mostram até duas casas decimais, preservando a precisão
  interna dos cortes. Régua, cursor e linha de encaixe respeitam a coluna fixa das faixas.
- Arquivos externos podem ser arrastados para a biblioteca ou área do editor de vídeos.
- Ferramentas na lateral esquerda da timeline, com ícones verdes #81D680 e dicas
  após três segundos. Botão redundante Adicionar mídia retirado da área de montagem.
- Abas Mídias/Edição e até vinte timelines independentes por projeto, com abas acima
  da montagem, prévia preta quando vazias e biblioteca compartilhada.
- Renomeação da timeline por duplo clique; exclusão preserva mídias e fila, com Ctrl+Z.
  Novos nomes consideram a quantidade ativa e evitam nomes automáticos repetidos.
- Ctrl+C/Ctrl+V copia cortes e seus ajustes entre timelines da mesma edição.
- Fila junto de Exportar, com contador de dois dígitos e até cinquenta cópias independentes.
  Alterar ou excluir uma timeline não altera as montagens já adicionadas à fila.
- Exportação sequencial em MP4 com nomes VT 01, VT 02… e prévia individual da fila.
  Progresso identifica o arquivo; cancelamento mantém concluídos e itens pendentes.
- Retirada dos itens concluídos e fila restante persistidas no servidor, inclusive se
  o navegador deixar de receber a resposta. Numeração dos pendentes preservada.

#### Etapa interna 1.9.3 — 06/10/2026
- Tempo atual editável em segundos com vírgula ou ponto; Enter confirma, Esc cancela.
- Régua com números maiores, traços e tempo destacado junto do cursor de reprodução.
- Alt + rolagem amplia/reduz a timeline mantendo o ponto sob o mouse; limites entre
  100% (visão padrão) e 40 px por quadro da montagem a 30 fps. Botão volta a 100%.
- Régua renderizada somente perto da área visível para manter a navegação leve.
- Adicionar logo em Vídeos inclui a mídia na biblioteca e em uma faixa superior,
  inicialmente durante toda a montagem. Posição, cortes e duração são ajustáveis.
- Transparência da logo preservada na prévia e no MP4; editor de imagens preservado.

#### Etapa interna 1.9.2 — 06/10/2026
- Prévia transacional: preserva o último quadro completo durante buscas, sem substituir
  o vídeo pelo pôster; aplica o último destino solicitado ao terminar a busca anterior.
- Marcadores verdes contidos na barra de corte de 26 px, sem sobreposição dos rótulos.
- Texto redundante de áudio removido; botão global com ícone preservado.
- Renomeação no editor e nas edições recentes, com controle de revisão e histórico.
- Sugestão pelo primeiro arquivo; nomes genéricos usam textos visíveis via OCR local
  do Windows, com alternativa pelo arquivo. Nome da edição independente da exportação.
- Janela “Exportando” com arquivo, progresso real das duas passagens e estimativa de tempo.
- Cancelamento interrompe o processo de exportação, remove temporários e preserva
  resultados já concluídos; revisão de destino renovada para nova tentativa.
- Linha do cursor não intercepta o arraste dos trechos; o anzol permanece arrastável.


#### Etapa interna 1.9.1 — 06/10/2026
- Editor de vídeos ocupa a altura da janela, com cabeçalho e formatos compactos, sem rolagem da página.
- Reprodução de uma linha com largura da prévia; timeline aproximada, controles de corte/duração em Ajustes.
- Rolagem interna de Ajustes, biblioteca e timeline preserva a visualização da montagem.
- Faixas e cabeçalhos contidos em seu painel, corrigindo a sobreposição na barra de exportação.
- Explicações por dicas após três segundos de repouso do mouse, inclusive controles dinâmicos;
  explicação de enquadramento acompanha o modo escolhido, mantendo rótulos de caixas de seleção.
- Conferência de cinco tamanhos de janela, dicas e retorno para Imagens, sem erros de JavaScript;
  fluxo completo de composição/exportação e os 54 testes Python + cinco JavaScript aprovados.

#### Etapa interna 1.9.0 — 06/10/2026
- Biblioteca de fontes distintas, preparação por duplo clique e seleções reutilizáveis salvas.
- Vídeos e imagens na mesma montagem; imagem estática e apresentação de slides com durações próprias.
- Timeline em cascata: uma faixa inicialmente, espaço para criar faixas por arraste, até dez faixas;
  sobreposição com a faixa superior cobrindo a inferior na prévia e no MP4.
- Cadeado e olho por faixa à esquerda; olho altera só a prévia. Ferramentas acima da timeline.
- Posição na montagem logo abaixo da prévia, encaixe automático e indicador vertical de snap.
- Janela central Adicionando sua mídia com bolinhas animadas em ambas as seções.
- Exportação em duas passagens reúne fontes, ajustes, logos e áudio, respeitando o limite de tamanho.
- Ctrl+Z/refazer inclui a montagem; recuperação preserva faixas e mídias. Montagens antigas mantêm
  cortes, cadeados, visibilidade e dimensões ao abrir na nova interface.
- 54 testes Python e cinco JavaScript aprovados. Teste de navegador sem erros de JavaScript,
  com importação, arraste, preparação, prévia, exportação, recuperação e regressão do editor de imagens.

#### Etapa interna 1.8.0 — 06/10/2026
- Montagem de múltiplos trechos do mesmo vídeo, com divisão no cursor, remoção, adição e reordenação.
- Faixa contínua com encaixe automático: linhas nas junções e destaque vertical durante o arraste.
- Régua e cursor de reprodução com alça; prévias reproduzem a sequência descartando os intervalos removidos.
- Cadeado protege o trecho selecionado; olho oculta somente a prévia e preserva o resultado exportado.
- Atalhos de vídeo nos botões e guia recolhível, protegidos durante digitação e em diálogos.
- Cortes antigos continuam compatíveis. Desfazer/refazer, salvamento e recuperação incluem a montagem.
- Ajustes em lote preservam os cortes e cadeados próprios de cada vídeo.
- Exportação concatena quadros contínuos e áudio alinhado por trecho, sem lacunas entre cortes;
  lê cada intervalo separadamente para evitar acumular quadros de um vídeo longo fora de ordem.
- 47 testes Python e cinco JavaScript; teste real de todos os quadros em montagem descontínua,
  reordenada e acelerada, com e sem áudio, mantendo limite de tamanho.

#### Etapa interna 1.7.0 — 06/10/2026
- Seção Vídeos abaixo de Imagens, mantendo edições separadas durante a sessão.
- Importação MP4, AVI, MOV, MKV, WebM, M4V, WMV e MPEG; prévia compatível com navegador.
- Timeline com corte por início/fim, reprodução, posição e duração final por velocidade.
- Enquadramento, zoom, posição, rotação, espelhamento, fundo, logo e ajustes em lote para vídeos.
- MP4/H.264 em duas passagens, limite de tamanho conferido após codificar e manutenção opcional do áudio.
- Remover/restaurar áudio próximo de Exportar, ícones de alto-falante e X vermelho; Ctrl+Z preservado.
- Migração do histórico preserva imagens e edições existentes. Originais de vídeos são guardados sem alterações.
- Instalação local do FFmpeg e inclusão no processo de empacotamento portátil.
- 44 testes Python, cinco JavaScript e conferência de interface com importação, corte,
  duração, áudio, desfazer/refazer, alternância de seções, recuperação e exportação MP4.
- Exemplo sintético: 25 s, 1920×1080, 51.759.860 bytes, com áudio → 1280×720,
  25 s, 3.834.726 bytes, sem áudio, com limite de 4.000.000 bytes.

## 1.7.0 — 06/10/2026

- Vetorização MS6 ativa: logo em PNG, JPG, WebP, BMP, TIFF, PDF, AI ou SVG vira contornos fechados para gravação a laser (Cloudray CRS335-5F).
- Separação automática do fundo pela cor das bordas (Otsu), com sensibilidade manual, inversão, redução de ruído de JPG, suavidade das curvas e remoção de detalhes em mm.
- Largura final em mm medida na arte, sem margens; altura proporcional. Prévia de gravação, contornos e original.
- DXF R12 com POLYLINE fechadas em mm, camada GRAVACAO, centralizado na origem e com extensões corretas. Um arquivo existente nunca é substituído.
- Aviso de traços com menos de 0,1 mm e de excesso de contornos.
- Suporte ao macOS: Instalar.command, Iniciar.command, seletor de pastas do Finder e acesso por NOME.local.
- Novas dependências: numpy, potracer e ezdxf. 45 testes Python e cinco JavaScript aprovados no macOS.

## 1.6.2 — 05/10/2026

- PDFs rasterizados com fundo branco opaco.
- Cinza de 16 bits reduzido para 8 bits antes da conversão.
- Remoção do endpoint de listagem de pastas.
- Exportação libera o lock global durante renderização e gravação; revisão revalidada antes de publicar.
- Arquivos novos publicados completos, sem sobrescrever chegadas tardias, com alternativa segura no Windows.
- Host validado contra nomes e endereços locais conhecidos.
- Campo portable e aviso ao fechar sessão com mídias; lançador C/MinGW e build Windows, com detecção do fechamento pelo lockfile.
- 35 testes Python e cinco JavaScript aprovados. Validação manual completa do portátil pendente. Otimização opcional de prévias adiada.

## 1.6.0 — 05/10/2026

- Versão atual sempre visível no rodapé da barra lateral.
- Desfazer ajustes com Ctrl+Z e refazer com Ctrl+Shift+Z ou Ctrl+Y. Arrastes e digitação contínua de um valor contam como uma ação. Aplicar ajustes ao lote também pode ser desfeito em uma ação.
- Numeração dos arquivos no padrão VT 1, VT 2…
- Check verde de conclusão durante três segundos após exportar todos os arquivos com sucesso.

## 1.5

Base web anterior à criação do executável portátil, com formatos de tela, edição individual, logo, ordenação de miniaturas, exportação e histórico.

## 1.6.1 — 05/10/2026

- Seletor nativo de pasta associado à janela em primeiro plano, evitando que fique atrás do navegador.
