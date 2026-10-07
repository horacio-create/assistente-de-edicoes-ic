# Portátil — versão 1.8.0

Estrutura baseada no empacotamento fornecido pelo usuário: lançador C/MinGW com ZIP embutido, Python Windows e portable.py. Ícone IC igual ao favicon. Sem PyInstaller.

No Windows, com Python 3.12 e pip disponíveis:

    powershell -File packaging/build_exe.ps1 -Python python -Output "Indoor Channel.exe"

O script baixa componentes oficiais para portable-build, compila o lançador e monta o ZIP embutido. A pasta de build é reutilizada como cache; novos stages têm nomes únicos. Não leva dados pessoais, histórico existente ou ambientes de desenvolvimento. O script Linux/WSL foi adaptado aos caminhos atuais, mas não foi executado neste ambiente.

O portátil escuta apenas em 127.0.0.1, cria perfil e dados dentro de %TEMP%/IndoorChannel-…, e foi projetado para apagá-los quando a janela fecha. As exportações ficam na pasta escolhida. Histórico e edições recentes existem somente durante a sessão portátil. O fechamento é monitorado pelo lockfile do Chromium, sem esperar o processo inicial.

Estado do build de 07/10/2026: suíte Python com 136 testes, 117 aprovados e 19 pulados (motor de Ofertas e encartes de referência indisponíveis); cinco testes JavaScript de desfazer e oito do contrato de Ofertas aprovados. No executável real, usando INDOOR_BROWSER_CMD, foram confirmadas importação/exportação de PDF, PNG de 16 bits e PNG comum; vídeo com áudio; DXF MS6; três versões EAP; encerramento do motor e remoção da pasta IndoorChannel-… do TEMP. A interação manual no navegador, seletor nativo e fechamento pelo lockfile continuam sem validação manual.

FFmpeg e FFprobe estão embutidos; não é necessário instalá-los no PC de destino. O build Windows copia também o código e os templates de Ofertas. Conforme o comportamento atual documentado, o portátil não inclui Node.js nem node_modules do motor de Ofertas: esse módulo informa a dependência ausente. Não foi validada a geração de ofertas nesta build.

Desligamento forçado pode deixar resíduos temporários. O executável não tem assinatura digital. REFERENCIA.md preserva as notas do empacotamento original, cujo teste foi em Wine.
