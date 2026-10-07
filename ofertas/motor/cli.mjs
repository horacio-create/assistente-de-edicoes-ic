// Interface JSON do motor para o servidor (stdout = JSON; código de saída 0 mesmo com erros de dados).
//   node cli.mjs catalogo <pasta-templates>
//   node cli.mjs esquema  <pasta-do-template>
//   node cli.mjs preparar <pasta-do-template> <baseDir>   (dados.json pela entrada padrão)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { validarTemplate, prepararDados, esquema } from "./contrato.mjs";

const [comando, alvo, baseDir] = process.argv.slice(2);
const saida = (obj) => process.stdout.write(JSON.stringify(obj));

if (comando === "catalogo") {
  const pasta = resolve(alvo);
  const itens = readdirSync(pasta, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => {
      const dir = join(pasta, e.name);
      const { erros, template } = validarTemplate(dir);
      return {
        id: e.name,
        nome: template?.meta?.nome || e.name,
        cliente: template?.meta?.cliente || "",
        descricao: template?.meta?.descricao || "",
        capa: existsSync(join(dir, "capa.png")),
        erros,
      };
    });
  saida(itens);
} else if (comando === "esquema") {
  const { erros, template } = validarTemplate(resolve(alvo));
  saida(erros.length ? { erros } : { ...esquema(template), erros: [] });
} else if (comando === "preparar") {
  const { erros, template } = validarTemplate(resolve(alvo));
  if (erros.length) saida({ erros, detalhes: [], variaveis: {}, copias: [] });
  else saida(prepararDados(template, JSON.parse(readFileSync(0, "utf8")), resolve(baseDir || ".")));
} else {
  process.stderr.write("comandos: catalogo | esquema | preparar\n");
  process.exit(2);
}
