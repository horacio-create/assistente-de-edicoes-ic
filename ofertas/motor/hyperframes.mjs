// Executa o HyperFrames fixado no package.json do motor (todos os templates usam a mesma versão).
// Chama o Node direto com o script do pacote: node_modules/.bin/hyperframes é um .cmd no Windows.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./node_modules/hyperframes/bin/hyperframes.mjs", import.meta.url));

export function hyperframes(args, cwd, { silencioso = false } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, stdio: silencioso ? "pipe" : "inherit", encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, saida: (r.stdout || "") + (r.stderr || "") };
}
