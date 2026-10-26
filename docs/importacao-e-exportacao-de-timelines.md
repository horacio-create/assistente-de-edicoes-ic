# Importação de vídeos em lote

Ao adicionar vários vídeos, ou outro vídeo a uma edição que já possui vídeos,
o editor pergunta se deseja uma timeline única em sequência ou uma timeline
por vídeo importado. Na segunda opção, cada timeline recebe o nome do arquivo
sem extensão; timelines existentes com conteúdo são preservadas. Uma timeline
ativa vazia é reaproveitada. A biblioteca continua compartilhada. Imagens e
áudios conservam o fluxo de importação existente.

A edição mantém o limite de 10 timelines. Antes de importar, a opção separada
fica indisponível se não houver espaço para todos os vídeos selecionados.
Arquivos inválidos ou importações canceladas conservam os arquivos já recebidos,
com os avisos existentes. A montagem única respeita 100 trechos e uma hora.

É possível marcar o envio de todas as timelines à fila ao importar, ou clicar
em **Todas à fila** depois de editar. Timelines vazias são ignoradas. A ação
atualiza os snapshots que já estão na fila e adiciona os ausentes, sem criar
novas cópias dos mesmos itens. A fila continua limitada a 50 vídeos, com
numeração e snapshots independentes da edição posterior.

# Nomes na exportação

**Manter os nomes originais dos arquivos** está disponível na revisão final
do editor de vídeo. O nome é resolvido a partir das fontes efetivamente usadas:

- Um vídeo, inclusive com cortes, áudio e imagens sobrepostas: nome original.
- Vários vídeos diferentes: nome da timeline (ou da edição antiga sem timelines).
- Nomes repetidos no lote: sufixos (2), (3), etc.

A saída permanece MP4, com caracteres inválidos para nomes de arquivo tratados
pelo servidor e o limite existente de 90 caracteres. Arquivos originais ou
desconhecidos no destino continuam protegidos contra sobrescrita. Com a opção
desmarcada, mantém-se a nomenclatura personalizada VT já existente.

# Organizar trechos em escadinha

Na timeline, Shift + clique ou Ctrl + clique adicionam ou retiram trechos da
seleção. Com pelo menos dois vídeos ou imagens selecionados, o botão direito abre
**Organizar em escadinha…**. A confirmação permite escolher a ordem da seleção
ou a ordem visual das faixas, de cima para baixo. A sequência começa no menor
tempo inicial dos vídeos escolhidos; cada vídeo começa ao final do anterior.

Faixas, cortes, velocidades, durações e configurações são preservados. Apenas
as posições iniciais dos trechos selecionados mudam, usando a grade de 30 fps.
Trechos não selecionados não são deslocados. Bloqueios, colisão com outro
trecho na mesma faixa, lacunas e duração superior a uma hora impedem a ação
com uma mensagem. Ctrl + Z e Ctrl + Shift + Z desfazem e refazem a organização.
Use Salvar edição para persistir os ajustes, como nas demais alterações.

Conferência local: dois vídeos de 2 s sobrepostos em faixas diferentes passaram
para 0 e 2 s, mantendo ambas as faixas. Desfazer voltou a duração total para
2 s, refazer retornou a 4 s e o salvamento preservou as posições no servidor.
Evidência: dados/teste-timelines/escadinha-conferida.png.

Validação local: importação de Campanha A e B (2 s cada) produziu uma timeline
com dois trechos/4 s e duas timelines com um trecho/2 s. Fila automática com dois
itens, sem duplicação ao usar Todas à fila novamente. Exportação real gerou
Campanha A.mp4 e Campanha B.mp4 em 1280×720, 2 s cada. Evidências em
dados/teste-timelines; vídeos em ../TESTE_EDITOR_VIDEO. Testes cobrem nomes por
fonte, cortes, sobreposições, fontes mistas, repetições e proteção dos originais,
além da suíte existente de fila e reutilização de timelines.
