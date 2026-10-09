# Indoor Channel — Assistente de Edições V1.10.0

Aplicação local para Windows e macOS, com Chrome ou Edge. Não envia mídias à internet. Os colegas usam o navegador; apenas o PC que hospeda a aplicação precisa da instalação.

## Primeira execução

1. Extraia a pasta IndoorChannel em uma pasta permanente do PC.
2. Instale Python 3.12 ou superior pelo [site oficial](https://www.python.org/downloads/windows/), incluindo o Python Launcher.
3. Abra **Instalar.bat**. A primeira instalação precisa de internet para baixar as bibliotecas de processamento e servidor.
4. Abra **Iniciar.bat**, mantenha a janela aberta e acesse **http://localhost:8080** no Chrome ou Edge.
5. Colegas na mesma rede acessam **http://NOME-DO-SEU-PC:8080**. O nome aparece na janela de execução. Se necessário, use o endereço IPv4 do PC.

### No macOS

1. Instale Python 3.12 ou superior pelo [site oficial](https://www.python.org/downloads/macos/) ou com `brew install python@3.12`. O Python 3.9 que acompanha o macOS não serve.
2. Dê dois cliques em **Instalar.command**. Se o macOS bloquear por ser de desenvolvedor não identificado, clique com o botão direito › **Abrir** (só na primeira vez).
3. Dê dois cliques em **Iniciar.command**. O navegador abre **http://localhost:8080**; mantenha a janela do Terminal aberta.
4. Colegas na mesma rede acessam **http://NOME-DO-MAC.local:8080** (o endereço aparece no Terminal). Permita conexões de entrada para o Python quando o macOS perguntar.

Em **Exportar**, o Mac anfitrião abre a janela nativa do Finder para escolher a pasta. Pela rede, informe um caminho acessível pelo Mac, como `/Volumes/Clientes IC/...`. Para não suspender durante o uso, ajuste em Ajustes do Sistema › Bateria/Energia. O executável portátil continua sendo apenas para Windows.

Para acesso pela rede, permita o Python no Firewall do Windows **somente na rede privada da empresa**, quando solicitado. Não encaminhe a porta no roteador. O sistema não possui login: qualquer pessoa com acesso à porta na rede pode acessar as mídias, histórico e pastas visíveis ao usuário do Windows que executa a aplicação. O PC precisa permanecer ligado e sem suspensão durante o uso.

## Novidades da versão 1.2

O Assistente de Edições reúne Imagens, Vídeos, Logo EAP e Vetorização M6S na barra lateral. Use o botão no alto da barra para recolhê-la ou expandi-la. A barra começa recolhida em cada abertura. Passe o mouse sobre ela para ver os nomes ou use o botão para fixá-la aberta.

Arraste imagens para toda a área “Traga sua primeira arte”, ou clique nela para escolher. Depois da importação, a faixa de miniaturas continua aceitando arquivos arrastados e inclui o cartão “Adicionar imagens”. As áreas identificam adicionar, ajustar e exportar, sem numeração.

Em **Logo sobre a imagem**, clique em **Adicionar logo…**. Prefira um PNG transparente. A marca começa pequena no canto superior direito: arraste o contorno da logo na prévia ou use seus controles de tamanho e posição. “Voltar ao canto superior direito” restaura a posição e o tamanho iniciais. “Remover logo desta imagem” retira a sobreposição. Para aplicar a mesma logo e os demais ajustes ao lote, use “Nas selecionadas” ou “Em todas”. A logo aparece na prévia final e no JPG/PNG exportado; os arquivos de origem são preservados.

## Fluxo de trabalho

Escolha Horizontal, Vertical ou Personalizado e adicione arquivos. Cada página de PDF vira uma mídia independente. Clique em Ajustar para selecionar o enquadramento, girar, espelhar, ampliar e reposicionar. A área segura é um guia de 5% e não é exportada. Os avisos de ampliação, cortes e margens são informativos.

“Mostrar tudo” usa fundo preto. “Preencher tela” preenche a tela e pode cortar bordas. “Criar fundo” usa a cor predominante, com opção de alterar. Os ajustes podem ser copiados para selecionadas ou todas; isso inclui o formato da tela e a cor escolhida. PDFs são rasterizados até 3840 px no maior lado (até 144 dpi). TIFF e arquivos animados usam o primeiro quadro; a aplicação informa essa condição.

A edição individual ocupa o centro da tela. Use as setas laterais para trocar de mídia, ou clique em uma miniatura na faixa horizontal do lote.

**Ajustes diretos:** digite o zoom e as posições nos campos de porcentagem ou use os controles deslizantes. As barras marcam o centro e encaixam o indicador quando ele se aproxima. Arraste a imagem na prévia para reposicionar; perto do centro, cada eixo encaixa automaticamente e mostra uma guia. A prévia é desenhada no navegador durante o movimento. A exportação continua usando o processamento de alta qualidade no servidor. As guias não aparecem no arquivo salvo.

**Proporção:** Horizontal começa em 1280 × 720 e mantém 16:9; Vertical começa em 720 × 1280 e mantém 9:16. Alterar largura ou altura ajusta a outra medida. O cadeado “Manter proporção”, ao lado das medidas, pode ser destravado no modo Personalizado. O modo Original da mídia mantém a proporção da origem. “Travar tamanho original · 1:1” continua usando um pixel de origem por pixel de saída. A proporção interna da arte sempre é preservada.

Selecione mídias e clique em **Exportar**. No PC anfitrião, abra a aplicação por **http://localhost:8080**: a primeira etapa abre a janela nativa de pastas do Windows. Escolha a pasta e a aplicação abre a prévia final.

Edite o nome em um único campo: `VT - Cliente - Campanha 30.09.2026`. Substitua Cliente, Campanha e a data diretamente nesse texto. A lista de arquivos se atualiza automaticamente; lotes recebem VT1, VT2 etc. Não há campos separados nem botão de conferência. Quando terminar, clique em **Exportar arquivos**. Se houver exportações próprias existentes, a confirmação de substituição continua obrigatória.

O seletor nativo requer que o servidor seja executado na sessão interativa do Windows, como acontece ao abrir Iniciar.bat. Não o execute como serviço sem área de trabalho. O seletor é aberto apenas por solicitações locais para evitar que um colega abra janelas inesperadas no PC anfitrião. A escolha pode ser cancelada sem criar arquivos; a janela expira após três minutos.

**Acesso pela rede:** na conexão HTTP de outro computador, o navegador não oferece o seletor nativo para gravar em uma pasta. Nesse caso, a aplicação pede apenas o caminho de uma pasta existente que o anfitrião consiga acessar; o navegador de pastas virtual foi removido. Use um caminho como `Y:\Clientes IC\...` ou `\\servidor\compartilhamento\...`. Uma unidade mapeada só funciona quando disponível para o usuário do Windows que iniciou a aplicação. O destino continua sendo acessado pelo anfitrião, não pelo PC do colega. HTTPS e seleção nativa no computador remoto não estão implementados nesta versão.

A interface usa a logo original enviada pelo usuário e as cores #20203c, #b4b7f0, #6967c9 e #81d680. A organização visual é inspirada nas Human Interface Guidelines, com fonte de sistema do Windows, maior peso tipográfico, contraste e controles separados por função.

## Proteção e histórico

- As entradas são recebidas como cópias e normalizadas em armazenamento interno. A aplicação não tem uma operação de apagar originais.
- Um arquivo existente desconhecido nunca é sobrescrito. Altere o nome caso haja conflito com um original ou arquivo de outro sistema.
- Exportações anteriores desta aplicação só podem ser substituídas se não foram modificadas e após confirmação explícita.
- JPG: qualidade 95, progressivo, otimizado, sem subamostragem de cor. PNG opcional sem perdas. O processamento respeita orientação EXIF e tenta converter perfis incorporados para sRGB. Arquivos exportados não preservam metadados pessoais.
- Importações, ajustes salvos, início de exportação, cada sucesso e cada falha são registrados em SQLite. Exportações interrompidas podem ficar registradas como iniciadas, sem conclusão; confira a pasta antes de refazer.
- Trabalhos recentes retêm cópias normalizadas e ajustes. Clique em **Salvar trabalho** antes de fechar. Importações e exportações salvam automaticamente. A interface alerta sobre ajustes não salvos.
- Alterações concorrentes no mesmo trabalho são detectadas; reabra em Trabalhos recentes para obter a última versão. Recomenda-se um trabalho por operador.
- Faça backup da pasta **dados** com a aplicação encerrada. Ela contém o histórico e as mídias. Não apague essa pasta se quiser manter trabalhos recentes.

## Limites da V1

Até 100 MB por arquivo, 100 páginas por PDF, 40 milhões de pixels por imagem de entrada e 20 milhões de pixels por saída; lados de 64 a 7680 pixels. PDF protegido por senha deve ser desbloqueado antes de importar. Formatos não suportados são sinalizados. O histórico mostra os 500 eventos mais recentes e trabalhos recentes mostram até 100; os registros mais antigos continuam no banco.

O lote é processado em sequência; a janela deve permanecer aberta até concluir. O processamento continua no servidor se a conexão cair. Em caso de queda, verifique histórico e pasta antes de repetir. A proteção de sobrescrita verifica o conteúdo novamente antes de substituir, mas não substitui o controle de concorrência de outros programas que gravem na mesma pasta.

## Estrutura e expansão

`server.py`: API local e aplicação WSGI servida por Waitress. `storage.py`: persistência SQLite e eventos. `modules/images.py`: importação, transformação e codificação. `static/`: interface sem dependências externas, utilizável sem internet após a instalação. `modules/vector.py`: vetorização M6S e geração de DXF. `modules/eap.py`: tratamento da Logo EAP. O registro `MODULES` reserva vídeo e ofertas de supermercados, que ainda não são funcionalidades ativas.

Variáveis opcionais: `INDOOR_PORT` (padrão 8080), `INDOOR_HOST` (padrão 0.0.0.0), `INDOOR_DATA` (pasta de dados, padrão `dados` ao lado da aplicação).

O servidor inclui bloqueio de requisições de origem externa e não habilita CORS. Não é destinado à internet pública. Não há instalador de serviço, regra automática de firewall ou inicialização automática no Windows nesta entrega.

Para verificar o processamento: `python -m unittest discover -s tests -v` com as dependências instaladas. Os testes usam uma pasta temporária separada.


## Aparência V1.3

Símbolo IC original no favicon e na barra lateral. Imagens usa o verde #81d680 no selo da seção e no detalhe da seleção lilás. As áreas mantêm seus nomes sem numeração. Setas maiores e transições direcionais na troca de imagens; seleções e abertura de janelas têm animações curtas, desativadas quando o sistema pede movimento reduzido. As cores dos futuros módulos serão definidas posteriormente.

## Seleção, histórico e logos — V1.4

Clique numa miniatura para selecionar e editar. Shift + clique seleciona o intervalo desde a última seleção; Ctrl + clique adiciona ou remove uma imagem. Arraste no espaço vazio da faixa de miniaturas para desenhar um retângulo de seleção; Ctrl preserva a seleção anterior. Com a faixa em foco, Ctrl+A seleciona todas e Escape limpa a seleção. As caixas de seleção continuam disponíveis.

O histórico oferece seleção de registros, Apagar selecionados e Apagar tudo, com confirmação. Apenas os registros são ocultados: edições, imagens, originais e exportações são preservados. “Desfazer exclusão” restaura a última exclusão nesta sessão da página.

Logos grandes são preparadas em um processo separado, preservando transparência e o arquivo enviado. A cópia utilizada como sobreposição tem até 2048 pixels no maior lado. O PNG IC original de 13317 × 14459 pixels foi importado com sucesso. Limites para logos: 100 MB por arquivo, até 256 milhões de pixels e 90 segundos de preparação. Arquivos corrompidos recebem uma mensagem amigável.

A barra lateral usa ícones menores, indicação inferior da seção ativa, logo centralizada e botão de recolhimento no rodapé. Em telas estreitas, os ajustes passam para baixo da prévia.


## Ordem de exportação

Arraste uma miniatura para mudar sua posição. Se ela estiver selecionada junto com outras, o grupo inteiro será movido, mantendo sua ordem interna. Os números nas miniaturas indicam a sequência usada na exportação e nos nomes VT1, VT2… A ordem fica guardada ao salvar a edição. Use as setas nas laterais da faixa para percorrer listas maiores.

## Ajustes e conclusão — V1.6.0

A versão atual aparece no rodapé esquerdo, inclusive com a barra recolhida. Ctrl+Z desfaz os ajustes de enquadramento, zoom, posição, rotação, espelhamento, cor, dimensões, travas e logo. Ctrl+Shift+Z ou Ctrl+Y refaz. Um arraste ou a edição contínua de um campo numérico é uma ação; aplicar ajustes em várias imagens também é uma ação.

O desfazer mantém até 100 ações da edição aberta e reinicia ao criar ou recuperar outra edição ou recarregar a página. Ele não apaga arquivos exportados. Campos de nome mantêm o desfazer normal do navegador.

No lote, os nomes usam VT 1, VT 2… Após exportar todos os arquivos com sucesso, um check verde e “Edição finalizada” aparecem durante três segundos. Falhas parciais continuam detalhadas, sem indicação de conclusão completa.


## Logo EAP — V1.8.0

Prepara a logo do cliente em PNG 1024 × 1024 nas versões **fundo branco**, **fundo preto** e **transparente**. Abra **Logo EAP** na barra lateral e arraste a logo (PNG, JPG, WebP, BMP, TIFF, PDF, AI ou SVG).

O sistema avalia a qualidade e recomenda um tratamento, que pode ser trocado no alto da tela:

- **Remover fundo** — para logos boas ou razoáveis. O fundo, detectado pela cor das bordas, vira transparente com borda suave e sem halo. Logos já transparentes mantêm o recorte original.
- **Vetorizar** — recomendado quando a logo precisaria ser ampliada mais de 1,6× ou o JPEG está muito comprimido. A logo é reduzida às cores principais e redesenhada com curvas limpas, sem borrão. Ajuste o número de cores se o automático juntar ou separar tons errados. O SVG pode ser exportado junto.

Em **Fundo**, escolha como separar a logo:

- **Liso** — padrão. Remove o fundo de cor única detectado nas bordas.
- **Manter arte** — para artes quadradas com estampa ou foto que fazem parte da marca. Nada é removido; com **Vetorizar**, o quadrado inteiro é redesenhado nítido em 1024.
- **Isolar cor** — para tirar a logo de um fundo estampado. Clique na cor da logo na imagem original; cada clique adiciona uma cor e o resto vira fundo. Por padrão a cor é mantida na imagem toda; marque **Só a parte ligada ao clique** para pegar apenas aquele pedaço. Use **Contorno** para desenhar uma borda uniforme em volta do que ficou.

Quando o fundo não é liso, o sistema avisa ao abrir a logo. **Corrigir emendas escuras de JPEG** liga sozinho em JPEG comprimido; desligue se a logo tem contornos finos de propósito.

Ajustes: **Sensibilidade** do fundo; **Preservar áreas internas da cor do fundo**, para partes da cor do fundo dentro da logo, como texto branco num selo; **Margem** em cada lado do quadrado (padrão 10%). Quando preto ou cinza escuro somem no fundo preto, aparece um aviso: marque **Clarear partes escuras no fundo preto** para torná-los brancos só nessa versão. Cores da marca não mudam.

Em **Exportar logos**, escolha a pasta, o nome base e as versões. Os arquivos saem como `EAP - Cliente - fundo branco.png`, `… - fundo preto.png`, `… - transparente.png` e, no modo vetor, `EAP - Cliente.svg`. Arquivos existentes nunca são substituídos.

## Vetorização M6S — V1.7.0

Transforma a logo do cliente em um DXF para gravar no microfone M6S com o laser Cloudray CRS335-5F. Abra **Vetorização M6S** na barra lateral e arraste a logo (PNG, JPG, WebP, BMP, TIFF, PDF, AI ou SVG). Logos vetoriais são rasterizadas em alta resolução e retraçadas, o que dá o mesmo resultado para qualquer origem.

1. Digite a **largura final** em mm. Ela vale para a arte, sem as margens vazias da imagem; a altura acompanha.
2. Confira a prévia **Gravação** (o que o laser marca, em escuro sobre alumínio). **Contornos** mostra as linhas do DXF e **Original**, a imagem recebida.
3. Se faltar ou sobrar parte da arte, desmarque **Automática** e ajuste a **Sensibilidade**. Use **Inverter** para gravar o fundo em vez da arte.
4. **Remover detalhes menores que** elimina pontos e textura. **Suavidade das curvas** em 0 mantém cantos retos e em valores maiores arredonda.
5. Clique em **Exportar DXF**, escolha a pasta e o nome. Um arquivo existente nunca é substituído.

O DXF é R12 (AC1009), em milímetros, com polilinhas fechadas na camada GRAVACAO e a arte centralizada na origem (0,0), que é o centro do campo no EzCad. Importe no EzCad ou LightBurn em mm e aplique a hachura de preenchimento lá; contornos internos (furos de letras como O e A) ficam vazados. Avisos aparecem quando há traços com menos de 0,1 mm no tamanho escolhido ou contornos demais, sinal de ruído.

## Validação da versão 1.6.2 — 05/10/2026

35 testes Python e cinco JavaScript aprovados no Windows. Regressões novas: PDF sem fundo, PNG/TIFF cinza de 16 bits, endpoint de pastas removido, salvamento concorrente durante exportação, publicação sem arquivo parcial, Host contra DNS rebinding, chegada tardia de arquivo, alternativa Windows sem hard links, revisão alterada durante render, sinalização portátil, fechamento pelo perfil e aviso de perda da sessão. Os seis bugs obrigatórios foram reproduzidos antes de suas correções.

O build do executável único foi realizado no Windows com MinGW e Python embutido. A janela do Edge apareceu, mas o teste de interface foi interrompido porque a automação não conseguiu identificar sua URL com segurança. Não foram confirmados no executável real: importação dos três formatos, exportação, aviso ao fechar e remoção de IndoorChannel-… do TEMP. A versão web preserva histórico persistente; o portátil foi projetado para usar dados e perfil temporários, descartados ao sair, mantendo apenas exportações. A otimização opcional de prévias não foi incluída.


## Vídeos
Abra Vídeos na barra lateral, logo abaixo de Imagens. Adicione os arquivos, ajuste o
enquadramento e a logo e use a timeline abaixo da prévia para selecionar início e fim.
Duração final acelera ou desacelera o trecho; Velocidade normal retorna a 1×.
O tamanho máximo em MB fica nos ajustes ao lado e vale para cada arquivo exportado.

O áudio é mantido até você clicar em Remover áudio, junto de Exportar. O estado aparece
com texto e alto-falante; Sem áudio usa X vermelho. Restaurar áudio e Ctrl+Z permitem
voltar atrás. Arquivos sem faixa de áudio são identificados.

A saída é MP4. Confira áudio, duração e legibilidade antes de veicular. Os originais
são preservados e o tamanho máximo é conferido após a compressão.

Instalar.bat instala também o motor de vídeo. Na instalação anterior, execute
powershell -NoProfile -ExecutionPolicy Bypass -File Instalar-video.ps1 e reinicie o servidor.
Vídeos importados, prévias e histórico ficam em dados; preserve essa pasta ao transportar
as edições da versão web. O arquivo executável 1.6.2 antigo não recebe esta atualização
automaticamente.

## Montagem de vídeos
A timeline aceita várias partes do mesmo vídeo. Arraste o cursor com a alça para um ponto
e clique em **Dividir aqui (C)**. Selecione um bloco e use **Remover trecho (Delete)**
para descartar uma parte. **Adicionar trecho (A)** acrescenta uma parte de até cinco
segundos a partir da posição no original; ajuste seu início e fim nos campos abaixo.
Arraste os blocos para mudar a ordem ou use as setas ao lado das ferramentas.

Os trechos sempre ficam unidos: o encaixe automático evita espaços entre os cortes.
A linha verde marca a junção e o local de encaixe durante o arraste. A linha com alça
indica a posição de reprodução. **Duração final** vale para a montagem inteira.

O **cadeado (L)** protege o trecho selecionado contra alterações de corte, remoção e
reordenação. O **olho (E)** oculta somente a prévia; o programa informa isso na tela.
A revisão de exportação mostra todos os trechos normalmente. Áudio continua sendo
uma escolha única perto de Exportar, sem controles de áudio por trecho.

Use **Atalhos do teclado** para consultar a lista. **S** seleciona, **R** gira 90°,
**Espaço** reproduz/pausa, **M** remove/restaura áudio, **Ctrl+S** salva e **Ctrl+E**
abre a revisão. Os atalhos não atuam enquanto você digita, em diálogos ou na seção Imagens.
**Ctrl+Z** desfaz; **Ctrl+Shift+Z** ou **Ctrl+Y** refaz, inclusive cortes e cadeados.

Salvar e recuperar a edição preserva os trechos, sua ordem e seus cadeados.
Reutilizar ajustes no lote preserva a montagem própria de cada vídeo.


## Biblioteca e faixas
Em Vídeos, importe vídeos ou imagens. A janela **Adicionando sua mídia** fica no centro
até a preparação terminar. As fontes aparecem em **Suas mídias**, ao lado da prévia.
A primeira mídia é colocada na montagem; as seguintes ficam na biblioteca para você usar.

Dê dois cliques numa fonte para abrir **Preparar mídia**. No vídeo, indique início/fim ou
use Marcar início/Marcar fim enquanto assiste. Na imagem, escolha sua duração.
**Guardar seleção** prepara a mídia para arrastar à timeline. **Adicionar ao final** a
coloca imediatamente. Você pode reutilizar a mesma fonte várias vezes. Salve a edição
para conservar a biblioteca e as seleções preparadas.

A timeline começa com uma faixa. Arraste um trecho ou uma fonte para o espaço vazio
acima dela para criar uma nova faixa. As faixas superiores cobrem as inferiores quando
ocupam o mesmo momento. Os cadeados e olhos ficam à esquerda: o cadeado protege toda
a faixa; o olho oculta somente sua prévia. A revisão e o arquivo final incluem todas.
O áudio é uma escolha global junto de Exportar.

Dividir, remover e adicionar ficam acima da timeline. O encaixe fecha espaços vazios
na montagem; a linha verde indica o snap. O cursor com alça e **Posição na montagem**,
logo abaixo da prévia, percorrem o resultado completo. Selecione um bloco para ajustar
seu enquadramento, logo e duração. As setas nas laterais da prévia percorrem os trechos.

Para um vídeo estático, importe uma imagem: ela começa com **15 segundos**. Para slides,
importe outras imagens, arraste-as para a mesma faixa e defina os tempos de cada uma;
por exemplo, três imagens de cinco segundos. Também é possível alternar imagens e vídeos.
Imagens mantêm o conteúdo parado; alterar a duração de um vídeo muda sua velocidade.
A montagem inteira é exportada como **um MP4** com o limite de MB escolhido.

**Ctrl+Z** desfaz faixas, cortes, tempos, enquadramentos, cadeados e olhos. Salvar e
Edições recentes guardam toda a montagem. Edições salvas nas etapas anteriores continuam compatíveis.
Esta atualização se aplica à versão web; o executável antigo não é atualizado automaticamente.


## Editor compacto
A seção Vídeos ocupa a janela inteira: cabeçalho e formatos ficam compactos, a prévia
fica junto da timeline e o botão de reprodução aparece logo abaixo do vídeo.
Sua barra de posição tem a largura da prévia; em formato vertical estreito, ficam
visíveis o botão e os tempos. O cursor da timeline continua permitindo percorrer a montagem.

Início/fim e duração do trecho agora ficam no painel **Ajustes**, junto de tamanho,
enquadramento e logo. Role esse painel para acessar os controles. A timeline e a
biblioteca têm rolagem própria quando há muitas faixas ou mídias, mantendo a prévia
na tela. As faixas ficam contidas na timeline e não cobrem a área de exportação.

As explicações permanentes saíram da área de trabalho. Pare o mouse sobre um botão,
ícone ou campo por **três segundos** para ver sua dica. As dicas acompanham a opção
escolhida, como Mostrar tudo/Preencher tela. Saem ao mover para outro controle, clicar,
digitar ou pressionar Escape. Rótulos das caixas de seleção continuam visíveis.
As mesmas dicas também estão disponíveis na seção Imagens.


## Nomes, prévia e exportação
- Clique no lápis ao lado do nome da edição para renomeá-la. Também há um lápis em
  cada cartão das edições recentes. O nome vale para a edição e seu histórico;
  mudar o nome de um arquivo na exportação não muda o nome da edição.
- Novas edições recebem uma sugestão baseada na primeira mídia importada. Quando o
  arquivo tem nome genérico, o programa tenta ler localmente os textos da imagem ou
  de alguns quadros do vídeo. Sem texto legível, mantém uma sugestão pelo arquivo.
  Você pode corrigir o nome a qualquer momento. Não há envio de mídia à internet.
- Durante a exportação, a janela central “Exportando” mostra nome, porcentagem e,
  após medir o andamento, tempo restante estimado. Aguarde a conclusão.
- Ao avançar quadro a quadro ou arrastar o cursor, o último quadro permanece visível
  até o novo estar pronto. A imagem inicial não substitui o quadro durante a busca.
- Os marcadores verdes de corte cabem na barra; apenas o botão de áudio fica perto
  de Exportar, sem o texto de status repetido.

Na janela Exportando, clique em **Cancelar** para interromper. Arquivos já concluídos
são mantidos e o arquivo incompleto é descartado. Você pode exportar novamente.

## Navegação precisa e logos
Clique no tempo atual abaixo da prévia e digite os segundos desejados, por exemplo
**14,22**. Aceita vírgula ou ponto. **Enter** confirma e **Esc** cancela; o tempo fica
limitado à duração da montagem. A reprodução pausa enquanto você digita.

Com o mouse sobre a timeline, use **Alt + rolagem para cima** para aproximar e
**Alt + rolagem para baixo** para afastar. O zoom para entre a visão padrão (100%) e
quadro a quadro da montagem. Clique na porcentagem acima da timeline para voltar ao
padrão. Os números da régua e o tempo ao lado do cursor ficam mais destacados.

Em Vídeos, **Adicionar logo** também inclui a marca em **Suas mídias** e cria uma
faixa superior, inicialmente do começo ao fim da montagem. Sua transparência é
preservada. Selecione o bloco para ajustar posição, tamanho e duração; use Dividir
ou Remover trecho normalmente. A biblioteca permite reutilizá-la. Em Imagens, a
logo continua sendo a sobreposição da imagem, com seus controles próprios.

## Várias timelines e fila
Arraste arquivos do computador para **Mídias**, ou para a área do editor de vídeos,
para importá-los durante a edição. Depois arraste as miniaturas para a timeline.
As ferramentas de dividir (tesoura), remover (lixeira) e reordenar ficam na lateral
esquerda da timeline. Pare o mouse por três segundos para ver suas explicações.

Na aba **Edição**, clique no **+** para criar outra timeline. Também há um **+**
ao lado das abas acima da montagem. Ela começa vazia, com a prévia preta, e usa a
mesma biblioteca de mídias. Clique na aba para trocar e dê **dois cliques no nome**
para renomear. A lixeira na aba Edição exclui a timeline; **Ctrl+Z** desfaz. As mídias
e as montagens que já estão na fila são preservadas. Se excluir a última timeline,
uma nova timeline vazia fica disponível. São aceitas até vinte timelines.

Para reutilizar um corte, selecione seu bloco, pressione **Ctrl+C**, abra a outra
timeline e pressione **Ctrl+V**. O corte é colado na posição do cursor, com encaixe,
preservando sua duração e enquadramento. Digitar nos campos mantém os atalhos normais
de copiar/colar texto. As timelines são salvas junto com a edição.

Para preparar várias ofertas: edite uma timeline e clique em **Fila**, junto de
Exportar. O contador começa em **01** e aumenta a cada montagem adicionada. Continue
editando ou crie outra timeline e repita. Cada item é uma cópia independente do momento
em que foi adicionado; mudar a timeline depois não altera essa cópia. Clique no
**contador** para conferir a lista ou retirar itens. A fila aceita até cinquenta vídeos.

Quando houver itens na fila, **Exportar** revisa e exporta a fila inteira em sequência.
Edite o nome comum: por exemplo, `VT - Cliente Supermercado - Ofertas 07 a 09.10`.
Os arquivos recebem `VT 01 - …`, `VT 02 - …` e assim por diante. As setas da prévia
permitem conferir cada montagem. Sem itens na fila, Exportar usa a timeline atual.

O progresso mostra o arquivo atual e a posição no lote. **Cancelar** interrompe o
processamento: arquivos concluídos são mantidos, o incompleto é descartado e os itens
pendentes continuam salvos na fila. A numeração dos pendentes é mantida para a próxima
tentativa. Itens concluídos são retirados da fila pelo servidor. O executável antigo
continua separado desta atualização da versão web.


## Portátil 1.8.0 — build de 07/10/2026

Executável único Windows x64 com FFmpeg/FFprobe embutidos. Corrigida a inclusão do código e templates de Ofertas no ZIP interno, coberta por test_packaging.py (falhou antes e passou após a correção). Ofertas continua dependente do Node.js/motor externo, conforme comportamento documentado.

Suíte: 136 testes Python, 117 aprovados e 19 pulados por dependências/encartes indisponíveis; cinco testes JavaScript de desfazer e oito de contrato aprovados. No executável real, teste automatizado pelo gancho INDOOR_BROWSER_CMD confirmou PDF/PNG 16 bits/PNG comum, exportação de imagens, vídeo MP4 com áudio, DXF, três PNGs EAP e remoção do diretório temporário. Não verificados nesta build: interação manual da janela, seletor nativo, fechamento via lockfile real e geração de Ofertas.
