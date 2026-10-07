// Contrato de template da Fábrica de Vídeos (versão 1) — ver CONTRATO.md.
// Valida templates e converte os dados do formulário nas variáveis do HyperFrames.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";

export const VERSAO_CONTRATO = 1;
// Tamanho recomendado: o sistema entrega vídeos em 720p. Templates maiores funcionam, mas renderizam
// mais devagar (o Chrome captura cada quadro no tamanho declarado) e geram arquivos maiores.
export const TAMANHOS_RECOMENDADOS = [[1280, 720], [720, 1280]];

// Tamanho declarado na composição raiz (data-width/data-height do elemento com data-composition-id).
export function tamanhoComposicao(html) {
  const tag = /<[a-z]+\b[^>]*\bdata-composition-id=[^>]*>/i.exec(html)?.[0] ?? "";
  const num = (nome) => Number(new RegExp(`\\b${nome}="(\\d+)"`).exec(tag)?.[1] || 0);
  return { largura: num("data-width"), altura: num("data-height") };
}

// tipo do contrato -> tipo de variável HyperFrames
const TIPOS = {
  texto: "string",
  preco: "string",
  imagem: "string",
  numero: "number",
  opcoes: "enum",
  cor: "color",
  booleano: "boolean",
  lista: null,
};
const EXT_IMAGEM = [".png", ".jpg", ".jpeg", ".webp"];
const ID = /^[a-z][a-z0-9]*$/;

// ---------- normalizadores (aceitam o que um humano digita) ----------

// "R$ 14,99" | "14.99" | "14" | "14,9" -> "14,99"
export function normalizarPreco(bruto) {
  const s = String(bruto).replace(/R\$|\s/gi, "").replace(".", ",");
  const m = /^(\d+)(?:,(\d{1,2}))?$/.exec(s);
  return m ? `${m[1]},${(m[2] || "00").padEnd(2, "0")}` : null;
}

// 0.8 | "0,8" | "80%" -> 0.8
export function normalizarNumero(bruto) {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  const s = String(bruto).trim();
  if (!s) return null;
  const pct = s.endsWith("%");
  const n = Number(s.replace("%", "").replace(",", ".")) / (pct ? 100 : 1);
  return Number.isFinite(n) ? n : null;
}

// ---------- leitura do template ----------

const desescapar = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function lerDeclaracoes(html) {
  const tag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  const m = /data-composition-variables\s*=\s*(?:'([^']*)'|"([^"]*)")/.exec(tag);
  if (!m) return [];
  return JSON.parse(desescapar(m[1] ?? m[2]));
}

export function lerTemplate(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "template.json"), "utf8"));
  const html = readFileSync(join(dir, "index.html"), "utf8");
  return { dir: resolve(dir), meta, html, declaracoes: lerDeclaracoes(html) };
}

// Lista com quantidade variável: "min" (opcional) até "itens", sempre em grupos completos — ou de 1 em 1
// com "grupo.incompleto": o último grupo pode ficar incompleto (ex.: produto sozinho na última cartela).
// Sem "min" a quantidade é fixa (min = itens), como sempre foi.
export const minimoLista = (c) => c.min ?? c.itens;
export const passoLista = (c) => (c.grupo?.incompleto ? 1 : c.grupo?.tamanho || 1);
export const listaVariavel = (c) => c.min !== undefined && c.min !== c.itens;

// campo do contrato -> ids das variáveis HyperFrames que ele ocupa
// (lista variável ganha "<lista>_total": quantos itens vieram, para o template dividir o tempo)
export function variaveisEsperadas(campos) {
  const out = [];
  for (const c of campos) {
    if (c.tipo !== "lista") out.push({ id: c.id, campo: c, rotulo: c.rotulo });
    else {
      for (let n = 1; n <= c.itens; n++)
        for (const sub of c.campos)
          out.push({ id: `${c.id}_${n}_${sub.id}`, campo: sub, rotulo: `${c.rotuloItem || c.rotulo} ${n} › ${sub.rotulo}` });
      if (listaVariavel(c))
        out.push({ id: `${c.id}_total`, campo: { tipo: "numero", min: minimoLista(c), max: c.itens }, rotulo: `quantidade de ${c.rotulo}` });
    }
  }
  return out;
}

// ---------- validação de um valor (usada para defaults e para dados) ----------

function validarValor(campo, bruto, decl, ctx) {
  const vazio = bruto === undefined || bruto === null || String(bruto).trim() === "";
  if (vazio) {
    if (campo.opcional) return { valor: campo.tipo === "numero" ? decl?.default ?? 0 : "" };
    return { erro: "obrigatório." };
  }
  switch (campo.tipo) {
    case "texto": {
      const s = String(bruto).trim();
      if (campo.max && s.length > campo.max) return { erro: `máximo de ${campo.max} caracteres (tem ${s.length}).` };
      return { valor: s };
    }
    case "preco": {
      const p = normalizarPreco(bruto);
      return p ? { valor: p } : { erro: `preço "${bruto}" inválido — use o formato 14,99.` };
    }
    case "numero": {
      const n = normalizarNumero(bruto);
      if (n === null) return { erro: `"${bruto}" não é um número.` };
      const min = campo.min ?? decl?.min, max = campo.max ?? decl?.max;
      if ((min !== undefined && n < min) || (max !== undefined && n > max))
        return { erro: `deve ficar entre ${min} e ${max}.` };
      return { valor: n };
    }
    case "opcoes": {
      const ops = (decl?.options || []).map((o) => o.value);
      return ops.includes(bruto) ? { valor: bruto } : { erro: `"${bruto}" não é uma opção (${ops.join(", ")}).` };
    }
    case "cor":
      return /^#[0-9a-f]{6}$/i.test(bruto) ? { valor: bruto } : { erro: `cor "${bruto}" inválida — use #RRGGBB.` };
    case "booleano":
      return typeof bruto === "boolean" ? { valor: bruto } : { erro: "deve ser verdadeiro ou falso." };
    case "imagem":
      return ctx.imagem(String(bruto));
  }
  return { erro: `tipo "${campo.tipo}" desconhecido.` };
}

// ---------- validação do template ----------

export function validarTemplate(dir) {
  const erros = [];
  let t;
  try {
    t = lerTemplate(dir);
  } catch (e) {
    return { erros: [`não foi possível ler template.json/index.html: ${e.message}`] };
  }
  const { meta, html, declaracoes } = t;
  const avisos = [];

  if (meta.contrato !== VERSAO_CONTRATO) erros.push(`template.json: "contrato" deve ser ${VERSAO_CONTRATO}.`);
  if (meta.id !== basename(t.dir)) erros.push(`template.json: "id" (${meta.id}) deve ser igual ao nome da pasta (${basename(t.dir)}).`);
  if (!meta.nome) erros.push(`template.json: falta "nome".`);
  if (!Array.isArray(meta.campos) || !meta.campos.length) erros.push(`template.json: "campos" vazio.`);
  if (erros.length) return { erros, avisos, template: t };

  const checarCampo = (c, onde) => {
    if (!ID.test(c.id || "")) erros.push(`${onde}: id "${c.id}" inválido (use letras minúsculas e números, começando por letra).`);
    if (!(c.tipo in TIPOS)) erros.push(`${onde}: tipo "${c.tipo}" desconhecido (${Object.keys(TIPOS).join(", ")}).`);
    if (!c.rotulo) erros.push(`${onde}: falta "rotulo".`);
  };
  const ids = new Set();
  for (const c of meta.campos) {
    const onde = `campo "${c.id}"`;
    checarCampo(c, onde);
    if (ids.has(c.id)) erros.push(`${onde}: id repetido.`);
    ids.add(c.id);
    if (c.tipo === "lista") {
      if (!Number.isInteger(c.itens) || c.itens < 1) erros.push(`${onde}: "itens" deve ser um inteiro ≥ 1.`);
      if (c.grupo && c.itens % c.grupo.tamanho) erros.push(`${onde}: "itens" (${c.itens}) não é múltiplo de grupo.tamanho (${c.grupo.tamanho}).`);
      if (c.min !== undefined) {
        if (!Number.isInteger(c.min) || c.min < 1 || c.min > c.itens) erros.push(`${onde}: "min" deve ser um inteiro entre 1 e "itens" (${c.itens}).`);
        else if (c.min % passoLista(c)) erros.push(`${onde}: "min" (${c.min}) não é múltiplo do passo (${passoLista(c)}).`);
      }
      if (!Array.isArray(c.campos) || !c.campos.length) erros.push(`${onde}: lista sem "campos".`);
      for (const sub of c.campos || []) {
        checarCampo(sub, `${onde} › "${sub.id}"`);
        if (sub.tipo === "lista") erros.push(`${onde} › "${sub.id}": lista dentro de lista não é suportada.`);
      }
    }
  }
  if (erros.length) return { erros, avisos, template: t };

  // index.html <-> template.json
  if (!html.includes("getVariables")) erros.push("index.html não lê as variáveis (window.__hyperframes.getVariables()).");
  if (/data-composition-src/.test(html))
    erros.push("index.html usa sub-composições (data-composition-src): elas não recebem os dados do motor — use uma composição única.");

  const decl = new Map(declaracoes.map((d) => [d.id, d]));
  const esperadas = variaveisEsperadas(meta.campos);
  for (const { id, campo, rotulo } of esperadas) {
    const d = decl.get(id);
    if (!d) {
      erros.push(`variável "${id}" (${rotulo}) não está declarada em index.html.`);
      continue;
    }
    if (d.type !== TIPOS[campo.tipo]) erros.push(`variável "${id}": tipo "${d.type}" em index.html, mas o campo é "${campo.tipo}" (esperado "${TIPOS[campo.tipo]}").`);
    const r = validarValor(campo, d.default, d, {
      imagem: (p) => (existsSync(join(t.dir, p)) ? { valor: p } : { erro: `imagem padrão "${p}" não existe no template.` }),
    });
    if (r.erro) erros.push(`variável "${id}": valor padrão inválido — ${r.erro}`);
  }
  for (const c of meta.campos.filter(listaVariavel)) {
    const total = decl.get(`${c.id}_total`)?.default;
    if (total !== undefined && total % passoLista(c)) erros.push(`variável "${c.id}_total": valor padrão ${total} não é múltiplo do passo (${passoLista(c)}).`);
  }
  const esperadosIds = new Set(esperadas.map((e) => e.id));
  for (const d of declaracoes)
    if (!esperadosIds.has(d.id)) erros.push(`variável "${d.id}" está em index.html mas não em template.json.`);

  const { largura, altura } = tamanhoComposicao(html);
  if (!TAMANHOS_RECOMENDADOS.some(([w, h]) => w === largura && h === altura))
    avisos.push(`a composição é ${largura}×${altura}; o padrão é 1280×720 (ou 720×1280 na vertical). O vídeo sai no tamanho declarado: maior que o padrão renderiza mais devagar e gera arquivos maiores.`);

  return { erros, avisos, template: t };
}

// ---------- dados do formulário -> variáveis ----------

// Dados no formato do formulário: { validade: "...", produtos: [{ nome, imagem, ... }, ...] }
// Imagens: caminho de arquivo (relativo a baseDir) ou "assets/..." do próprio template.
// Retorna { variaveis, copias: [{ de, para }], erros, detalhes: [{ campo, mensagem }] }.
// `detalhes.campo` é o id da variável (ex.: "produtos_1_por"), ou null para erros gerais.
export function prepararDados(template, dados, baseDir) {
  const { meta, declaracoes } = template;
  const decl = new Map(declaracoes.map((d) => [d.id, d]));
  const variaveis = {}, copias = [], erros = [], detalhes = [];
  const erro = (campo, texto, rotulo) => {
    erros.push(rotulo ? `${rotulo}: ${texto}` : texto);
    detalhes.push({ campo, mensagem: texto });
  };

  const imagem = (destino) => (p) => {
    if (p.startsWith("assets/") && existsSync(join(template.dir, p))) return { valor: p };
    const origem = resolve(baseDir, p);
    if (!existsSync(origem)) return { erro: `arquivo "${p}" não encontrado.` };
    if (!EXT_IMAGEM.includes(extname(origem).toLowerCase())) return { erro: `"${basename(origem)}" não é PNG, JPG ou WEBP.` };
    const para = `entrada/${destino}${extname(origem).toLowerCase()}`;
    copias.push({ de: origem, para });
    return { valor: para };
  };

  const aplicar = (id, campo, bruto, rotulo) => {
    const r = validarValor(campo, bruto, decl.get(id), { imagem: imagem(id) });
    if (r.erro) erro(id, r.erro, rotulo);
    else variaveis[id] = r.valor;
  };

  const conhecidos = new Set(meta.campos.map((c) => c.id));
  for (const k of Object.keys(dados)) if (!conhecidos.has(k)) erro(null, `campo "${k}" não existe neste template.`);

  for (const c of meta.campos) {
    if (c.tipo !== "lista") {
      aplicar(c.id, c, dados[c.id], c.rotulo);
      continue;
    }
    const itens = dados[c.id];
    const qtd = Array.isArray(itens) ? itens.length : 0, min = minimoLista(c), passo = passoLista(c);
    if (qtd < min || qtd > c.itens || qtd % passo) {
      const faixa = min === c.itens ? `exatamente ${c.itens}` : `de ${min} a ${c.itens}`;
      erro(null, `são necessários ${faixa} itens${passo > 1 && min !== c.itens ? `, de ${passo} em ${passo}` : ""} (recebidos ${qtd}).`, c.rotulo);
      continue;
    }
    if (listaVariavel(c)) {
      variaveis[`${c.id}_total`] = qtd;
      // itens que não vieram ficam com o padrão do template (o template não os mostra)
      for (let n = qtd + 1; n <= c.itens; n++)
        for (const sub of c.campos) variaveis[`${c.id}_${n}_${sub.id}`] = decl.get(`${c.id}_${n}_${sub.id}`)?.default;
    }
    const subIds = new Set(c.campos.map((s) => s.id));
    itens.forEach((item, i) => {
      const rot = `${c.rotuloItem || c.rotulo} ${i + 1}`;
      for (const k of Object.keys(item || {})) if (!subIds.has(k)) erro(null, `campo "${k}" não existe neste template.`, rot);
      for (const sub of c.campos) aplicar(`${c.id}_${i + 1}_${sub.id}`, sub, item?.[sub.id], `${rot} › ${sub.rotulo}`);
    });
  }
  return { variaveis, copias, erros, detalhes };
}

// Valores padrão no formato do formulário (para preencher o formulário / exemplo).
export function dadosPadrao(template) {
  const decl = new Map(template.declaracoes.map((d) => [d.id, d.default]));
  const dados = {};
  for (const c of template.meta.campos) {
    if (c.tipo !== "lista") dados[c.id] = decl.get(c.id);
    else
      // lista variável: começa com a quantidade padrão do template (default de "<lista>_total")
      dados[c.id] = Array.from({ length: listaVariavel(c) ? decl.get(`${c.id}_total`) ?? c.itens : c.itens }, (_, i) =>
        Object.fromEntries(c.campos.map((s) => [s.id, decl.get(`${c.id}_${i + 1}_${s.id}`)])),
      );
  }
  return dados;
}

// Esquema para montar o formulário: campos do template.json + padrões e opções do index.html.
export function esquema(template) {
  const decl = new Map(template.declaracoes.map((d) => [d.id, d]));
  const enriquecer = (c, idVar) => {
    const d = decl.get(idVar) || {};
    const out = { ...c };
    if (c.tipo === "opcoes") out.opcoes = (d.options || []).map((o) => o.value);
    if (c.tipo === "numero") {
      out.min ??= d.min;
      out.max ??= d.max;
      out.passo ??= d.step ?? 0.05;
    }
    return out;
  };
  const html = template.html;
  const attr = (nome) => Number(new RegExp(`id="root"[^>]*${nome}="([\\d.]+)"`).exec(html)?.[1] || 0);
  return {
    id: template.meta.id,
    nome: template.meta.nome,
    cliente: template.meta.cliente || "",
    descricao: template.meta.descricao || "",
    largura: attr("data-width"),
    altura: attr("data-height"),
    duracao: attr("data-duration"),
    capaEm: template.meta.capaEm ?? 0,
    campos: template.meta.campos.map((c) =>
      c.tipo === "lista"
        ? { ...c, min: minimoLista(c), campos: c.campos.map((s) => enriquecer(s, `${c.id}_1_${s.id}`)) }
        : enriquecer(c, c.id),
    ),
    padrao: dadosPadrao(template),
  };
}
