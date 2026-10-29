import { CalendarClock } from "lucide-react";
import { Badge } from "../ui/badge";
import { horaAgendamento } from "../../lib/conhecimentoFormat";
import { formatDateBR } from "../../lib/format";
import { type ConhecimentoListItem, OCORRENCIAS_INSUCESSO, type StatusEntrega, type StatusExibido } from "../../types/conhecimento";

type Variante = "success" | "warning" | "neutral" | "danger";

// Entregue = verde, pendente de entrega = cinza (ainda não realizado), insucesso = amarelo, cancelado = vermelho.
const STATUS: Record<StatusExibido, { rotulo: string; variante: Variante; escuro: string }> = {
  ENTREGUE: { rotulo: "Entregue", variante: "success", escuro: "bg-emerald-400/25 text-emerald-50 ring-1 ring-emerald-300/40" },
  EM_ABERTO: { rotulo: "Pendente de entrega", variante: "neutral", escuro: "bg-white/15 text-white/90 ring-1 ring-white/25" },
  INSUCESSO: { rotulo: "Insucesso", variante: "warning", escuro: "bg-amber-400/25 text-amber-50 ring-1 ring-amber-300/40" },
  CANCELADO: { rotulo: "Cancelado", variante: "danger", escuro: "bg-red-500/80 text-white ring-1 ring-red-300/50" },
};

export const STATUS_OPCOES: { valor: StatusExibido; rotulo: string }[] = [
  { valor: "EM_ABERTO", rotulo: "Pendente de entrega" },
  { valor: "INSUCESSO", rotulo: "Insucesso" },
  { valor: "ENTREGUE", rotulo: "Entregue" },
  { valor: "CANCELADO", rotulo: "Cancelado" },
];

/** Status para exibição: em aberto com última ocorrência de insucesso (5, 11, 13, 38, 52) vira "Insucesso". */
export function statusExibido(linha: { status_entrega: StatusEntrega; ocorrencia_codigo?: string | null }): StatusExibido {
  if (linha.status_entrega === "EM_ABERTO" && linha.ocorrencia_codigo && (OCORRENCIAS_INSUCESSO as readonly string[]).includes(linha.ocorrencia_codigo.trim())) return "INSUCESSO";
  return linha.status_entrega;
}

type Linha = Pick<ConhecimentoListItem, "status_entrega" | "ocorrencia_codigo" | "situacao_prazo" | "dias_atraso" | "agendado" | "entrega_programada" | "ocorrencia_descricao">;

// `escuro` ajusta as cores para fundos escuros (cabeçalho do painel de detalhes).
export function StatusBadge({ linha, escuro }: { linha: Pick<Linha, "status_entrega" | "ocorrencia_codigo">; escuro?: boolean }) {
  const { rotulo, variante, escuro: classeEscura } = STATUS[statusExibido(linha)];
  return escuro ? <Badge className={classeEscura}>{rotulo}</Badge> : <Badge variant={variante}>{rotulo}</Badge>;
}

/** Verde "No prazo" ou vermelho "Atrasado" (com os dias). Cancelado não tem prazo. */
export function PrazoBadge({ linha, escuro }: { linha: Pick<Linha, "status_entrega" | "situacao_prazo" | "dias_atraso">; escuro?: boolean }) {
  if (!linha.situacao_prazo) return escuro ? null : <span className="text-brand-border">-</span>;
  if (linha.situacao_prazo === "NO_PRAZO") {
    return escuro ? <Badge className="bg-emerald-400/25 text-emerald-50 ring-1 ring-emerald-300/40">No prazo</Badge> : <Badge variant="success">No prazo</Badge>;
  }

  const dias = linha.dias_atraso ?? 0;
  const texto = dias > 0 ? `Atrasado · ${dias} ${dias === 1 ? "dia" : "dias"}` : "Atrasado";
  return (
    <Badge
      variant="danger"
      className={escuro ? "bg-red-500/90 text-white ring-1 ring-red-300/50" : undefined}
      title={linha.status_entrega === "ENTREGUE" ? "Entregue após a previsão" : "Previsão vencida e ainda não entregue"}
    >
      {texto}
    </Badge>
  );
}

/** "Agendada · 21/10/2026 · 08:30" (o horário só aparece quando o SSW o informa na ocorrência). */
export function AgendadoBadge({ linha, escuro }: { linha: Pick<Linha, "agendado" | "entrega_programada" | "ocorrencia_descricao">; escuro?: boolean }) {
  if (!linha.agendado) return null;
  const hora = horaAgendamento(linha.ocorrencia_descricao, linha.entrega_programada);
  return (
    <Badge variant="accent" className={escuro ? "bg-brand-accent/30 text-white ring-1 ring-brand-accent/60" : undefined} title="Entrega agendada com o cliente">
      <CalendarClock className="mr-1 size-3" aria-hidden="true" />
      Agendada{linha.entrega_programada ? ` · ${formatDateBR(linha.entrega_programada)}` : ""}{hora ? ` · ${hora}` : ""}
    </Badge>
  );
}
