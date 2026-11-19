// Agenda da extensao: os MESMOS horarios dos fluxos do n8n (SSW 036, SSW 455 e financeiro), em horario de Brasilia (UTC-3, sem horario de verao).
//
//   036 .......... seg a sex: a cada 10 min das 6h as 19h50 e as 20h00; sabado: a cada 10 min das 6h as 14h50 e as 15h00.   Pula feriados.
//   455 .......... minuto 07: seg a sex das 6h as 20h; sabado das 6h as 15h. As 6h: 3 janelas de 30 dias; nos demais horarios: 1 janela. Pula feriados.
//   financeiro .... 06h45, 12h45, 15h45, 17h45 e 19h45, todos os dias (sem pular feriado, como o fluxo atual); 5 relatorios em sequencia.

export const RELATORIOS_FINANCEIRO = ["a-faturar", "fat-emissao", "fat-pendentes", "fat-liquidadas", "liquidados"];

/** "Agora" em Brasilia: um Date cujos getUTC* devolvem a hora local de Brasilia. */
export const brasilia = (ms = Date.now()) => new Date(ms - 3 * 3600e3);

const pad = (n) => String(n).padStart(2, "0");
const md = (d) => `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Feriados nacionais e do Parana, iguais ao no "Dia util?" dos fluxos do n8n (Sexta-feira Santa calculada pela Pascoa). */
export function ehFeriado(d) {
  const ano = d.getUTCFullYear();
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, dd = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mesP = Math.floor((hh + l - 7 * m + 114) / 31), diaP = ((hh + l - 7 * m + 114) % 31) + 1;
  const pascoa = Date.UTC(ano, mesP - 1, diaP);
  const sextaSanta = new Date(pascoa - 2 * 86400e3);
  const feriados = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25", "12-19", md(sextaSanta)]);
  return feriados.has(md(d));
}

/**
 * Tarefas que vencem no minuto de `agora` (Date de Brasilia). Cada tarefa:
 *   { id, tipo: "036" | "455" | "financeiro", janelas?: 1 | 3 }
 * `id` inclui o minuto, para nunca rodar a mesma tarefa duas vezes.
 */
export function tarefasDoMinuto(agora, habilitados = { "036": true, "455": true, financeiro: true }, perfil = "grupolobo") {
  const dow = agora.getUTCDay(); // 0 = domingo
  const h = agora.getUTCHours();
  const m = agora.getUTCMinutes();
  const chave = `${agora.getUTCFullYear()}${pad(agora.getUTCMonth() + 1)}${pad(agora.getUTCDate())}-${pad(h)}${pad(m)}`;
  if (perfil === "macklog") {
    // Macklog (fluxos do n8n): 455 de 2 em 2 h (6h..20h, seg a sab) no minuto 07, 30 dias as 8h e 20h, 3 dias nos demais;
    // financeiro 08h20, 14h20 e 19h20 todos os dias. Nao tem 036. Sem pular feriado.
    const lm = [];
    if (habilitados["455"] && dow >= 1 && dow <= 6 && m === 7 && h >= 6 && h <= 20 && h % 2 === 0) {
      lm.push({ id: `455-${chave}`, tipo: "455", dias: h === 8 || h === 20 ? 30 : 3 });
    }
    if (habilitados.financeiro && m === 20 && [8, 14, 19].includes(h)) lm.push({ id: `financeiro-${chave}`, tipo: "financeiro" });
    return lm;
  }
  const util = dow >= 1 && dow <= 6 && !ehFeriado(agora);
  const lista = [];

  if (habilitados["036"] && util) {
    const semana = dow >= 1 && dow <= 5;
    const regular = m % 10 === 0 && (semana ? h >= 6 && h <= 19 : h >= 6 && h <= 14);
    const fechamento = m === 0 && (semana ? h === 20 : h === 15);
    if (regular || fechamento) lista.push({ id: `036-${chave}`, tipo: "036" });
  }
  if (habilitados["455"] && util && m === 7) {
    const semana = dow >= 1 && dow <= 5;
    if (semana ? h >= 6 && h <= 20 : h >= 6 && h <= 15) lista.push({ id: `455-${chave}`, tipo: "455", janelas: h === 6 ? 3 : 1 });
  }
  if (habilitados.financeiro && m === 45 && [6, 12, 15, 17, 19].includes(h)) {
    lista.push({ id: `financeiro-${chave}`, tipo: "financeiro" });
  }
  return lista;
}

/** Proximos horarios (para mostrar no popup): varre minuto a minuto ate `limiteMin` minutos a frente. */
export function proximasTarefas(agora, habilitados, quantidade = 6, limiteMin = 24 * 60, perfil = "grupolobo") {
  const out = [];
  for (let i = 1; i <= limiteMin && out.length < quantidade; i++) {
    const d = new Date(agora.getTime() + i * 60e3);
    for (const t of tarefasDoMinuto(d, habilitados, perfil)) out.push({ ...t, quando: d });
  }
  return out;
}
