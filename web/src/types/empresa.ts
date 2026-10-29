export type Empresa = {
  id: string;
  cnpj: string | null;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  responsavel_email: string | null;
};

export type EmpresaFormData = {
  [K in Exclude<keyof Empresa, "id">]: string;
};

export type EmpresaChildKind = "setores" | "cargos" | "filiais";

export type EmpresaSetor = { id: string; empresa_id: string; nome: string };
export type EmpresaCargo = EmpresaSetor;

export type EmpresaFilial = {
  id: string;
  empresa_id: string;
  numero_filial: string | null;
  nome: string;
  sigla: string | null;
  localidade: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  responsavel_email: string | null;
};

export type EmpresaChild = EmpresaSetor | EmpresaCargo | EmpresaFilial;
