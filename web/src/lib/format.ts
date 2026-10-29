const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("pt-BR");

export const formatBRL = (v: number) => brl.format(v);
export const formatBRLCompact = (v: number) => brlCompact.format(v);
export const formatInt = (v: number) => int.format(v);
export const formatPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

export function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatISOShort(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "2026-10-19" -> "19/10/2026" (sem passar por Date, para não deslocar o dia pelo fuso). */
export function formatDateBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function formatDateTimeBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

/** Junta textos sem repetir valores iguais, ignorando apenas diferenças de maiúsculas/minúsculas. */
export function joinUnique(values: Array<string | null | undefined>, separator = " - ") {
  const seen = new Set<string>();
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => {
      if (!value) return false;
      const key = value.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(separator);
}
