// Pecas comuns da importacao manual (importar-ssw) e da automatica (importar-ssw-auto).
// A gravacao dos dados continua SEMPRE nas funcoes sync-ssw-036 / sync-ssw-455 / sync-ssw-financeiro (as mesmas do modo do robo).

import type { Destino } from "./ssw_deteccao.ts";

export async function sha256(bytesOuTexto: string | Uint8Array) {
  const dados = typeof bytesOuTexto === "string" ? new TextEncoder().encode(bytesOuTexto) : bytesOuTexto;
  const buf = await crypto.subtle.digest("SHA-256", dados as BufferSource);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mesma decodificacao das funcoes sync-ssw-*: UTF-8 estrito; se falhar, Windows-1252. */
export function decodifica(b: Uint8Array) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); }
}

export function base64ParaBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function textoOuNulo(v: unknown) {
  const t = typeof v === "string" ? v.trim().slice(0, 80) : "";
  return t || null;
}

/** Soma as contagens devolvidas pelas funcoes sync-ssw-* (o financeiro devolve varios blocos). */
export function somar(r: Record<string, unknown>) {
  const blocos: Record<string, unknown>[] = [];
  if (typeof r.linhas === "number") blocos.push(r);
  for (const k of ["faturas", "ctrcs", "registros"]) {
    const b = r[k];
    if (b && typeof b === "object") blocos.push(b as Record<string, unknown>);
  }
  const soma = (campo: string) => blocos.reduce((t, b) => t + (typeof b[campo] === "number" ? (b[campo] as number) : 0), 0);
  return { linhas: soma("linhas"), novos: soma("novos"), atualizados: soma("atualizados"), iguais: soma("iguais") };
}

/** Chama a funcao de sincronizacao existente com o conteudo cru do relatorio. Nao lanca: devolve ok/erro. */
export async function chamarSync(destino: Destino, conteudo: string, parametro: string | null) {
  const baseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!baseUrl || !serviceKey) throw new Error("Variáveis do Supabase não configuradas.");

  const qs = new URLSearchParams(destino.query);
  if (parametro) qs.set(destino.param, parametro);
  const url = `${baseUrl}/functions/v1/${destino.funcao}${qs.toString() ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  const segredo = Deno.env.get("SSW_SYNC_SECRET")?.trim();
  if (segredo) headers["x-sync-secret"] = segredo;

  let resposta: Record<string, unknown> = {};
  let ok = false;
  let erro = "";
  try {
    const r = await fetch(url, { method: "POST", headers, body: conteudo });
    const texto = await r.text();
    try { resposta = JSON.parse(texto); } catch { resposta = { error: texto.slice(0, 300) }; }
    ok = r.ok && resposta.ok !== false;
    if (!ok) erro = String(resposta.error || `A função de sincronização respondeu ${r.status}.`);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao chamar a função de sincronização.";
  }
  return { ok, erro, resposta, contagem: somar(resposta) };
}
