const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234,56" | "1234.56" | "1234,5" -> número; vazio ou inválido -> null. */
export function parseValor(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  let normal: string;
  if (limpo.includes(",")) {
    normal = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = limpo.split(".");
    // um único ponto com 1 ou 2 casas é decimal ("12.5"); os demais casos são separador de milhar
    normal = partes.length === 2 && partes[1].length <= 2 ? limpo : limpo.replace(/\./g, "");
  }
  const numero = Number(normal);
  return Number.isFinite(numero) ? numero : null;
}

/** Número -> texto do campo ("1.234,56"). */
export const valorParaCampo = (valor: number | null | undefined) => (valor == null ? "" : decimal.format(valor));

/** Data/hora atual no formato do <input type="datetime-local">. */
export function agoraLocal() {
  return isoParaLocal(new Date().toISOString());
}

/** ISO (UTC) -> "YYYY-MM-DDTHH:mm" no horário local do navegador. */
export function isoParaLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" local -> ISO UTC. */
export const localParaIso = (local: string) => new Date(local).toISOString();

export function formatCpf(cpf: string | null | undefined) {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : (cpf ?? "");
}

export function mensagemErro(error: unknown, fallback: string) {
  const bruto = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  const codigo = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (codigo === "23505") return "Já existe um registro com esse nome.";
  if (codigo === "42501" || /row-level security/i.test(bruto)) return "Você não tem permissão para esta ação.";
  return bruto || fallback;
}
