import nodemailer from "npm:nodemailer@6.9.15";

export type Motivo = "novo" | "reset" | "esqueci";

// "esqueci" é pedido pelo próprio usuário (curto); "novo" e "reset" são enviados por um administrador e podem ser lidos no dia seguinte.
const VALIDADE_MINUTOS: Record<Motivo, number> = { esqueci: 15, novo: 24 * 60, reset: 24 * 60 };
const MAX_TENTATIVAS = 5;
const INTERVALO_MINIMO_SEGUNDOS = 60;

type AdminClient = any;

export function gerarCodigo() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

export function gerarSenhaAleatoria() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

async function hashCodigo(userId: string, codigo: string) {
  const bytes = new TextEncoder().encode(`${userId}:${codigo}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Já existe um código recente para este usuário? Evita disparar vários e-mails em sequência. */
export async function codigoRecente(admin: AdminClient, userId: string) {
  const desde = new Date(Date.now() - INTERVALO_MINIMO_SEGUNDOS * 1000).toISOString();
  const { data } = await admin.from("senha_codigos").select("id").eq("user_id", userId).gte("created_at", desde).limit(1);
  return Boolean(data?.length);
}

/** Invalida os códigos anteriores ainda abertos e grava um novo (somente o hash). */
export async function criarCodigo(admin: AdminClient, userId: string, motivo: Motivo) {
  const codigo = gerarCodigo();
  await admin.from("senha_codigos").update({ usado_em: new Date().toISOString() }).eq("user_id", userId).is("usado_em", null);

  const { data, error } = await admin
    .from("senha_codigos")
    .insert({
      user_id: userId,
      codigo_hash: await hashCodigo(userId, codigo),
      motivo,
      expira_em: new Date(Date.now() + VALIDADE_MINUTOS[motivo] * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { id: data.id as string, codigo, validadeMinutos: VALIDADE_MINUTOS[motivo] };
}

export async function descartarCodigo(admin: AdminClient, id: string) {
  await admin.from("senha_codigos").delete().eq("id", id);
}

/** Confere o código informado; conta tentativas erradas e bloqueia o código após o limite. */
export async function validarCodigo(admin: AdminClient, userId: string, codigo: string) {
  const { data: registro } = await admin
    .from("senha_codigos")
    .select("id,codigo_hash,tentativas")
    .eq("user_id", userId)
    .is("usado_em", null)
    .gt("expira_em", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!registro || registro.tentativas >= MAX_TENTATIVAS) return null;

  if (!iguais(registro.codigo_hash, await hashCodigo(userId, codigo))) {
    await admin.from("senha_codigos").update({ tentativas: registro.tentativas + 1 }).eq("id", registro.id);
    return null;
  }
  return registro.id as string;
}

export async function consumirCodigo(admin: AdminClient, id: string) {
  await admin.from("senha_codigos").update({ usado_em: new Date().toISOString() }).eq("id", id);
}

const ASSUNTOS: Record<Motivo, string> = {
  novo: "Grupo Lobo - Seu acesso foi criado",
  reset: "Grupo Lobo - Redefinição de senha",
  esqueci: "Grupo Lobo - Código para recuperar a senha",
};

const INTRODUCOES: Record<Motivo, string> = {
  novo: "Seu acesso ao sistema de Gestão de KPIs do Grupo Lobo foi criado. Use o código abaixo como senha provisória no seu primeiro acesso.",
  reset: "Um administrador solicitou a redefinição da sua senha. Use o código abaixo como senha provisória para entrar.",
  esqueci: "Recebemos um pedido de recuperação de senha para o seu usuário. Use o código abaixo como senha provisória para entrar.",
};

export async function enviarCodigoEmail(
  admin: AdminClient,
  dados: { email: string; nome?: string | null; codigo: string; motivo: Motivo; validadeMinutos: number },
) {
  const { data: cfg, error } = await admin
    .from("configuracao_email")
    .select("smtp_host,smtp_porta,smtp_usuario,smtp_senha,smtp_ssl,smtp_remetente,smtp_nome_remetente,app_url")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cfg) throw new Error("Configuração de e-mail não encontrada.");

  const transporter = nodemailer.createTransport({
    host: cfg.smtp_host,
    port: Number(cfg.smtp_porta),
    secure: Boolean(cfg.smtp_ssl),
    auth: { user: cfg.smtp_usuario, pass: cfg.smtp_senha },
  });

  const nome = dados.nome || dados.email;
  const validade = dados.validadeMinutos >= 60 ? `${Math.round(dados.validadeMinutos / 60)} hora(s)` : `${dados.validadeMinutos} minutos`;
  const appUrl = String(cfg.app_url || Deno.env.get("APP_URL") || "").trim().replace(/\/$/, "");
  const loginUrl = appUrl ? `${appUrl}/login` : "";
  const instrucao = "informe seu e-mail e digite o código no campo Senha. Em seguida você definirá a sua nova senha.";
  const passo = loginUrl ? `Acesse ${loginUrl}, ${instrucao}` : `Na tela de login do sistema, ${instrucao}`;

  const text = [
    `Olá, ${nome}.`,
    "",
    INTRODUCOES[dados.motivo],
    "",
    `Código: ${dados.codigo}`,
    `Validade: ${validade}. O código só pode ser usado uma vez.`,
    "",
    passo,
    "",
    "Se você não reconhece este pedido, ignore este e-mail: sua senha atual não foi alterada.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#0a1119">
  <div style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e6ebf2">
    <h2 style="margin:0 0 16px 0;color:#12437f">Grupo Lobo</h2>
    <p style="margin:0 0 12px 0">Olá, <strong>${escapeHtml(nome)}</strong>.</p>
    <p style="margin:0 0 20px 0">${escapeHtml(INTRODUCOES[dados.motivo])}</p>
    <div style="text-align:center;margin:0 0 20px 0">
      <div style="display:inline-block;background:#f4f6f9;border:1px solid #11a4de;border-radius:10px;padding:14px 28px;font-size:32px;font-weight:700;letter-spacing:8px;color:#12437f">${escapeHtml(dados.codigo)}</div>
    </div>
    <p style="margin:0 0 12px 0;font-size:14px">Validade: <strong>${escapeHtml(validade)}</strong>. O código só pode ser usado uma vez.</p>
    <p style="margin:0 0 16px 0;font-size:14px">${loginUrl ? `Acesse <a href="${escapeHtml(loginUrl)}" style="color:#12437f;font-weight:700">${escapeHtml(loginUrl)}</a>, ${escapeHtml(instrucao)}` : escapeHtml(passo)}</p>
    <p style="margin:0;font-size:12px;color:#4b535d">Se você não reconhece este pedido, ignore este e-mail: sua senha atual não foi alterada.</p>
  </div>
</body></html>`;

  await transporter.sendMail({
    from: `"${cfg.smtp_nome_remetente || "Grupo Lobo"}" <${cfg.smtp_remetente}>`,
    to: dados.email,
    subject: ASSUNTOS[dados.motivo],
    text,
    html,
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
