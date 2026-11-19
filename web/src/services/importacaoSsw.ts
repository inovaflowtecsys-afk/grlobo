import { invokeFunction } from "../lib/invokeFunction";
import { supabase } from "../lib/supabase";
import type { ConfigAutomatica, Importacao } from "../types/importacaoSsw";

/** Extensões de texto aceitas (arquivos sem extensão também). Qualquer outra é ignorada antes de ler. */
const EXTENSOES_RECUSADAS = /\.(xlsx?|pdf|zip|rar|7z|docx?|png|jpe?g|gif|exe|dll|json|xml|html?)$/i;
export const MAX_ARQUIVOS = 40;
export const MAX_BYTES = 15 * 1024 * 1024;

export function motivoIgnorado(file: File): string | null {
  if (EXTENSOES_RECUSADAS.test(file.name)) return "Tipo de arquivo não aceito (use o TXT/CSV do relatório).";
  if (file.size === 0) return "Arquivo vazio.";
  if (file.size > MAX_BYTES) return `Arquivo maior que ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`;
  return null;
}

/** Mesma decodificação das funções de sincronização: UTF-8 estrito; se falhar, Windows-1252. */
export async function lerTexto(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

type Parametros = { nome: string; conteudo: string; tipo?: string; referencia?: string; sequencia?: string };

/** Reconhece o tipo e registra o resultado no log. Não grava dados de relatório. */
export async function validarArquivo(p: Parametros): Promise<Importacao> {
  const r = await invokeFunction<{ importacao: Importacao }>("importar-ssw", { modo: "validar", ...p });
  return r.importacao;
}

/** Importa um arquivo já validado, chamando a mesma função de sincronização do modo automático. */
export async function importarArquivo(p: { importacao_id: string; nome: string; conteudo: string; referencia?: string; sequencia?: string }) {
  return await invokeFunction<{ ok: boolean; importacao: Importacao; error?: string }>("importar-ssw", { modo: "importar", ...p });
}

export async function listarImportacoes(filtros: { status?: string; tipo?: string; origem?: string } = {}): Promise<Importacao[]> {
  let q = supabase.from("ssw_importacoes").select("*").order("criado_em", { ascending: false }).limit(100);
  if (filtros.status) q = q.eq("status", filtros.status);
  if (filtros.tipo) q = q.eq("tipo", filtros.tipo);
  if (filtros.origem) q = q.eq("origem", filtros.origem);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Importacao[];
}

/** Estado do botão de ligar/desligar da importação automática (só administradores leem e alteram). */
export async function lerConfigAutomatica(): Promise<ConfigAutomatica | null> {
  const { data, error } = await supabase.from("ssw_importacao_config").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConfigAutomatica | null) ?? null;
}

export async function alterarImportacaoAutomatica(ativo: boolean, usuarioId: string | null): Promise<ConfigAutomatica> {
  const { data, error } = await supabase
    .from("ssw_importacao_config")
    .update({ ativo, atualizado_em: new Date().toISOString(), atualizado_por: usuarioId })
    .eq("id", true)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ConfigAutomatica;
}
