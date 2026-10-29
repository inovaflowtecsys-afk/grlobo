import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Recebe o TXT do relatorio 455 (Fretes Expedidos/Recebidos - CTRCs) baixado da fila do 156 do SSW
// GrupoLobo: arquivo gerado pelo grupolobo-ssw-bot (n8n 3x ao dia) e grava em public.ssw_455_ctrcs sem repeticao.
//
//   POST /functions/v1/sync-ssw-455?sequencia=493117[&dominio=grupolobo]
//   Header: x-sync-secret: <SSW_SYNC_SECRET>  (ou Authorization: Bearer <service role key>)
//   Corpo: o arquivo cru (text/plain ou binario) OU JSON {"sequencia": "...", "conteudo": "..."}
//
// Segredos: SSW_SYNC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (SSW_DOMINIO_PADRAO e opcional, padrao "grupolobo").
// Os nomes das colunas do TXT sao normalizados (minusculas, sem acento, "_"). Se nao houver coluna de CTRC nem
// de chave do CT-e, responde 422 com os cabecalhos lidos para ajustar o mapeamento.

type Row = Record<string, string>;

serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = new URL(request.url);
  let supa: { url: string; key: string } | null = null;
  let sequencia = url.searchParams.get("sequencia") || "";
  let dominio = (url.searchParams.get("dominio") || Deno.env.get("SSW_DOMINIO_PADRAO") || "grupolobo").toLowerCase();
  try {
    // Autorizacao: x-sync-secret (SSW_SYNC_SECRET ou SSW_455_TOKEN) OU Authorization: Bearer <service role> (credencial Supabase API do n8n).
    const secret = Deno.env.get("SSW_SYNC_SECRET")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const token455 = Deno.env.get("SSW_455_TOKEN")?.trim();
    const enviado = request.headers.get("x-sync-secret");
    const okSecret = (!!secret && enviado === secret) || (!!token455 && enviado === token455);
    // Bearer: igual a SUPABASE_SERVICE_ROLE_KEY, ou qualquer chave que a API de admin do projeto aceite (so service role/secret key passa).
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
      sequencia = String(body.sequencia ?? sequencia);
      dominio = String(body.dominio ?? dominio).toLowerCase();
    }
    if (!texto.trim()) throw new Error("Arquivo vazio.");

    const { cabecalho, linhas } = parse(texto);
    const registros: unknown[] = [];
    for (const r of linhas) {
      // 455: "serie_numero_ctrc" (ex.: "BRU 006279-1"); 174/BI2: sigla_ctrc + numero_ctrc
      const ctrcBruto = (r["serie_numero_ctrc"] || "").trim() || `${r["sigla_ctrc"] || ""}${r["numero_ctrc"] || ""}`.trim() || (r["ctrc"] || "").trim();
      const ctrc = normalizarCtrc(ctrcBruto);
      const chaveCte = digits(r["nro_chave_acesso_cte"] || r["chave_cte"] || r["chave_acesso"]);
      const chave = ctrc || chaveCte;
      if (!chave) continue;
      registros.push({ chave_linha: chave, ctrc: ctrc || null, chave_cte: chaveCte || null, dados: r });
    }
    if (linhas.length && !registros.length) {
      await log(supa, { dominio, sequencia, linhas: linhas.length, ok: false, erro: "Sem coluna de CTRC/chave do CT-e." });
      return json({ error: "Sem coluna de CTRC/chave do CT-e no arquivo.", cabecalho }, 422);
    }

    const res = registros.length
      ? await rest(supa, "/rest/v1/rpc/ssw_455_upsert", { method: "POST", body: JSON.stringify({ p_dominio: dominio, p_sequencia: sequencia || null, p_rows: registros }) })
      : { linhas: 0, novos: 0, atualizados: 0, iguais: 0 };
    await log(supa, { dominio, sequencia, ...res, ok: true });
    return json({ ok: true, sequencia, ...res });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    if (supa) await log(supa, { dominio, sequencia, ok: false, erro: msg }).catch(() => {});
    return json({ error: msg }, 500);
  }
});

// Valida se a chave e de servico: a rota admin do Auth responde 200 so para service role / secret key.
async function chaveAdmin(base: string, key: string) {
  try {
    const r = await fetch(`${base}/auth/v1/admin/users?per_page=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return r.status === 200;
  } catch {
    return false;
  }
}

// UTF-8 estrito; se falhar, o SSW enviou Windows-1252.
function decodifica(b: Uint8Array) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); }
}

// Aceita o formato SSW ("0;titulo", "1;cabecalho", "3;linhas", "9;rodape") e CSV simples com ; ou tab.
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
const normalizarCtrc = (v: string) => v.replace(/\s+/g, "").toUpperCase();
const norm = (h: string) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const digits = (v?: string) => (v || "").replace(/\D/g, "");

async function rest(cfg: { url: string; key: string }, path: string, o: { method?: string; body?: string; headers?: Record<string, string> }) {
  const res = await fetch(`${cfg.url}${path}`, {
    method: o.method || "GET",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json", ...(o.headers || {}) },
    body: o.body,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}
async function log(cfg: { url: string; key: string }, r: Record<string, unknown>) {
  await rest(cfg, "/rest/v1/ssw_455_cargas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...r, sequencia: r.sequencia || null }) });
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
