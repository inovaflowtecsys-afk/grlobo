import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, KeyRound, Plus, RefreshCw, Search, SquarePen, Trash2, UserRound, X } from "lucide-react";
import { DataGrid, type DataGridColumn } from "../components/common/DataGrid";
import { PageHeader } from "../components/common/PageHeader";
import { Avatar } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Modal } from "../components/ui/modal";
import { Switch } from "../components/ui/switch";
import { MODULOS, normalizarModulos, todosLiberados } from "../lib/modulos";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";
import { joinUnique } from "../lib/format";
import {
  createProfissional,
  listCargos,
  listFiliais,
  listProfissionais,
  listSetores,
  resetProfissionalSenha,
  updateProfissional,
} from "../services/profissionais";
import type { Filial, ProfissionalFormData, ProfissionalListItem, ProfissionaisQuery, ProfissionalStatus, Referencia, TipoUsuario } from "../types/profissional";

const pageSizeOptions = [10, 20, 50];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyForm: ProfissionalFormData = {
  nome: "",
  email: "",
  avatar_url: "",
  setor_id: "",
  cargo_id: "",
  filial_id: "",
  tipo_usuario: "USUARIO",
  modulos_acesso: todosLiberados(),
  ativo: true,
};

export function ProfissionaisPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ProfissionalListItem[]>([]);
  const [setores, setSetores] = useState<Referencia[]>([]);
  const [cargos, setCargos] = useState<Referencia[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "erro"; text: string } | null>(null);
  const [modal, setModal] = useState<{ record: ProfissionalListItem | null } | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<ProfissionaisQuery>({
    page: 1,
    pageSize: 10,
    search: "",
    filialId: "",
    status: "ativo",
    sortBy: "nome",
    sortDirection: "asc",
  });
  const [searchInput, setSearchInput] = useState("");

  // busca com debounce para não consultar a cada tecla
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery((q) => (q.search === searchInput ? q : { ...q, search: searchInput, page: 1 })), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    Promise.all([listSetores(), listCargos(), listFiliais()])
      .then(([s, c, f]) => {
        setSetores(s);
        setCargos(c);
        setFiliais(f);
      })
      .catch((e) => showFeedback("erro", errorMessage(e, "Não foi possível carregar setores, cargos e filiais.")));
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProfissionais(query);
      setRows(result.data);
      setTotal(result.count);
    } catch (e) {
      showFeedback("erro", errorMessage(e, "Não foi possível carregar os profissionais."));
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

  function updateQuery(partial: Partial<ProfissionaisQuery>) {
    setQuery((current) => ({ ...current, ...partial, page: partial.page ?? 1 }));
  }

  function handleSort(key: string) {
    setQuery((current) => ({
      ...current,
      page: 1,
      sortBy: key as ProfissionaisQuery["sortBy"],
      sortDirection: current.sortBy === key && current.sortDirection === "asc" ? "desc" : "asc",
    }));
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  const columns = useMemo<DataGridColumn<ProfissionalListItem>[]>(
    () => [
      {
        key: "nome",
        header: "Nome",
        sortable: true,
        render: (row) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.nome} imageUrl={row.avatar_url} className="size-8" />
            <span className="font-semibold">{row.nome}</span>
          </div>
        ),
      },
      { key: "email", header: "E-mail", sortable: true, render: (row) => row.email },
      { key: "filial", header: "Filial", render: (row) => formatFilial(row.filial) },
      {
        key: "setor_cargo",
        header: "Setor / Cargo",
        render: (row) => (
          <div className="space-y-0.5">
            <p className="font-semibold">{row.setor_ref?.nome || "-"}</p>
            <p className="text-xs text-brand-border">{row.cargo_ref?.nome || "-"}</p>
          </div>
        ),
      },
      { key: "tipo_usuario", header: "Tipo de usuário", sortable: true, render: (row) => (row.tipo_usuario === "ADMINISTRADOR" ? "Administrador" : "Usuário") },
      {
        key: "ativo",
        header: "Status",
        sortable: true,
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant={row.ativo ? "success" : "warning"}>{row.ativo ? "Ativo" : "Inativo"}</Badge>
          </div>
        ),
      },
      {
        key: "actions",
        header: "Ações",
        className: "text-right",
        render: (row) => (
          <button
            type="button"
            title="Editar"
            aria-label={`Editar ${row.nome}`}
            className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
            onClick={() => setModal({ record: row })}
          >
            <SquarePen className="size-4" aria-hidden="true" />
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5 p-4 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeader title="Profissionais" description="Cadastro e gestão dos usuários com acesso ao sistema." />
        <Button className="shrink-0" onClick={() => setModal({ record: null })}>
          <Plus className="size-4" aria-hidden="true" />
          Novo profissional
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
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_220px_160px_110px_auto]">
          <Field label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
              <Input className="h-10 pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Nome ou e-mail" />
            </div>
          </Field>
          <Field label="Filial">
            <Select value={query.filialId} onChange={(e) => updateQuery({ filialId: e.target.value })}>
              <option value="">Todas</option>
              {filiais.map((f) => (
                <option key={f.id} value={f.id}>{formatFilial(f)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={query.status} onChange={(e) => updateQuery({ status: e.target.value as ProfissionalStatus })}>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="todos">Todos</option>
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
        emptyTitle="Nenhum profissional encontrado."
        emptyDescription="Ajuste os filtros ou cadastre um novo profissional."
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
        <ProfissionalFormModal
          // remonta o formulário ao trocar de registro
          key={modal.record?.id ?? "novo"}
          record={modal.record}
          isSelf={modal.record?.id === user?.id}
          setores={setores}
          cargos={cargos}
          filiais={filiais}
          saving={saving}
          onClose={() => setModal(null)}
          onResetPassword={async (record) => {
            setSaving(true);
            try {
              await resetProfissionalSenha(record.id);
              setModal(null);
              await loadRows();
              showFeedback("ok", `Código de verificação enviado para ${record.email}. A senha atual foi invalidada até ele definir uma nova.`);
            } catch (e) {
              showFeedback("erro", errorMessage(e, "Não foi possível redefinir a senha."));
            } finally {
              setSaving(false);
            }
          }}
          onSave={async (payload) => {
            setSaving(true);
            try {
              if (modal.record) {
                await updateProfissional(modal.record.id, payload);
                showFeedback("ok", "Profissional atualizado com sucesso.");
              } else {
                await createProfissional(payload);
                showFeedback("ok", `Profissional cadastrado. Enviamos um código de verificação para ${payload.email}.`);
              }
              setModal(null);
              await loadRows();
            } catch (e) {
              showFeedback("erro", errorMessage(e, "Não foi possível salvar o profissional."));
              setModal(null);
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ProfissionalFormModal({
  record,
  isSelf,
  setores,
  cargos,
  filiais,
  saving,
  onClose,
  onResetPassword,
  onSave,
}: {
  record: ProfissionalListItem | null;
  isSelf: boolean;
  setores: Referencia[];
  cargos: Referencia[];
  filiais: Filial[];
  saving: boolean;
  onClose: () => void;
  onResetPassword: (record: ProfissionalListItem) => Promise<void>;
  onSave: (payload: ProfissionalFormData) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [values, setValues] = useState<ProfissionalFormData>(() =>
    record
      ? {
          nome: record.nome,
          email: record.email,
          avatar_url: record.avatar_url || "",
          setor_id: record.setor_id || "",
          cargo_id: record.cargo_id || "",
          filial_id: record.filial_id || "",
          tipo_usuario: record.tipo_usuario,
          modulos_acesso: normalizarModulos(record.modulos_acesso),
          ativo: record.ativo,
        }
      : emptyForm,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function change(field: keyof ProfissionalFormData, value: string | boolean) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.nome.trim()) next.nome = "Informe o nome completo.";
    if (!EMAIL_RE.test(values.email.trim())) next.email = "Informe um e-mail válido.";
    setErrors(next);
    if (Object.keys(next).length) return;

    await onSave({ ...values, nome: values.nome.trim(), email: values.email.trim().toLowerCase() });
  }

  return (
    <Modal open title={record ? "Editar profissional" : "Cadastrar profissional"} onClose={onClose} hideHeader>
      <form className="space-y-5" onSubmit={submit} noValidate>
        <div className="flex items-start justify-between gap-4 border-b border-brand-border/10 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <UserRound className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold">
                {record ? "Editar profissional" : "Cadastrar profissional"}
                {record?.codigo != null ? <span className="ml-2 text-sm font-semibold text-brand-border">#{record.codigo}</span> : null}
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-border">Dados de acesso, vínculo com filial, setor, cargo e permissões.</p>
            </div>
          </div>
          <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <Avatar name={values.nome} imageUrl={values.avatar_url} className="size-14" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  change("avatar_url", await imageToDataUrl(file));
                } catch {
                  setErrors((current) => ({ ...current, avatar_url: "Não foi possível ler a imagem." }));
                }
              }}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Camera className="size-4" aria-hidden="true" />
              {values.avatar_url ? "Trocar foto" : "Adicionar foto"}
            </Button>
            {values.avatar_url ? (
              <button type="button" title="Remover foto" aria-label="Remover foto" className="inline-flex size-9 items-center justify-center rounded-md text-status-error transition hover:bg-status-error/10" onClick={() => change("avatar_url", "")}>
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            {errors.avatar_url ? <p className="w-full text-xs font-medium text-status-error">{errors.avatar_url}</p> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome completo" required error={errors.nome}>
              <Input className="h-10" value={values.nome} onChange={(e) => change("nome", e.target.value)} />
            </Field>
            <Field label="E-mail" required error={errors.email}>
              <Input className="h-10" type="email" value={values.email} onChange={(e) => change("email", e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Filial">
              <Select value={values.filial_id} onChange={(e) => change("filial_id", e.target.value)}>
                <option value="">Não vinculada</option>
                {filiais.map((f) => (
                  <option key={f.id} value={f.id}>{formatFilial(f)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Setor">
              <Select value={values.setor_id} onChange={(e) => change("setor_id", e.target.value)}>
                <option value="">Selecione</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Cargo">
              <Select value={values.cargo_id} onChange={(e) => change("cargo_id", e.target.value)}>
                <option value="">Selecione</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de usuário">
              <Select value={values.tipo_usuario} onChange={(e) => change("tipo_usuario", e.target.value as TipoUsuario)}>
                <option value="ADMINISTRADOR">Administrador</option>
                <option value="USUARIO">Usuário</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-brand-border/15 p-4">
            <div>
              <p className="text-sm font-bold">Acesso aos módulos</p>
              <p className="text-xs text-brand-border">
                {values.tipo_usuario === "ADMINISTRADOR"
                  ? "Administrador tem acesso a todos os módulos."
                  : "Ligue os módulos que este usuário pode abrir no menu. Desligado = acesso negado."}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULOS.map((m) => {
                const admin = values.tipo_usuario === "ADMINISTRADOR";
                const dashboard = m.chave === "dashboard";
                const liberado = admin || dashboard || values.modulos_acesso[m.chave] === true;
                return (
                  <div key={m.chave} className="flex items-center justify-between gap-3 rounded-md bg-brand-surface px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <m.icone className="size-4 shrink-0 text-brand-primary" aria-hidden="true" />
                      <span className="truncate">{m.rotulo}</span>
                    </span>
                    <Switch
                      checked={liberado}
                      disabled={admin || dashboard}
                      label={`Acesso ao módulo ${m.rotulo}`}
                      onChange={(valor) => setValues((atual) => ({ ...atual, modulos_acesso: { ...atual.modulos_acesso, [m.chave]: valor } }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {!record ? (
            <p className="rounded-md border border-brand-accent/30 bg-brand-accent/10 px-3 py-2 text-sm text-brand-primary">
              Ao salvar, enviaremos um código de verificação para o e-mail informado. Com ele o profissional define a própria senha na tela de login ("Esqueci a senha").
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={values.ativo}
              aria-label="Ativo"
              disabled={isSelf}
              className={cn(
                "inline-flex h-6 w-10 items-center rounded-full border px-0.5 transition disabled:opacity-50",
                values.ativo ? "border-brand-primary/35 bg-brand-primary/25" : "border-brand-border/20 bg-brand-muted",
              )}
              onClick={() => change("ativo", !values.ativo)}
            >
              <span className={cn("size-4 rounded-full shadow-sm transition", values.ativo ? "translate-x-4 bg-brand-primary" : "translate-x-0 bg-brand-border")} />
            </button>
            <span className="text-sm font-semibold">{values.ativo ? "Ativo" : "Inativo"}</span>
            {isSelf ? <span className="text-xs text-brand-border">Você não pode desativar o próprio usuário.</span> : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-brand-border/10 pt-4 md:flex-row md:items-center md:justify-between">
          <div>
            {record ? (
              <Button variant="secondary" disabled={saving} onClick={() => setResetOpen(true)}>
                <KeyRound className="size-4" aria-hidden="true" />
                Resetar senha
              </Button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      </form>

      {record && resetOpen ? (
        <Modal open title="Resetar senha" onClose={() => setResetOpen(false)} className="max-w-md">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-brand-border">
              Enviar um código de verificação para <strong className="text-brand-dark">{record.email}</strong>? A senha atual de {record.nome} deixa de valer e só volta a ter acesso depois de definir uma nova senha com o código.
            </p>
            <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
              <Button variant="secondary" disabled={saving} onClick={() => setResetOpen(false)}>Cancelar</Button>
              <Button disabled={saving} onClick={() => onResetPassword(record)}>{saving ? "Enviando..." : "Enviar código"}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Modal>
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

function formatFilial(filial?: { nome: string; sigla: string | null; localidade: string | null } | null) {
  if (!filial) return "-";
  return joinUnique([filial.sigla, filial.nome, filial.localidade]) || "-";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Reduz a foto para 256px (JPEG) antes de gravar em avatar_url, para não inflar a tabela.
function imageToDataUrl(file: File, size = 256) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem inválida"));
    };
    img.src = url;
  });
}
