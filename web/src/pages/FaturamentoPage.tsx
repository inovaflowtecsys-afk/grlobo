import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Eye, FileCheck2, FileSpreadsheet, FileText, Loader2, Hourglass, type LucideIcon, ReceiptText, RefreshCw, Search, TriangleAlert, X, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataGrid, type DataGridColumn } from "../components/common/DataGrid";
import { CtrcDetalhe } from "../components/faturamento/CtrcDetalhe";
import { FaturaDetalhe } from "../components/faturamento/FaturaDetalhe";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useDebounced } from "../hooks/useDebounced";
import { diasEntre } from "../lib/conhecimentoFormat";
import { formatBRL, formatBRLCompact, formatDateBR, formatInt, formatISOShort, formatPct, toISODate } from "../lib/format";
import { descreverFiltros, exportCtrcsExcel, exportCtrcsPdf, exportFaturasExcel, exportFaturasPdf } from "../lib/exportFaturamento";
import { cn } from "../lib/utils";
import { getAtualizacaoFaturas, getFaturamentoSituacao, listCtrcsFinanceiro, listFaturamentoPorCliente, getCtrcsResumo, getFaturasResumo, listTodasFaturas, listTodosCtrcs, getFaturasVencidas, listInadimplenciaMensal, listTicketMensal, listFaturamentoDiario, listFaturamentoMensal, listFaturas } from "../services/faturamento";
import type { Atualizacao, CtrcFinanceiroItem, FaturaItem, FaturamentoDia, FaturamentoDiaCliente, FaturamentoMes, FaixaAtraso, FaturamentoSituacao, FaturasVencidasCliente, InadimplenciaMes, ResumoSituacao, SituacaoFinanceira, TicketMes } from "../types/faturamento";

type Aba = "geral" | "faturas" | "conhecimentos";
type Periodo = { de: string; ate: string };

const SITUACAO_CTRC: Record<SituacaoFinanceira, { rotulo: string; variante: "success" | "warning" | "info" | "danger" | "neutral" }> = {
  PENDENTE_FATURAMENTO: { rotulo: "A faturar", variante: "warning" },
  FATURADO: { rotulo: "Faturado", variante: "info" },
  ATRASADO: { rotulo: "Vencida", variante: "danger" },
  CONCLUIDO: { rotulo: "Liquidado", variante: "success" },
  CANCELADO: { rotulo: "Cancelado", variante: "neutral" },
  SEM_INFORMACAO: { rotulo: "Sem informação", variante: "neutral" },
};

const SITUACAO_FATURA: Record<string, { rotulo: string; variante: "success" | "info" | "danger" | "neutral" }> = {
  ABERTA: { rotulo: "A vencer", variante: "info" },
  ATRASADA: { rotulo: "Vencida", variante: "danger" },
  LIQUIDADA: { rotulo: "Liquidada", variante: "success" },
  CANCELADA: { rotulo: "Cancelada", variante: "neutral" },
};

function mesAtual(): Periodo {
  const h = new Date();
  return { de: toISODate(new Date(h.getFullYear(), h.getMonth(), 1)), ate: toISODate(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
}

const COLORS = { primary: "#12437f", accent: "#11a4de", red: "#c54852", grid: "#e6ebf2" };

const selectClass = "flex h-10 w-full rounded-md border border-brand-border/40 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25";
const dataClass = "h-10 w-full rounded-md border border-brand-border/40 bg-white px-3 text-sm outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25";
const pageSize = 20;

export function FaturamentoPage() {
  const [aba, setAba] = useState<Aba>("geral");
  const [periodo, setPeriodo] = useState<Periodo>(mesAtual);
  const [clienteInput, setClienteInput] = useState("");
  const [numeroInput, setNumeroInput] = useState("");
  const cliente = useDebounced(clienteInput);
  const numero = useDebounced(numeroInput);
  const [atualizacao, setAtualizacao] = useState<Atualizacao | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    getAtualizacaoFaturas().then(setAtualizacao);
  }, [recarga]);

  const padrao = mesAtual();
  const filtrado = periodo.de !== padrao.de || periodo.ate !== padrao.ate || Boolean(clienteInput) || Boolean(numeroInput);

  return (
    <div className="space-y-5 p-4 md:p-7">
      <PageHeader title="Faturamento" description="CT-es emitidos, faturas e cobrança do SSW (relatórios 455, 441, 411 e 435)." />

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Campo rotulo="Emissão de" className="xl:col-span-2">
              <input type="date" className={dataClass} value={periodo.de} max={periodo.ate || undefined} onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))} />
            </Campo>
            <Campo rotulo="Emissão até" className="xl:col-span-2">
              <input type="date" className={dataClass} value={periodo.ate} min={periodo.de || undefined} onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))} />
            </Campo>
            <Campo rotulo="Cliente (pagador)" className="xl:col-span-3">
              <Input className="h-10" value={clienteInput} onChange={(e) => setClienteInput(e.target.value)} disabled={aba === "geral"} />
            </Campo>
            <Campo rotulo={aba === "faturas" ? "Nº da fatura" : "CTRC, CT-e ou fatura"} className="xl:col-span-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
                <Input className="h-10 pl-9" value={numeroInput} onChange={(e) => setNumeroInput(e.target.value)} disabled={aba === "geral"} />
              </div>
            </Campo>
            <div className="flex items-end gap-2 xl:col-span-2">
              <Button variant="secondary" className="flex-1" onClick={() => setRecarga((n) => n + 1)}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Atualizar
              </Button>
              <Button
                variant="ghost"
                disabled={!filtrado}
                title="Voltar ao mês atual e remover os filtros"
                onClick={() => {
                  setPeriodo(mesAtual());
                  setClienteInput("");
                  setNumeroInput("");
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-border">
            <span>
              Período: {formatDateBR(periodo.de)} a {formatDateBR(periodo.ate)}
            </span>
            {atualizacao?.texto ? <span>Última atualização: {atualizacao.texto}</span> : null}
          </div>
        </CardContent>
      </Card>

      <div role="tablist" className="flex gap-1 border-b border-brand-border/15">
        {(
          [
            ["geral", "Visão geral"],
            ["faturas", "Faturas"],
            ["conhecimentos", "Conhecimentos"],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            role="tab"
            aria-selected={aba === chave}
            type="button"
            onClick={() => setAba(chave)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition",
              aba === chave ? "border-brand-accent text-brand-primary" : "border-transparent text-brand-border hover:text-brand-dark",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "geral" ? <VisaoGeral periodo={periodo} recarga={recarga} /> : null}
      {aba === "faturas" ? <FaturasLista periodo={periodo} cliente={cliente} numero={numero} recarga={recarga} /> : null}
      {aba === "conhecimentos" ? <ConhecimentosLista periodo={periodo} cliente={cliente} numero={numero} recarga={recarga} /> : null}
    </div>
  );
}

function formatMes(iso: string) {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function limitesDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return { de: toISODate(new Date(ano, m - 1, 1)), ate: toISODate(new Date(ano, m, 0)) };
}

function VisaoGeral({ periodo, recarga }: { periodo: Periodo; recarga: number }) {
  const [situacao, setSituacao] = useState<FaturamentoSituacao | null>(null);
  const [meses, setMeses] = useState<FaturamentoMes[]>([]);
  const [mesSel, setMesSel] = useState(() => toISODate(new Date()).slice(0, 7));
  const [dias, setDias] = useState<FaturamentoDia[]>([]);
  const [loadingGraficos, setLoadingGraficos] = useState(true);
  const [periodoCliente, setPeriodoCliente] = useState<Periodo>(mesAtual);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [vencidas, setVencidas] = useState<FaturasVencidasCliente[]>([]);
  const [faixas, setFaixas] = useState<FaixaAtraso[]>([]);
  const [loadingVencidas, setLoadingVencidas] = useState(true);
  const [clientes, setClientes] = useState<FaturamentoDiaCliente[]>([]);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro("");
    getFaturamentoSituacao(periodo.de, periodo.ate)
      .then((s) => {
        if (ativo) setSituacao(s);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar o faturamento.");
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [periodo.de, periodo.ate, recarga]);

  // gráficos: histórico mensal e dias do mês selecionado (independem do período dos filtros, como o DPE do Dashboard)
  useEffect(() => {
    let ativo = true;
    listFaturamentoMensal(6)
      .then((r) => {
        if (!ativo) return;
        setMeses(r);
        setMesSel((atual) => (r.some((m) => m.mes === atual) || !r.length ? atual : r[r.length - 1].mes));
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar o faturamento.");
      });
    return () => {
      ativo = false;
    };
  }, [recarga]);

  useEffect(() => {
    let ativo = true;
    setLoadingGraficos(true);
    const { de, ate } = limitesDoMes(mesSel);
    listFaturamentoDiario(de, ate)
      .then((d) => {
        if (ativo) setDias(d);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar o faturamento diário.");
      })
      .finally(() => {
        if (ativo) setLoadingGraficos(false);
      });
    return () => {
      ativo = false;
    };
  }, [mesSel, recarga]);

  useEffect(() => {
    let ativo = true;
    setLoadingClientes(true);
    listFaturamentoPorCliente(periodoCliente.de, periodoCliente.ate)
      .then((r) => {
        if (ativo) setClientes(r);
      })
      .catch((e) => {
        if (ativo) {
          setClientes([]);
          setErro(e instanceof Error ? e.message : "Não foi possível carregar o faturamento por cliente.");
        }
      })
      .finally(() => {
        if (ativo) setLoadingClientes(false);
      });
    return () => {
      ativo = false;
    };
  }, [periodoCliente.de, periodoCliente.ate, recarga]);

  const totalMes = useMemo(() => dias.reduce((s, d) => s + d.valor_frete, 0), [dias]);
  // faturas vencidas: retrato de hoje (não depende do período dos filtros)
  useEffect(() => {
    let ativo = true;
    setLoadingVencidas(true);
    getFaturasVencidas()
      .then((r) => {
        if (!ativo) return;
        setVencidas(r.clientes);
        setFaixas(r.faixas);
      })
      .catch((e) => {
        if (ativo) {
          setVencidas([]);
          setErro(e instanceof Error ? e.message : "Não foi possível carregar as faturas vencidas.");
        }
      })
      .finally(() => {
        if (ativo) setLoadingVencidas(false);
      });
    return () => {
      ativo = false;
    };
  }, [recarga]);

  const totalVencidas = useMemo(() => vencidas.reduce((s, c) => ({ qtd: s.qtd + c.qtd_faturas, valor: s.valor + c.valor_total }), { qtd: 0, valor: 0 }), [vencidas]);

  const totalClientes = useMemo(() => clientes.reduce((s, c) => s + c.valor_frete, 0), [clientes]);
  const qtdClientes = useMemo(() => clientes.reduce((s, c) => s + c.qtd_cte, 0), [clientes]);

  const maxVencida = Math.max(...vencidas.map((c) => c.valor_total), 1);
  const maxCliente = Math.max(...clientes.map((c) => c.valor_frete), 1);

  return (
    <div className="space-y-8">
      {erro ? <Alerta>{erro}</Alerta> : null}

      <Section title="Situação do faturamento">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="CT-es emitidos" value={situacao ? formatBRLCompact(situacao.valorCteEmitido) : "-"} detalhe={situacao ? `${formatInt(situacao.qtdCteEmitidos)} CT-es` : undefined} icon={ReceiptText} />
          <Kpi label="Ainda não faturado" value={situacao ? formatBRLCompact(situacao.valorAFaturar) : "-"} detalhe={situacao ? `${formatInt(situacao.qtdAFaturar)} CT-es` : undefined} icon={Hourglass} />
          <Kpi label="Faturado" value={situacao ? formatBRLCompact(situacao.valorFaturado) : "-"} detalhe={situacao ? `${formatInt(situacao.qtdFaturado)} CT-es` : undefined} icon={FileCheck2} />
          <Kpi label="Vencido" value={situacao ? formatBRLCompact(situacao.valorAtrasado) : "-"} detalhe={situacao ? `${formatInt(situacao.qtdAtrasado)} CT-es` : undefined} icon={XCircle} tone="alert" />
          <Kpi label="Cobrado (liquidado)" value={situacao ? formatBRLCompact(situacao.valorLiquidado) : "-"} detalhe={situacao ? `${formatInt(situacao.qtdLiquidado)} CT-es` : undefined} icon={Banknote} />
        </div>
        <p className="text-xs text-brand-border">Os totais por situação consideram os meses inteiros que tocam o período.</p>
      </Section>

      <Section title="Faturamento por emissão">
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Faturamento por mês</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {meses.length === 0 ? (
                <p className="py-20 text-center text-sm text-brand-border">Sem faturamento nos últimos meses.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={meses}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="mes" tickFormatter={formatMes} fontSize={12} />
                    <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} fontSize={12} width={72} />
                    <Tooltip labelFormatter={(l) => formatMes(String(l))} formatter={(v) => formatBRL(Number(v))} />
                    <Legend />
                    <Bar dataKey="valor_frete" name="Faturado" fill={COLORS.primary} radius={[4, 4, 0, 0]} onClick={(_, index) => setMesSel(meses[index]?.mes ?? mesSel)} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Faturamento diário - {formatMes(mesSel)}</CardTitle>
              <p className="mt-1 text-xs text-brand-border">Total do mês: {formatBRL(totalMes)}. Clique numa barra do gráfico ao lado para trocar o mês.</p>
            </CardHeader>
            <CardContent className="h-72">
              {loadingGraficos ? (
                <p className="py-20 text-center text-sm text-brand-border">Carregando...</p>
              ) : dias.length === 0 ? (
                <p className="py-20 text-center text-sm text-brand-border">Sem faturamento neste mês.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dias}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="dia" tickFormatter={formatISOShort} fontSize={12} />
                    <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} fontSize={12} width={72} />
                    <Tooltip labelFormatter={(l) => formatDateBR(String(l))} formatter={(v) => formatBRL(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="valor_frete" name="Faturado no dia" stroke={COLORS.accent} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      <div className="grid gap-8 xl:grid-cols-2 xl:gap-4">
        <Section title="Faturas vencidas por cliente">
          <Card>
            <CardHeader className="flex min-h-24 flex-col justify-center">
              <CardTitle>Total vencido: {formatBRL(totalVencidas.valor)}</CardTitle>
              <p className="mt-1 text-xs text-brand-border">
                {formatInt(totalVencidas.qtd)} fatura{totalVencidas.qtd === 1 ? "" : "s"} de {formatInt(vencidas.length)} cliente{vencidas.length === 1 ? "" : "s"}. Situação de hoje, sem filtro de período.
              </p>
            </CardHeader>
            <CardContent className="h-[32rem] space-y-3 overflow-y-auto">
              {loadingVencidas ? <p className="text-sm text-brand-border">Carregando...</p> : null}
              {!loadingVencidas && vencidas.length === 0 ? <p className="text-sm text-brand-border">Nenhuma fatura vencida.</p> : null}
              {vencidas.map((c) => (
                <div key={`${c.cliente}:${c.cnpj ?? ""}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium" title={c.cliente}>{c.cliente}</span>
                    <span className="shrink-0 tabular-nums text-brand-border">{formatBRL(c.valor_total)} · {formatInt(c.qtd_faturas)} fatura{c.qtd_faturas === 1 ? "" : "s"}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-brand-muted">
                    <div className="h-full rounded-full bg-brand-red/50" style={{ width: `${(c.valor_total / maxVencida) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        <Section title="Faturamento por cliente">
          <Card>
            <CardHeader className="flex min-h-24 flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>
                  {formatDateBR(periodoCliente.de)} a {formatDateBR(periodoCliente.ate)}
                </CardTitle>
                <p className="mt-1 text-xs text-brand-border">
                  Total do período: {formatBRL(totalClientes)} em {formatInt(qtdClientes)} CT-es, {formatInt(clientes.length)} cliente{clientes.length === 1 ? "" : "s"}.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 text-xs font-semibold text-brand-border">
                  De
                  <input type="date" className={cn(dataClass, "block w-auto")} value={periodoCliente.de} max={periodoCliente.ate || undefined} onChange={(e) => e.target.value && setPeriodoCliente((p) => ({ ...p, de: e.target.value }))} />
                </label>
                <label className="space-y-1 text-xs font-semibold text-brand-border">
                  Até
                  <input type="date" className={cn(dataClass, "block w-auto")} value={periodoCliente.ate} min={periodoCliente.de || undefined} onChange={(e) => e.target.value && setPeriodoCliente((p) => ({ ...p, ate: e.target.value }))} />
                </label>
              </div>
            </CardHeader>
            <CardContent className="h-[32rem] space-y-3 overflow-y-auto">
              {loadingClientes ? <p className="text-sm text-brand-border">Carregando...</p> : null}
              {!loadingClientes && clientes.length === 0 ? <p className="text-sm text-brand-border">Sem faturamento no período.</p> : null}
              {clientes.map((c) => (
                <div key={`${c.cliente}:${c.cnpj ?? ""}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium" title={c.cliente}>{c.cliente}</span>
                    <span className="shrink-0 tabular-nums text-brand-border">{formatBRL(c.valor_frete)} · {formatInt(c.qtd_cte)} CT-es</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-brand-muted">
                    <div className="h-full rounded-full bg-brand-accent" style={{ width: `${(c.valor_frete / maxCliente) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>
      </div>

      <Cobranca faixas={faixas} loadingFaixas={loadingVencidas} recarga={recarga} />
      <TicketMedio recarga={recarga} />
    </div>
  );
}

function Cobranca({ faixas, loadingFaixas, recarga }: { faixas: FaixaAtraso[]; loadingFaixas: boolean; recarga: number }) {
  const [meses, setMeses] = useState<InadimplenciaMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    listInadimplenciaMensal(6)
      .then((r) => {
        if (ativo) setMeses(r);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar a inadimplência.");
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [recarga]);

  const totalVencido = faixas.reduce((s, f) => s + f.valor, 0);
  const qtdVencida = faixas.reduce((s, f) => s + f.qtd, 0);

  return (
    <Section title="Cobrança">
      {erro ? <Alerta>{erro}</Alerta> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Faixas de atraso</CardTitle>
            <p className="mt-1 text-xs text-brand-border">
              {formatBRL(totalVencido)} vencidos em {formatInt(qtdVencida)} fatura{qtdVencida === 1 ? "" : "s"}, por dias de atraso. Situação de hoje.
            </p>
          </CardHeader>
          <CardContent className="h-72">
            {loadingFaixas ? (
              <p className="py-20 text-center text-sm text-brand-border">Carregando...</p>
            ) : qtdVencida === 0 ? (
              <p className="py-20 text-center text-sm text-brand-border">Nenhuma fatura vencida.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={faixas}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="faixa" fontSize={12} />
                  <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} fontSize={12} width={72} />
                  <Tooltip formatter={(v, _n, item) => [formatBRL(Number(v)), `Vencido (${formatInt(item.payload.qtd)} faturas)`]} />
                  <Legend />
                  <Bar dataKey="valor" name="Valor vencido" fill={COLORS.red} fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inadimplência por mês</CardTitle>
            <p className="mt-1 text-xs text-brand-border">Percentual do valor faturado em cada mês que está vencido e não pago. Meses antigos só têm as faturas já carregadas do SSW.</p>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <p className="py-20 text-center text-sm text-brand-border">Carregando...</p>
            ) : meses.length === 0 ? (
              <p className="py-20 text-center text-sm text-brand-border">Sem faturas nos últimos meses.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={meses}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={formatMes} fontSize={12} />
                  <YAxis tickFormatter={(v) => `${v}%`} fontSize={12} width={48} />
                  <Tooltip
                    labelFormatter={(l) => formatMes(String(l))}
                    formatter={(v, _n, item) => [formatPct(Number(v)), `Inadimplência (${formatBRL(item.payload.vencido)} de ${formatBRL(item.payload.faturado)})`]}
                  />
                  <Legend />
                  <Bar dataKey="pct" name="Inadimplência" fill={COLORS.red} fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function TicketMedio({ recarga }: { recarga: number }) {
  const [meses, setMeses] = useState<TicketMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    listTicketMensal(6)
      .then((r) => {
        if (ativo) setMeses(r);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar o ticket médio.");
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [recarga]);

  const grafico = (chave: "ticketCte" | "ticketCliente", nome: string, detalhe: (m: TicketMes) => string) => (
    <CardContent className="h-72">
      {loading ? (
        <p className="py-20 text-center text-sm text-brand-border">Carregando...</p>
      ) : meses.length === 0 ? (
        <p className="py-20 text-center text-sm text-brand-border">Sem faturamento nos últimos meses.</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={meses}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="mes" tickFormatter={formatMes} fontSize={12} />
            <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} fontSize={12} width={72} />
            <Tooltip labelFormatter={(l) => formatMes(String(l))} formatter={(v, _n, item) => [formatBRL(Number(v)), `${nome} (${detalhe(item.payload as TicketMes)})`]} />
            <Legend />
            <Bar dataKey={chave} name={nome} fill={COLORS.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </CardContent>
  );

  return (
    <Section title="Ticket médio">
      {erro ? <Alerta>{erro}</Alerta> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ticket médio por CT-e</CardTitle>
            <p className="mt-1 text-xs text-brand-border">Frete emitido no mês dividido pela quantidade de CT-es.</p>
          </CardHeader>
          {grafico("ticketCte", "Por CT-e", (m) => `${formatInt(m.qtd_cte)} CT-es`)}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ticket médio por cliente</CardTitle>
            <p className="mt-1 text-xs text-brand-border">Frete emitido no mês dividido pela quantidade de clientes atendidos.</p>
          </CardHeader>
          {grafico("ticketCliente", "Por cliente", (m) => `${formatInt(m.clientes)} clientes`)}
        </Card>
      </div>
    </Section>
  );
}

/** Botões de exportação: baixam todas as linhas dos filtros atuais (não só a página). */
function BarraExportar({ total, exportando, onPdf, onExcel }: { total: number; exportando: "" | "pdf" | "excel"; onPdf: () => void; onExcel: () => void }) {
  const ocupado = exportando !== "";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-brand-border">{formatInt(total)} registro{total === 1 ? "" : "s"} nos filtros atuais</p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={ocupado || total === 0} onClick={onPdf} title="Imprimir / baixar em PDF todos os registros dos filtros atuais">
          {exportando === "pdf" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
          PDF
        </Button>
        <Button variant="secondary" disabled={ocupado || total === 0} onClick={onExcel} title="Exportar para Excel todos os registros dos filtros atuais">
          {exportando === "excel" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="size-4" aria-hidden="true" />}
          Excel
        </Button>
      </div>
    </div>
  );
}

type ItemCard = { chave: string; rotulo: string; icone: LucideIcon; alerta?: boolean };

/** Um card por situação existente; clicar filtra a lista, clicar de novo remove o filtro. Nunca quebra linha: rola para o lado. */
function CardsSituacao({ itens, resumo, selecionada, onSelect }: { itens: ItemCard[]; resumo: ResumoSituacao; selecionada: string; onSelect: (chave: string) => void }) {
  if (!itens.length) return null;
  return (
    <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1" role="group" aria-label="Filtrar por situação">
      {itens.map(({ chave, rotulo, icone: Icone, alerta }) => {
        const ativo = selecionada === chave;
        return (
          <button
            key={chave}
            type="button"
            aria-pressed={ativo}
            onClick={() => onSelect(ativo ? "" : chave)}
            title={ativo ? "Clique para remover o filtro" : `Filtrar: ${rotulo}`}
            className={cn(
              "flex min-w-48 flex-1 shrink-0 items-center gap-4 rounded-lg border bg-white p-4 text-left shadow-[0_12px_40px_rgba(10,17,25,0.06)] transition hover:border-brand-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-accent",
              ativo ? "border-brand-accent ring-2 ring-brand-accent/40" : "border-brand-border/15",
            )}
          >
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", alerta ? "bg-brand-red/10 text-brand-red" : "bg-brand-primary/10 text-brand-primary")}>
              <Icone className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-brand-border">{rotulo}</span>
              <span className="block truncate text-2xl font-bold tabular-nums">{formatInt(resumo[chave]?.qtd ?? 0)}</span>
              <span className="block truncate text-xs text-brand-border">{formatBRL(resumo[chave]?.valor ?? 0)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const ORDEM_SITUACAO_CTRC = ["PENDENTE_FATURAMENTO", "FATURADO", "ATRASADO", "CONCLUIDO", "CANCELADO", "SEM_INFORMACAO"] as const;

const ORDEM_SITUACAO_FATURA = ["ABERTA", "ATRASADA", "LIQUIDADA", "CANCELADA"] as const;

function diasVencidos(f: FaturaItem) {
  if (f.situacao !== "ATRASADA") return null;
  if (f.dias_atraso != null) return f.dias_atraso;
  return f.vencimento ? Math.max(diasEntre(f.vencimento, toISODate(new Date())), 0) : 0;
}

function FaturasLista({ periodo, cliente, numero, recarga }: { periodo: Periodo; cliente: string; numero: string; recarga: number }) {
  const [page, setPage] = useState(1);
  const [situacao, setSituacao] = useState("");
  const [rows, setRows] = useState<FaturaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoSituacao>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [detalhe, setDetalhe] = useState<FaturaItem | null>(null);
  const [exportando, setExportando] = useState<"" | "pdf" | "excel">("");

  async function exportar(tipo: "pdf" | "excel") {
    setExportando(tipo);
    setErro("");
    try {
      const todas = await listTodasFaturas({ de: periodo.de, ate: periodo.ate, cliente, fatura: numero, situacao });
      const filtros = descreverFiltros({ de: periodo.de, ate: periodo.ate, cliente, numero, situacao }, (c) => SITUACAO_FATURA[c]?.rotulo ?? c);
      if (tipo === "pdf") await exportFaturasPdf(todas, filtros);
      else exportFaturasExcel(todas, filtros);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível exportar as faturas.");
    } finally {
      setExportando("");
    }
  }

  useEffect(() => {
    setPage(1);
  }, [periodo.de, periodo.ate, cliente, numero, situacao]);

  // cards: contagem por situação com os filtros da lista (menos a própria situação)
  useEffect(() => {
    let ativo = true;
    getFaturasResumo({ de: periodo.de, ate: periodo.ate, cliente, fatura: numero })
      .then((r) => {
        if (ativo) setResumo(r);
      })
      .catch(() => {
        if (ativo) setResumo({});
      });
    return () => {
      ativo = false;
    };
  }, [periodo.de, periodo.ate, cliente, numero, recarga]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const r = await listFaturas({ page, pageSize, de: periodo.de, ate: periodo.ate, cliente, fatura: numero, situacao });
      setRows(r.data);
      setTotal(r.count);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as faturas.");
    } finally {
      setLoading(false);
    }
  }, [page, periodo.de, periodo.ate, cliente, numero, situacao]);

  useEffect(() => {
    carregar();
  }, [carregar, recarga]);

  const colunas: DataGridColumn<FaturaItem>[] = [
    { key: "fatura", header: "Fatura", className: "whitespace-nowrap font-semibold", render: (f) => f.fatura ?? "-" },
    { key: "cliente", header: "Cliente", render: (f) => <span className="block max-w-64 truncate" title={f.cliente ?? undefined}>{f.cliente ?? "-"}</span> },
    { key: "emissao", header: "Emissão", className: "whitespace-nowrap", render: (f) => formatDateBR(f.emissao) },
    { key: "vencimento", header: "Vencimento", className: "whitespace-nowrap", render: (f) => formatDateBR(f.vencimento) },
    {
      key: "dias",
      header: "Dias vencidos",
      className: "whitespace-nowrap",
      render: (f) => {
        if (f.situacao === "CANCELADA") return <span className="text-brand-border">-</span>;
        const dias = diasVencidos(f);
        return dias == null ? <Badge variant="success">No Prazo</Badge> : <span className="font-semibold tabular-nums text-brand-red">{dias} {dias === 1 ? "dia" : "dias"}</span>;
      },
    },
    { key: "situacao", header: "Situação", render: (f) => <BadgeFatura situacao={f.situacao} atraso={null} /> },
    { key: "qtd", header: "CTRCs", className: "text-right tabular-nums", render: (f) => formatInt(f.qtd_ctrcs ?? 0) },
    { key: "valor", header: "Valor", className: "text-right tabular-nums", render: (f) => formatBRL(Number(f.valor_fatura ?? 0)) },
    { key: "saldo", header: "Saldo", className: "text-right tabular-nums", render: (f) => formatBRL(Number(f.saldo ?? 0)) },
    {
      key: "acoes",
      header: "",
      className: "text-right",
      render: (f) => (
        <button
          type="button"
          title="Ver detalhes da fatura"
          aria-label={`Ver detalhes da fatura ${f.fatura ?? ""}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
          onClick={() => setDetalhe(f)}
        >
          <Eye className="size-4" aria-hidden="true" />
        </button>
      ),
    },
  ];

  const cards: ItemCard[] = ORDEM_SITUACAO_FATURA.filter((chave) => (resumo[chave]?.qtd ?? 0) > 0 || chave === situacao).map((chave) => ({
    chave,
    rotulo: SITUACAO_FATURA[chave].rotulo,
    icone: chave === "ATRASADA" ? XCircle : chave === "LIQUIDADA" ? Banknote : chave === "CANCELADA" ? X : Hourglass,
    alerta: chave === "ATRASADA",
  }));

  return (
    <div className="space-y-4">
      {erro ? <Alerta>{erro}</Alerta> : null}
      <CardsSituacao itens={cards} resumo={resumo} selecionada={situacao} onSelect={setSituacao} />
      <BarraExportar total={total} exportando={exportando} onPdf={() => exportar("pdf")} onExcel={() => exportar("excel")} />
      <DataGrid columns={colunas} rows={rows} loading={loading} getRowId={(f) => `${f.dominio}:${f.chave_linha}`} emptyTitle="Nenhuma fatura encontrada." emptyDescription="Ajuste o período ou os filtros." />
      <Paginacao page={page} total={total} rotulo="fatura" onPage={setPage} />
      {detalhe ? <FaturaDetalhe key={`${detalhe.dominio}:${detalhe.chave_linha}`} fatura={detalhe} onClose={() => setDetalhe(null)} /> : null}
    </div>
  );
}

function ConhecimentosLista({ periodo, cliente, numero, recarga }: { periodo: Periodo; cliente: string; numero: string; recarga: number }) {
  const [page, setPage] = useState(1);
  const [situacao, setSituacao] = useState("");
  const [rows, setRows] = useState<CtrcFinanceiroItem[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoSituacao>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [detalhe, setDetalhe] = useState<CtrcFinanceiroItem | null>(null);
  const [exportando, setExportando] = useState<"" | "pdf" | "excel">("");

  async function exportar(tipo: "pdf" | "excel") {
    setExportando(tipo);
    setErro("");
    try {
      const todos = await listTodosCtrcs({ de: periodo.de, ate: periodo.ate, cliente, numero, situacao });
      const filtros = descreverFiltros({ de: periodo.de, ate: periodo.ate, cliente, numero, situacao }, (c) => SITUACAO_CTRC[c as SituacaoFinanceira]?.rotulo ?? c);
      if (tipo === "pdf") await exportCtrcsPdf(todos, filtros);
      else exportCtrcsExcel(todos, filtros);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível exportar os conhecimentos.");
    } finally {
      setExportando("");
    }
  }

  useEffect(() => {
    setPage(1);
  }, [periodo.de, periodo.ate, cliente, numero, situacao]);

  // cards: contagem por situação com os filtros da lista (menos a própria situação)
  useEffect(() => {
    let ativo = true;
    getCtrcsResumo({ de: periodo.de, ate: periodo.ate, cliente, numero })
      .then((r) => {
        if (ativo) setResumo(r);
      })
      .catch(() => {
        if (ativo) setResumo({});
      });
    return () => {
      ativo = false;
    };
  }, [periodo.de, periodo.ate, cliente, numero, recarga]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const r = await listCtrcsFinanceiro({ page, pageSize, de: periodo.de, ate: periodo.ate, cliente, numero, situacao });
      setRows(r.data);
      setTotal(r.count);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os conhecimentos.");
    } finally {
      setLoading(false);
    }
  }, [page, periodo.de, periodo.ate, cliente, numero, situacao]);

  useEffect(() => {
    carregar();
  }, [carregar, recarga]);

  const colunas: DataGridColumn<CtrcFinanceiroItem>[] = [
    { key: "ctrc", header: "CTRC", className: "whitespace-nowrap font-semibold", render: (c) => c.ctrc ?? c.cte ?? "-" },
    { key: "emissao", header: "Emissão", className: "whitespace-nowrap", render: (c) => formatDateBR(c.data_autorizacao) },
    { key: "pagador", header: "Pagador", render: (c) => <span className="block max-w-64 truncate" title={c.pagador_nome ?? undefined}>{c.pagador_nome ?? "-"}</span> },
    { key: "frete", header: "Frete", className: "text-right tabular-nums", render: (c) => formatBRL(Number(c.valor_frete ?? 0)) },
    {
      key: "situacao",
      header: "Situação",
      render: (c) => {
        const s = SITUACAO_CTRC[c.situacao_financeira] ?? SITUACAO_CTRC.SEM_INFORMACAO;
        return <Badge variant={s.variante}>{s.rotulo}</Badge>;
      },
    },
    { key: "fatura", header: "Fatura", className: "whitespace-nowrap", render: (c) => c.fatura ?? "-" },
    { key: "venc", header: "Vencimento", className: "whitespace-nowrap", render: (c) => formatDateBR(c.fatura_vencimento) },
    {
      key: "dias",
      header: "Dias vencidos",
      className: "whitespace-nowrap",
      render: (c) => {
        if (c.situacao_financeira === "CANCELADO") return <span className="text-brand-border">-</span>;
        if (c.situacao_financeira !== "ATRASADO") return <Badge variant="success">No Prazo</Badge>;
        const dias = c.dias_atraso ?? (c.fatura_vencimento ? Math.max(diasEntre(c.fatura_vencimento, toISODate(new Date())), 0) : 0);
        return <span className="font-semibold tabular-nums text-brand-red">{dias} {dias === 1 ? "dia" : "dias"}</span>;
      },
    },
    { key: "liq", header: "Liquidado em", className: "whitespace-nowrap", render: (c) => formatDateBR(c.data_liquidacao) },
    {
      key: "acoes",
      header: "",
      className: "text-right",
      render: (c) => (
        <button
          type="button"
          title="Ver detalhes financeiros do conhecimento"
          aria-label={`Ver detalhes do conhecimento ${c.ctrc ?? ""}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
          onClick={() => setDetalhe(c)}
        >
          <Eye className="size-4" aria-hidden="true" />
        </button>
      ),
    },
  ];

  const cards: ItemCard[] = ORDEM_SITUACAO_CTRC.filter((chave) => (resumo[chave]?.qtd ?? 0) > 0 || chave === situacao).map((chave) => ({
    chave,
    rotulo: SITUACAO_CTRC[chave].rotulo,
    icone: chave === "ATRASADO" ? XCircle : chave === "CONCLUIDO" ? Banknote : chave === "FATURADO" ? FileCheck2 : chave === "CANCELADO" ? X : Hourglass,
    alerta: chave === "ATRASADO",
  }));

  return (
    <div className="space-y-4">
      {erro ? <Alerta>{erro}</Alerta> : null}
      <CardsSituacao itens={cards} resumo={resumo} selecionada={situacao} onSelect={setSituacao} />
      <BarraExportar total={total} exportando={exportando} onPdf={() => exportar("pdf")} onExcel={() => exportar("excel")} />
      <DataGrid columns={colunas} rows={rows} loading={loading} getRowId={(c) => `${c.dominio}:${c.ctrc ?? c.cte}`} emptyTitle="Nenhum conhecimento encontrado." emptyDescription="Ajuste o período ou os filtros." />
      <Paginacao page={page} total={total} rotulo="conhecimento" onPage={setPage} />
      {detalhe ? <CtrcDetalhe key={`${detalhe.dominio}:${detalhe.ctrc ?? detalhe.cte}`} conhecimento={detalhe} onClose={() => setDetalhe(null)} /> : null}
    </div>
  );
}

function BadgeFatura({ situacao, atraso }: { situacao: string | null; atraso: number | null }) {
  const s = SITUACAO_FATURA[situacao ?? ""];
  if (!s) return <span className="text-brand-border">{situacao ?? "-"}</span>;
  return (
    <Badge variant={s.variante}>
      {s.rotulo}
      {situacao === "ATRASADA" && atraso ? ` (${atraso}d)` : ""}
    </Badge>
  );
}

function Paginacao({ page, total, rotulo, onPage }: { page: number; total: number; rotulo: string; onPage: (p: number) => void }) {
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand-border/15 bg-white px-4 py-3 text-sm text-brand-border md:flex-row md:items-center md:justify-between">
      <span>
        Página {page} de {totalPaginas} - {formatInt(total)} {rotulo}
        {total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        <Button variant="secondary" disabled={page >= totalPaginas} onClick={() => onPage(page + 1)}>Próxima</Button>
      </div>
    </div>
  );
}

function Kpi({ label, value, detalhe, icon: Icon, tone = "default" }: { label: string; value: string; detalhe?: string; icon: LucideIcon; tone?: "default" | "alert" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", tone === "alert" ? "bg-brand-red/10 text-brand-red" : "bg-brand-primary/10 text-brand-primary")}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-brand-border">{label}</p>
          <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
          {detalhe ? <p className="truncate text-xs text-brand-border">{detalhe}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold uppercase text-brand-primary">{title}</h2>
      {children}
    </section>
  );
}

function Alerta({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-status-error/25 bg-status-error/10 px-4 py-3 text-sm font-semibold text-status-error">
      <TriangleAlert className="size-4" aria-hidden="true" />
      {children}
    </div>
  );
}

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-semibold uppercase text-brand-border">{rotulo}</Label>
      {children}
    </div>
  );
}
