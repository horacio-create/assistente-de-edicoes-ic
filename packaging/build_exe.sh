#!/usr/bin/env bash
# Gera "Indoor Channel.exe": um único arquivo que extrai o programa para %TEMP%, abre a janela e apaga tudo ao fechar.
# Roda em Linux (ou WSL/Ubuntu). Precisa de: curl zip unzip python3 (com Pillow) pip e mingw-w64
#   sudo apt install mingw-w64 zip unzip curl python3-pip && pip install Pillow
# Uso:  ./build_exe.sh /caminho/do/app [saida.exe]
set -euo pipefail

APP="$(cd "${1:?Informe a pasta do app (a que contém server.py)}" && pwd)"
OUT="${2:-$PWD/Indoor Channel.exe}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$(mktemp -d)}"
PY_TAG="20260929"; PY_VER="3.12.14"
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PY_TAG}/cpython-${PY_VER}%2B${PY_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz"
MINIZ_URL="https://github.com/richgel999/miniz/releases/download/3.0.2/miniz-3.0.2.zip"

for tool in curl zip unzip python3 x86_64-w64-mingw32-gcc x86_64-w64-mingw32-windres; do
  command -v "$tool" >/dev/null || { echo "Falta a ferramenta: $tool"; exit 1; }
done
[ -f "$APP/server.py" ] && [ -f "$APP/requirements.txt" ] || { echo "$APP não parece ser a pasta do app."; exit 1; }
echo "Trabalhando em $WORK"; cd "$WORK"

echo "1/7 Python para Windows"
curl -fsSL -A "Mozilla/5.0" -o py.tar.gz "$PY_URL"; tar xzf py.tar.gz

echo "2/7 Bibliotecas (wheels win_amd64 do requirements.txt)"
python3 -m pip download -r "$APP/requirements.txt" --platform win_amd64 --python-version 3.12 --only-binary=:all: -d wheels -q
for w in wheels/*.whl; do unzip -q -o "$w" -d python/Lib/site-packages; done

echo "3/7 Runtime do Visual C++ (a MSVCP140.dll é exigida pelo PyMuPDF)"
python3 -m pip download msvc-runtime --platform win_amd64 --python-version 3.12 --only-binary=:all: --no-deps -d mw -q
unzip -q -o -j mw/*.whl 'msvc_runtime-*.data/data/msvcp140.dll' 'msvc_runtime-*.data/data/msvcp140_1.dll' -d python/

echo "4/7 Enxugando o runtime"
( cd python && rm -rf tcl include libs Scripts Lib/test Lib/idlelib Lib/tkinter Lib/turtledemo Lib/ensurepip Lib/lib2to3 \
    Lib/site-packages/pip* Lib/site-packages/README.txt Lib/site-packages/pymupdf/mupdf-devel \
    DLLs/_tkinter.pyd DLLs/tcl* DLLs/tk* DLLs/_test*.pyd DLLs/_ctypes_test.pyd 2>/dev/null || true
  find . -name __pycache__ -prune -exec rm -rf {} + ; find Lib/site-packages -name tests -type d -prune -exec rm -rf {} + )

echo "5/7 Lançador (C, com ícone)"
curl -fsSL -A "Mozilla/5.0" -o miniz.zip "$MINIZ_URL"; unzip -q -o miniz.zip -d miniz
mkdir launcher && cp "$HERE/launcher/launcher.c" "$HERE/launcher/res.rc" miniz/miniz.c miniz/miniz.h launcher/
cp "$HERE/launcher/icon.ico" launcher/icon.ico
( cd launcher && x86_64-w64-mingw32-windres res.rc -O coff -o res.o \
  && x86_64-w64-mingw32-gcc -Os -s -municode -mwindows -o launcher.exe launcher.c miniz.c res.o -static -lgdi32 -luser32 )

echo "6/7 Montando o conteúdo embutido"
mkdir -p stage/app && cp -r python stage/python
cp "$APP"/*.py stage/app/ && cp "$APP/portable.py" stage/app/portable.py
rm -f stage/app/test_*.py
cp -r "$APP/modules" "$APP/static" stage/app/
find stage -name __pycache__ -prune -exec rm -rf {} +
( cd stage && zip -q -r -9 -X ../payload.zip python app )

echo "7/7 Gerando o executável único"
python3 - "$OUT" <<'PY'
import struct, sys
payload = open('payload.zip', 'rb').read()
with open(sys.argv[1], 'wb') as f:
    f.write(open('launcher/launcher.exe', 'rb').read())
    f.write(payload)
    f.write(b'ICPAYLD1' + struct.pack('<Q', len(payload)))
PY
ls -la "$OUT"; echo "Pronto. Você pode apagar $WORK."
