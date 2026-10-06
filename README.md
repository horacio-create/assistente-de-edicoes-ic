# Assistente de Edições — versão web V1.8.0

Aplicação web local de padronização de imagens e montagem de vídeos da Indoor Channel.

## Executar no Windows

1. Instale Python 3.12 ou superior com o Python Launcher.
2. Abra `Instalar.bat` para preparar o ambiente.
3. Abra `Iniciar.bat` e mantenha a janela aberta.
4. Acesse http://localhost:8080 pelo Chrome ou Edge.

Colegas na mesma rede acessam http://NOME-DO-PC:8080. O computador que hospeda a aplicação precisa ficar ligado. A pasta de exportação pode ser local ou compartilhada.

## Recursos

- Formatos horizontal 1280×720, vertical 720×1280, personalizado e tamanho da mídia.
- Upload múltiplo, miniaturas, seleção por intervalo/retângulo e arraste para ordenar o lote.
- Zoom, rotação, reposicionamento com encaixe central, área segura e logo sobreposta.
- Mostrar tudo, Preencher tela e Criar fundo com cor predominante ou escolhida.
- JPG/JPEG, PNG, WebP, BMP, TIFF e páginas de PDF.
- Exportação JPG/PNG, nomes VT 1, VT 2… seguindo a ordem das miniaturas.
- Ctrl+Z para desfazer ajustes e Ctrl+Shift+Z ou Ctrl+Y para refazer.
- Versão no rodapé esquerdo e check verde por três segundos após exportação completa.
- Histórico e edições recentes.

Logo EAP e Vetorização MS6 também estão disponíveis na barra lateral.
O módulo Ofertas de supermercados foi desenvolvido separadamente e aguarda envio ao repositório.

## Vídeos
A seção Vídeos fica abaixo de Imagens na barra lateral. Importa MP4, AVI, MOV, MKV e WebM,
além de M4V, WMV e MPEG, até 100 MB por arquivo. A compatibilidade depende também do codec
e da integridade do arquivo. Os originais são preservados.

- Editor compacto dentro da janela: formatos, biblioteca, prévia, timeline e exportação sempre visíveis.
- Reprodução compacta com a largura da prévia; timeline logo abaixo, sem rolar a página.
- Campos de corte e duração no painel Ajustes; sua rolagem alcança a base da timeline.
- Explicações por dicas após três segundos com o mouse parado. Textos das caixas de seleção permanecem visíveis.
- Mesmos ajustes de enquadramento, cor, tamanho, rotação, espelhamento e logo das imagens.
- Biblioteca de vídeos, imagens e páginas de PDF, com importação visível em uma janela central.
- Arraste arquivos do computador para a biblioteca ou área do editor durante a edição.
- Mídias e Edição em abas separadas; biblioteca compartilhada e até vinte timelines
  com cortes e ajustes independentes. Crie pelo +, renomeie com duplo clique e exclua em Edição.
- Ctrl+C copia o corte selecionado e Ctrl+V cola nesta ou em outra timeline da edição.
- Ícones de corte/remoção na lateral da timeline, em verde, com dicas após três segundos.
- Duplo clique abre Preparar mídia: selecione início/fim do vídeo ou a duração da imagem,
  guarde a seleção e arraste para a timeline. As seleções também ficam salvas na edição.
- Até 100 trechos de fontes diferentes e dez faixas empilhadas. Uma faixa é criada inicialmente;
  arraste para o espaço acima das faixas para criar outra. A faixa de cima cobre a de baixo.
- Dividir, remover, adicionar e reordenar acima da timeline. Encaixe automático evita espaços
  sem conteúdo; uma linha vertical verde indica o encaixe durante o arraste.
- Cursor com alça e régua. Posição na montagem fica logo abaixo da prévia.
- Tempo atual editável: digite 14,22 ou 14.22 e pressione Enter; Esc cancela.
- Alt + rolagem do mouse amplia/reduz a timeline, entre a visão padrão (100%) e
  quadro a quadro (40 px por quadro a 30 fps). Clique na porcentagem para voltar a 100%.
- Adicionar logo coloca a marca em Suas mídias e em uma faixa superior durante toda
  a montagem, com transparência. Selecione seu bloco para ajustar posição e duração.
- Cadeado e olho à esquerda de cada faixa. O cadeado protege todos os seus trechos;
  o olho oculta só a prévia. Todas as faixas continuam na revisão e na exportação.
- Imagem estática: a primeira imagem inserida começa com 15 segundos. Outras começam com
  cinco segundos; defina cada duração para criar apresentações de slides ou misturar com vídeos.
- Duração de um vídeo altera sua velocidade entre 0,25× e 4×. Duração de imagem define
  seu tempo na tela. Duração da montagem altera todos os tempos proporcionalmente.
- Exportação de uma montagem completa em MP4/H.264, com limite de tamanho em MB (4 inicialmente).
- Fila de até cinquenta montagens: Fila guarda uma cópia da timeline, e o contador abre
  a lista para conferir/remover. Exportar processa a fila, quando houver itens, em sequência.
- Nomes da fila recebem VT 01, VT 02…; itens concluídos saem da fila. Cancelar mantém
  os concluídos e as cópias pendentes salvas, com a numeração original para nova tentativa.
- Áudio é mantido ao importar. Remover áudio é uma escolha explícita perto de Exportar,
  com ícones de alto-falante e alto-falante com X vermelho. É possível restaurar e desfazer.
- Ctrl+Z, Ctrl+Shift+Z e Ctrl+Y também abrangem corte, velocidade, tamanho e remoção do áudio.
- Atalhos visíveis nos botões e em “Atalhos do teclado”. C divide no cursor; S seleciona;
  R gira; A adiciona; Delete remove; Espaço reproduz; M alterna áudio; L alterna o cadeado;
  E alterna o olho. Ctrl+setas muda a ordem; setas percorrem os quadros; I/O marcam início/fim.
  Ctrl+S salva e Ctrl+E abre a revisão. Não atuam durante a digitação nem em outras seções.

Para montar 15 segundos, prepare os cortes na biblioteca ou divida os blocos na timeline,
remova as partes que não serão usadas e organize os trechos. Ajuste as durações das imagens
ou corte os vídeos para manter uma velocidade confortável. As faixas de cima cobrem as de
baixo durante a sobreposição. A escolha de áudio vale para a montagem inteira.
Reutilizar enquadramento em todos os trechos preserva seus cortes, durações e posições e
respeita os bloqueios. Montagens antigas de um vídeo são convertidas ao abrir, preservando
os cortes, cadeados, visibilidade e formato da tela.

`Instalar.bat` instala o motor FFmpeg/FFprobe em `tools/ffmpeg`. Para uma instalação existente,
execute `powershell -NoProfile -ExecutionPolicy Bypass -File Instalar-video.ps1` e reinicie.
Os binários não entram no Git. São obtidos do distribuidor Windows indicado em
https://ffmpeg.org/download.html; as informações e a licença do distribuidor acompanham a instalação.
O empacotamento portátil inclui esse motor quando um novo executável é gerado.

Cada seção mantém sua edição durante a sessão. Salvar edição persiste ajustes e ordem;
Edições recentes permite recuperá-los. As edições de imagens existentes são preservadas.
A prévia mostra o enquadramento e a velocidade; confira a nitidez no arquivo comprimido exportado.

## Dados

Imagens importadas, edições e histórico ficam na pasta `dados`, criada ao usar o sistema e excluída do Git. Os originais não são alterados. Preserve uma cópia dessa pasta para transportar as edições.

## Testes

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -q
node tests/test_undo.cjs
```

A V1.8.0 tem 101 testes Python e cinco testes JavaScript. Os testes de vídeo usam
FFmpeg e arquivos sintéticos temporários. Node.js é necessário apenas para os testes JavaScript.
O teste de navegador em `tests/test_composition_browser.cjs` usa Playwright, uma instância
isolada, um vídeo sintético de cinco segundos e imagens verdes/amarelas ao lado dele.
Verifica faixas, biblioteca, preparação de fontes, imagens, encaixe, prévia, atalhos,
desfazer/refazer, recuperação, compatibilidade com montagens antigas e exportação.
Os testes `test_video_browser.cjs` e `test_montage_browser.cjs` registram os fluxos das
etapas iniciais do desenvolvimento e não correspondem à interface atual.
`tests/test_compact_browser.cjs` confere cinco dimensões de tela, separação da exportação,
rolagem interna, reprodução compacta e dicas com atraso de três segundos.
`tests/test_timeline_navigation_browser.cjs` confere tempo digitado, régua, limites de
zoom, navegação em uma hora e logo na biblioteca/faixa, com transparência e recuperação.
`tests/test_projects_browser.cjs` confere arraste externo, timelines, copiar/colar,
renomeação, exclusão, desfazer/refazer, recuperação e exportação real da fila.
`tests/test_queue_cancel_browser.cjs` cancela durante o segundo item de uma fila real
e confere o arquivo concluído, fila pendente salva, numeração e nova tentativa.
Veja `LEIA-ME.md` e `VALIDACAO.md` para instruções e verificações.

## Versão

`version.py` é a fonte única da versão exibida pela interface. Incremente `VERSION` a cada lançamento e registre as alterações em `CHANGELOG.md`.

## Arquitetura

Interface HTML/CSS/JavaScript, servidor Python com Waitress, processamento Pillow/PyMuPDF e histórico SQLite. Esta versão é executada pelo navegador e ainda não foi adaptada para hospedagem em nuvem.

As logos e a identidade visual pertencem à Indoor Channel.


## Executável portátil (validação pendente)

O código de empacotamento fica em `packaging/`. Consulte `packaging/LEIA-ME.md`. O executável único usa lançador C/MinGW, Python Windows embutido e Edge/Chrome em modo aplicativo com perfil temporário. Não usa PyInstaller. O fluxo completo e a remoção da pasta temporária ainda precisam ser confirmados em Windows real.


## Nomes e progresso
O nome da edição aparece ao lado do título do programa. Clique no lápis para renomear;
as edições recentes também têm um lápis. O nome escolhido é salvo e a exportação não
o substitui pelo nome do arquivo exportado.

Na primeira importação, a sugestão usa o nome do arquivo, sem extensão e sufixos de
exportação. Para nomes genéricos, como “Telas Indoor Channel”, o programa tenta ler
os textos visíveis da imagem ou de três quadros do vídeo usando o OCR local do Windows.
Prioriza nome da empresa ou tema reconhecido, como clínica odontológica. Não interpreta
fala nem identifica pessoas; sem texto legível ou OCR disponível, usa o nome do arquivo.
Nenhuma mídia é enviada a serviços externos. Sugestões podem ser corrigidas pelo usuário.

A janela “Exportando [nome do arquivo]” mostra o progresso real informado pelo FFmpeg,
considerando as duas passagens da compressão. A estimativa de tempo aparece quando há
dados suficientes. Os 100% só aparecem após conferir o tamanho e salvar o resultado.
A prévia conserva o último quadro completo durante a busca, evitando flashes do pôster.

O botão **Cancelar** interrompe o FFmpeg da exportação em curso e elimina seu arquivo
temporário. Os originais e as exportações já concluídas permanecem. A revisão do
destino é refeita para permitir tentar novamente sem reabrir a janela.
