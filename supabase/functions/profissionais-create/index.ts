import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient, json, options, parseModulosAcesso, parseTipoUsuario, requireAdmin } from "../_shared/profissionais.ts";
import { criarCodigo, enviarCodigoEmail, gerarSenhaAleatoria } from "../_shared/senha_codigo.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") return options();

  try {
    const adminClient = getAdminClient();
    const auth = await requireAdmin(request, adminClient);
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const nome = String(body.nome || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const filialId = body.filial_id ? String(body.filial_id) : null;
    const cargoId = body.cargo_id ? String(body.cargo_id) : null;
    const setorId = body.setor_id ? String(body.setor_id) : null;
    const avatarUrl = body.avatar_url ? String(body.avatar_url).trim() : null;
    const tipoUsuario = parseTipoUsuario(body.tipo_usuario);

    if (!nome || !email) return json({ error: "Nome e email sao obrigatorios." }, 400);

    const { data: cargo } = cargoId
      ? await adminClient.from("empresa_cargos").select("nome").eq("id", cargoId).maybeSingle()
      : { data: null };

    // O usuário nasce com uma senha aleatória que ninguém conhece; o acesso é liberado pelo código enviado por e-mail.
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: gerarSenhaAleatoria(),
      email_confirm: true,
      user_metadata: { full_name: nome },
    });

    if (createError || !created.user) {
      const jaExiste = /already|registered|exists/i.test(createError?.message || "");
      return json({ error: jaExiste ? "Ja existe um usuario com este email." : createError?.message || "Nao foi possivel criar o usuario." }, 400);
    }

    // Qualquer falha a partir daqui desfaz o usuário (profiles e códigos saem junto, por cascade).
    const desfazer = () => adminClient.auth.admin.deleteUser(created.user.id);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: created.user.id,
        empresa_id: auth.profile.empresa_id,
        filial_id: filialId,
        nome,
        email,
        cargo_id: cargoId,
        setor_id: setorId,
        avatar_url: avatarUrl,
        cargo: cargo?.nome || null,
        tipo_usuario: tipoUsuario,
        modulos_acesso: parseModulosAcesso(body.modulos_acesso),
        administrador: tipoUsuario === "ADMINISTRADOR",
        ativo: true,
        senha_provisoria: false,
        deleted_at: null,
      })
      .select("id,codigo")
      .single();

    if (profileError) {
      await desfazer();
      return json({ error: profileError.message }, 400);
    }

    try {
      const novo = await criarCodigo(adminClient, created.user.id, "novo");
      await enviarCodigoEmail(adminClient, { email, nome, codigo: novo.codigo, motivo: "novo", validadeMinutos: novo.validadeMinutos });
    } catch (error) {
      await desfazer();
      console.error("falha ao enviar codigo:", error instanceof Error ? error.message : error);
      return json({ error: "Nao foi possivel enviar o e-mail com o codigo. O profissional nao foi cadastrado." }, 500);
    }

    return json({ id: profile.id, codigo: profile.codigo, email_enviado: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
