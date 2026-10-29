import { useMemo, useState } from "react";
import { ArrowRight, CalendarCheck, CalendarClock, ChevronRight, CircleCheck, Clock, Target, TrendingDown, TrendingUp, Truck, TriangleAlert } from "lucide-react";
import { Anel, PainelCard, TituloCard, TONS, VerTodos } from "./Painel";
import { Badge } from "../ui/badge";
import { atrasadosPorFaixa, calcularDpe, type LinhaRomaneio, type LinhaVeiculo, mesAno, mesCurto, META_DPE, pendenciasPorMotivo, placaComHifen, resumoAgendamentos, titulo } from "../../lib/entregasCalculos";
import { formatDateBR } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Atrasado, PainelEntregas, Pendencia } from "../../types/entrega";

const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");

/** Número grande do cartão (mesmo peso e fonte dos indicadores do Dashboard, só maior). */
function Numero({ valor, tom }: { valor: number; tom: keyof typeof TONS }) {
  return <p className={cn("mt-4 text-5xl font-bold leading-none tabular-nums", TONS[tom].numero)}>{valor}</p>;
}

/* ───────────── Veículos / Motoristas ───────────── */

export function VeiculosCard({ linhas, romaneios = [], onVerTodos, onAbrirVeiculo }: { linhas: LinhaVeiculo[]; romaneios?: LinhaRomaneio[]; onVerTodos: () => void; onAbrirVeiculo: (veiculo: LinhaVeiculo) => void }) {
  const [placaFiltro, setPlacaFiltro] = useState("");
  const emOperacao = linhas.filter((l) => l.emOperacao).length;
  // Mantém todos os veículos no card, mas deixa os que estão em rota no topo.
  const listaBase = romaneios.length ? romaneios : [...linhas].sort(
    (a, b) => Number(b.emOperacao) - Number(a.emOperacao) || b.pendentes - a.pendentes || a.placa.localeCompare(b.placa),
  );
  const visiveis = listaBase.filter((l) => !placaFiltro || l.placa === placaFiltro);
  const placas = useMemo(() => [...new Set(listaBase.map((l) => l.placa))].sort(), [listaBase]);

  return (
    <PainelCard rotulo="Veículos e motoristas" className="flex h-full flex-col">
      <TituloCard
        icone={Truck}
        tom="primario"
        titulo="Veículos / Motoristas"
        subtitulo={`${emOperacao} em operação · ${linhas.length - emOperacao} disponíveis`}
        acao={
          <div className="flex items-center gap-2">
            <select
              value={placaFiltro}
              onChange={(e) => setPlacaFiltro(e.target.value)}
              className="h-8 max-w-32 rounded-md border border-brand-border/30 bg-white px-2 text-xs text-brand-dark outline-none focus:border-brand-primary"
              aria-label="Filtrar por placa"
            >
              <option value="">Todas as placas</option>
              {placas.map((placa) => <option key={placa} value={placa}>{placaComHifen(placa)}</option>)}
            </select>
            <VerTodos onClick={onVerTodos} rotulo="Ver todos os veículos e motoristas">Ver todos</VerTodos>
          </div>
        }
      />
      <ul className="mt-4 min-h-0 max-h-[27rem] flex-1 space-y-2.5 overflow-y-auto pr-1">
        {visiveis.map((l) => (
          <li
            key={`${l.placa}-${l.romaneio ?? "sem-romaneio"}`}
            className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-brand-border/15 bg-brand-surface px-4 py-2.5 transition hover:border-brand-primary/40 hover:bg-brand-primary/5"
            onClick={() => onAbrirVeiculo(l)}
          >
            <div className="min-w-0 flex-1 basis-40">
              <button
                type="button"
                title="Ver os conhecimentos deste veículo"
                aria-label={`Ver os conhecimentos do veículo ${placaComHifen(l.placa)}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand-border/30 bg-white px-2 py-1 font-mono text-xs font-bold tracking-wider shadow-sm transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onAbrirVeiculo(l);
                }}
              >
                <Truck className="size-3.5 text-brand-primary" aria-hidden="true" />
                {placaComHifen(l.placa)}
              </button>
              <p className="mt-1 truncate text-sm font-medium" title={l.motorista ? titulo(l.motorista) : undefined}>{titulo(l.motorista) || "Sem motorista"}</p>
              <p className="mt-0.5 truncate text-xs text-brand-border" title={l.romaneio ? `Rota ${l.romaneio}` : undefined}>
                {l.romaneio ? (
                  <>
                    Rota {l.romaneio}
                    {"dataEmissao" in l && (l as LinhaRomaneio).dataEmissao ? ` - Emissao: ${formatDateBR((l as LinhaRomaneio).dataEmissao)}` : null}
                  </>
                ) : "Sem rota aberta"}
              </p>
            </div>
            <div className="flex w-full flex-col items-start gap-1.5 sm:w-auto sm:items-end">
              <div className="flex flex-wrap justify-start gap-1.5 sm:justify-end">
                {l.total > 0 ? <Badge variant={l.realizadas > 0 ? "success" : "neutral"}>Entregues: {l.realizadas}/{l.total}</Badge> : null}
                {l.pendentes > 0 ? <Badge variant="warning">Pendentes: {l.pendentes}</Badge> : null}
                {l.insucessos > 0 ? <Badge variant="danger">Insucessos: {l.insucessos}</Badge> : null}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-brand-border">
                <span className={cn("size-2 rounded-full", l.emOperacao ? "bg-status-success" : "bg-brand-border/50")} aria-hidden="true" />
                {l.emOperacao ? "Em operação" : "Disponível"}
              </p>
            </div>
          </li>
        ))}
        {!visiveis.length ? <li className="py-10 text-center text-sm text-brand-border">Nenhum veículo com romaneio nas últimas cargas.</li> : null}
      </ul>
      <button type="button" onClick={onVerTodos} className="mt-3 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand-primary transition hover:underline">
        Ver todos veículos / motoristas <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </PainelCard>
  );
}

/* ───────────── DPE ───────────── */

export function DpeCard({ dpe }: { dpe: PainelEntregas["dpe"] }) {
  const { atual, variacao, serie } = calcularDpe(dpe);
  const valor = atual?.dpe_pct ?? 0;
  const abaixoMeta = Boolean(atual && valor < META_DPE);

  return (
    <PainelCard rotulo="DPE, eficiência de entrega" className="flex h-full flex-col">
      <TituloCard icone={TrendingUp} tom={abaixoMeta ? "vermelho" : "primario"} titulo="DPE" subtitulo="Eficiência de entrega (entregas no prazo)" />

      <div className="my-3 flex-1">
        <Anel valor={valor} meta={META_DPE} alerta={abaixoMeta} rotulo={atual ? `DPE de ${mesAno(atual.mes)}: ${fmt1(valor)} por cento, meta ${META_DPE} por cento` : "Sem dados de DPE"}>
          {atual ? (
            <>
              <p className={cn("text-5xl font-bold leading-none tracking-tight tabular-nums", abaixoMeta && "text-brand-red")}>
                {fmt1(valor).replace(",0", "")}
                <span className="text-2xl">%</span>
              </p>
              {variacao != null ? (
                <p className={cn("mt-2 flex items-center gap-1 text-base font-bold", variacao >= 0 ? "text-status-success" : "text-brand-red")}>
                  {variacao >= 0 ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
                  {variacao >= 0 ? "+" : ""}
                  {fmt1(variacao)} pts
                </p>
              ) : null}
              <p className="text-xs text-brand-border">vs. período anterior</p>
            </>
          ) : (
            <p className="text-sm text-brand-border">Sem entregas no período</p>
          )}
        </Anel>
      </div>

      {serie.length > 1 ? (
        <div className="mt-2 flex items-end justify-between gap-1.5" aria-label="DPE dos últimos meses">
          {serie.map((s) => (
            <div key={s.mes} className="flex flex-1 flex-col items-center gap-1" title={`${mesAno(s.mes)}: ${fmt1(s.dpe_pct)}% (${s.no_prazo} de ${s.entregues} no prazo)`}>
              <span className="text-[10px] font-semibold tabular-nums text-brand-border">{Math.round(s.dpe_pct)}</span>
              <div className="relative flex h-16 w-full items-end rounded-sm bg-brand-muted">
                <div className={cn("w-full rounded-sm", s.dpe_pct >= META_DPE ? "bg-status-success" : "bg-brand-red")} style={{ height: `${Math.max(4, Math.min(100, s.dpe_pct))}%` }} />
                <span className="absolute inset-x-0 border-t border-dashed border-brand-dark/40" style={{ bottom: `${META_DPE}%` }} aria-hidden="true" />
              </div>
              <span className="text-[10px] text-brand-border">{mesCurto(s.mes)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <footer className="mt-4 grid grid-cols-2 gap-3 border-t border-brand-border/15 pt-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <Target className="size-5 text-brand-primary" aria-hidden="true" />
          Meta: {META_DPE}%
        </p>
        <p className="flex items-center gap-2 border-l border-brand-border/15 pl-3 font-semibold">
          <CalendarCheck className="size-5 text-brand-primary" aria-hidden="true" />
          Período: {atual ? mesAno(atual.mes) : "-"}
        </p>
      </footer>
    </PainelCard>
  );
}

/* ───────────── Atrasados ───────────── */

const BARRAS_FAIXA = ["bg-status-warning", "bg-orange-500", "bg-brand-red"];

export function AtrasadosCard({ atrasados, onVerTodos }: { atrasados: Atrasado[]; onVerTodos: () => void }) {
  const faixas = atrasadosPorFaixa(atrasados);
  const maximo = Math.max(...faixas.map((f) => f.total), 1);

  return (
    <PainelCard rotulo="Atrasados" className="h-full">
      <TituloCard icone={Clock} tom="vermelho" titulo="Atrasados" acao={<VerTodos onClick={onVerTodos} rotulo="Ver todos os atrasados">Ver todos</VerTodos>} />
      <Numero valor={atrasados.length} tom="vermelho" />
      <p className="mt-2 text-sm font-semibold">Entregas em atraso</p>
      <p className="text-xs text-brand-border">Previsão vencida nos últimos 30 dias, sem entrega</p>
      <ul className="mt-4 space-y-3 border-t border-brand-border/15 pt-4">
        {faixas.map((f, i) => (
          <li key={f.faixa}>
            <div className="flex items-center justify-between text-sm">
              <span>{f.faixa === "mais de 3 dias" ? "Mais de 3 dias" : f.faixa}</span>
              <span className="flex items-center gap-2 font-bold tabular-nums">
                {f.total}
                <span className={cn("size-2 rounded-full", BARRAS_FAIXA[i])} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-brand-muted">
              <div className={cn("h-full rounded-full", BARRAS_FAIXA[i])} style={{ width: `${(f.total / maximo) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </PainelCard>
  );
}

/* ───────────── Aguardando agendamento ───────────── */

export function AguardandoCard({ agendamentos, hoje, onVerTodos }: { agendamentos: PainelEntregas["agendamentos"]; hoje: string; onVerTodos: () => void }) {
  const { aguardando, aguardandoVencidas } = resumoAgendamentos(agendamentos, hoje);

  return (
    <PainelCard rotulo="Aguardando agendamento" className="h-full">
      <TituloCard icone={CalendarClock} tom="azul" titulo="Aguardando agendamento" acao={<VerTodos onClick={onVerTodos} rotulo="Ver todos aguardando agendamento">Ver todos</VerTodos>} />
      <Numero valor={aguardando.length} tom="azul" />
      <p className="mt-2 text-sm font-semibold">Agendamentos pendentes</p>
      <p className="text-xs text-brand-border">Cliente ainda não confirmou a data</p>
      <div className="my-4 flex justify-center text-brand-accent/40" aria-hidden="true">
        <CalendarClock className="size-20" strokeWidth={1.2} />
      </div>
      <p className="flex items-center gap-2 border-t border-brand-border/15 pt-4 text-sm">
        <span className={cn("size-2 rounded-full", aguardandoVencidas > 0 ? "bg-brand-red" : "bg-status-success")} aria-hidden="true" />
        {aguardandoVencidas > 0 ? `${aguardandoVencidas} com previsão vencida` : "Nenhum com previsão vencida"}
      </p>
    </PainelCard>
  );
}

/* ───────────── Pendências (insucessos) ───────────── */

export function PendenciasCard({ pendencias, onVerTodos }: { pendencias: Pendencia[]; onVerTodos: () => void }) {
  const motivos = pendenciasPorMotivo(pendencias);
  const maximo = Math.max(...motivos.map((m) => m.total), 1);

  return (
    <PainelCard rotulo="Pendências" className="h-full">
      <TituloCard icone={TriangleAlert} tom="amarelo" titulo="Pendências" acao={<VerTodos onClick={onVerTodos} rotulo="Ver todas as pendências">Ver todas</VerTodos>} />
      <Numero valor={pendencias.length} tom="amarelo" />
      <p className="mt-2 text-sm font-semibold">Pendências abertas</p>
      <p className="text-xs text-brand-border">Entregas com insucesso (recusa, local fechado…)</p>
      <ul className="mt-4 space-y-2 border-t border-brand-border/15 pt-4 text-sm">
        {motivos.slice(0, 3).map((m) => (
          <li key={m.motivo} className="flex items-center justify-between gap-3">
            <span className="truncate" title={m.motivo}>{titulo(m.motivo)}</span>
            <span className="font-bold tabular-nums">{m.total}</span>
          </li>
        ))}
        {!motivos.length ? <li className="text-brand-border">Nenhuma pendência aberta.</li> : null}
      </ul>
      {motivos.length ? (
        <div className="mt-4 flex h-14 items-end gap-2" aria-hidden="true">
          {motivos.slice(0, 6).map((m) => (
            <div key={m.motivo} className="flex-1 rounded-sm bg-status-warning" style={{ height: `${Math.max(12, (m.total / maximo) * 100)}%` }} title={`${titulo(m.motivo)}: ${m.total}`} />
          ))}
        </div>
      ) : null}
    </PainelCard>
  );
}

/* ───────────── Agendados ───────────── */

export function AgendadosCard({ agendamentos, hoje, onVerTodos }: { agendamentos: PainelEntregas["agendamentos"]; hoje: string; onVerTodos: () => void }) {
  const { agendadas, proximos } = resumoAgendamentos(agendamentos, hoje);

  return (
    <PainelCard rotulo="Agendados" className="h-full">
      <TituloCard icone={CalendarCheck} tom="verde" titulo="Agendados" acao={<VerTodos onClick={onVerTodos} rotulo="Ver todos os agendados">Ver todos</VerTodos>} />
      <Numero valor={agendadas.length} tom="verde" />
      <p className="mt-2 text-sm font-semibold">Entregas agendadas</p>
      <p className="text-xs text-brand-border">Data combinada com o cliente</p>
      <div className="my-4 flex items-center justify-center gap-6 text-status-success/35" aria-hidden="true">
        <CircleCheck className="size-14" strokeWidth={1.3} />
        <CalendarCheck className="size-14" strokeWidth={1.3} />
      </div>
      <button type="button" onClick={onVerTodos} className="group flex w-full items-center justify-between gap-2 border-t border-brand-border/15 pt-4 text-left text-sm transition hover:text-brand-primary">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold">
            <span className="size-2 rounded-full bg-status-success" aria-hidden="true" />
            Próximos agendamentos
          </span>
          {proximos.length ? (
            <span className="mt-1 block truncate text-xs text-brand-border">
              {proximos.map((p) => formatDateBR(p.entrega_programada).slice(0, 5)).filter((d, i, a) => a.indexOf(d) === i).join(" · ")} · {titulo(proximos[0].destinatario_nome)}
            </span>
          ) : null}
        </span>
        <ChevronRight className="size-5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </button>
    </PainelCard>
  );
}
