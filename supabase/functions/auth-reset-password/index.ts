import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient, json, options } from "../_shared/profissionais.ts";
import { consumirCodigo, validarCodigo } from "../_shared/senha_codigo.ts";

const CODIGO_INVALIDO = "Código inválido ou expirado. Solicite um novo código.";

serve(async (request) => {
  if (request.method === "OPTIONS") return options();

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const codigo = String(body.codigo || "").replace(/\D/g, "");
    const novaSenha = String(body.nova_senha ?? "");

    if (!email || codigo.length !== 6) return json({ error: CODIGO_INVALIDO }, 400);
    if (novaSenha.length < 6) return json({ error: "A senha deve ter pelo menos 6 caracteres." }, 400);
    if (novaSenha.trim() !== novaSenha) return json({ error: "A senha não deve iniciar ou terminar com espaços." }, 400);

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id,ativo,deleted_at")
      .eq("email", email)
      .maybeSingle();

    // mesma resposta para e-mail inexistente, inativo ou código errado
    if (!profile || profile.deleted_at || !profile.ativo) return json({ error: CODIGO_INVALIDO }, 400);

    const codigoId = await validarCodigo(admin, profile.id, codigo);
    if (!codigoId) return json({ error: CODIGO_INVALIDO }, 400);

    const { error: authError } = await admin.auth.admin.updateUserById(profile.id, { password: novaSenha });
    if (authError) return json({ error: authError.message }, 400);

    await consumirCodigo(admin, codigoId);
    await admin.from("profiles").update({ senha_provisoria: false }).eq("id", profile.id);

    return json({ message: "Senha definida com sucesso. Entre com a nova senha." });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
