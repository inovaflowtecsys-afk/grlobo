import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Recebe os relatorios financeiros do SSW baixados pelo bot e grava no Supabase sem repeticao (merge por chave):
//   POST /functions/v1/sync-ssw-financeiro?tipo=faturas|liquidados|a_faturar[&dominio=grupolobo][&sequencia=...]
//   tipo=faturas     -> relatorio 441 analitico "lista faturas com CTRCs": linhas 3 (faturas) e 4 (CTRCs da fatura)
//                       -> ssw_faturas e ssw_fatura_ctrcs
//   tipo=liquidados  -> relatorio 411 (CTRCs liquidados)           -> ssw_ctrcs_liquidados
//   tipo=a_faturar   -> relatorio 435 (CTRCs disponiveis p/ faturar; retrato de hoje: o que sumiu e marcado ativo=false) -> ssw_ctrcs_a_faturar
// Autorizacao: x-sync-secret (SSW_SYNC_SECRET ou SSW_455_TOKEN) OU Authorization: Bearer <service role>.
// Corpo: o arquivo cru do SSW (linhas "0;titulo", "1;cabecalho", "2;/3;/4;dados", "9;rodape").

type Row = Record<string, string>;

serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = new URL(request.url);
  const tipo = (url.searchParams.get("tipo") || "").toLowerCase();
  const dominio = (url.searchParams.get("dominio") || Deno.env.get("SSW_DOMINIO_PADRAO") || "grupolobo").toLowerCase();
  const sequencia = url.searchParams.get("sequencia") || "";
  let supa: { url: string; key: string } | null = null;
  try {
    const secret = Deno.env.get("SSW_SYNC_SECRET")?.trim();
    const token455 = Deno.env.get("SSW_455_TOKEN")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const baseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const enviado = request.headers.get("x-sync-secret");
    const okSecret = (!!secret && enviado === secret) || (!!token455 && enviado === token455);
    const okService = (!!serviceKey && bearer === serviceKey) || (!okSecret && !!baseUrl && !!bearer && await chaveAdmin(baseUrl, bearer));
    if (!okSecret && !okService) return json({ error: "Nao autorizado." }, 401);
    if (!["faturas", "liquidados", "a_faturar"].includes(tipo)) return json({ error: "Informe ?tipo=faturas|liquidados|a_faturar." }, 400);
    supa = { url: need("SUPABASE_URL"), key: need("SUPABASE_SERVICE_ROLE_KEY") };

    const texto = decodifica(new Uint8Array(await request.arrayBuffer()));
    if (!texto.trim()) throw new Error("Arquivo vazio.");
    const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => /^\d;/.test(l));
    const resultado: Record<string, unknown> = {};
    let total = 0, novos = 0, atualizados = 0, iguais = 0;
    const soma = (r: { linhas: number; novos: number; atualizados: number; iguais: number }) => { total += r.linhas; novos += r.novos; atualizados += r.atualizados; iguais += r.iguais; };

    if (tipo === "faturas") {
      const h1 = chaves(linhas.find((l) => l.startsWith("1;")));
      const h2 = chaves(linhas.find((l) => l.startsWith("2;")));
      if (!h1.includes("fatura") || !h2.includes("ctrc")) throw new Error("Cabecalhos do 441 nao reconhecidos.");
      const faturas: unknown[] = [], ctrcs: unknown[] = [];
      for (const l of linhas) {
        if (l.startsWith("3;")) {
          const d = linha(l, h1); const f = d["fatura"]; if (f) faturas.push({ chave_linha: f, dados: d });
        } else if (l.startsWith("4;")) {
          const d = linha(l, h2); d["fatura_numero"] = d["fatura"]; delete d["fatura"];
          if (d["fatura_numero"] && d["ctrc"]) ctrcs.push({ chave_linha: `${d["fatura_numero"]}|${d["ctrc"]}`, dados: d });
        }
      }
      const a = await upsert(supa, "ssw_faturas", dominio, sequencia, faturas);
      const b = await upsert(supa, "ssw_fatura_ctrcs", dominio, sequencia, ctrcs);
      resultado.faturas = a; resultado.ctrcs = b; soma(a); soma(b);
    } else {
      const h = chaves(linhas.find((l) => l.startsWith("1;")));
      const registros: unknown[] = [];
      for (const l of linhas) {
        if (!l.startsWith("2;")) continue;
        const d = linha(l, h);
        const k = tipo === "liquidados"
          ? [d["ctrc"], d["fatura"], d["data_liquid"], d["valor_liqu"]].join("|")
          : d["ctrc"];
        if (d["ctrc"]) registros.push({ chave_linha: k, dados: d });
      }
      if (!registros.length && linhas.some((l) => l.startsWith("2;"))) throw new Error("Sem coluna de CTRC no arquivo.");
      const tabela = tipo === "liquidados" ? "ssw_ctrcs_liquidados" : "ssw_ctrcs_a_faturar";
      const r = await upsert(supa, tabela, dominio, sequencia, registros, tipo === "a_faturar");
      resultado.registros = r; soma(r);
    }
    await log(supa, { tipo, dominio, sequencia, linhas: total, novos, atualizados, iguais, ok: true });
    return json({ ok: true, tipo, sequencia, ...resultado });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    if (supa) await log(supa, { tipo, dominio, sequencia, ok: false, erro: msg }).catch(() => {});
    return json({ error: msg }, 500);
  }
});

async function chaveAdmin(base: string, key: string) {
  try {
    const r = await fetch(`${base}/auth/v1/admin/users?per_page=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return r.status === 200;
  } catch { return false; }
}

function decodifica(b: Uint8Array) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); }
}

const clean = (v: string) => v.replace(/[\s�]+/g, " ").trim();
const norm = (h: string) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
// chaves normalizadas do cabecalho (a 1a coluna e o numero do tipo de linha e vira "")
function chaves(l?: string): string[] {
  if (!l) return [];
  return l.split(";").map((h, i) => (i === 0 ? "" : norm(h)));
}
function linha(l: string, keys: string[]): Row {
  const cells = l.split(";");
  const r: Row = {};
  keys.forEach((k, i) => { if (k) r[k] = clean(cells[i] ?? ""); });
  return r;
}

async function upsert(cfg: { url: string; key: string }, tabela: string, dominio: string, sequencia: string, rows: unknown[], retrato = false) {
  if (!rows.length) return { linhas: 0, novos: 0, atualizados: 0, iguais: 0 };
  return await rest(cfg, "/rest/v1/rpc/ssw_fin_upsert", {
    method: "POST",
    body: JSON.stringify({ p_tabela: tabela, p_dominio: dominio, p_sequencia: sequencia || null, p_rows: rows, p_retrato: retrato }),
  });
}
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
  await rest(cfg, "/rest/v1/ssw_fin_cargas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...r, sequencia: r.sequencia || null }) });
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
