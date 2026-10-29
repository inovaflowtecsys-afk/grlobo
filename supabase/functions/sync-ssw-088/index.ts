import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Recebe o JSON do relatorio 088 (Situacao dos veiculos de coleta/entrega) que o grupolobo-ssw-bot ja devolve
// pronto (POST /veiculos-088) -- essa tela nao tem arquivo, os dados vem de um XML embutido no HTML, e o bot
// ja extrai {data, linhas:[{placa, dados}]}. Grava em ssw_tracking.veiculos_situacao (schema separado do 455).
//
//   POST /functions/v1/sync-ssw-088
//   Header: x-sync-secret: <SSW_SYNC_SECRET>  (ou Authorization: Bearer <service role key>)
//   Corpo: JSON {"data": "201026", "linhas": [{"placa": "ARB9H80", "dados": {...}}], "dominio": "grupolobo"}
//
// Segredos: SSW_SYNC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (SSW_DOMINIO_PADRAO opcional, padrao "grupolobo").
// IMPORTANTE: o schema ssw_tracking precisa estar em Project Settings > Data API > Exposed schemas no Supabase.

serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  let supa: { url: string; key: string } | null = null;
  let dominio = (Deno.env.get("SSW_DOMINIO_PADRAO") || "grupolobo").toLowerCase();
  let dataRef = "";
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

    const body = await request.json();
    if (body && typeof body === "object" && (body.erro || body.etapa)) {
      // erro devolvido pelo bot (502/503 em JSON): registra a causa real em vez de "data ausente"
      throw new Error(`Bot SSW [${body.etapa ?? "?"}]: ${body.erro ?? "erro"}${body.diag ? " | " + JSON.stringify(body.diag).slice(0, 500) : ""}`);
    }
    dominio = String(body.dominio ?? dominio).toLowerCase();
    dataRef = String(body.data ?? "");
    const linhasEntrada: Array<{ placa?: string; dados?: Record<string, string> }> = Array.isArray(body.linhas) ? body.linhas : [];
    if (!dataRef || !/^\d{6}$/.test(dataRef)) throw new Error("Campo 'data' ausente ou invalido (esperado ddmmaa).");
    const dataIso = `20${dataRef.slice(4, 6)}-${dataRef.slice(2, 4)}-${dataRef.slice(0, 2)}`;

    const registros = linhasEntrada
      .filter((l) => l.placa)
      .map((l) => ({ placa: l.placa, dados: l.dados || {} }));

    const res = registros.length
      ? await rest(supa, "/rest/v1/rpc/veiculos_situacao_upsert", { method: "POST", body: JSON.stringify({ p_dominio: dominio, p_data: dataIso, p_rows: registros }) })
      : { linhas: 0, novos: 0, atualizados: 0, iguais: 0 };
    await log(supa, { relatorio: "088", dominio, referencia: dataRef, ...res, ok: true });
    return json({ ok: true, data: dataRef, ...res });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    if (supa) await log(supa, { relatorio: "088", dominio, referencia: dataRef, ok: false, erro: msg }).catch(() => {});
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
