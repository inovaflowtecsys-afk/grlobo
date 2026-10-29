import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, Check, CheckCircle2, CircleDashed, Clock, Copy, MapPin, Receipt, ReceiptText, Truck, User, Wallet, X } from "lucide-react";
import { Dialog } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Cartao, Etapas, type Etapa, Indicador, Item } from "./FaturaDetalhe";
import { cnpjCpf, diasEntre, plural } from "../../lib/conhecimentoFormat";
import { formatBRL, formatDateBR, toISODate } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { CtrcFinanceiroItem } from "../../types/faturamento";

const dinheiro = (v: number | string | null | undefined) => (v == null || v === "" ? "-" : formatBRL(Number(v)));

export const SITUACAO_CTRC_ROTULO: Record<string, { rotulo: string; variante: "success" | "warning" | "info" | "danger" | "neutral" }> = {
  PENDENTE_FATURAMENTO: { rotulo: "A faturar", variante: "warning" },
  FATURADO: { rotulo: "Faturado", variante: "info" },
  ATRASADO: { rotulo: "Vencida", variante: "danger" },
  CONCLUIDO: { rotulo: "Liquidado", variante: "success" },
  CANCELADO: { rotulo: "Cancelado", variante: "neutral" },
  SEM_INFORMACAO: { rotulo: "Sem informação", variante: "neutral" },
};

type Tom = "sucesso" | "alerta" | "atencao" | "neutro";

function situacaoEmFrase(c: CtrcFinanceiroItem): { titulo: string; detalhe?: string; tom: Tom } {
  const hoje = toISODate(new Date());
  switch (c.situacao_financeira) {
    case "CANCELADO":
      return { titulo: "Conhecimento cancelado", tom: "neutro" };
    case "CONCLUIDO":
      return {
        titulo: `Liquidado em ${formatDateBR(c.data_liquidacao)}`,
        detalhe: [c.forma_liquidacao, c.data_credito_caixa ? `Crédito em caixa: ${formatDateBR(c.data_credito_caixa)}` : ""].filter(Boolean).join(" · ") || undefined,
        tom: "sucesso",
      };
    case "ATRASADO": {
      const dias = c.dias_atraso ?? (c.fatura_vencimento ? Math.max(diasEntre(c.fatura_vencimento, hoje), 0) : 0);
      return { titulo: `Fatura vencida há ${plural(dias, "dia", "dias")}`, detalhe: `Fatura ${c.fatura ?? "-"} · vencimento ${formatDateBR(c.fatura_vencimento)} · saldo ${dinheiro(c.fatura_saldo)}`, tom: "alerta" };
    }
    case "FATURADO": {
      const dias = c.fatura_vencimento ? diasEntre(hoje, c.fatura_vencimento) : null;
      return { titulo: `Faturado na fatura ${c.fatura ?? "-"}`, detalhe: dias == null ? undefined : dias <= 0 ? "Vence hoje" : `Vence em ${plural(dias, "dia", "dias")} (${formatDateBR(c.fatura_vencimento)})`, tom: dias != null && dias <= 3 ? "atencao" : "sucesso" };
    }
    case "PENDENTE_FATURAMENTO":
      return { titulo: "Disponível para faturar", detalhe: `Valor a faturar: ${dinheiro(c.valor_a_faturar ?? c.valor_frete)}${c.data_entrega ? ` · entregue em ${formatDateBR(c.data_entrega)}` : ""}`, tom: "atencao" };
    default:
      return { titulo: "Sem informação financeira", detalhe: "Este conhecimento ainda não apareceu nos relatórios financeiros do SSW.", tom: "neutro" };
  }
}

export function CtrcDetalhe({ conhecimento: c, onClose }: { conhecimento: CtrcFinanceiroItem; onClose: () => void }) {
  const mensagem = useMemo(() => situacaoEmFrase(c), [c]);
  const [copiado, setCopiado] = useState(false);
  const cteValido = c.cte && !/^0+$/.test(c.cte) ? c.cte : null;
  const s = SITUACAO_CTRC_ROTULO[c.situacao_financeira] ?? SITUACAO_CTRC_ROTULO.SEM_INFORMACAO;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(c.ctrc ?? "");
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1600);
    } catch {
      // sem permissão de área de transferência: o usuário ainda pode selecionar o texto
    }
  }

  const tom = {
    sucesso: "bg-emerald-400/15 text-emerald-50 ring-emerald-300/30",
    alerta: "bg-red-500/25 text-white ring-red-300/40",
    atencao: "bg-amber-400/20 text-amber-50 ring-amber-300/35",
    neutro: "bg-white/10 text-white/90 ring-white/20",
  }[mensagem.tom];
  const IconeTom = mensagem.tom === "sucesso" ? CheckCircle2 : mensagem.tom === "alerta" ? AlertTriangle : mensagem.tom === "atencao" ? Clock : CircleDashed;

  const cancelado = c.situacao_financeira === "CANCELADO";
  const liquidado = c.situacao_financeira === "CONCLUIDO";
  const atrasado = c.situacao_financeira === "ATRASADO";
  const faturado = Boolean(c.fatura);
  const etapas: Etapa[] = [
    { titulo: "Emitido", data: formatDateBR(c.data_autorizacao), feita: true },
    { titulo: "Faturado", data: faturado ? formatDateBR(c.fatura_emissao) : "Aguardando", feita: faturado },
    { titulo: "Vencimento", data: c.fatura_vencimento ? formatDateBR(c.fatura_vencimento) : "-", feita: liquidado || atrasado, atrasada: atrasado },
    cancelado ? { titulo: "Cancelado", data: "-", feita: true, cancelada: true } : { titulo: "Liquidado", data: liquidado ? formatDateBR(c.data_liquidacao) : "Aguardando", feita: liquidado },
  ];

  return (
    <Dialog open label={`Conhecimento ${c.ctrc ?? ""}`} onClose={onClose}>
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-primary via-[#0f3868] to-brand-dark px-4 pb-6 pt-5 text-white sm:px-6">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-accent/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-brand-red/15 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-start justify-between gap-4">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
            <ReceiptText className="size-3.5" aria-hidden="true" />
            Conhecimento · situação financeira
          </p>
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Fechar">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.ctrc ?? "Sem CTRC"}</h2>
          <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/20" aria-label="Copiar número do CTRC">
            {copiado ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p className="relative mt-1 text-sm text-white/70">
          {cteValido ? `CT-e ${cteValido} · ` : ""}Emitido em {formatDateBR(c.data_autorizacao)}
          {c.tipo_conhecimento && c.tipo_conhecimento !== "NORMAL" ? ` · ${c.tipo_conhecimento === "COMPLEMENTAR" ? "Complementar" : "Devolução"}` : ""}
        </p>

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <Badge variant={s.variante} className="bg-white/90">{s.rotulo}</Badge>
        </div>

        <div className={cn("relative mt-5 flex items-start gap-3 rounded-xl px-4 py-3 ring-1 backdrop-blur", tom)}>
          <IconeTom className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{mensagem.titulo}</p>
            {mensagem.detalhe ? <p className="mt-0.5 text-sm text-white/75">{mensagem.detalhe}</p> : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        <div className="space-y-5 p-4 sm:p-6">
          <Cartao titulo="Acompanhamento financeiro" icone={Clock} atraso={0}>
            <Etapas etapas={etapas} />
          </Cartao>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador icone={Wallet} rotulo="Frete" valor={dinheiro(c.valor_frete)} destaque atraso={1} />
            <Indicador icone={Receipt} rotulo="Valor da fatura" valor={dinheiro(c.valor_fatura)} sub={c.fatura ? `Fatura ${c.fatura}` : undefined} atraso={2} />
            <Indicador icone={Banknote} rotulo="Valor liquidado" valor={dinheiro(c.valor_liquidado)} sub={c.forma_liquidacao ?? undefined} atraso={3} />
            <Indicador icone={Clock} rotulo="Saldo da fatura" valor={dinheiro(c.fatura_saldo)} atraso={4} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao titulo="Pagador" icone={User} atraso={5}>
              {c.pagador_nome ? (
                <div>
                  <p className="break-words text-sm font-bold leading-snug">{c.pagador_nome}</p>
                  <p className="mt-0.5 font-mono text-xs text-brand-border">{c.pagador_cnpj ? cnpjCpf(c.pagador_cnpj) : "-"}</p>
                </div>
              ) : (
                <p className="text-sm text-brand-border">Não informado.</p>
              )}
            </Cartao>

            <Cartao titulo="Rota" icone={MapPin} atraso={6}>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Item rotulo="Origem">{c.unidade_origem || "-"}</Item>
                <Item rotulo="Destino">{c.unidade_destino || "-"}</Item>
                <Item rotulo="Rota">{c.rota || "-"}</Item>
                <Item rotulo="Entrega">{c.data_entrega ? formatDateBR(c.data_entrega) : "-"}</Item>
              </dl>
            </Cartao>
          </div>

          <Cartao titulo="Fatura vinculada" icone={Truck} atraso={7}>
            {c.fatura ? (
              <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                <Item rotulo="Fatura">{c.fatura}</Item>
                <Item rotulo="Emissão">{formatDateBR(c.fatura_emissao)}</Item>
                <Item rotulo="Vencimento">{formatDateBR(c.fatura_vencimento)}</Item>
                <Item rotulo="Dias vencidos">{c.situacao_financeira === "ATRASADO" ? plural(c.dias_atraso ?? 0, "dia", "dias") : "No Prazo"}</Item>
                <Item rotulo="Situação da fatura">{c.fatura_situacao || "-"}</Item>
                <Item rotulo="Tipo de baixa">{c.tipo_baixa || "-"}</Item>
                <Item rotulo="Liquidado em">{c.data_liquidacao ? formatDateBR(c.data_liquidacao) : "-"}</Item>
                <Item rotulo="Crédito em caixa">{c.data_credito_caixa ? formatDateBR(c.data_credito_caixa) : "-"}</Item>
              </dl>
            ) : (
              <p className="text-sm text-brand-border">Este conhecimento ainda não está em nenhuma fatura.</p>
            )}
          </Cartao>
        </div>
      </div>
    </Dialog>
  );
}
