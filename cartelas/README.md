# Assistente de cartelas

### Tema da interface Indoor Channel

A interface acompanha a linguagem visual do Assistente de Edições: navegação azul escura, ações em verde claro, fundo lavanda, painéis brancos, campos com cantos de 8 px e abas discretas. O tema está em `public/indoor-theme.css`; altera a interface, sem redefinir as cores, fontes ou elementos das artes dos clientes. A adaptação foi conferida nas telas internas de Início, Imagens e Molduras de TV da referência, após acesso disponibilizado pelo usuário. As cinco etapas do Cartelas continuam disponíveis.

Primeira versão local para organizar pedidos, montar e revisar cartelas de 1280 × 720 e preparar materiais para Photoshop.

## Iniciar

A interface foi reorganizada em 16/10/2026. A barra lateral reúne trabalho, clientes, templates, trabalhos salvos, referências e ajuda. Mensagens, prints e áudios ficam dentro de **Pedido**, pelo cartão de entrada, mantendo as cinco etapas do trabalho visíveis.

Na própria prévia, os botões **Layouts** e **Cores** permitem escolher sem sair do trabalho. Layouts abre as coleções no painel lateral direito, mantendo a cartela visível. A aba **Layouts** e o item **Templates** do menu, quando você está no trabalho, abrem o mesmo painel. Clique numa miniatura para **experimentar sem alterar o trabalho**. Na prévia, alterne entre original e proposta e escolha **Aplicar nesta cartela** ou **Aplicar ao VT**. O botão **Aplicar ao meu VT** do carrossel continua aplicando diretamente ao conjunto. Fechar prévia descarta a experiência, e Desfazer recupera uma aplicação. Fechar layouts retorna às propriedades do elemento. Fora do trabalho, Templates continua abrindo a biblioteca completa. Na janela de cores, **Aplicar cores ao VT** confirma a escolha diretamente.

Os layouts prontos são organizados em **carrosséis por categoria**: Saúde e estética, Comércio e alimentação, Educação e institucional e Eventos, academias e portfólio. A lateral mostra até duas opções por faixa; a biblioteca ampla mostra até três. Use as setas para avançar/voltar, acompanhe o contador ou deslize horizontalmente em telas de toque. As setas ficam desativadas no começo/fim da categoria. O filtro permite ver uma área específica. Layouts individuais ficam separados em Aberturas, Serviços e Contatos; coleções pessoais também usam uma faixa horizontal. Adicionar mais modelos não aumenta a altura de uma categoria.

**QR Code é opcional.** Na etapa Materiais, ative **Este trabalho inclui QR Code** somente quando solicitado. Pedidos sem QR não geram pendência. Desativar retira as camadas de QR e sua exigência, preservando o arquivo recebido e os demais materiais; pode ser desfeito. Um QR solicitado explicitamente pelo roteiro começa marcado, mas você pode desativá-lo. Não há geração de QR.

**Pedido** dá espaço ao roteiro, com identidade salva opcional e recolhida. **Materiais** separa logo, fotos e QR, incluindo prévia e remoção de cada arquivo. O campo acima das fotos informa qual cartela receberá uma foto enviada sozinha; lotes seguem a distribuição por ordem. **Estilo** já mostra os carrosséis de layouts ao lado da prévia, com as preferências de aplicação visíveis. Escolher ou aplicar um layout mantém essa etapa; use **Continuar para edição** para avançar. No computador, a biblioteca tem rolagem própria e o botão de continuar permanece acessível. **Edição** usa prévia à esquerda e ferramentas à direita, nas abas **Elemento**, **Camadas** e **Serviços**. Selecionar um elemento abre suas propriedades. Alinhamento e opções de duplicar/reordenar/excluir ficam recolhidos. Pendências da cartela podem ser abertas abaixo da prévia e continuam reunidas na entrega.

A reorganização preserva os projetos, arquivos, textos e modelos existentes. Atualize a página para carregar a interface. Em telas menores, as barras de navegação rolam horizontalmente e as ferramentas ficam abaixo da prévia.

Necessita Node.js 20 ou superior. As bibliotecas já estão instaladas neste computador. Em uma instalação nova, execute `npm ci` nesta pasta.

No Windows, abra `Iniciar.cmd`. Alternativamente, execute `npm start` nesta pasta e abra http://127.0.0.1:3210.

O aplicativo funciona no navegador. Os materiais não são enviados a serviços externos. O servidor escuta somente no computador local.

## Cópias automáticas em disco

Depois do salvamento no navegador, as alterações do trabalho são reunidas durante cerca de 1,5 segundo e enviadas ao servidor local para uma cópia em **Backups/trabalhos**, dentro da pasta do sistema. Trabalhos existentes neste navegador também são copiados ao abrir a nova versão. Aguarde **Cópia em disco atualizada** na lateral antes de fechar a página se precisar dessa última versão no disco.

Cada trabalho mantém até dez versões com texto, fotos, logo, QR, fontes, briefing e roteiro. Ao atingir esse limite, novas cópias removem as mais antigas desse trabalho. Mudanças somente no horário de salvamento não duplicam uma cópia. O salvamento no navegador permanece independente; uma falha do backup mostra pendência e permite tentar novamente por **Salvar backup agora**.

Em **Trabalhos salvos → Cópias automáticas em disco**, escolha uma versão e use **Recuperar como novo trabalho**. A recuperação mantém o trabalho anterior e funciona em outro navegador no mesmo computador/servidor. Os arquivos `.cartelas.json` também podem ser importados manualmente por **Abrir cópia**. A verificação de integridade na recuperação do painel recusa arquivos alterados ou incompletos.

Clientes, layouts e coleções pessoais também têm backup automático em **Backups/bibliotecas**, com até dez versões por biblioteca de navegador. Incluem logos e fontes incorporados nos perfis/templates. Alterar ou remover um item cria uma versão do conjunto, incluindo o conjunto vazio após remoção dos últimos itens. Bibliotecas existentes são copiadas ao abrir a versão atualizada.

Em **Trabalhos salvos → Bibliotecas em disco**, escolha a versão e use **Recuperar itens da biblioteca**. Os itens atuais são preservados: conteúdo idêntico não é duplicado; conflitos recebem outro identificador, mantendo as duas versões. A recuperação das três categorias é feita em uma única operação e não altera o trabalho aberto. Cópias manuais individuais continuam disponíveis. Limite por versão: 100 MB, até 200 clientes, 200 layouts e 100 coleções.

Arquivos originais de áudio e prints não entram no backup; textos reconhecidos e briefing salvo entram, conforme o fluxo de leitura. Não há envio para nuvem nem execução de backup com a página fechada.

## Receber áudios, prints e informações

Abra **Receber pedido**. Cole mensagens ou arraste vários áudios, prints e arquivos TXT. **Ler arquivos** executa transcrição em português e OCR local, sem chave de API. As ferramentas e modelos estão preparados neste computador. Em outra instalação, tenha Python 3.12 e execute **Preparar leitura local.cmd**: a preparação baixa as bibliotecas e os modelos gratuitos. O reconhecimento dos materiais roda sem acesso à internet; nenhum material do cliente é enviado para esses fornecedores.

Confira e corrija o texto de cada fonte. Enquanto a sessão estiver aberta, o print pode ser ampliado e o áudio reproduzido na própria fonte. **Identificar informações** encontra dados por regras e detecta cabeçalhos de cartelas, incluindo alguns cabeçalhos ditados por extenso. Quando encontra roteiros em mais de uma fonte, mostra o conflito e usa a primeira proposta para revisão. Telefones e perfis diferentes geram avisos. Listas ambíguas não são divididas automaticamente.

Correções explícitas seguem a ordem das fontes, ajustável pelas setas de cada mensagem/arquivo. Exemplos reconhecidos: “Troque o telefone para (88) 99111-2222”, “Altere o Instagram para @perfil_novo”, “Retire o serviço Labial”, “Inclua o serviço Bioestimuladores” e “Substitua o serviço Labial por Preenchimento Labial”. Remoções/substituições de serviços exigem o nome completo correspondente ao item; perguntas, alvos incompletos e “retire esse serviço” ficam pendentes de revisão. Não há interpretação geral de conversas por IA.

O painel **De onde vieram as informações** abre a fonte usada em cada campo. Correções aplicadas guardam antes/depois em uma seção expansível; pendências ficam visíveis. Campos alterados pelo designer são marcados como revisados manualmente. Essa revisão acompanha a cópia do trabalho e seu backup. Alterar textos, remover/reordenar fontes exige identificar novamente; alterar campos depois de gerar exige atualizar ou editar o roteiro antes de usá-lo. Um roteiro anterior com correções aplicadas não é oferecido automaticamente como versão final: confira o original na fonte ou gere pelos campos revisados.

Revise nome, área, serviços (um por linha), chamada, telefone e perfil. Confirme se deve reservar logo, fotos e QR fornecido pelo cliente. **Gerar roteiro pelos campos** produz o formato “Cartela 1 - Logo + texto + Foto 1…” usado no editor. O roteiro permanece editável. **Usar no pedido do trabalho** preenche o campo de pedido; a composição atual não é substituída até usar **Organizar cartelas**.

A transcrição é reconhecimento de fala, e o OCR é reconhecimento de texto. A organização do briefing ainda usa regras e campos revisáveis, **não um modelo de linguagem que interpreta qualquer conversa**. Nomes próprios, números e termos técnicos exigem revisão. O modelo de áudio inicial é Whisper base em CPU; gravações com ruído, fala rápida ou termos incomuns podem precisar de correção. A leitura do print também depende de resolução, fonte e contraste. A origem do texto permanece identificada pelo arquivo ou mensagem.

Até 10 arquivos e 40 MB por leitura; prints PNG/JPG/WebP até 8 MB e 32 megapixels; áudios MP3/WAV/OGG/OPUS/M4A/MP4/WEBM/FLAC até 20 MB e 10 minutos. Até 20 fontes por trabalho e 150 mil caracteres no conjunto. TXT: UTF-8, até 200 KB (50 mil caracteres por fonte). A fila é sequencial e pode ser cancelada. Falhas de um arquivo são mostradas individualmente e não descartam o restante.

Transcrições, textos lidos, avisos e revisão dos campos/roteiro são salvos no trabalho e em sua cópia JSON. Os arquivos originais não são incluídos nesses novos registros; continuam no computador do usuário. Cópias temporárias em `.reader-tmp` são removidas ao terminar ou cancelar. Uma interrupção do servidor pode deixar uma pasta temporária: remova apenas essa pasta quando não houver leituras em andamento. As prévias originais na interface são temporárias e desaparecem ao recarregar ou trocar de trabalho.

Leitura baseada em [Faster Whisper](https://github.com/SYSTRAN/faster-whisper) e [RapidOCR](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/usage/), com versões registradas em `reader-requirements.txt`. Modelos ficam em `.reader-models`; bibliotecas ficam em `.local-reader`. A instalação usa modelos públicos; o reconhecimento local bloqueia conexões de rede.

## Fluxo disponível

1. Cole o pedido com cabeçalhos “Cartela 1”, “Cartela 2” etc. ou carregue o exemplo.
2. Clique em Organizar cartelas. Confira as instruções e os textos extraídos.
3. Escolha uma das três famílias visuais e ajuste cores e fontes, ou aplique um layout da sua biblioteca.
4. Arraste ou escolha o logo, as fotografias e o QR Code fornecidos pelo cliente nos respectivos campos. As referências são exemplos de composição, não fontes de fotos ou logos para novos clientes.
5. Selecione elementos na prévia ou na lista de camadas. Edite texto, posição, tamanho, cor e enquadramento. É possível arrastar elementos desbloqueados na prévia.
6. Resolva as pendências e aprove cada cartela.
7. Exporte a imagem conjunta e o pacote para Photoshop.

O reconhecimento de roteiro é baseado em regras, sem IA nesta versão. Não divide automaticamente expressões ambíguas da lista de serviços. O pedido original fica preservado.

## Acabamento dos templates

Coleções baseadas em VTs reais de clientes (pasta `Referências Cartelas`), primeiras de cada categoria:
- **Vitrine**: foto sangrada com corte diagonal, faixa de cor e lista em painel. Varejo e moda.
- **Onda**: ondas em duas cores separando foto e texto. Papelaria, pet e infantil.
- **Oferta**: cartão claro sobre fundo de cor, produto em destaque circular e faixa de promoção. Gastronomia e promoções.
- **Consultório**: retrato em arco com aro de cor e rodapé de contato. Profissionais de saúde e consultorias.
- **Impacto**: fundo escuro, foto em diagonal e faixas inclinadas em neon. Academias, tecnologia e noite.

Nessas coleções a foto ocupa uma área de formato fixo (diagonal, círculo, arco) e é recortada como no Photoshop; ajuste o enquadramento em **Edição**. Formas também ganharam os formatos **Corte diagonal** e **Onda**, editáveis no painel da forma.

Refinamento visual: Lumina ganhou abertura com retrato emoldurado, logo proporcional e nome em destaque. Atelier usa molduras em arco; Essencial tem contorno delicado na fotografia; Pulso, cantos assimétricos; Noturno, passe-partout. Os contatos têm um traço de encerramento alinhado. Medalhões dos serviços usam contorno e fundo próprios, em camadas editáveis. Textos em duas linhas se alinham ao centro dos ícones. Títulos com quebra automática equilibram as linhas; quebras inseridas manualmente são preservadas.

Para usar as composições atualizadas em um trabalho existente, atualize a página e reaplique a coleção em **Estilo**, com **Ajustar tamanho dos textos ao aplicar** marcado. A edição atual não é substituída ao atualizar a página; **Desfazer** recupera a composição anterior após aplicar. Exemplo completo para abrir por **Abrir cópia**: `Exemplos/Refinamento-visual/Victoria-refinada.cartelas.json`, acompanhado da montagem PNG.

Todas as oito coleções agora organizam serviços em itens com ícones, separadores e acabamento próprio: medalhões na Lumina, Essencial e Horizonte; traços mais discretos nas demais. Listas largas com cinco ou mais itens usam duas colunas, com leitura de cima para baixo e depois na coluna seguinte. Na aba **Serviços**, **Distribuir em cartelas** divide listas maiores em grupos de até quatro itens, preservando ordem, ícones e materiais. A operação pode ser desfeita.

Ao aplicar uma coleção, fotos horizontais recebem molduras proporcionais dentro da área reservada; retratos mantêm os formatos verticais. Trabalhos que não pedem logo e não têm logo importado ficam sem o espaço de envio na arte. Textos longos recebem ajuste de tamanho; se ainda não couberem, a conferência indica a pendência. Trabalhos já salvos mantêm sua composição até você reaplicar uma coleção.

As oito coleções prontas incluem luz suave nos fundos; Atelier e Lumina também usam textura discreta de papel. Molduras recebem luz ou reflexo acetinado e sombra suave. Os efeitos acompanham a cor do cliente ao adaptar a identidade.

Na etapa **Edição**, selecione uma forma na lista de camadas e use **Acabamento** e **Profundidade**. Cor sólida e Sem sombra removem os efeitos. As alterações podem ser desfeitas e ficam preservadas no trabalho, nos layouts e nas coleções pessoais. Não são aplicadas às fotos, textos ou ao QR. Para atualizar um trabalho já montado, aplique a coleção novamente; isso recompõe seu layout.

O pacote Photoshop preserva o acabamento nos pixels de cada forma separada; degradês e sombras ainda não são estilos nativos do Photoshop. Textos continuam nativos. Um exemplo para revisão está em `Exemplos/Acabamentos`; não é uma aprovação ou entrega final ao cliente.

## Photoshop

Abra o Photoshop e deixe-o disponível. Revise todas as cartelas e clique em **Gerar PSD com grupos**. O aplicativo entrega um ZIP com **um arquivo cartelas.psd**, de 1280 × 720, e prévias individuais. Cada cartela é um grupo de camadas; a primeira fica visível ao abrir. Alterne a visibilidade dos grupos para trabalhar em cada cena. A quantidade de grupos acompanha o trabalho, sem limite fixo de três. **Verificar conexão** permite conferir a disponibilidade antes da entrega. A integração local atual usa Windows e o Photoshop já aberto; não inicia outro Photoshop.

Também há **Baixar pacote para montagem manual**: extraia o ZIP inteiro e, no Photoshop, use **Arquivo → Scripts → Procurar**, selecionando `montar-cartelas.jsx`.

O script verifica as fontes e materiais, cria um documento RGB 1280 × 720, com resolução 72, e salva `cartelas.psd` com os grupos em uma nova subpasta de `PSDs`. O pacote manual usa o mesmo formato. Não substitui entregas anteriores. Downloads de entregas antigas continuam disponíveis no formato em que foram criados.

- Textos: camadas nativas editáveis, com as quebras de linha da prévia.
- Fotos: objetos inteligentes incorporados com máscaras de camada editáveis e independentes. Conteúdo pode ser movido sem mover o recorte. Imagens acima de 4096 pixels são reduzidas para esse limite na incorporação; originais completos permanecem no projeto.
- Logos, QR, ícones e formas: camadas rasterizadas separadas. Acabamentos são incorporados aos pixels das formas; não são estilos nativos do Photoshop.
- Imagens originais e parâmetros: preservados no arquivo `projeto.cartelas.json`.
- Camadas ocultas ficam no projeto, mas não são incluídas nos PSDs da entrega.

**Integração validada neste computador, com Photoshop 2026 / 27.3.1.** Foram gerados e reabertos três PSDs, verificadas seis camadas nativas de texto, fontes e dimensões. Uma cópia teve texto editado e foto substituída, com alterações confirmadas após reabrir. O documento do usuário permaneceu aberto e preservado. A comparação com as prévias do navegador apresentou diferenças médias por canal entre 0,22 e 0,64 numa escala de 0 a 255 nos exemplos de teste. Confira a aparência final de cada trabalho; a verificação não cobre todos os estilos e configurações de cor possíveis.

Entregas geradas pelo aplicativo ficam na pasta local `.exports`, em diretórios separados. A geração é sequencial; o aplicativo mostra espera, processamento e conclusão. O ZIP pode ser baixado novamente pelo botão da entrega concluída. A geração de PSD depende do Photoshop. Durante o processamento, ele pode mostrar temporariamente os documentos novos e, ao terminar, retorna ao documento que estava ativo.

## Salvamento

Salvamento automático no IndexedDB deste navegador e endereço. **Trabalhos salvos** permite abrir projetos anteriores; iniciar outro trabalho preserva o atual. A atualização importa automaticamente o salvamento da versão anterior. Use **Salvar cópia** para guardar um arquivo JSON independente com as imagens. A cópia pode ser arrastada para o campo de importação e é aberta como outro trabalho, preservando os já salvos. Limpar os dados do navegador elimina o salvamento local.

## QR Code

O sistema recebe a imagem de QR Code enviada pelo cliente; não gera códigos nem pede uma URL. PNG, JPG e WebP são aceitos no campo próprio. A imagem original é preservada no projeto, inserida em uma camada independente e reutilizada nas exportações. A cartela de destino inicial é identificada no roteiro, mesmo quando outra cartela está selecionada. É possível escolher o destino, mover um QR existente e ajustar a posição. A composição reserva espaço para o código, reduzindo a área da fotografia quando necessário. Posição e tamanho continuam editáveis. Uma leitura local confere a legibilidade na cartela antes da aprovação e da exportação. Nenhum destino é acessado por essa conferência.

## Fotos em lote e organização

O campo de fotos recebe até 20 arquivos por vez, por arrastar/soltar ou seleção. Uma única foto é aplicada à cartela selecionada. Várias fotos preenchem, na ordem recebida, as cartelas vazias que pedem fotografias; fotos já escolhidas são preservadas. Quando não existem cartelas com essa indicação, são usadas as cartelas de apresentação e serviços. Excedentes ficam na biblioteca. Materiais enviados antes do roteiro são distribuídos quando ele é organizado.

Na lista, arraste as fotos ou use as setas para mudar a ordem: essa ação redistribui as fotos nas cartelas previstas. O botão “Distribuir fotos na ordem da lista” permite repetir a distribuição. Para uma aplicação individual, use “Usar na cartela…”. “Remover” retira o material do projeto e das camadas que o usam, sem apagar o arquivo original do computador. “Desfazer” restaura a remoção e suas associações. Uma cartela que ainda pede foto fica pendente até receber outra imagem.

## Clientes e identidade

Na aba **Clientes e identidade**, salve nome, área de atuação, origem da direção visual, cores, fonte disponível, família de layout preferida, logo e orientações. O logo pode ser arrastado para o campo próprio. Os perfis são locais e podem ser exportados e importados em arquivos `.cliente.json`. Importar cria outro perfil para preservar os já salvos.

Use **Novo VT** para iniciar um trabalho com cores, fonte, modelo e logo do cliente. No trabalho atual, selecione o perfil e clique em **Aplicar identidade**. A opção **Recompor os layouts ao aplicar** também reorganiza as cartelas usando a família preferida; sem marcar essa opção, aplica cores, fonte principal e logo sobre a composição existente. Alterações visuais invalidam as aprovações afetadas. Desfazer recupera a versão anterior.

**Salvar esta identidade como cliente** preenche o cadastro com o estilo e o logo do trabalho atual para você revisar e salvar. As orientações são registradas para consulta do designer; não há interpretação por IA nesta versão.

Cada trabalho guarda sua própria cópia da identidade aplicada, incluída na cópia de segurança do projeto. Atualizar um cadastro não altera trabalhos anteriores; use Aplicar identidade quando quiser incorporar a atualização. A migração do salvamento existente é automática. Feche outras abas antigas se o navegador indicar que a atualização está bloqueada.

Até 20 cartelas por trabalho, 15 MB por imagem e aproximadamente 45 MB de imagens originais no conjunto (60 MB em representação base64). Cópias importadas: até 100 MB. A biblioteca aceita PNG, JPG e WebP. Evite trabalhar no mesmo projeto em duas abas simultaneamente.

## Layouts reutilizáveis

### Ferramentas de acabamento

Selecione uma camada e use os seis botões abaixo da prévia para alinhar à esquerda, ao centro horizontal, à direita, ao topo, ao centro vertical ou à base. Escolha margens de 80 px ou bordas da cartela. Elementos bloqueados não são movidos por essas ferramentas. **Encaixar nas guias** aproxima o arraste das margens, centros e posições de outros elementos. As linhas azuis aparecem durante o arraste somente no editor; não entram nas imagens ou no Photoshop.

**Mover o serviço junto** move ícone, medalhão, texto e separador do mesmo item ao arrastar, alinhar ou usar o teclado. Desmarque para ajustar uma camada individual. Alt durante o arraste também permite um ajuste individual. Uma camada bloqueada do item impede o movimento do conjunto. O texto-base oculto permanece preservado. Reorganizar a lista depois refaz os alinhamentos conforme seu modelo.

Clique na prévia para dar foco ao editor. Setas movem o elemento selecionado em 1 px; Shift + setas movem em 10 px. **Duplicar elemento**, no painel de propriedades, cria uma cópia independente com deslocamento de 24 px. Duplicar um texto de serviço duplica o item completo; duplicar apenas seu símbolo cria um ícone avulso. O QR não é duplicado por essa ferramenta.

Dê **duplo clique na foto** para enquadrar, ou selecione-a e use **Enquadrar foto** junto à prévia. A barra acima da imagem oferece zoom de 100% a 400%, **Centralizar** e **Concluir**. A moldura permanece no lugar. O botão **Arrastar foto na moldura** também continua nas propriedades. O arraste e as setas passam a ajustar o conteúdo da imagem, sem mover a moldura nem alterar seus cantos. O movimento respeita os limites disponíveis da imagem. **Redefinir enquadramento** restaura zoom 1 e deslocamentos zero. Use **Concluir enquadramento** para voltar ao movimento de elementos. O QR não tem esse modo de edição.

Alterações de posição e enquadramento reabrem a aprovação e podem ser desfeitas. Os parâmetros ficam salvos no trabalho e são usados nas exportações. Opções de guias, margens e agrupamento são controles da sessão, sem alterar os modelos salvos.

### Ícones e listas

Use **＋ Ícone** para abrir a biblioteca de 27 desenhos de traço fino: rosto, perfil, lábios, nariz, seringa, molécula, brilho, odontologia, coração, telefone, localização, agenda, conversa, Instagram, WhatsApp, livro, alimentação, compras, estrela, conferido, profissional, formação, artes, esportes, música, robótica e entrega. A base visual usa 23 símbolos da biblioteca Tabler Icons (MIT) e quatro desenhos especializados de estética. Os arquivos estão incorporados no aplicativo e não dependem de fontes ou serviços externos durante o uso. Fonte, versão fixada e licença estão em `public/vendor/tabler`. No editor, altere símbolo, cor, posição, tamanho e espessura de 0,6 a 3 unidades do desenho. Ícones avulsos podem ser salvos em layouts pessoais.

**Lista com ícones → Organizar texto em itens** transforma cada linha do texto complementar em um item. Não divide serviços ambíguos nem acrescenta serviços. Sugestões por palavras podem ser trocadas manualmente. Edite os textos, selecione símbolos, mova itens pelas setas, remova ou adicione itens. Itens novos recebem texto provisório e precisam ser editados antes da aprovação. Medalhões, separadores e espessura geral são configuráveis. **Voltar ao texto simples** recupera o conteúdo sem a estrutura; desfazer restaura a lista.

Cada serviço gera camadas de texto, ícone, medalhão e separador. O texto-base fica oculto, preservado para recomposição. Também é possível editar os textos individuais pelo painel de camadas. Reorganizar a lista refaz seus alinhamentos e estilos; ajustes manuais de geometria devem ser feitos depois. Até 12 itens por cartela, dentro do limite total de 100 camadas. Listas densas ou textos longos ficam pendentes de revisão quando não cabem.

A coleção **Lumina** acrescenta três composições inspiradas na referência da Victoria: apresentação com foto inteira/PNG transparente e marca ampla, serviços com ícones em medalhões e fotografia com cantos alternados, e contato com áreas próprias. Curvas nos cantos e molduras usam camadas de formas. Os quatro cantos da fotografia podem ser ajustados separadamente. A imagem original da Victoria permanece apenas referência: não extraímos fotos, logo ou QR da montagem. Abertura com retrato solto exige PNG já transparente; remoção de fundo automática ainda não existe.

Na entrega para Photoshop, cada ícone é uma camada rasterizada separada, assim como medalhões e molduras. Cada texto de serviço permanece nativo e editável. Fotos têm máscaras nativas e objetos inteligentes; fontes personalizadas e acabamentos também estão disponíveis no aplicativo. Edição vetorial dos ícones e estilos nativos das formas permanecem para etapas posteriores.

### Coleções desenhadas para VTs

A biblioteca inclui **oito coleções e 24 composições**: Serena (clínica contemporânea), Atelier (estética editorial), Essencial (saúde e serviços), À mesa (alimentação), Pulso (varejo), Noturno (eventos/portfólio), Horizonte (educação) e Lumina (estética com ícones). Cada coleção traz abertura, serviços e contato. As três famílias iniciais continuam disponíveis para os trabalhos anteriores.

Abra **Meus layouts**, filtre por área e clique numa prévia para ampliá-la. **Ver com meu conteúdo e materiais** simula o conjunto sem alterar o trabalho. Uma função ausente no roteiro continua com exemplo ilustrativo. Os textos de exemplo só aparecem nessas prévias e não substituem o conteúdo do cliente.

No editor, escolha a coleção e use **Aplicar coleção ao VT**. A aplicação conserva os materiais e os textos revisados, escolhe a composição pelo tipo de cartela e reabre as aprovações. Desfazer recupera todo o conjunto. **Adaptar à identidade do trabalho** mantém a paleta e a fonte do trabalho; desmarque para usar a direção visual original da coleção. As coleções têm cores associadas à identidade e cores de leitura calculadas para os painéis sólidos. Uma proteção de contraste usa texto escuro ou claro se a cor principal ficar ilegível. Mudanças manuais posteriores continuam sob controle do designer.

**Ajustar tamanho dos textos ao aplicar** reduz a fonte quando necessário, preservando palavras e quebras recebidas. Os limites são 38 px para os títulos e 24 px para textos complementares. Conteúdo que ainda não couber fica pendente de revisão; não é ocultado, abreviado ou reescrito. A opção se aplica às coleções e aos layouts pessoais. A prévia com seu conteúdo respeita essa opção.

Fotografia, molduras, logo, textos e detalhes são camadas separadas. Elipses e círculos agora podem ser editados no painel de formas e salvos nos modelos. Fotos recebidas após a aplicação da coleção ativam a composição com fotografia, preservando o conteúdo; confira o novo enquadramento. O QR é exclusivamente o arquivo do cliente. A composição de contato reserva uma área própria; uma foto adicional ocupa o espaço superior, sem competir com o código.

As coleções não recortam nem reutilizam fotos e marcas das referências. A qualidade final depende dos materiais recebidos e da revisão do enquadramento. Recortes de fotos são máscaras editáveis sobre objetos inteligentes na entrega ao Photoshop; formas continuam rasterizadas e os textos usam os mesmos tamanhos e quebras da prévia.

No trabalho atual, ajuste uma cartela e use **Salvar como modelo**, informando um nome. A seção **Layouts que você criou**, em **Meus layouts**, mostra prévias da estrutura e permite baixar, importar por arrastar e remover modelos. Cada modelo representa uma cartela; combine diferentes modelos nas cartelas do VT. O arquivo `.layout.json` guarda posições, estilos e espaços de conteúdo, sem briefing, textos, fotos, logo ou QR do cliente. Imagens recebem enquadramento inicial, sem reaproveitar o recorte da foto anterior.

Selecione uma cartela e aplique o modelo. Textos revisados e imagens atuais são associados pelos papéis das camadas. Textos e imagens sem espaço correspondente são mantidos para ajuste manual. Formas decorativas são substituídas. Textos adicionais sem conteúdo correspondente recebem uma indicação para editar, que bloqueia a aprovação até a edição, remoção ou ocultação da camada. O QR atual é preservado e recebe espaço próprio; o modelo não cria nem importa códigos.

**Adaptar à identidade do trabalho** usa as cores principal, de destaque e de fundo e a fonte principal do trabalho onde corresponderem às do modelo. Cores e fontes adicionais permanecem como desenhadas. Desmarque para manter as cores e fontes do modelo. A aplicação reabre a aprovação da cartela e pode ser desfeita. Revise os encaixes, textos, contrastes e enquadramentos antes de aprovar.

A biblioteca fica neste navegador. Atualizar ou remover um modelo não altera cartelas já montadas. Faça cópias dos modelos para transferência e segurança. O banco local está na versão 5 e preserva trabalhos, clientes e modelos existentes.

## Próximas etapas

Consultar `PROJETO.md`. Ainda faltam interpretação ampla e composição por IA, Instagram, extração automática de identidade a partir de referências e PSD sem Photoshop. Trabalhos têm backup automático em disco; fontes estáticas TTF/OTF, acabamentos e máscaras/objetos inteligentes para fotos estão disponíveis. Transcrição e OCR locais funcionam com revisão e formatação por regras. Um QR solicitado permanece pendente até recebermos a imagem fornecida pelo cliente. Geração de QR não faz parte do escopo.

O usuário antecipou a leitura de áudios e prints. A primeira integração é local, sem API; interpretação ampla das conversas e propostas de composição continuam para etapas posteriores, junto às demais melhorias de edição e entrega.

## Verificação

Execute `npm test`. Os testes cobrem reconhecimento, conteúdo, imagens, aprovação, cópias, migração, vários trabalhos, perfis de cliente, identidade, QR fornecido, ausência de geração, ZIP, script, entrega nativa e restrições do servidor. Testes de integração com o Photoshop usam somente documentos novos e materiais de teste.


## Escolher cores da identidade por imagem

Em Direção visual ou no cadastro do cliente, clique em **Escolher cores de uma imagem**. Arraste a prancha/referência em PNG, JPG ou WebP (até 8 MB/32 megapixels), clique numa área opaca e escolha **Usar como principal**, **destaque** ou **fundo**. Também é possível digitar o código, como `#C9A86A`; prefira o código oficial quando escrito na prancha, pois pixels de JPG podem variar. O campo permite escolher cores sem a imagem, por teclado. As últimas 20 amostras e a imagem ficam somente na sessão, sem envio externo.

Ao importar a imagem, **Cores encontradas** sugere até seis cores predominantes e sua proporção aproximada na área opaca. Cores próximas são agrupadas, pixels transparentes são ignorados e nenhuma cor ausente é acrescentada. No trabalho, **Encontrar cores no logo do trabalho** analisa o logo já recebido, sem importar novamente. Clique numa amostra e indique seu uso como principal, destaque ou fundo. As sugestões não alteram a identidade automaticamente; feche e use **Aplicar cores mantendo posições**, ou salve o perfil do cliente. A análise usa pixels locais, sem IA ou reconhecimento de tipografia/identidade. Códigos oficiais continuam sendo a referência mais precisa.

Feche a janela e use **Aplicar cores mantendo posições** para atualizar o trabalho com possibilidade de desfazer. A aplicação preserva enquadramentos, textos e posições e reabre as aprovações alteradas. Revise contrastes, especialmente sobre fotos e formas transparentes. Para guardar no cliente, clique em **Salvar cliente**. A cor de fundo também passa a ser preservada na recomposição; a família Contraste usa sua cor principal como fundo.

## Exemplo com materiais reais

A pasta `Exemplos/Victoria` contém quatro cartelas, montagem para revisão e `Victoria.cartelas.json`, que pode ser arrastado para a importação de cópia do aplicativo. O roteiro foi adaptado da referência enviada; o print é artificial e identificado como teste. O arquivo LEIA-ME explica os dados, escolhas e limites. As cartelas continuam em revisão. O logo recebido é pequeno, a tipografia é provisória e a primeira foto mantém seu fundo original. O pacote ZIP permite montagem manual, mas não contém PSDs prontos: o Photoshop estava indisponível na nova verificação.


## Coleções pessoais de VT

Ajuste o conjunto, informe um nome em **Minhas coleções de VT** no editor e clique em **Salvar VT como coleção**. A coleção guarda até 20 layouts na ordem atual, com formatos de abertura, serviços e contato, estilos de listas, formas, cores e tipografia. Textos, briefing, fotos, logo, QR e nomes das camadas do cliente ficam fora dela. O nome escolhido pelo designer é preservado. As imagens nos modelos são espaços vazios; enquadramentos começam neutros.

Em **Meus layouts**, veja a sequência e as prévias neutras dos seis primeiros layouts, baixe `.colecao.json`, importe por arrastar ou remova uma coleção. A biblioteca é independente dos modelos individuais e dos trabalhos. Remover não altera os VTs já montados. Faça cópias para segurança e transferência.

Organize o briefing do novo cliente e selecione a coleção no editor, ou use **Aplicar ao VT atual** na biblioteca. O sistema associa cada tipo de cartela aos modelos daquele tipo, usando as variações na ordem. Se houver três cartelas de serviços e dois layouts de serviços, a terceira reutiliza o segundo layout. O sistema preserva a quantidade e a ordem do trabalho. Cartelas de um tipo ausente na coleção ficam como estavam e são informadas no aviso.

Textos, fotos e QR do novo cliente são preservados, e conteúdos sem espaço correspondente permanecem para ajuste manual. As opções **Adaptar à identidade do trabalho** e **Ajustar tamanho dos textos ao aplicar** também valem para coleções pessoais. A aplicação é preparada por inteiro antes de modificar o VT e pode ser desfeita em uma ação. Confira enquadramentos, textos adicionais, leitura e QR antes de aprovar. A coleção não divide nem distribui serviços de uma cartela entre várias cartelas.

Experimente `Exemplos/Victoria/Estetica.colecao.json`, uma estrutura de quatro cartelas com ícones, sem os materiais da Victoria.


## Fluxo por etapas

Use a barra **Pedido → Materiais → Estilo → Edição → Revisão e entrega** para ir e voltar livremente. No Pedido, escolha um cliente salvo e use um roteiro pronto ou o recebimento de mensagens/prints/áudios. Depois de organizar o roteiro, adicione os materiais. Em Estilo, os carrosséis já aparecem. Escolha **Prontos**, **Minhas coleções** ou **Layouts individuais**. As estruturas podem ser salvas nas respectivas categorias. Cores e fontes ficam nos ajustes recolhidos; um aviso indica ajustes ainda não aplicados.

Em Edição, camadas e propriedades ficam ao lado da prévia. As miniaturas indicam função e ordem dos serviços. Duplo clique num texto abre seu campo de edição. Selecione um elemento desbloqueado e arraste a alça verde inferior direita para redimensionar. O QR permanece quadrado, com mínimo 160px. Essas alças são auxiliares do editor e não aparecem nos arquivos exportados. Arraste uma foto do computador ou da biblioteca sobre a prévia ou sobre uma miniatura para trocar a foto daquela cartela; lotes continuam na etapa Materiais.

Clique num aviso para ir à cartela e ao material/elemento correspondente. A etapa Revisão e entrega reúne as pendências do conjunto. **Marcar como revisada** registra sua conferência interna e libera a montagem após revisar todas. Envie a imagem ao cliente pelo seu canal habitual. Depois de receber a resposta, **Já recebi a aprovação do cliente** registra essa informação manualmente; o aplicativo não envia a imagem nem consulta conversas para confirmar aprovação. Alterações no trabalho retiram o registro, e desfazer recupera a versão anterior. O registro é separado da verificação que permite exportar para o Photoshop.

Trabalhos existentes continuam compatíveis. Ao reabrir uma cópia com cartelas, o aplicativo entra na Edição. Atualize a página para carregar a interface nova. A imagem original do QR continua preservada e nenhuma geração foi adicionada.


Mensagens, prints e áudios fazem parte da etapa **Pedido**, mantendo a barra das cinco etapas visível e Trabalho atual selecionado. Use **Voltar ao roteiro** para retornar ao formulário, ou aplique o roteiro revisado e depois clique em **Organizar cartelas**. As fontes adicionadas permanecem no trabalho. O atalho lateral Receber pedido abre essa mesma área integrada.


## Simular um cliente com áudio e prints

Extraia `Exemplos/Simulacao-Aurora/Kit-teste-Aurora.zip`. Em um trabalho novo, escolha Tenho mensagens, prints ou áudios e arraste o WAV e os dois PNGs juntos. Use Ler arquivos → Identificar informações → Gerar roteiro pelas informações. Compare com o roteiro e relatório incluídos. O caso combinado foi testado sem corrigir os campos manualmente e gera três cartelas. Logo, fotos e QR continuam pendentes; não há QR gerado.

Os arquivos são artificiais. A transcrição do áudio mostrou erros em prints e QR Code. A comparação só com áudio livre não identificou todos os campos e pediu o nome do cliente; essa limitação não deve ser confundida com a capacidade de transcrever fala. Os prints estruturados permitiram obter os dados corretos neste cenário. O primeiro teste também encontrou observações confundidas com serviços; a extração das listas foi corrigida e recebeu dois testes de regressão.


## Organização de pedidos falados

O organizador agora reconhece alguns padrões explícitos, como aqui é da clínica, gostaríamos de um vídeo de, os serviços são e a frase final é. Mostra o arquivo de onde vieram as sugestões e avisa se elas divergem dos campos escritos, que têm prioridade. A transcrição Aurora, sozinha, passou a gerar três cartelas com quatro campos identificados sem correção manual. Veja `Exemplos/Simulacao-Aurora/RELATORIO-SOMENTE-AUDIO.txt`.

A proposta continua revisável: contatos que não aparecerem ficam vazios, e um código que não tenha sido reconhecido claramente como QR exige sua confirmação. Listas compostas e desconhecidas não são divididas apenas por conter e; alguns nomes simples numa enumeração por vírgulas permitem a divisão da conjunção final. Isso amplia regras locais, sem integração com um modelo de linguagem e sem garantia para qualquer conversa.


## Próximo passo depois de ler os arquivos

A barra no topo do recebimento permanece visível durante a rolagem. Mostra se há mensagem para adicionar, arquivos para ler ou texto disponível para **Identificar informações**. Se já houver um briefing, use **Retomar revisão do briefing**. Um lote ainda não lido deve ser processado ou removido antes de identificar as informações, para não ignorar arquivos.

Cada fonte fica recolhida por padrão: abra **Conferir e editar** para ver o print/player, os avisos e corrigir o texto. Uma fonte sem texto abre para mostrar a falha. A expansão é mantida ao editar durante a sessão. O texto e a origem continuam salvos no trabalho; os players e prints originais seguem disponíveis apenas na sessão atual.


## Fontes personalizadas

Em Estilo → Ajustes de cores, fontes e modelos, arraste um ou vários arquivos TTF/OTF para **Arraste as fontes do cliente aqui**. Cada arquivo pode ter até 5 MB; até 16 arquivos e 20 MB de fontes por trabalho. Fontes variáveis, coleções TTC e fontes web não são aceitas nesta etapa. O aplicativo identifica o nome interno e carrega o arquivo localmente, sem instalar no Windows ou enviar a fornecedores.

Escolha a fonte e use **Aplicar fonte mantendo layout**. A opção Aplicar a todos os textos pode ser desmarcada para alterar apenas títulos. Posições, textos e materiais são preservados; a revisão volta à montagem, e Desfazer recupera o estado anterior. Revise quebras e limites de texto, porque cada fonte tem suas próprias medidas. A fonte também aparece nas propriedades de cada texto.

Regular, Bold e Italic são arquivos distintos: escolha a variante no campo Fonte. Para arquivos importados, o peso e o estilo vêm do próprio arquivo; não há negrito sintético. Os arquivos ficam incorporados nas cópias do trabalho, no perfil do cliente e nos modelos/coleções que os usam, e são carregados novamente ao reabrir. Coleções pessoais guardam os arquivos uma vez no conjunto. Perfis podem receber fontes pelo seu próprio campo de importação, e devem ser salvos após essa mudança.

Para exportar texto nativo no Photoshop, instale a mesma fonte/versão no computador. O aplicativo não instala automaticamente. O script procura o nome PostScript real e interrompe a entrega se uma fonte necessária não estiver disponível, em vez de substituí-la silenciosamente. O pacote manual inclui os arquivos em Fontes/ e o projeto com as fontes incorporadas; o ZIP nativo continua contendo PSDs e prévias.

Validação em 14/10/2026: importação de dois TTF reais, arquivo inválido rejeitado, carregamento, desfazer/refazer, reabertura, perfil, modelo/coleção e tela pequena. Photoshop 27.3.1 gerou três PSDs com AgencyFB-Reg, confirmada em recursos UTF-16 junto de camadas nativas de texto TySh. As dimensões eram 1280×720, e diferenças médias RGB das prévias ficaram entre 0,062 e 0,128 em escala de 0–255. Isso cobre este exemplo; não houve teste nativo com OTF ou fontes variáveis.

A ordem das próximas etapas permanece: acabamento dos templates → máscaras/objetos inteligentes no PSD → backup automático → interpretação de pedidos → IA/referências/Instagram.


## Versão local 0.2 — comparação, revisão e IA opcional

Em **Estilo**, clicar numa miniatura sobrepõe uma proposta à prévia. Os arquivos salvos, o histórico e as aprovações permanecem intactos até aplicar. **Ver original** permite comparar, **Aplicar nesta cartela** preserva as demais cartelas e **Aplicar ao VT** atualiza o conjunto. Trocar a cartela mostra sua composição na proposta. Qualquer edição do trabalho encerra a comparação anterior. Feche ou aplique a prévia antes de exportar.

**Revisão e entrega** agrupa pendências por cartela, com filtros de textos/fontes, fotos/logo, QR e posições. **Resolver próxima pendência** segue o filtro selecionado e abre a correção correspondente. **Ver prévia** troca a cartela mantendo a revisão aberta. Quando as pendências automáticas terminam, o sistema indica quais cartelas ainda precisam da conferência do designer. Contatos e conteúdo continuam exigindo revisão humana.

O atalho **Iniciar.cmd** abre o navegador depois de o servidor ficar pronto. Executá-lo novamente reconhece uma instância deste aplicativo na mesma porta. A rota local `/api/health` identifica a versão e a disponibilidade. Ao colocar a página em segundo plano, o aplicativo tenta concluir o salvamento pendente no navegador; o indicador de cópia em disco continua independente. Aguarde os indicadores de salvamento antes de encerrar o computador.

### Ativar a integração opcional com OpenAI

A leitura local de áudio e prints e a identificação por padrões continuam disponíveis sem API. A integração externa está **desativada por padrão**. Chave e acesso à API ainda precisam ser providenciados pelo responsável; não envie chaves no chat.

1. Copie `.env.example` para `.env` na pasta do aplicativo.
2. Preencha `OPENAI_API_KEY` e altere `CARTELAS_AI_ENABLED` para `1`.
3. `OPENAI_MODEL` permite escolher o modelo disponível na sua conta; o exemplo usa `gpt-5.6-terra`.
4. Reinicie o servidor local. Atualizar apenas o navegador não recarrega a configuração.

O arquivo `.env` é ignorado pelo controle de versão, não é servido ao navegador nem incluído nos backups de trabalhos ou da biblioteca. A chave permanece no servidor. A conta da API pode ter cobrança por uso; habilitar a configuração não envia pedidos automaticamente.

Em **Pedido → Mensagens, prints ou áudios → Interpretação com IA**, leia os arquivos localmente, confira o texto e marque a autorização de envio antes de clicar em **Interpretar textos com IA**. Somente mensagens e textos reconhecidos são enviados; os arquivos originais de áudio e prints não são enviados por essa ação. A proposta apresenta origens verificáveis e preserva campos já revisados manualmente. Contatos sem correspondência nas fontes são removidos, e QR sem pedido verificável não é marcado. Falha, limite, recusa ou resposta incompleta preservam o briefing anterior. O designer gera e confere o roteiro antes de usá-lo.

Em **Clientes → Analisar referências de identidade**, arraste até três prints ou referências. As imagens são reduzidas localmente para análise e enviadas somente após autorização e clique. A resposta sugere cores e uma fonte aproximada disponível no editor; não identifica a fonte exata nem declara identidade oficial. **Usar sugestão no cadastro** preenche o formulário; **Salvar cliente** confirma o perfil. O link do Instagram é apenas uma anotação: o sistema ainda não navega, coleta publicações ou acessa perfis automaticamente. Use prints enviados ou capturados por você.

A implementação usa Responses API com saídas estruturadas e `store:false`, conforme a [documentação oficial de saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs) e [entradas de imagem](https://developers.openai.com/api/docs/guides/images-vision). O modelo do exemplo foi conferido na [documentação oficial do GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra). `store:false` não é uma promessa de retenção zero pelo provedor.

Testes de integração de IA usam um provedor simulado e nenhuma chave real. Eles verificam o fluxo, as validações e a preservação de dados; a qualidade e a latência da API real ainda precisam ser validadas quando houver acesso.


## Ícones na cartela de contato

As oito coleções incluem símbolos de WhatsApp e Instagram nos contatos reconhecidos. Telefone e perfil na mesma linha ganham linhas visuais separadas, preservando o texto original do roteiro. As sugestões de canal precisam ser conferidas: um número de celular não comprova que existe uma conta no WhatsApp.

Em cada contato, **Estilo do símbolo** alterna entre traço fino e preenchido. WhatsApp, Instagram, telefone, localização, conversa e agenda têm desenhos sólidos próprios, com recortes transparentes. **Cor do símbolo** altera apenas o ícone, sem alterar o texto. Com medalhões ativados, escolha a cor do fundo e sua intensidade, de transparente a sólido. **Usar cores do layout** remove as cores personalizadas daquele contato. Escolhas são preservadas na cópia do trabalho, ao reabrir, trocar de coleção ou reorganizar o QR. A aba Elemento também oferece preenchimento para ícones compatíveis avulsos: os seis de contato, coração, destaque, odontologia e compras. Os demais desenhos mantêm o traço fino.

Refinamento posterior: a biblioteca passou a ter **18 variantes sólidas**. Em **Contatos**, os botões visuais **Linha**, **Sólido** e **Medalhão** aplicam uma combinação a todos os contatos, sem alterar seus textos ou canais. O botão selecionado fica destacado. Essa escolha retorna as cores à combinação do layout; personalizações individuais continuam disponíveis abaixo. Medalhões usam contraste automático sobre a cor de destaque e mais espaço para o símbolo. Projetos anteriores recebem os desenhos revisados ao atualizar a página, preservando seus símbolos, cores e posições; os novos presets só são aplicados quando escolhidos.

Para um trabalho já montado, selecione a última cartela e abra **Edição → Contatos → Organizar contatos com ícones**. Você pode editar cada informação, trocar o símbolo por telefone, Instagram, localização ou conversa, escolher **Sem ícone**, ativar **Usar medalhões suaves** ou voltar ao texto simples. Desfazer recupera o estado anterior. Reorganizar refaz os alinhamentos.

Cores acompanham o template. Símbolos manuais são preservados ao trocar de coleção ou reabrir o trabalho. Os modelos pessoais guardam a estrutura sem copiar os contatos do cliente. No PSD único, telefone e perfil são textos nativos editáveis; ícones e medalhões são camadas rasterizadas separadas dentro do grupo da cartela. QR continua opcional e fornecido pelo cliente.

Validação: 124 testes unitários, fluxo completo do editor e teste de contatos com desfazer, troca de símbolos, persistência e tela de 390px. A entrega da Victoria foi reaberta no Photoshop: quatro grupos, 14 textos nativos e dois símbolos de contato em camadas próprias, preservando os documentos anteriores. Evidências em `test-results/contacts`.


A disposição dos painéis é constante em Estilo, Edição e Revisão e entrega: ferramentas à esquerda e cartelas à direita, com a mesma largura de painel. No editor, os campos têm rolagem própria e Voltar/Continuar permanecem visíveis. Em telas intermediárias, as abas se distribuem em duas linhas para manter a leitura. Em telas estreitas, os painéis ficam empilhados.


## Coleção Serena e ajustes rápidos

Serena acrescenta abertura com retrato à esquerda, serviços com foto à direita e encerramento com retrato, contatos e QR opcional em áreas separadas. Textos e materiais são preservados ao aplicar. Para ver a paleta verde acinzentada original, desmarque Adaptar à identidade do trabalho; deixe marcada para usar as cores do cliente.

Em Edição, selecione uma foto: Enquadramento rápido oferece Esquerda, Centro, Direita, Topo e Base. Apenas o recorte se move dentro da moldura; quando não há sobra naquele eixo, a posição fica central. Selecione um logo para escolher Discreto, Equilibrado ou Amplo dentro da área reservada. O tamanho escolhido acompanha o trabalho, a cópia e a troca de coleção; também pode ser salvo em modelo. Desfazer recupera a configuração anterior. Para os contatos, as opções Linha, Sólido e Medalhão continuam disponíveis na aba Contatos.

Validação: 130 testes unitários passaram; 80 cartelas de oito coleções e três cenários foram renderizadas com textos conferidos e QR legível. Victoria usa materiais reais; restaurante e escola são fictícios. Três PSDs foram gerados no Photoshop e inspecionados por leitura dos arquivos: 10 grupos, 37 textos nativos com conteúdo conferido e cinco fotos inteligentes com máscaras. Dez prévias foram comparadas, com diferença média RGB máxima de 1,0391 / 255. Evidências em test-results/refinement-review. A integração real com IA continua pendente de acesso à API.


Em Contatos, Destaque dos contatos oferece Equilibrado, Grande e Máximo. Grande é o novo padrão para organizar contatos e aplicar templates: textos em negrito, telefone com prioridade e ícones maiores. Cada linha ajusta a fonte de forma independente, para um Instagram longo não reduzir também o telefone. Os tamanhos se adaptam ao espaço disponível; nenhuma informação é abreviada. O nível escolhido acompanha a cópia e a troca de coleção. Para atualizar uma cartela existente, use Organizar contatos com ícones.

Na edição, Ctrl+Z desfaz e Ctrl+Shift+Z refaz (Command no Mac). Ao digitar em um campo, os atalhos continuam atuando na digitação. O histórico da arte mantém até 25 alterações na sessão; recarregar a página reinicia esse histórico. Os botões Esquerda, Centro e Direita acima da prévia posicionam o elemento selecionado, com referência nas margens ou bordas da cartela. Ícone e texto vinculados seguem a opção de mover juntos. Para alinhar somente o texto dentro da caixa, use Alinhamento do texto no painel Elemento. Desfazer/refazer mantém a camada selecionada quando ela ainda existe.

Em Estilo, Tipo de negócio identifica palavras do pedido ou permite escolher Restaurantes, Saúde, Comércio, Educação, Eventos e Outros. Ao aplicar uma coleção, títulos automáticos passam a usar Nossos sabores, Procedimentos, Produtos em destaque, Atividades e formação ou Experiências. Títulos personalizados são preservados. Pedidos ambíguos ficam neutros; sem pistas, a coleção pode oferecer seu segmento. Essa escolha acompanha a cópia do projeto e pode ser desfeita. Não é interpretação por IA e não cria ofertas, preços ou contatos.

À mesa agora usa a fotografia em toda a altura da área reservada, com recorte central ajustável. Abertura sem o grande painel no subtítulo; lista em base clara e ícones gastronômicos próprios. Quatro símbolos Tabler (MIT) acrescentados: Pratos e refeições, Carnes e grelhados, Sobremesas e Café. São 31 ícones ao todo. Trabalhos existentes mantêm suas escolhas de símbolos; use Sugerir ícones novamente se desejar recalcular as sugestões. Aplique À mesa para atualizar a composição de um trabalho existente. Evidências: test-results/segment-templates; exemplo e PSD em Exemplos/Restaurante-Mangai-Teste/Templates-por-segmento.

Em Revisão e entrega, Entregas anteriores registra novas imagens de aprovação, PNGs individuais e PSDs, com número de versão, data e Baixar novamente. Imagens ficam em Backups/entregas; PSDs continuam em .exports, referenciados pelo histórico. Preserve as duas pastas ao mover o sistema. A lista permanece após fechar o navegador ou reiniciar o servidor, e usa o identificador do trabalho (abrir uma cópia cria outro trabalho, com histórico próprio). Exportações feitas antes desta atualização não são associadas automaticamente por nome. Pacotes para montagem manual continuam disponíveis pelo botão próprio, fora deste histórico. O PSD é registrado ao iniciar: se fechar a página durante a geração, volte ao trabalho e use Atualizar para consultar e baixar o resultado. Entregas interrompidas ou ausentes são identificadas sem apagar as versões anteriores.

Na leitura de pedidos, abra uma fonte para comparar o print/áudio com o texto editável. Prints ampliam dentro da página; áudios oferecem Ouvir com o tempo de cada trecho. Os destaques distinguem leitura incerta e informações importantes (nomes, contatos, preços, horários, QR). Mostrar só os destacados filtra a lista. Conferi esta fonte com o original registra a conferência; editar o texto retira essa marca. Os trechos iniciais são preservados para comparação, sem sobrescrever as correções feitas no campo. Isso facilita revisão, mas não corrige a transcrição automaticamente.

Os originais lidos a partir desta atualização ficam no armazenamento deste navegador, sem migração do banco existente. Texto, tempos/confiança e conferência acompanham a cópia .cartelas.json; os arquivos originais não são incluídos nessa cópia. Em outro navegador, ou para fontes antigas sem original guardado, use Reanexar original (arrastar ou clicar). A leitura local no servidor continua removendo seus arquivos temporários após processar. Nenhum provedor de IA externo foi ativado.

### Direção visual e organização da edição
Em Estilo e em Edição > Layouts, o painel Pedido visual desta cartela identifica cores comuns ou códigos hexadecimais, foto à esquerda/direita e título grande/menor. Escreva no cabeçalho da cartela ou em uma linha separada: `Visual: fundo amarelo; texto preto; foto à esquerda; título grande`. A linha Visual fica preservada no pedido e fora do texto da arte. Confira e use Aplicar pedido nesta cartela. As escolhas acompanham a cópia e voltam a ser aplicadas ao trocar templates. Instruções conflitantes não recebem escolha automática; fotos em composições com QR pedem ajuste manual para preservar o código. Não há interpretação livre de estilo por IA.

Adaptar conteúdo ao espaço aproveita área livre para títulos extensos antes de reduzir a fonte. As composições mantêm as zonas de fotos e textos separadas. Em listas de mais de seis serviços, a ação divide o conteúdo em cartelas de até quatro itens, preservando a ordem e os ícones; a divisão pode ser desfeita. Textos que continuam sem caber permanecem sinalizados.

Na edição, Shift + clique nas camadas ou na prévia seleciona vários elementos. Alinhar e posicionar oferece distribuição horizontal/vertical com espaços iguais, bloqueio/desbloqueio da seleção e margens visíveis de 80 px. A distribuição precisa de pelo menos três elementos visíveis e desbloqueados, com espaço disponível. Os extremos são preservados. As guias e os contornos da seleção aparecem apenas no editor. Bloquear impede alterações nos campos, movimento, exclusão e reordenação da camada. Desfazer/refazer também cobre essas operações.

### Identidade a partir de prints — leitura local
Em Clientes, abra Identidade a partir de prints (Sem API). Importe até 12 PNG/JPG/WebP de até 8 MB cada, selecione as referências representativas e use Escolher área para recortar menus, bordas ou fotografias. O recorte pode ser feito por arrastar ou pelos campos de porcentagem; não altera o original. Encontrar cores analisa apenas as referências marcadas e as áreas confirmadas. A recorrência conta prints diferentes, agrupando cores próximas, com peso igual por referência; pequenas ocorrências inferiores a 1% da amostra são ignoradas para reduzir artefatos de suavização/compressão. Essa heurística não separa automaticamente fotos, textos e interface do Instagram.

Cada sugestão mostra o código e os nomes dos prints em que aparece. Escolha Principal, Destaque ou Fundo e clique na cor; revise os três campos e use Usar paleta e observações no cadastro. A fonte é mantida. Observações sobre tipografia/composição são preenchidas pelo designer, sem identificação automática. Salvar cliente preserva a paleta, a origem como referências e as observações com nomes/frequência das fontes. Esses dados acompanham a cópia .cliente.json. Os prints, recortes e resultados temporários não são guardados no perfil e são limpos ao carregar/salvar um cadastro ou recarregar a página. A extração local não envia imagens a serviços externos. O painel antigo com IA continua separado e opcional, com seus próprios arquivos e consentimento.

### Correção da leitura de identidade em prints com fotografias
A opção Priorizar elementos gráficos da identidade fica marcada por padrão. graphic-colors.js examina uniformidade local, componentes com bordas retas e grupos de formas alinhadas como letras. Áreas grandes não recebem peso proporcional a todos os seus pixels; fragmentos de textura e tons intermediários sem evidência forte perdem influência. A ordem das sugestões gráficas favorece bases claras/escuras e acentos definidos; outras cores continuam disponíveis para revisão, inclusive paletas suaves. Isso não é segmentação semântica de fotografias e não garante identificar a marca: superfícies e objetos fotográficos também podem produzir candidatos.

Ver áreas usadas mostra as regiões que sustentam cada cor no print original. Descartar cor retira a sugestão das observações da proposta e, se ela já estava escolhida em um campo da paleta, restaura esse campo para a cor do cadastro. Trocar o modo, o recorte ou a seleção invalida a análise anterior. Desmarcar a prioridade gráfica recupera a extração geral. Os limites da fonte e o processamento local permanecem iguais. Códigos são aproximados, não uma paleta oficial.
Ao usar a paleta no cadastro, as observações registram somente as cores escolhidas e sua evidência; outras sugestões não passam a fazer parte da identidade aprovada.


## Elementos e comparação de fontes nos prints

Em Clientes → Identidade a partir de prints, a análise sugere faixas, caixas, bases, linhas e grupos de letras. Ver elementos nos prints mostra as regiões usadas. Marque somente os padrões conferidos e guarde nas orientações; Salvar cliente persiste a escolha. Posições só são analisadas quando você confirma que cada imagem representa uma arte individual, evitando interpretar posições de um mosaico como composição de uma publicação. São heurísticas locais, sujeitas a confundir fotografias com formas. Não reconhece semanticamente logos ou ícones e não redesenha templates.

Comparar fontes visualmente permite escolher uma área candidata ou um recorte manual, digitar o mesmo texto e comparar quatro fontes por página, incluindo fontes importadas no cadastro. O peso altera apenas a amostra. Usar esta fonte no cadastro registra a escolha como aproximação visual; não há reconhecimento automático do nome da fonte nem classificação de similaridade. Confirme ou importe a fonte oficial quando disponível.


## Aplicar a identidade e analisar o feed por publicações

Em Clientes, o quadro Elementos aprovados da identidade passa a guardar padrões estruturados no perfil e no arquivo .cliente.json. Faixas, linhas e caixas viram camadas editáveis; bases de cor e tipografia seguem a paleta e fonte escolhidas. Perfis antigos continuam válidos: as observações antigas são preservadas, mas não são interpretadas como aprovação automática de formas.

No trabalho, abra Usar a identidade de um cliente salvo, selecione o perfil e clique em Ver prévia da identidade. Compare Antes e Proposta nas cartelas e escolha se deseja aplicar os padrões. Cancelar preserva o trabalho. A aplicação participa de Desfazer/Refazer e exige nova conferência; sem espaço livre, a forma é omitida. O conteúdo e os materiais permanecem; pedidos visuais explícitos do roteiro têm prioridade. Com identidade habilitada, os padrões também acompanham coleções e modelos aplicados com Adaptar à identidade. A fonte aprovada passa aos textos gerados.

Para analisar o feed, envie até 12 prints por importação. Em cada mosaico, use Separar posts do feed: ajuste linhas, colunas e área em porcentagem, atualize a grade e confira as miniaturas. Cada célula deve conter uma publicação completa. Exclua fotos sem identidade, campanhas e publicações duplicadas entre screenshots; a ferramenta não detecta duplicatas ou limites dos posts automaticamente. Os posts selecionados substituem aquele mosaico na análise. Há limite total de 36 referências. Frequências passam a ser contadas por post quando todas as referências forem publicações separadas.

Guarde os padrões conferidos, escolha a paleta e salve o perfil. Prints e recortes permanecem temporários. Esta etapa analisa imagens locais, sem acesso automático ao Instagram nem reconhecimento exato da fonte. A leitura é geométrica; sempre confira a evidência de fotos, logos de terceiros e campanhas.


## Importação do Instagram (primeira integração)

Em Clientes → Identidade pelo feed ou por prints → Carregar publicações do Instagram, escolha Conta profissional conectada ou Perfil profissional de um cliente. Informe @ ou URL direta para um cliente, confirme a consulta e carregue até 12 publicações. Nenhuma imagem vem selecionada: marque as referências e use Usar publicações selecionadas na análise. Depois execute Analisar referências selecionadas para encontrar cores e padrões. As imagens entram no mesmo importador local, com os limites de 8 MB por imagem, 32 megapixels e até 36 referências. Reimportações de posts já presentes são ignoradas; publicações com mídias restritas ou sem capa ficam indisponíveis, sem inventar imagens.

O caminho implementado é Instagram API com Facebook Login: leitura da conta profissional configurada ou Business Discovery para perfis profissionais acessíveis pela conta autorizada. Não é acesso irrestrito a qualquer perfil público. Carrosséis usam apenas a capa e vídeos somente a miniatura disponível. Não há reprodução de vídeo, paginação, login OAuth dentro do aplicativo nem identificação automática de fontes nesta etapa.

Para ativar neste computador, copie .env.example para .env se ainda não existir; se já existir, acrescente apenas as quatro opções do Instagram sem substituir as opções de IA. Defina CARTELAS_INSTAGRAM_ENABLED=1, META_IG_ACCESS_TOKEN com acesso de leitura, META_IG_USER_ID com o ID da conta profissional autorizada (não o @ ou ID da Página) e META_GRAPH_API_VERSION com a versão habilitada no aplicativo Meta, no formato vNN.N. Reinicie o servidor. Não envie tokens em conversas ou arquivos de projeto. Configuração preenchida não significa acesso validado: é preciso consultar uma conta real para conferir permissões e versão. O aplicativo deve ter as permissões e o nível de acesso exigidos pela Meta para a conta e para Business Discovery; solicite somente as permissões de leitura necessárias, sem publicação ou mensagens.

Referência: [documentação oficial da Meta no Postman](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3fe78620-2258-44b6-893f-42d76c7200d7).

Tokens ficam somente no servidor e não são enviados ao navegador nem à cópia do trabalho. A consulta de posts exige confirmação na interface e origem local. Mídias passam por URLs temporárias locais, limitadas às imagens retornadas pela API em CDNs permitidas, sem redirecionamentos. Sessões duram dez minutos; cache limitado a 24 MB, sem armazenamento dessas mídias no servidor em disco. Depois de selecionadas, referências seguem o comportamento temporário dos prints: salve a paleta e os padrões no cliente para preservá-los.

Teste offline: node scripts/instagram-review-server.mjs abre a origem isolada 3238 com três imagens recortadas do print fornecido e um vídeo sem capa. Toda a interface de teste sinaliza SIMULAÇÃO LOCAL; não chama a Meta. A validação contra a API real continua pendente de credenciais autorizadas. O script depende do arquivo de referência local descrito no próprio código.


## Captura assistida sem API da Meta

A pasta extensao-cartelas contém uma extensão Manifest V3 para Chrome, instalada por Carregar sem compactação. Guia completo em extensao-cartelas/LEIA-ME.md. Versão 1.1: **Capturar perfil automaticamente** rola o perfil aberto e captura de 2 a 6 telas depois de um clique (cabeçalho completo na primeira, só a grade de posts nas seguintes) e pode enviar o lote ao terminar. Permissões: activeTab, scripting e storage; o único acesso de rede adicional é http://127.0.0.1/*. Os scripts só rodam na aba acionada pelo clique, para rolar e medir a grade; não abrem posts, não navegam e não leem cookies ou senhas. Para quando há login, perfil privado, fim do feed ou troca de aba.

Abra Clientes → Identidade pelo feed ou por prints → Capturas do navegador para gerar um código e conectar a extensão uma vez. Código de uso único por cinco minutos, vinculação à origem da extensão e credencial privada persistida no navegador. O servidor guarda apenas o hash da credencial na pasta .capture, fora das cópias do trabalho e do Git. Até três extensões conectadas; cada conexão pode ser revogada no sistema. A instalação e a primeira validação nativa são feitas pelo usuário no Chrome.

A extensão guarda até 12 prints / 6 MB em storage.session. O lote sobrevive ao fechamento do popup, mas não ao reinício do navegador. Perfil diferente e tela idêntica são recusados dentro do lote. O envio exige clique explícito e confirmação do servidor antes de limpar as miniaturas; repetir um envio não duplica a entrega. A caixa de entrada do sistema mantém até três lotes por até uma hora, somente em memória. Reiniciar o servidor elimina pendências. Importe no cadastro escolhido, recorte menus ou separe a grade de posts e execute a análise existente. Capturas importadas permanecem temporárias na página; salve o perfil para preservar as escolhas de identidade antes de recarregar.

QA em scripts/capture-review-server.mjs usa origem 3239, serviços reais de conexão/recebimento e uma simulação das APIs do Chrome com dois prints fornecidos. O teste não instala extensão nem comprova captura nativa. Mostra uma faixa de simulação para não confundir com uso real. Bibliotecas e credenciais desse teste ficam isoladas em test-results/capture-review.

## Ler site do cliente

Em Clientes → Identidade pelo feed ou por prints → **Ler site do cliente**, informe o site, Linktree ou cardápio online e clique em **Ler site**. O servidor local lê a página pública e até quatro folhas de estilo e sugere:

- **Cores**: cor do tema (`theme-color`), variáveis de marca como `--primary` ou `--brand` e as cores mais usadas no CSS. A paleta padrão do WordPress é ignorada e aparecem no máximo dois neutros. Cada cor tem os botões **Principal**, **Destaque** e **Fundo**, que preenchem o cadastro; nada é salvo até **Salvar cliente**.
- **Imagens**: imagens marcadas como logo, o ícone do site e a imagem de compartilhamento. Marque uma e use **Usar como logo do cliente**, ou marque várias e **Usar na análise de cores**. Logos em SVG são convertidos para PNG no navegador.

Proteções: só endereços http/https públicos, sem porta especial; endereços que apontam para a rede interna (inclusive por redirecionamento) são recusados; páginas até 2 MB, estilos até 1 MB, imagens até 4 MB, 10 segundos por pedido, até 3 redirecionamentos. As imagens ficam em memória por dez minutos e não são gravadas em disco. Código em `site.mjs` e `public/site-import-ui.js`; testes em `tests/site.test.mjs`.

## Identidade do cliente em 3 passos

No cadastro do cliente, o painel **Identidade do cliente** substitui o caminho longo:

1. **Buscar**: informe o Instagram, o site ou os dois e clique em **Buscar identidade**. O site é lido na hora. Com a conexão Meta configurada, as publicações vêm pela API; sem ela, o painel mostra o link do perfil e pede para clicar em **Capturar perfil automaticamente** na extensão do Chrome. As capturas entram sozinhas no cadastro aberto: a extensão marca a tela do perfil e as telas de grade com o número de linhas e colunas inteiras, e o Cartelas separa os posts e analisa as cores sem o diálogo manual.
2. **Conferir**: o painel propõe o logo (logo do site, ícone ou manter o atual) e as cores Principal, Destaque e Fundo, dizendo de onde veio cada uma. Para trocar, escolha a função e clique numa das cores encontradas, ou ajuste no seletor.
3. **Salvar**: **Aplicar e salvar cliente** preenche o cadastro e salva; **Só aplicar no cadastro** preenche sem salvar.

Capturas de outro perfil não entram automaticamente: ficam em **Ajustes finos → Capturas do navegador**. Os painéis anteriores (prints, recorte manual, separar posts, conexão Meta, leitura do site detalhada e IA) continuam em **Ajustes finos e outras formas de importar**. A proposta de paleta está em `public/identity-suggest.js` (testes em `tests/identity-suggest.test.mjs`).

