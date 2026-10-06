#!/bin/zsh
# Indoor Channel — iniciar no macOS (duplo clique no Finder).
cd "$(dirname "$0")" || exit 1
if [[ ! -x .venv/bin/python ]]; then
  echo "Abra Instalar.command primeiro."
  read -k1 "?Pressione uma tecla para fechar."
  exit 1
fi
PORT="${INDOOR_PORT:-8080}"
echo "Abra http://localhost:$PORT no Chrome ou Edge."
echo "Colegas na rede: http://$(scutil --get LocalHostName 2>/dev/null || hostname -s).local:$PORT"
echo "Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C."
(sleep 2; open "http://localhost:$PORT") &
.venv/bin/python server.py
read -k1 "?Servidor encerrado. Pressione uma tecla para fechar."
