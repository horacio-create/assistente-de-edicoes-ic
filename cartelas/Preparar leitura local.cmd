@echo off
cd /d "%~dp0"
python -m venv .local-reader
if errorlevel 1 goto fail
.local-reader\Scripts\python.exe -m pip install -r reader-requirements.txt
if errorlevel 1 goto fail
.local-reader\Scripts\python.exe scripts\setup_reader.py
if errorlevel 1 goto fail
echo Leitura local pronta. Atualize o aplicativo.
pause
exit /b 0
:fail
echo Nao foi possivel preparar a leitura local. Confira a conexao e o Python instalado.
pause
exit /b 1
