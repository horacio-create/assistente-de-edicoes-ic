# Indoor Channel — Assistente de Edições V1.4

Aplicação local para Windows, Chrome e Edge. Não envia imagens à internet. Os colegas usam o navegador; apenas o PC que hospeda a aplicação precisa da instalação.

## Primeira execução

1. Extraia a pasta IndoorChannel em uma pasta permanente do PC.
2. Instale Python 3.12 ou superior pelo [site oficial](https://www.python.org/downloads/windows/), incluindo o Python Launcher.
3. Abra **Instalar.bat**. A primeira instalação precisa de internet para baixar as três bibliotecas de processamento e servidor.
4. Abra **Iniciar.bat**, mantenha a janela aberta e acesse **http://localhost:8080** no Chrome ou Edge.
5. Colegas na mesma rede acessam **http://NOME-DO-SEU-PC:8080**. O nome aparece na janela de execução. Se necessário, use o endereço IPv4 do PC.

Para acesso pela rede, permita o Python no Firewall do Windows **somente na rede privada da empresa**, quando solicitado. Não encaminhe a porta no roteador. O sistema não possui login: qualquer pessoa com acesso à porta na rede pode acessar as mídias, histórico e pastas visíveis ao usuário do Windows que executa a aplicação. O PC precisa permanecer ligado e sem suspensão durante o uso.

## Novidades da versão 1.2

O Assistente de Edições reúne Imagens e os módulos futuros na barra lateral. Use o botão no alto da barra para recolhê-la ou expandi-la. A barra começa recolhida em cada abertura. Passe o mouse sobre ela para ver os nomes ou use o botão para fixá-la aberta.

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

`server.py`: API local e aplicação WSGI servida por Waitress. `storage.py`: persistência SQLite e eventos. `modules/images.py`: importação, transformação e codificação. `static/`: interface sem dependências externas, utilizável sem internet após a instalação. O registro `MODULES` reserva vídeo, ofertas de supermercados, logo EAP e vetorização MS6. Esses módulos futuros não são funcionalidades ativas da V1.

Variáveis opcionais: `INDOOR_PORT` (padrão 8080), `INDOOR_HOST` (padrão 0.0.0.0), `INDOOR_DATA` (pasta de dados, padrão `dados` ao lado da aplicação).

O servidor inclui bloqueio de requisições de origem externa e não habilita CORS. Não é destinado à internet pública. Não há instalador de serviço, regra automática de firewall ou inicialização automática no Windows nesta entrega.

Para verificar o processamento: `python -m unittest discover -s tests -v` com as dependências instaladas. Os testes usam uma pasta temporária separada.


## Aparência V1.3

Símbolo IC original no favicon e na barra lateral. Imagens usa o verde #81d680 no selo da seção e no detalhe da seleção lilás. As áreas mantêm seus nomes sem numeração. Setas maiores e transições direcionais na troca de imagens; seleções e abertura de janelas têm animações curtas, desativadas quando o sistema pede movimento reduzido. As cores dos futuros módulos serão definidas posteriormente.

## Seleção, histórico e logos — V1.4

Clique numa miniatura para selecionar e editar. Shift + clique seleciona o intervalo desde a última seleção; Ctrl + clique adiciona ou remove uma imagem. Arraste no espaço vazio da faixa de miniaturas para desenhar um retângulo de seleção; Ctrl preserva a seleção anterior. Com a faixa em foco, Ctrl+A seleciona todas e Escape limpa a seleção. As caixas de seleção continuam disponíveis.

O histórico oferece seleção de registros, Apagar selecionados e Apagar tudo, com confirmação. Apenas os registros são ocultados: edições, imagens, originais e exportações são preservados. “Desfazer exclusão” restaura a última exclusão nesta sessão da página.

Logos grandes são preparadas em um processo separado, preservando transparência e o arquivo enviado. A cópia utilizada como sobreposição tem até 2048 pixels no maior lado. O PNG IC original de 13317 × 14459 pixels foi importado com sucesso. Limites para logos: 100 MB por arquivo, até 256 milhões de pixels e 90 segundos de preparação. Arquivos corrompidos recebem uma mensagem amigável.

A barra lateral usa ícones menores, indicação inferior da seção ativa, logo centralizada e botão de recolhimento no rodapé. Os módulos futuros ficam ocultos quando recolhida. Em telas estreitas, os ajustes passam para baixo da prévia.


## Ordem de exportação

Arraste uma miniatura para mudar sua posição. Se ela estiver selecionada junto com outras, o grupo inteiro será movido, mantendo sua ordem interna. Os números nas miniaturas indicam a sequência usada na exportação e nos nomes VT1, VT2… A ordem fica guardada ao salvar a edição. Use as setas nas laterais da faixa para percorrer listas maiores.
