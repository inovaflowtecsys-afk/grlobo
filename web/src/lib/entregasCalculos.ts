import type { Agendamento, Atrasado, FaixaAtraso, PainelEntregas, Pendencia, RomaneioResumo, Veiculo } from "../types/entrega";

/** Meta de DPE (entregas no prazo). Fixa por enquanto; ajustar quando a empresa definir a meta oficial. */
export const META_DPE = 90;

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "por"]);
export const OCORRENCIAS_IGNORADAS = new Set(["93", "94", "99"]);

export function ocorrenciaIgnorada(codigo?: string | null) {
  return codigo != null && OCORRENCIAS_IGNORADAS.has(String(codigo).trim());
}

/** "JOSE ALMIR DOS SANTOS" -> "Jose Almir dos Santos" */
export function titulo(texto?: string | null) {
  return (texto ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Placa com hífen: ALJ1548 -> ALJ-1548 */
export const placaComHifen = (p?: string | null) => {
  const x = (p ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return x.length === 7 ? `${x.slice(0, 3)}-${x.slice(3)}` : x;
};

/** "agora", "há 5 min", "há 3 h", "há 2 dias" */
export function haTempo(iso: string | null, agora = Date.now()) {
  if (!iso) return "sem registro";
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  const dias = Math.round(min / 1440);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
/** "2026-10-01" -> "Out/2026" */
export const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
export const mesCurto = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1];

export function calcularDpe(dpe: PainelEntregas["dpe"]) {
  // v_dpe_mensal chega do mais recente para o mais antigo
  const atual = dpe[0] ?? null;
  const anterior = dpe[1] ?? null;
  return {
    atual,
    anterior,
    variacao: atual && anterior ? Math.round((atual.dpe_pct - anterior.dpe_pct) * 10) / 10 : null,
    serie: [...dpe].reverse(),
  };
}

export const FAIXAS: FaixaAtraso[] = ["1 dia", "2 a 3 dias", "mais de 3 dias"];

export function atrasadosPorFaixa(atrasados: Atrasado[]) {
  return FAIXAS.map((faixa) => ({ faixa, total: atrasados.filter((a) => a.faixa_atraso === faixa).length }));
}

export function resumoAgendamentos(agendamentos: Agendamento[], hoje: string) {
  const aguardando = agendamentos.filter((a) => a.tipo === "AGUARDANDO_AGENDAMENTO");
  const agendadas = agendamentos.filter((a) => a.tipo === "AGENDADA");
  const proximas = [...agendadas]
    .filter((a) => a.entrega_programada)
    .sort((a, b) => (a.entrega_programada as string).localeCompare(b.entrega_programada as string));
  // próximos = de hoje em diante; se não houver nenhum, os mais antigos ainda pendentes
  const futuras = proximas.filter((a) => (a.entrega_programada as string) >= hoje);
  return {
    aguardando,
    agendadas,
    aguardandoVencidas: aguardando.filter((a) => a.previsao_entrega && a.previsao_entrega < hoje).length,
    proximos: (futuras.length ? futuras : proximas).slice(0, 3),
  };
}

export function pendenciasPorMotivo(pendencias: Pendencia[]) {
  const mapa = new Map<string, number>();
  for (const p of pendencias) {
    const motivo = (p.motivo_insucesso ?? "").trim() || "Sem motivo informado";
    mapa.set(motivo, (mapa.get(motivo) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total);
}

export type LinhaVeiculo = {
  placa: string;
  motorista: string | null;
  emOperacao: boolean;
  romaneio: string | null;
  total: number;
  realizadas: number;
  pendentes: number;
  insucessos: number;
};

export type FiltroRomaneios = "ABERTOS" | "BAIXADOS" | "TODOS";

export type LinhaRomaneio = LinhaVeiculo & { dataEmissao: string | null; baixado: boolean };

/** Lista uma linha por romaneio (abertos, baixados no SSW ou ambos; cancelados ficam de fora), permitindo repetir a placa. */
export function linhasDeRomaneios(romaneios: RomaneioResumo[], filtro: FiltroRomaneios = "ABERTOS"): LinhaRomaneio[] {
  const aceita = (status: RomaneioResumo["status_romaneio"]) =>
    filtro === "ABERTOS" ? status === "ABERTO" : filtro === "BAIXADOS" ? status === "FECHADO" : status === "ABERTO" || status === "FECHADO";
  return romaneios
    .filter((r) => aceita(r.status_romaneio) && r.placa)
    .map((r) => ({
      placa: r.placa as string,
      motorista: r.motorista,
      emOperacao: r.status_romaneio === "ABERTO",
      baixado: r.status_romaneio === "FECHADO",
      romaneio: r.romaneio,
      dataEmissao: r.data_emissao,
      total: r.total_entregas,
      realizadas: r.realizadas,
      pendentes: r.pendentes,
      insucessos: r.insucessos,
    }))
    .sort((a, b) => (b.dataEmissao ?? "").localeCompare(a.dataEmissao ?? "") || a.placa.localeCompare(b.placa) || a.romaneio.localeCompare(b.romaneio));
}

/** Junta o status do veículo com o andamento do(s) romaneio(s) aberto(s) dele. */
export function linhasDeVeiculos(veiculos: Veiculo[], romaneios: RomaneioResumo[]): LinhaVeiculo[] {
  const abertos = romaneios.filter((r) => r.status_romaneio === "ABERTO" && r.placa);
  return veiculos
    .map((v) => {
      const dele = abertos.filter((r) => r.placa === v.placa);
      return {
        placa: v.placa,
        motorista: v.motorista,
        emOperacao: v.status_veiculo === "EM OPERACAO",
        romaneio: dele.map((r) => r.romaneio).join(", ") || null,
        total: dele.reduce((s, r) => s + r.total_entregas, 0),
        realizadas: dele.reduce((s, r) => s + r.realizadas, 0),
        pendentes: dele.reduce((s, r) => s + r.pendentes, 0),
        insucessos: dele.reduce((s, r) => s + r.insucessos, 0),
      };
    })
    .sort((a, b) => Number(b.emOperacao) - Number(a.emOperacao) || b.pendentes - a.pendentes || a.placa.localeCompare(b.placa));
}
