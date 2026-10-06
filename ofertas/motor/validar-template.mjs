// Uso: node validar-template.mjs <pasta-do-template>
// Porta de entrada de um template: contrato + `hyperframes check` + gera capa.jpg para o catálogo.
import { renameSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { validarTemplate } from "./contrato.mjs";
import { hyperframes } from "./hyperframes.mjs";

const dir = resolve(process.argv[2] || ".");
const { erros, avisos = [], template } = validarTemplate(dir);
if (erros.length) {
  console.error(`\n✗ Template inválido (${erros.length} problema(s)):\n\n  - ${erros.join("\n  - ")}\n`);
  process.exit(1);
}
console.log(`✓ Contrato ok — "${template.meta.nome}" (${template.declaracoes.length} variáveis)`);
for (const aviso of avisos) console.log(`⚠ ${aviso}`);

const check = hyperframes(["check"], dir, { silencioso: true });
if (!check.ok) {
  console.error("\n✗ hyperframes check falhou:\n");
  console.error(check.saida.split("\n").filter((l) => /✗|error|Error/.test(l)).join("\n"));
  process.exit(1);
}
console.log("✓ hyperframes check ok");

// capa para o catálogo: momento definido em template.json ("capaEm", segundos) ou 40% da duração
const duracao = Number(/id="root"[^>]*data-duration="([\d.]+)"/.exec(template.html)?.[1] || 0);
const em = template.meta.capaEm ?? +(duracao * 0.4).toFixed(2);
rmSync(join(dir, "snapshots"), { recursive: true, force: true });
const snap = hyperframes(["snapshot", "--at", String(em), "--no-end", "--describe", "false"], dir, { silencioso: true });
const frame = join(dir, "snapshots", `frame-00-at-${em}s.png`);
if (!snap.ok || !existsSync(frame)) {
  console.error("✗ Não foi possível gerar a capa.\n" + snap.saida);
  process.exit(1);
}
renameSync(frame, join(dir, "capa.png"));
rmSync(join(dir, "snapshots"), { recursive: true, force: true });
console.log(`✓ capa.png gerada (${em}s)`);
