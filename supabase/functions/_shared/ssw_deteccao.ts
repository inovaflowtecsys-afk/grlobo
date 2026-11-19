// Reconhecimento e validacao de relatorios SSW para a importacao manual.
// A leitura (parse) repete a das funcoes sync-ssw-036 / sync-ssw-455 / sync-ssw-financeiro SOMENTE para reconhecer o tipo
// e contar linhas. A gravacao NAO passa por aqui: a funcao importar-ssw chama as funcoes sync-ssw-* existentes.
//
// Assinaturas de colunas (nomes normalizados: minusculas, sem acento, "_"):
//   036: romaneio + ctrc + (cod_ocorr_rom | desc_ocorr_rom | situacao)        (gatilho romaneios_preenche_colunas, migracao 012)
//   455: serie_numero_ctrc | (sigla_ctrc + numero_ctrc) | nro_chave_acesso_cte (migracao 001 / sync-ssw-455)
//   441: formato SSW com linhas 3; e 4;, cabecalho 1; com "fatura" e cabecalho 2; com "ctrc"
//   411: formato SSW, cabecalho 1; com ctrc, fatura, data_liquid e valor_liqu
//   435: formato SSW, cabecalho 1; com ctrc, sem colunas de liquidacao (reconhecido, mas fora do escopo da fase 1)

export type Tipo = "036" | "455" | "441" | "411" | "435";
export type TipoDetectado = Tipo | "desconhecido" | "ambiguo";

export type Destino = { rotulo: string; funcao: string; query: Record<string, string>; param: "referencia" | "sequencia" };

/** Tipos que a importacao manual aceita: cada um aponta para a funcao de sincronizacao que ja existe. */
export const DESTINOS: Partial<Record<Tipo, Destino>> = {
  "036": { rotulo: "SSW 036 (romaneios e CTRCs de entrega)", funcao: "sync-ssw-036", query: {}, param: "referencia" },
  "455": { rotulo: "SSW 455 (fretes expedidos/recebidos)", funcao: "sync-ssw-455", query: {}, param: "sequencia" },
  "441": { rotulo: "Financeiro 441 (faturas e CTRCs da fatura)", funcao: "sync-ssw-financeiro", query: { tipo: "faturas" }, param: "sequencia" },
  "411": { rotulo: "Financeiro 411 (CTRCs liquidados)", funcao: "sync-ssw-financeiro", query: { tipo: "liquidados" }, param: "sequencia" },
};

/**
 * Destinos da importacao AUTOMATICA (extensao do navegador): iguais aos do manual, mais o 435, que o fluxo automatico do n8n
 * sempre carregou ("retrato": o que sumiu do arquivo e marcado inativo). A extensao busca o 435 completo, como o robo.
 */
export const DESTINOS_AUTOMATICOS: Partial<Record<Tipo, Destino>> = {
  ...DESTINOS,
  "435": { rotulo: "Financeiro 435 (CTRCs a faturar)", funcao: "sync-ssw-financeiro", query: { tipo: "a_faturar" }, param: "sequencia" },
};

export const ROTULO_TIPO: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DESTINOS).map(([k, v]) => [k, v!.rotulo])),
  "435": "Financeiro 435 (CTRCs a faturar)",
  desconhecido: "Não reconhecido",
  ambiguo: "Ambíguo",
};

export type Deteccao = {
  tipo: TipoDetectado;
  cabecalho: string[];
  linhas: number;
  motivo?: string;
  avisos: string[];
  referencia?: string;
};

type Row = Record<string, string>;

const clean = (v: string) => v.replace(/[\s�]+/g, " ").trim();
const norm = (h: string) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const normalizarCtrc = (v: string) => v.replace(/\s+/g, "").toUpperCase();
const digits = (v?: string) => (v || "").replace(/\D/g, "");

/** Mesma leitura do 036/455: formato SSW ("1;cabecalho") ou CSV simples com ; ou tab. */
function parse(texto: string): { cabecalho: string[]; linhas: Row[] } {
  const lines = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  const sswHead = lines.findIndex((l) => /^1;/.test(l));
  const sswFmt = sswHead >= 0;
  const hi = sswFmt ? sswHead : 0;
  if (!lines.length) return { cabecalho: [], linhas: [] };
  const sep = sswFmt || lines[hi].includes(";") ? ";" : "\t";
  const cab = lines[hi].split(sep).map((h) => h.trim());
  const keys = cab.map((h, i) => (sswFmt && i === 0 ? "" : norm(h)));
  const linhas: Row[] = [];
  for (const line of lines.slice(hi + 1)) {
    if (sswFmt && !/^\d;/.test(line)) continue;
    if (sswFmt && /^9;/.test(line)) continue;
    const cells = line.split(sep);
    const r: Row = {};
    keys.forEach((k, i) => { if (k) r[k] = clean(cells[i] ?? ""); });
    if (Object.values(r).some((v) => v)) linhas.push(r);
  }
  return { cabecalho: keys.filter(Boolean), linhas };
}

/** Chaves normalizadas de uma linha de cabecalho do formato SSW; a 1a coluna (numero do tipo de linha) vira "". Mantem as posicoes. */
function chaves(l?: string): string[] {
  if (!l) return [];
  return l.split(";").map((h, i) => (i === 0 ? "" : norm(h)));
}

/** Igual a funcao "linha" do sync-ssw-financeiro: monta a linha pelas posicoes do cabecalho. */
function linhaSsw(l: string, keys: string[]): Row {
  const cells = l.split(";");
  const r: Row = {};
  keys.forEach((k, i) => { if (k) r[k] = clean(cells[i] ?? ""); });
  return r;
}

/** Sugere o periodo do 036 (ddmmaa-ddmmaa) a partir das duas primeiras datas do titulo do arquivo, se houver. */
function sugerirReferencia(linhas: string[]): string | undefined {
  const titulo = linhas.filter((l) => /^0;/.test(l)).join(" ");
  const datas = [...titulo.matchAll(/(\d{2})\/(\d{2})\/(\d{2,4})/g)].map((m) => `${m[1]}${m[2]}${m[3].slice(-2)}`);
  return datas.length >= 2 ? `${datas[0]}-${datas[1]}` : undefined;
}

const assinatura036 = (k: string[]) => k.includes("ctrc") && k.includes("romaneio") && (k.includes("cod_ocorr_rom") || k.includes("desc_ocorr_rom") || k.includes("situacao"));
const assinatura455 = (k: string[]) => k.includes("serie_numero_ctrc") || (k.includes("sigla_ctrc") && k.includes("numero_ctrc")) || k.includes("nro_chave_acesso_cte");

function contar036(linhas: Row[]) {
  return linhas.filter((r) => (r["ctrc"] || "").trim()).length;
}
function contar455(linhas: Row[]) {
  let n = 0;
  for (const r of linhas) {
    const ctrcBruto = (r["serie_numero_ctrc"] || "").trim() || `${r["sigla_ctrc"] || ""}${r["numero_ctrc"] || ""}`.trim() || (r["ctrc"] || "").trim();
    const chaveCte = digits(r["nro_chave_acesso_cte"] || r["chave_cte"] || r["chave_acesso"]);
    if (normalizarCtrc(ctrcBruto) || chaveCte) n++;
  }
  return n;
}

const RECUSA = (tipo: TipoDetectado, motivo: string, cabecalho: string[] = [], avisos: string[] = []): Deteccao => ({ tipo, cabecalho, linhas: 0, motivo, avisos });

/**
 * Reconhece o relatorio pelo conteudo. Com `forcado`, so confere as regras daquele tipo (usuario corrigiu o reconhecimento).
 * Qualquer duvida (nenhum tipo, ou mais de um) e recusa: nada e enviado para gravacao.
 */
export function detectar(texto: string, forcado?: string, opcoes: { permitir435?: boolean } = {}): Deteccao {
  if (!texto.trim()) return RECUSA("desconhecido", "Arquivo vazio.");
  const lines = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  const sswFmt = lines.some((l) => /^1;/.test(l));
  const h1 = sswFmt ? chaves(lines.find((l) => l.startsWith("1;"))) : [];
  const h2 = sswFmt ? chaves(lines.find((l) => l.startsWith("2;"))) : [];
  const tem3 = lines.some((l) => l.startsWith("3;"));
  const tem4 = lines.some((l) => l.startsWith("4;"));
  const { cabecalho, linhas } = parse(texto);

  const e441 = sswFmt && tem3 && tem4 && h1.includes("fatura") && h2.includes("ctrc");
  const e411 = sswFmt && !e441 && h1.includes("ctrc") && h1.includes("data_liquid") && h1.includes("valor_liqu");
  const e036 = assinatura036(cabecalho);
  const e455 = assinatura455(cabecalho);
  const e435 = sswFmt && !e441 && !e411 && !tem3 && h1.includes("ctrc") && !e036 && !e455;

  const nomesH1 = h1.filter(Boolean);
  const candidatos: Tipo[] = [];
  if (e441) candidatos.push("441");
  if (e411) candidatos.push("411");
  if (e036) candidatos.push("036");
  if (e455) candidatos.push("455");
  if (e435) candidatos.push("435");

  let tipo: TipoDetectado;
  if (forcado && forcado !== "auto") {
    if (!["036", "455", "441", "411", "435"].includes(forcado)) return RECUSA("desconhecido", `Tipo informado inválido: ${forcado}.`, cabecalho);
    if (!candidatos.includes(forcado as Tipo)) {
      return RECUSA("desconhecido", `O arquivo não tem as colunas esperadas do relatório ${forcado}. Colunas lidas: ${resumo(sswFmt ? nomesH1 : cabecalho)}.`, sswFmt ? nomesH1 : cabecalho);
    }
    tipo = forcado as Tipo;
  } else if (candidatos.length === 1) {
    tipo = candidatos[0];
  } else if (candidatos.length > 1) {
    return RECUSA("ambiguo", `O arquivo se encaixa em mais de um relatório (${candidatos.join(", ")}). Escolha o tipo correto.`, sswFmt ? nomesH1 : cabecalho);
  } else {
    return RECUSA("desconhecido", `Relatório não reconhecido. Só são aceitos 036, 455, 441 e 411. Colunas lidas: ${resumo(sswFmt ? nomesH1 : cabecalho)}.`, sswFmt ? nomesH1 : cabecalho);
  }

  const avisos: string[] = [];
  let total = 0;
  let cab = cabecalho;
  let referencia: string | undefined;

  if (tipo === "441") {
    cab = nomesH1;
    for (const l of lines) {
      if (l.startsWith("3;")) { const d = linhaSsw(l, h1); if (d["fatura"]) total++; }
      else if (l.startsWith("4;")) { const d = linhaSsw(l, h2); if (d["fatura"] && d["ctrc"]) total++; }
    }
  } else if (tipo === "411" || tipo === "435") {
    cab = nomesH1;
    for (const l of lines) {
      if (!l.startsWith("2;")) continue;
      if (linhaSsw(l, h1)["ctrc"]) total++;
    }
  } else if (tipo === "036") {
    total = contar036(linhas);
    referencia = sugerirReferencia(lines);
    if (!referencia) avisos.push("Não foi possível ler o período no arquivo. Informe a referência (ex.: 171026-201026) para ficar registrada na carga.");
  } else {
    total = contar455(linhas);
    avisos.push("Informe a sequência da fila do SSW, se souber, para ficar registrada na carga.");
  }

  if (tipo === "435" && !opcoes.permitir435) {
    return { tipo, cabecalho: cab, linhas: total, motivo: "Parece o relatório 435 (CTRCs a faturar), que ainda não é importado manualmente: ele marca como inativo o que não está no arquivo e nunca foi carregado automaticamente. Se este arquivo for o 411 (liquidados), as colunas data_liquid e valor_liqu não foram encontradas.", avisos };
  }
  if (total === 0) {
    return { tipo, cabecalho: cab, linhas: 0, motivo: "O arquivo foi reconhecido, mas não tem nenhuma linha com CTRC/chave para gravar.", avisos };
  }
  return { tipo, cabecalho: cab, linhas: total, avisos, referencia };
}

function resumo(cols: string[]) {
  const l = cols.slice(0, 12).join(", ");
  return cols.length > 12 ? `${l}... (${cols.length} colunas)` : l || "nenhuma";
}
