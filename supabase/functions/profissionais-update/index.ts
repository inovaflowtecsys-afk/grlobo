import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient, json, options, parseModulosAcesso, parseTipoUsuario, requireAdmin } from "../_shared/profissionais.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") return options();

  try {
    const adminClient = getAdminClient();
    const auth = await requireAdmin(request, adminClient);
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const id = String(body.id || "");
    const nome = String(body.nome || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const filialId = body.filial_id ? String(body.filial_id) : null;
    const cargoId = body.cargo_id ? String(body.cargo_id) : null;
    const setorId = body.setor_id ? String(body.setor_id) : null;
    const avatarUrl = body.avatar_url ? String(body.avatar_url).trim() : null;
    const tipoUsuario = parseTipoUsuario(body.tipo_usuario);
    const ativo = Boolean(body.ativo);

    if (!id || !nome || !email) return json({ error: "Id, nome e email sao obrigatorios." }, 400);

    // O administrador nao pode se desativar, mas pode transformar o proprio perfil em usuario.
    if (id === auth.user.id && !ativo) {
      return json({ error: "Voce nao pode desativar o proprio usuario." }, 400);
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id,email,deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (targetError || !target || target.deleted_at) return json({ error: "Profissional nao encontrado." }, 404);

    const { data: cargo } = cargoId
      ? await adminClient.from("empresa_cargos").select("nome").eq("id", cargoId).maybeSingle()
      : { data: null };

    // E-mail já usado por outro profissional: avisa antes de tocar no Auth.
    const { data: emUso } = await adminClient.from("profiles").select("id").eq("email", email).neq("id", id).is("deleted_at", null).limit(1);
    if (emUso?.length) return json({ error: "Ja existe um profissional com este email." }, 400);

    // email_confirm: a troca vale na hora, sem exigir confirmação por e-mail (quem altera é o administrador).
    const { error: authError } = await adminClient.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
      user_metadata: { full_name: nome },
    });
    if (authError) {
      const duplicado = (authError as { code?: string }).code === "email_exists" || /already|registered|exists/i.test(authError.message);
      return json({ error: duplicado ? "Ja existe um usuario com este email." : authError.message }, 400);
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        nome,
        email,
        cargo_id: cargoId,
        setor_id: setorId,
        avatar_url: avatarUrl,
        cargo: cargo?.nome || null,
        filial_id: filialId,
        tipo_usuario: tipoUsuario,
        modulos_acesso: parseModulosAcesso(body.modulos_acesso),
        administrador: tipoUsuario === "ADMINISTRADOR",
        ativo,
      })
      .eq("id", id);

    if (profileError) {
      // desfaz o email no Auth para nao divergir de profiles
      if (target.email && target.email !== email) await adminClient.auth.admin.updateUserById(id, { email: target.email });
      return json({ error: profileError.message }, 400);
    }

    return json({ id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
