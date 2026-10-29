import { supabase } from "../lib/supabase";

// Linha mínima de ctrc_painel usada nos KPIs, para manter o Dashboard
// alinhado às mesmas informações operacionais da tela Entregas.
type Ctrc = {
  chave_linha?: string;
  ctrc: string | null;
  data_autorizacao: string | null;
  pagador_nome: string | null;
  remetente_nome: string | null;
  entrega_uf: string | null;
  rota: string | null;
  entrega_cidade: string | null;
  placa_entrega: string | null;
  unidade_origem: string | null;
  valor_frete: number | null;
  valor_icms: number | null;
  valor_iss: number | null;
  peso_real_kg: number | null;
  previsao_entrega: string | null;
  entrega_programada: string | null;
  data_entrega: string | null;
  data_cancelamento: string | null;
  tipo_documento: string | null;
  tipo_conhecimento: string | null;
  status_entrega: string | null;
  rom_ocorrencia_ctrc_codigo: string | null;
  rom_ocorrencia_codigo: string | null;
  ultima_ocorrencia_codigo: string | null;
};

const COLUMNS =
  "ctrc,data_autorizacao,pagador_nome,remetente_nome,entrega_cidade,entrega_uf,placa_entrega,rota,unidade_origem," +
  "valor_frete,valor_icms,valor_iss,peso_real_kg,previsao_entrega:previsao_final,entrega_programada,data_entrega:data_entrega_final,data_cancelamento," +
  "tipo_documento,tipo_conhecimento,status_entrega,rom_ocorrencia_ctrc_codigo,rom_ocorrencia_codigo,ultima_ocorrencia_codigo";
const HISTORICO_COLUMNS = COLUMNS;
const PAGE = 1000;
const DOMINIO = "grupolobo";

export type DashboardFilters = { from: string; to: string; unidade: string };

export type RankItem = { nome: string; qtd: number; frete: number };
export type DpeSerie = {
  porDia: { dia: string; dpe: number }[];
  porMes: { mes: string; dpe: number }[];
  porMunicipio?: DpeRankItem[];
  porPlaca?: DpeRankItem[];
};
export type ConhecimentosMes = { mes: string; total: number };
export type DpeRankItem = { nome: string; dpe: number; total: number; noPrazo: number; atrasos: number };

function conhecimentosPorMes(rows: Ctrc[]) {
  const meses = new Map<string, number>();
  for (const row of rows) {
    if (!row.data_autorizacao) continue;
    const mes = row.data_autorizacao.slice(0, 7);
    meses.set(mes, (meses.get(mes) ?? 0) + 1);
  }
  return [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, total]) => ({ mes, total }));
}

export type DashboardData = {
  ultimaCarga: { recebido_em: string; ok: boolean | null; linhas: number | null } | null;
  unidades: string[];
  operacoes: {
    emitidos: number;
    entregues: number;
    emTransito: number;
    atrasados: number;
    cancelados: number;
    otd: number | null;
    pesoKg: number;
    porDia: { dia: string; dpe: number }[];
    porMes: { mes: string; dpe: number }[];
    conhecimentosPorMes: { mes: string; total: number }[];
    rotas: RankItem[];
  };
  faturamento: {
    freteTotal: number;
    ticketMedio: number;
    impostos: number;
    freteCancelado: number;
    porDia: { dia: string; frete: number }[];
    porUf: RankItem[];
  };
  comercial: {
    clientesAtivos: number;
    topPagadores: RankItem[];
    topRemetentes: RankItem[];
    concentracaoTop5: number | null;
  };
};

async function fetchPeriod(f: DashboardFilters) {
  const rows: Ctrc[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("ctrc_painel")
      .select(COLUMNS)
      .eq("dominio", DOMINIO)
      .gte("data_autorizacao", f.from)
      .lte("data_autorizacao", f.to)
      .order("data_autorizacao")
      .range(from, from + PAGE - 1);
    if (f.unidade) q = q.eq("unidade_origem", f.unidade);
    const { data, error } = await q;
    if (error) throw error;
    const page = (data ?? []) as unknown as Ctrc[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  // O 455 pode trazer mais de uma chave para o mesmo CTRC. O Dashboard
  // trabalha com documentos, então conserva uma única linha por CTRC.
  const unicos = new Map<string, Ctrc>();
  for (const [index, row] of rows.entries()) {
    unicos.set(row.ctrc || row.chave_linha || `linha-${index}`, row);
  }
  return [...unicos.values()];
}

async function fetchHistorico(today: string) {
  const rows: Ctrc[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ctrc_painel")
      .select(HISTORICO_COLUMNS)
      .eq("dominio", DOMINIO)
      .lte("data_autorizacao", today)
      .order("data_autorizacao")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Ctrc[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const unicos = new Map<string, Ctrc>();
  for (const [index, row] of rows.entries()) {
    unicos.set(row.ctrc || row.chave_linha || `linha-${index}`, row);
  }
  return [...unicos.values()];
}

function ocorrenciaIgnorada(row: Ctrc) {
  return [row.rom_ocorrencia_ctrc_codigo, row.rom_ocorrencia_codigo, row.ultima_ocorrencia_codigo].some((codigo) => ["93", "94", "99"].includes((codigo ?? "").trim()));
}

function tipoForaDoDpe(row: Ctrc) {
  const tipo = (row.tipo_conhecimento ?? "").toUpperCase();
  const documento = (row.tipo_documento ?? "").toUpperCase();
  return tipo === "COMPLEMENTAR" || tipo === "SUBSTITUICAO" || documento.includes("COMPLEMENT") || documento.includes("SUBSTIT");
}

function dpeElegivel(row: Ctrc) {
  return Boolean(
      row.status_entrega === "REALIZADA" &&
      row.data_entrega &&
      !row.data_cancelamento &&
      row.previsao_entrega &&
      !tipoForaDoDpe(row) &&
      !ocorrenciaIgnorada(row) &&
      !(row.entrega_programada && row.entrega_programada <= (row.previsao_entrega as string)),
  );
}

function dpeNoPrazo(row: Ctrc) {
  return dpeElegivel(row) && !row.entrega_programada && (row.data_entrega as string) <= (row.previsao_entrega as string);
}

function atrasadoOperacional(row: Ctrc, today: string) {
  const limite = new Date(`${today}T12:00:00`);
  limite.setDate(limite.getDate() - 30);
  const limiteIso = limite.toISOString().slice(0, 10);
  const ocorrencias = [row.rom_ocorrencia_ctrc_codigo, row.rom_ocorrencia_codigo, row.ultima_ocorrencia_codigo];
  return Boolean(
    (row.status_entrega === "PENDENTE" || row.status_entrega === "INSUCESSO") &&
      row.previsao_entrega &&
      row.previsao_entrega < today &&
      row.previsao_entrega >= limiteIso &&
      !ocorrencias.some((codigo) => ["93", "94", "99", "15", "35"].includes((codigo ?? "").trim())),
  );
}

function calcularDpeSerie(rows: Ctrc[]): DpeSerie {
  const entregues = rows.filter((r) => dpeElegivel(r));
  const dias = new Map<string, { total: number; noPrazo: number }>();
  const meses = new Map<string, { total: number; noPrazo: number }>();
  for (const r of entregues) {
    const dia = r.data_entrega as string;
    const mes = dia.slice(0, 7);
    const d = dias.get(dia) ?? { total: 0, noPrazo: 0 };
    const m = meses.get(mes) ?? { total: 0, noPrazo: 0 };
    d.total += 1;
    m.total += 1;
    if (dpeNoPrazo(r)) {
      d.noPrazo += 1;
      m.noPrazo += 1;
    }
    dias.set(dia, d);
    meses.set(mes, m);
  }
  return {
    porDia: [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, x]) => ({ dia, dpe: (x.noPrazo / x.total) * 100 })),
    porMes: [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, x]) => ({ mes, dpe: (x.noPrazo / x.total) * 100 })),
  };
}

function rank(rows: Ctrc[], key: (r: Ctrc) => string | null, limit: number): RankItem[] {
  const map = new Map<string, RankItem>();
  for (const r of rows) {
    const nome = key(r);
    if (!nome) continue;
    const item = map.get(nome) ?? { nome, qtd: 0, frete: 0 };
    item.qtd += 1;
    item.frete += r.valor_frete ?? 0;
    map.set(nome, item);
  }
  return [...map.values()].sort((a, b) => b.frete - a.frete || b.qtd - a.qtd).slice(0, limit);
}

function rankDpe(rows: Ctrc[], key: (r: Ctrc) => string | null, limit = Number.MAX_SAFE_INTEGER): DpeRankItem[] {
  const map = new Map<string, DpeRankItem>();
  for (const row of rows) {
    if (!dpeElegivel(row)) continue;
    const nome = key(row)?.trim();
    if (!nome) continue;
    const item = map.get(nome) ?? { nome, dpe: 0, total: 0, noPrazo: 0, atrasos: 0 };
    item.total += 1;
    if (dpeNoPrazo(row)) item.noPrazo += 1;
    item.atrasos = item.total - item.noPrazo;
    item.dpe = (item.noPrazo / item.total) * 100;
    map.set(nome, item);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || b.dpe - a.dpe || a.nome.localeCompare(b.nome)).slice(0, limit);
}

export function computeDashboard(rows: Ctrc[], today: string) {
  const ativos = rows.filter((r) => !r.data_cancelamento);
  const cancelados = rows.filter((r) => r.data_cancelamento);
  const entregues = ativos.filter((r) => r.data_entrega);
  const abertos = ativos.filter((r) => !r.data_entrega);
  const atrasados = abertos.filter((r) => atrasadoOperacional(r, today));
  const comPrazo = rows.filter((r) => dpeElegivel(r));
  const noPrazo = comPrazo.filter((r) => dpeNoPrazo(r));
  const dpeSerie = calcularDpeSerie(rows);

  const dias = new Map<string, { dia: string; emitidos: number; entregues: number; frete: number }>();
  const dia = (d: string) => {
    const x = dias.get(d) ?? { dia: d, emitidos: 0, entregues: 0, frete: 0 };
    dias.set(d, x);
    return x;
  };
  for (const r of rows) {
    if (r.data_autorizacao) {
      const x = dia(r.data_autorizacao);
      x.emitidos += 1;
      if (!r.data_cancelamento) x.frete += r.valor_frete ?? 0;
    }
  }
  for (const r of entregues) {
    if (r.data_entrega && dias.has(r.data_entrega)) dia(r.data_entrega).entregues += 1;
  }
  const serie = [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));

  const freteTotal = ativos.reduce((s, r) => s + (r.valor_frete ?? 0), 0);
  const pagadores = rank(ativos, (r) => r.pagador_nome, Number.MAX_SAFE_INTEGER);
  const top5 = pagadores.slice(0, 5).reduce((s, p) => s + p.frete, 0);

  return {
    operacoes: {
      emitidos: rows.length,
      entregues: entregues.length,
      emTransito: abertos.length,
      atrasados: atrasados.length,
      cancelados: cancelados.length,
      otd: comPrazo.length ? (noPrazo.length / comPrazo.length) * 100 : null,
      pesoKg: ativos.reduce((s, r) => s + (r.peso_real_kg ?? 0), 0),
      porDia: dpeSerie.porDia,
      porMes: dpeSerie.porMes,
      conhecimentosPorMes: conhecimentosPorMes(rows),
      rotas: rank(ativos, (r) => r.rota, 8),
    },
    faturamento: {
      freteTotal,
      ticketMedio: ativos.length ? freteTotal / ativos.length : 0,
      impostos: ativos.reduce((s, r) => s + (r.valor_icms ?? 0) + (r.valor_iss ?? 0), 0),
      freteCancelado: cancelados.reduce((s, r) => s + (r.valor_frete ?? 0), 0),
      porDia: serie.map(({ dia: d, frete }) => ({ dia: d, frete })),
      porUf: rank(ativos, (r) => r.entrega_uf, 10),
    },
    comercial: {
      clientesAtivos: pagadores.length,
      topPagadores: pagadores.slice(0, 8),
      topRemetentes: rank(ativos, (r) => r.remetente_nome, 8),
      concentracaoTop5: freteTotal ? (top5 / freteTotal) * 100 : null,
    },
  };
}

export type DashboardHistorico = { dpe: DpeSerie; conhecimentos: ConhecimentosMes[] };

export async function loadDashboardHistorico(today: string): Promise<DashboardHistorico> {
  const rows = await fetchHistorico(today);
  return {
    dpe: {
      ...calcularDpeSerie(rows),
      porMunicipio: rankDpe(rows, (r) => r.entrega_cidade),
      porPlaca: rankDpe(rows, (r) => r.placa_entrega),
    },
    conhecimentos: conhecimentosPorMes(rows),
  };
}

export async function loadDashboard(filters: DashboardFilters, today: string): Promise<DashboardData> {
  const [rows, carga, unidades, atrasadosView] = await Promise.all([
    fetchPeriod(filters),
    supabase.from("ssw_455_cargas").select("recebido_em,ok,linhas").order("recebido_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ctrc_painel").select("unidade_origem").eq("dominio", DOMINIO).not("unidade_origem", "is", null).gte("data_autorizacao", filters.from).lte("data_autorizacao", filters.to).limit(5000),
    supabase.from("v_atrasados").select("ctrc", { count: "exact", head: true }),
  ]);
  if (carga.error) throw carga.error;
  if (unidades.error) throw unidades.error;
  if (atrasadosView.error) throw atrasadosView.error;

  const dashboard = computeDashboard(rows, today);

  return {
    ultimaCarga: carga.data,
    unidades: [...new Set((unidades.data ?? []).map((u) => u.unidade_origem as string))].sort(),
    ...dashboard,
    operacoes: { ...dashboard.operacoes, atrasados: atrasadosView.count ?? 0 },
  };
}
