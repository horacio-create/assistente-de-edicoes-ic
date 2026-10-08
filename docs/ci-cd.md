# Raio-x: pipeline de CI/CD

## 1. Motivação

Até o commit `02172ee`, publicar uma versão do Assistente de Edições era manual: alguém copiava o código para a VM do Google Cloud e rodava `docker compose -f deploy/compose.yaml up -d --build` dentro da pasta do sistema (`~/assistente-de-edicoes`). Nada garantia que os testes tinham passado, não havia backup automático antes de trocar a versão e, se o container novo não subisse, o site ficava fora do ar até alguém perceber.

A pipeline resolve três coisas:

1. **CI:** todo PR e todo push rodam os testes com as dependências reais (FFmpeg e motor de Ofertas), para eles não se pularem em silêncio, além do build da imagem.
2. **CD:** um push na `main` com tudo verde é publicado sozinho.
3. **Deploy seguro:** backup do código e do banco antes de trocar, checagem de saúde depois e volta automática para a versão anterior se a checagem falhar.

Decisões tomadas com o usuário:

| Decisão | Escolha | Alternativas descartadas |
|---|---|---|
| Como a CI entra na VM | Chave SSH **exclusiva da CI**, presa a um único script (`command=` no `authorized_keys`) | Workload Identity Federation (sem segredo, mas exige pool de identidade e conta de serviço no GCP); VM puxando da `main` por timer (o GitHub não veria o resultado) |
| Disparo | Automático em push na `main` com CI verde | Aprovação manual (environment com revisores) |
| Onde se constrói a imagem | Na própria VM, como antes | Na CI, publicada no GHCR (exigiria um token de leitura do registry na VM) |

## 2. Fluxo

```
PR ou push ──▶ GitHub Actions (.github/workflows/ci-cd.yml)
                 ├─ job testes : Python 3.12 + FFmpeg + Node 22 + motor de Ofertas
                 │               npm test (contrato) · node tests/test_undo.cjs · unittest discover
                 └─ job imagem : docker build deploy/Dockerfile (não publica)
                        │ ambos verdes, push na main e vars.DEPLOY_HOST definida
                        ▼
                 job deploy (environment production, um por vez)
                   git archive HEAD (tar.gz) ──ssh──▶ VM: authorized_keys com command=
                                                        └▶ ~/bin/deploy-assistente.sh
                                                             1. valida "deploy <sha>" e o pacote
                                                             2. backup ~/deploys/codigo-<ts>.tgz
                                                             3. backup /dados/backups/historico-<ts>.sqlite
                                                             4. extrai o código, grava .versao-no-ar
                                                             5. docker compose up -d --build
                                                             6. saúde: /api/info + /login.html em 127.0.0.1:8080
                                                                ├ ok    → limpa backups antigos, exit 0
                                                                └ falha → volta a pasta anterior, sobe, exit 1
                   curl https://assistente-edicao.indoorchannel.com.br/api/info  (conferência pública)
```

## 3. Arquivos

| Arquivo | Papel |
|---|---|
| `.github/workflows/ci-cd.yml` | A pipeline: jobs `testes`, `imagem` e `deploy` |
| `deploy/deploy-vm.sh` | O script que roda na VM, com backup, publicação, saúde e volta |
| `README.md`, seção "Deploy automático (CI/CD)" | A configuração única (chave, VM, secrets) para quem administra |

Não há banco, rotas ou frontend novos: a funcionalidade é toda de infraestrutura.

## 4. CI: `.github/workflows/ci-cd.yml`

### 4.1 Gatilhos e concorrência

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:  # um PR novo cancela a CI antiga do mesmo PR; na main, nada é cancelado
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- `permissions: contents: read`: o token automático do GitHub só lê o repositório. A pipeline não precisa escrever nada no GitHub, porque o deploy usa a chave SSH própria.
- Num PR, um push novo torna obsoleta a execução anterior, que é cancelada. Na `main`, cada commit tem sua execução completa, porque cada uma pode virar um deploy.

### 4.2 Job `testes`: dependências reais para nada se pular

Vários testes se pulam quando falta uma dependência (`@unittest.skipUnless(videos.available(), 'FFmpeg required')` em `tests/test_videos.py:18`, `@unittest.skipIf(SEM_MOTOR, ...)` em `tests/test_ofertas.py:109`). Uma CI sem FFmpeg ou sem o motor ficaria verde sem testar vídeo nem Ofertas. Por isso o job instala os dois:

```yaml
      - name: FFmpeg (sem ele os testes de vídeo são pulados)
        run: sudo apt-get update && sudo apt-get install -y --no-install-recommends ffmpeg
      ...
      - name: Motor de Ofertas (sem ele os testes de Ofertas são pulados)
        working-directory: ofertas/motor
        run: |
          npm ci --no-audit --no-fund
          node node_modules/hyperframes/bin/hyperframes.mjs browser ensure
```

O motor fica "pronto" quando o Node existe e `npm ci` instalou o HyperFrames (`status()` em `modules/ofertas/__init__.py:89`). O `browser ensure` repete o que o `deploy/Dockerfile` faz, para a CI usar o mesmo navegador do servidor.

A versão do Python é a da imagem (`python:3.12-slim-bookworm`); o comentário no YAML amarra as duas:

```yaml
          python-version: '3.12'  # a mesma do deploy/Dockerfile
```

Ordem dos testes: contrato dos templates (`npm test` em `ofertas/motor`), teste JS de desfazer (`node tests/test_undo.cjs`) e a suíte Python inteira (`python -m unittest discover -s tests`), rodada da raiz, como no README. Antes do commit, esses mesmos comandos rodaram localmente: 172 testes Python passaram, mais os 12 do motor e o `test_undo`. O único erro local foi o `tests/test_desktop_paths.py`, que não está no git, então nem existe no checkout da CI.

### 4.3 Job `imagem`: o Dockerfile ainda constrói?

```yaml
      - name: Build da imagem do servidor (não publica; o deploy constrói na VM)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/Dockerfile
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Como o build de produção acontece na VM (decisão do usuário), a imagem da CI é jogada fora. O job existe para pegar um Dockerfile quebrado, um `requirements.txt` impossível ou um `package-lock.json` inconsistente **antes** do deploy, e não no meio dele. O cache do GitHub Actions (`type=gha`) evita refazer as camadas pesadas (apt, Node, Chrome) a cada execução.

### 4.4 Job `deploy`

```yaml
  deploy:
    needs: [testes, imagem]
    # pulado (não falha) até a configuração única do README existir: variável DEPLOY_HOST e secrets
    if: github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.DEPLOY_HOST != ''
    ...
    environment:
      name: production
      url: https://assistente-edicao.indoorchannel.com.br
    concurrency:  # dois pushes seguidos: o segundo espera o primeiro terminar
      group: deploy-production
      cancel-in-progress: false
```

- **`needs`:** só publica se os dois jobs passarem.
- **`vars.DEPLOY_HOST != ''`:** sem a configuração, o job aparece como *skipped* em vez de falhar a cada push e deixar a `main` vermelha sem defeito real. Foi o que aconteceu na primeira execução (run `37785886959`): testes ✅, imagem ✅, deploy pulado.
- **`environment: production`:** dá um histórico de deploys na aba Environments do GitHub e permite, no futuro, exigir aprovação sem mexer no YAML.
- **`cancel-in-progress: false`:** cancelar um deploy no meio poderia deixar a VM entre duas versões. Pushes seguidos entram em fila.

Os passos:

```yaml
      - name: Chave SSH do deploy
        ...
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/deploy && chmod 600 ~/.ssh/deploy
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts  # host fixo: sem ssh-keyscan às cegas
      - name: Enviar o código e publicar
        ...
        run: |
          git archive --format=tar.gz HEAD |
            ssh -i ~/.ssh/deploy -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20 \
              "$DEPLOY_USER@$DEPLOY_HOST" deploy "$GITHUB_SHA"
```

- **`DEPLOY_KNOWN_HOSTS` vem de um secret, não de `ssh-keyscan` na hora**, e o SSH roda com `StrictHostKeyChecking=yes`. Um `ssh-keyscan` na CI aceitaria qualquer máquina que respondesse naquele IP. Com a impressão digital fixada, a CI recusa um impostor em vez de entregar o código a ele.
- **`git archive HEAD`** envia exatamente os arquivos versionados do commit. Nada de `.venv`, `dados/`, `node_modules` ou arquivos locais soltos.
- **O comando passado ao `ssh` é só `deploy <sha>`.** Quem decide o que roda é a VM (seção 5.1), não a CI.

Por fim, uma conferência pelo endereço público, já passando pelo Caddy e pelo HTTPS:

```yaml
          curl -fsS --retry 5 --retry-delay 5 https://assistente-edicao.indoorchannel.com.br/api/info | tee /dev/stderr | grep -q '"auth": true'
```

`/api/info` sem sessão responde `{"version": ..., "auth": true, "user": null}` (`server.py`, rota `/api/info`). Exigir `"auth": true` confirma, de fora, que a versão no ar está com o login ligado.

## 5. CD: `deploy/deploy-vm.sh`

### 5.1 Por que o script fica fora da pasta do código e por que a chave fica presa a ele

O README manda copiar o script para `~/bin/deploy-assistente.sh` e autorizar a chave da CI assim:

```
command="/home/<usuario-da-vm>/bin/deploy-assistente.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty <chave pública>
```

- Com `command=`, o `sshd` **ignora** o que o cliente pediu para executar e sempre roda o script. O pedido original chega só na variável `SSH_ORIGINAL_COMMAND`. Se a chave vazar, ela não abre um terminal na VM: só dispara um deploy de um pacote que precisa passar na validação (5.2). As opções `no-*` tiram túneis, encaminhamento de agente e terminal.
- O script fica **fora** de `~/assistente-de-edicoes` porque o deploy sobrescreve essa pasta. Se ele morasse lá, um commit poderia reescrever o próprio script que o está executando, e uma versão defeituosa do script poderia travar todos os deploys seguintes. O custo é que mudar `deploy/deploy-vm.sh` exige repetir a cópia à mão (avisado no README).

### 5.2 Validação da entrada

```bash
read -r acao sha resto <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [[ "${acao:-}" != deploy || ! "${sha:-}" =~ ^[0-9a-f]{7,40}$ || -n "${resto:-}" ]]; then
  echo "uso: deploy <sha do commit>" >&2; exit 2
fi

mkdir -p "$BACKUPS"
exec 9>"$BACKUPS/.lock"
flock -n 9 || { echo "Outro deploy está em andamento." >&2; exit 75; }
```

- Só aceita exatamente `deploy` + um hash hexadecimal + nada depois. O `sha` aparece depois em nomes de arquivo (`release-<ts>-<sha>.tgz`), então a validação também impede caminhos ou caracteres estranhos ali.
- `flock -n` é um trava de segurança extra. O GitHub já serializa os deploys (`concurrency`), mas o script também pode ser chamado à mão (passo 5 do README). Dois deploys simultâneos misturariam arquivos de versões diferentes na mesma pasta.

```bash
cat > "$release"
tar -tzf "$release" server.py deploy/compose.yaml >/dev/null 2>&1 || { rm -f "$release"; echo "O pacote recebido não é o código do sistema." >&2; exit 65; }
```

O pacote chega pelo stdin. Antes de tocar em qualquer coisa, o script confere se é um tar.gz que contém `server.py` e `deploy/compose.yaml`. Um pacote truncado (conexão caída no meio) ou errado é recusado e apagado.

### 5.3 Backups

```bash
# a pasta inteira (inclui deploy/.env e o que não está no git): a volta restaura exatamente o que estava no ar
tar czf "$anterior" -C "$(dirname "$APP")" "$(basename "$APP")"
```

O backup do código é da **pasta inteira**, não do commit anterior. Assim, a volta restaura também o que não está no git e existe só no servidor, como um eventual `deploy/.env` (ignorado pelo `.gitignore`).

```bash
if docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  docker exec -i "$CONTAINER" python - "$ts" <<'PY'
import os, sqlite3, sys
pasta = os.path.join(os.environ.get('INDOOR_DATA', '/dados'), 'backups')
...
copia = sqlite3.connect(destino); origem.backup(copia); copia.close()
PY
```

O banco é copiado com `sqlite3.backup()`, a cópia online do próprio SQLite, que é consistente mesmo com o sistema gravando no meio (o banco usa WAL). Copiar o arquivo com `cp` poderia pegar um estado pela metade. O backup roda **dentro** do container porque o banco está num volume Docker (`dados:/dados`), não numa pasta comum da VM. Se o container estiver parado, o deploy segue com um aviso, já que bloquear justamente o deploy que vai consertar um container caído seria pior.

### 5.4 Publicação, saúde e volta

```bash
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
  if subir && saudavel; then log "voltou para a versão anterior (no ar)"; else log "ERRO: ..."; fi
  exit 1
fi
```

- **Saúde, duas checagens:** `/api/info` prova que o Python subiu e responde JSON; `/login.html` prova que os estáticos estão sendo servidos (o sistema exige login, então a página de login é o que um usuário vê primeiro). As duas vão direto em `127.0.0.1:8080`, porque o compose só publica a porta 8080 na própria VM; o Caddy fica de fora, e o HTTPS é conferido depois, pela CI. São 45 tentativas a cada 2 s (`TENTATIVAS`), cerca de 90 s, para cobrir a inicialização do container.
- **A volta é uma troca de pasta inteira, não "extrair o antigo por cima".** O código que falhou vai para `~/assistente-de-edicoes.falhou` e o backup é extraído limpo. Extrair por cima deixaria arquivos novos da versão quebrada misturados com a antiga.
- **`exit 1` mesmo quando a volta dá certo.** A CI precisa ficar vermelha: o commit não está no ar, e alguém precisa olhar.
- **O banco não volta sozinho.** As migrações deste sistema só acrescentam colunas e tabelas (`ALTER TABLE ... ADD COLUMN` em `storage.init`, `auth.init`, `ofertas.garantir`), então a versão anterior continua lendo o banco migrado. Restaurar o banco automaticamente apagaria o que os usuários gravaram entre o deploy e a volta. A cópia fica em `/dados/backups` para uma restauração consciente, à mão.

**Exemplo, do teste local com simulações** (`docker`, `curl` e `flock` substituídos por scripts falsos, com a pasta do app numa área temporária):

| Cenário | Entrada | Resultado |
|---|---|---|
| Deploy bom | `deploy abc1234def` + pacote com `print('novo')` | exit 0; `server.py` = novo; `.versao-no-ar` = `abc1234def`; `deploy/.env` preservado |
| Saúde falha | `deploy 9999999aaa` + pacote "quebrado" (o `curl` simulado falha) | exit 1; no ar continua `print('novo')` / `abc1234def`; o quebrado fica em `.falhou`; `.env` preservado |
| Comando inválido | `SSH_ORIGINAL_COMMAND="rm -rf /"` | exit 2, nada tocado |
| Pacote corrompido | stdin = `lixo` comprimido | exit 65, pacote apagado, nada tocado |

### 5.5 Retenção

```bash
ls -1t "$BACKUPS"/release-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
ls -1t "$BACKUPS"/codigo-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
docker exec "$CONTAINER" sh -c 'ls -1t /dados/backups/historico-*.sqlite 2>/dev/null | tail -n +11 | xargs -r rm -f' || true
```

Ficam os 5 últimos pacotes e backups de código (cerca de 8 MB cada) e os 10 últimos backups do banco. A limpeza só roda depois de um deploy bem-sucedido: um deploy que falhou nunca apaga backups.

## 6. Configuração única (README)

O README lista seis passos para quem administra a VM e o GitHub:

1. gerar a chave da CI;
2. copiar o script para `~/bin`;
3. autorizar a chave com `command=`;
4. cadastrar no GitHub os secrets `DEPLOY_SSH_KEY` e `DEPLOY_KNOWN_HOSTS` e as variables `DEPLOY_HOST` e `DEPLOY_USER`;
5. testar do próprio computador;
6. apagar a chave local.

O `DEPLOY_KNOWN_HOSTS` deve ser conferido com a impressão digital lida **dentro** da VM, pela mesma razão do `StrictHostKeyChecking` (4.4).

## 7. Verificação feita

- `bash -n` no script; o YAML do workflow carregado sem erro (`ruby -ryaml`).
- Os quatro cenários da seção 5.4, com simulações.
- Comandos de teste da CI rodados localmente (172 testes Python, 12 do motor, `test_undo`).
- Primeira execução real no GitHub, [run 37785886959](https://github.com/horacio-create/assistente-de-edicoes-ic/actions/runs/37785886959): `testes` e `imagem` com sucesso; `deploy` pulado (configuração ainda não feita).
- **Ainda não verificado:** um deploy real pela CI na VM, que depende da configuração única.

## 8. Lacunas conhecidas

1. **O deploy real ainda não rodou.** Riscos que só aparecem lá:
   - se a VM usa OS Login, o `authorized_keys` pode ser ignorado e o SSH da CI vai dar "Permission denied";
   - a porta 22 da VM precisa aceitar conexões dos runners do GitHub (faixas de IP grandes e variáveis), e uma regra de firewall restrita barra o deploy.
   
   O passo 5 do README testa o primeiro; o segundo só aparece na primeira execução da CI.
2. **Arquivos apagados do git continuam na VM.** O deploy extrai por cima (comentário `ponytail:` no script). Um módulo removido do repositório continua na pasta, inofensivo na maioria dos casos, mas a pasta vai acumulando lixo. A correção seria extrair numa pasta nova e trocar, preservando `deploy/.env`.
3. **A saúde não confere a versão.** `/api/info` não devolve o commit, então a checagem prova que *algo* subiu, não que é o `sha` novo. Na prática, um build com falha faz o `docker compose up --build` sair com erro antes da checagem, mas expor `.versao-no-ar` em `/api/info` fecharia essa lacuna.
4. **A conferência pública depende da formatação do JSON.** `grep -q '"auth": true'` assume o separador padrão do `json.dumps` (`": "`). Mudar a serialização para JSON compacto quebraria o passo sem defeito real. Um `python -c`/`jq` lendo o campo seria mais robusto.
5. **O build da CI não é o build do deploy.** A imagem da CI só valida o Dockerfile. A VM constrói de novo, com outro cache e outra rede: um `npm ci` ou download do Chrome pode falhar só na VM. Nesse caso a volta automática cobre, mas o deploy falha.
6. **O script da VM não se atualiza sozinho.** Mudanças em `deploy/deploy-vm.sh` só valem depois de repetir o passo 2 do README; até lá, a VM roda a versão antiga do script sem aviso.
7. **Os testes de navegador não estão na CI.** Os `tests/*_browser.cjs` usam Playwright com `channel: 'msedge'` e não entram no job `testes`. Telas e fluxos de interface (abas, escala livre, login) só são testados à mão ou localmente.
8. **`$APP.falhou` guarda só a última falha.** Duas falhas seguidas sobrescrevem a primeira.
9. **O backup do banco é pulado com o container parado.** É uma escolha (5.3), mas um deploy que conserta um container caído sai sem cópia do banco daquele momento.
