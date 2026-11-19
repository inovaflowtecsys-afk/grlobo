const $ = (id) => document.getElementById(id);
const ROTULO = { "036": "SSW 036 (romaneios)", "455": "SSW 455 (fretes)", financeiro: "Financeiro (5 relatórios)" };
const hora = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const diaHora = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const enviar = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

async function atualizar() {
  const r = await enviar({ acao: "estado" });
  if (!r) return;
  const { cfg, estado, proximas } = r;
  const caixa = $("estado");
  let classe = "ok", texto = "Ativo: buscando nos horários do robô";
  if (estado.parado) { classe = "erro"; texto = "PARADO"; $("mensagem").textContent = estado.parado.motivo; }
  else if (!cfg.temToken || !cfg.usuario) { classe = "aviso"; texto = "Falta configurar"; $("mensagem").textContent = "Abra as Opções e informe o usuário do SSW e o token."; }
  else if (cfg.pausado) { classe = "neutro"; texto = "Pausado por você"; $("mensagem").textContent = ""; }
  else if (estado.desligada) { classe = "neutro"; texto = "Desligada no site"; $("mensagem").textContent = "A importação automática está desligada em Importação SSW, no site. Volta sozinha quando for ligada."; }
  else if (estado.sessao !== "ok") { classe = "aviso"; texto = estado.sessao === "expirada" ? "Sessão do SSW expirada" : "SSW fechado"; $("mensagem").textContent = estado.mensagem || ""; }
  else if (estado.atual) { classe = "ok"; texto = "Buscando agora…"; $("mensagem").textContent = ""; }
  else $("mensagem").textContent = "";
  caixa.className = `estado ${classe}`; caixa.textContent = texto;

  $("retomar").hidden = !(estado.parado || estado.desligada);
  $("pausar").textContent = cfg.pausado ? "Continuar" : "Pausar";
  $("proximas").innerHTML = proximas.length ? proximas.map((p) => `<li><span>${ROTULO[p.tipo] || p.tipo}${p.janelas === 3 ? " · 90 dias" : ""}</span><small>${diaHora(p.quando)}</small></li>`).join("") : '<li class="vazio">Nenhuma nas próximas 24 horas.</li>';
  const itens = Object.entries(estado.resultados || {}).sort((a, b) => b[1].quando - a[1].quando).slice(0, 8);
  $("resultados").innerHTML = itens.length ? itens.map(([k, v]) => `<li><span class="${v.ok ? "good" : "bad"}">${k.replace(/^_/, "")}</span><small>${hora(v.quando)} · ${v.mensagem}</small></li>`).join("") : '<li class="vazio">Ainda nada.</li>';
}

$("retomar").onclick = async () => { await enviar({ acao: "retomar" }); atualizar(); };
$("pausar").onclick = async () => { const r = await enviar({ acao: "estado" }); await enviar({ acao: "pausar", valor: !r.cfg.pausado }); atualizar(); };
document.querySelectorAll("[data-rodar]").forEach((b) => { b.onclick = async () => { await enviar({ acao: "rodarAgora", tipo: b.dataset.rodar }); $("retorno").textContent = "Na fila: roda no próximo minuto (espera você ficar parado)."; }; });
$("testar").onclick = async () => {
  $("retorno").textContent = "Testando…";
  const r = await enviar({ acao: "testar" });
  $("retorno").textContent = r.ok ? (r.ativo ? "Conexão OK. Importação automática LIGADA no site." : "Conexão OK, mas desligada no site.") : (r.desligada ? "Conexão OK, mas a importação automática está DESLIGADA no site." : `Falhou: ${r.erro}`);
};
$("opcoes").onclick = () => chrome.runtime.openOptionsPage();
atualizar();
setInterval(atualizar, 5000);
