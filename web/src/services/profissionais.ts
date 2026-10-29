import { invokeFunction } from "../lib/invokeFunction";
import { supabase } from "../lib/supabase";
import type { Filial, ProfissionalFormData, ProfissionalListItem, ProfissionaisQuery, Referencia } from "../types/profissional";

const COLUMNS =
  "id,codigo,filial_id,cargo_id,setor_id,nome,email,avatar_url,tipo_usuario,modulos_acesso,ativo,senha_provisoria,created_at," +
  "filial:empresa_filiais(id,nome,sigla,localidade),cargo_ref:empresa_cargos(id,nome),setor_ref:empresa_setores(id,nome)";

export async function listProfissionais(query: ProfissionaisQuery) {
  const from = (query.page - 1) * query.pageSize;

  let request = supabase.from("profiles").select(COLUMNS, { count: "exact" }).is("deleted_at", null);

  // vírgula, parênteses e % têm significado no filtro .or() do PostgREST
  const term = query.search.trim().replace(/[,()%*\\]/g, " ");
  if (term) request = request.or(`nome.ilike.%${term}%,email.ilike.%${term}%`);
  if (query.filialId) request = request.eq("filial_id", query.filialId);
  if (query.status !== "todos") request = request.eq("ativo", query.status === "ativo");

  const { data, error, count } = await request
    .order(query.sortBy, { ascending: query.sortDirection === "asc" })
    .range(from, from + query.pageSize - 1);
  if (error) throw error;

  return { data: (data ?? []) as unknown as ProfissionalListItem[], count: count ?? 0 };
}

async function listRef(table: "empresa_setores" | "empresa_cargos") {
  const { data, error } = await supabase.from(table).select("id,nome").is("deleted_at", null).order("nome");
  if (error) throw error;
  return (data ?? []) as Referencia[];
}

export const listSetores = () => listRef("empresa_setores");
export const listCargos = () => listRef("empresa_cargos");

export async function listFiliais() {
  const { data, error } = await supabase.from("empresa_filiais").select("id,nome,sigla,localidade").is("deleted_at", null).order("nome");
  if (error) throw error;
  return (data ?? []) as Filial[];
}

export async function createProfissional(payload: ProfissionalFormData) {
  await invokeFunction("profissionais-create", { ...payload });
}

export async function updateProfissional(id: string, payload: ProfissionalFormData) {
  await invokeFunction("profissionais-update", { id, ...payload });
}

/** Envia um código de verificação por e-mail e invalida a senha atual até ele ser usado. */
export async function resetProfissionalSenha(id: string) {
  await invokeFunction("profissionais-reset-password", { id });
}
