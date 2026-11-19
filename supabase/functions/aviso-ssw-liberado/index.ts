import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.15";
import { getAdminClient, json, options } from "../_shared/profissionais.ts";

// Aviso por e-mail quando o SSW volta a aceitar o IP de uma VPS (o teste diario do n8n chama esta funcao).
//   POST /functions/v1/aviso-ssw-liberado    Authorization: Bearer <service role>   (a credencial Supabase do n8n)
//   { "ip": "143.95.209.134", "resultado": "LIBERADO: menu01=200 ...", "dry_run"?: true }
// Usa o mesmo SMTP (public.configuracao_email) e o mesmo destinatario dos alertas de coleta (ultimo public.ssw_alertas.email_destino).
// dry_run: confere SMTP e destinatario sem enviar nada. Deploy: supabase functions deploy aviso-ssw-liberado --no-verify-jwt

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const baseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    // igual as funcoes sync-ssw-*: a chave service role, ou qualquer chave que a API de admin do projeto aceite (so service role/secret key passa)
    let autorizado = !!serviceKey && bearer === serviceKey;
    if (!autorizado && baseUrl && bearer) {
      const r = await fetch(`${baseUrl}/auth/v1/admin/users?per_page=1`, { headers: { apikey: bearer, Authorization: `Bearer ${bearer}` } }).catch(() => null);
      autorizado = !!r && r.ok;
    }
    if (!autorizado) return json({ error: "Não autorizado." }, 401);

    const body = await request.json().catch(() => ({}));
    const ip = String(body.ip || "?").slice(0, 60);
    const resultado = String(body.resultado || "").slice(0, 500);
    const dry = body.dry_run === true;

    const admin = getAdminClient();
    const { data: alerta } = await admin.from("ssw_alertas").select("email_destino").not("email_destino", "is", null).order("id", { ascending: false }).limit(1).maybeSingle();
    const destino = alerta?.email_destino as string | undefined;
    if (!destino) throw new Error("Destinatário não encontrado em ssw_alertas.");
    const { data: cfg, error } = await admin
      .from("configuracao_email")
      .select("smtp_host,smtp_porta,smtp_usuario,smtp_senha,smtp_ssl,smtp_remetente,smtp_nome_remetente")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !cfg) throw new Error("Configuração de e-mail não encontrada.");
    if (dry) return json({ ok: true, dry_run: true, destinatario: destino.replace(/^(.).*(@.*)$/, "$1***$2"), smtp: cfg.smtp_host });

    const linhas = [
      `O SSW voltou a aceitar o acesso web da VPS ${ip}.`,
      "",
      resultado,
      "",
      "O que fazer:",
      "- Confirmar com um teste manual do fluxo no n8n.",
      "- Religar os fluxos do n8n dessa VPS (e desligar a extensão do mesmo usuário do SSW: o SSW aceita uma sessão por usuário).",
    ];
    const transporter = nodemailer.createTransport({ host: cfg.smtp_host, port: Number(cfg.smtp_porta), secure: Boolean(cfg.smtp_ssl), auth: { user: cfg.smtp_usuario, pass: cfg.smtp_senha } });
    await transporter.sendMail({
      from: `"${cfg.smtp_nome_remetente || "Grupo Lobo"}" <${cfg.smtp_remetente}>`,
      to: destino,
      subject: `[Grupo Lobo] SSW liberou o acesso da VPS ${ip}`,
      text: linhas.join("\n"),
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0a1119"><div style="max-width:560px;margin:24px auto;padding:24px;border:1px solid #e6ebf2;border-radius:12px"><h2 style="color:#12437f;margin:0 0 8px">Grupo Lobo</h2><p style="color:#15803d;font-weight:700;margin:0 0 12px">SSW liberou o acesso da VPS</p>${linhas.map((l) => (l ? `<p style="margin:0 0 8px;font-size:14px">${esc(l)}</p>` : "")).join("")}</div></body></html>`,
    });
    return json({ ok: true, enviado: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
