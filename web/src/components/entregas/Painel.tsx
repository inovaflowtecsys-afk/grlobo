import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { cn } from "../../lib/utils";

/** Cartão do painel de entregas: o mesmo Card branco usado nas demais telas. */
export function PainelCard({ children, className, rotulo }: { children: ReactNode; className?: string; rotulo: string }) {
  return (
    <Card role="region" aria-label={rotulo} className={cn("animate-rise-in p-5", className)}>
      {children}
    </Card>
  );
}

/** Tons semânticos, todos derivados da paleta do sistema. */
export const TONS = {
  primario: { caixa: "bg-brand-primary/10 text-brand-primary", numero: "text-brand-primary", barra: "bg-brand-primary" },
  vermelho: { caixa: "bg-brand-red/10 text-brand-red", numero: "text-brand-red", barra: "bg-brand-red" },
  azul: { caixa: "bg-brand-accent/15 text-brand-accent", numero: "text-brand-accent", barra: "bg-brand-accent" },
  amarelo: { caixa: "bg-status-warning/15 text-amber-600", numero: "text-amber-600", barra: "bg-status-warning" },
  verde: { caixa: "bg-status-success/10 text-status-success", numero: "text-status-success", barra: "bg-status-success" },
} as const;
export type Tom = keyof typeof TONS;

/** Botão pequeno "Ver todos" no canto do cartão (mesmo botão secundário do sistema). */
export function VerTodos({ onClick, children, rotulo }: { onClick: () => void; children: ReactNode; rotulo: string }) {
  return (
    <Button variant="secondary" className="h-8 shrink-0 px-3 text-xs" onClick={onClick} aria-label={rotulo}>
      {children}
    </Button>
  );
}

export function TituloCard({ icone: Icone, tom, titulo, subtitulo, acao }: { icone: LucideIcon; tom: Tom; titulo: string; subtitulo?: string; acao?: ReactNode }) {
  return (
    <header className="flex min-h-11 flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONS[tom].caixa)}>
          <Icone className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight">{titulo}</h2>
          {subtitulo ? <p className="text-xs text-brand-border">{subtitulo}</p> : null}
        </div>
      </div>
      {acao ? <div className="ml-auto">{acao}</div> : null}
    </header>
  );
}

/** Anel de progresso (DPE) com marca da meta. */
export function Anel({ valor, meta, alerta = false, rotulo, children }: { valor: number; meta: number; alerta?: boolean; rotulo: string; children: ReactNode }) {
  const raio = 100;
  const espessura = 18;
  const circunferencia = 2 * Math.PI * raio;
  const pct = Math.min(100, Math.max(0, valor));
  const atingiu = valor >= meta;
  const angulo = ((meta / 100) * 360 - 90) * (Math.PI / 180);
  const x = (r: number) => 120 + r * Math.cos(angulo);
  const y = (r: number) => 120 + r * Math.sin(angulo);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[240px]">
      <svg viewBox="0 0 240 240" role="img" aria-label={rotulo} className="size-full">
        <defs>
          <linearGradient id="anel-marca" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#12437f" />
            <stop offset="100%" stopColor="#11a4de" />
          </linearGradient>
          <linearGradient id="anel-meta-ok" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="anel-meta-alerta" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b91c1c" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r={raio} fill="none" stroke="#e6ebf2" strokeWidth={espessura} />
        <circle
          cx="120"
          cy="120"
          r={raio}
          fill="none"
          stroke={atingiu ? "url(#anel-meta-ok)" : alerta ? "url(#anel-meta-alerta)" : "url(#anel-marca)"}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={`${(circunferencia * pct) / 100} ${circunferencia}`}
          transform="rotate(-90 120 120)"
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <line x1={x(raio - espessura / 2 - 5)} y1={y(raio - espessura / 2 - 5)} x2={x(raio + espessura / 2 + 5)} y2={y(raio + espessura / 2 + 5)} stroke="#0a1119" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
