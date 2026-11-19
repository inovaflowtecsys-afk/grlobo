import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, FileText, History, Loader2, Plus, RefreshCw, Search, SquarePen, Trash2, Truck, UsersRound, X } from "lucide-react";
import { DataGrid, type DataGridColumn } from "../components/common/DataGrid";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Modal } from "../components/ui/modal";
import { Switch } from "../components/ui/switch";
import { useAuth } from "../hooks/useAuth";
import { descreverFiltrosFrete, exportFretesExcel, exportFretesPdf } from "../lib/exportFrete";
import { formatBRL, formatDateBR, formatDateTimeBR, formatInt, toISODate } from "../lib/format";
import { agoraLocal, formatCpf, formatPlaca, isoParaLocal, mensagemErro, normalizarPlaca, parseValor, placaValida, valorParaCampo } from "../lib/frete";
import { cn } from "../lib/utils";
import {
  createFrete,
  createFrota,
  createMotorista,
  deleteFrete,
  deleteFrota,
  deleteMotorista,
  listFretes,
  listFrotas,
  listLog,
  listMotoristas,
  listTodosFretes,
  updateFrete,
  updateFrota,
  updateMotorista,
} from "../services/frete";
import { type FreteFormData, type FreteFrota, type FreteListItem, type FreteLogItem, type FreteMotorista, type FretePago, type FretesQuery, TIPOS_FROTA, type TipoFrota } from "../types/frete";

const pageSizeOptions = [10, 20, 50, 100];

function periodoMesAtual() {
  const hoje = new Date();
  return {
    de: toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    ate: toISODate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
}

const emptyForm = (): FreteFormData => ({
  data_registro: agoraLocal(),
  motorista_id: "",
  frota_id: "",
  valor_frete_carga: "",
  valor_frete: "",
  valor_coleta: "",
  valor_chapa: "",
  valor_descarga: "",
  valor_adicional: "",
  observacao: "",
  pago: false,
  nota_fiscal: "",
});

const totalFrete = (row: FreteListItem) => row.valor_frete + row.valor_coleta + row.valor_chapa + row.valor_descarga + row.valor_adicional;
const resultadoFrete = (row: FreteListItem) => (row.valor_frete_carga > 0 ? (row.valor_frete / row.valor_frete_carga) * 100 : null);

export function FreteEntregaPage() {
  const { isAdmin, podeAcao } = useAuth();
  const periodoInicial = useMemo(periodoMesAtual, []);
  const podeIncluir = podeAcao("frete_entrega_incluir", "frete_entrega");
  const podeEditar = podeAcao("frete_entrega_editar", "frete_entrega");
  const podeExcluir = podeAcao("frete_entrega_excluir", "frete_entrega");
  const [rows, setRows] = useState<FreteListItem[]>([]);
  const [motoristas, setMotoristas] = useState<FreteMotorista[]>([]);
  const [frotas, setFrotas] = useState<FreteFrota[]>([]);
  const [frotasOpen, setFrotasOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "ok" | "erro"; text: string } | null>(null);
  const [modal, setModal] = useState<{ record: FreteListItem | null } | null>(null);
  const [excluir, setExcluir] = useState<FreteListItem | null>(null);
  const [regraPago, setRegraPago] = useState<{ record: FreteListItem; acao: "editar" | "excluir" } | null>(null);
  const [query, setQuery] = useState<FretesQuery>({
    page: 1,
    pageSize: 100,
    motoristaId: "",
    de: periodoInicial.de,
    ate: periodoInicial.ate,
    notaFiscal: "",
    placa: "",
    pago: "todos",
    sortBy: "data_registro",
    sortDirection: "desc",
  });
  const [notaInput, setNotaInput] = useState("");
  const [placaInput, setPlacaInput] = useState("");
  const [exportando, setExportando] = useState<"" | "pdf" | "excel">("");

  // busca por nota fiscal com debounce
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery((q) => (q.notaFiscal === notaInput ? q : { ...q, notaFiscal: notaInput, page: 1 })), 350);
    return () => window.clearTimeout(timer);
  }, [notaInput]);

  // filtro por placa com debounce (a placa é normalizada: maiúsculas, sem hífen)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const placa = normalizarPlaca(placaInput);
      setQuery((q) => (q.placa === placa ? q : { ...q, placa, page: 1 }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [placaInput]);

  const loadMotoristas = useCallback(async () => {
    try {
      setMotoristas(await listMotoristas());
    } catch (e) {
      showFeedback("erro", mensagemErro(e, "Não foi possível carregar os motoristas."));
    }
  }, []);

  useEffect(() => {
    loadMotoristas();
  }, [loadMotoristas]);

  const loadFrotas = useCallback(async () => {
    try {
      setFrotas(await listFrotas());
    } catch (e) {
      showFeedback("erro", mensagemErro(e, "Não foi possível carregar as frotas."));
    }
  }, []);

  useEffect(() => {
    loadFrotas();
  }, [loadFrotas]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listFretes(query);
      setRows(result.data);
      setTotal(result.count);
    } catch (e) {
      showFeedback("erro", mensagemErro(e, "Não foi possível carregar os fretes."));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  /** Baixa todos os fretes dos filtros atuais (não só a página) e gera o arquivo. */
  async function exportar(tipo: "pdf" | "excel") {
    setExportando(tipo);
    try {
      const todos = await listTodosFretes(query);
      const filtros = descreverFiltrosFrete(query, motoristas.find((m) => m.id === query.motoristaId)?.nome ?? "");
      if (tipo === "pdf") await exportFretesPdf(todos, filtros);
      else exportFretesExcel(todos, filtros);
    } catch (e) {
      showFeedback("erro", mensagemErro(e, "Não foi possível exportar os fretes."));
    } finally {
      setExportando("");
    }
  }

  function showFeedback(type: "ok" | "erro", text: string) {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), type === "ok" ? 3500 : 6000);
  }

  function updateQuery(partial: Partial<FretesQuery>) {
    setQuery((current) => ({ ...current, ...partial, page: partial.page ?? 1 }));
  }

  function handleSort(key: string) {
    setQuery((current) => ({
      ...current,
      page: 1,
      sortBy: key as FretesQuery["sortBy"],
      sortDirection: current.sortBy === key && current.sortDirection === "asc" ? "desc" : "asc",
    }));
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const dinheiro = (v: number) => (v > 0 ? formatBRL(v) : "-");

  const columns = useMemo<DataGridColumn<FreteListItem>[]>(
    () => [
      { key: "data_registro", header: "Data", sortable: true, render: (row) => <span className="whitespace-nowrap text-xs">{formatDateBR(row.data_registro)}</span> },
      {
        key: "motorista",
        header: "Motorista",
        render: (row) => (
          <div className="flex flex-col items-start gap-1">
            <span className="whitespace-nowrap text-xs font-semibold">{row.motorista?.nome ?? "-"}</span>
            {row.frota ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded bg-brand-muted px-1.5 py-0.5 text-[11px] leading-4 text-brand-border">
                <Truck className="size-3" aria-hidden="true" />
                <span className="font-semibold text-brand-dark">{formatPlaca(row.frota.placa)}</span>
                <span aria-hidden="true">·</span>
                <span>{row.frota.tipo}</span>
              </span>
            ) : null}
          </div>
        ),
      },
      { key: "valor_frete_carga", header: "Frete Receita", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_frete_carga)}</span> },
      { key: "valor_frete", header: "Valor do frete", sortable: true, className: "text-right", render: (row) => <span className="whitespace-nowrap font-semibold">{formatBRL(row.valor_frete)}</span> },
      { key: "coleta", header: "Coleta", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_coleta)}</span> },
      { key: "chapa", header: "Chapa", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_chapa)}</span> },
      { key: "descarga", header: "Descarga", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_descarga)}</span> },
      { key: "adicional", header: "Adicional", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_adicional)}</span> },
      { key: "total", header: "Total", className: "text-right", render: (row) => <span className="whitespace-nowrap rounded-md bg-brand-primary/10 px-2 py-1 font-bold text-brand-primary">{formatBRL(totalFrete(row))}</span> },
      { key: "resultado", header: "Resultado %", className: "text-right", render: (row) => <span className="whitespace-nowrap font-semibold">{resultadoFrete(row) == null ? "-" : `${resultadoFrete(row)!.toFixed(1).replace(".", ",")}%`}</span> },
      {
        key: "pago",
        header: "Pagamento",
        sortable: true,
        render: (row) => (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Badge variant={row.pago ? "success" : "warning"}>{row.pago ? "Pago" : "Pendente"}</Badge>
            {row.pago && row.data_pagamento ? <span className="text-xs text-brand-border">{formatDateBR(row.data_pagamento)}</span> : null}
          </div>
        ),
      },
      { key: "nota_fiscal", header: "Nota fiscal", sortable: true, render: (row) => row.nota_fiscal || "-" },
    ],
    [],
  );

  /** Abre o registro ao clicar na linha (registro pago só é editável pelo administrador). */
  function abrirRegistro(row: FreteListItem) {
    if (row.pago && !isAdmin) {
      setRegraPago({ record: row, acao: "editar" });
      return;
    }
    setModal({ record: row });
  }

  return (
    <div className="space-y-5 p-4 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeader title="Frete entrega" description="Fretes pagos a motoristas, com controle de pagamento e nota fiscal." />
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setFrotasOpen(true)}>
            <Truck className="size-4" aria-hidden="true" />
            Frotas
          </Button>
          {podeIncluir ? (
            <Button onClick={() => setModal({ record: null })}>
              <Plus className="size-4" aria-hidden="true" />
              Novo frete
            </Button>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div
          role={feedback.type === "erro" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-4 py-3 text-sm font-semibold",
            feedback.type === "ok" ? "border-status-success/20 bg-status-success/10 text-status-success" : "border-status-error/25 bg-status-error/10 text-status-error",
          )}
        >
          {feedback.text}
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_150px_150px_140px_160px_150px_100px_auto]">
          <Field label="Motorista">
            <Select value={query.motoristaId} onChange={(e) => updateQuery({ motoristaId: e.target.value })}>
              <option value="">Todos</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Data de">
            <Input className="h-10" type="date" value={query.de} max={query.ate || undefined} onChange={(e) => updateQuery({ de: e.target.value })} />
          </Field>
          <Field label="Data até">
            <Input className="h-10" type="date" value={query.ate} min={query.de || undefined} onChange={(e) => updateQuery({ ate: e.target.value })} />
          </Field>
          <Field label="Placa">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
              <Input className="h-10 pl-9 uppercase" value={placaInput} maxLength={8} onChange={(e) => setPlacaInput(e.target.value.toUpperCase())} placeholder="ABC1D23" />
            </div>
          </Field>
          <Field label="Nota fiscal">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
              <Input className="h-10 pl-9" value={notaInput} onChange={(e) => setNotaInput(e.target.value)} placeholder="Número" />
            </div>
          </Field>
          <Field label="Pagamento">
            <Select value={query.pago} onChange={(e) => updateQuery({ pago: e.target.value as FretePago })}>
              <option value="todos">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="pago">Pagos</option>
            </Select>
          </Field>
          <Field label="Linhas">
            <Select value={query.pageSize} onChange={(e) => updateQuery({ pageSize: Number(e.target.value) })}>
              {pageSizeOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={loadRows}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-border">{formatInt(total)} registro{total === 1 ? "" : "s"} nos filtros atuais · clique na linha para abrir</p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={exportando !== "" || total === 0} onClick={() => exportar("pdf")} title="Baixar em PDF todos os registros dos filtros atuais">
            {exportando === "pdf" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
            PDF
          </Button>
          <Button variant="secondary" disabled={exportando !== "" || total === 0} onClick={() => exportar("excel")} title="Exportar para Excel todos os registros dos filtros atuais">
            {exportando === "excel" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="size-4" aria-hidden="true" />}
            Excel
          </Button>
        </div>
      </div>

      <DataGrid
        columns={columns}
        rows={rows}
        loading={loading}
        getRowId={(row) => row.id}
        sortBy={query.sortBy}
        sortDirection={query.sortDirection}
        onSort={handleSort}
        onRowClick={abrirRegistro}
        emptyTitle="Nenhum frete encontrado."
        emptyDescription="Ajuste os filtros ou cadastre um novo frete."
      />

      <div className="flex flex-col gap-3 rounded-lg border border-brand-border/15 bg-white px-4 py-3 text-sm text-brand-border md:flex-row md:items-center md:justify-between">
        <span>
          Página {query.page} de {totalPages} - {total} registro{total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={query.page <= 1} onClick={() => updateQuery({ page: query.page - 1 })}>Anterior</Button>
          <Button variant="secondary" disabled={query.page >= totalPages} onClick={() => updateQuery({ page: query.page + 1 })}>Próxima</Button>
        </div>
      </div>

      {modal ? (
        <FreteFormModal
          key={modal.record?.id ?? "novo"}
          record={modal.record}
          motoristas={motoristas}
          frotas={frotas}
          onFrotasChanged={async () => {
            await loadFrotas();
            await loadRows();
          }}
          saving={saving}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
          isAdmin={isAdmin}
          onExcluir={() => {
            if (!modal.record) return;
            if (modal.record.pago && !isAdmin) {
              setRegraPago({ record: modal.record, acao: "excluir" });
              return;
            }
            setExcluir(modal.record);
          }}
          onMotoristasChanged={async () => {
            await loadMotoristas();
            await loadRows();
          }}
          onClose={() => setModal(null)}
          onSave={async (valores) => {
            setSaving(true);
            try {
              if (modal.record) {
                await updateFrete(modal.record.id, valores, modal.record.pago);
                showFeedback("ok", "Frete atualizado com sucesso.");
              } else {
                await createFrete(valores);
                showFeedback("ok", "Frete cadastrado com sucesso.");
              }
              setModal(null);
              await loadRows();
            } catch (e) {
              showFeedback("erro", mensagemErro(e, "Não foi possível salvar o frete."));
              setModal(null);
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      {frotasOpen ? (
        <FrotasModal
          placaInicial=""
          frotas={frotas}
          onClose={() => setFrotasOpen(false)}
          onChanged={async () => {
            await loadFrotas();
            await loadRows();
          }}
        />
      ) : null}

      {excluir ? (
        <Modal open title="Excluir frete" onClose={() => setExcluir(null)} className="max-w-md">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-brand-border">
              Excluir o frete de <strong className="text-brand-dark">{excluir.motorista?.nome ?? "motorista"}</strong> em {formatDateTimeBR(excluir.data_registro)}, no valor de{" "}
              {formatBRL(excluir.valor_frete)}? A exclusão fica registrada no histórico.
            </p>
            <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
              <Button variant="secondary" disabled={saving} onClick={() => setExcluir(null)}>Cancelar</Button>
              <Button
                variant="danger"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await deleteFrete(excluir.id);
                    setExcluir(null);
                    setModal(null);
                    showFeedback("ok", "Frete excluído.");
                    await loadRows();
                  } catch (e) {
                    showFeedback("erro", mensagemErro(e, "Não foi possível excluir o frete."));
                    setExcluir(null);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {regraPago ? (
        <Modal open title="Registro pago protegido" onClose={() => setRegraPago(null)} className="max-w-md">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-brand-border">
              Este frete está marcado como <strong className="text-brand-dark">pago</strong>. A {regraPago.acao === "editar" ? "edição" : "exclusão"} de um registro pago é permitida somente para o administrador.
            </p>
            <p className="rounded-md bg-brand-muted px-3 py-2 text-xs leading-5 text-brand-border">
              O pagamento e a nota fiscal permanecem protegidos para preservar o histórico financeiro.
            </p>
            <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
              <Button variant="secondary" onClick={() => setRegraPago(null)}>Fechar</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function FreteFormModal({
  record,
  motoristas,
  frotas,
  onFrotasChanged,
  saving,
  podeEditar,
  podeExcluir,
  isAdmin,
  onExcluir,
  onClose,
  onSave,
  onMotoristasChanged,
}: {
  record: FreteListItem | null;
  motoristas: FreteMotorista[];
  frotas: FreteFrota[];
  onFrotasChanged: () => Promise<void>;
  saving: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  isAdmin: boolean;
  onExcluir: () => void;
  onClose: () => void;
  onSave: (valores: FreteFormData) => Promise<void>;
  onMotoristasChanged: () => Promise<void>;
}) {
  const jaPago = record?.pago === true;
  const somenteLeitura = record != null && !podeEditar;
  const { podeAcao } = useAuth();
  const podeIncluirMotorista = podeAcao("frete_entrega_incluir", "frete_entrega");
  const [values, setValues] = useState<FreteFormData>(() =>
    record
      ? {
          data_registro: isoParaLocal(record.data_registro),
          motorista_id: record.motorista_id,
          frota_id: record.frota_id ?? "",
          valor_frete_carga: record.valor_frete_carga ? valorParaCampo(record.valor_frete_carga) : "",
          valor_frete: valorParaCampo(record.valor_frete),
          valor_coleta: record.valor_coleta ? valorParaCampo(record.valor_coleta) : "",
          valor_chapa: record.valor_chapa ? valorParaCampo(record.valor_chapa) : "",
          valor_descarga: record.valor_descarga ? valorParaCampo(record.valor_descarga) : "",
          valor_adicional: record.valor_adicional ? valorParaCampo(record.valor_adicional) : "",
          observacao: record.observacao ?? "",
          pago: record.pago,
          nota_fiscal: record.nota_fiscal ?? "",
        }
      : emptyForm(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aba, setAba] = useState<"cadastro" | "historico">("cadastro");
  const [motoristasOpen, setMotoristasOpen] = useState<{ nome: string } | null>(null);
  const [frotasOpen, setFrotasOpen] = useState<{ placa: string } | null>(null);
  // placa do frete que não está (mais) na lista de frotas ativas, ex.: placa excluída depois do lançamento
  const frotaDoRegistro = record?.frota && record.frota.id === values.frota_id ? record.frota : null;
  const frotaSelecionada = frotas.find((f) => f.id === values.frota_id) ?? (frotaDoRegistro as FreteFrota | null);
  const [dataPagamentoPrevia] = useState(() => new Date().toISOString());
  const totalValores =
    (parseValor(values.valor_frete) ?? 0) +
    (parseValor(values.valor_coleta) ?? 0) +
    (parseValor(values.valor_chapa) ?? 0) +
    (parseValor(values.valor_descarga) ?? 0) +
    (parseValor(values.valor_adicional) ?? 0);

  function change<K extends keyof FreteFormData>(field: K, value: FreteFormData[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.data_registro) next.data_registro = "Informe a data.";
    if (!values.motorista_id) next.motorista_id = "Selecione o motorista.";
    if (parseValor(values.valor_frete) == null) next.valor_frete = "Informe o valor do frete.";
    for (const campo of ["valor_frete_carga", "valor_frete", "valor_coleta", "valor_chapa", "valor_descarga", "valor_adicional"] as const) {
      if (values[campo].trim() && (parseValor(values[campo]) ?? -1) < 0) next[campo] = "Valor inválido.";
    }
    if (values.pago && !jaPago && !values.nota_fiscal.trim()) next.nota_fiscal = "Informe a nota fiscal para registrar o pagamento.";
    setErrors(next);
    if (Object.keys(next).length) return;
    await onSave(values);
  }

  return (
    <Modal open title={record ? "Editar frete" : "Cadastrar frete"} onClose={onClose} hideHeader>
      <form className="space-y-5" onSubmit={submit} noValidate>
        <div className="flex items-start justify-between gap-4 border-b border-brand-border/10 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <Truck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold">{record ? "Editar frete" : "Cadastrar frete"}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-border">Motorista, valores, observação e controle de pagamento.</p>
            </div>
          </div>
          <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {jaPago && isAdmin ? (
          <div className="rounded-lg border border-status-warning/25 bg-status-warning/10 px-4 py-3 text-sm leading-5 text-brand-dark">
            Este registro está pago. A alteração ou exclusão é uma exceção exclusiva do administrador e ficará registrada no histórico.
          </div>
        ) : null}

        {record ? (
          <div role="tablist" aria-label="Seções do frete" className="flex gap-1 border-b border-brand-border/15">
            {(["cadastro", "historico"] as const).map((chave) => (
              <button
                key={chave}
                type="button"
                role="tab"
                aria-selected={aba === chave}
                className={cn(
                  "-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition",
                  aba === chave ? "border-brand-primary text-brand-primary" : "border-transparent text-brand-border hover:text-brand-dark",
                )}
                onClick={() => setAba(chave)}
              >
                {chave === "cadastro" ? "Cadastro" : "Histórico"}
              </button>
            ))}
          </div>
        ) : null}

        {record && aba === "historico" ? <Historico entidade="FRETE" registroId={record.id} motoristas={motoristas} /> : null}

        {/* o cadastro continua montado ao trocar de aba, para não perder o que foi digitado */}
        <fieldset disabled={somenteLeitura} className={cn("m-0 min-w-0 space-y-4 border-0 p-0", record && aba === "historico" && "hidden")}>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <Field label="Data" required error={errors.data_registro}>
              <Input className="h-10" type="datetime-local" value={values.data_registro} onChange={(e) => change("data_registro", e.target.value)} />
            </Field>
            <Field label="Motorista" required error={errors.motorista_id}>
              <MotoristaCombobox
                motoristas={motoristas}
                value={values.motorista_id}
                onChange={(id) => change("motorista_id", id)}
                podeCadastrar={podeIncluirMotorista}
                onCadastrar={(nome) => setMotoristasOpen({ nome })}
                onGerenciar={() => setMotoristasOpen({ nome: "" })}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <Field label="Placa">
              <PlacaCombobox
                frotas={frotas}
                value={values.frota_id}
                selecionada={frotaSelecionada}
                onChange={(id) => change("frota_id", id)}
                podeCadastrar={podeIncluirMotorista}
                onCadastrar={(placa) => setFrotasOpen({ placa })}
                onGerenciar={() => setFrotasOpen({ placa: "" })}
              />
            </Field>
            <Field label="Tipo de veículo">
              <Input className="h-10" value={frotaSelecionada?.tipo ?? ""} placeholder="Preenchido pela placa" disabled readOnly />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Frete Receita">
              <ValorInput value={values.valor_frete_carga} onChange={(v) => change("valor_frete_carga", v)} />
            </Field>
            <Field label="Valor do frete" required error={errors.valor_frete}>
              <ValorInput value={values.valor_frete} onChange={(v) => change("valor_frete", v)} />
            </Field>
            <Field label="Coleta" error={errors.valor_coleta}>
              <ValorInput value={values.valor_coleta} onChange={(v) => change("valor_coleta", v)} />
            </Field>
            <Field label="Chapa" error={errors.valor_chapa}>
              <ValorInput value={values.valor_chapa} onChange={(v) => change("valor_chapa", v)} />
            </Field>
            <Field label="Descarga" error={errors.valor_descarga}>
              <ValorInput value={values.valor_descarga} onChange={(v) => change("valor_descarga", v)} />
            </Field>
            <Field label="Adicional" error={errors.valor_adicional}>
              <ValorInput value={values.valor_adicional} onChange={(v) => change("valor_adicional", v)} />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-brand-primary/10 px-4 py-3">
            <span className="text-sm font-bold text-brand-dark">Total do frete</span>
            <span className="text-xl font-bold tabular-nums text-brand-primary">{formatBRL(totalValores)}</span>
          </div>

          <Field label="Observação">
            <textarea
              rows={3}
              className="w-full resize-y rounded-md border border-brand-border/40 bg-white px-3 py-2 text-sm text-brand-dark outline-none transition placeholder:text-brand-border/70 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25"
              value={values.observacao}
              onChange={(e) => change("observacao", e.target.value)}
              placeholder="Observações da carga (texto livre, mais de uma linha)"
            />
          </Field>

          <div className="space-y-4 rounded-lg border border-brand-border/15 p-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={values.pago}
                disabled={jaPago}
                label="Pagamento realizado"
                onChange={(v) => {
                  change("pago", v);
                  if (!v) change("nota_fiscal", "");
                }}
              />
              <span className="text-sm font-semibold">Pagamento realizado</span>
              {jaPago ? <span className="text-xs text-brand-border">Pagamento e nota fiscal não podem ser alterados.</span> : null}
            </div>
            {values.pago ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nota fiscal" required={!jaPago} error={errors.nota_fiscal}>
                  <Input className="h-10" value={values.nota_fiscal} disabled={jaPago} onChange={(e) => change("nota_fiscal", e.target.value)} />
                </Field>
                <Field label="Data do pagamento">
                  <Input className="h-10" value={formatDateTimeBR(jaPago ? record?.data_pagamento : dataPagamentoPrevia)} disabled readOnly />
                  {!jaPago ? <p className="text-xs text-brand-border">Preenchida automaticamente ao salvar, sem alteração.</p> : null}
                </Field>
              </div>
            ) : null}
          </div>

        </fieldset>

        <div className="flex flex-col gap-3 border-t border-brand-border/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {record && podeExcluir ? (
              <Button variant="secondary" className="text-status-error" disabled={saving} onClick={onExcluir}>
                <Trash2 className="size-4" aria-hidden="true" />
                Excluir frete
              </Button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={onClose}>{somenteLeitura ? "Fechar" : "Cancelar"}</Button>
            {somenteLeitura ? null : <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>}
          </div>
        </div>
      </form>

      {motoristasOpen ? (
        <MotoristasModal
          nomeInicial={motoristasOpen.nome}
          motoristas={motoristas}
          onClose={() => setMotoristasOpen(null)}
          onChanged={onMotoristasChanged}
          onCriado={(m) => change("motorista_id", m.id)}
        />
      ) : null}

      {frotasOpen ? (
        <FrotasModal
          placaInicial={frotasOpen.placa}
          frotas={frotas}
          onClose={() => setFrotasOpen(null)}
          onChanged={onFrotasChanged}
          onCriada={(f) => change("frota_id", f.id)}
        />
      ) : null}
    </Modal>
  );
}

/** Campo de busca por placa; sem resultado oferece cadastrar a placa (abre o popup de Frotas). */
function PlacaCombobox({
  frotas,
  value,
  selecionada,
  onChange,
  podeCadastrar,
  onCadastrar,
  onGerenciar,
}: {
  frotas: FreteFrota[];
  value: string;
  selecionada: FreteFrota | null;
  onChange: (id: string) => void;
  podeCadastrar: boolean;
  onCadastrar: (placa: string) => void;
  onGerenciar: () => void;
}) {
  const [texto, setTexto] = useState(selecionada ? formatPlaca(selecionada.placa) : "");
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  // mantém o texto em dia quando a seleção muda por fora (ex.: placa recém-cadastrada)
  useEffect(() => {
    if (selecionada) setTexto(formatPlaca(selecionada.placa));
  }, [selecionada]);

  useEffect(() => {
    if (!aberto) return;
    function fora(event: MouseEvent) {
      if (!caixa.current?.contains(event.target as Node)) {
        setAberto(false);
        setTexto(selecionada ? formatPlaca(selecionada.placa) : "");
      }
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, selecionada]);

  const termo = normalizarPlaca(texto);
  const filtradas = (termo && termo !== selecionada?.placa ? frotas.filter((f) => f.placa.includes(termo)) : frotas).slice(0, 50);

  return (
    <div className="flex gap-2">
      <div ref={caixa} className="relative min-w-0 flex-1">
        <Input
          className="h-10 uppercase"
          value={texto}
          placeholder="Digite a placa"
          autoComplete="off"
          maxLength={8}
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            setTexto(e.target.value.toUpperCase());
            setAberto(true);
            if (value) onChange("");
          }}
        />
        {aberto ? (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-brand-border/25 bg-white py-1 text-sm shadow-lg">
            {filtradas.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-brand-muted"
                  onClick={() => {
                    onChange(f.id);
                    setTexto(formatPlaca(f.placa));
                    setAberto(false);
                  }}
                >
                  <span className="font-semibold">{formatPlaca(f.placa)}</span>
                  <span className="text-xs text-brand-border">{f.tipo}</span>
                </button>
              </li>
            ))}
            {!filtradas.length ? (
              <li className="space-y-2 px-3 py-2">
                <p className="text-brand-border">Nenhuma placa encontrada.</p>
                {podeCadastrar ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 font-semibold text-brand-primary hover:underline"
                    onClick={() => {
                      setAberto(false);
                      onCadastrar(termo);
                    }}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Cadastrar placa{termo ? ` "${formatPlaca(termo)}"` : ""}
                  </button>
                ) : null}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        title="Gerenciar frotas"
        aria-label="Gerenciar frotas"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-brand-border/40 text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
        onClick={onGerenciar}
      >
        <Truck className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Popup do cadastro de frotas: placa + tipo, com lista para incluir, editar e excluir independente de qualquer frete. */
function FrotasModal({
  placaInicial,
  frotas,
  onClose,
  onChanged,
  onCriada,
}: {
  placaInicial: string;
  frotas: FreteFrota[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCriada?: (frota: FreteFrota) => void;
}) {
  const [editando, setEditando] = useState<FreteFrota | null>(null);
  const [placa, setPlaca] = useState(normalizarPlaca(placaInicial));
  const [tipo, setTipo] = useState<TipoFrota | "">("");
  const [formOpen, setFormOpen] = useState(Boolean(placaInicial));
  const [busca, setBusca] = useState("");
  const [apagar, setApagar] = useState<FreteFrota | null>(null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [historico, setHistorico] = useState<FreteFrota | null>(null);
  const { podeAcao } = useAuth();
  const podeIncluir = podeAcao("frete_entrega_incluir", "frete_entrega");
  const podeEditar = podeAcao("frete_entrega_editar", "frete_entrega");
  const podeExcluir = podeAcao("frete_entrega_excluir", "frete_entrega");
  const podeSalvar = editando ? podeEditar : podeIncluir;

  const termo = normalizarPlaca(busca);
  const lista = frotas.filter((f) => !termo || f.placa.includes(termo) || f.tipo.includes(busca.trim().toUpperCase()));

  function limpar() {
    setEditando(null);
    setPlaca("");
    setTipo("");
    setErro("");
  }

  function novaFrota() {
    limpar();
    setFormOpen(true);
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!placaValida(placa)) {
      setErro("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
      return;
    }
    if (frotas.some((f) => f.id !== editando?.id && normalizarPlaca(f.placa) === normalizarPlaca(placa))) {
      setErro("Esta placa já está cadastrada.");
      return;
    }
    if (!tipo) {
      setErro("Selecione o tipo do veículo.");
      return;
    }
    setSaving(true);
    setErro("");
    try {
      if (editando) {
        await updateFrota(editando.id, placa, tipo);
      } else {
        const criada = await createFrota(placa, tipo);
        onCriada?.(criada);
      }
      await onChanged();
      limpar();
      setFormOpen(false);
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível salvar a placa."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmarExclusao(frota: FreteFrota) {
    setSaving(true);
    setErro("");
    try {
      await deleteFrota(frota.id);
      await onChanged();
      setApagar(null);
      if (editando?.id === frota.id) {
        limpar();
        setFormOpen(false);
      }
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível excluir a placa."));
      setApagar(null);
    } finally {
      setSaving(false);
    }
  }

  if (placaInicial) {
    return <FrotaCadastroPopup placaInicial={placaInicial} frotas={frotas} onClose={onClose} onChanged={onChanged} onCriada={onCriada} />;
  }
  if (formOpen) {
    return (
      <FrotaCadastroPopup
        placaInicial={placa}
        editando={editando}
        frotas={frotas}
        onClose={() => { setFormOpen(false); limpar(); }}
        onChanged={onChanged}
      />
    );
  }

  return (
    <Modal open title="Gerenciar frotas" onClose={onClose} hideHeader>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-brand-border/10 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <Truck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold">Gerenciar frotas</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-border">Cadastre placas e tipos de veículos usados nos lançamentos de frete.</p>
            </div>
          </div>
          <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-brand-dark">Veículos cadastrados</h4>
              <p className="mt-1 text-xs text-brand-border">Consulte, edite ou remova placas da frota.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
                {frotas.length} {frotas.length === 1 ? "veículo" : "veículos"}
              </span>
              {podeIncluir ? <Button onClick={novaFrota}><Plus className="size-4" aria-hidden="true" />Nova frota</Button> : null}
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
            <Input className="h-10 pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar placa ou tipo" />
          </div>
          <ul className="max-h-64 divide-y divide-brand-border/10 overflow-y-auto rounded-lg border border-brand-border/15 bg-white">
            {lista.slice(0, 200).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-brand-muted/40">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand-primary">
                    <Truck className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-brand-dark">{formatPlaca(f.placa)}</p>
                    <p className="truncate text-xs text-brand-border">{f.tipo}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Histórico"
                    aria-label={`Histórico de ${f.placa}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
                    onClick={() => setHistorico(historico?.id === f.id ? null : f)}
                  >
                    <History className="size-4" aria-hidden="true" />
                  </button>
                  {podeEditar ? (
                    <button
                      type="button"
                      title="Editar"
                      aria-label={`Editar ${f.placa}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
                      onClick={() => {
                        setEditando(f);
                        setPlaca(f.placa);
                        setTipo(f.tipo);
                        setErro("");
                        setFormOpen(true);
                      }}
                    >
                      <SquarePen className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                  {podeExcluir ? (
                    <button
                      type="button"
                      title="Excluir"
                      aria-label={`Excluir ${f.placa}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-status-error transition hover:bg-status-error/10"
                      onClick={() => setApagar(f)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!lista.length ? <li className="px-4 py-8 text-center text-sm text-brand-border">Nenhum veículo encontrado.</li> : null}
          </ul>
        </div>

        {historico ? <Historico entidade="PLACA" registroId={historico.id} motoristas={[]} /> : null}

        <div className="flex justify-end border-t border-brand-border/10 pt-4">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>

      {apagar ? (
        <Modal open title="Excluir placa" onClose={() => setApagar(null)} className="max-w-md">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-brand-border">
              Excluir a placa <strong className="text-brand-dark">{formatPlaca(apagar.placa)}</strong> ({apagar.tipo})? Os fretes já lançados continuam com a placa. A exclusão fica registrada no histórico.
            </p>
            <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
              <Button variant="secondary" disabled={saving} onClick={() => setApagar(null)}>Cancelar</Button>
              <Button variant="danger" disabled={saving} onClick={() => confirmarExclusao(apagar)}>{saving ? "Excluindo..." : "Excluir"}</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {formOpen ? (
        <Modal open title={editando ? "Editar veículo" : "Cadastrar veículo"} onClose={() => { setFormOpen(false); limpar(); }} hideHeader className="max-w-xl">
          <form className="space-y-5" onSubmit={salvar} noValidate>
            <div className="flex items-start justify-between gap-4 border-b border-brand-border/10 pb-4">
              <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <Truck className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold">{editando ? "Editar veículo" : "Cadastrar nova frota"}</h3>
                  <p className="mt-1 text-sm leading-6 text-brand-border">Informe a placa e o tipo do veículo.</p>
                </div>
              </div>
              <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={() => { setFormOpen(false); limpar(); }} aria-label="Fechar">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Placa" required>
                <Input className="h-10 uppercase" value={placa} maxLength={8} onChange={(e) => setPlaca(normalizarPlaca(e.target.value))} placeholder="ABC1D23" autoFocus />
              </Field>
              <Field label="Tipo de veículo" required>
                <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFrota | "")}>
                  <option value="">Selecione o tipo</option>
                  {TIPOS_FROTA.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            </div>
            {erro ? <p role="alert" className="text-xs font-medium text-status-error">{erro}</p> : null}
            <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
              <Button variant="secondary" disabled={saving} onClick={() => { setFormOpen(false); limpar(); }}>Cancelar</Button>
              <Button type="submit" disabled={saving || !podeSalvar}>{saving ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar frota"}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </Modal>
  );
}

/** Cadastro rápido aberto pelo campo de placa do formulário de frete. */
function FrotaCadastroPopup({
  placaInicial,
  editando = null,
  frotas,
  onClose,
  onChanged,
  onCriada,
}: {
  placaInicial: string;
  editando?: FreteFrota | null;
  frotas: FreteFrota[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCriada?: (frota: FreteFrota) => void;
}) {
  const [placa, setPlaca] = useState(normalizarPlaca(placaInicial));
  const [tipo, setTipo] = useState<TipoFrota | "">("");
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const placaNormalizada = normalizarPlaca(placa);
    if (!placaValida(placaNormalizada)) {
      setErro("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
      return;
    }
    if (frotas.some((f) => f.id !== editando?.id && normalizarPlaca(f.placa) === placaNormalizada)) {
      setErro("Esta placa já está cadastrada.");
      return;
    }
    if (!tipo) {
      setErro("Selecione o tipo do veículo.");
      return;
    }

    setSaving(true);
    setErro("");
    try {
      if (editando) {
        await updateFrota(editando.id, placaNormalizada, tipo);
      } else {
        const criada = await createFrota(placaNormalizada, tipo);
        onCriada?.(criada);
      }
      await onChanged();
      onClose();
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível cadastrar a placa."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={editando ? "Editar veículo" : "Cadastrar veículo"} onClose={onClose} hideHeader className="max-w-xl">
      <form className="space-y-5" onSubmit={salvar} noValidate>
        <div className="flex items-start justify-between gap-4 border-b border-brand-border/10 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <Truck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold">{editando ? "Editar veículo" : "Cadastrar nova frota"}</h3>
              <p className="mt-1 text-sm leading-6 text-brand-border">{editando ? "Atualize a placa e o tipo do veículo." : "Adicione a placa e o tipo de veículo para usar neste frete."}</p>
            </div>
          </div>
          <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Placa" required>
            <Input className="h-10 uppercase" value={placa} maxLength={7} onChange={(e) => { setPlaca(normalizarPlaca(e.target.value)); setErro(""); }} placeholder="ABC1D23" autoFocus />
          </Field>
          <Field label="Tipo de veículo" required>
            <Select value={tipo} onChange={(e) => { setTipo(e.target.value as TipoFrota | ""); setErro(""); }}>
              <option value="">Selecione o tipo</option>
              {TIPOS_FROTA.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
        </div>
        {erro ? <p role="alert" className="text-xs font-medium text-status-error">{erro}</p> : null}
        <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar frota"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Campo de busca com lista; sem resultado oferece cadastrar o motorista. */
function MotoristaCombobox({
  motoristas,
  value,
  onChange,
  podeCadastrar,
  onCadastrar,
  onGerenciar,
}: {
  motoristas: FreteMotorista[];
  value: string;
  onChange: (id: string) => void;
  podeCadastrar: boolean;
  onCadastrar: (nome: string) => void;
  onGerenciar: () => void;
}) {
  const selecionado = motoristas.find((m) => m.id === value) ?? null;
  const [texto, setTexto] = useState(selecionado?.nome ?? "");
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  // mantém o texto em dia quando a seleção muda por fora (ex.: motorista recém-cadastrado)
  useEffect(() => {
    const nome = motoristas.find((m) => m.id === value)?.nome;
    if (nome) setTexto(nome);
  }, [value, motoristas]);

  useEffect(() => {
    if (!aberto) return;
    function fora(event: MouseEvent) {
      if (!caixa.current?.contains(event.target as Node)) {
        setAberto(false);
        setTexto(motoristas.find((m) => m.id === value)?.nome ?? "");
      }
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, motoristas, value]);

  const termo = texto.trim().toLocaleLowerCase("pt-BR");
  const filtrados = (termo && termo !== selecionado?.nome.toLocaleLowerCase("pt-BR") ? motoristas.filter((m) => m.nome.toLocaleLowerCase("pt-BR").includes(termo)) : motoristas).slice(0, 50);

  return (
    <div className="flex gap-2">
      <div ref={caixa} className="relative min-w-0 flex-1">
        <Input
          className="h-10"
          value={texto}
          placeholder="Digite para buscar o motorista"
          autoComplete="off"
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
            if (value) onChange("");
          }}
        />
        {aberto ? (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-brand-border/25 bg-white py-1 text-sm shadow-lg">
            {filtrados.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left transition hover:bg-brand-muted"
                  onClick={() => {
                    onChange(m.id);
                    setTexto(m.nome);
                    setAberto(false);
                  }}
                >
                  {m.nome}
                </button>
              </li>
            ))}
            {!filtrados.length ? (
              <li className="space-y-2 px-3 py-2">
                <p className="text-brand-border">Nenhum motorista encontrado.</p>
                {podeCadastrar ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 font-semibold text-brand-primary hover:underline"
                  onClick={() => {
                    setAberto(false);
                    onCadastrar(texto.trim());
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Cadastrar motorista{texto.trim() ? ` "${texto.trim()}"` : ""}
                </button>
                ) : null}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        title="Gerenciar motoristas"
        aria-label="Gerenciar motoristas"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-brand-border/40 text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
        onClick={onGerenciar}
      >
        <UsersRound className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Popup do cadastro de motoristas: incluir, editar e excluir. */
function MotoristasModal({
  nomeInicial,
  motoristas,
  onClose,
  onChanged,
  onCriado,
}: {
  nomeInicial: string;
  motoristas: FreteMotorista[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCriado: (motorista: FreteMotorista) => void;
}) {
  const [editando, setEditando] = useState<FreteMotorista | null>(null);
  const [nome, setNome] = useState(nomeInicial);
  const [cpf, setCpf] = useState("");
  const [busca, setBusca] = useState("");
  const [apagar, setApagar] = useState<FreteMotorista | null>(null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [historico, setHistorico] = useState<FreteMotorista | null>(null);
  const { podeAcao } = useAuth();
  const podeIncluir = podeAcao("frete_entrega_incluir", "frete_entrega");
  const podeEditar = podeAcao("frete_entrega_editar", "frete_entrega");
  const podeExcluir = podeAcao("frete_entrega_excluir", "frete_entrega");
  const podeSalvar = editando ? podeEditar : podeIncluir;

  const lista = motoristas.filter((m) => m.nome.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR")));

  function limpar() {
    setEditando(null);
    setNome("");
    setCpf("");
    setErro("");
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nome.trim()) {
      setErro("Informe o nome do motorista.");
      return;
    }
    setSaving(true);
    setErro("");
    try {
      if (editando) {
        await updateMotorista(editando.id, nome.trim(), cpf);
      } else {
        const criado = await createMotorista(nome.trim(), cpf);
        onCriado(criado);
      }
      await onChanged();
      limpar();
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível salvar o motorista."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmarExclusao(motorista: FreteMotorista) {
    setSaving(true);
    setErro("");
    try {
      await deleteMotorista(motorista.id);
      await onChanged();
      setApagar(null);
      if (editando?.id === motorista.id) limpar();
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível excluir o motorista."));
      setApagar(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Motoristas" onClose={onClose} className="max-w-xl">
      <div className="space-y-4">
        {podeIncluir || podeEditar ? (
        <form className="space-y-3 rounded-lg border border-brand-border/15 p-4" onSubmit={salvar} noValidate>
          <p className="text-sm font-bold">{editando ? "Editar motorista" : "Novo motorista"}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
            <Field label="Nome" required>
              <Input className="h-10" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </Field>
            <Field label="CPF">
              <Input className="h-10" value={cpf} inputMode="numeric" onChange={(e) => setCpf(e.target.value)} placeholder="Opcional" />
            </Field>
          </div>
          {erro ? <p className="text-xs font-medium text-status-error">{erro}</p> : null}
          <div className="flex justify-end gap-2">
            {editando || nome || cpf ? <Button variant="secondary" disabled={saving} onClick={limpar}>Limpar</Button> : null}
            <Button type="submit" disabled={saving || !podeSalvar}>{saving ? "Salvando..." : editando ? "Salvar alterações" : "Incluir"}</Button>
          </div>
        </form>
        ) : null}

        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
            <Input className="h-10 pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar motorista" />
          </div>
          <ul className="max-h-64 divide-y divide-brand-border/10 overflow-y-auto rounded-lg border border-brand-border/15">
            {lista.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.nome}</p>
                  {m.cpf ? <p className="text-xs text-brand-border">{formatCpf(m.cpf)}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Histórico"
                    aria-label={`Histórico de ${m.nome}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
                    onClick={() => setHistorico(historico?.id === m.id ? null : m)}
                  >
                    <History className="size-4" aria-hidden="true" />
                  </button>
                  {podeEditar ? (
                    <button
                      type="button"
                      title="Editar"
                      aria-label={`Editar ${m.nome}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
                      onClick={() => {
                        setEditando(m);
                        setNome(m.nome);
                        setCpf(m.cpf ?? "");
                        setErro("");
                      }}
                    >
                      <SquarePen className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                  {podeExcluir ? (
                    <button
                      type="button"
                      title="Excluir"
                      aria-label={`Excluir ${m.nome}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-status-error transition hover:bg-status-error/10"
                      onClick={() => setApagar(m)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!lista.length ? <li className="px-3 py-4 text-center text-sm text-brand-border">Nenhum motorista encontrado.</li> : null}
          </ul>
          <p className="text-xs text-brand-border">{motoristas.length} motorista{motoristas.length === 1 ? "" : "s"} cadastrado{motoristas.length === 1 ? "" : "s"}.</p>
        </div>

        {historico ? <Historico entidade="MOTORISTA" registroId={historico.id} motoristas={motoristas} /> : null}
      </div>

      {apagar ? (
        <Modal open title="Excluir motorista" onClose={() => setApagar(null)} className="max-w-md">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-brand-border">
              Excluir o motorista <strong className="text-brand-dark">{apagar.nome}</strong>? Os fretes já lançados continuam com o nome dele. A exclusão fica registrada no histórico.
            </p>
            <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
              <Button variant="secondary" disabled={saving} onClick={() => setApagar(null)}>Cancelar</Button>
              <Button variant="danger" disabled={saving} onClick={() => confirmarExclusao(apagar)}>{saving ? "Excluindo..." : "Excluir"}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}

const rotulosCampos: Record<string, string> = {
  data_registro: "Data",
  motorista_id: "Motorista",
  frota_id: "Placa",
  placa: "Placa",
  tipo: "Tipo",
  valor_frete_carga: "Frete Receita",
  valor_frete: "Valor do frete",
  valor_coleta: "Coleta",
  valor_chapa: "Chapa",
  valor_descarga: "Descarga",
  valor_adicional: "Adicional",
  observacao: "Observação",
  nome: "Nome",
  cpf: "CPF",
  deleted_at: "Exclusão",
};

const acoes: Record<FreteLogItem["acao"], { texto: string; variant: "success" | "info" | "accent" | "danger" }> = {
  INSERIU: { texto: "Inseriu", variant: "success" },
  EDITOU: { texto: "Editou", variant: "info" },
  PAGOU: { texto: "Pagamento", variant: "accent" },
  EXCLUIU: { texto: "Excluiu", variant: "danger" },
};

/** Histórico do registro: quem e quando inseriu, editou, pagou ou excluiu. */
function Historico({ entidade, registroId, motoristas }: { entidade: "FRETE" | "MOTORISTA" | "PLACA"; registroId: string; motoristas: FreteMotorista[] }) {
  const [itens, setItens] = useState<FreteLogItem[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    listLog(entidade, registroId)
      .then((r) => ativo && setItens(r))
      .catch(() => ativo && setFalhou(true));
    return () => {
      ativo = false;
    };
  }, [entidade, registroId]);

  function valor(chave: string, v: unknown) {
    if (v == null || v === "") return "vazio";
    if (chave === "motorista_id") return motoristas.find((m) => m.id === v)?.nome ?? "motorista";
    if (chave === "frota_id") return "placa";
    if (chave === "placa") return formatPlaca(String(v));
    if (chave.startsWith("valor_")) return formatBRL(Number(v));
    if (chave === "data_registro" || chave === "deleted_at") return formatDateTimeBR(String(v));
    return String(v);
  }

  function detalhe(item: FreteLogItem) {
    const d = item.detalhes ?? {};
    if (item.acao === "PAGOU") return `Nota fiscal ${String(d.nota_fiscal ?? "-")} · pago em ${formatDateTimeBR(String(d.data_pagamento ?? ""))}`;
    if (item.acao === "EDITOU")
      return Object.entries(d)
        .map(([chave, v]) => {
          const par = v as { de?: unknown; para?: unknown };
          return `${rotulosCampos[chave] ?? chave}: ${valor(chave, par?.de)} → ${valor(chave, par?.para)}`;
        })
        .join(" · ");
    return "";
  }

  return (
    <div className="space-y-2 rounded-lg border border-brand-border/15 p-4">
      <p className="text-sm font-bold">Histórico</p>
      {falhou ? <p className="text-xs text-status-error">Não foi possível carregar o histórico.</p> : null}
      {!itens && !falhou ? <p className="text-xs text-brand-border">Carregando...</p> : null}
      {itens && !itens.length ? <p className="text-xs text-brand-border">Sem registros no histórico.</p> : null}
      {itens && itens.length ? (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {itens.map((i) => (
            <li key={i.id} className="flex flex-col gap-0.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={acoes[i.acao].variant}>{acoes[i.acao].texto}</Badge>
                <span className="font-semibold">{i.usuario_nome ?? "Sistema"}</span>
                <span className="text-xs text-brand-border">{formatDateTimeBR(i.em)}</span>
              </div>
              {detalhe(i) ? <p className="pl-1 text-xs text-brand-border">{detalhe(i)}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Campo de valor em R$: aceita "1234,5" ou "1.234,50" e formata ao sair do campo. */
function ValorInput({ value, onChange }: { value: string; onChange: (valor: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-border">R$</span>
      <Input
        className="h-10 pl-9 text-right"
        inputMode="decimal"
        value={value}
        placeholder="0,00"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={() => {
          const numero = parseValor(value);
          if (numero != null) onChange(valorParaCampo(numero));
        }}
      />
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase text-brand-border">
        {label}
        {required ? <span className="text-status-error"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-status-error">{error}</p> : null}
    </div>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "flex h-10 w-full rounded-md border border-brand-border/40 bg-white px-3 py-2 text-sm shadow-sm outline-none transition",
        "focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25 disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    />
  );
}
