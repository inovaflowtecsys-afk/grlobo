import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Check, CheckCircle2, CircleDashed, ClipboardList, Clock, Copy, FileText, Hash, type LucideIcon, Mail, MapPin, Receipt, ReceiptText, Search, User, Wallet, X } from "lucide-react";
import { Dialog } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { cnpjCpf, diasEntre, formatarCampo, plural } from "../../lib/conhecimentoFormat";
import { rotuloCampo } from "../../lib/conhecimentoCampos";
import { formatBRL, formatDateBR, toISODate } from "../../lib/format";
import { cn } from "../../lib/utils";
import { getFaturaDetalhe } from "../../services/faturamento";
import type { FaturaDetalheRow, FaturaItem } from "../../types/faturamento";

const dinheiro = (v: number | string | null | undefined) => (v == null || v === "" ? "-" : formatBRL(Number(v)));
const texto = (v: string | null | undefined) => (v ?? "").trim();

export function FaturaDetalhe({ fatura: f, onClose }: { fatura: FaturaItem; onClose: () => void }) {
  const [d, setD] = useState<FaturaDetalheRow | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<"resumo" | "campos">("resumo");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    getFaturaDetalhe(f.dominio, f.chave_linha)
      .then((r) => {
        if (!ativo) return;
        setD(r);
        if (!r) setErro("Dados da fatura não encontrados.");
      })
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Não foi possível carregar os dados."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [f.dominio, f.chave_linha]);

  const totalCampos = d?.dados ? Object.keys(d.dados).length : 0;

  return (
    <Dialog open label={`Fatura ${f.fatura ?? ""}`} onClose={onClose}>
      <Cabecalho f={f} d={d} onClose={onClose} />

      <div role="tablist" aria-label="Seções da fatura" className="flex shrink-0 gap-1 border-b border-brand-border/15 bg-white px-4 sm:px-6">
        <Aba ativa={aba === "resumo"} onClick={() => setAba("resumo")} icone={ClipboardList}>Resumo</Aba>
        <Aba ativa={aba === "campos"} onClick={() => setAba("campos")} icone={FileText}>
          Todos os dados do SSW{totalCampos ? <span className="ml-1.5 rounded-full bg-brand-muted px-1.5 text-[11px] text-brand-border">{totalCampos}</span> : null}
        </Aba>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {erro ? <div role="alert" className="m-6 rounded-lg border border-status-error/25 bg-status-error/10 px-4 py-3 text-sm text-status-error">{erro}</div> : null}
        {carregando ? <Esqueleto /> : null}
        {!carregando && d && aba === "resumo" ? <Resumo d={d} /> : null}
        {!carregando && d && aba === "campos" ? <TodosOsCampos dados={d.dados ?? {}} /> : null}
      </div>
    </Dialog>
  );
}

/* ───────────────────────── Situação ───────────────────────── */

type Tom = "sucesso" | "alerta" | "atencao" | "neutro";

function situacaoEmFrase(f: FaturaItem, d: FaturaDetalheRow | null): { titulo: string; detalhe?: string; tom: Tom } {
  const hoje = toISODate(new Date());
  if (f.situacao === "CANCELADA") return { titulo: `Cancelada em ${formatDateBR(d?.cancelamento)}`, tom: "neutro" };
  if (f.situacao === "LIQUIDADA") {
    const dias = f.emissao && f.pagamento ? diasEntre(f.emissao, f.pagamento) : null;
    return {
      titulo: `Paga em ${formatDateBR(f.pagamento)}`,
      detalhe: [dias != null ? `${plural(Math.max(dias, 0), "dia", "dias")} após a emissão` : "", d?.data_credito_caixa ? `Crédito em caixa: ${formatDateBR(d.data_credito_caixa)}` : ""].filter(Boolean).join(" · ") || undefined,
      tom: "sucesso",
    };
  }
  if (f.situacao === "ATRASADA") {
    const dias = f.dias_atraso ?? (f.vencimento ? Math.max(diasEntre(f.vencimento, hoje), 0) : 0);
    return { titulo: `Vencida há ${plural(dias, "dia", "dias")}`, detalhe: `Vencimento em ${formatDateBR(f.vencimento)} · Saldo ${dinheiro(f.saldo)}`, tom: "alerta" };
  }
  if (!f.vencimento) return { titulo: "A vencer, sem data de vencimento", tom: "neutro" };
  const dias = diasEntre(hoje, f.vencimento);
  if (dias <= 0) return { titulo: "Vence hoje", detalhe: `Saldo ${dinheiro(f.saldo)}`, tom: "atencao" };
  return { titulo: `Vence em ${plural(dias, "dia", "dias")}`, detalhe: `${formatDateBR(f.vencimento)} · Saldo ${dinheiro(f.saldo)}`, tom: dias <= 3 ? "atencao" : "sucesso" };
}

function BadgeSituacao({ f, escuro }: { f: FaturaItem; escuro?: boolean }) {
  const mapa: Record<string, { rotulo: string; variante: "success" | "info" | "danger" | "neutral" }> = {
    ABERTA: { rotulo: "A vencer", variante: "info" },
    ATRASADA: { rotulo: "Vencida", variante: "danger" },
    LIQUIDADA: { rotulo: "Liquidada", variante: "success" },
    CANCELADA: { rotulo: "Cancelada", variante: "neutral" },
  };
  const s = mapa[f.situacao ?? ""] ?? { rotulo: f.situacao ?? "-", variante: "neutral" as const };
  return <Badge variant={s.variante} className={cn(escuro && "bg-white/90")}>{s.rotulo}</Badge>;
}

/* ───────────────────────── Cabeçalho ───────────────────────── */

function Cabecalho({ f, d, onClose }: { f: FaturaItem; d: FaturaDetalheRow | null; onClose: () => void }) {
  const mensagem = useMemo(() => situacaoEmFrase(f, d), [f, d]);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(f.fatura ?? "");
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

  return (
    <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-primary via-[#0f3868] to-brand-dark px-4 pb-6 pt-5 text-white sm:px-6">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-accent/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-brand-red/15 blur-3xl" aria-hidden="true" />

      <div className="relative flex items-start justify-between gap-4">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          <ReceiptText className="size-3.5" aria-hidden="true" />
          Fatura
        </p>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Fechar">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{f.fatura ?? "Sem número"}</h2>
        <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/20" aria-label="Copiar número da fatura">
          {copiado ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="relative mt-1 text-sm text-white/70">
        {f.cliente ?? "Sem cliente"} · Emitida em {formatDateBR(f.emissao)}
      </p>

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <BadgeSituacao f={f} escuro />
        {texto(d?.protestada_cartorio) && texto(d?.protestada_cartorio).toUpperCase() !== "N" ? <Badge variant="danger" className="bg-white/90">Protestada</Badge> : null}
        {texto(d?.spc_serasa) && texto(d?.spc_serasa).toUpperCase() !== "N" ? <Badge variant="danger" className="bg-white/90">SPC/Serasa</Badge> : null}
        {texto(d?.prorrogada) && texto(d?.prorrogada).toUpperCase() !== "N" ? <Badge variant="warning" className="bg-white/90">Prorrogada</Badge> : null}
      </div>

      <div className={cn("relative mt-5 flex items-start gap-3 rounded-xl px-4 py-3 ring-1 backdrop-blur", tom)}>
        <IconeTom className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{mensagem.titulo}</p>
          {mensagem.detalhe ? <p className="mt-0.5 text-sm text-white/75">{mensagem.detalhe}</p> : null}
        </div>
      </div>
    </header>
  );
}

export function Aba({ ativa, onClick, icone: Icone, children }: { ativa: boolean; onClick: () => void; icone: LucideIcon; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition",
        ativa ? "border-brand-primary text-brand-primary" : "border-transparent text-brand-border hover:text-brand-dark",
      )}
    >
      <Icone className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

/* ───────────────────────── Aba Resumo ───────────────────────── */

function Resumo({ d }: { d: FaturaDetalheRow }) {
  const ctrcs = d.ctrcs_json ?? [];
  const cidade = [texto(d.cidade), texto(d.uf)].filter(Boolean).join(" / ");
  const endereco = [texto(d.endereco), texto(d.bairro), d.cep ? `CEP ${d.cep}` : ""].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Cartao titulo="Acompanhamento" icone={Clock} atraso={0}>
        <LinhaDoTempo d={d} />
      </Cartao>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador icone={Wallet} rotulo="Valor da fatura" valor={dinheiro(d.valor_fatura)} sub={d.qtd_ctrcs ? plural(d.qtd_ctrcs, "CTRC", "CTRCs") : undefined} destaque atraso={1} />
        <Indicador icone={Banknote} rotulo="Valor pago" valor={dinheiro(d.valor_pago)} sub={d.pagamento_parcial ? `Parcial: ${dinheiro(d.pagamento_parcial)}` : undefined} atraso={2} />
        <Indicador icone={Receipt} rotulo="Saldo em aberto" valor={dinheiro(d.saldo)} atraso={3} />
        <Indicador icone={Hash} rotulo="Juros e desconto" valor={dinheiro(d.juros)} sub={d.desconto ? `Desconto: ${dinheiro(d.desconto)}` : undefined} atraso={4} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Cliente" icone={User} atraso={5}>
          {d.cliente ? (
            <div className="space-y-3">
              <div>
                <p className="break-words text-sm font-bold leading-snug">{d.cliente}</p>
                <p className="mt-0.5 font-mono text-xs text-brand-border">{d.cnpj_cliente ? cnpjCpf(d.cnpj_cliente) : "-"}</p>
              </div>
              <dl className="space-y-1.5 text-xs text-brand-border">
                {cidade ? <p className="flex gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{cidade}</p> : null}
                {endereco ? <p className="break-words pl-5">{endereco}</p> : null}
                {d.email_cobranca ? <p className="flex gap-2"><Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{d.email_cobranca}</p> : null}
              </dl>
            </div>
          ) : (
            <p className="text-sm text-brand-border">Não informado.</p>
          )}
        </Cartao>

        <Cartao titulo="Cobrança" icone={Banknote} atraso={6}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Item rotulo="Tipo de cobrança">{d.tipo_cobranca || "-"}</Item>
            <Item rotulo="Periodicidade">{d.periodicidade || "-"}</Item>
            <Item rotulo="Banco / carteira">{d.banco_carteira || "-"}</Item>
            <Item rotulo="Agência / conta">{d.agencia_conta || "-"}</Item>
            <Item rotulo="Nº título no banco">{d.nro_titulo_banco || "-"}</Item>
            <Item rotulo="Tipo de baixa">{d.tipo_baixa || "-"}</Item>
            <Item rotulo="Filial">{d.filial || "-"}</Item>
            <Item rotulo="Unidade responsável">{d.unidade_responsavel || "-"}</Item>
            <Item rotulo="Vendedor">{d.vendedor || "-"}</Item>
            <Item rotulo="Classe ABC">{d.abc || "-"}</Item>
          </dl>
        </Cartao>
      </div>

      <Cartao titulo={`CTRCs da fatura (${ctrcs.length})`} icone={FileText} atraso={7}>
        {ctrcs.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-brand-border">
                <tr>
                  <th className="py-2 pr-4 font-bold">CTRC</th>
                  <th className="py-2 pr-4 font-bold">CT-e</th>
                  <th className="py-2 pr-4 font-bold">Emissão</th>
                  <th className="py-2 text-right font-bold">Frete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/10">
                {ctrcs.map((c, i) => (
                  <tr key={`${c.ctrc}-${i}`}>
                    <td className="whitespace-nowrap py-2 pr-4 font-semibold">{c.ctrc ?? "-"}</td>
                    <td className="whitespace-nowrap py-2 pr-4">{c.cte ?? "-"}</td>
                    <td className="whitespace-nowrap py-2 pr-4">{formatDateBR(c.data_autorizacao ?? c.data_emissao)}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums">{dinheiro(c.valor_frete)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-border">Nenhum CTRC vinculado a esta fatura.</p>
        )}
      </Cartao>
    </div>
  );
}

export type Etapa = { titulo: string; data: string; feita: boolean; atrasada?: boolean; cancelada?: boolean };

function LinhaDoTempo({ d }: { d: FaturaDetalheRow }) {
  const cancelada = d.situacao === "CANCELADA";
  const paga = d.situacao === "LIQUIDADA";
  const atrasada = d.situacao === "ATRASADA";

  const etapas: Etapa[] = [
    { titulo: "Emitida", data: formatDateBR(d.emissao), feita: true },
    { titulo: "Vencimento", data: formatDateBR(d.vencimento), feita: paga || atrasada, atrasada },
    cancelada ? { titulo: "Cancelada", data: formatDateBR(d.cancelamento), feita: true, cancelada: true } : { titulo: "Paga", data: paga ? formatDateBR(d.pagamento) : "Aguardando", feita: paga },
    { titulo: "Crédito em caixa", data: d.data_credito_caixa ? formatDateBR(d.data_credito_caixa) : "Aguardando", feita: Boolean(d.data_credito_caixa) },
  ];
  return <Etapas etapas={etapas} />;
}

export function Etapas({ etapas }: { etapas: Etapa[] }) {
  const atual = etapas.findIndex((e) => !e.feita);

  return (
    <ol className="grid gap-4 sm:grid-cols-4 sm:gap-0">
      {etapas.map((e, i) => {
        const estado = e.cancelada ? "cancelada" : e.feita ? (e.atrasada ? "atrasada" : "feita") : i === atual ? "atual" : "pendente";
        const proxima = etapas[i + 1];
        const ligacaoColorida = e.feita && (proxima?.feita || i + 1 === atual);
        return (
          <li key={e.titulo} className="relative flex gap-3 sm:flex-col sm:items-center sm:gap-2 sm:px-1 sm:text-center">
            {i < etapas.length - 1 ? (
              <>
                <span className={cn("absolute left-[15px] top-8 h-[calc(100%-1rem)] w-0.5 sm:hidden", ligacaoColorida ? "bg-brand-primary" : "bg-brand-border/20")} aria-hidden="true" />
                <span className={cn("absolute left-1/2 top-4 ml-4 hidden h-0.5 w-[calc(100%-2rem)] sm:block", ligacaoColorida ? "bg-brand-primary" : "bg-brand-border/20")} aria-hidden="true" />
              </>
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-white",
                estado === "feita" && "bg-brand-primary",
                estado === "atrasada" && "bg-brand-red",
                estado === "cancelada" && "bg-brand-border",
                estado === "atual" && "bg-brand-accent shadow-[0_0_0_6px_rgba(17,164,222,0.22)]",
                estado === "pendente" && "bg-brand-muted text-brand-border",
              )}
            >
              {estado === "atrasada" || estado === "cancelada" ? <AlertTriangle className="size-4" aria-hidden="true" /> : estado === "feita" ? <Check className="size-4" aria-hidden="true" /> : estado === "atual" ? <Clock className="size-4" aria-hidden="true" /> : <CircleDashed className="size-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0 pb-1">
              <p className={cn("text-sm font-semibold", estado === "pendente" && "text-brand-border")}>{e.titulo}</p>
              <p className={cn("text-xs", estado === "atrasada" ? "font-semibold text-brand-red" : "text-brand-border")}>{e.data}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────── Aba Todos os dados ───────────────────────── */

function TodosOsCampos({ dados }: { dados: Record<string, unknown> }) {
  const [filtro, setFiltro] = useState("");
  const [mostrarVazios, setMostrarVazios] = useState(false);
  const campos = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    return Object.entries(dados)
      .map(([chave, bruto]) => ({ chave, rotulo: rotuloCampo(chave), valor: formatarCampo(chave, String(bruto ?? "")) }))
      .filter((c) => (mostrarVazios || c.valor) && (!termo || c.rotulo.toLowerCase().includes(termo) || c.valor.toLowerCase().includes(termo)));
  }, [dados, filtro, mostrarVazios]);
  const vazios = Object.values(dados).filter((x) => !String(x ?? "").trim()).length;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-brand-surface/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="relative sm:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
          <input
            className="h-10 w-full rounded-lg border border-brand-border/30 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar campo ou valor"
            aria-label="Buscar nos campos do SSW"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-border">
          <input type="checkbox" className="size-4 accent-[#12437f]" checked={mostrarVazios} onChange={(e) => setMostrarVazios(e.target.checked)} />
          Mostrar campos vazios ({vazios})
        </label>
      </div>

      {!campos.length ? <p className="py-10 text-center text-sm text-brand-border">Nenhum campo encontrado.</p> : null}

      {campos.length ? (
        <section aria-label="Campos da fatura" className="overflow-hidden rounded-xl border border-brand-border/15 bg-white">
          <h3 className="flex items-center justify-between border-b border-brand-border/10 bg-brand-muted/40 px-4 py-2.5 text-xs font-bold uppercase text-brand-primary">
            Dados da fatura (relatório 441)
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-border">{campos.length}</span>
          </h3>
          <dl className="grid gap-px bg-brand-border/10 sm:grid-cols-2 lg:grid-cols-3">
            {campos.map((campo) => (
              <div key={campo.chave} className="min-w-0 bg-white px-4 py-2.5">
                <dt className="text-[11px] font-semibold uppercase text-brand-border">{campo.rotulo}</dt>
                <dd className="mt-0.5 break-words text-sm font-medium">{campo.valor || <span className="font-normal text-brand-border/50">—</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Blocos de apoio ───────────────────────── */

export function Cartao({ titulo, icone: Icone, children, atraso }: { titulo: string; icone: LucideIcon; children: ReactNode; atraso: number }) {
  return (
    <section className="animate-rise-in rounded-xl border border-brand-border/15 bg-white p-4 shadow-[0_8px_30px_rgba(10,17,25,0.04)] sm:p-5" style={{ animationDelay: `${atraso * 40}ms` }} aria-label={titulo}>
      <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-brand-primary">
        <Icone className="size-4" aria-hidden="true" />
        {titulo}
      </h3>
      {children}
    </section>
  );
}

export function Indicador({ icone: Icone, rotulo, valor, sub, destaque, atraso }: { icone: LucideIcon; rotulo: string; valor: string; sub?: string; destaque?: boolean; atraso: number }) {
  return (
    <div
      className={cn("animate-rise-in rounded-xl border p-4", destaque ? "border-transparent bg-gradient-to-br from-brand-primary to-[#0f3868] text-white shadow-[0_12px_30px_rgba(18,67,127,0.3)]" : "border-brand-border/15 bg-white")}
      style={{ animationDelay: `${atraso * 40}ms` }}
    >
      <div className={cn("flex items-center gap-2 text-[11px] font-bold uppercase", destaque ? "text-white/70" : "text-brand-border")}>
        <Icone className="size-3.5" aria-hidden="true" />
        {rotulo}
      </div>
      <p className="mt-1.5 truncate text-xl font-bold tabular-nums" title={valor}>{valor}</p>
      {sub ? <p className={cn("mt-0.5 truncate text-xs", destaque ? "text-white/70" : "text-brand-border")}>{sub}</p> : null}
    </div>
  );
}

export function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase text-brand-border">{rotulo}</dt>
      <dd className="mt-0.5 break-words font-medium">{children}</dd>
    </div>
  );
}

export function Esqueleto() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Carregando dados da fatura">
      {[28, 20, 24].map((h, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-white" style={{ height: `${h * 4}px` }} />
      ))}
    </div>
  );
}
