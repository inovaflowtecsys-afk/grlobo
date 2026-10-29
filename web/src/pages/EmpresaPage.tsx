import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, Building, Building2, CheckCircle2, Layers3, MapPinned, Plus, RefreshCw, SquarePen, Trash2, UserRound, X } from "lucide-react";
import { LoadingScreen } from "../components/common/LoadingScreen";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Modal } from "../components/ui/modal";
import { useAuth } from "../hooks/useAuth";
import { formatCep, formatCnpj, formatPhone, isValidCnpj, isValidEmail, isValidPhone, onlyDigits } from "../lib/empresaValidation";
import { cn } from "../lib/utils";
import { getEmpresaSistema, listEmpresaChildren, saveEmpresa, saveEmpresaChild, softDeleteEmpresaChild } from "../services/empresas";
import type { Empresa, EmpresaCargo, EmpresaChild, EmpresaChildKind, EmpresaFilial, EmpresaFormData, EmpresaSetor } from "../types/empresa";

const emptyEmpresa: EmpresaFormData = {
  cnpj: "",
  razao_social: "",
  nome_fantasia: "",
  inscricao_estadual: "",
  inscricao_municipal: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  responsavel_nome: "",
  responsavel_telefone: "",
  responsavel_email: "",
};

const childLabels: Record<EmpresaChildKind, { singular: string; icon: React.ElementType; hint: string }> = {
  setores: { singular: "Setor", icon: Layers3, hint: "Cadastre ou atualize os setores internos usados nos vínculos do sistema." },
  cargos: { singular: "Cargo", icon: BriefcaseBusiness, hint: "Cadastre ou atualize os cargos disponíveis para os profissionais." },
  filiais: { singular: "Filial", icon: Building, hint: "Informe os dados da filial para vincular a unidade ao cadastro da empresa." },
};

type ChildModalState = { kind: EmpresaChildKind; record: EmpresaChild | null } | null;
type DeleteState = { kind: EmpresaChildKind; record: EmpresaChild } | null;

export function EmpresaPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [form, setForm] = useState<EmpresaFormData>(emptyEmpresa);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "erro"; text: string } | null>(null);
  const [setores, setSetores] = useState<EmpresaSetor[]>([]);
  const [cargos, setCargos] = useState<EmpresaCargo[]>([]);
  const [filiais, setFiliais] = useState<EmpresaFilial[]>([]);
  const [childModal, setChildModal] = useState<ChildModalState>(null);
  const [deleting, setDeleting] = useState<DeleteState>(null);

  function showFeedback(type: "ok" | "erro", text: string) {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), type === "ok" ? 3500 : 7000);
  }

  const loadChildren = useCallback(async (id: string) => {
    const [s, c, f] = await Promise.all([listEmpresaChildren("setores", id), listEmpresaChildren("cargos", id), listEmpresaChildren("filiais", id)]);
    setSetores(s);
    setCargos(c);
    setFiliais(f);
  }, []);

  const loadEmpresa = useCallback(async () => {
    setLoading(true);
    try {
      const empresa = await getEmpresaSistema();
      if (empresa) {
        setEmpresaId(empresa.id);
        setForm(toFormData(empresa));
        await loadChildren(empresa.id);
      } else {
        setEmpresaId(null);
        setForm(emptyEmpresa);
        setSetores([]);
        setCargos([]);
        setFiliais([]);
      }
    } catch (e) {
      showFeedback("erro", errorMessage(e, "Não foi possível carregar a empresa."));
    } finally {
      setLoading(false);
    }
  }, [loadChildren]);

  useEffect(() => {
    loadEmpresa();
  }, [loadEmpresa]);

  function change(field: keyof EmpresaFormData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const next = validateEmpresa(form);
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const saved = await saveEmpresa(form, user.id, empresaId ?? undefined);
      setEmpresaId(saved.id);
      setForm(toFormData(saved));
      await loadChildren(saved.id);
      showFeedback("ok", "Dados da empresa salvos.");
    } catch (e) {
      showFeedback("erro", errorMessage(e, "Não foi possível salvar a empresa."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCepBlur() {
    const cep = onlyDigits(form.cep);
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (data.erro) {
        setErrors((current) => ({ ...current, cep: "CEP não encontrado." }));
        return;
      }
      setForm((current) => ({
        ...current,
        logradouro: data.logradouro || current.logradouro,
        bairro: data.bairro || current.bairro,
        cidade: data.localidade || current.cidade,
        uf: data.uf || current.uf,
      }));
    } catch {
      // consulta de CEP é só uma conveniência; o usuário pode preencher à mão
    }
  }

  async function confirmDelete() {
    if (!deleting || !user || !empresaId) return;
    try {
      await softDeleteEmpresaChild(deleting.kind, deleting.record.id, user.id);
      await loadChildren(empresaId);
      showFeedback("ok", `${childLabels[deleting.kind].singular} excluído.`);
    } catch (e) {
      showFeedback("erro", errorMessage(e, "Não foi possível excluir o registro."));
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4 md:p-7">
      <div className="flex flex-col gap-5 rounded-lg border border-brand-border/10 bg-white px-6 py-5 shadow-[0_12px_40px_rgba(10,17,25,0.06)] md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <IconBox icon={Building2} />
          <div>
            <h2 className="text-lg font-bold">Empresa</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-border">Dados fiscais, endereço, responsável, setores, cargos e filiais do Grupo Lobo.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={loadEmpresa}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Atualizar
          </Button>
          <Button type="submit" form="empresa-form" disabled={saving}>
            {saving ? "Salvando..." : "Salvar empresa"}
          </Button>
        </div>
      </div>

      {feedback ? (
        <div
          role={feedback.type === "erro" ? "alert" : "status"}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold",
            feedback.type === "ok" ? "border-status-success/20 bg-status-success/10 text-status-success" : "border-status-error/25 bg-status-error/10 text-status-error",
          )}
        >
          {feedback.type === "ok" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
          {feedback.text}
        </div>
      ) : null}

      <form id="empresa-form" className="space-y-7" onSubmit={handleSubmit} noValidate>
        <SectionCard title="Dados da empresa" description="Identificação fiscal e comercial." icon={Building2}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Field label="CNPJ" required error={errors.cnpj} className="xl:col-span-3">
              <Input className="h-10" inputMode="numeric" value={formatCnpj(form.cnpj)} onChange={(e) => change("cnpj", formatCnpj(e.target.value))} />
            </Field>
            <Field label="Razão social" required error={errors.razao_social} className="xl:col-span-5">
              <Input className="h-10" value={form.razao_social} onChange={(e) => change("razao_social", e.target.value)} />
            </Field>
            <Field label="Nome fantasia" required error={errors.nome_fantasia} className="xl:col-span-4">
              <Input className="h-10" value={form.nome_fantasia} onChange={(e) => change("nome_fantasia", e.target.value)} />
            </Field>
            <Field label="Inscrição estadual (IE)" className="xl:col-span-3">
              <Input className="h-10" value={form.inscricao_estadual} onChange={(e) => change("inscricao_estadual", e.target.value)} />
            </Field>
            <Field label="Inscrição municipal (IM)" className="xl:col-span-3">
              <Input className="h-10" value={form.inscricao_municipal} onChange={(e) => change("inscricao_municipal", e.target.value)} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Endereço" description="Preenchimento automático pelo CEP." icon={MapPinned}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Field label="CEP" error={errors.cep} className="xl:col-span-2">
              <Input className="h-10" inputMode="numeric" value={formatCep(form.cep)} onChange={(e) => change("cep", formatCep(e.target.value))} onBlur={handleCepBlur} />
            </Field>
            <Field label="Logradouro" className="xl:col-span-5">
              <Input className="h-10" value={form.logradouro} onChange={(e) => change("logradouro", e.target.value)} />
            </Field>
            <Field label="Número" className="xl:col-span-2">
              <Input className="h-10" value={form.numero} onChange={(e) => change("numero", e.target.value)} />
            </Field>
            <Field label="Complemento" className="xl:col-span-3">
              <Input className="h-10" value={form.complemento} onChange={(e) => change("complemento", e.target.value)} />
            </Field>
            <Field label="Bairro" className="xl:col-span-4">
              <Input className="h-10" value={form.bairro} onChange={(e) => change("bairro", e.target.value)} />
            </Field>
            <Field label="Cidade" className="xl:col-span-5">
              <Input className="h-10" value={form.cidade} onChange={(e) => change("cidade", e.target.value)} />
            </Field>
            <Field label="UF" className="xl:col-span-1">
              <Input className="h-10" maxLength={2} value={form.uf} onChange={(e) => change("uf", e.target.value.toUpperCase())} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Responsável" description="Contato principal para assuntos administrativos e operacionais." icon={UserRound}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Field label="Nome do responsável" className="xl:col-span-5">
              <Input className="h-10" value={form.responsavel_nome} onChange={(e) => change("responsavel_nome", e.target.value)} />
            </Field>
            <Field label="Telefone" error={errors.responsavel_telefone} className="xl:col-span-3">
              <Input className="h-10" inputMode="tel" value={formatPhone(form.responsavel_telefone)} onChange={(e) => change("responsavel_telefone", formatPhone(e.target.value))} />
            </Field>
            <Field label="E-mail" error={errors.responsavel_email} className="xl:col-span-4">
              <Input className="h-10" type="email" value={form.responsavel_email} onChange={(e) => change("responsavel_email", e.target.value)} />
            </Field>
          </div>
        </SectionCard>
      </form>

      <ChildCard kind="setores" title="Setores" description="Áreas internas vinculadas à empresa." actionLabel="Novo setor" disabled={!empresaId} rows={setores} onOpen={setChildModal} onDelete={(kind, record) => setDeleting({ kind, record })} />
      <ChildCard kind="cargos" title="Cargos" description="Funções organizacionais disponíveis para os profissionais." actionLabel="Novo cargo" disabled={!empresaId} rows={cargos} onOpen={setChildModal} onDelete={(kind, record) => setDeleting({ kind, record })} />
      <ChildCard kind="filiais" title="Filiais" description="Unidades e localidades associadas à empresa." actionLabel="Nova filial" disabled={!empresaId} rows={filiais} onOpen={setChildModal} onDelete={(kind, record) => setDeleting({ kind, record })} />

      {childModal ? (
        <ChildModal
          // remonta o formulário ao abrir outro registro
          key={`${childModal.kind}-${childModal.record?.id ?? "novo"}`}
          state={childModal}
          onClose={() => setChildModal(null)}
          onSave={async (payload) => {
            if (!user || !empresaId) return;
            await saveEmpresaChild(childModal.kind, empresaId, payload, user.id, childModal.record?.id);
            await loadChildren(empresaId);
            setChildModal(null);
            showFeedback("ok", `${childLabels[childModal.kind].singular} salvo.`);
          }}
        />
      ) : null}

      <Modal open={Boolean(deleting)} title={`Excluir ${deleting ? childLabels[deleting.kind].singular.toLowerCase() : ""}`} onClose={() => setDeleting(null)} className="max-w-md">
        <div className="space-y-5">
          <p className="text-sm leading-6 text-brand-border">
            Deseja excluir <strong className="text-brand-dark">{deleting?.record.nome}</strong>? O registro será ocultado das listas e mantido no histórico. Profissionais já vinculados continuam com o vínculo registrado.
          </p>
          <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Excluir</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function IconBox({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
      <Icon className="size-5" aria-hidden="true" />
    </div>
  );
}

function SectionCard({ title, description, icon, children, className }: { title: string; description: string; icon: React.ElementType; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="px-6 py-5">
        <div className="flex items-start gap-3">
          <IconBox icon={icon} />
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-sm leading-5 text-brand-border">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

function Field({ label, required, error, children, className }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-semibold uppercase text-brand-border">
        {label}
        {required ? <span className="text-status-error"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-status-error">{error}</p> : null}
    </div>
  );
}

function ChildCard({
  kind,
  title,
  description,
  actionLabel,
  disabled,
  rows,
  onOpen,
  onDelete,
}: {
  kind: EmpresaChildKind;
  title: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  rows: EmpresaChild[];
  onOpen: (state: ChildModalState) => void;
  onDelete: (kind: EmpresaChildKind, record: EmpresaChild) => void;
}) {
  const isFilial = kind === "filiais";
  const Icon = childLabels[kind].icon;

  return (
    <SectionCard title={`${title} (${rows.length})`} description={disabled ? "Salve a empresa para habilitar este cartão." : description} icon={Icon} className={disabled ? "opacity-60" : ""}>
      <div className="mb-4 flex justify-end">
        <Button className="h-9 px-3" disabled={disabled} onClick={() => onOpen({ kind, record: null })}>
          <Plus className="size-4" aria-hidden="true" />
          {actionLabel}
        </Button>
      </div>

      {rows.length ? (
        <div className="overflow-hidden rounded-lg border border-brand-border/10 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-muted/60 text-[11px] uppercase text-brand-border">
                <tr>
                  {isFilial ? <th className="px-4 py-2.5 font-bold">Nº</th> : null}
                  {isFilial ? <th className="px-4 py-2.5 font-bold">Sigla</th> : null}
                  <th className="px-4 py-2.5 font-bold">Nome</th>
                  {isFilial ? <th className="px-4 py-2.5 font-bold">Localidade</th> : null}
                  {isFilial ? <th className="px-4 py-2.5 font-bold">Responsável</th> : null}
                  {isFilial ? <th className="px-4 py-2.5 font-bold">Telefone</th> : null}
                  {isFilial ? <th className="px-4 py-2.5 font-bold">E-mail</th> : null}
                  <th className="px-4 py-2.5 text-right font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/10">
                {rows.map((row) => {
                  const filial = row as EmpresaFilial;
                  return (
                    <tr key={row.id} className="transition hover:bg-brand-surface">
                      {isFilial ? <td className="px-4 py-2.5 tabular-nums text-brand-border">{filial.numero_filial || "-"}</td> : null}
                      {isFilial ? <td className="px-4 py-2.5">{filial.sigla || "-"}</td> : null}
                      <td className="px-4 py-2.5 font-semibold">{row.nome}</td>
                      {isFilial ? <td className="px-4 py-2.5">{filial.localidade || "-"}</td> : null}
                      {isFilial ? <td className="px-4 py-2.5">{filial.responsavel_nome || "-"}</td> : null}
                      {isFilial ? <td className="px-4 py-2.5">{filial.responsavel_telefone ? formatPhone(filial.responsavel_telefone) : "-"}</td> : null}
                      {isFilial ? <td className="px-4 py-2.5">{filial.responsavel_email || "-"}</td> : null}
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <IconButton title={`Editar ${row.nome}`} onClick={() => onOpen({ kind, record: row })}>
                            <SquarePen className="size-4" aria-hidden="true" />
                          </IconButton>
                          <IconButton title={`Excluir ${row.nome}`} destructive onClick={() => onDelete(kind, row)}>
                            <Trash2 className="size-4" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-brand-border/25 bg-brand-muted/30 p-8 text-center">
          <p className="text-sm font-semibold">Nenhum registro cadastrado.</p>
          <p className="mt-1 text-sm text-brand-border">Adicione o primeiro item para completar a estrutura da empresa.</p>
        </div>
      )}
    </SectionCard>
  );
}

function IconButton({ title, destructive, children, onClick }: { title: string; destructive?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md transition hover:bg-brand-muted",
        destructive ? "text-status-error hover:bg-status-error/10" : "text-brand-border hover:text-brand-dark",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ChildModal({ state, onClose, onSave }: { state: NonNullable<ChildModalState>; onClose: () => void; onSave: (payload: Record<string, string>) => Promise<void> }) {
  const { kind, record } = state;
  const isFilial = kind === "filiais";
  const { singular, icon: Icon, hint } = childLabels[kind];
  const filial = record as EmpresaFilial | null;
  const [values, setValues] = useState<Record<string, string>>({
    nome: record?.nome ?? "",
    sigla: filial?.sigla ?? "",
    localidade: filial?.localidade ?? "",
    responsavel_nome: filial?.responsavel_nome ?? "",
    responsavel_telefone: filial?.responsavel_telefone ?? "",
    responsavel_email: filial?.responsavel_email ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function change(field: string, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.nome.trim()) next.nome = `Informe o nome do ${singular.toLowerCase()}.`;
    if (isFilial && !isValidEmail(values.responsavel_email)) next.responsavel_email = "Informe um e-mail válido.";
    if (isFilial && !isValidPhone(values.responsavel_telefone)) next.responsavel_telefone = "Informe um telefone válido.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setSaveError("");
    try {
      await onSave(values);
    } catch (e) {
      setSaveError(errorMessage(e, "Não foi possível salvar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`${record ? "Editar" : "Novo"} ${singular.toLowerCase()}`} onClose={onClose} hideHeader>
      <form className="space-y-5" onSubmit={submit} noValidate>
        <div className="flex items-start justify-between gap-4 border-b border-brand-border/10 pb-4">
          <div className="flex items-start gap-4">
            <IconBox icon={Icon} />
            <div>
              <h3 className="text-base font-bold">{record ? "Editar" : "Cadastrar"} {singular.toLowerCase()}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-border">{hint}</p>
            </div>
          </div>
          <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {isFilial ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Field label="Sigla" className="xl:col-span-2">
              <Input className="h-10" maxLength={6} value={values.sigla} onChange={(e) => change("sigla", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Nome da filial" required error={errors.nome} className="xl:col-span-5">
              <Input className="h-10" value={values.nome} onChange={(e) => change("nome", e.target.value)} />
            </Field>
            <Field label="Localidade" className="xl:col-span-5">
              <Input className="h-10" value={values.localidade} onChange={(e) => change("localidade", e.target.value)} />
            </Field>
            <Field label="Nome do responsável" className="xl:col-span-12">
              <Input className="h-10" value={values.responsavel_nome} onChange={(e) => change("responsavel_nome", e.target.value)} />
            </Field>
            <Field label="Telefone" error={errors.responsavel_telefone} className="xl:col-span-4">
              <Input className="h-10" inputMode="tel" value={formatPhone(values.responsavel_telefone)} onChange={(e) => change("responsavel_telefone", formatPhone(e.target.value))} />
            </Field>
            <Field label="E-mail" error={errors.responsavel_email} className="xl:col-span-8">
              <Input className="h-10" type="email" value={values.responsavel_email} onChange={(e) => change("responsavel_email", e.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label={`Nome do ${singular.toLowerCase()}`} required error={errors.nome}>
            <Input className="h-10" value={values.nome} onChange={(e) => change("nome", e.target.value)} />
          </Field>
        )}

        {saveError ? <div role="alert" className="rounded-md border border-status-error/25 bg-status-error/10 px-3 py-2 text-sm text-status-error">{saveError}</div> : null}

        <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function validateEmpresa(form: EmpresaFormData) {
  const errors: Record<string, string> = {};
  if (!isValidCnpj(form.cnpj)) errors.cnpj = "Informe um CNPJ válido.";
  if (!form.razao_social.trim()) errors.razao_social = "Informe a razão social.";
  if (!form.nome_fantasia.trim()) errors.nome_fantasia = "Informe o nome fantasia.";
  if (form.cep && onlyDigits(form.cep).length !== 8) errors.cep = "O CEP deve ter 8 dígitos.";
  if (!isValidEmail(form.responsavel_email)) errors.responsavel_email = "Informe um e-mail válido.";
  if (!isValidPhone(form.responsavel_telefone)) errors.responsavel_telefone = "Informe um telefone válido.";
  return errors;
}

function toFormData(e: Empresa): EmpresaFormData {
  return {
    cnpj: e.cnpj ?? "",
    razao_social: e.razao_social ?? "",
    nome_fantasia: e.nome_fantasia ?? "",
    inscricao_estadual: e.inscricao_estadual ?? "",
    inscricao_municipal: e.inscricao_municipal ?? "",
    cep: e.cep ?? "",
    logradouro: e.logradouro ?? "",
    numero: e.numero ?? "",
    complemento: e.complemento ?? "",
    bairro: e.bairro ?? "",
    cidade: e.cidade ?? "",
    uf: e.uf ?? "",
    responsavel_nome: e.responsavel_nome ?? "",
    responsavel_telefone: e.responsavel_telefone ?? "",
    responsavel_email: e.responsavel_email ?? "",
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
