import { formatCep, formatCnpj, formatPhone, onlyDigits } from "./empresaValidation";

// Os valores do 455 chegam como texto do SSW: datas "19/10/26", números "1.234,56" etc.

const DATA_RE = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s|$)/;
const NUMERO_BR_RE = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/;

/** "19/10/26" -> "19/10/2026". Texto que não é data volta sem alteração. */
export function dataBR(valor?: string | null) {
  const texto = (valor ?? "").trim();
  const m = texto.match(DATA_RE);
  if (!m) return texto;
  return `${m[1]}/${m[2]}/${m[3].length === 2 ? `20${m[3]}` : m[3]}`;
}

/** "19/10/26" -> "2026-10-19" (para comparar e calcular dias). */
export function dataISO(valor?: string | null) {
  const m = (valor ?? "").trim().match(DATA_RE);
  if (!m) return null;
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`;
}

/** Dias de `de` até `para` (positivo quando `para` é depois). Datas ISO, sem efeito de fuso. */
export function diasEntre(de: string, para: string) {
  const [y1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = para.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export const plural = (n: number, singular: string, pluralTexto: string) => `${n} ${Math.abs(n) === 1 ? singular : pluralTexto}`;

export const ehNumeroBR = (v: string) => NUMERO_BR_RE.test(v.trim());

// "1134,39" -> "R$ 1.134,39"
export const moeda = (v?: string | null) => {
  const texto = (v ?? "").trim();
  if (!texto) return "-";
  if (!ehNumeroBR(texto)) return texto;
  const numero = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? `R$ ${numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `R$ ${texto}`;
};
export const kg = (v?: string | null) => (v && ehNumeroBR(v) ? `${v.trim()} kg` : v?.trim() || "-");
export const cnpjCpf = (v?: string | null) => {
  const d = onlyDigits(v ?? "");
  return d.length === 14 ? formatCnpj(d) : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : (v ?? "").trim() || "-";
};
export const telefone = (v?: string | null) => {
  const d = onlyDigits(v ?? "");
  return d.length >= 10 ? formatPhone(d) : (v ?? "").trim() || "";
};

const CHAVES_MOEDA = /^(valor_(?!da_mercadoria$)|frete_|adicional_|base_calculo|imposto_|gris$|cat$|tde$|tda$|tdc$|trt$|tar$|tas$|rdc$|itr$|pos$|pedagio$|despacho$|coleta$|capatazia$|separacao$|paletizacao$|outros$|suframa$|reembolso$|redespacho_|seguro_|dev_canhoto_nf$|agendamento$)/;

/** Aplica formato brasileiro ao valor cru de um campo do 455, conforme o tipo de campo. */
export function formatarCampo(chave: string, bruto: string) {
  const valor = String(bruto ?? "").trim();
  if (!valor) return "";
  if (/^(data_|previsao_de_entrega$|entrega_programada$)/.test(chave) || DATA_RE.test(valor)) return dataBR(valor);
  if (/^cnpj_/.test(chave)) return cnpjCpf(valor);
  if (/^cep_/.test(chave) || chave === "cep") return formatCep(valor);
  if (/^(fone|celular)_|^fone_/.test(chave)) return telefone(valor) || valor;
  if (chave === "valor_da_mercadoria" || (CHAVES_MOEDA.test(chave) && ehNumeroBR(valor))) return moeda(valor);
  if (/^aliquota/.test(chave) && ehNumeroBR(valor) && !valor.includes("%")) return `${valor}%`;
  if (/^peso_.*kg$/.test(chave)) return kg(valor);
  if (chave === "cubagem_em_m3" && ehNumeroBR(valor)) return `${valor} m³`;
  return valor;
}

/** "2/211875" -> "211875": tira a série (parte antes da barra) e deixa só o número da nota. */
// A série pode vir vazia ("/97"), por isso o prefixo antes da barra é opcional.
export const numeroNota = (nota: string) => nota.trim().replace(/^[^/\s]*\//, "");

/**
 * Tira da descrição da ocorrência o contato do agendamento:
 * "ENTREGA AGENDADA P/ 04/11/26 08:30 - CONTATO 41996855433, FONE 96855433." -> "ENTREGA AGENDADA P/ 04/11/26 08:30"
 */
export function limparOcorrencia(texto?: string | null) {
  const original = (texto ?? "").trim();
  if (!original) return "";
  const limpo = original
    .replace(/\s*-?\s*CONTATO\s[^,.]*(?:,\s*FONE\s[^.]*)?\.?/gi, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s.]+$/, "")
    .trim();
  return limpo || original;
}

/** "1/428231, 1/428240" -> ["428231", "428240"] */
export function numerosDasNotas(numeroNf?: string | null) {
  return (numeroNf ?? "").split(",").map(numeroNota).filter(Boolean);
}

const AGENDAMENTO_RE = /AGENDAD[AO]\s+P\/\s*(\d{2}\/\d{2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i;

/**
 * O 455 só traz a data do agendamento (entrega programada). O horário aparece no texto da última ocorrência
 * ("ENTREGA AGENDADA P/ 04/11/26 08:30 ...") e só é usado quando a data do texto é a mesma da entrega programada.
 */
export function horaAgendamento(ocorrencia?: string | null, entregaProgramada?: string | null) {
  const m = (ocorrencia ?? "").match(AGENDAMENTO_RE);
  if (!m || !entregaProgramada || dataISO(m[1]) !== entregaProgramada.slice(0, 10)) return null;
  return m[2].padStart(5, "0");
}

/** "ALJ1548" -> "ALJ-1548"; "DZJ7E81" -> "DZJ-7E81" */
export const formatPlaca = (placa?: string | null) => {
  const p = (placa ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
};
