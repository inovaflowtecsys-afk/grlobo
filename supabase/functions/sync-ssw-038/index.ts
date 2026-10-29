import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Recebe o TXT do relatorio 038 (CTRCs pendentes de entrega, foto atual) baixado direto do SSW pelo
// grupolobo-ssw-bot (POST /relatorio?rel=038). Grava em ssw_tracking.ctrc_pendentes (schema separado do 455).
//
//   POST /functions/v1/sync-ssw-038?referencia=171026-201026[&dominio=grupolobo]
//   Header: x-sync-secret: <SSW_SYNC_SECRET>  (ou Authorization: Bearer <service role key>)
//   Corpo: o arquivo cru (text/plain ou binario) OU JSON {"referencia": "...", "conteudo": "..."}
//
// Segredos: SSW_SYNC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (SSW_DOMINIO_PADRAO opcional, padrao "grupolobo").
// IMPORTANTE: o schema ssw_tracking precisa estar em Project Settings > Data API > Exposed schemas no Supabase,
// senao o PostgREST responde 404/406 para a RPC e para a tabela de log.

type Row = Record<string, string>;

serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = new URL(request.url);
  let supa: { url: string; key: string } | null = null;
  let referencia = url.searchParams.get("referencia") || "";
  let dominio = (url.searchParams.get("dominio") || Deno.env.get("SSW_DOMINIO_PADRAO") || "grupolobo").toLowerCase();
  try {
    const secret = Deno.env.get("SSW_SYNC_SECRET")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const enviado = request.headers.get("x-sync-secret");
    const okSecret = !!secret && enviado === secret;
    const baseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const okService = (!!serviceKey && bearer === serviceKey) || (!okSecret && !!baseUrl && !!bearer && await chaveAdmin(baseUrl, bearer));
    if (!okSecret && !okService) return json({ error: "Nao autorizado." }, 401);
    supa = { url: need("SUPABASE_URL"), key: need("SUPABASE_SERVICE_ROLE_KEY") };

    const bytes = new Uint8Array(await request.arrayBuffer());
    let texto = decodifica(bytes);
    if ((request.headers.get("content-type") || "").includes("json")) {
      const body = JSON.parse(texto);
      if (body && typeof body === "object" && (body.erro || body.etapa)) {
        // erro devolvido pelo bot (502/503 em JSON): registra a causa real em vez de "Arquivo vazio."
        throw new Error(`Bot SSW [${body.etapa ?? "?"}]: ${body.erro ?? "erro"}${body.diag ? " | " + JSON.stringify(body.diag).slice(0, 500) : ""}`);
      }
      texto = String(body.conteudo ?? "");
      referencia = String(body.referencia ?? referencia);
      dominio = String(body.dominio ?? dominio).toLowerCase();
    }
    if (!texto.trim()) throw new Error("Arquivo vazio.");

    const { cabecalho, linhas } = parse(texto);
    const registros: unknown[] = [];
    for (const r of linhas) {
      const ctrc = (r["ctrc"] || "").trim();
      if (!ctrc) continue;
      registros.push({ ctrc, dados: r });
    }
    if (linhas.length && !registros.length) {
      await log(supa, { relatorio: "038", dominio, referencia, linhas: linhas.length, ok: false, erro: "Sem coluna CTRC no arquivo." });
      return json({ error: "Sem coluna CTRC no arquivo.", cabecalho }, 422);
    }

    const res = registros.length
      ? await rest(supa, "/rest/v1/rpc/ctrc_pendentes_upsert", { method: "POST", body: JSON.stringify({ p_dominio: dominio, p_referencia: referencia || null, p_rows: registros }) })
      : { linhas: 0, novos: 0, atualizados: 0, iguais: 0 };
    await log(supa, { relatorio: "038", dominio, referencia, ...res, ok: true });
    return json({ ok: true, referencia, ...res });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    if (supa) await log(supa, { relatorio: "038", dominio, referencia, ok: false, erro: msg }).catch(() => {});
    return json({ error: msg }, 500);
  }
});

async function chaveAdmin(base: string, key: string) {
  try {
    const r = await fetch(`${base}/auth/v1/admin/users?per_page=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return r.status === 200;
  } catch {
    return false;
  }
}

function decodifica(b: Uint8Array) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); }
}

function parse(texto: string): { cabecalho: string[]; linhas: Row[] } {
  const lines = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  const sswHead = lines.findIndex((l) => /^1;/.test(l));
  const sswFmt = sswHead >= 0;
  const hi = sswFmt ? sswHead : 0;
  if (!lines.length) return { cabecalho: [], linhas: [] };
  const sep = sswFmt || lines[hi].includes(";") ? ";" : "\t";
  const cab = lines[hi].split(sep).map((h) => h.trim());
  const keys = cab.map((h, i) => (sswFmt && i === 0 ? "" : norm(h)));
  const linhas: Row[] = [];
  for (const line of lines.slice(hi + 1)) {
    if (sswFmt && !/^\d;/.test(line)) continue;
    if (sswFmt && /^9;/.test(line)) continue;
    const cells = line.split(sep);
    const r: Row = {};
    keys.forEach((k, i) => { if (k) r[k] = clean(cells[i] ?? ""); });
    if (Object.values(r).some((v) => v)) linhas.push(r);
  }
  return { cabecalho: keys.filter(Boolean), linhas };
}

const clean = (v: string) => v.replace(/[\s�]+/g, " ").trim();
const norm = (h: string) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

async function rest(cfg: { url: string; key: string }, path: string, o: { method?: string; body?: string; headers?: Record<string, string> }) {
  const res = await fetch(`${cfg.url}${path}`, {
    method: o.method || "GET",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json", "Content-Profile": "ssw_tracking", "Accept-Profile": "ssw_tracking", ...(o.headers || {}) },
    body: o.body,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}
async function log(cfg: { url: string; key: string }, r: Record<string, unknown>) {
  await rest(cfg, "/rest/v1/cargas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...r, referencia: r.referencia || null }) });
}
function need(name: string) {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return v;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret" },
  });
}
