import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { Rosca } from "../components/entregas/Rosca";
import { Card } from "../components/ui/card";
import { brand } from "../lib/brand";
import { haTempo, META_DPE, placaComHifen, titulo } from "../lib/entregasCalculos";
import { type LinhaGestao, linhasGestao, totaisGestao } from "../lib/gestaoAVistaCalculos";
import { cn } from "../lib/utils";
import { type EstadoLive, useGestaoAVista } from "../hooks/useGestaoAVista";

const COLUNAS = "grid-cols-[minmax(0,2.2fr)_minmax(0,0.6fr)_repeat(4,minmax(0,0.85fr))_minmax(0,1fr)_minmax(0,1fr)]";
const COR_DIA = "#12437f";
const corDpe = (pct: number | null) => (pct == null ? "#4b535d" : pct >= META_DPE ? "#16a34a" : "#c54852");

const ROTULO_LIVE: Record<EstadoLive, { texto: string; cor: string }> = {
  "ao-vivo": { texto: "Ao vivo", cor: "bg-status-success" },
  conectando: { texto: "Conectando", cor: "bg-status-warning" },
  reconectando: { texto: "Reconectando", cor: "bg-status-warning" },
};

export function GestaoAVistaPage() {
  const { dados, erro, atualizadoEm, live, recarregar } = useGestaoAVista();
  const [agora, setAgora] = useState(Date.now());
  const [telaCheia, setTelaCheia] = useState(Boolean(document.fullscreenElement));

  const linhas = useMemo(() => (dados ? linhasGestao(dados.romaneios, dados.dpe) : []), [dados]);
  const totais = useMemo(() => totaisGestao(linhas), [linhas]);
  const metade = Math.ceil(linhas.length / 2);
  const colunas = [linhas.slice(0, metade), linhas.slice(metade)];

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  function alternarTelaCheia() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  const hora = new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const data = new Date(agora).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const mes = new Date(agora).toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="flex min-h-screen flex-col gap-2 bg-brand-surface p-3 text-brand-dark lg:h-screen lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/entregas" className="rounded-lg border border-brand-border/30 bg-white p-2 text-brand-border transition hover:border-brand-primary hover:text-brand-primary" aria-label="Voltar para Entregas" title="Voltar para Entregas">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <img src={brand.logo} alt={brand.companyName} className="h-8 w-28 object-contain object-left" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Gestão à vista · Entregas</h1>
            <p className="text-xs capitalize text-brand-border">{data}</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="flex items-center justify-end gap-2 text-xs text-brand-border">
              <span className={cn("size-2 rounded-full", erro ? "bg-brand-red" : ROTULO_LIVE[live].cor, live === "ao-vivo" && !erro && "animate-pulse")} aria-hidden="true" />
              {erro ? "Falha ao atualizar" : ROTULO_LIVE[live].texto}
              {atualizadoEm ? ` · atualizado ${haTempo(new Date(atualizadoEm).toISOString(), agora)}` : ""}
            </p>
            <p className="text-2xl font-bold tabular-nums leading-none">{hora}</p>
          </div>
          <button type="button" onClick={alternarTelaCheia} className="rounded-lg border border-brand-border/30 bg-white p-2 text-brand-border transition hover:border-brand-primary hover:text-brand-primary" aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"} title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}>
            {telaCheia ? <Minimize2 className="size-5" aria-hidden="true" /> : <Maximize2 className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {erro ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-status-error/25 bg-status-error/10 px-4 py-2 text-sm font-semibold text-status-error">
          {erro}
          <button type="button" onClick={recarregar} className="rounded-md border border-status-error/40 px-3 py-1 text-xs hover:bg-status-error/10">Tentar novamente</button>
        </div>
      ) : null}

      <section aria-label="Resumo do dia" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Resumo rotulo="Veículos em rota" valor={totais.veiculos} />
        <Resumo rotulo="Total de entregas" valor={totais.total} />
        <Resumo rotulo="Pendentes" valor={totais.pendentes} cor="text-amber-600" />
        <Resumo rotulo="Insucessos" valor={totais.insucessos} cor="text-brand-red" />
        <Resumo rotulo="Entregues no dia" valor={`${totais.pctDia}%`} cor="text-brand-primary" />
        <Resumo rotulo={`DPE geral · meta ${META_DPE}%`} valor={dados?.dpeGeral == null ? "—" : `${Math.round(dados.dpeGeral)}%`} cor={dados?.dpeGeral == null ? "text-brand-border" : dados.dpeGeral >= META_DPE ? "text-status-success" : "text-brand-red"} />
      </section>

      {!dados && !erro ? <p className="py-24 text-center text-brand-border">Carregando entregas...</p> : null}
      {dados && !linhas.length ? <p className="py-24 text-center text-xl text-brand-border">Nenhum veículo em rota com romaneio aberto.</p> : null}

      {linhas.length ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          {colunas.map((coluna, i) => (
            <div key={i} className="flex min-h-0 flex-col gap-1.5">
              <div className={cn("grid items-end gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-brand-border", COLUNAS)}>
                <span>Veículo / Motorista</span>
                <span className="text-center">Rom.</span>
                <span className="text-center">Total</span>
                <span className="text-center">Entregues</span>
                <span className="text-center">Pend.</span>
                <span className="text-center">Insuc.</span>
                <span className="text-center">Dia</span>
                <span className="text-center">DPE {mes}</span>
              </div>
              <div className="grid min-h-0 flex-1 auto-rows-[3.5rem] content-start gap-1.5 lg:auto-rows-auto lg:[grid-template-rows:repeat(var(--linhas),minmax(0,1fr))]" style={{ "--linhas": Math.max(metade, 1) } as CSSProperties}>
                {coluna.map((l) => <Linha key={l.placa} linha={l} />)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Resumo({ rotulo, valor, cor = "text-brand-dark" }: { rotulo: string; valor: number | string; cor?: string }) {
  return (
    <Card className="px-3 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-border">{rotulo}</p>
      <p className={cn("text-2xl font-bold tabular-nums leading-tight", cor)}>{valor}</p>
    </Card>
  );
}

function Linha({ linha: l }: { linha: LinhaGestao }) {
  return (
    <Card className={cn("grid min-h-0 items-center gap-2 px-3 py-0.5", COLUNAS)}>
      <div className="flex min-w-0 items-center gap-2">
        <Truck className="size-4 shrink-0 text-brand-accent" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-mono font-bold leading-tight tracking-wider text-[clamp(0.85rem,2vh,1.2rem)]">{placaComHifen(l.placa)}</p>
          <p className="truncate leading-tight text-brand-border text-[clamp(0.65rem,1.5vh,0.85rem)]" title={titulo(l.motorista)}>{titulo(l.motorista) || "Sem motorista"}</p>
        </div>
      </div>
      <Numero valor={l.romaneios} cor="text-brand-primary" />
      <Numero valor={l.total} />
      <Numero valor={l.realizadas} cor="text-status-success" apagar={!l.realizadas} />
      <Numero valor={l.pendentes} cor="text-amber-600" />
      <Numero valor={l.insucessos} cor="text-brand-red" apagar={!l.insucessos} />
      <div className="relative min-w-0 self-stretch"><Rosca valor={l.pctDia} rotulo="Entregas do dia" cor={COR_DIA} className="absolute inset-0 size-full" /></div>
      <div className="relative min-w-0 self-stretch"><Rosca valor={l.pctDpe} rotulo="DPE do mês" cor={corDpe(l.pctDpe)} className="absolute inset-0 size-full" /></div>
    </Card>
  );
}

function Numero({ valor, cor = "text-brand-dark", apagar = false }: { valor: number; cor?: string; apagar?: boolean }) {
  return <p className={cn("text-center font-bold tabular-nums leading-none text-[clamp(1rem,2.6vh,1.6rem)]", cor, apagar && "opacity-30")}>{valor}</p>;
}
