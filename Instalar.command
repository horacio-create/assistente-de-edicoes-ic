#!/bin/zsh
# Indoor Channel — instalação no macOS (duplo clique no Finder).
cd "$(dirname "$0")" || exit 1
echo "Preparando Indoor Channel..."

PY=""
for c in python3.13 python3.12 python3; do
  for dir in /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin ""; do
    exe="${dir:+$dir/}$c"
    if command -v "$exe" >/dev/null 2>&1 && "$exe" -c 'import sys; sys.exit(sys.version_info < (3, 12))' 2>/dev/null; then
      PY="$exe"; break 2
    fi
  done
done

if [[ -z "$PY" ]] && command -v uv >/dev/null 2>&1; then
  PY="$(uv python find '>=3.12' 2>/dev/null)"
fi

if [[ -z "$PY" ]]; then
  echo "Instale Python 3.12 ou superior de https://www.python.org/downloads/macos/"
  echo "(ou pelo Homebrew: brew install python@3.12) e abra este arquivo novamente."
  read -k1 "?Pressione uma tecla para fechar."
  exit 1
fi

echo "Usando $("$PY" --version) em $PY"
if "$PY" -m venv .venv && .venv/bin/python -m pip install -r requirements.txt; then
  echo
  echo "Instalação concluída. Abra Iniciar.command para usar a aplicação."
  read -k1 "?Pressione uma tecla para fechar."
  exit 0
fi
echo "A instalação não foi concluída. Confira a conexão com a internet e o Python."
read -k1 "?Pressione uma tecla para fechar."
exit 1
