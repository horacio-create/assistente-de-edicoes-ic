$ErrorActionPreference='Stop'
$appRoot=$PSScriptRoot
$python=Join-Path $appRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Prepare o ambiente com Instalar.bat primeiro.' }
& $python -m PyInstaller --noconfirm --onedir --windowed --name 'Assistente de Edicoes' --icon "$appRoot/static/indoor.ico" --add-data "$appRoot/static;static" --add-data "$appRoot/modules;modules" --hidden-import PIL.ImageOps --collect-all pymupdf --distpath "$appRoot/dist" --workpath "$appRoot/build" --specpath "$appRoot/build" "$appRoot/portable.py"
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível gerar o pacote.' }
# Qt uses Windows ICU. The ICU from the Python runtime is incompatible.
Remove-Item -LiteralPath "$appRoot/dist/Assistente de Edicoes/_internal/icuuc.dll" -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$appRoot/dist/Assistente de Edicoes/_internal/icudt78.dll" -ErrorAction SilentlyContinue
