# Verificação da V1 — 29/09/2026

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
