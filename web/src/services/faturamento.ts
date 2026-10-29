import { supabase } from "../lib/supabase";
import type {
  Atualizacao,
  FaturaDetalheRow,
  ResumoSituacao,
  FaturasVencidas,
  InadimplenciaMes,
  TicketMes,
  FaturasVencidasCliente,
  FaturamentoMes,
  CtrcFinanceiroItem,
  CtrcsFinanceiroQuery,
  FaturamentoDia,
  FaturamentoDiaCliente,
  FaturamentoSituacao,
  FaturaItem,
  FaturasQuery,
  Paginado,
} from "../types/faturamento";

const FATURA_COLUMNS = "dominio,chave_linha,fatura,cliente,cnpj_cliente,emissao,vencimento,pagamento,situacao,dias_atraso,qtd_ctrcs,valor_fatura,valor_pago,saldo";
const CTRC_COLUMNS =
  "dominio,ctrc,cte,data_autorizacao,tipo_conhecimento,rota,unidade_origem,unidade_destino,pagador_nome,pagador_cnpj,valor_frete,data_entrega,situacao_financeira," +
  "fatura,fatura_emissao,fatura_vencimento,fatura_situacao,fatura_saldo,valor_fatura,valor_a_faturar,dias_atraso,tipo_baixa,data_liquidacao,valor_liquidado,forma_liquidacao,data_credito_caixa";

// vírgula, parênteses, % e * têm significado nos filtros .or()/.ilike do PostgREST
const limpar = (valor: string) => valor.replace(/[,()%*\\]/g, " ").trim();
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Faturamento por dia de emissão do CT-e (com acumulado no mês). */
export async function listFaturamentoDiario(de: string, ate: string): Promise<FaturamentoDia[]> {
  const { data, error } = await supabase.from("v_faturamento_diario").select("dia,qtd_cte,valor_frete,acumulado_mes").gte("dia", de).lte("dia", ate).order("dia");
  if (error) throw error;
  return (data ?? []).map((r) => ({ dia: r.dia, qtd_cte: num(r.qtd_cte), valor_frete: num(r.valor_frete), acumulado_mes: num(r.acumulado_mes) }));
}

/** Total faturado por mês de emissão do CT-e (últimos N meses, incluindo o atual). */
export async function listFaturamentoMensal(meses = 6): Promise<FaturamentoMes[]> {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  const iso = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase.from("v_faturamento_diario").select("dia,qtd_cte,valor_frete").gte("dia", iso).order("dia").limit(5000);
  if (error) throw error;
  const porMes = new Map<string, FaturamentoMes>();
  for (const r of data ?? []) {
    const mes = String(r.dia).slice(0, 7);
    const atual = porMes.get(mes) ?? { mes, valor_frete: 0, qtd_cte: 0 };
    atual.valor_frete += num(r.valor_frete);
    atual.qtd_cte += num(r.qtd_cte);
    porMes.set(mes, atual);
  }
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Faturamento de um período, somado por cliente (pagador), do maior para o menor. */
export async function listFaturamentoPorCliente(de: string, ate: string): Promise<FaturamentoDiaCliente[]> {
  const porCliente = new Map<string, FaturamentoDiaCliente>();
  const passo = 1000;
  for (let from = 0; ; from += passo) {
    const { data, error } = await supabase
      .from("v_faturamento_dia_cliente")
      .select("dia,cliente,cnpj,qtd_cte,valor_frete")
      .gte("dia", de)
      .lte("dia", ate)
      .order("dia")
      .order("cliente")
      .range(from, from + passo - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      const chave = `${r.cliente}|${r.cnpj ?? ""}`;
      const atual = porCliente.get(chave) ?? { cliente: r.cliente, cnpj: r.cnpj, qtd_cte: 0, valor_frete: 0 };
      atual.qtd_cte += num(r.qtd_cte);
      atual.valor_frete += num(r.valor_frete);
      porCliente.set(chave, atual);
    }
    if (!data || data.length < passo) break;
  }
  return [...porCliente.values()].sort((a, b) => b.valor_frete - a.valor_frete);
}

type Paginavel<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Lê todas as linhas de uma consulta, em páginas de 1.000 (limite padrão do PostgREST). */
async function todasAsLinhas<T>(consulta: (from: number, to: number) => Paginavel<T>): Promise<T[]> {
  const passo = 1000;
  const linhas: T[] = [];
  for (let from = 0; ; from += passo) {
    const { data, error } = await consulta(from, from + passo - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < passo) break;
  }
  return linhas;
}

const primeiroDiaDoMes = (meses: number) => {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth() - (meses - 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const diasEntre = (fim: string, inicio: string) => {
  const [y1, m1, d1] = fim.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = inicio.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
};

/** Faturas vencidas e não pagas (situação ATRASADA): por cliente (maior valor primeiro) e por faixa de dias de atraso. */
export async function getFaturasVencidas(): Promise<FaturasVencidas> {
  type Linha = { chave_linha: string; cliente: string | null; cnpj_cliente: string | null; valor_fatura: number | null; dias_atraso: number | null };
  const linhas = await todasAsLinhas<Linha>((from, to) =>
    supabase.from("ssw_faturas").select("chave_linha,cliente,cnpj_cliente,valor_fatura,dias_atraso").eq("situacao", "ATRASADA").order("chave_linha").range(from, to),
  );
  const porCliente = new Map<string, FaturasVencidas["clientes"][number]>();
  const faixas = [
    { faixa: "1 a 15 dias", max: 15, qtd: 0, valor: 0 },
    { faixa: "16 a 30 dias", max: 30, qtd: 0, valor: 0 },
    { faixa: "31 a 60 dias", max: 60, qtd: 0, valor: 0 },
    { faixa: "Mais de 60 dias", max: Infinity, qtd: 0, valor: 0 },
  ];
  for (const r of linhas) {
    const valor = num(r.valor_fatura);
    const nome = r.cliente?.trim() || "Sem cliente";
    const chave = `${nome}|${r.cnpj_cliente ?? ""}`;
    const c = porCliente.get(chave) ?? { cliente: nome, cnpj: r.cnpj_cliente, qtd_faturas: 0, valor_total: 0 };
    c.qtd_faturas += 1;
    c.valor_total += valor;
    porCliente.set(chave, c);
    const f = faixas.find((x) => num(r.dias_atraso) <= x.max) ?? faixas[faixas.length - 1];
    f.qtd += 1;
    f.valor += valor;
  }
  return {
    clientes: [...porCliente.values()].sort((a, b) => b.valor_total - a.valor_total),
    faixas: faixas.map(({ faixa, qtd, valor }) => ({ faixa, qtd, valor })),
  };
}

/** Inadimplência por mês de emissão: quanto do valor faturado no mês está vencido e não pago (faturas canceladas ficam de fora). */
export async function listInadimplenciaMensal(meses = 6): Promise<InadimplenciaMes[]> {
  type Linha = { chave_linha: string; emissao: string | null; situacao: string | null; valor_fatura: number | null };
  const inicio = primeiroDiaDoMes(meses);
  const linhas = await todasAsLinhas<Linha>((from, to) =>
    supabase.from("ssw_faturas").select("chave_linha,emissao,situacao,valor_fatura").gte("emissao", inicio).neq("situacao", "CANCELADA").order("chave_linha").range(from, to),
  );
  const porMes = new Map<string, InadimplenciaMes>();
  for (const r of linhas) {
    if (!r.emissao) continue;
    const mes = r.emissao.slice(0, 7);
    const m = porMes.get(mes) ?? { mes, qtd: 0, qtdVencida: 0, faturado: 0, vencido: 0, pct: 0 };
    m.qtd += 1;
    m.faturado += num(r.valor_fatura);
    if (r.situacao === "ATRASADA") {
      m.qtdVencida += 1;
      m.vencido += num(r.valor_fatura);
    }
    porMes.set(mes, m);
  }
  return [...porMes.values()].map((m) => ({ ...m, pct: m.faturado > 0 ? (m.vencido / m.faturado) * 100 : 0 })).sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Ticket médio por CT-e (frete / CT-es) e por cliente (frete / clientes atendidos), por mês de emissão. */
export async function listTicketMensal(meses = 6): Promise<TicketMes[]> {
  type Linha = { dia: string; cliente: string; cnpj: string | null; qtd_cte: number | null; valor_frete: number | null };
  const inicio = primeiroDiaDoMes(meses);
  const linhas = await todasAsLinhas<Linha>((from, to) =>
    supabase.from("v_faturamento_dia_cliente").select("dia,cliente,cnpj,qtd_cte,valor_frete").gte("dia", inicio).order("dia").order("cliente").range(from, to),
  );
  const porMes = new Map<string, { qtd: number; valor: number; clientes: Set<string> }>();
  for (const r of linhas) {
    const mes = String(r.dia).slice(0, 7);
    const m = porMes.get(mes) ?? { qtd: 0, valor: 0, clientes: new Set<string>() };
    m.qtd += num(r.qtd_cte);
    m.valor += num(r.valor_frete);
    m.clientes.add(`${r.cliente}|${r.cnpj ?? ""}`);
    porMes.set(mes, m);
  }
  return [...porMes.entries()]
    .map(([mes, m]) => ({ mes, qtd_cte: m.qtd, valor: m.valor, clientes: m.clientes.size, ticketCte: m.qtd ? m.valor / m.qtd : 0, ticketCliente: m.clientes.size ? m.valor / m.clientes.size : 0 }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/** CT-es emitidos x a faturar x faturado x em atraso x liquidado, somando os meses que tocam o período. */
export async function getFaturamentoSituacao(de: string, ate: string): Promise<FaturamentoSituacao> {
  const { data, error } = await supabase
    .from("v_faturamento_situacao_mensal")
    .select("*")
    .gte("mes", `${de.slice(0, 7)}-01`)
    .lte("mes", ate);
  if (error) throw error;
  const soma = (campo: string) => (data ?? []).reduce((s, r) => s + num((r as Record<string, unknown>)[campo]), 0);
  return {
    qtdCteEmitidos: soma("qtd_cte_emitidos"),
    valorCteEmitido: soma("valor_cte_emitido"),
    qtdAFaturar: soma("qtd_a_faturar"),
    valorAFaturar: soma("valor_a_faturar"),
    qtdFaturado: soma("qtd_faturado"),
    valorFaturado: soma("valor_faturado"),
    qtdAtrasado: soma("qtd_atrasado"),
    valorAtrasado: soma("valor_atrasado"),
    qtdLiquidado: soma("qtd_liquidado"),
    valorLiquidado: soma("valor_liquidado"),
    qtdSemInformacao: soma("qtd_sem_informacao"),
  };
}

interface Filtravel {
  gte(coluna: string, valor: string): Filtravel;
  lte(coluna: string, valor: string): Filtravel;
  ilike(coluna: string, padrao: string): Filtravel;
  eq(coluna: string, valor: string): Filtravel;
  or(filtros: string): Filtravel;
}

type FiltrosFaturas = Pick<FaturasQuery, "de" | "ate" | "cliente" | "fatura">;
type FiltrosCtrcs = Pick<CtrcsFinanceiroQuery, "de" | "ate" | "cliente" | "numero">;

function filtrosDeFaturas<T>(consulta: T, q: FiltrosFaturas): T {
  let req = consulta as unknown as Filtravel;
  if (q.de) req = req.gte("emissao", q.de);
  if (q.ate) req = req.lte("emissao", q.ate);
  const cliente = limpar(q.cliente);
  if (cliente) req = req.ilike("cliente", `%${cliente}%`);
  const fatura = limpar(q.fatura);
  if (fatura) req = req.ilike("fatura", `%${fatura}%`);
  return req as unknown as T;
}

function filtrosDeCtrcs<T>(consulta: T, q: FiltrosCtrcs): T {
  let req = consulta as unknown as Filtravel;
  const numero = limpar(q.numero).replace(/\s+/g, "");
  if (numero) {
    req = req.or(`ctrc.ilike.%${numero}%,cte.ilike.%${numero}%,fatura.ilike.%${numero}%`);
  } else {
    if (q.de) req = req.gte("data_autorizacao", q.de);
    if (q.ate) req = req.lte("data_autorizacao", q.ate);
  }
  const cliente = limpar(q.cliente);
  if (cliente) req = req.ilike("pagador_nome", `%${cliente}%`);
  return req as unknown as T;
}

export async function listFaturas(q: FaturasQuery): Promise<Paginado<FaturaItem>> {
  const from = (q.page - 1) * q.pageSize;
  let req = filtrosDeFaturas(supabase.from("ssw_faturas").select(FATURA_COLUMNS, { count: "exact" }), q);
  if (q.situacao) req = req.eq("situacao", q.situacao);
  const { data, error, count } = await req.order("emissao", { ascending: false, nullsFirst: false }).order("fatura", { ascending: false }).range(from, from + q.pageSize - 1);
  if (error) throw error;
  return { data: (data ?? []) as unknown as FaturaItem[], count: count ?? 0 };
}

export async function listCtrcsFinanceiro(q: CtrcsFinanceiroQuery): Promise<Paginado<CtrcFinanceiroItem>> {
  const from = (q.page - 1) * q.pageSize;
  let req = filtrosDeCtrcs(supabase.from("ssw_ctrc_financeiro").select(CTRC_COLUMNS, { count: "exact" }), q);
  if (q.situacao) req = req.eq("situacao_financeira", q.situacao);
  const { data, error, count } = await req.order("data_autorizacao", { ascending: false, nullsFirst: false }).order("ctrc", { ascending: false }).range(from, from + q.pageSize - 1);
  if (error) throw error;
  return { data: (data ?? []) as unknown as CtrcFinanceiroItem[], count: count ?? 0 };
}

/** Todas as faturas dos filtros atuais (sem paginação), para exportar. */
export async function listTodasFaturas(q: FiltrosFaturas & { situacao: string }): Promise<FaturaItem[]> {
  return todasAsLinhas<FaturaItem>((from, to) => {
    let req = filtrosDeFaturas(supabase.from("ssw_faturas").select(FATURA_COLUMNS), q);
    if (q.situacao) req = req.eq("situacao", q.situacao);
    return req.order("emissao", { ascending: false, nullsFirst: false }).order("fatura", { ascending: false }).range(from, to) as unknown as Paginavel<FaturaItem>;
  });
}

/** Todos os conhecimentos dos filtros atuais (sem paginação), para exportar. */
export async function listTodosCtrcs(q: FiltrosCtrcs & { situacao: string }): Promise<CtrcFinanceiroItem[]> {
  return todasAsLinhas<CtrcFinanceiroItem>((from, to) => {
    let req = filtrosDeCtrcs(supabase.from("ssw_ctrc_financeiro").select(CTRC_COLUMNS), q);
    if (q.situacao) req = req.eq("situacao_financeira", q.situacao);
    return req.order("data_autorizacao", { ascending: false, nullsFirst: false }).order("ctrc", { ascending: false }).range(from, to) as unknown as Paginavel<CtrcFinanceiroItem>;
  });
}

/** Quantidade e valor de cada situação de fatura, com os filtros da lista (menos a situação), para os cards. */
export async function getFaturasResumo(q: FiltrosFaturas): Promise<ResumoSituacao> {
  type Linha = { chave_linha: string; situacao: string | null; valor_fatura: number | null };
  const linhas = await todasAsLinhas<Linha>((from, to) =>
    filtrosDeFaturas(supabase.from("ssw_faturas").select("chave_linha,situacao,valor_fatura"), q).order("chave_linha").range(from, to),
  );
  const r: ResumoSituacao = {};
  for (const l of linhas) {
    const chave = l.situacao ?? "SEM_INFORMACAO";
    r[chave] = r[chave] ?? { qtd: 0, valor: 0 };
    r[chave].qtd += 1;
    r[chave].valor += num(l.valor_fatura);
  }
  return r;
}

/** Quantidade e valor de cada situação financeira de CT-e, com os filtros da lista (menos a situação), para os cards. */
export async function getCtrcsResumo(q: FiltrosCtrcs): Promise<ResumoSituacao> {
  type Linha = { ctrc: string | null; situacao_financeira: string | null; valor_frete: number | null };
  const linhas = await todasAsLinhas<Linha>((from, to) =>
    filtrosDeCtrcs(supabase.from("ssw_ctrc_financeiro").select("ctrc,situacao_financeira,valor_frete"), q).order("ctrc").range(from, to),
  );
  const r: ResumoSituacao = {};
  for (const l of linhas) {
    const chave = l.situacao_financeira ?? "SEM_INFORMACAO";
    r[chave] = r[chave] ?? { qtd: 0, valor: 0 };
    r[chave].qtd += 1;
    r[chave].valor += num(l.valor_frete);
  }
  return r;
}

/** Todos os dados de uma fatura (colunas tipadas, dados brutos do SSW e CTRCs vinculados) para o popup. */
export async function getFaturaDetalhe(dominio: string, chaveLinha: string): Promise<FaturaDetalheRow | null> {
  const { data, error } = await supabase.from("ssw_faturas").select("*").eq("dominio", dominio).eq("chave_linha", chaveLinha).maybeSingle();
  if (error) throw error;
  return data as unknown as FaturaDetalheRow | null;
}

export async function getAtualizacaoFaturas(): Promise<Atualizacao | null> {
  const { data, error } = await supabase.from("ssw_ultimas_atualizacoes").select("texto,atualizado_em").eq("modulo", "geral").maybeSingle();
  if (error) return null;
  return data as Atualizacao | null;
}

