import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient, json, options } from "../_shared/profissionais.ts";
import { codigoRecente, criarCodigo, descartarCodigo, enviarCodigoEmail } from "../_shared/senha_codigo.ts";

// A resposta é sempre a mesma, exista o e-mail ou não, para não revelar quem tem cadastro.
const MENSAGEM = "Se o e-mail estiver cadastrado, enviaremos um código de verificação.";

serve(async (request) => {
  if (request.method === "OPTIONS") return options();

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Informe o e-mail." }, 400);

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id,nome,email,ativo,deleted_at")
      .eq("email", email)
      .maybeSingle();

    if (!profile || profile.deleted_at || !profile.ativo) return json({ message: MENSAGEM });
    if (await codigoRecente(admin, profile.id)) return json({ message: MENSAGEM });

    const novo = await criarCodigo(admin, profile.id, "esqueci");
    try {
      await enviarCodigoEmail(admin, { email: profile.email, nome: profile.nome, codigo: novo.codigo, motivo: "esqueci", validadeMinutos: novo.validadeMinutos });
    } catch (error) {
      await descartarCodigo(admin, novo.id);
      console.error("falha ao enviar codigo:", error instanceof Error ? error.message : error);
      return json({ error: "Não foi possível enviar o e-mail agora. Tente novamente em instantes." }, 500);
    }

    return json({ message: MENSAGEM });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
