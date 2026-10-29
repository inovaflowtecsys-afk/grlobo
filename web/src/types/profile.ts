import type { ModuloAcesso } from "../lib/modulos";

export type TipoUsuario = "ADMINISTRADOR" | "USUARIO";

export type Profile = {
  id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  cargo: string | null;
  tipo_usuario: TipoUsuario;
  modulos_acesso: ModuloAcesso | null;
  administrador: boolean;
  ativo: boolean;
  senha_provisoria: boolean;
  filial_id: string | null;
  filial: { id: string; nome: string; sigla: string | null; localidade: string | null } | null;
  setor: { id: string; nome: string } | null;
  created_at: string;
  updated_at: string;
};
