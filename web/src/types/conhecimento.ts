export type StatusEntrega = "EM_ABERTO" | "ENTREGUE" | "CANCELADO";

/** Status mostrado na tela: o "em aberto" com ocorrência de insucesso vira INSUCESSO. */
export type StatusExibido = StatusEntrega | "INSUCESSO";

/** Ocorrências de insucesso de entrega do SSW (mesma regra do painel de Entregas). */
export const OCORRENCIAS_INSUCESSO = ["5", "11", "13", "38", "52"] as const;
export type SituacaoPrazo = "NO_PRAZO" | "ATRASADO";

export type ConhecimentoListItem = {
  dominio: string;
  chave_linha: string;
  ctrc: string | null;
  cte: string | null;
  chave_cte: string | null;
  tipo_conhecimento: string | null;
  data_autorizacao: string | null;
  remetente_nome: string | null;
  remetente_cnpj: string | null;
  destinatario_nome: string | null;
  destinatario_cnpj: string | null;
  entrega_cidade: string | null;
  entrega_uf: string | null;
  numero_nf: string | null;
  volumes: number | null;
  peso_real_kg: number | null;
  valor_frete: number | null;
  previsao_entrega: string | null;
  entrega_programada: string | null;
  data_entrega: string | null;
  data_cancelamento: string | null;
  unidade_origem: string | null;
  unidade_destino: string | null;
  rota: string | null;
  localizacao_atual: string | null;
  atualizado_em: string;
  agendado: boolean;
  status_entrega: StatusEntrega;
  situacao_prazo: SituacaoPrazo | null;
  dias_atraso: number | null;
  ocorrencia_codigo: string | null;
  ocorrencia_descricao: string | null;
  ocorrencia_data: string | null;
  ocorrencia_unidade: string | null;
  qtd_notas: number | null;
  placa_entrega: string | null;
};

export type NotaFiscal = { nota: string; serie: string | null; numero: string; chave: string | null };

export type ConhecimentosQuery = {
  page: number;
  pageSize: number;
  /** Número do CTRC, CT-e, nota fiscal ou chave. Quando preenchido, o período é ignorado. */
  busca: string;
  de: string;
  ate: string;
  remetente: string;
  destinatario: string;
  status: "" | StatusExibido;
  prazo: "" | SituacaoPrazo;
  agendamento: "" | "sim" | "nao";
  sortBy: "data_autorizacao" | "ctrc" | "previsao_entrega";
  sortDirection: "asc" | "desc";
};
