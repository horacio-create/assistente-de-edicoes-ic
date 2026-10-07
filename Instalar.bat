@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Preparando Indoor Channel...
where py >nul 2>nul
if errorlevel 1 (
  echo Instale Python 3.12 ou superior de https://www.python.org/downloads/windows/
  echo Marque a opcao de instalar o Python Launcher e execute este arquivo novamente.
  pause
  exit /b 1
)
py -3 -m venv .venv
if errorlevel 1 goto :falha
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto :falha
rem Ofertas de supermercados: motor de video (opcional, requer Node.js 20+)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado: o modulo Ofertas de supermercados fica desativado.
  echo Para usar, instale o Node.js 20+ de https://nodejs.org e rode este arquivo de novo.
) else (
  pushd ofertas\motor
  call npm install --no-audit --no-fund
  if errorlevel 1 (popd & goto :falha)
  popd
)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar-video.ps1"
if errorlevel 1 goto :falha
echo Instalacao concluida. Abra Iniciar.bat para usar a aplicacao.
pause
exit /b 0
:falha
echo A instalacao nao foi concluida. Confira a conexao com a internet e o Python.
pause
exit /b 1
