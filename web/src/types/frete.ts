export type FretePago = "todos" | "pago" | "pendente";

export type FreteMotorista = {
  id: string;
  nome: string;
  cpf: string | null;
};

export type FreteListItem = {
  id: string;
  data_registro: string;
  motorista_id: string;
  valor_frete: number;
  valor_chapa: number;
  valor_descarga: number;
  valor_adicional: number;
  observacao: string | null;
  pago: boolean;
  data_pagamento: string | null;
  nota_fiscal: string | null;
  created_at: string;
  motorista: { id: string; nome: string } | null;
};

export type FreteFormData = {
  data_registro: string; // valor de <input type="datetime-local">
  motorista_id: string;
  valor_frete: string;
  valor_chapa: string;
  valor_descarga: string;
  valor_adicional: string;
  observacao: string;
  pago: boolean;
  nota_fiscal: string;
};

export type FretesQuery = {
  page: number;
  pageSize: number;
  motoristaId: string;
  de: string;
  ate: string;
  notaFiscal: string;
  pago: FretePago;
  sortBy: "data_registro" | "valor_frete" | "pago" | "nota_fiscal";
  sortDirection: "asc" | "desc";
};

export type FreteLogItem = {
  id: number;
  entidade: "FRETE" | "MOTORISTA";
  registro_id: string;
  acao: "INSERIU" | "EDITOU" | "PAGOU" | "EXCLUIU";
  usuario_nome: string | null;
  em: string;
  detalhes: Record<string, unknown> | null;
};
