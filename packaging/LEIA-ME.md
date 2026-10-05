# Portátil — versão 1.6.2

Estrutura baseada no empacotamento fornecido pelo usuário: lançador C/MinGW com ZIP embutido, Python Windows e portable.py. Ícone IC igual ao favicon. Sem PyInstaller.

No Windows, com Python 3.12 e pip disponíveis:

    powershell -File packaging/build_exe.ps1 -Python python -Output "Indoor Channel.exe"

O script baixa componentes oficiais para portable-build, compila o lançador e monta o ZIP embutido. A pasta de build é reutilizada como cache; novos stages têm nomes únicos. Não leva dados pessoais, histórico existente ou ambientes de desenvolvimento. O script Linux/WSL foi adaptado aos caminhos atuais, mas não foi executado neste ambiente.

O portátil escuta apenas em 127.0.0.1, cria perfil e dados dentro de %TEMP%/IndoorChannel-…, e foi projetado para apagá-los quando a janela fecha. As exportações ficam na pasta escolhida. Histórico e edições recentes existem somente durante a sessão portátil. O fechamento é monitorado pelo lockfile do Chromium, sem esperar o processo inicial.

Estado: build realizado no Windows; 35 testes Python e cinco JavaScript aprovados. A janela Edge apareceu, mas a automação foi interrompida por não identificar a URL com segurança. Importação, exportação e limpeza após fechar ainda não foram validadas no executável real. Não considerar esta build homologada.

Desligamento forçado pode deixar resíduos temporários. O executável não tem assinatura digital. REFERENCIA.md preserva as notas do empacotamento original, cujo teste foi em Wine.
