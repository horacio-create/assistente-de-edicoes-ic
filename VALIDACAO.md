# Verificação da versão oficial 1.8.0

## Integração para GitHub — 06/10/2026

- Versão única 1.8.0 e documentação alinhadas à versão oficial.
- Alterações de Logo EAP, Vetorização MS6 e suporte ao macOS preservadas
  ao integrar a branch principal no editor de vídeos.
- 101 testes Python e cinco JavaScript aprovados no Windows; sintaxe de todos
  os scripts da interface conferida. Nenhum executável novo foi gerado.
- Conferência no navegador: menu sem Em breve; prévias de Logo EAP e MS6,
  retorno à timeline, múltiplas timelines, cópia/cola, persistência e exportação
  completa da fila aprovados, sem erros JavaScript.
- Botões da lateral da timeline em #81D680 com ícones em #2D3144, conforme
  a revisão final de cores; ambas as cores verificadas no navegador.

As verificações abaixo registram as etapas de desenvolvimento reunidas na versão
1.8.0. A numeração interna dessas etapas não representa versões oficiais publicadas.

## Editor de vídeos completo — 06/10/2026 (etapa interna 1.10.0)

- 73 testes Python e cinco JavaScript aprovados. Novos testes verificam todas as
  timelines, fontes pertencentes à edição, limites, identidade, snapshots e nomes.
- Exportação real de duas montagens independentes: arquivos VT 01/VT 02, cores,
  duração e limite de tamanho conferidos. Fila restante persistida pelo servidor.
- Cancelamento no segundo arquivo preserva o primeiro, descarta o temporário e
  conserva o item VT 02 pendente, inclusive ao recuperar a edição pelo navegador.
- Fluxo de navegador com duas casas decimais e precisão interna preservada; zoom
  não deixa cursor/régua invadir a coluna dos cadeados/olhos; ícones verdes na lateral.
- Arquivo externo arrastado para a biblioteca durante a edição, mantendo os cortes.
- Timelines vazias com prévia preta, Ctrl+C/Ctrl+V de um corte entre timelines,
  renomeação, exclusão, contagem de nomes, Ctrl+Z/refazer e recuperação conferidos.
- Fila independente da edição posterior e da exclusão de uma timeline; contador,
  nomes comuns numerados, navegação das prévias e exportação integral conferidos.
- Fluxo de composição, logo transparente, zoom entre padrão/quadro, régua virtual
  de uma hora, layout em cinco tamanhos e editor de imagens aprovados.
- Prévia sem piscadas, renomeação, progresso e cancelamento do fluxo individual
  preservados. Dados e saídas de testes isolados; apenas versão web atualizada.

## V1.9.3 — 06/10/2026

- 65 testes Python e cinco JavaScript aprovados; dois novos testes verificam propriedade
  da logo e exportação real com transparência, início e fim próprios.
- Teste de navegador em dados isolados: tempo com vírgula/ponto, Enter, Esc, entrada
  inválida, limite à duração, pausa para digitar e tempo destacado junto do cursor.
- Números da régua medidos em 12 px e peso 700. Alt + rolagem preserva o ponto sob
  o mouse; limites de 100% a 40 px/quadro a 30 fps não são ultrapassados.
- Montagem de uma hora navegada no zoom máximo com menos de 30 rótulos e 150 traços
  no DOM. Rolagem sem Alt mantém seu comportamento normal.
- Logo importada consta da biblioteca e de nova faixa superior, inicialmente em toda
  a montagem; transparência, duração alterada e recuperação da edição verificadas.
- Exportação de logo branca transparente sobre fundo vermelho: centro branco somente
  no intervalo escolhido, cantos vermelhos e fundo preservado antes/depois da logo.
- Fluxo completo de composição/exportação e layout em cinco tamanhos de janela
  aprovados, inclusive retorno ao editor de imagens, sem erros JavaScript.
- Apenas versão web atualizada; executável antigo não foi recompilado.

## Atualização 1.8.0 — 06/10/2026

- 47 testes Python e cinco JavaScript aprovados no Windows.
- Exportação real com intervalos descontínuos em ordem diferente do original, com áudio
  e sem áudio, em velocidade normal e 2×, dentro do tamanho máximo.
- Todos os quadros de uma montagem de cores conhecidos foram conferidos: sequência
  correta e nenhum quadro preto inserido entre trechos. Duração e contagem de quadros conferidas.
- Salvamento e recuperação de trechos, cadeados e olho; compatibilidade com cortes antigos.
- Interface no Edge: dividir/remover/adicionar, arrastar com linha de encaixe, ausência de
  espaços entre blocos, arrastar cursor, desfazer/refazer, cadeado e proteção dos cortes,
  olho somente na prévia, atalhos ignorados durante digitação e em diálogos.
- Reprodução da montagem e revisão, incluindo salto do fim do original para um trecho
  anterior; exportação MP4 com limite de MB e recuperação pelas edições recentes.
- Regressão de imagens, áudio, duração, marcadores, alternância de seções e exportação aprovada.
- Conferência visual das interfaces em 1440 e 800 pixels de largura.

Dados e exportações de testes ficam em pastas temporárias separadas. A atualização é
da versão web; o executável antigo não foi recompilado nesta etapa.

14 testes automatizados passaram com Python 3.12, Pillow 12.3.0, PyMuPDF 1.28.2 e Waitress 3.0.2:

- Leitura de JPEG/JPG, PNG, WebP, BMP e TIFF.
- Separação de páginas de PDF.
- Mostrar tudo, preencher tela e fundo colorido; rotação e espelhamento.
- Área segura ausente do arquivo final.
- Exportação JPG e PNG com as dimensões corretas.
- Persistência de ajustes, trabalhos e histórico.
- Nomes VT1/VT2 e rejeição de nomes duplicados.
- Preservação de arquivos desconhecidos e originais.
- Confirmação obrigatória para substituir exportações próprias.
- Bloqueio quando o conteúdo do destino mudou após a revisão.
- Detecção de versões concorrentes do mesmo trabalho.
- Rejeição de confirmação de exportação desatualizada ou já utilizada.
- Registro de formatos não suportados e falhas de importação.
- Validação de limites e bloqueio de requisições de outra origem.

No navegador integrado, foram verificados: importação múltipla de PNG/TIFF, sinalização de PSD, criação de fundo, aplicação de ajustes em todas as mídias, salvar/recuperar trabalho, prévia final, revisão dos nomes e exportação de dois JPGs. Os arquivos de teste foram gravados em uma pasta separada, com os nomes VT1/VT2.

Ainda não verificados neste ambiente: acesso a partir de outro computador da empresa, regras locais de firewall e acesso ao compartilhamento Y: ou UNC real. Nenhuma regra de firewall foi alterada. Faça esse teste de rede com a aplicação aberta no PC que irá hospedá-la.

Os dados de teste ficam separados dos dados da aplicação entregue.


## Atualização V1.1 — 30/09/2026

17 testes automatizados passaram. Foram adicionadas verificações de nomenclatura em campo único com data pontuada, numeração automática, travas de centro/tamanho original e restrição do seletor nativo ao PC local.

Verificado no Windows: o diálogo nativo do Explorer abriu, recebeu uma pasta de testes e retornou o caminho à aplicação. No navegador: centralização horizontal, bloqueio do controle de posição e do zoom, navegação entre mídias, atualização automática dos nomes e exportação de dois JPGs com os novos nomes foram conferidos. Os testes usaram uma base separada e não alteraram trabalhos de produção.

A seleção nativa por um computador remoto não está implementada; o acesso HTTP pela rede mantém entrada direta do caminho compartilhado.


## V1.2 — Assistente de Edições

19 testes automatizados aprovados em 30/09/2026. Incluem importação da logo, persistência, posição no resultado, prévia, exportação PNG, limites de escala/posição, isolamento entre edições e preservação do arquivo original.

Conferência no navegador: nome e ícones, área de importação ampliada, barra recolhível, inclusão de logo original, controles de posição, restauração do canto, aplicação ao lote e adição de terceira imagem pelo cartão da faixa. Nenhum erro de JavaScript registrado nessa sequência. Arrastar arquivos foi implementado nas duas áreas, mas a simulação do arraste de arquivo do Explorer não fez parte desta conferência.


## V1.4 — 30/09/2026

21 testes automatizados aprovados. Novos casos verificam exclusão seletiva e total do histórico com restauração e preservação das mídias, além de rejeição de logo inválida. A importação de logo, persistência e exportação continuam cobertas.

Conferências no navegador: zoom digitado 125%; largura 1920 atualizando altura para 1080; proporção personalizada destravada; seleção Shift, retângulo, Ctrl+A e Escape; arraste da prévia encaixando x/y em zero; exclusão de um registro e desfazer; importação da logo IC de 192.550.503 pixels; layout com imagem aberta em larguras de 800 e 520 pixels. Nenhum erro de JavaScript registrado na sequência final. A prévia ao vivo usa Canvas; o processamento final permanece em Pillow e foi verificado pelos testes existentes de exportação.

O teste da logo original confirmou cópia RGBA de 1886 × 2048 pixels e hash original inalterado. A versão em localhost:8080 informou 1.4.0 após reinício.


## V1.5 — 01/10/2026

23 testes automatizados aprovados. Os novos casos verificam persistência da ordem, sequência e numeração no plano e na exportação, subconjuntos selecionados, acréscimo de mídias e rejeição de listas incompletas ou duplicadas. No navegador: arraste da segunda miniatura para a primeira posição, salvamento e setas de rolagem em faixa estreita.

## V1.6.0 — 05/10/2026

24 testes Python e quatro testes JavaScript aprovados. Os testes de desfazer verificam agrupamento de gestos, restauração em lote, refazer, descarte do ramo após nova alteração, cópias independentes, ações sem alteração e limite de histórico. O teste de nomenclatura cobre VT 1/VT 2 e compatibilidade com templates antigos.

No navegador, verificados Ctrl+Z sobre zoom numérico e modo de preenchimento, versão v1.6.0 no rodapé, nomes VT 1/VT 2 no plano e exportação de dois JPGs em pasta de teste. O check verde apareceu após a exportação e desapareceu depois do intervalo configurado de três segundos. Nenhum erro JavaScript foi registrado. Os dados de teste ficaram isolados da aplicação entregue.


## Versão atual 1.6.2 — 05/10/2026

35 testes Python e cinco JavaScript aprovados no Windows. Regressões novas: PDF sem fundo, PNG/TIFF cinza de 16 bits, endpoint de pastas removido, salvamento concorrente durante exportação, publicação sem arquivo parcial, Host contra DNS rebinding, chegada tardia de arquivo, alternativa Windows sem hard links, revisão alterada durante render, sinalização portátil, fechamento pelo perfil e aviso de perda da sessão. Os seis bugs obrigatórios foram reproduzidos antes de suas correções.

O build do executável único foi realizado no Windows com MinGW e Python embutido. A janela do Edge apareceu, mas o teste de interface foi interrompido porque a automação não conseguiu identificar sua URL com segurança. Não foram confirmados no executável real: importação dos três formatos, exportação, aviso ao fechar e remoção de IndoorChannel-… do TEMP. A versão web preserva histórico persistente; o portátil foi projetado para usar dados e perfil temporários, descartados ao sair, mantendo apenas exportações. A otimização opcional de prévias não foi incluída.


## V1.7.0 — 06/10/2026

44 testes Python e cinco testes JavaScript aprovados. Os testes novos incluem os cinco formatos
MP4/AVI/MOV/MKV/WebM com áudio, conservação dos originais, corte, velocidade, áudio removido
e mantido, limite de tamanho, rotação/fundo/logo, reprodução por requisições de faixa, revisão
concorrente e migração de edições antigas de imagens.

No Edge de teste: seção Vídeos abaixo de Imagens, ícones de áudio, remoção explícita e
Ctrl+Z/refazer, arraste dos marcadores, início/fim numéricos, duração final, reprodução da
prévia principal e da exportação, MP4 exportado, troca entre seções com salvamento,
zoom/desfazer em imagem e recuperação em Edições recentes. Sem erros JavaScript.
Layouts de 1440 e 800 pixels conferidos. Todos os dados de teste ficaram separados.

Exemplo sintético de referência: 25 s, 1920×1080, 51.759.860 bytes, com áudio. Exportação
1280×720, 25 s, 3.834.726 bytes, sem áudio, dentro de 4.000.000 bytes. O resultado foi medido
com FFprobe. A qualidade visual depende do conteúdo e deve ser conferida no arquivo final.

O executável 1.6.2 fornecido anteriormente não é atualizado ao modificar a versão web.
Os scripts de empacotamento incluem agora o FFmpeg, mas um novo portátil 1.7.0 ainda não foi
gerado nem validado. A versão web é a base implementada e testada nesta atualização.


## V1.9.0 — 06/10/2026

54 testes Python e cinco JavaScript aprovados no Windows. Sete testes novos verificam
fontes distintas em faixas sobrepostas, prioridade visual superior, áudio global,
imagem estática de 15 segundos, slides de 5 + 10 segundos, geometria, logos em vídeos
e imagens, propriedade de mídias/logos, lacunas inválidas, revisão concorrente e persistência.
O limite de 100 trechos de imagem com um quadro cada também foi exportado no Windows,
com filtros em arquivo para evitar limites da linha de comando e decodificação controlada.
Todos os 180 quadros de uma composição sintética de seis segundos foram conferidos,
incluindo as bordas das sobreposições e mudanças de mídia, sem quadros pretos imprevistos.
As exportações mantiveram duração, dimensões e limite de bytes; o olho fechado não excluiu
nenhuma faixa do MP4. As regressões de imagens e de vídeos 1.7/1.8 também passaram.

No Edge isolado, tests/test_composition_browser.cjs conferiu janela central com oito
bolinhas, posição abaixo da prévia, cortes e remoção, desfazer/refazer, snap vertical,
arraste para criar faixa, cadeado/olho, biblioteca de fontes diferentes, preparação
por duplo clique, seleção reutilizável salva, imagem na timeline, rotação, áudio,
prévia e reprodução, MP4 completo dentro de 0,5 MB e recuperação em Edições recentes.
A posição do player foi comparada ao tempo esperado no original; o quadro de uma imagem
foi conferido no Canvas. Montagem antiga preservou cortes fora de ordem, cadeados,
olho e formato vertical. Slides de 10 + 5 segundos e layouts de 1440/800 pixels
foram conferidos, além de zoom/desfazer ao voltar para Imagens. Sem erros JavaScript.
Todos os arquivos de teste e exportações ficaram separados dos dados reais.

A versão web foi atualizada para 1.9.0. O executável 1.6.2 não foi reempacotado.


## V1.9.1 — 06/10/2026

54 testes Python e cinco testes JavaScript aprovados. Nenhuma mudança no modelo dos
projetos nem no motor de processamento. O teste completo de composição no Edge isolado
passou novamente com biblioteca, preparo de fontes, criação de faixa por arraste,
encaixe, atalhos, corte, reprodução, áudio, imagem estática, slides, Ctrl+Z/refazer,
exportação MP4, recuperação e edição antiga de formato vertical.

O novo test_compact_browser.cjs conferiu 1902×911, 1366×768, 1280×720, 1024×768 e
800×1000: altura do documento limitada à janela; cabeçalho de 38 px; formatos de 58 px;
reprodução com a largura exata da prévia; distância de até 45 px da prévia à timeline;
base de Ajustes alinhada à área de montagem; área de exportação recebe o clique mesmo
com quatro faixas e rolagem na timeline. A rolagem de Ajustes não move a página.

Dicas foram verificadas antes de completar um segundo (ausentes) e após três segundos
(visíveis), com conteúdo atualizado ao trocar Mostrar tudo por Preencher tela, Escape,
saída do mouse, olho de faixa criado dinamicamente e ausência de tooltip nativo.
Os textos das caixas de seleção foram preservados. Edições recentes libera a rolagem
normal; o editor de imagens mantém seu layout e também recebe dicas. Sem erros JavaScript.
Todos os dados e exportações de teste ficaram separados das edições reais.


## V1.9.2 — 06/10/2026

- Gravação do usuário inspecionada: o pôster inicial reaparecia entre os quadros buscados.
- Teste em Edge com vídeo sintético cujo primeiro quadro é vermelho e demais azuis:
  41 amostras da prévia durante setas para frente/trás sem retorno ao pôster e sem flashes
  pretos; última busca rápida vence; recorte com início diferente de zero respeitado.
- Barra de corte, entradas e marcadores medidos em 26 px; rótulos abaixo da barra sem
  sobreposição. Status de áudio oculto; botão global continua visível.
- Nome automático pela primeira mídia; nome manual no editor e nos cartões recentes;
  edição mantém o nome ao exportar arquivo de nome diferente, com revisão contra conflitos.
- OCR real do Windows testado: “CLINICA SORRISO / ODONTOLOGIA” em mídia com nome
  “Telas Indoor Channel” produziu “Clinica Sorriso”. Falha de OCR não impede importação.
- Janela Exportando observada em exportação MP4 real, incluindo 48,5% das duas passagens.
  Nome do arquivo correto, progresso monotônico e MP4 dentro de 1 MB.
- Cancelamento real no navegador: arquivo cancelado não é publicado, temporários removidos,
  exportação anterior preservada byte a byte e botão Exportar reabilitado após nova revisão.
- Testes de cancelamento antes de iniciar, durante lote e interrupção do FFmpeg em menos
  de três segundos. Originais e arquivos alheios continuam protegidos pelas verificações existentes.
- 63 testes Python e cinco testes JavaScript aprovados. Testes de layout em cinco
  tamanhos de janela e fluxo completo de faixas/biblioteca/imagens/exportação aprovados.
- Apenas versão web atualizada; executável original não foi reempacotado.


## Portátil 1.8.0 — build de 07/10/2026

Executável único Windows x64 com FFmpeg/FFprobe embutidos. Corrigida a inclusão do código e templates de Ofertas no ZIP interno, coberta por test_packaging.py (falhou antes e passou após a correção). Ofertas continua dependente do Node.js/motor externo, conforme comportamento documentado.

Suíte: 136 testes Python, 117 aprovados e 19 pulados por dependências/encartes indisponíveis; cinco testes JavaScript de desfazer e oito de contrato aprovados. No executável real, teste automatizado pelo gancho INDOOR_BROWSER_CMD confirmou PDF/PNG 16 bits/PNG comum, exportação de imagens, vídeo MP4 com áudio, DXF, três PNGs EAP e remoção do diretório temporário. Não verificados nesta build: interação manual da janela, seletor nativo, fechamento via lockfile real e geração de Ofertas.
