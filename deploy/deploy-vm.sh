#!/usr/bin/env bash
# Deploy do Assistente de Edições na VM, chamado pela CI (.github/workflows/ci-cd.yml) por SSH.
#
# Instalação única na VM (README, "Deploy automático"): copiar para ~/bin/deploy-assistente.sh e prender a chave
# da CI a ele em ~/.ssh/authorized_keys com command="…". Assim a chave só consegue rodar este script.
# Fica fora da pasta do código de propósito: um deploy não reescreve o próprio script que o executa.
#
# Entrada: o código (tar.gz do git archive) pelo stdin e SSH_ORIGINAL_COMMAND="deploy <sha do commit>".
# Passos: backup do código e do banco → código novo → docker compose up --build → checagem de saúde.
# Se a checagem falhar, volta o código anterior inteiro e sobe de novo. O banco não volta sozinho (as migrações só
# acrescentam colunas); a cópia fica em /dados/backups para restaurar à mão se for preciso.
set -euo pipefail

APP="${APP:-$HOME/assistente-de-edicoes}"
BACKUPS="${BACKUPS:-$HOME/deploys}"
CONTAINER="${CONTAINER:-assistente-edicoes}"
SAUDE="${SAUDE:-http://127.0.0.1:8080}"
TENTATIVAS="${TENTATIVAS:-45}"   # × 2 s

read -r acao sha resto <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [[ "${acao:-}" != deploy || ! "${sha:-}" =~ ^[0-9a-f]{7,40}$ || -n "${resto:-}" ]]; then
  echo "uso: deploy <sha do commit>" >&2; exit 2
fi

mkdir -p "$BACKUPS"
exec 9>"$BACKUPS/.lock"
flock -n 9 || { echo "Outro deploy está em andamento." >&2; exit 75; }

ts=$(date +%Y%m%d-%H%M%S)
release="$BACKUPS/release-$ts-${sha:0:12}.tgz"
anterior="$BACKUPS/codigo-$ts.tgz"
log() { echo "[deploy $ts] $*"; }

cat > "$release"
tar -tzf "$release" server.py deploy/compose.yaml >/dev/null 2>&1 || { rm -f "$release"; echo "O pacote recebido não é o código do sistema." >&2; exit 65; }
log "código recebido ($(du -h "$release" | cut -f1)), commit ${sha:0:12}"

# a pasta inteira (inclui deploy/.env e o que não está no git): a volta restaura exatamente o que estava no ar
tar czf "$anterior" -C "$(dirname "$APP")" "$(basename "$APP")"
log "backup do código: $anterior"

if docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  docker exec -i "$CONTAINER" python - "$ts" <<'PY'
import os, sqlite3, sys
pasta = os.path.join(os.environ.get('INDOOR_DATA', '/dados'), 'backups')
os.makedirs(pasta, exist_ok=True)
origem, destino = sqlite3.connect(os.path.join(os.path.dirname(pasta), 'historico.sqlite')), os.path.join(pasta, f'historico-{sys.argv[1]}.sqlite')
copia = sqlite3.connect(destino); origem.backup(copia); copia.close()
print('[deploy] backup do banco:', destino)
PY
else
  log "AVISO: container parado; deploy segue sem backup do banco"
fi

subir() { (cd "$APP" && docker compose -f deploy/compose.yaml up -d --build); }
saudavel() {
  for _ in $(seq "$TENTATIVAS"); do
    if curl -fsS -m 5 "$SAUDE/api/info" 2>/dev/null | grep -q '"version"' && curl -fsS -m 5 -o /dev/null "$SAUDE/login.html"; then return 0; fi
    sleep 2
  done
  return 1
}

# ponytail: extrai por cima, como no deploy manual; arquivo apagado do git continua na pasta até a próxima limpeza à mão
tar xzf "$release" -C "$APP"
echo "$sha" > "$APP/.versao-no-ar"

if subir && saudavel; then
  log "no ar: ${sha:0:12}"
else
  log "FALHOU: voltando para o código anterior"
  rm -rf "$APP.falhou"; mv "$APP" "$APP.falhou"   # o código que falhou fica em .falhou para investigar
  tar xzf "$anterior" -C "$(dirname "$APP")"
  if subir && saudavel; then log "voltou para a versão anterior (no ar)"; else log "ERRO: a versão anterior também não respondeu; veja docker logs $CONTAINER"; fi
  exit 1
fi

# guarda os 5 últimos pacotes e backups de código, e os 10 últimos backups do banco
ls -1t "$BACKUPS"/release-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
ls -1t "$BACKUPS"/codigo-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
docker exec "$CONTAINER" sh -c 'ls -1t /dados/backups/historico-*.sqlite 2>/dev/null | tail -n +11 | xargs -r rm -f' || true
