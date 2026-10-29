export type FaixaAtraso = "1 dia" | "2 a 3 dias" | "mais de 3 dias";

export type Atrasado = {
  ctrc: string;
  numero_nf: string | null;
  destinatario_nome: string | null;
  entrega_cidade: string | null;
  previsao_entrega: string | null;
  dias_atraso: number;
  faixa_atraso: FaixaAtraso;
  ultima_ocorrencia: string | null;
  ocorrencia_descricao: string | null;
  placa: string | null;
  localizacao_atual: string | null;
};

export type Agendamento = {
  ctrc: string;
  numero_nf: string | null;
  destinatario_nome: string | null;
  entrega_cidade: string | null;
  entrega_programada: string | null;
  previsao_entrega: string | null;
  romaneio: string | null;
  data_romaneio: string | null;
  placa: string | null;
  motorista: string | null;
  ocorrencia_codigo: string | null;
  ocorrencia_descricao: string | null;
  ocorrencia_data: string | null;
  tipo: "AGENDADA" | "AGUARDANDO_AGENDAMENTO";
};

/** Pendência = insucesso de entrega (recusa, local fechado, horário etc.). */
export type Pendencia = {
  romaneio: string | null;
  numero_nf: string | null;
  placa: string | null;
  motorista: string | null;
  ctrc: string;
  destinatario_nome: string | null;
  entrega_cidade: string | null;
  motivo_insucesso: string | null;
  ocorrencia_codigo: string | null;
  data_ocorrencia: string | null;
  aberta_no_ssw: boolean;
};

export type RomaneioResumo = {
  romaneio: string;
  placa: string | null;
  motorista: string | null;
  data_emissao: string | null;
  total_entregas: number;
  realizadas: number;
  pendentes: number;
  insucessos: number;
  agendadas: number;
  dpe_pct: number | null;
  status_romaneio: "ABERTO" | "FECHADO" | "CANCELADO";
};

export type Veiculo = {
  placa: string;
  motorista: string | null;
  romaneios_abertos: number;
  entregas_pendentes: number;
  insucessos: number;
  status_veiculo: "EM OPERACAO" | "DISPONIVEL";
};

/** DPE do mês corrente de uma placa (ssw_tracking.v_dpe_mes_placa). */
export type DpePlaca = { placa: string; entregues: number; no_prazo: number; dpe_pct: number | null };

export type DpeMes = { mes: string; entregues: number; no_prazo: number; dpe_pct: number };

export type PainelEntregas = {
  dpe: DpeMes[];
  atrasados: Atrasado[];
  agendamentos: Agendamento[];
  pendencias: Pendencia[];
  romaneios: RomaneioResumo[];
  veiculos: Veiculo[];
  /** Última carga bem-sucedida de cada fonte do SSW. */
  cargas: { romaneios036: string | null; conhecimentos455: string | null };
};

/** Um conhecimento dentro de um romaneio (ssw_tracking.v_entregas_status). */
export type EntregaVeiculo = {
  romaneio: string | null;
  placa: string | null;
  motorista: string | null;
  ctrc: string;
  data_emissao: string | null;
  prev_entrega: string | null;
  destinatario_nome: string | null;
  entrega_cidade: string | null;
  entrega_bairro: string | null;
  ocorrencia_rom_descricao: string | null;
  ocorrencia_rom_codigo: string | null;
  ocorrencia_ctrc_descricao: string | null;
  ocorrencia_ctrc_codigo: string | null;
  aberta_no_ssw: boolean;
  status_entrega: "REALIZADA" | "PENDENTE" | "INSUCESSO" | "CANCELADA";
  agendamento: "AGENDADA" | "AGUARDANDO_AGENDAMENTO" | null;
  data_entrega: string | null;
  motivo_insucesso: string | null;
};
