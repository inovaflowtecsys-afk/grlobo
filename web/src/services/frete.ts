import { localParaIso, parseValor } from "../lib/frete";
import { supabase } from "../lib/supabase";
import type { FreteFormData, FreteListItem, FreteLogItem, FreteMotorista, FretesQuery } from "../types/frete";

const COLUMNS =
  "id,data_registro,motorista_id,valor_frete,valor_chapa,valor_descarga,valor_adicional,observacao,pago,data_pagamento,nota_fiscal,created_at," +
  "motorista:frete_motoristas(id,nome)";

export async function listFretes(query: FretesQuery) {
  const from = (query.page - 1) * query.pageSize;
  let request = supabase.from("frete_entregas").select(COLUMNS, { count: "exact" }).is("deleted_at", null);

  if (query.motoristaId) request = request.eq("motorista_id", query.motoristaId);
  // o fuso do Brasil não tem horário de verão: -03:00 fixo cobre o dia inteiro
  if (query.de) request = request.gte("data_registro", `${query.de}T00:00:00-03:00`);
  if (query.ate) request = request.lte("data_registro", `${query.ate}T23:59:59.999-03:00`);
  const nota = query.notaFiscal.trim().replace(/[,()%*\\]/g, " ");
  if (nota) request = request.ilike("nota_fiscal", `%${nota}%`);
  if (query.pago !== "todos") request = request.eq("pago", query.pago === "pago");

  const { data, error, count } = await request
    .order(query.sortBy, { ascending: query.sortDirection === "asc" })
    .order("created_at", { ascending: false })
    .range(from, from + query.pageSize - 1);
  if (error) throw error;
  return { data: (data ?? []) as unknown as FreteListItem[], count: count ?? 0 };
}

function payload(valores: FreteFormData) {
  return {
    data_registro: localParaIso(valores.data_registro),
    motorista_id: valores.motorista_id,
    valor_frete: parseValor(valores.valor_frete) ?? 0,
    valor_chapa: parseValor(valores.valor_chapa) ?? 0,
    valor_descarga: parseValor(valores.valor_descarga) ?? 0,
    valor_adicional: parseValor(valores.valor_adicional) ?? 0,
    observacao: valores.observacao.trim() || null,
  };
}

/** A data do pagamento e o responsável são definidos pelo banco; aqui só se pede o pagamento. */
export async function createFrete(valores: FreteFormData) {
  const { error } = await supabase
    .from("frete_entregas")
    .insert({ ...payload(valores), pago: valores.pago, nota_fiscal: valores.pago ? valores.nota_fiscal.trim() : null });
  if (error) throw error;
}

export async function updateFrete(id: string, valores: FreteFormData, jaPago: boolean) {
  const alteracoes = jaPago ? payload(valores) : { ...payload(valores), pago: valores.pago, nota_fiscal: valores.pago ? valores.nota_fiscal.trim() : null };
  const { error } = await supabase.from("frete_entregas").update(alteracoes).eq("id", id).is("deleted_at", null);
  if (error) throw error;
}

export async function deleteFrete(id: string) {
  const { error } = await supabase.from("frete_entregas").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) throw error;
}

export async function listMotoristas() {
  const { data, error } = await supabase.from("frete_motoristas").select("id,nome,cpf").is("deleted_at", null).order("nome");
  if (error) throw error;
  return (data ?? []) as FreteMotorista[];
}

export async function createMotorista(nome: string, cpf: string) {
  const { data, error } = await supabase.from("frete_motoristas").insert({ nome, cpf: cpf || null }).select("id,nome,cpf").single();
  if (error) throw error;
  return data as FreteMotorista;
}

export async function updateMotorista(id: string, nome: string, cpf: string) {
  const { error } = await supabase.from("frete_motoristas").update({ nome, cpf: cpf || null }).eq("id", id).is("deleted_at", null);
  if (error) throw error;
}

export async function deleteMotorista(id: string) {
  const { error } = await supabase.from("frete_motoristas").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) throw error;
}

export async function listLog(entidade: "FRETE" | "MOTORISTA", registroId: string) {
  const { data, error } = await supabase
    .from("frete_log")
    .select("id,entidade,registro_id,acao,usuario_nome,em,detalhes")
    .eq("entidade", entidade)
    .eq("registro_id", registroId)
    .order("em", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FreteLogItem[];
}
