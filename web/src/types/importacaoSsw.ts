export type TipoImportacao = "036" | "455" | "441" | "411" | "435" | "desconhecido" | "ambiguo";
export type StatusImportacao = "validado" | "recusado" | "importado" | "erro";

/** Linha de public.ssw_importacoes (log de validação e importação manual). */
export type Importacao = {
  id: string;
  criado_em: string;
  atualizado_em: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  nome_arquivo: string;
  tamanho_bytes: number | null;
  hash_sha256: string;
  tipo: TipoImportacao;
  tipo_informado: string | null;
  status: StatusImportacao;
  motivo: string | null;
  referencia: string | null;
  sequencia: string | null;
  linhas: number | null;
  novos: number | null;
  atualizados: number | null;
  iguais: number | null;
  cabecalho: string[] | null;
  avisos: string[] | null;
  autorizado_em: string | null;
  importado_em: string | null;
  origem: "manual" | "automatica";
};

/** Linha única de public.ssw_importacao_config: botão de ligar/desligar da importação automática (extensão do navegador). */
export type ConfigAutomatica = {
  ativo: boolean;
  tipos_permitidos: string[];
  limite_por_hora: number;
  atualizado_em: string;
  atualizado_por: string | null;
};

export const ROTULO_TIPO_IMPORTACAO: Record<string, string> = {
  "036": "SSW 036 · romaneios e CTRCs de entrega",
  "455": "SSW 455 · fretes expedidos/recebidos",
  "441": "Financeiro 441 · faturas e CTRCs",
  "411": "Financeiro 411 · CTRCs liquidados",
  "435": "Financeiro 435 · CTRCs a faturar",
  desconhecido: "Não reconhecido",
  ambiguo: "Ambíguo",
};

/** Tipos que o usuário pode escolher ao corrigir o reconhecimento. */
export const TIPOS_ESCOLHA: { valor: string; rotulo: string }[] = [
  { valor: "auto", rotulo: "Reconhecer automaticamente" },
  { valor: "036", rotulo: "036 · romaneios" },
  { valor: "455", rotulo: "455 · fretes" },
  { valor: "441", rotulo: "441 · faturas" },
  { valor: "411", rotulo: "411 · liquidados" },
];
