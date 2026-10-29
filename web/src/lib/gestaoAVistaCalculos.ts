import type { DpePlaca, RomaneioResumo } from "../types/entrega";

export type LinhaGestao = {
  placa: string;
  motorista: string | null;
  /** Romaneios abertos da placa. */
  romaneios: number;
  total: number;
  realizadas: number;
  pendentes: number;
  insucessos: number;
  /** Entregues ÷ total do dia, inteiro. */
  pctDia: number;
  /** DPE do mês corrente, inteiro; null quando a placa ainda não tem entrega no mês. */
  pctDpe: number | null;
};

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((100 * parte) / todo) : 0);

/** Uma linha por placa com romaneio aberto, somando todos os romaneios dela. */
export function linhasGestao(romaneios: RomaneioResumo[], dpe: DpePlaca[]): LinhaGestao[] {
  const dpePorPlaca = new Map(dpe.map((d) => [d.placa, d.dpe_pct]));
  const porPlaca = new Map<string, RomaneioResumo[]>();
  for (const r of romaneios) {
    if (r.status_romaneio !== "ABERTO" || !r.placa) continue;
    porPlaca.set(r.placa, [...(porPlaca.get(r.placa) ?? []), r]);
  }

  return [...porPlaca.entries()]
    .map(([placa, lista]) => {
      const soma = (campo: "total_entregas" | "realizadas" | "pendentes" | "insucessos") => lista.reduce((s, r) => s + r[campo], 0);
      const total = soma("total_entregas");
      const realizadas = soma("realizadas");
      const dpePct = dpePorPlaca.get(placa);
      const maisRecente = [...lista].sort((a, b) => (b.data_emissao ?? "").localeCompare(a.data_emissao ?? ""))[0];
      return {
        placa,
        motorista: maisRecente.motorista,
        romaneios: lista.length,
        total,
        realizadas,
        pendentes: soma("pendentes"),
        insucessos: soma("insucessos"),
        pctDia: pct(realizadas, total),
        pctDpe: dpePct == null ? null : Math.round(dpePct),
      };
    })
    .sort((a, b) => b.pendentes - a.pendentes || a.placa.localeCompare(b.placa));
}

export function totaisGestao(linhas: LinhaGestao[]) {
  const total = linhas.reduce((s, l) => s + l.total, 0);
  const realizadas = linhas.reduce((s, l) => s + l.realizadas, 0);
  return {
    veiculos: linhas.length,
    total,
    pendentes: linhas.reduce((s, l) => s + l.pendentes, 0),
    insucessos: linhas.reduce((s, l) => s + l.insucessos, 0),
    pctDia: pct(realizadas, total),
  };
}
