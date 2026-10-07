param(
    [string]$AppRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$Output = (Join-Path (Get-Location) 'Indoor Channel.exe'),
    [string]$WorkDir = (Join-Path (Get-Location) 'portable-build'),
    [string]$Python = 'python'
)
$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path -LiteralPath $AppRoot).Path
& (Join-Path $AppRoot 'Instalar-video.ps1')
$WorkDir = [IO.Path]::GetFullPath($WorkDir)
$Output = [IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
function Download-IfMissing($Url, $Path) {
    if (!(Test-Path -LiteralPath $Path)) {
        & curl.exe -fL --retry 2 -o $Path $Url
        if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar $Url" }
    }
}
Download-IfMissing 'https://github.com/astral-sh/python-build-standalone/releases/download/20260929/cpython-3.12.14%2B20260929-x86_64-pc-windows-msvc-install_only_stripped.tar.gz' (Join-Path $WorkDir 'python.tar.gz')
Download-IfMissing 'https://github.com/mstorsjo/llvm-mingw/releases/download/20260922/llvm-mingw-20260922-ucrt-x86_64.zip' (Join-Path $WorkDir 'llvm-mingw.zip')
Download-IfMissing 'https://github.com/richgel999/miniz/releases/download/3.0.2/miniz-3.0.2.zip' (Join-Path $WorkDir 'miniz.zip')
if (!(Test-Path (Join-Path $WorkDir 'python/python.exe'))) {
    & tar.exe -xzf (Join-Path $WorkDir 'python.tar.gz') -C $WorkDir
    if ($LASTEXITCODE -ne 0) { throw 'Falha na extração do Python' }
}
$Compiler = Join-Path $WorkDir 'compiler/llvm-mingw-20260922-ucrt-x86_64/bin'
if (!(Test-Path (Join-Path $Compiler 'x86_64-w64-mingw32-gcc.exe'))) {
    Expand-Archive -LiteralPath (Join-Path $WorkDir 'llvm-mingw.zip') -DestinationPath (Join-Path $WorkDir 'compiler')
}
if (!(Test-Path (Join-Path $WorkDir 'miniz/miniz.c'))) {
    Expand-Archive -LiteralPath (Join-Path $WorkDir 'miniz.zip') -DestinationPath (Join-Path $WorkDir 'miniz')
}
& $Python -m pip download -r (Join-Path $AppRoot 'requirements.txt') --platform win_amd64 --python-version 3.12 --only-binary=:all: -d (Join-Path $WorkDir 'wheels') -q
if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar bibliotecas' }
& $Python -m pip download msvc-runtime==14.44.35112 --platform win_amd64 --python-version 3.12 --only-binary=:all: --no-deps -d (Join-Path $WorkDir 'wheels') -q
if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar runtime MSVC' }
$Build = Join-Path $WorkDir ('build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Build | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launcher/launcher.c'),(Join-Path $PSScriptRoot 'launcher/res.rc'),(Join-Path $PSScriptRoot 'launcher/icon.ico'),(Join-Path $WorkDir 'miniz/miniz.c'),(Join-Path $WorkDir 'miniz/miniz.h') -Destination $Build
Push-Location $Build
try {
    & (Join-Path $Compiler 'x86_64-w64-mingw32-windres.exe') res.rc -O coff -o res.o
    if ($LASTEXITCODE -ne 0) { throw 'Falha no recurso do ícone' }
    & (Join-Path $Compiler 'x86_64-w64-mingw32-gcc.exe') -Os -s -municode -mwindows -o launcher.exe launcher.c miniz.c res.o -static -lgdi32 -luser32
    if ($LASTEXITCODE -ne 0) { throw 'Falha na compilação do lançador' }
} finally { Pop-Location }
& $Python (Join-Path $PSScriptRoot 'build_payload.py') $AppRoot $WorkDir $Build $Output
if ($LASTEXITCODE -ne 0) { throw 'Falha ao montar executável' }
Get-Item -LiteralPath $Output | Select-Object FullName, Length
