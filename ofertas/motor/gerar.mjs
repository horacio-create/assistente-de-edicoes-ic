// Uso: node gerar.mjs <pasta-do-template> [dados.json] [-o saida.mp4]
// Sem dados.json, gera com os valores padrão do template.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, renameSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validarTemplate, prepararDados, dadosPadrao } from "./contrato.mjs";
import { hyperframes } from "./hyperframes.mjs";

const args = process.argv.slice(2);
const iSaida = args.indexOf("-o");
const saida = resolve(iSaida >= 0 ? args.splice(iSaida, 2)[1] : "video.mp4");
const [dirTemplate, arquivoDados] = args;
if (!dirTemplate) {
  console.error("Uso: node gerar.mjs <pasta-do-template> [dados.json] [-o saida.mp4]");
  process.exit(2);
}

// O GSAP do CDN padrão vira arquivo local: o render não depende de internet.
const GSAP = fileURLToPath(new URL("./node_modules/gsap/dist/gsap.min.js", import.meta.url));
const GSAP_VERSAO = JSON.parse(readFileSync(new URL("./node_modules/gsap/package.json", import.meta.url))).version;
function usarGsapLocal(dir) {
  const arquivo = join(dir, "index.html");
  const html = readFileSync(arquivo, "utf8");
  const cdn = new RegExp(`https://cdn\\.jsdelivr\\.net/npm/gsap@${GSAP_VERSAO.replace(/\./g, "\\.")}/dist/gsap\\.min\\.js`, "g");
  if (!cdn.test(html)) return;
  copyFileSync(GSAP, join(dir, "gsap.min.js"));
  writeFileSync(arquivo, html.replace(cdn, "gsap.min.js"));
}

const falhar = (titulo, erros) => {
  console.error(`\n✗ ${titulo}:\n\n  - ${erros.join("\n  - ")}\n`);
  process.exit(1);
};

const { erros: errosTemplate, template } = validarTemplate(resolve(dirTemplate));
if (errosTemplate.length) falhar("Template inválido — rode validar-template", errosTemplate);

const dados = arquivoDados ? JSON.parse(readFileSync(arquivoDados, "utf8")) : dadosPadrao(template);
const baseDir = arquivoDados ? dirname(resolve(arquivoDados)) : template.dir;
const { variaveis, copias, erros } = prepararDados(template, dados, baseDir);
if (erros.length) falhar("Dados inválidos — nada foi gerado", erros);

// cópia isolada do template: o template original nunca é alterado
const trabalho = mkdtempSync(join(tmpdir(), `fabrica-${template.meta.id}-`));
try {
  cpSync(template.dir, trabalho, {
    recursive: true,
    filter: (p) => !/[/\\](snapshots|renders|node_modules|\.hyperframes)([/\\]|$)/.test(p),
  });
  usarGsapLocal(trabalho);
  mkdirSync(join(trabalho, "entrada"), { recursive: true });
  for (const { de, para } of copias) copyFileSync(de, join(trabalho, para));
  writeFileSync(join(trabalho, "variaveis.json"), JSON.stringify(variaveis, null, 2));

  console.log(`▶ Gerando "${template.meta.nome}"…`);
  const r = hyperframes(["render", "--variables-file", "variaveis.json", "--strict-variables", "-o", "saida.mp4"], trabalho);
  if (!r.ok) falhar("Render falhou", ["veja o log acima"]);
  mkdirSync(dirname(saida), { recursive: true });
  try {
    renameSync(join(trabalho, "saida.mp4"), saida);
  } catch {
    copyFileSync(join(trabalho, "saida.mp4"), saida); // outro disco
  }
  console.log(`✓ ${basename(saida)} gerado em ${dirname(saida)}`);
} finally {
  rmSync(trabalho, { recursive: true, force: true });
}
