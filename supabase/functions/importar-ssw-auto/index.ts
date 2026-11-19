import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DESTINOS_AUTOMATICOS, detectar, type Tipo } from "../_shared/ssw_deteccao.ts";
import { base64ParaBytes, chamarSync, decodifica, sha256, textoOuNulo } from "../_shared/ssw_importacao.ts";

// Importacao AUTOMATICA de relatorios SSW (GrupoLobo), chamada pela extensao do navegador.
//
//   POST /functions/v1/importar-ssw-auto        Header: x-importador-token: <SSW_IMPORT_TOKEN>
//
//   { "evento": "ping" }                                         -> confere o token e se a importacao automatica esta LIGADA no site
//   { "evento": "erro", "tipo"?, "relatorio"?, "mensagem" }      -> registra no log uma falha ocorrida na extensao (403, sessao expirada...)
//   { "tipo": "036|455|441|411|435", "relatorio"?: "fat-emissao", "nome": "...", "conteudo_base64": "<bytes do arquivo>",
//     "referencia"?: "171026-201026" (036), "sequencia"?: "..." (455 / financeiro) }
//        Reconhece o arquivo (mesmas regras do manual); se nao bater com o tipo pedido, RECUSA e nao grava nada.
//        Se passar, chama a funcao de sincronizacao existente (a mesma do robo do n8n) e registra no log (origem "automatica").
//
// Travas: token secreto; botao liga/desliga em public.ssw_importacao_config (ativo=false => 423); lista de tipos permitidos;
// limite de importacoes por hora. Deploy: supabase functions deploy importar-ssw-auto --no-verify-jwt
// Segredo: supabase secrets set SSW_IMPORT_TOKEN=<texto aleatorio longo>  (o mesmo valor vai na tela de opcoes da extensao).

const MAX_BYTES = 25 * 1024 * 1024;
const USUARIO = "Extensão automática";

serve(async (request) => {
  if (request.method === "OPTIONS") return resp({ ok: true });
  if (request.method !== "POST") return resp({ error: "Use POST." }, 405);

  try {
    const esperado = Deno.env.get("SSW_IMPORT_TOKEN")?.trim();
    if (!esperado) return resp({ error: "Importação automática não configurada no servidor (SSW_IMPORT_TOKEN)." }, 503);
    const enviado = (request.headers.get("x-importador-token") || "").trim();
    if (!igualSeguro(enviado, esperado)) return resp({ error: "Token inválido." }, 401);

    const baseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!baseUrl || !serviceKey) throw new Error("Variáveis do Supabase não configuradas.");
    const admin = createClient(baseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return resp({ error: "Corpo inválido." }, 400);

    const { data: cfg } = await admin.from("ssw_importacao_config").select("*").eq("id", true).maybeSingle();
    if (!cfg?.ativo) return resp({ error: "Importação automática desligada no site.", desligada: true }, 423);
    const permitidos: string[] = Array.isArray(cfg.tipos_permitidos) ? cfg.tipos_permitidos : [];

    const evento = String(body.evento || "");
    if (evento === "ping") return resp({ ok: true, ativo: true, tipos: permitidos, limite_por_hora: cfg.limite_por_hora });

    const tipo = String(body.tipo || "");
    const relatorio = String(body.relatorio || tipo).slice(0, 60);

    if (evento === "erro") {
      const mensagem = String(body.mensagem || "Erro na extensão.").slice(0, 500);
      await registrar(admin, { nome: `(${relatorio})`, hash: await sha256(`${relatorio}|${mensagem}|${Date.now()}`), tipo: tipo in DESTINOS_AUTOMATICOS ? tipo : "desconhecido", status: "erro", motivo: mensagem });
      return resp({ ok: true });
    }

    if (!(tipo in DESTINOS_AUTOMATICOS) || !permitidos.includes(tipo)) return resp({ error: `Tipo não permitido para importação automática: ${tipo || "(vazio)"}.` }, 422);
    const destino = DESTINOS_AUTOMATICOS[tipo as Tipo]!;

    // trava contra repeticao descontrolada
    const desde = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from("ssw_importacoes").select("id", { count: "exact", head: true }).eq("origem", "automatica").eq("status", "importado").gte("criado_em", desde);
    if ((count ?? 0) >= (cfg.limite_por_hora ?? 60)) return resp({ error: `Limite de ${cfg.limite_por_hora} importações automáticas por hora atingido.` }, 429);

    const b64 = typeof body.conteudo_base64 === "string" ? body.conteudo_base64 : "";
    if (!b64) return resp({ error: "Informe conteudo_base64." }, 400);
    const bytes = base64ParaBytes(b64);
    if (bytes.length > MAX_BYTES) return resp({ error: "Arquivo grande demais." }, 413);
    const hash = await sha256(bytes);
    const texto = decodifica(bytes);
    const nome = String(body.nome || relatorio).slice(0, 300);
    const referencia = textoOuNulo(body.referencia);
    const sequencia = textoOuNulo(body.sequencia);

    const det = detectar(texto, tipo, { permitir435: true });
    if (det.motivo || det.tipo !== tipo) {
      const motivo = det.motivo || `O arquivo não é do tipo ${tipo}.`;
      await registrar(admin, { nome, hash, tamanho: bytes.length, tipo: det.tipo, status: "recusado", motivo, referencia, sequencia, linhas: det.linhas, cabecalho: det.cabecalho, avisos: det.avisos });
      return resp({ error: motivo, recusado: true }, 422);
    }

    const parametro = destino.param === "referencia" ? (referencia ?? det.referencia ?? null) : sequencia;
    const agora = new Date().toISOString();
    const reg = await registrar(admin, { nome, hash, tamanho: bytes.length, tipo, status: "validado", referencia: referencia ?? det.referencia ?? null, sequencia, linhas: det.linhas, cabecalho: det.cabecalho, avisos: det.avisos, autorizado_em: agora });

    const r = await chamarSync(destino, texto, parametro);
    const fim = new Date().toISOString();
    const { data, error } = await admin
      .from("ssw_importacoes")
      .update(
        r.ok
          ? { status: "importado", motivo: null, linhas: r.contagem.linhas || det.linhas, novos: r.contagem.novos, atualizados: r.contagem.atualizados, iguais: r.contagem.iguais, importado_em: fim, atualizado_em: fim }
          : { status: "erro", motivo: r.erro.slice(0, 500), atualizado_em: fim },
      )
      .eq("id", reg.id)
      .select("id,status,motivo,linhas,novos,atualizados,iguais")
      .single();
    if (error) throw new Error(`Importação executada, mas o log falhou: ${error.message}`);
    return resp({ ok: r.ok, importacao: data, error: r.ok ? undefined : r.erro }, r.ok ? 200 : 502);
  } catch (error) {
    return resp({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, "public", any>;

async function registrar(
  admin: Admin,
  p: { nome: string; hash: string; tamanho?: number; tipo: string; status: string; motivo?: string; referencia?: string | null; sequencia?: string | null; linhas?: number; cabecalho?: string[]; avisos?: string[]; autorizado_em?: string },
) {
  const { data, error } = await admin
    .from("ssw_importacoes")
    .insert({
      usuario_nome: USUARIO,
      nome_arquivo: p.nome,
      tamanho_bytes: p.tamanho ?? null,
      hash_sha256: p.hash,
      tipo: p.tipo,
      status: p.status,
      motivo: p.motivo ?? null,
      referencia: p.referencia ?? null,
      sequencia: p.sequencia ?? null,
      linhas: p.linhas ?? null,
      cabecalho: p.cabecalho?.slice(0, 80) ?? null,
      avisos: p.avisos ?? [],
      autorizado_em: p.autorizado_em ?? null,
      origem: "automatica",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Não foi possível registrar o log: ${error.message}`);
  return data as { id: string };
}

function igualSeguro(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-importador-token" },
  });
}
