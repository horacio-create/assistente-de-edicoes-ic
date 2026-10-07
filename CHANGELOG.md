# Histórico de versões

## 1.8.0 — versão oficial — 06/10/2026

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
