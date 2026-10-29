import { isValidElement, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Package, Percent, Truck, Users, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatBRL, formatBRLCompact, formatInt, formatISOShort, formatPct, toISODate } from "../lib/format";
import { cn } from "../lib/utils";
import { loadDashboard, loadDashboardHistorico, type DashboardData, type RankItem, type DpeSerie, type ConhecimentosMes, type DpeRankItem } from "../services/dashboard";

const COLORS = { primary: "#12437f", accent: "#11a4de", red: "#c54852", grid: "#e6ebf2" };

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

function formatMonth(iso: string) {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function Kpi({ label, value, icon: Icon, tone = "default" }: { label: string; value: string; icon: LucideIcon; tone?: "default" | "alert" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", tone === "alert" ? "bg-brand-red/10 text-brand-red" : "bg-brand-primary/10 text-brand-primary")}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-brand-border">{label}</p>
          <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold uppercase text-brand-primary">{title}</h2>
      {children}
    </section>
  );
}

function containsDataKey(node: React.ReactNode, dataKey: string): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some((child) => containsDataKey(child, dataKey));
  if (!isValidElement(node)) return false;
  const props = node.props as { dataKey?: string; children?: React.ReactNode };
  return props.dataKey === dataKey || containsDataKey(props.children, dataKey);
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  const isKnowledgeChart = containsDataKey(children, "total");
  return (
    <Card className={cn(isKnowledgeChart && "xl:col-span-2", className)}>
      <CardHeader>
        <CardTitle>{isKnowledgeChart ? "Conhecimentos emitidos" : title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">{children}</CardContent>
    </Card>
  );
}

function RankTable({ title, items }: { title: string; items: RankItem[] }) {
  const max = Math.max(...items.map((i) => i.frete), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? <p className="text-sm text-brand-border">Sem dados no período.</p> : null}
        {items.map((i) => (
          <div key={i.nome} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium" title={i.nome}>{i.nome}</span>
              <span className="shrink-0 tabular-nums text-brand-border">{formatBRLCompact(i.frete)} · {formatInt(i.qtd)} CTRCs</span>
            </div>
            <div className="h-1.5 rounded-full bg-brand-muted">
              <div className="h-full rounded-full bg-brand-accent" style={{ width: `${(i.frete / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const META_DPE = 90;

function DpePerformanceList({ items }: { items: DpeRankItem[] }) {
  return (
    <div className="h-full space-y-3 overflow-y-auto pr-2">
      {items.map((item) => {
        const cor = item.dpe > META_DPE ? "bg-status-success" : item.dpe === META_DPE ? "bg-status-warning" : "bg-status-error";
        return (
          <div key={item.nome} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium" title={item.nome}>{item.nome}</span>
              <span className="shrink-0 tabular-nums text-brand-border">
                DPE {formatPct(item.dpe)} · {formatInt(item.total)} CTRCs · {formatInt(item.atrasos)} atrasos
              </span>
            </div>
            <div className="h-2 rounded-full bg-brand-muted">
              <div className={cn("h-full rounded-full transition-all", cor)} style={{ width: `${Math.max(0, Math.min(100, item.dpe))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const today = useMemo(() => toISODate(new Date()), []);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today);
  const [unidade, setUnidade] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [dpeHistorico, setDpeHistorico] = useState<DpeSerie | null>(null);
  const [dpeRanking, setDpeRanking] = useState<{ porMunicipio: DpeRankItem[]; porPlaca: DpeRankItem[] } | null>(null);
  const [conhecimentosHistorico, setConhecimentosHistorico] = useState<ConhecimentosMes[] | null>(null);
  const [mesDpe, setMesDpe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadDashboard({ from, to, unidade }, today)
      .then((result) => active && setData(result))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Não foi possível carregar o dashboard."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [from, to, unidade, today]);

  useEffect(() => {
    let active = true;
    loadDashboardHistorico(today).then(({ dpe, conhecimentos }) => {
      if (!active) return;
      setDpeHistorico(dpe);
      setDpeRanking({ porMunicipio: dpe.porMunicipio ?? [], porPlaca: dpe.porPlaca ?? [] });
      setConhecimentosHistorico(conhecimentos);
      setMesDpe((mesAtual) => mesAtual && dpe.porMes.some((m) => m.mes === mesAtual) ? mesAtual : dpe.porMes.at(-1)?.mes ?? null);
    }).catch(() => {
      if (!active) return;
      setDpeHistorico(null);
      setDpeRanking(null);
      setConhecimentosHistorico(null);
    });
    return () => {
      active = false;
    };
  }, [today]);

  const fieldClass = "h-10 rounded-md border border-brand-border/40 bg-white px-3 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25";
  const ultima = data?.ultimaCarga ? new Date(data.ultimaCarga.recebido_em).toLocaleString("pt-BR") : null;

  return (
    <div className="space-y-8 p-4 md:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-semibold text-brand-border">
          De
          <input type="date" className={cn(fieldClass, "block")} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-brand-border">
          Até
          <input type="date" className={cn(fieldClass, "block")} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-brand-border">
          Unidade de origem
          <select className={cn(fieldClass, "block min-w-40")} value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Todas</option>
            {data?.unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <p className="ml-auto text-xs text-brand-border">
          {ultima ? `Última carga SSW: ${ultima}` : "Sem carga SSW registrada"}
          {data?.ultimaCarga && data.ultimaCarga.ok === false ? " (com erro)" : ""}
        </p>
      </div>

      {error ? <div role="alert" className="rounded-md border border-status-error/25 bg-status-error/10 px-4 py-3 text-sm text-status-error">{error}</div> : null}
      {loading && !data ? <div className="py-20 text-center text-sm text-brand-border">Carregando indicadores...</div> : null}

      {/*
        const veiculos = linhasDeVeiculos(entregas.veiculos, entregas.romaneios);
        const agendamentos = resumoAgendamentos(entregas.agendamentos, today);
        const dpe = entregas.dpe[0]?.dpe_pct ?? null;
        return (
          <Section title="Entregas">
            <div className="grid grid-cols-7 gap-4">
              <Kpi label="Veículos em operação" value={formatInt(veiculos.filter((v) => v.emOperacao).length)} icon={Truck} />
              <Kpi label="DPE" value={formatPct(dpe)} icon={Percent} />
              <Kpi label="Atrasados" value={formatInt(entregas.atrasados.length)} icon={AlertTriangle} tone="alert" />
              <Kpi label="Pendências abertas" value={formatInt(entregas.pendencias.length)} icon={XCircle} tone="alert" />
              <Kpi label="Aguardando agendamento" value={formatInt(agendamentos.aguardando.length)} icon={Clock} />
              <Kpi label="Entregas agendadas" value={formatInt(agendamentos.agendadas.length)} icon={CheckCircle2} />
              <Kpi label="Veículos disponíveis" value={formatInt(veiculos.filter((v) => !v.emOperacao).length)} icon={Truck} />
            </div>
          </Section>
        );
      */}

      {data ? (
        <div className={cn("space-y-8 transition-opacity", loading && "opacity-50")}>
          <Section title="Operações">
            <div className="grid grid-cols-7 gap-4">
              <Kpi label="CTRCs emitidos" value={formatInt(data.operacoes.emitidos)} icon={Truck} />
              <Kpi label="Entregues" value={formatInt(data.operacoes.entregues)} icon={CheckCircle2} />
              <Kpi label="Em trânsito" value={formatInt(data.operacoes.emTransito)} icon={Clock} />
              <Kpi label="Atrasados" value={formatInt(data.operacoes.atrasados)} icon={AlertTriangle} tone="alert" />
              <Kpi label="Entrega no prazo (OTD)" value={formatPct(data.operacoes.otd)} icon={Percent} />
              <Kpi label="Peso transportado" value={`${formatInt(Math.round(data.operacoes.pesoKg / 1000))} t`} icon={Package} />
              <Kpi label="Cancelados" value={formatInt(data.operacoes.cancelados)} icon={XCircle} tone="alert" />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="DPE por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dpeHistorico?.porMes ?? []}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="mes" tickFormatter={formatMonth} fontSize={12} />
                    <YAxis fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip labelFormatter={(l) => formatMonth(String(l))} formatter={(v) => formatPct(Number(v))} />
                    <Legend />
                    <ReferenceLine y={90} stroke={COLORS.red} strokeDasharray="6 4" label={{ value: "Meta 90%", fill: COLORS.red, fontSize: 12, position: "insideTopRight" }} />
                    <Bar dataKey="dpe" name="DPE" fill={COLORS.primary} radius={[4, 4, 0, 0]} onClick={(_, index) => setMesDpe(dpeHistorico?.porMes[index]?.mes ?? null)} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title={`DPE por dia${mesDpe ? ` - ${formatMonth(mesDpe)}` : ""}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(dpeHistorico?.porDia ?? []).filter((item) => !mesDpe || item.dia.startsWith(mesDpe))}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="dia" tickFormatter={formatISOShort} fontSize={12} />
                    <YAxis fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip labelFormatter={(l) => formatISOShort(String(l))} formatter={(v) => formatPct(Number(v))} />
                    <Legend />
                    <ReferenceLine y={90} stroke={COLORS.red} strokeDasharray="6 4" label={{ value: "Meta 90%", fill: COLORS.red, fontSize: 12, position: "insideTopRight" }} />
                    <Line type="monotone" dataKey="dpe" name="DPE" stroke={COLORS.accent} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="DPE por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conhecimentosHistorico ?? data.operacoes.conhecimentosPorMes}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="mes" tickFormatter={formatMonth} fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip labelFormatter={(l) => formatMonth(String(l))} formatter={(v) => formatInt(Number(v))} />
                    <Legend />
                    <Bar dataKey="total" name="Conhecimentos" fill={COLORS.primary} radius={[4, 4, 0, 0]} onClick={(_, index) => setMesDpe((conhecimentosHistorico ?? data.operacoes.conhecimentosPorMes)[index]?.mes ?? null)} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="Performance DPE por município">
                {dpeRanking?.porMunicipio.length ? <DpePerformanceList items={dpeRanking.porMunicipio} /> : <p className="py-20 text-center text-sm text-brand-border">Sem dados de DPE por município.</p>}
              </ChartCard>
              <ChartCard title="Performance DPE por placa de veículo">
                {dpeRanking?.porPlaca.length ? <DpePerformanceList items={dpeRanking.porPlaca} /> : <p className="py-20 text-center text-sm text-brand-border">Sem dados de DPE por placa.</p>}
              </ChartCard>
            </div>
          </Section>

          <Section title="Faturamento">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Frete total" value={formatBRLCompact(data.faturamento.freteTotal)} icon={DollarSign} />
              <Kpi label="Ticket médio por CTRC" value={formatBRL(data.faturamento.ticketMedio)} icon={DollarSign} />
              <Kpi label="ICMS + ISS" value={formatBRLCompact(data.faturamento.impostos)} icon={Percent} />
              <Kpi label="Frete cancelado" value={formatBRLCompact(data.faturamento.freteCancelado)} icon={XCircle} tone="alert" />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="Frete por dia">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.faturamento.porDia}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="dia" tickFormatter={formatISOShort} fontSize={12} />
                    <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} fontSize={12} width={72} />
                    <Tooltip labelFormatter={(l) => formatISOShort(String(l))} formatter={(v) => formatBRL(Number(v))} />
                    <Area type="monotone" dataKey="frete" name="Frete" stroke={COLORS.primary} fill={COLORS.accent} fillOpacity={0.25} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Frete por UF de entrega">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.faturamento.porUf}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="nome" fontSize={12} />
                    <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} fontSize={12} width={72} />
                    <Tooltip formatter={(v) => formatBRL(Number(v))} />
                    <Bar dataKey="frete" name="Frete" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </Section>

          <Section title="Comercial">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Clientes pagadores ativos" value={formatInt(data.comercial.clientesAtivos)} icon={Users} />
              <Kpi label="Concentração top 5 (frete)" value={formatPct(data.comercial.concentracaoTop5)} icon={Percent} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <RankTable title="Top pagadores" items={data.comercial.topPagadores} />
              <RankTable title="Top remetentes" items={data.comercial.topRemetentes} />
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
