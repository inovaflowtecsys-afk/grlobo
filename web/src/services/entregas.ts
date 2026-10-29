import { supabase } from "../lib/supabase";
import { ocorrenciaIgnorada } from "../lib/entregasCalculos";
import type { Agendamento, Atrasado, DpeMes, EntregaVeiculo, Pendencia, PainelEntregas, RomaneioResumo, Veiculo } from "../types/entrega";

// O PostgREST devolve numeric/bigint de soma como texto; converte para número.
const num = (valor: unknown) => Number(valor ?? 0);

const rastreio = () => supabase.schema("ssw_tracking");

function ou<T>(resposta: { data: T | null; error: { message: string } | null }) {
  if (resposta.error) throw new Error(resposta.error.message);
  return resposta.data as T;
}

/** Carrega, em paralelo, tudo o que o painel de acompanhamento de entregas mostra. */
export async function carregarPainelEntregas(): Promise<PainelEntregas> {
  const [dpe, atrasados, agendamentos, pendencias, romaneios, veiculos, carga036, carga455] = await Promise.all([
    supabase.from("v_dpe_mensal").select("mes,entregues,no_prazo,dpe_pct").order("mes", { ascending: false }).limit(6),
    supabase.from("v_atrasados").select("ctrc,numero_nf,destinatario_nome,entrega_cidade,previsao_entrega,dias_atraso,faixa_atraso,ultima_ocorrencia,ocorrencia_descricao,placa,localizacao_atual").order("dias_atraso", { ascending: false }).limit(1000),
    supabase.from("v_agendamentos").select("ctrc,numero_nf,destinatario_nome,entrega_cidade,entrega_programada,previsao_entrega,romaneio,data_romaneio,placa,motorista,ocorrencia_codigo,ocorrencia_descricao,ocorrencia_data,tipo").limit(1000),
    rastreio().from("v_pendencias").select("romaneio,numero_nf,placa,motorista,ctrc,destinatario_nome,entrega_cidade,motivo_insucesso,ocorrencia_codigo,data_ocorrencia,aberta_no_ssw").limit(1000),
    rastreio().from("v_romaneios_resumo").select("romaneio,placa,motorista,data_emissao,total_entregas,realizadas,pendentes,insucessos,agendadas,dpe_pct,status_romaneio").order("data_emissao", { ascending: false }).limit(1500),
    rastreio().from("v_veiculos").select("placa,motorista,romaneios_abertos,entregas_pendentes,insucessos,status_veiculo").limit(1000),
    rastreio().from("cargas").select("recebido_em").eq("relatorio", "036").eq("ok", true).order("recebido_em", { ascending: false }).limit(1),
    supabase.from("ssw_455_cargas").select("recebido_em").eq("ok", true).order("recebido_em", { ascending: false }).limit(1),
  ]);

  return {
    dpe: ou(dpe).map((d: DpeMes) => ({ mes: d.mes, entregues: num(d.entregues), no_prazo: num(d.no_prazo), dpe_pct: num(d.dpe_pct) })),
    atrasados: (ou(atrasados) as Atrasado[]).filter((a) => !ocorrenciaIgnorada(a.ultima_ocorrencia)).map((a) => ({ ...a, dias_atraso: num(a.dias_atraso) })),
    agendamentos: ou(agendamentos) as Agendamento[],
    pendencias: (ou(pendencias) as unknown as { romaneio: string | null; numero_nf: string | null; placa: string | null; motorista: string | null; ctrc: string; destinatario_nome: string | null; entrega_cidade: string | null; motivo_insucesso: string | null; ocorrencia_codigo: string | null; data_ocorrencia: string | null; aberta_no_ssw: boolean }[])
      .map((p) => ({
      ...p,
      })),
    romaneios: ou(romaneios).map((r: RomaneioResumo) => ({
      ...r,
      total_entregas: num(r.total_entregas),
      realizadas: num(r.realizadas),
      pendentes: num(r.pendentes),
      insucessos: num(r.insucessos),
      agendadas: num(r.agendadas),
      dpe_pct: r.dpe_pct == null ? null : num(r.dpe_pct),
    })),
    veiculos: ou(veiculos).map((v: Veiculo) => ({ ...v, romaneios_abertos: num(v.romaneios_abertos), entregas_pendentes: num(v.entregas_pendentes), insucessos: num(v.insucessos) })),
    cargas: {
      romaneios036: (ou(carga036) as { recebido_em: string }[])[0]?.recebido_em ?? null,
      conhecimentos455: (ou(carga455) as { recebido_em: string }[])[0]?.recebido_em ?? null,
    },
  };
}

/** Todos os conhecimentos dos romaneios de um veículo (abertos e fechados), carregados só quando o popup abre. */
export async function listarEntregasDoVeiculo(placa: string) {
  const resposta = await rastreio()
    .from("v_entregas_status")
    .select("romaneio,placa,motorista,ctrc,data_emissao,prev_entrega,destinatario_nome,entrega_cidade,entrega_bairro,ocorrencia_rom_codigo,ocorrencia_rom_descricao,ocorrencia_ctrc_codigo,ocorrencia_ctrc_descricao,aberta_no_ssw,status_entrega,agendamento,data_entrega,motivo_insucesso")
    .eq("placa", placa)
    .order("data_emissao", { ascending: false })
    .order("ctrc", { ascending: true })
    .limit(1000);
  return ou(resposta) as EntregaVeiculo[];
}
