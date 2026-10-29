import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Clock,
  Copy,
  FileText,
  Hash,
  type LucideIcon,
  MapPin,
  Navigation,
  Package,
  Receipt,
  Scale,
  Search,
  Truck,
  User,
  Wallet,
  X,
} from "lucide-react";
import { Dialog } from "../ui/dialog";
import { AgendadoBadge, PrazoBadge, StatusBadge } from "./Sinalizadores";
import { agruparCampos } from "../../lib/conhecimentoCampos";
import { cnpjCpf, dataBR, dataISO, diasEntre, kg, moeda, formatPlaca, limparOcorrencia, numerosDasNotas, plural, telefone } from "../../lib/conhecimentoFormat";
import { formatBRL, formatDateBR, formatDateTimeBR, toISODate } from "../../lib/format";
import { ocorrenciaIgnorada } from "../../lib/entregasCalculos";
import { cn } from "../../lib/utils";
import { getConhecimentoDados } from "../../services/conhecimentos";
import type { ConhecimentoListItem } from "../../types/conhecimento";

type Dados = Record<string, string>;
const v = (dados: Dados | null, chave: string) => (dados?.[chave] ?? "").trim();
const camposOcorrenciaIgnorada = new Set([
  "codigo_da_ultima_ocorrencia",
  "complemento_da_ultima_ocorrencia",
  "data_da_ultima_ocorrencia",
  "unidade_da_ultima_ocorrencia",
  "usuario_da_ultima_ocorrencia",
]);

function dadosSemOcorrenciaIgnorada(dados: Dados | null) {
  if (!dados || !ocorrenciaIgnorada(v(dados, "codigo_da_ultima_ocorrencia"))) return dados;
  return Object.fromEntries(Object.entries(dados).filter(([chave]) => !camposOcorrenciaIgnorada.has(chave))) as Dados;
}

export function ConhecimentoDetalhe({ conhecimento: c, onClose }: { conhecimento: ConhecimentoListItem; onClose: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<"resumo" | "campos">("resumo");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    getConhecimentoDados(c.dominio, c.chave_linha)
      .then((resultado) => {
        if (!ativo) return;
        setDados(resultado);
        if (!resultado) setErro("Dados do conhecimento não encontrados.");
      })
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Não foi possível carregar os dados."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [c.dominio, c.chave_linha]);

  const cteValido = c.cte && !/^0+$/.test(c.cte) ? c.cte : null;
  const totalCampos = dados ? Object.keys(dados).length : 0;
  const dadosVisiveis = useMemo(() => dadosSemOcorrenciaIgnorada(dados), [dados]);

  return (
    <Dialog open label={`Conhecimento ${c.ctrc ?? ""}`} onClose={onClose}>
      <Cabecalho c={c} cte={cteValido} dados={dados} onClose={onClose} />

      <div role="tablist" aria-label="Seções do conhecimento" className="flex shrink-0 gap-1 border-b border-brand-border/15 bg-white px-4 sm:px-6">
        <Aba ativa={aba === "resumo"} onClick={() => setAba("resumo")} icone={ClipboardList}>Resumo</Aba>
        <Aba ativa={aba === "campos"} onClick={() => setAba("campos")} icone={FileText}>
          Todos os dados do 455{totalCampos ? <span className="ml-1.5 rounded-full bg-brand-muted px-1.5 text-[11px] text-brand-border">{totalCampos}</span> : null}
        </Aba>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {erro ? <div role="alert" className="m-6 rounded-lg border border-status-error/25 bg-status-error/10 px-4 py-3 text-sm text-status-error">{erro}</div> : null}
        {carregando ? <Esqueleto /> : null}
        {!carregando && dados && aba === "resumo" ? <Resumo c={c} dados={dados} /> : null}
        {!carregando && dados && aba === "campos" ? <TodosOsCampos dados={dadosVisiveis ?? dados} /> : null}
      </div>
    </Dialog>
  );
}

/* ───────────────────────── Cabeçalho ───────────────────────── */

function Cabecalho({ c, cte, dados, onClose }: { c: ConhecimentoListItem; cte: string | null; dados: Dados | null; onClose: () => void }) {
  const mensagem = useMemo(() => situacaoEmFrase(c, dados), [c, dados]);
  const [copiado, setCopiado] = useState(false);

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

  return (
    <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-primary via-[#0f3868] to-brand-dark px-4 pb-6 pt-5 text-white sm:px-6">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-accent/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-brand-red/15 blur-3xl" aria-hidden="true" />

      <div className="relative flex items-start justify-between gap-4">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          <Truck className="size-3.5" aria-hidden="true" />
          Conhecimento de transporte
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
        {cte ? `CT-e ${cte} · ` : ""}Emitido em {formatDateBR(c.data_autorizacao)}
        {c.tipo_conhecimento && c.tipo_conhecimento !== "NORMAL" ? ` · ${c.tipo_conhecimento === "COMPLEMENTAR" ? "Complementar" : "Devolução"}` : ""}
      </p>
      <p className="relative mt-2 inline-flex rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/80">
        Última atualização: {formatDateTimeBR(c.atualizado_em)}
      </p>

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge linha={c} escuro />
        <PrazoBadge linha={c} escuro />
        <AgendadoBadge linha={c} escuro />
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

function situacaoEmFrase(c: ConhecimentoListItem, dados: Dados | null): { titulo: string; detalhe?: string; tom: "sucesso" | "alerta" | "atencao" | "neutro" } {
  if (c.status_entrega === "CANCELADO") {
    const motivo = v(dados, "motivo_do_cancelamento");
    return { titulo: `Cancelado em ${formatDateBR(c.data_cancelamento)}`, detalhe: motivo || undefined, tom: "neutro" };
  }
  if (c.status_entrega === "ENTREGUE" && c.data_entrega) {
    const d = c.previsao_entrega ? diasEntre(c.previsao_entrega, c.data_entrega) : 0;
    const base = `Entregue em ${formatDateBR(c.data_entrega)}`;
    if (d > 0) return { titulo: base, detalhe: `${plural(d, "dia", "dias")} depois da previsão (${formatDateBR(c.previsao_entrega)})`, tom: "alerta" };
    return { titulo: base, detalhe: d < 0 ? `${plural(-d, "dia", "dias")} antes da previsão — dentro do prazo` : "No dia da previsão — dentro do prazo", tom: "sucesso" };
  }
  if (!c.previsao_entrega) return { titulo: "Em aberto, sem previsão de entrega", tom: "neutro" };

  const d = diasEntre(toISODate(new Date()), c.previsao_entrega);
  const onde = c.localizacao_atual ? `Localização: ${c.localizacao_atual}` : undefined;
  if (d < 0) return { titulo: `Previsão vencida há ${plural(-d, "dia", "dias")}`, detalhe: [`Era para ${formatDateBR(c.previsao_entrega)}`, onde].filter(Boolean).join(" · "), tom: "alerta" };
  if (d === 0) return { titulo: "Entrega prevista para hoje", detalhe: onde, tom: "atencao" };
  return { titulo: `Entrega prevista em ${plural(d, "dia", "dias")}`, detalhe: [formatDateBR(c.previsao_entrega), onde].filter(Boolean).join(" · "), tom: "sucesso" };
}

function Aba({ ativa, onClick, icone: Icone, children }: { ativa: boolean; onClick: () => void; icone: LucideIcon; children: ReactNode }) {
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

function Resumo({ c, dados }: { c: ConhecimentoListItem; dados: Dados }) {
  const notas = v(dados, "notas_fiscais") || v(dados, "numero_da_nota_fiscal") || c.numero_nf || "";
  const listaNotas = numerosDasNotas(notas);
  const codigoOcorrencia = c.ocorrencia_codigo || v(dados, "codigo_da_ultima_ocorrencia");
  const descricaoOcorrencia = c.ocorrencia_descricao || v(dados, "complemento_da_ultima_ocorrencia");
  const dataOcorrencia = c.ocorrencia_data || v(dados, "data_da_ultima_ocorrencia");

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Cartao titulo="Acompanhamento" icone={Navigation} atraso={0}>
        <LinhaDoTempo c={c} dados={dados} />
      </Cartao>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador icone={Wallet} rotulo="Frete" valor={c.valor_frete != null ? formatBRL(c.valor_frete) : "-"} sub={v(dados, "tipo_do_frete") ? `Frete ${v(dados, "tipo_do_frete")}` : undefined} destaque atraso={2} />
        <Indicador icone={Receipt} rotulo="Valor da mercadoria" valor={moeda(v(dados, "valor_da_mercadoria"))} atraso={3} />
        <Indicador icone={Scale} rotulo="Peso real" valor={kg(v(dados, "peso_real_em_kg"))} sub={v(dados, "peso_calculado_em_kg") ? `Calculado: ${kg(v(dados, "peso_calculado_em_kg"))}` : undefined} atraso={4} />
        <Indicador icone={Boxes} rotulo="Volumes" valor={c.volumes != null ? String(c.volumes) : v(dados, "quantidade_de_volumes") || "-"} sub={listaNotas.length ? plural(listaNotas.length, "nota fiscal", "notas fiscais") : undefined} atraso={5} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Parte titulo="Remetente" nome={v(dados, "cliente_remetente")} documento={v(dados, "cnpj_remetente")} cidade={[v(dados, "cidade_do_remetente"), v(dados, "uf_do_remetente")].filter(Boolean).join(" / ")} fone={v(dados, "fone_remetente")} endereco={v(dados, "endereco_do_remetente")} atraso={6} />
        <Parte titulo="Destinatário" nome={v(dados, "cliente_destinatario")} documento={v(dados, "cnpj_destinatario")} cidade={[v(dados, "cidade_do_destinatario"), v(dados, "uf_do_destinatario")].filter(Boolean).join(" / ")} fone={v(dados, "fone_do_destinatario") || v(dados, "celular_do_destinatario")} endereco={v(dados, "endereco_do_destinatario")} atraso={7} />
        <Parte titulo="Pagador" nome={v(dados, "cliente_pagador")} documento={v(dados, "cnpj_pagador")} cidade={[v(dados, "cidade_do_pagador"), v(dados, "uf_do_pagador")].filter(Boolean).join(" / ")} fone={v(dados, "fone_do_pagador")} endereco={v(dados, "endereco_do_pagador")} atraso={8} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Documentos e transporte" icone={Hash} atraso={9}>
          <dl className="space-y-3 text-sm">
            <Item rotulo="Notas fiscais">
              {listaNotas.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {listaNotas.map((n) => <span key={n} className="rounded-md bg-brand-muted px-2 py-0.5 font-mono text-xs">{n}</span>)}
                </div>
              ) : "-"}
            </Item>
            <Item rotulo="Chave do CT-e"><span className="break-all font-mono text-xs">{v(dados, "chave_ct_e") || "-"}</span></Item>
            <Item rotulo="Manifestos">{[v(dados, "primeiro_manifesto"), v(dados, "ultimo_manifesto")].filter((x, i, a) => x && a.indexOf(x) === i).join("  →  ") || "-"}</Item>
            <Item rotulo="Último romaneio">{v(dados, "ultimo_romaneio") || "-"}</Item>
            <Item rotulo="Veículos">
              {[["Coleta", "placa_de_coleta"], ["Cavalo", "placa_do_cavalo"], ["Carreta", "placa_da_carreta"], ["Entrega", "placa_de_entrega"]]
                .filter(([, k]) => v(dados, k))
                .map(([nome, k]) => `${nome}: ${formatPlaca(v(dados, k))}`)
                .join("  ·  ") || "-"}
            </Item>
          </dl>
        </Cartao>

        <Cartao titulo="Última ocorrência" icone={Clock} atraso={10}>
          {!ocorrenciaIgnorada(codigoOcorrencia) && (descricaoOcorrencia || dataOcorrencia) ? (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg bg-brand-surface px-3 py-2 font-semibold leading-snug">
                {codigoOcorrencia ? <span className="mr-2 rounded bg-brand-primary/10 px-1.5 py-0.5 text-xs text-brand-primary">{codigoOcorrencia}</span> : null}
                {limparOcorrencia(descricaoOcorrencia) || "Sem descrição"}
              </p>
              <dl className="grid grid-cols-2 gap-3">
                <Item rotulo="Data">{dataBR(dataOcorrencia) || "-"}</Item>
                <Item rotulo="Unidade">{v(dados, "unidade_da_ultima_ocorrencia") || "-"}</Item>
                <Item rotulo="Usuário">{v(dados, "usuario_da_ultima_ocorrencia") || "-"}</Item>
                <Item rotulo="Localização atual">{c.localizacao_atual || "-"}</Item>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-brand-border">Nenhuma ocorrência registrada.</p>
          )}
        </Cartao>
      </div>
    </div>
  );
}

/* Linha do tempo: emissão → manifesto → saída para entrega → entrega */
function LinhaDoTempo({ c, dados }: { c: ConhecimentoListItem; dados: Dados }) {
  const cancelado = c.status_entrega === "CANCELADO";
  const entregue = c.status_entrega === "ENTREGUE";
  const emissao = dataBR(v(dados, "data_de_emissao")) || formatDateBR(c.data_autorizacao);

  type Etapa = { titulo: string; data: string; feita: boolean; atrasada?: boolean; cancelada?: boolean; nota?: string };
  const etapas: Etapa[] = [
    { titulo: "Emitido", data: emissao, feita: true },
    { titulo: "Manifestado", data: dataBR(v(dados, "data_do_primeiro_manifesto")), feita: Boolean(dataISO(v(dados, "data_do_primeiro_manifesto"))), nota: v(dados, "primeiro_manifesto") },
    { titulo: "Saiu para entrega", data: dataBR(v(dados, "data_do_ultimo_romaneio")), feita: Boolean(dataISO(v(dados, "data_do_ultimo_romaneio"))), nota: v(dados, "ultimo_romaneio") },
    cancelado
      ? { titulo: "Cancelado", data: formatDateBR(c.data_cancelamento), feita: true, cancelada: true }
      : { titulo: "Entregue", data: entregue ? formatDateBR(c.data_entrega) : c.previsao_entrega ? `Previsão ${formatDateBR(c.previsao_entrega)}` : "Sem previsão", feita: entregue, atrasada: c.situacao_prazo === "ATRASADO" },
  ];
  // Se uma etapa posterior já aconteceu, as anteriores também (o SSW nem sempre traz a data de todas).
  const ultimaFeita = etapas.map((e) => e.feita).lastIndexOf(true);
  etapas.forEach((e, i) => {
    if (i < ultimaFeita) e.feita = true;
  });
  // A etapa "atual" é a primeira ainda não concluída (a menos que o conhecimento esteja entregue/cancelado).
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
              <p className={cn("text-xs", estado === "atrasada" ? "font-semibold text-brand-red" : "text-brand-border")}>{e.data || (e.feita ? "Sem data" : "Aguardando")}</p>
              {e.nota ? <p className="mt-0.5 truncate text-[11px] text-brand-border/80" title={e.nota}>{e.nota}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────── Aba Todos os dados ───────────────────────── */

function TodosOsCampos({ dados }: { dados: Dados }) {
  const [filtro, setFiltro] = useState("");
  const [mostrarVazios, setMostrarVazios] = useState(false);
  const grupos = useMemo(() => agruparCampos(dados, mostrarVazios, filtro), [dados, mostrarVazios, filtro]);
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
            aria-label="Buscar nos campos do 455"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-border">
          <input type="checkbox" className="size-4 accent-[#12437f]" checked={mostrarVazios} onChange={(e) => setMostrarVazios(e.target.checked)} />
          Mostrar campos vazios ({vazios})
        </label>
      </div>

      {!grupos.length ? <p className="py-10 text-center text-sm text-brand-border">Nenhum campo encontrado.</p> : null}

      {grupos.map((grupo) => (
        <section key={grupo.titulo} aria-label={grupo.titulo} className="overflow-hidden rounded-xl border border-brand-border/15 bg-white">
          <h3 className="flex items-center justify-between border-b border-brand-border/10 bg-brand-muted/40 px-4 py-2.5 text-xs font-bold uppercase text-brand-primary">
            {grupo.titulo}
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-border">{grupo.campos.length}</span>
          </h3>
          <dl className="grid gap-px bg-brand-border/10 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.campos.map((campo) => (
              <div key={campo.chave} className="min-w-0 bg-white px-4 py-2.5">
                <dt className="text-[11px] font-semibold uppercase text-brand-border">{campo.rotulo}</dt>
                <dd className="mt-0.5 break-words text-sm font-medium">{campo.valor || <span className="font-normal text-brand-border/50">—</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/* ───────────────────────── Blocos de apoio ───────────────────────── */

function Cartao({ titulo, icone: Icone, children, atraso }: { titulo: string; icone: LucideIcon; children: ReactNode; atraso: number }) {
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

function Indicador({ icone: Icone, rotulo, valor, sub, destaque, atraso }: { icone: LucideIcon; rotulo: string; valor: string; sub?: string; destaque?: boolean; atraso: number }) {
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

function Parte({ titulo, nome, documento, cidade, fone, endereco, atraso }: { titulo: string; nome: string; documento: string; cidade: string; fone: string; endereco: string; atraso: number }) {
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <Cartao titulo={titulo} icone={User} atraso={atraso}>
      {nome ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-sm font-bold text-brand-primary">{iniciais || <Package className="size-4" />}</span>
            <div className="min-w-0">
              <p className="break-words text-sm font-bold leading-snug">{nome}</p>
              <p className="mt-0.5 font-mono text-xs text-brand-border">{documento ? cnpjCpf(documento) : "-"}</p>
            </div>
          </div>
          <dl className="space-y-1.5 text-xs text-brand-border">
            {cidade ? <p className="flex gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{cidade}</p> : null}
            {endereco ? <p className="pl-5.5 break-words">{endereco}</p> : null}
            {fone && telefone(fone) ? <p className="pl-5.5">{telefone(fone)}</p> : null}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-brand-border">Não informado.</p>
      )}
    </Cartao>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase text-brand-border">{rotulo}</dt>
      <dd className="mt-0.5 break-words font-medium">{children}</dd>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Carregando dados do 455">
      {[28, 20, 24].map((h, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-white" style={{ height: `${h * 4}px` }} />
      ))}
    </div>
  );
}
