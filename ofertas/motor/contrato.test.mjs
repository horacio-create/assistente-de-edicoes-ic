// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizarPreco, normalizarNumero, validarTemplate, prepararDados, dadosPadrao, lerTemplate } from "./contrato.mjs";

const MODELO = fileURLToPath(new URL("../templates/uniforca-hora-da-carne", import.meta.url));

// cópia do template modelo numa pasta temporária com o mesmo nome (id == pasta)
function copia(alterar) {
  const dir = join(mkdtempSync(join(tmpdir(), "contrato-")), "uniforca-hora-da-carne");
  cpSync(MODELO, dir, { recursive: true });
  alterar?.(dir);
  return dir;
}
const editar = (dir, arquivo, fn) => writeFileSync(join(dir, arquivo), fn(readFileSync(join(dir, arquivo), "utf8")));

test("normalizadores", () => {
  assert.equal(normalizarPreco("14,99"), "14,99");
  assert.equal(normalizarPreco("R$ 41.9"), "41,90");
  assert.equal(normalizarPreco("7"), "7,00");
  assert.equal(normalizarPreco("abc"), null);
  assert.equal(normalizarNumero("0,8"), 0.8);
  assert.equal(normalizarNumero("80%"), 0.8);
  assert.equal(normalizarNumero("x"), null);
});

test("template modelo cumpre o contrato", () => {
  assert.deepEqual(validarTemplate(MODELO).erros, []);
});

test("template: variável faltando, tipo errado e variável órfã", () => {
  const dir = copia((d) =>
    editar(d, "index.html", (h) =>
      h
        .replace('"id": "produtos_6_tamanho"', '"id": "sobrando"')
        .replace(/("id": "produtos_1_nome",\s*"type": )"string"/, '$1"number"'),
    ),
  );
  const erros = validarTemplate(dir).erros.join("\n");
  assert.match(erros, /"produtos_6_tamanho".*não está declarada/);
  assert.match(erros, /"produtos_1_nome": tipo "number"/);
  assert.match(erros, /"sobrando" está em index.html mas não em template.json/);
});

test("template: sub-composição e id diferente da pasta", () => {
  const dir = copia((d) => {
    editar(d, "index.html", (h) => h.replace('<div id="painel-1"', '<div data-composition-src="x.html" id="painel-1"'));
    editar(d, "template.json", (j) => j.replace('"id": "uniforca-hora-da-carne"', '"id": "outro"'));
  });
  const erros = validarTemplate(dir).erros.join("\n");
  assert.match(erros, /"id" \(outro\) deve ser igual ao nome da pasta/);
  // o id errado interrompe antes; corrigindo, aparece o erro de sub-composição
  editar(dir, "template.json", (j) => j.replace('"id": "outro"', '"id": "uniforca-hora-da-carne"'));
  assert.match(validarTemplate(dir).erros.join("\n"), /sub-composições/);
});

test("dados padrão viram variáveis sem erro", () => {
  const t = lerTemplate(MODELO);
  const { variaveis, erros, copias } = prepararDados(t, dadosPadrao(t), t.dir);
  assert.deepEqual(erros, []);
  assert.equal(Object.keys(variaveis).length, t.declaracoes.length);
  assert.equal(copias.length, 0); // imagens padrão são do próprio template
});

test("dados: erros legíveis por campo", () => {
  const t = lerTemplate(MODELO);
  const dados = dadosPadrao(t);
  dados.extra = 1;
  dados.produtos[0].por = "abc";
  dados.produtos[1].unidade = "LITRO";
  dados.produtos[2].imagem = "nao-existe.png";
  dados.produtos[3].tamanho = 5;
  dados.produtos[4].nome = "x".repeat(61);
  dados.produtos[5].de = "";
  const { erros, variaveis } = prepararDados(t, dados, t.dir);
  const txt = erros.join("\n");
  assert.match(txt, /campo "extra" não existe/);
  assert.match(txt, /Produto 1 › Preço Clube de Desconto: preço "abc" inválido/);
  assert.match(txt, /Produto 2 › Unidade: "LITRO" não é uma opção/);
  assert.match(txt, /Produto 3 › Imagem: arquivo "nao-existe.png" não encontrado/);
  assert.match(txt, /Produto 4 › Tamanho da imagem: deve ficar entre 0.3 e 1/);
  assert.match(txt, /Produto 5 › Nome: máximo de 60 caracteres/);
  assert.equal(variaveis.produtos_6_de, ""); // opcional vazio é aceito
  assert.equal(erros.length, 6);
});

test("dados: quantidade de itens da lista é fixa", () => {
  const t = lerTemplate(MODELO);
  const dados = dadosPadrao(t);
  dados.produtos.pop();
  assert.match(prepararDados(t, dados, t.dir).erros[0], /exatamente 6 itens \(recebidos 5\)/);
});

test("tamanho: fora do padrão avisa (sem bloquear); 1280×720 não avisa", () => {
  const r = validarTemplate(MODELO); // o modelo ainda é 1920×1080
  assert.deepEqual(r.erros, []);
  assert.match(r.avisos.join(), /1920×1080; o padrão é 1280×720/);
  const dir = copia((d) => editar(d, "index.html", (h) => h.replace('data-width="1920" data-height="1080"', 'data-width="1280" data-height="720"')));
  assert.deepEqual(validarTemplate(dir).avisos, []);
});

// modelo com lista variável: 4 a 6 produtos (2 ou 3 painéis), padrão 6
function variavel(min = 4, total = 6) {
  return copia((d) => {
    editar(d, "template.json", (j) => j.replace('"itens": 6,', `"itens": 6,\n      "min": ${min},`));
    editar(d, "index.html", (h) =>
      h.replace("data-composition-variables='[", `data-composition-variables='[\n  { "id": "produtos_total", "type": "number", "label": "Quantidade de produtos", "default": ${total}, "min": ${min}, "max": 6, "step": 2 },`),
    );
  });
}

test("lista variável: template válido exige produtos_total e min coerente", () => {
  assert.deepEqual(validarTemplate(variavel()).erros, []);
  assert.match(validarTemplate(variavel(3)).erros.join(), /"min" \(3\) não é múltiplo do passo \(2\)/);
  assert.match(validarTemplate(variavel(4, 5)).erros.join(), /"produtos_total": valor padrão 5 não é múltiplo do passo/);
  const semTotal = copia((d) => editar(d, "template.json", (j) => j.replace('"itens": 6,', '"itens": 6,\n      "min": 4,')));
  assert.match(validarTemplate(semTotal).erros.join(), /"produtos_total".*não está declarada/);
});

test("lista variável: aceita 4 ou 6, recusa 5 e 2; total vai para o template", () => {
  const t = lerTemplate(variavel());
  const dados = dadosPadrao(t);
  assert.equal(dados.produtos.length, 6);
  const seis = prepararDados(t, dados, t.dir);
  assert.deepEqual(seis.erros, []);
  assert.equal(seis.variaveis.produtos_total, 6);

  dados.produtos.splice(4);
  const quatro = prepararDados(t, dados, t.dir);
  assert.deepEqual(quatro.erros, []);
  assert.equal(quatro.variaveis.produtos_total, 4);
  assert.equal(Object.keys(quatro.variaveis).length, t.declaracoes.length); // os que faltam ficam com o padrão
  assert.equal(quatro.variaveis.produtos_5_nome, t.declaracoes.find((d) => d.id === "produtos_5_nome").default);

  dados.produtos.push(dados.produtos[0]);
  assert.match(prepararDados(t, dados, t.dir).erros[0], /de 4 a 6 itens, de 2 em 2 \(recebidos 5\)/);
  dados.produtos.splice(2);
  assert.match(prepararDados(t, dados, t.dir).erros[0], /recebidos 2/);
});

test("lista variável: quantidade padrão vem do default de produtos_total", () => {
  const t = lerTemplate(variavel(4, 4));
  assert.equal(dadosPadrao(t).produtos.length, 4);
});

test("lista variável com grupo.incompleto: aceita quantidade ímpar (produto sozinho no último grupo)", () => {
  const dir = variavel(1, 6);
  editar(dir, "template.json", (j) => j.replace('"tamanho": 2,', '"tamanho": 2,\n        "incompleto": true,'));
  const t = lerTemplate(dir);
  assert.deepEqual(validarTemplate(dir).erros, []);
  const dados = dadosPadrao(t);
  dados.produtos.splice(5);
  const r = prepararDados(t, dados, t.dir);
  assert.deepEqual(r.erros, []);
  assert.equal(r.variaveis.produtos_total, 5);
});
