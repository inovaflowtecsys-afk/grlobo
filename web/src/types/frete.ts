export type FretePago = "todos" | "pago" | "pendente";

export type FreteMotorista = {
  id: string;
  nome: string;
  cpf: string | null;
};

export const TIPOS_FROTA = ["FURGAO", "TRUCK", "3/4", "VAN", "FURGAO LEVE", "OUTROS", "TOCO", "CAVALO", "CARRETA", "CAVALO TRUCADO"] as const;
export type TipoFrota = (typeof TIPOS_FROTA)[number];

export type FreteFrota = {
  id: string;
  placa: string;
  tipo: TipoFrota;
};

export type FreteListItem = {
  id: string;
  data_registro: string;
  motorista_id: string;
  frota_id: string | null;
  frota: { id: string; placa: string; tipo: string } | null;
  valor_frete_carga: number;
  valor_frete: number;
  valor_coleta: number;
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
  frota_id: string;
  valor_frete_carga: string;
  valor_frete: string;
  valor_coleta: string;
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
  /** Placa (ou parte dela), já normalizada. */
  placa: string;
  pago: FretePago;
  sortBy: "data_registro" | "valor_frete" | "pago" | "nota_fiscal";
  sortDirection: "asc" | "desc";
};

export type FreteLogItem = {
  id: number;
  entidade: "FRETE" | "MOTORISTA" | "PLACA";
  registro_id: string;
  acao: "INSERIU" | "EDITOU" | "PAGOU" | "EXCLUIU";
  usuario_nome: string | null;
  em: string;
  detalhes: Record<string, unknown> | null;
};
