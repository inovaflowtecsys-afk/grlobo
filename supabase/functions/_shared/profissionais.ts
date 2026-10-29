import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function options() {
  return new Response("ok", { headers: corsHeaders });
}

export function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service role nao configurada.");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAnonClient(authorization: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) throw new Error("Supabase anon key nao configurada.");

  return createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
}

// verify_jwt fica desligado no deploy; a sessao e o perfil de administrador sao validados aqui.
export async function requireAdmin(request: Request, adminClient: ReturnType<typeof getAdminClient>) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return { error: json({ error: "Sessao nao encontrada." }, 401) };

  const { data: userData, error: userError } = await getAnonClient(authorization).auth.getUser();
  if (userError || !userData.user) return { error: json({ error: "Sessao invalida." }, 401) };

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,empresa_id,administrador,tipo_usuario,ativo,deleted_at")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.deleted_at || !profile.ativo) {
    return { error: json({ error: "Perfil sem acesso." }, 403) };
  }
  if (!(profile.administrador || profile.tipo_usuario === "ADMINISTRADOR")) {
    return { error: json({ error: "Acesso restrito a administradores." }, 403) };
  }

  return { user: userData.user, profile };
}

export function parseTipoUsuario(value: unknown) {
  return value === "ADMINISTRADOR" ? "ADMINISTRADOR" : "USUARIO";
}

const MODULOS = ["dashboard", "conhecimentos", "entregas", "faturamento", "empresa", "profissionais"];

/** Só guarda as chaves conhecidas, com valor booleano (true = modulo liberado). */
export function parseModulosAcesso(value: unknown) {
  const origem = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(MODULOS.map((m) => [m, origem[m] === true]));
}
