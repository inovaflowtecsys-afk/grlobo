import { supabase } from "../lib/supabase";
import type { DpePlaca, RomaneioResumo } from "../types/entrega";

const rastreio = () => supabase.schema("ssw_tracking");
const num = (valor: unknown) => Number(valor ?? 0);

/** Romaneios abertos e o DPE do mês corrente por placa. */
export async function carregarGestaoAVista() {
  const [romaneios, dpe, dpeGeral] = await Promise.all([
    rastreio()
      .from("v_romaneios_resumo")
      .select("romaneio,placa,motorista,data_emissao,total_entregas,realizadas,pendentes,insucessos,status_romaneio")
      .eq("status_romaneio", "ABERTO")
      .limit(1000),
    rastreio().from("v_dpe_mes_placa").select("placa,entregues,no_prazo,dpe_pct").limit(1000),
    supabase.from("v_dpe_mensal").select("mes,entregues,no_prazo,dpe_pct").order("mes", { ascending: false }).limit(1),
  ]);
  if (romaneios.error) throw new Error(romaneios.error.message);
  if (dpe.error) throw new Error(dpe.error.message);
  if (dpeGeral.error) throw new Error(dpeGeral.error.message);
  const geral = (dpeGeral.data as { dpe_pct: number | string | null }[])[0]?.dpe_pct;

  return {
    dpeGeral: geral == null ? null : num(geral),
    romaneios: (romaneios.data as unknown as RomaneioResumo[]).map((r) => ({
      ...r,
      total_entregas: num(r.total_entregas),
      realizadas: num(r.realizadas),
      pendentes: num(r.pendentes),
      insucessos: num(r.insucessos),
    })),
    dpe: (dpe.data as unknown as DpePlaca[]).map((d) => ({ placa: d.placa, entregues: num(d.entregues), no_prazo: num(d.no_prazo), dpe_pct: d.dpe_pct == null ? null : num(d.dpe_pct) })),
  };
}
