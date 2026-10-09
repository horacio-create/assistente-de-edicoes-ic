# Assistente de Edições — versão web V1.10.0

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

Logo EAP e Vetorização M6S também estão disponíveis na barra lateral.
- **Ofertas de supermercados:** VTs de oferta em MP4 a partir de templates, com formulário, prévia ao vivo, importação de encarte em PDF, biblioteca de imagens com remoção de fundo e fila de geração. Requer Node.js 20+; veja `ofertas/README.md`.

## Vídeos
A seção Vídeos fica abaixo de Imagens na barra lateral. Importa MP4, AVI, MOV, MKV e WebM,
além de M4V, WMV e MPEG, até 100 MB por arquivo. A compatibilidade depende também do codec
e da integridade do arquivo. Os originais são preservados.

Também aceita músicas em MP3, WAV, M4A, AAC, OGG, FLAC, Opus, WMA e AIFF.
Áudios entram automaticamente em faixas abaixo dos vídeos, com ondas sonoras reais,
cor roxa e botões de cadeado e mudo. O mudo de cada faixa vale na prévia e na exportação;
Remover áudio continua controlando toda a montagem. A duração inicial da música acompanha
o fim do vídeo, quando houver, e o original completo continua disponível na biblioteca.
Para exportar é necessário ter vídeo ou imagem cobrindo toda a montagem.

- Até cinco guias de edição por seção, com + para abrir e × para fechar.
  Fechar salva a edição e a mantém em Edições recentes. O aviso do limite permite voltar
  às guias ou iniciar outro conjunto de edições. Guias reaparecem ao recarregar a página
  na mesma aba do navegador; desfazer/refazer permanece separado enquanto a sessão está aberta.
  Só a guia ativa mantém os reprodutores de prévia.
- Editor compacto dentro da janela: formatos, biblioteca, prévia, timeline e exportação sempre visíveis.
- Reprodução compacta com a largura da prévia; timeline logo abaixo, sem rolar a página.
- Arraste as divisórias para alterar a largura de Mídias/Edição e a altura da timeline.
  Dois cliques restauram o tamanho; as setas do teclado também ajustam a divisória selecionada.
- Duplo clique no bloco da timeline abre Ajustar trecho; o relógio abre velocidade e duração.
- Explicações por dicas após três segundos com o mouse parado. Textos das caixas de seleção permanecem visíveis.
- Mesmos ajustes de enquadramento, cor, tamanho, rotação, espelhamento e logo das imagens.
- A mídia visível selecionada tem caixa e alças para posição, escala e rotação livre.
  A corrente liga ou libera largura e altura; destravada, permite esticar o objeto.
  O esticamento fica salvo e vale também na exportação. Rotação aceita ângulos negativos
  (sentido anti-horário) e normaliza voltas completas. Espelhamentos ficam ao lado da rotação.
  As medidas da tela exportada ficam em Personalizado, sem campos duplicados no topo.
  O arraste começa apenas sobre o objeto ou suas alças. O botão na prévia mostra/oculta os controles.
  Home restaura posição, rotação e escala sem alterar cortes ou duração; Shift encaixa o giro em 15°.
  As alças respeitam cadeados e os bloqueios de tamanho/posição e não aparecem na exportação.
  Logos mostram Escala nas propriedades e recuperam sua escala inicial com Home.
- Biblioteca de vídeos, imagens, áudios e páginas de PDF, com ícones que identificam o tipo.
- Arraste arquivos do computador para a biblioteca ou área do editor durante a edição.
- Mídias e Edição em abas separadas; biblioteca compartilhada e até dez timelines
  com cortes e ajustes independentes. Crie pelo +, renomeie com duplo clique e exclua em Edição.
- Ctrl+C copia o corte selecionado e Ctrl+V cola nesta ou em outra timeline da edição.
- Ícones de corte/remoção na lateral da timeline, em verde, com dicas após três segundos.
- Duplo clique abre Preparar mídia: selecione início/fim do vídeo ou a duração da imagem,
  guarde a seleção e arraste para a timeline. As seleções também ficam salvas na edição.
- Até 100 trechos de fontes diferentes e dez faixas empilhadas. Uma faixa é criada inicialmente;
  arraste para o espaço acima das faixas para criar outra. A faixa de cima cobre a de baixo.
- Dividir, remover e reordenar na lateral da timeline. Encaixe automático evita espaços
  sem conteúdo; uma linha vertical verde indica o encaixe durante o arraste.
- Cursor com alça e régua. Posição na montagem fica logo abaixo da prévia.
- Tempo atual editável: digite 14,22 ou 14.22 e pressione Enter; Esc cancela.
- Alt + rolagem do mouse amplia/reduz a timeline, entre a visão padrão (100%) e
  quadro a quadro (40 px por quadro a 30 fps). Clique na porcentagem para voltar a 100%.
- Para sobrepor uma logo ou outra imagem, importe em Suas mídias e arraste para uma
  faixa acima do vídeo. Selecione o bloco e ajuste Escala, posição e duração.
  PNGs transparentes preservam o vídeo por baixo na prévia e no MP4; Criar fundo
  continua preenchendo a tela com a cor escolhida.
- Faixas Vídeo 01, Vídeo 02… e Áudio 01, Áudio 02… com numeração independente.
- Cadeado e olho à esquerda de cada faixa de vídeo. O cadeado protege todos os seus trechos;
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
  E alterna o olho da faixa de vídeo ou o mudo da faixa de áudio. Ctrl+setas muda a ordem;
  setas percorrem os quadros; I/O marcam início/fim.
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
A exportação de montagens detecta a opção de leitura de filtros suportada pelo motor
instalado, incluindo o FFmpeg 5.1 distribuído pelo Debian Bookworm no servidor.
Os filtros continuam em arquivos temporários, evitando o limite de linha de comando
em montagens com muitos trechos.

No acesso pela rede, escolha uma pasta de trabalho no computador do navegador ou use
Baixar em Downloads. O navegador pode bloquear pastas do sistema e a raiz do disco;
use uma subpasta de Documentos/Vídeos ou baixe os arquivos e mova-os depois. O destino
real dos downloads segue as configurações do navegador. Pastas compartilhadas selecionadas
no computador recebem os arquivos pelo navegador; o campo Pasta acessível pelo servidor
é para caminhos que a máquina/container que hospeda o sistema consegue acessar.


Cada seção mantém sua edição durante a sessão. Salvar edição persiste ajustes e ordem;
Edições recentes permite recuperá-los. As edições de imagens existentes são preservadas.
A prévia mostra o enquadramento e a velocidade; confira a nitidez no arquivo comprimido exportado.

## Dados

Imagens importadas, edições e histórico ficam na pasta `dados`, criada ao usar o sistema e excluída do Git. Os originais não são alterados. Preserve uma cópia dessa pasta para transportar as edições.

## Usuários e acesso (servidor)

No servidor (`deploy/`), `INDOOR_AUTH=1` liga o login; no PC e no executável portátil o sistema continua sem login.

- **Primeiro superadmin:** `docker compose -f deploy/compose.yaml exec assistente python server.py criar-superadmin email@empresa.com.br` imprime um link de convite (vale 7 dias). Quem aceitar esse primeiro convite herda as edições, pedidos e histórico feitos antes do login existir.
- **Cargos:** na tela **Usuários** (só superadmins), cada cargo libera um conjunto de ferramentas (Imagens, Vídeos, Ofertas, Logo EAP, Vetorização M6S). Superadmin é uma marcação do usuário, não um cargo, e só outro superadmin pode dar ou tirar.
- **Convites:** o superadmin informa e-mail e cargo e copia o link gerado; a pessoa abre o link e completa o cadastro com nome e senha. O link vale 7 dias e uma vez. Não há envio de e-mail: o link é enviado por quem convidou.
- **Dados por usuário:** edições, pedidos de Ofertas, encartes, vídeos gerados e histórico são de quem criou. A Biblioteca de imagens e os templates continuam compartilhados com a equipe.
- **Esqueceu a senha:** na tela Usuários, **Redefinir senha** gera um link (7 dias, uso único) para a pessoa definir uma senha nova; ao usar, as sessões abertas em outros aparelhos são encerradas.
- Desativar um usuário encerra as sessões dele na hora. Cinco senhas erradas seguidas bloqueiam o e-mail por 15 minutos.

## Deploy automático (CI/CD)

`.github/workflows/ci-cd.yml` roda em todo PR e push: FFmpeg + motor de Ofertas instalados, testes Python e JavaScript,
contrato dos templates e build da imagem Docker. Push na `main` com tudo verde publica no servidor sozinho: a CI envia o
código por SSH para `deploy/deploy-vm.sh`, que faz backup do código e do banco, roda `docker compose up -d --build`,
confere `/api/info` e `/login.html` e, se a checagem falhar, volta a versão anterior (a CI fica vermelha). Backups em
`~/deploys` (5 últimos) e `/dados/backups` no volume (10 últimos). Até a configuração abaixo existir, o deploy aparece
como pulado.

**Configuração única** (comandos para quem administra a VM e o GitHub; a chave é exclusiva da CI). Troque `<nome-da-vm>`,
`<zona>`, `<ip-do-servidor>` e `<usuario-da-vm>` pelos dados do servidor, que ficam fora do repositório:

1. Gere a chave da CI, sem senha, fora do repositório:
   `ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f ~/deploy_ci_key`
2. Instale o script na VM (fora da pasta do código, para um deploy não reescrever o próprio script):
   `gcloud compute ssh <nome-da-vm> --zone=<zona> --command 'mkdir -p ~/bin'` e
   `gcloud compute scp deploy/deploy-vm.sh <nome-da-vm>:~/bin/deploy-assistente.sh --zone=<zona>`
3. Autorize a chave só para esse script, acrescentando uma linha em `~/.ssh/authorized_keys` do usuário da VM:
   `command="/home/<usuario-da-vm>/bin/deploy-assistente.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty <conteúdo de ~/deploy_ci_key.pub>`
   Com OS Login ativo na VM, o `authorized_keys` pode ser ignorado: confira com o passo 5 antes de seguir.
4. No GitHub (Settings → Secrets and variables → Actions):
   - secret `DEPLOY_SSH_KEY`: conteúdo de `~/deploy_ci_key` (a chave privada);
   - secret `DEPLOY_KNOWN_HOSTS`: saída de `ssh-keyscan -t ed25519 <ip-do-servidor>`, depois de conferir a impressão
     digital com a da própria VM (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`, rodado lá);
   - variables `DEPLOY_HOST` = `<ip-do-servidor>` e `DEPLOY_USER` = `<usuario-da-vm>`.
5. Teste do seu computador (publica o commit atual, como a CI faria):
   `git archive --format=tar.gz HEAD | ssh -i ~/deploy_ci_key <usuario-da-vm>@<ip-do-servidor> deploy $(git rev-parse HEAD)`
6. Apague `~/deploy_ci_key` do computador. Para revogar a CI, remova a linha do `authorized_keys`.

Mudou `deploy/deploy-vm.sh`? Repita o passo 2: o script da VM não se atualiza sozinho.

## Testes

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -q
node tests/test_undo.cjs
cd ofertas/motor && npm test   # contrato de templates de Ofertas
```

A V1.10.0 tem 193 testes Python, incluindo os do módulo Ofertas (os 20 que dependem do motor são pulados sem Node.js e o do extrator com encartes reais conferidos é pulado sem `OFERTAS_ENCARTES`), além de cinco testes JavaScript e oito testes do contrato em `ofertas/motor`. Os testes de vídeo usam
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

Interface HTML/CSS/JavaScript, servidor Python com Waitress, processamento Pillow/PyMuPDF e histórico SQLite. A interface é acessada pelo navegador e roda tanto localmente (Iniciar.bat/Iniciar.command) quanto no servidor, via Docker e deploy automático (veja **Deploy automático (CI/CD)**).

As logos e a identidade visual pertencem à Indoor Channel.


## Executável portátil 1.8.0

Código de empacotamento em `packaging/`; consulte `packaging/LEIA-ME.md`. Arquivo único com lançador C/MinGW, Python Windows embutido, FFmpeg/FFprobe e janela Edge/Chrome em modo aplicativo. Sem PyInstaller.

Build Windows de 07/10/2026: 117 testes Python aprovados, 19 pulados, cinco testes JavaScript de desfazer e oito de contrato aprovados. O teste automatizado do executável confirmou imagens, vídeo com áudio, DXF, EAP e limpeza dos temporários. A janela do navegador, o seletor nativo e o fechamento pelo lockfile ainda precisam de validação manual. Ofertas mantém a dependência externa de Node.js e do motor instalado.

### Reutilizar a timeline em lote

Em **Reutilizar estes ajustes → Em todas**, a timeline aberta fornece o modelo completo
(saída, enquadramento, cortes, duração, logos e áudio). Nas demais timelines, o arquivo
principal é substituído pelo arquivo de cada destino; as outras camadas acompanham o modelo.
Com uma única timeline, o sistema prepara uma por arquivo do mesmo tipo da biblioteca,
até **10 timelines por edição**. A operação não adiciona itens à fila automaticamente.

Vídeos mais curtos têm seus cortes ajustados ao material disponível. Um resumo informa
as durações encurtadas/alongadas e os arquivos não processados. Para os excedentes,
importe-os em uma nova edição ou exclua as outras nove timelines e repita a operação.
Timelines bloqueadas são preservadas. Itens já enfileirados das timelines afetadas são
atualizados, mantendo seus nomes e números. **Ctrl+Z** desfaz a operação completa.

### Cortes, velocidade e transformação

Dê **dois cliques sobre o bloco da mídia na timeline** para abrir **Ajustar trecho**:
a barra verde e suas duas alças definem início e fim, mantendo a velocidade do corte.
O **relógio ao lado do olho/mudo** abre **Velocidade e duração**. A porcentagem indica
quanto dura o trecho em relação ao seu corte a 100%: **50% = metade da duração (2×)**;
**200% = dobro da duração (0,5×)**. Porcentagem e nova duração em segundos são ligados.
O limite é de 25% a 400%, equivalente a velocidades entre 4× e 0,25×.

Aplicar confirma; Cancelar ou Esc preserva o estado anterior. Bloqueios e Ctrl+Z/Ctrl+Y
continuam funcionando. Imagens têm duração editável; áudios também aceitam velocidade.
No painel direito, posição X/Y usa pixels a partir do centro (Y positivo para cima),
rotação usa graus, e largura/altura usam pixels preservando a proporção. O tamanho
máximo em MB fica na revisão da exportação. **T** abre duração; **P** abre exportação.
