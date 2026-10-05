# Empacotamento em executável (Windows, arquivo único)

Gera `Indoor Channel.exe`: ao abrir, extrai o programa para `%TEMP%\IndoorChannel-xxxx`, abre uma janela do Edge/Chrome em modo aplicativo e, ao fechar a janela, apaga tudo (dados, histórico, perfil do navegador). Os únicos arquivos que permanecem são as exportações que a pessoa salvar.

## Como gerar

    sudo apt install mingw-w64 zip unzip curl python3-pip && pip install Pillow
    ./build_exe.sh /caminho/do/app "Indoor Channel.exe"

O script baixa o Python embutido (python-build-standalone 3.12, Windows x64), as bibliotecas do `requirements.txt` já compiladas para Windows, a MSVCP140.dll (pacote `msvc-runtime` do PyPI) e a miniz, compila o lançador com mingw e monta o executável. Pode rodar em Linux ou WSL. Nada é compilado para o app em si: o código Python vai como está.

## Como funciona

- `launcher/launcher.c`: executável GUI minúsculo. Lê o zip anexado ao final do próprio `.exe` (rodapé: `ICPAYLD1` + tamanho), extrai em pasta temporária com caminhos Unicode (usuário com acento funciona), mostra uma tela "Abrindo…", inicia `python\python.exe -B -s -X utf8 app\portable.py` sem janela de console, espera o processo terminar e apaga a pasta (com novas tentativas).
- `portable.py` (fica em `app/`): define `INDOOR_DATA` dentro da pasta temporária, escolhe uma porta livre em 127.0.0.1, sobe o waitress numa thread e abre `msedge.exe --app=URL --user-data-dir=<temp>\perfil` (ou o Chrome). O app só escuta no próprio computador.
- Detecção do fechamento da janela: o Edge pode entregar a janela a outro processo e encerrar o primeiro quase na hora. Por isso o `portable.py` não confia no processo que iniciou: espera o `perfil\lockfile` aparecer e só desliga o servidor quando o Chromium libera esse arquivo. Foi esse o bug da primeira versão ("127.0.0.1 se recusou a se conectar").

## Duas alterações que o app precisa (não fazem parte do script)

1. Em `/api/info` do `server.py`, incluir `portable=bool(os.environ.get('INDOOR_PORTABLE'))`.
2. No `static/app.js`, no `window.onbeforeunload`, avisar também quando houver mídias na sessão, porque fechar a janela descarta tudo:
   `if(dirty||busy||(info&&info.portable&&job&&job.media&&job.media.length)){...}`

## Ganchos de teste

`INDOOR_BROWSER_CMD` (comando completo, com `{url}`) e `INDOOR_BROWSER_EXE` substituem o navegador. Foi assim que o fluxo foi testado no Wine, sem Windows real.

## Limites conhecidos

- O Windows real nunca foi usado nos testes: só Wine. A abertura da janela do Edge e o aviso ao fechar precisam ser conferidos num Windows.
- Executável sem assinatura digital: SmartScreen e antivírus podem bloquear ou pedir confirmação. Resolver de verdade exige certificado de assinatura.
- Se o computador desligar de repente, a pasta `IndoorChannel-…` pode sobrar em `%TEMP%`.
- A abertura leva alguns segundos porque extrai cerca de 90 MB toda vez.
