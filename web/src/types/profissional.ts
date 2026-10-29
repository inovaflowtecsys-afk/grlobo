import type { ModuloAcesso } from "../lib/modulos";

export type TipoUsuario = "ADMINISTRADOR" | "USUARIO";
export type ProfissionalStatus = "ativo" | "inativo" | "todos";

export type Referencia = { id: string; nome: string };
export type Filial = Referencia & { sigla: string | null; localidade: string | null };

export type ProfissionalListItem = {
  id: string;
  codigo: number | null;
  filial_id: string | null;
  cargo_id: string | null;
  setor_id: string | null;
  nome: string;
  email: string;
  avatar_url: string | null;
  tipo_usuario: TipoUsuario;
  modulos_acesso: ModuloAcesso | null;
  ativo: boolean;
  senha_provisoria: boolean;
  created_at: string;
  filial: Filial | null;
  cargo_ref: Referencia | null;
  setor_ref: Referencia | null;
};

export type ProfissionalFormData = {
  nome: string;
  email: string;
  avatar_url: string;
  setor_id: string;
  cargo_id: string;
  filial_id: string;
  tipo_usuario: TipoUsuario;
  modulos_acesso: ModuloAcesso;
  ativo: boolean;
};

export type ProfissionaisQuery = {
  page: number;
  pageSize: number;
  search: string;
  filialId: string;
  status: ProfissionalStatus;
  sortBy: "codigo" | "nome" | "email" | "ativo" | "tipo_usuario";
  sortDirection: "asc" | "desc";
};
