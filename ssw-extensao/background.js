// Service worker da extensao "Grupo Lobo - Importador SSW".
// A cada minuto confere a agenda (agenda.js, mesmos horarios do n8n), pede ao script da aba do SSW (content.js) para buscar os
// relatorios com a sessao aberta e envia cada arquivo para a funcao importar-ssw-auto do Supabase, que valida e grava pelas
// mesmas funcoes do robo. Travas: para sozinha no 1o 403 do SSW; respeita o botao "desligar" do site; espera o usuario ficar parado.

import { brasilia, tarefasDoMinuto, proximasTarefas } from "./agenda.js";

// Perfis: cada navegador/perfil do Chrome usa UM (opcoes). O de cada empresa tem o seu Supabase e a sua agenda (agenda.js).
const PERFIS = {
  grupolobo: { nome: "Grupo Lobo", url: "https://xggknkcipdvksfvlvtmh.supabase.co", filial: "SJP" },
  macklog: { nome: "Macklog", url: "https://fmlrycddonddlzphraaz.supabase.co", filial: "" },
};
const perfilDe = (cfg) => (PERFIS[cfg.perfil] ? cfg.perfil : "grupolobo");
const funcaoDe = (cfg) => `${PERFIS[perfilDe(cfg)].url}/functions/v1/importar-ssw-auto`;
const SSW_URL = "https://tms.ssw.inf.br/*";
const ADIAR_MAX_MS = 10 * 60e3;       // espera o usuario ficar parado por ate 10 min; depois pula a rodada
const TIMEOUT_TAREFA_MS = 40 * 60e3;  // 455 x3 janelas / 5 financeiros podem levar muito tempo na fila do 156
const THROTTLE_ERRO_MS = 30 * 60e3;   // o mesmo erro vai ao log do servidor no maximo a cada 30 min
const PING_DESLIGADA_MS = 5 * 60e3;

const CFG_PADRAO = { perfil: "grupolobo", usuario: "", token: "", filial: "SJP", ociosoSeg: 90, ignorarAtividade: false, pausado: false, habilitados: { "036": true, "455": true, financeiro: true } };
const ESTADO_PADRAO = { parado: null, desligada: false, ultimoPing: 0, ultimoMinuto: "", fila: [], atual: null, resultados: {}, sessao: "ok", mensagem: "", avisos: {} };

// ---------- armazenamento (com fila para nao misturar eventos) ----------
let cadeia = Promise.resolve();
const exclusivo = (fn) => { const p = cadeia.then(fn, fn); cadeia = p.catch(() => {}); return p; };
const ler = async (k, padrao) => ({ ...padrao, ...((await chrome.storage.local.get(k))[k] || {}) });
const lerCfg = async () => { const c = await ler("cfg", CFG_PADRAO); c.habilitados = { ...CFG_PADRAO.habilitados, ...(c.habilitados || {}) }; return c; };
const lerEstado = () => ler("estado", ESTADO_PADRAO);
const salvarEstado = (e) => chrome.storage.local.set({ estado: e });

// ---------- avisos ----------
async function notificar(estado, chave, titulo, mensagem) {
  const agora = Date.now();
  if (estado.avisos[chave] && agora - estado.avisos[chave] < THROTTLE_ERRO_MS) return;
  estado.avisos[chave] = agora;
  try {
    await chrome.notifications.create(`gl-${chave}-${agora}`, { type: "basic", iconUrl: "icon128.png", title: titulo, message: mensagem, priority: 2 });
  } catch { /* sem permissao de notificacao: o aviso fica no popup */ }
}

function atualizarBadge(cfg, estado) {
  let texto = "", cor = "#2e7d32";
  if (estado.parado) { texto = "!"; cor = "#c62828"; }
  else if (estado.desligada) { texto = "OFF"; cor = "#6d6d6d"; }
  else if (cfg.pausado) { texto = "||"; cor = "#6d6d6d"; }
  else if (!cfg.token || !cfg.usuario) { texto = "?"; cor = "#ef6c00"; }
  else if (estado.sessao !== "ok") { texto = "!"; cor = "#ef6c00"; }
  else if (estado.atual) { texto = "..."; cor = "#1565c0"; }
  chrome.action.setBadgeText({ text: texto });
  chrome.action.setBadgeBackgroundColor({ color: cor });
}

// ---------- chamadas ao Supabase ----------
async function chamarFuncao(cfg, corpo) {
  const r = await fetch(funcaoDe(cfg), { method: "POST", headers: { "Content-Type": "application/json", "x-importador-token": cfg.token }, body: JSON.stringify(corpo) });
  let dados = {};
  try { dados = await r.json(); } catch { /* corpo vazio */ }
  return { status: r.status, dados };
}

async function registrarErroNoServidor(cfg, estado, chave, corpo) {
  const agora = Date.now();
  if (estado.avisos[`srv-${chave}`] && agora - estado.avisos[`srv-${chave}`] < THROTTLE_ERRO_MS) return;
  estado.avisos[`srv-${chave}`] = agora;
  try { await chamarFuncao(cfg, { evento: "erro", ...corpo }); } catch { /* sem rede */ }
}

// ---------- tarefas ----------
function enfileirar(estado, tarefa) {
  const repetida = estado.fila.some((t) => t.tipo === tarefa.tipo) || estado.atual?.def?.tipo === tarefa.tipo;
  if (repetida) { estado.resultados[`_${tarefa.tipo}`] = { quando: Date.now(), ok: false, mensagem: "Rodada anterior ainda em andamento; esta foi pulada." }; return; }
  estado.fila.push({ ...tarefa, criadoEm: Date.now() });
}

async function abaDoSsw() {
  const abas = await chrome.tabs.query({ url: SSW_URL });
  return abas.find((a) => a.active) || abas[0] || null;
}

async function mensagemParaAba(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch {
    // aba aberta antes da extensao: injeta o script e tenta de novo
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch { return null; }
  }
}

async function iniciarProxima(cfg, estado) {
  const item = estado.fila[0];
  if (!item) return;
  const aba = await abaDoSsw();
  if (!aba) {
    estado.fila.shift();
    estado.sessao = "sem_aba";
    estado.mensagem = "Nenhuma aba do SSW aberta. Abra o SSW (tms.ssw.inf.br) e entre com o seu usuário.";
    estado.resultados[`_${item.tipo}`] = { quando: Date.now(), ok: false, mensagem: "Pulada: nenhuma aba do SSW aberta." };
    await notificar(estado, "sem-aba", "Importador SSW", "Nenhuma aba do SSW aberta: as atualizações automáticas estão paradas.");
    return;
  }
  const idle = await mensagemParaAba(aba.id, { acao: "ocioso" });
  if (!idle) {
    estado.fila.shift();
    estado.sessao = "sem_aba";
    estado.mensagem = "Não consegui falar com a aba do SSW. Recarregue a página do SSW.";
    return;
  }
  if (idle.executando) return;
  if (!cfg.ignorarAtividade && idle.segundos < cfg.ociosoSeg) {
    item.adiadoDesde = item.adiadoDesde || Date.now();
    if (Date.now() - item.adiadoDesde > ADIAR_MAX_MS) {
      estado.fila.shift();
      estado.resultados[`_${item.tipo}`] = { quando: Date.now(), ok: false, mensagem: "Pulada: você estava usando o SSW (a extensão espera você ficar parado)." };
    }
    return; // tenta de novo no proximo minuto
  }
  estado.fila.shift();
  const resposta = await mensagemParaAba(aba.id, {
    acao: "executar", jobId: item.id,
    def: { tipo: item.tipo, janelas: item.janelas || 1, dias: item.dias },
    cfg: { usuario: cfg.usuario.trim().toLowerCase(), filial: cfg.filial.trim().toUpperCase() || PERFIS[perfilDe(cfg)].filial },
  });
  if (!resposta?.ok) {
    estado.resultados[`_${item.tipo}`] = { quando: Date.now(), ok: false, mensagem: resposta?.ocupado ? "Aba do SSW ocupada com outra tarefa." : "A aba do SSW não respondeu." };
    return;
  }
  estado.sessao = "ok";
  estado.atual = { jobId: item.id, def: item, inicio: Date.now(), tabId: aba.id };
}

async function pararPorSeguranca(cfg, estado, motivo, item) {
  estado.parado = { motivo, em: Date.now() };
  estado.fila = [];
  estado.atual = null; // a tarefa em andamento e abandonada: nada fica preso depois do "Retomar"
  await notificar(estado, "parado", "Importador SSW PAROU", motivo);
  await registrarErroNoServidor(cfg, estado, `parado-${item?.relatorio || ""}`, { tipo: item?.tipoImport || "", relatorio: item?.relatorio || "", mensagem: `Extensão parada: ${motivo}` });
}

async function tratarItem(cfg, estado, item) {
  const chave = item.relatorio || "?";
  if (item.erro) {
    estado.resultados[chave] = { quando: Date.now(), ok: false, mensagem: item.erro };
    if (item.codigo === 403) return await pararPorSeguranca(cfg, estado, "O SSW respondeu 403 (acesso recusado). Parei para não piorar o bloqueio. Confira o SSW e clique em Retomar.", item);
    if (item.codigo === "sessao") {
      estado.sessao = "expirada";
      estado.mensagem = "Sessão do SSW expirada. Entre no SSW de novo; a extensão volta sozinha na próxima rodada.";
      await notificar(estado, "sessao", "Importador SSW", "A sessão do SSW expirou. Entre de novo para continuar as atualizações.");
    }
    await registrarErroNoServidor(cfg, estado, `${chave}-${item.erro.slice(0, 40)}`, { tipo: item.tipoImport || "", relatorio: chave, mensagem: item.erro });
    return;
  }
  // envio ao servidor
  try {
    const { status, dados } = await chamarFuncao(cfg, { tipo: item.tipoImport, relatorio: item.relatorio, nome: item.nome, conteudo_base64: item.b64, referencia: item.referencia, sequencia: item.sequencia });
    if (status === 200 && dados.ok) {
      const i = dados.importacao || {};
      estado.resultados[chave] = { quando: Date.now(), ok: true, mensagem: `${i.linhas ?? "?"} linhas: ${i.novos ?? 0} novas, ${i.atualizados ?? 0} atualizadas, ${i.iguais ?? 0} iguais` };
      estado.sessao = "ok";
      estado.mensagem = "";
    } else if (status === 423) {
      estado.desligada = true;
      estado.ultimoPing = Date.now();
      estado.fila = [];
      estado.resultados[chave] = { quando: Date.now(), ok: false, mensagem: "Importação automática desligada no site." };
    } else if (status === 401) {
      estado.parado = { motivo: "O servidor recusou o token. Confira o token nas opções da extensão.", em: Date.now() };
      estado.fila = [];
      estado.atual = null;
    } else {
      estado.resultados[chave] = { quando: Date.now(), ok: false, mensagem: dados.error || `Servidor respondeu ${status}.` };
    }
  } catch (e) {
    estado.resultados[chave] = { quando: Date.now(), ok: false, mensagem: `Sem conexão com o servidor: ${e.message || e}` };
  }
}

// ---------- tique de 1 minuto ----------
async function tique() {
  const cfg = await lerCfg();
  const estado = await lerEstado();
  const agora = Date.now();

  if (estado.parado) { atualizarBadge(cfg, estado); await salvarEstado(estado); return; }
  if (!cfg.token || !cfg.usuario || cfg.pausado) { atualizarBadge(cfg, estado); return; }

  // importacao desligada no site: confere de tempos em tempos se foi religada
  if (estado.desligada) {
    if (agora - estado.ultimoPing >= PING_DESLIGADA_MS) {
      estado.ultimoPing = agora;
      try { const { status, dados } = await chamarFuncao(cfg, { evento: "ping" }); if (status === 200 && dados.ativo) estado.desligada = false; else if (status === 401) estado.parado = { motivo: "O servidor recusou o token.", em: agora }; } catch { /* sem rede */ }
    }
    atualizarBadge(cfg, estado); await salvarEstado(estado); return;
  }

  if (estado.atual && agora - estado.atual.inicio > TIMEOUT_TAREFA_MS) {
    estado.resultados[`_${estado.atual.def.tipo}`] = { quando: agora, ok: false, mensagem: "A tarefa passou do tempo limite e foi encerrada." };
    estado.atual = null;
  }

  const d = brasilia(agora);
  const chaveMin = `${d.getUTCFullYear()}${d.getUTCMonth()}${d.getUTCDate()}-${d.getUTCHours()}:${d.getUTCMinutes()}`;
  if (estado.ultimoMinuto !== chaveMin) {
    estado.ultimoMinuto = chaveMin;
    for (const t of tarefasDoMinuto(d, cfg.habilitados, perfilDe(cfg))) enfileirar(estado, t);
  }

  if (!estado.atual && estado.fila.length) await iniciarProxima(cfg, estado);
  atualizarBadge(cfg, estado);
  await salvarEstado(estado);
}

// ---------- mensagens do script da aba e do popup ----------
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  exclusivo(async () => {
    const cfg = await lerCfg();
    const estado = await lerEstado();

    if (msg?.acao === "parcial") {
      if (estado.atual?.jobId === msg.jobId) await tratarItem(cfg, estado, msg.item || {});
      atualizarBadge(cfg, estado); await salvarEstado(estado); return responder?.({ ok: true });
    }
    if (msg?.acao === "fim") {
      if (estado.atual?.jobId === msg.jobId) estado.atual = null;
      atualizarBadge(cfg, estado); await salvarEstado(estado); return responder?.({ ok: true });
    }
    if (msg?.acao === "estado") {
      const { token, ...semToken } = cfg;
      return responder({ cfg: { ...semToken, temToken: !!token }, estado, proximas: proximasTarefas(brasilia(), cfg.habilitados, 6, 24 * 60, perfilDe(cfg)).map((t) => ({ tipo: t.tipo, quando: t.quando.getTime() + 3 * 3600e3, janelas: t.janelas, dias: t.dias })), perfil: { id: perfilDe(cfg), nome: PERFIS[perfilDe(cfg)].nome } });
    }
    if (msg?.acao === "rodarAgora") {
      estado.fila.unshift({ id: `manual-${msg.tipo}-${Date.now()}`, tipo: msg.tipo, janelas: msg.tipo === "455" ? 1 : undefined, dias: msg.tipo === "455" && perfilDe(cfg) === "macklog" ? 3 : undefined, criadoEm: Date.now(), adiadoDesde: Date.now() - ADIAR_MAX_MS + 60e3 });
      await salvarEstado(estado); return responder({ ok: true });
    }
    if (msg?.acao === "retomar") {
      estado.parado = null; estado.sessao = "ok"; estado.mensagem = ""; estado.desligada = false; estado.atual = null; estado.fila = [];
      atualizarBadge(cfg, estado); await salvarEstado(estado); return responder({ ok: true });
    }
    if (msg?.acao === "pausar") {
      cfg.pausado = !!msg.valor; await chrome.storage.local.set({ cfg });
      atualizarBadge(cfg, estado); return responder({ ok: true, pausado: cfg.pausado });
    }
    if (msg?.acao === "testar") {
      if (!cfg.token) return responder({ ok: false, erro: "Informe o token nas opções." });
      try {
        const { status, dados } = await chamarFuncao(cfg, { evento: "ping" });
        if (status === 200) return responder({ ok: true, ativo: !!dados.ativo, tipos: dados.tipos });
        return responder({ ok: false, status, erro: dados.error || `Servidor respondeu ${status}.`, desligada: !!dados.desligada });
      } catch (e) { return responder({ ok: false, erro: `Sem conexão: ${e.message || e}` }); }
    }
    if (msg?.acao === "cfgSalva") { atualizarBadge(await lerCfg(), estado); return responder({ ok: true }); }
    responder({ ok: false });
  });
  return true; // resposta assincrona
});

function garantirAlarme() { chrome.alarms.create("tique", { periodInMinutes: 1, delayInMinutes: 0.2 }); }
chrome.runtime.onInstalled.addListener(garantirAlarme);
chrome.runtime.onStartup.addListener(garantirAlarme);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "tique") exclusivo(tique); });
garantirAlarme();
