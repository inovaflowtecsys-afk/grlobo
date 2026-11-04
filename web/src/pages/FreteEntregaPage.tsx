import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Plus, RefreshCw, Search, SquarePen, Trash2, Truck, UsersRound, X } from "lucide-react";
import { DataGrid, type DataGridColumn } from "../components/common/DataGrid";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Modal } from "../components/ui/modal";
import { Switch } from "../components/ui/switch";
import { formatBRL, formatDateTimeBR } from "../lib/format";
import { agoraLocal, formatCpf, isoParaLocal, mensagemErro, parseValor, valorParaCampo } from "../lib/frete";
import { cn } from "../lib/utils";
import {
  createFrete,
  createMotorista,
  deleteFrete,
  deleteMotorista,
  listFretes,
  listLog,
  listMotoristas,
  updateFrete,
  updateMotorista,
} from "../services/frete";
import type { FreteFormData, FreteListItem, FreteLogItem, FreteMotorista, FretePago, FretesQuery } from "../types/frete";

const pageSizeOptions = [10, 20, 50];

const emptyForm = (): FreteFormData => ({
  data_registro: agoraLocal(),
  motorista_id: "",
  valor_frete: "",
  valor_chapa: "",
  valor_descarga: "",
  valor_adicional: "",
  observacao: "",
  pago: false,
  nota_fiscal: "",
});

export function FreteEntregaPage() {
  const [rows, setRows] = useState<FreteListItem[]>([]);
  const [motoristas, setMotoristas] = useState<FreteMotorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "ok" | "erro"; text: string } | null>(null);
  const [modal, setModal] = useState<{ record: FreteListItem | null } | null>(null);
  const [excluir, setExcluir] = useState<FreteListItem | null>(null);
  const [query, setQuery] = useState<FretesQuery>({
    page: 1,
    pageSize: 10,
    motoristaId: "",
    de: "",
    ate: "",
    notaFiscal: "",
    pago: "todos",
    sortBy: "data_registro",
    sortDirection: "desc",
  });
  const [notaInput, setNotaInput] = useState("");

  // busca por nota fiscal com debounce
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery((q) => (q.notaFiscal === notaInput ? q : { ...q, notaFiscal: notaInput, page: 1 })), 350);
    return () => window.clearTimeout(timer);
  }, [notaInput]);

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
      { key: "data_registro", header: "Data", sortable: true, render: (row) => <span className="whitespace-nowrap">{formatDateTimeBR(row.data_registro)}</span> },
      { key: "motorista", header: "Motorista", render: (row) => <span className="font-semibold">{row.motorista?.nome ?? "-"}</span> },
      { key: "valor_frete", header: "Valor do frete", sortable: true, className: "text-right", render: (row) => <span className="whitespace-nowrap font-semibold">{formatBRL(row.valor_frete)}</span> },
      { key: "chapa", header: "Chapa", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_chapa)}</span> },
      { key: "descarga", header: "Descarga", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_descarga)}</span> },
      { key: "adicional", header: "Adicional", className: "text-right", render: (row) => <span className="whitespace-nowrap">{dinheiro(row.valor_adicional)}</span> },
      {
        key: "pago",
        header: "Pagamento",
        sortable: true,
        render: (row) => (
          <div className="space-y-0.5">
            <Badge variant={row.pago ? "success" : "warning"}>{row.pago ? "Pago" : "Pendente"}</Badge>
            {row.pago && row.data_pagamento ? <p className="text-xs text-brand-border">{formatDateTimeBR(row.data_pagamento)}</p> : null}
          </div>
        ),
      },
      { key: "nota_fiscal", header: "Nota fiscal", sortable: true, render: (row) => row.nota_fiscal || "-" },
      {
        key: "actions",
        header: "Ações",
        className: "text-right",
        render: (row) => (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              title="Editar"
              aria-label={`Editar frete de ${row.motorista?.nome ?? "motorista"}`}
              className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
              onClick={() => setModal({ record: row })}
            >
              <SquarePen className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Excluir"
              aria-label={`Excluir frete de ${row.motorista?.nome ?? "motorista"}`}
              className="inline-flex size-8 items-center justify-center rounded-md text-status-error transition hover:bg-status-error/10"
              onClick={() => setExcluir(row)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5 p-4 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeader title="Frete entrega" description="Fretes pagos a motoristas, com controle de pagamento e nota fiscal." />
        <Button className="shrink-0" onClick={() => setModal({ record: null })}>
          <Plus className="size-4" aria-hidden="true" />
          Novo frete
        </Button>
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
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_150px_150px_160px_150px_100px_auto]">
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

      <DataGrid
        columns={columns}
        rows={rows}
        loading={loading}
        getRowId={(row) => row.id}
        sortBy={query.sortBy}
        sortDirection={query.sortDirection}
        onSort={handleSort}
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
          saving={saving}
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
    </div>
  );
}

function FreteFormModal({
  record,
  motoristas,
  saving,
  onClose,
  onSave,
  onMotoristasChanged,
}: {
  record: FreteListItem | null;
  motoristas: FreteMotorista[];
  saving: boolean;
  onClose: () => void;
  onSave: (valores: FreteFormData) => Promise<void>;
  onMotoristasChanged: () => Promise<void>;
}) {
  const jaPago = record?.pago === true;
  const [values, setValues] = useState<FreteFormData>(() =>
    record
      ? {
          data_registro: isoParaLocal(record.data_registro),
          motorista_id: record.motorista_id,
          valor_frete: valorParaCampo(record.valor_frete),
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
  const [dataPagamentoPrevia] = useState(() => new Date().toISOString());

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
    for (const campo of ["valor_frete", "valor_chapa", "valor_descarga", "valor_adicional"] as const) {
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
        <div className={cn("space-y-4", record && aba === "historico" && "hidden")}>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <Field label="Data" required error={errors.data_registro}>
              <Input className="h-10" type="datetime-local" value={values.data_registro} onChange={(e) => change("data_registro", e.target.value)} />
            </Field>
            <Field label="Motorista" required error={errors.motorista_id}>
              <MotoristaCombobox
                motoristas={motoristas}
                value={values.motorista_id}
                onChange={(id) => change("motorista_id", id)}
                onCadastrar={(nome) => setMotoristasOpen({ nome })}
                onGerenciar={() => setMotoristasOpen({ nome: "" })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Valor do frete" required error={errors.valor_frete}>
              <ValorInput value={values.valor_frete} onChange={(v) => change("valor_frete", v)} />
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

        </div>

        <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
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
    </Modal>
  );
}

/** Campo de busca com lista; sem resultado oferece cadastrar o motorista. */
function MotoristaCombobox({
  motoristas,
  value,
  onChange,
  onCadastrar,
  onGerenciar,
}: {
  motoristas: FreteMotorista[];
  value: string;
  onChange: (id: string) => void;
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
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : editando ? "Salvar alterações" : "Incluir"}</Button>
          </div>
        </form>

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
                  <button
                    type="button"
                    title="Excluir"
                    aria-label={`Excluir ${m.nome}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-status-error transition hover:bg-status-error/10"
                    onClick={() => setApagar(m)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
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
  valor_frete: "Valor do frete",
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
function Historico({ entidade, registroId, motoristas }: { entidade: "FRETE" | "MOTORISTA"; registroId: string; motoristas: FreteMotorista[] }) {
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
