import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient, json, options } from "../_shared/profissionais.ts";
import { consumirCodigo, gerarSenhaAleatoria, validarCodigo } from "../_shared/senha_codigo.ts";

const INVALIDO = "E-mail ou senha inválidos.";

// O código recebido por e-mail funciona como senha provisória na tela de login.
// Validado o código, a conta passa a ter uma senha temporária aleatória, devolvida só a quem provou ter o código;
// o app entra com ela e exige a troca antes de liberar o sistema (profiles.senha_provisoria = true).
serve(async (request) => {
  if (request.method === "OPTIONS") return options();

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const codigo = String(body.codigo || "").replace(/\D/g, "");
    if (!email || codigo.length !== 6) return json({ error: INVALIDO }, 400);

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id,ativo,deleted_at")
      .eq("email", email)
      .maybeSingle();
    if (!profile || profile.deleted_at || !profile.ativo) return json({ error: INVALIDO }, 400);

    const codigoId = await validarCodigo(admin, profile.id, codigo);
    if (!codigoId) return json({ error: INVALIDO }, 400);

    const senhaTemporaria = gerarSenhaAleatoria();
    const { error: authError } = await admin.auth.admin.updateUserById(profile.id, { password: senhaTemporaria });
    if (authError) return json({ error: authError.message }, 400);

    await consumirCodigo(admin, codigoId);
    await admin.from("profiles").update({ senha_provisoria: true }).eq("id", profile.id);

    return json({ senha_temporaria: senhaTemporaria });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
