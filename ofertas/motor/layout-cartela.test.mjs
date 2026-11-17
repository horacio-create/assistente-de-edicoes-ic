// O layout de uma cartela não depende dos outros produtos do pedido: o editor (todos os produtos do encarte)
// e cada vídeo (só parte deles) precisam desenhar a mesma cartela do mesmo jeito.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const templates = fileURLToPath(new URL("../templates/", import.meta.url));
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });

// Produto falso com as medidas que o layout lê; o título ocupa mais linhas quanto maior o texto.
function produto(painel, nome, normal) {
  const no = (extra = {}) => Object.defineProperties({ style: {} }, Object.getOwnPropertyDescriptors(extra));
  const partes = {
    ".nome": no({ get offsetHeight() { const fonte = parseFloat(this.style.fontSize) || 30; return Math.ceil(nome.length * fonte * .6 / 400) * fonte * 1.12; } }),
    ".selo": no({ offsetHeight: 175 }),
    ".de": normal ? no({ offsetWidth: 120 + normal.length * 40, offsetHeight: 90 }) : null,
    ".foto-box": no(), ".foto": no(), ".precos": no(),
    ".seta": no({ querySelector: () => ({ setAttribute() {} }) }),
  };
  return { style: {}, dataset: {}, clientWidth: 900, clientHeight: 520, parentElement: { clientWidth: 900 },
    closest: (sel) => (sel === ".painel" ? painel : null), querySelector: (sel) => partes[sel] ?? null, partes };
}
const desenho = (p) => JSON.stringify(Object.fromEntries(Object.entries(p.partes).map(([k, v]) => [k, v?.style])));

for (const pasta of readdirSync(templates).filter((n) => n.endsWith("-flexivel"))) {
  test(`${pasta}: cartela igual no editor e no vídeo`, () => {
    delete require.cache[require.resolve(`${templates}${pasta}/assets/layout.js`)];
    require(`${templates}${pasta}/assets/layout.js`);
    const { organizar } = globalThis.LayoutOfertas;
    const cartela = (painel) => [produto(painel, "Tekitos Tradicional Seara 300g", "11,99"), produto(painel, "Galinha Tijuca Congelada Kg", "8,99")];
    // vídeo: só a cartela do Tekitos
    const sozinha = cartela({});
    organizar(sozinha, true);
    // editor: a mesma cartela junto de outra com título muito longo
    const outra = { };
    const longo = produto(outra, "Biscoito Recheado Sortido Sabores Morango Chocolate Baunilha e Limão Pacote Família 400g", "125,99");
    const junto = cartela({});
    organizar([longo, produto(outra, "Arroz 5kg", "25,99"), ...junto], true);
    assert.deepEqual(junto.map(desenho), sozinha.map(desenho));
  });
}
