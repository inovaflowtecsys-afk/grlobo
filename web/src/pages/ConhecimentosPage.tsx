import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Search, Truck, X } from "lucide-react";
import { DataGrid, type DataGridColumn } from "../components/common/DataGrid";
import { PageHeader } from "../components/common/PageHeader";
import { AgendadoBadge, PrazoBadge, STATUS_OPCOES, StatusBadge } from "../components/conhecimentos/Sinalizadores";
import { ConhecimentoDetalhe } from "../components/conhecimentos/ConhecimentoDetalhe";
import { NotasFiscaisModal } from "../components/conhecimentos/NotasFiscaisModal";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useDebounced } from "../hooks/useDebounced";
import { formatPlaca, limparOcorrencia, numerosDasNotas } from "../lib/conhecimentoFormat";
import { formatDateBR, formatInt, toISODate } from "../lib/format";
import { cn } from "../lib/utils";
import { getConhecimentoPorCtrc, listConhecimentos } from "../services/conhecimentos";
import type { ConhecimentoListItem, ConhecimentosQuery } from "../types/conhecimento";

const pageSizeOptions = [20, 50, 100];

function periodoMesAtual() {
  const hoje = new Date();
  return { de: toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: toISODate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)) };
}

function consultaInicial(): ConhecimentosQuery {
  return {
    page: 1,
    pageSize: 20,
    busca: "",
    ...periodoMesAtual(),
    remetente: "",
    destinatario: "",
    status: "",
    prazo: "",
    agendamento: "",
    sortBy: "data_autorizacao",
    sortDirection: "desc",
  };
}

export function ConhecimentosPage() {
  const [query, setQuery] = useState<ConhecimentosQuery>(consultaInicial);
  const [rows, setRows] = useState<ConhecimentoListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [detalhe, setDetalhe] = useState<ConhecimentoListItem | null>(null);
  const [notasDe, setNotasDe] = useState<ConhecimentoListItem | null>(null);

  // campos de texto: o usuário digita livremente e a consulta só dispara após uma pausa
  const [buscaInput, setBuscaInput] = useState("");
  const [remetenteInput, setRemetenteInput] = useState("");
  const [destinatarioInput, setDestinatarioInput] = useState("");
  const busca = useDebounced(buscaInput);
  const remetente = useDebounced(remetenteInput);
  const destinatario = useDebounced(destinatarioInput);

  async function abrirDetalhe(r: ConhecimentoListItem) {
    if (!r.ctrc) {
      setDetalhe(r);
      return;
    }
    try {
      setDetalhe((await getConhecimentoPorCtrc(r.ctrc)) ?? r);
    } catch {
      setDetalhe(r);
    }
  }

  useEffect(() => {
    setQuery((q) => (q.busca === busca && q.remetente === remetente && q.destinatario === destinatario ? q : { ...q, busca, remetente, destinatario, page: 1 }));
  }, [busca, remetente, destinatario]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const resultado = await listConhecimentos(query);
      setRows(resultado.data);
      setTotal(resultado.count);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os conhecimentos.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function atualizar(parcial: Partial<ConhecimentosQuery>) {
    setQuery((q) => ({ ...q, ...parcial, page: parcial.page ?? 1 }));
  }

  function ordenar(chave: string) {
    setQuery((q) => ({
      ...q,
      page: 1,
      sortBy: chave as ConhecimentosQuery["sortBy"],
      sortDirection: q.sortBy === chave && q.sortDirection === "desc" ? "asc" : "desc",
    }));
  }

  function limpar() {
    setBuscaInput("");
    setRemetenteInput("");
    setDestinatarioInput("");
    setQuery(consultaInicial());
  }

  const buscandoPorNumero = Boolean(query.busca.trim());
  const padrao = consultaInicial();
  const filtrado =
    buscandoPorNumero || query.remetente || query.destinatario || query.status || query.prazo || query.agendamento || query.de !== padrao.de || query.ate !== padrao.ate;
  const totalPaginas = Math.max(1, Math.ceil(total / query.pageSize));

  const columns = useMemo<DataGridColumn<ConhecimentoListItem>[]>(
    () => [
      {
        key: "ctrc",
        header: "CTRC",
        sortable: true,
        render: (r) => (
          <div className="space-y-0.5">
            <p className="whitespace-nowrap font-semibold">{r.ctrc ?? "-"}</p>
            {r.tipo_conhecimento && r.tipo_conhecimento !== "NORMAL" ? <Badge variant="neutral">{r.tipo_conhecimento === "COMPLEMENTAR" ? "Complementar" : "Devolução"}</Badge> : null}
          </div>
        ),
      },
      { key: "data_autorizacao", header: "Emissão", sortable: true, className: "whitespace-nowrap", render: (r) => formatDateBR(r.data_autorizacao) },
      { key: "remetente", header: "Remetente", render: (r) => <Texto principal={r.remetente_nome} /> },
      {
        key: "destinatario",
        header: "Destinatário",
        render: (r) => <Texto principal={r.destinatario_nome} secundario={[r.entrega_cidade, r.entrega_uf].filter(Boolean).join(" / ")} />,
      },
      { key: "nf", header: "NF", render: (r) => <NotaFiscalCell r={r} onAbrir={() => setNotasDe(r)} /> },
      {
        key: "previsao_entrega",
        header: "Previsão",
        sortable: true,
        className: "whitespace-nowrap",
        render: (r) => (
          <div className="flex flex-col items-start gap-1 whitespace-nowrap">
            <span className="tabular-nums">{formatDateBR(r.previsao_entrega)}</span>
            <AgendadoBadge linha={r} />
          </div>
        ),
      },
      {
        // Situação da entrega em cima e o prazo embaixo, na mesma coluna
        key: "status",
        header: "Entrega",
        className: "whitespace-nowrap",
        render: (r) => (
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              <StatusBadge linha={r} />
              {r.data_entrega ? <span className="text-xs tabular-nums text-brand-border">{formatDateBR(r.data_entrega)}</span> : null}
            </div>
            <PrazoBadge linha={r} />
          </div>
        ),
      },
      {
        key: "veiculo",
        header: "Veículo de entrega",
        className: "whitespace-nowrap",
        render: (r) =>
          r.placa_entrega ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-border/30 bg-white px-2 py-1 font-mono text-xs font-bold tracking-wider shadow-sm">
              <Truck className="size-3.5 text-brand-primary" aria-hidden="true" />
              {formatPlaca(r.placa_entrega)}
            </span>
          ) : (
            <span className="text-brand-border">-</span>
          ),
      },
      { key: "ocorrencia", header: "Ocorrência atual", render: (r) => <OcorrenciaCell r={r} /> },
      {
        key: "acoes",
        header: "",
        className: "text-right",
        render: (r) => (
          <button
            type="button"
            title="Ver todos os dados do 455"
            aria-label={`Ver dados do conhecimento ${r.ctrc ?? ""}`}
            className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
            onClick={() => void abrirDetalhe(r)}
          >
            <Eye className="size-4" aria-hidden="true" />
          </button>
        ),
      },
    ],
    [],
  );

  const selectClass = "flex h-10 w-full rounded-md border border-brand-border/40 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25";
  const dataClass = "h-10 w-full rounded-md border border-brand-border/40 bg-white px-3 text-sm outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25 disabled:bg-brand-muted/60 disabled:text-brand-border";

  return (
    <div className="space-y-5 p-4 md:p-7">
      <PageHeader title="Conhecimentos" description="Conhecimentos de transporte (CTRC / CT-e) vindos do relatório 455 do SSW." />

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Campo rotulo="Número (CTRC, CT-e, NF ou chave)" className="xl:col-span-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
                <Input className="h-10 pl-9" value={buscaInput} onChange={(e) => setBuscaInput(e.target.value)} placeholder="Ex.: SJP011843-5, 143337, 247667" />
              </div>
            </Campo>
            <Campo rotulo="Emissão de" className="xl:col-span-2">
              <input type="date" className={dataClass} value={query.de} max={query.ate || undefined} disabled={buscandoPorNumero} onChange={(e) => atualizar({ de: e.target.value })} />
            </Campo>
            <Campo rotulo="Emissão até" className="xl:col-span-2">
              <input type="date" className={dataClass} value={query.ate} min={query.de || undefined} disabled={buscandoPorNumero} onChange={(e) => atualizar({ ate: e.target.value })} />
            </Campo>
            <Campo rotulo="Remetente (nome ou CNPJ)" className="xl:col-span-2">
              <Input className="h-10" value={remetenteInput} onChange={(e) => setRemetenteInput(e.target.value)} />
            </Campo>
            <Campo rotulo="Destinatário (nome ou CNPJ)" className="xl:col-span-2">
              <Input className="h-10" value={destinatarioInput} onChange={(e) => setDestinatarioInput(e.target.value)} />
            </Campo>

            <Campo rotulo="Status de entrega" className="xl:col-span-3">
              <select className={selectClass} value={query.status} onChange={(e) => atualizar({ status: e.target.value as ConhecimentosQuery["status"] })}>
                <option value="">Todos</option>
                {STATUS_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Prazo" className="xl:col-span-3">
              <select className={selectClass} value={query.prazo} onChange={(e) => atualizar({ prazo: e.target.value as ConhecimentosQuery["prazo"] })}>
                <option value="">Todos</option>
                <option value="NO_PRAZO">No prazo</option>
                <option value="ATRASADO">Atrasado</option>
              </select>
            </Campo>
            <Campo rotulo="Agendamento" className="xl:col-span-2">
              <select className={selectClass} value={query.agendamento} onChange={(e) => atualizar({ agendamento: e.target.value as ConhecimentosQuery["agendamento"] })}>
                <option value="">Todos</option>
                <option value="sim">Com agendamento</option>
                <option value="nao">Sem agendamento</option>
              </select>
            </Campo>
            <Campo rotulo="Linhas" className="xl:col-span-1">
              <select className={selectClass} value={query.pageSize} onChange={(e) => atualizar({ pageSize: Number(e.target.value) })}>
                {pageSizeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Campo>
            <div className="flex items-end gap-2 xl:col-span-3">
              <Button variant="secondary" className="flex-1" onClick={carregar}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Atualizar
              </Button>
              <Button variant="ghost" disabled={!filtrado} onClick={limpar} title="Voltar ao mês atual e remover os filtros">
                <X className="size-4" aria-hidden="true" />
                Limpar
              </Button>
            </div>
          </div>

          <p className="text-xs text-brand-border">
            {buscandoPorNumero
              ? "Busca por número: procurando em todo o histórico, sem limitar pelo período."
              : `Período: ${formatDateBR(query.de)} a ${formatDateBR(query.ate)}${query.de === padrao.de && query.ate === padrao.ate ? " (mês atual)" : ""}.`}
          </p>
        </CardContent>
      </Card>

      {erro ? <div role="alert" className="rounded-lg border border-status-error/25 bg-status-error/10 px-4 py-3 text-sm font-semibold text-status-error">{erro}</div> : null}

      <DataGrid
        columns={columns}
        rows={rows}
        loading={loading}
        getRowId={(r) => `${r.dominio}:${r.chave_linha}`}
        sortBy={query.sortBy}
        sortDirection={query.sortDirection}
        onSort={ordenar}
        emptyTitle="Nenhum conhecimento encontrado."
        emptyDescription={buscandoPorNumero ? "Confira o número informado." : "Ajuste o período ou os filtros."}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-brand-border/15 bg-white px-4 py-3 text-sm text-brand-border md:flex-row md:items-center md:justify-between">
        <span>
          Página {query.page} de {totalPaginas} - {formatInt(total)} conhecimento{total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={query.page <= 1} onClick={() => atualizar({ page: query.page - 1 })}>Anterior</Button>
          <Button variant="secondary" disabled={query.page >= totalPaginas} onClick={() => atualizar({ page: query.page + 1 })}>Próxima</Button>
        </div>
      </div>

      {detalhe ? <ConhecimentoDetalhe key={`${detalhe.dominio}:${detalhe.chave_linha}`} conhecimento={detalhe} onClose={() => setDetalhe(null)} /> : null}
      {notasDe ? <NotasFiscaisModal key={`${notasDe.dominio}:${notasDe.chave_linha}`} conhecimento={notasDe} onClose={() => setNotasDe(null)} /> : null}
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

function Texto({ principal, secundario }: { principal: string | null; secundario?: string }) {
  return (
    <div className="max-w-56 space-y-0.5">
      <p className="truncate font-medium" title={principal ?? undefined}>{principal ?? "-"}</p>
      {secundario ? <p className="truncate text-xs text-brand-border">{secundario}</p> : null}
    </div>
  );
}

// Só o número da nota (sem a série). Com várias notas, mostra a primeira e o "+N"; o clique abre a lista completa.
function NotaFiscalCell({ r, onAbrir }: { r: ConhecimentoListItem; onAbrir: () => void }) {
  const numeros = numerosDasNotas(r.numero_nf);
  if (!numeros.length) return <span className="text-brand-border">-</span>;

  const demais = numeros.length - 1;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition hover:bg-brand-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-accent"
      title={demais > 0 ? `Ver as ${numeros.length} notas fiscais` : "Ver detalhes da nota fiscal"}
      aria-label={`Ver notas fiscais do conhecimento ${r.ctrc ?? ""}`}
    >
      <span className="font-semibold tabular-nums">{numeros[0]}</span>
      {demais > 0 ? <span className="rounded-full bg-brand-accent/15 px-1.5 py-0.5 text-[11px] font-bold text-brand-primary group-hover:bg-brand-accent/25">+{demais}</span> : null}
    </button>
  );
}

// Última ocorrência registrada no SSW: descrição (sem o contato do agendamento), data e unidade.
function OcorrenciaCell({ r }: { r: ConhecimentoListItem }) {
  const localizacao = limparOcorrencia(r.localizacao_atual);
  // Quando o conhecimento informa que está em entrega, esse estado é mais atual
  // do que uma descrição de ocorrência eventualmente antiga.
  const emEntrega = r.status_entrega === "EM_ABERTO" && /^EM ENTREGA\b/i.test(localizacao);
  const descricao = emEntrega ? localizacao : limparOcorrencia(r.ocorrencia_descricao) || localizacao;
  if (!descricao) return <span className="text-brand-border">-</span>;

  const rodape = [r.ocorrencia_data ? formatDateBR(r.ocorrencia_data) : null, r.ocorrencia_unidade].filter(Boolean).join(" · ");
  return (
    <div className="max-w-72 space-y-0.5">
      <p className="line-clamp-2 text-sm leading-snug" title={descricao}>{descricao}</p>
      {rodape ? <p className="text-xs text-brand-border">{rodape}</p> : null}
    </div>
  );
}
