import { supabase } from "../lib/supabase";
import { onlyDigits } from "../lib/empresaValidation";
import type { Empresa, EmpresaCargo, EmpresaChild, EmpresaChildKind, EmpresaFilial, EmpresaFormData, EmpresaSetor } from "../types/empresa";

const childTables = {
  setores: "empresa_setores",
  cargos: "empresa_cargos",
  filiais: "empresa_filiais",
} as const;

const EMPRESA_COLUMNS =
  "id,cnpj,razao_social,nome_fantasia,inscricao_estadual,inscricao_municipal,cep,logradouro,numero,complemento,bairro,cidade,uf,responsavel_nome,responsavel_telefone,responsavel_email";

export async function getEmpresaSistema() {
  const { data, error } = await supabase
    .from("empresas")
    .select(EMPRESA_COLUMNS)
    .eq("cadastro_unico", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Empresa | null;
}

// Campos opcionais em branco viram null; CNPJ e CEP são gravados só com dígitos.
function toPayload(form: EmpresaFormData) {
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  return {
    cnpj: onlyDigits(form.cnpj ?? "") || null,
    razao_social: form.razao_social.trim(),
    nome_fantasia: form.nome_fantasia.trim(),
    inscricao_estadual: blank(form.inscricao_estadual ?? ""),
    inscricao_municipal: blank(form.inscricao_municipal ?? ""),
    cep: onlyDigits(form.cep ?? "") || null,
    logradouro: blank(form.logradouro ?? ""),
    numero: blank(form.numero ?? ""),
    complemento: blank(form.complemento ?? ""),
    bairro: blank(form.bairro ?? ""),
    cidade: blank(form.cidade ?? ""),
    uf: blank((form.uf ?? "").toUpperCase()),
    responsavel_nome: blank(form.responsavel_nome ?? ""),
    responsavel_telefone: onlyDigits(form.responsavel_telefone ?? "") || null,
    responsavel_email: blank((form.responsavel_email ?? "").toLowerCase()),
  };
}

export async function saveEmpresa(form: EmpresaFormData, userId: string, id?: string) {
  const payload = toPayload(form);

  if (id) {
    const { data, error } = await supabase.from("empresas").update({ ...payload, updated_by: userId }).eq("id", id).select(EMPRESA_COLUMNS).single();
    if (error) throw friendly(error);
    return data as Empresa;
  }

  const { data, error } = await supabase
    .from("empresas")
    .insert({ ...payload, cadastro_unico: true, created_by: userId, updated_by: userId })
    .select(EMPRESA_COLUMNS)
    .single();
  if (error) throw friendly(error);
  return data as Empresa;
}

export function listEmpresaChildren(kind: "setores", empresaId: string): Promise<EmpresaSetor[]>;
export function listEmpresaChildren(kind: "cargos", empresaId: string): Promise<EmpresaCargo[]>;
export function listEmpresaChildren(kind: "filiais", empresaId: string): Promise<EmpresaFilial[]>;
export async function listEmpresaChildren(kind: EmpresaChildKind, empresaId: string): Promise<EmpresaChild[]> {
  const columns =
    kind === "filiais"
      ? "id,empresa_id,numero_filial,nome,sigla,localidade,responsavel_nome,responsavel_telefone,responsavel_email"
      : "id,empresa_id,nome";

  const { data, error } = await supabase
    .from(childTables[kind])
    .select(columns)
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as EmpresaChild[];
}

export async function saveEmpresaChild(kind: EmpresaChildKind, empresaId: string, payload: Record<string, string>, userId: string, id?: string) {
  const table = childTables[kind];
  const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

  const fields =
    kind === "filiais"
      ? {
          nome: payload.nome.trim(),
          sigla: blank(payload.sigla)?.toUpperCase() ?? null,
          localidade: blank(payload.localidade),
          responsavel_nome: blank(payload.responsavel_nome),
          responsavel_telefone: onlyDigits(payload.responsavel_telefone ?? "") || null,
          responsavel_email: blank(payload.responsavel_email?.toLowerCase()),
        }
      : { nome: payload.nome.trim() };

  if (id) {
    const { error } = await supabase.from(table).update({ ...fields, updated_by: userId }).eq("id", id);
    if (error) throw friendly(error);
    return;
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ ...fields, empresa_id: empresaId, created_by: userId, updated_by: userId })
    .select("id")
    .single();
  if (error) throw friendly(error);
}

export async function softDeleteEmpresaChild(kind: EmpresaChildKind, id: string, userId: string) {
  const table = childTables[kind];
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString(), updated_by: userId }).eq("id", id);
  if (error) throw error;
}

function friendly(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    if (error.message.includes("cnpj")) return new Error("Já existe uma empresa cadastrada com este CNPJ.");
    return new Error("Já existe um registro com este nome.");
  }
  return new Error(error.message);
}
