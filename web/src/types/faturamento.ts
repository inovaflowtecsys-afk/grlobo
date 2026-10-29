export type SituacaoFinanceira = "PENDENTE_FATURAMENTO" | "FATURADO" | "ATRASADO" | "CONCLUIDO" | "CANCELADO" | "SEM_INFORMACAO";

export type FaturamentoDia = {
  dia: string;
  qtd_cte: number;
  valor_frete: number;
  acumulado_mes: number;
};

export type FaturamentoMes = {
  mes: string;
  qtd_cte: number;
  valor_frete: number;
};

export type FaturasVencidasCliente = {
  cliente: string;
  cnpj: string | null;
  qtd_faturas: number;
  valor_total: number;
};

export type FaixaAtraso = { faixa: string; qtd: number; valor: number };

export type FaturasVencidas = { clientes: FaturasVencidasCliente[]; faixas: FaixaAtraso[] };

export type InadimplenciaMes = { mes: string; qtd: number; qtdVencida: number; faturado: number; vencido: number; pct: number };

export type TicketMes = { mes: string; qtd_cte: number; valor: number; clientes: number; ticketCte: number; ticketCliente: number };

export type FaturamentoDiaCliente = {
  cliente: string;
  cnpj: string | null;
  qtd_cte: number;
  valor_frete: number;
};

export type FaturamentoSituacao = {
  qtdCteEmitidos: number;
  valorCteEmitido: number;
  qtdAFaturar: number;
  valorAFaturar: number;
  qtdFaturado: number;
  valorFaturado: number;
  qtdAtrasado: number;
  valorAtrasado: number;
  qtdLiquidado: number;
  valorLiquidado: number;
  qtdSemInformacao: number;
};

export type FaturaItem = {
  dominio: string;
  chave_linha: string;
  fatura: string | null;
  cliente: string | null;
  cnpj_cliente: string | null;
  emissao: string | null;
  vencimento: string | null;
  pagamento: string | null;
  situacao: string | null;
  dias_atraso: number | null;
  qtd_ctrcs: number | null;
  valor_fatura: number | null;
  valor_pago: number | null;
  saldo: number | null;
};

export type CtrcFinanceiroItem = {
  dominio: string;
  ctrc: string | null;
  cte: string | null;
  data_autorizacao: string | null;
  tipo_conhecimento: string | null;
  rota: string | null;
  unidade_origem: string | null;
  unidade_destino: string | null;
  pagador_nome: string | null;
  pagador_cnpj: string | null;
  valor_frete: number | null;
  data_entrega: string | null;
  situacao_financeira: SituacaoFinanceira;
  fatura: string | null;
  fatura_emissao: string | null;
  fatura_vencimento: string | null;
  fatura_situacao: string | null;
  fatura_saldo: number | null;
  valor_fatura: number | null;
  valor_a_faturar: number | null;
  dias_atraso: number | null;
  tipo_baixa: string | null;
  data_liquidacao: string | null;
  valor_liquidado: number | null;
  forma_liquidacao: string | null;
  data_credito_caixa: string | null;
};

export type FaturasQuery = { page: number; pageSize: number; de: string; ate: string; cliente: string; fatura: string; situacao: string };
export type CtrcsFinanceiroQuery = { page: number; pageSize: number; de: string; ate: string; cliente: string; numero: string; situacao: string };
export type Paginado<T> = { data: T[]; count: number };
export type Atualizacao = { texto: string; atualizado_em: string | null };

export type ResumoSituacao = Record<string, { qtd: number; valor: number }>;

export type FaturaDetalheRow = {
  dominio: string;
  chave_linha: string;
  dados: Record<string, unknown> | null;
  fatura: string | null;
  cnpj_cliente: string | null;
  cliente: string | null;
  abc: string | null;
  vendedor: string | null;
  tipo_cobranca: string | null;
  banco_carteira: string | null;
  agencia_conta: string | null;
  periodicidade: string | null;
  email_cobranca: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  uf: string | null;
  cidade: string | null;
  filial: string | null;
  emissao: string | null;
  vencimento: string | null;
  cancelamento: string | null;
  pagamento: string | null;
  data_credito_caixa: string | null;
  dias_atraso: number | null;
  situacao: string | null;
  protestada_cartorio: string | null;
  spc_serasa: string | null;
  prorrogada: string | null;
  valor_fatura: number | null;
  juros: number | null;
  desconto: number | null;
  pagamento_parcial: number | null;
  valor_pago: number | null;
  saldo: number | null;
  tipo_baixa: string | null;
  nro_titulo_banco: string | null;
  unidade_responsavel: string | null;
  qtd_ctrcs: number | null;
  ctrcs_json: Array<{ ctrc?: string | null; cte?: string | null; data_emissao?: string | null; data_autorizacao?: string | null; valor_frete?: number | string | null }> | null;
};
