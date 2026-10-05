@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Execute Instalar.bat primeiro.
  pause
  exit /b 1
)
echo Abra http://localhost:8080 no Chrome ou Edge.
echo Colegas na rede: http://%COMPUTERNAME%:8080
echo Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.
.venv\Scripts\python.exe server.py
pause
