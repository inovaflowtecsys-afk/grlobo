import { supabase } from "../lib/supabase";
import type { Profile } from "../types/profile";

const PROFILE_SELECT =
  "id,nome,email,avatar_url,cargo,tipo_usuario,modulos_acesso,administrador,ativo,senha_provisoria,filial_id,created_at,updated_at," +
  "filial:empresa_filiais(id,nome,sigla,localidade),setor:empresa_setores(id,nome)";

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Profile | null;
}
