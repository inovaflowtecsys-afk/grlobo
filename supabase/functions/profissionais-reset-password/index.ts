import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient, json, options, requireAdmin } from "../_shared/profissionais.ts";
import { criarCodigo, descartarCodigo, enviarCodigoEmail, gerarSenhaAleatoria } from "../_shared/senha_codigo.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") return options();

  try {
    const adminClient = getAdminClient();
    const auth = await requireAdmin(request, adminClient);
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return json({ error: "Id do profissional e obrigatorio." }, 400);

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id,nome,email,deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (targetError || !target || target.deleted_at) return json({ error: "Profissional nao encontrado." }, 404);

    // 1) envia o código; se o e-mail falhar nada muda e o usuário continua com a senha atual
    const novo = await criarCodigo(adminClient, id, "reset");
    try {
      await enviarCodigoEmail(adminClient, { email: target.email, nome: target.nome, codigo: novo.codigo, motivo: "reset", validadeMinutos: novo.validadeMinutos });
    } catch (error) {
      await descartarCodigo(adminClient, novo.id);
      console.error("falha ao enviar codigo:", error instanceof Error ? error.message : error);
      return json({ error: "Nao foi possivel enviar o e-mail com o codigo. A senha nao foi alterada." }, 500);
    }

    // 2) invalida a senha atual: a partir daqui o acesso só volta com o código
    const { error: authError } = await adminClient.auth.admin.updateUserById(id, { password: gerarSenhaAleatoria() });
    if (authError) return json({ error: authError.message }, 400);

    await adminClient.from("profiles").update({ senha_provisoria: false }).eq("id", id);

    return json({ id, email_enviado: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
