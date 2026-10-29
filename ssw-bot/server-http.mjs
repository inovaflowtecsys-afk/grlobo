// GrupoLobo - robo de extracao do SSW (copia do modelo Macklog, processo separado).
import http from "node:http";

// Bot do SSW SEM navegador (HTTP puro, ~30 MB de RAM). Mesmas rotas do bot Playwright (POST, header x-bot-token):
//   /gerar-455?dias=3&arq=E&compl=ABF   pede a 455 (ssw0230) ao proprio usuario, espera concluir no 156 e baixa o arquivo
//   /baixar-455?usuario=<usuario>         baixa a 455 concluida mais recente de um usuario
//   /relatorio?rel=036|038&dias=3         036 (romaneios) e 038 (CTRCs pendentes) - sempre diretos, sem fila
//   /veiculos-088?data=201026             088 (situacao por veiculo) - XML embutido no HTML, devolve JSON
//   200 arquivo cru (x-sequencia, x-solicitado-em, x-arquivo) | 204 sem novidade | 502 {etapa, erro}
//   GET /saude
// Variaveis: BOT_TOKEN, SSW_DOMINIO, SSW_CPF, SSW_USUARIO, SSW_SENHA, SSW_FILIAL (sigla da unidade, ex. SJP).
// Protocolo (capturado do navegador): POST form-urlencoded em /bin/ssw0422 (login act=L), /bin/ssw1440 (fila 156, devolve XML <rs><r><f0>..),
// /bin/ssw0230 (act=E1 envia o pedido) e /bin/ssw1440 act=DOW<seq> (download).
// 036 (ssw0146, act=REL2) e 038 (ssw0198, act=CSV) entregam o arquivo na hora (mesmo padrao do web_body/ssw0424 dos outros).
// 088 (ssw0602, act=RELOAD) nao tem arquivo: a tela devolve os dados como <xml id=xmlsr><rs><r><f0>...</f0>...</r></rs></xml> no proprio HTML.

const PORT = Number(process.env.PORT || 3000);
const BASE = "https://sistema.ssw.inf.br/bin";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const need = (n) => { const v = process.env[n]; if (!v) throw new Error(`Variavel ausente: ${n}`); return v; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const VERSAO = "2026-10-21-r2";
// Fila FIFO de execucoes: o SSW so tolera uma sessao do usuario por vez. Em vez de responder 429 (que o n8n, com
// neverError, tratava como "sucesso" e perdia a carga), a chamada espera a vez por ate FILA_MAX_ESPERA_MS.
const FILA_MAX_ESPERA_MS = Number(process.env.FILA_MAX_ESPERA_MS || 270000);
let proximoTicket = 0, ticketAtual = 0;
const desistentes = new Set();
async function entraNaFila() {
  const meu = proximoTicket++; const ini = Date.now();
  while (meu !== ticketAtual) {
    if (Date.now() - ini > FILA_MAX_ESPERA_MS) { desistentes.add(meu); return -1; }
    await dorme(300);
  }
  return meu;
}
function saiDaFila() {
  ticketAtual++;
  while (desistentes.has(ticketAtual)) { desistentes.delete(ticketAtual); ticketAtual++; }
}

class Sessao {
  cookies = new Map();
  async get(caminho) {
    const r = await fetch(`${BASE}/${caminho}`, {
      redirect: "follow", headers: { "user-agent": UA, accept: "*/*", "accept-language": "pt-BR,pt;q=0.9", referer: "https://sistema.ssw.inf.br/bin/ssw1440", cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, signal: AbortSignal.timeout(60000),
    });
    return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
  }
  async post(prog, campos, { bin = false, extra = "" } = {}) {
    const corpo = new URLSearchParams({ ...campos, dummy: String(Date.now()) }).toString().replace("&dummy=", extra + "&dummy=");
    for (let salto = 0; salto < 5; salto++) {
      const r = await fetch(`${BASE}/${prog}`, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA, cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), accept: "*/*", "accept-language": "pt-BR,pt;q=0.9", referer: "https://sistema.ssw.inf.br/bin/ssw0422", origin: "https://sistema.ssw.inf.br" },
        body: corpo, signal: AbortSignal.timeout(60000),
      });
      for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { prog = r.headers.get("location").replace(/^.*\/bin\//, "").replace(/^\//, ""); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: r.status, headers: r.headers, buf, texto: bin ? "" : buf.toString("latin1") };
    }
    throw new Error("Redirecionamentos demais.");
  }
}

const decodifica = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

async function login(s) {
  const r = await s.post("ssw0422", { act: "L", f1: need("SSW_DOMINIO"), f2: need("SSW_CPF"), f3: need("SSW_USUARIO"), f4: need("SSW_SENHA"), f6: "TRUE" }, { extra: "&backimg=ssw02%2Ejpg%3Fdummy%3D261007" });
  if (/senha|invalid|inv.lid/i.test(r.texto) && !s.cookies.size) throw new Error("Login recusado pelo SSW.");
  await s.post("menu01", { act: "" });
  await s.post("menu01", { act: "SSU" });
}

// Fila do 156: linhas <r><f0>seq</f0><f1>opcao</f1><f2>data</f2><f3>usuario</f3>...<f6>situacao</f6>...
async function fila(s, prefixo = "455") {
  const r = await s.post("ssw1440", {});
  const linhas = [];
  for (const m of r.texto.matchAll(/<r>([\s\S]*?)<\/r>/g)) {
    const f = {};
    for (const c of m[1].matchAll(/<f(\d+)>([\s\S]*?)<\/f\1>/g)) f[c[1]] = decodifica(c[2]).trim();
    if (f[0] && /^\d+$/.test(f[0]) && (!prefixo || (f[1] || "").startsWith(prefixo))) linhas.push({ sequencia: f[0], opcao: f[1] || "", solicitado: f[2], usuario: (f[3] || "").toLowerCase(), situacao: f[6] || "" });
  }
  if (!linhas.length && !/xmlsr/.test(r.texto)) throw new Error("Fila do 156 nao veio (sessao invalida?).");
  return linhas;
}
const concluida = (l) => /conclu/i.test(l.situacao);

async function baixa(s, res, l) {
  // passo 1: o DOW devolve abrir('arquivo','arquivo',1,1,'/caminho/',4); passo 2: GET em ssw0424 entrega o arquivo
  const r1 = await s.post("ssw1440", { act: "DOW" + l.sequencia });
  const wb = r1.texto.match(/name=web_body[^>]*value="([^"]+)"/)?.[1];
  const m = wb && decodeURIComponent(wb).match(/abrir\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\d+\s*,\s*\d+\s*,\s*'([^']+)'/);
  if (!m) throw new Error("SSW nao devolveu o arquivo do job " + l.sequencia + ".");
  const [, arquivo, , caminho] = m;
  const r2 = await s.get(`ssw0424?act=${encodeURIComponent(arquivo)}&filename=${encodeURIComponent(arquivo)}&path=${caminho}&down=1&nw=1`);
  if (r2.status !== 200 || !r2.buf.length || /^\s*<(!|html)/i.test(r2.buf.subarray(0, 40).toString("latin1"))) throw new Error("Download invalido (status " + r2.status + ").");
  res.writeHead(200, { "content-type": "application/octet-stream", "x-sequencia": l.sequencia, "x-solicitado-em": l.solicitado, "x-arquivo": arquivo });
  res.end(r2.buf);
}

// Relatorios financeiros (telas que entregam o arquivo na hora, ou mandam para a fila 156 quando o pedido e grande).
// op = opcao do menu, prog = programa interno, ref = programa para o header Referer
const ddmmaa = (d) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCFullYear()).slice(2)}`;
const hojeBR = () => new Date(Date.now() - 3 * 3600_000);
const atras = (d, n) => new Date(d.getTime() - n * 86400_000);
const FILIAL = process.env.SSW_FILIAL || "SJP";
const FAT441 = (data, sit, dias) => ({ op: "441", prog: "ssw0049", dias, campos: (ini, fim) => ({ act: "ANA", rel_sin_fg_data: "E", rel_sin_per_pesq_ini: fim, rel_sin_per_pesq_fin: fim, rel_sin_classificacao: "F", rel_sin_sit_fat: "T", rel_sin_fg_fat_desc: "I", tp_arquivo: "C", rel_ana_fg_data: data, rel_ana_per_pesq_ini: ini, rel_ana_per_pesq_fin: fim, rel_ana_class_nro_fat: "X", rel_ana_sit_fat: sit, rel_ana_crit_adc: "T", rel_ana_fg_fat_desc: "I", rel_ana_fg_lista_ocor: "N", rel_ana_fg_ctrc_fob_dir: "N", tp_cobranca: "A", rel_ana_vlr_max_fat: "9.999.999,99", rel_ana_periodicidade: "T", rel_ana_arq_excel: "S" }) });
const RELATORIOS = {
  // 441 analitico "lista faturas com CTRCs": faturas emitidas nos ultimos dias (todas as situacoes)
  "fat-emissao": FAT441("E", "T", 31),
  // faturas ainda pendentes por vencimento (inclui as atrasadas); o SSW aceita ate 365 dias
  "fat-pendentes": FAT441("V", "P", 364),
  // faturas liquidadas nos ultimos dias (atualiza faturas antigas que acabaram de ser pagas)
  "fat-liquidadas": FAT441("L", "L", 31),
  // 411 CTRCs liquidados (maximo 31 dias)
  "liquidados": { op: "411", prog: "ssw0309", dias: 31, campos: (ini, fim) => ({ act: "EXC", cod_emp_ctb: "01", f2: ini, f3: fim, f10: "T", f11: "T" }) },
  // 435 CTRCs disponiveis para faturar (retrato de hoje: periodo inicial fixo)
  "a-faturar": { op: "435", prog: "ssw0103", dias: 0, campos: (ini, fim) => ({ act: "PES", cod_emp_ctb: "01", t_data_ref_ini: "010101", t_data_ref_fim: fim, t_tp_fil: "C", t_tp_cliente: "C", t_tp_cli_fat: "T", t_situacao_ctrc: "I", t_periodicidade: "T", t_rel_lista: "T", t_cons_bloqueados: "N", t_cons_a_vista: "N", t_tp_classificacao: "F", t_excel: "S", t_ler_morto: "N" }) },
  // 036 romaneios e CTRCs de entrega no periodo (placa, motorista, ocorrencia) - sempre direto
  "036": { op: "036", prog: "ssw0146", dias: 30, unidade: FILIAL, campos: (ini, fim) => ({ act: "REL2", t_sigla_rom: FILIAL, t_nro_rom: "", t_cod_barras_rom: "", t_ciot: "", t_ser_mdfe: "", t_nro_mdfe: "", t_excel: "S", t_unidade: FILIAL, t_placa_veic: "", t_cpf_motorista: "", t_dt_ini: ini, t_dt_fin: fim }) },
  // 038 CTRCs pendentes de entrega (foto atual, sem filtro de periodo)
  // Sem t_unidade o SSW roda no nivel da matriz/frota, que nao tem permissao de "baixa entrega" -> 502.
  "038": { op: "038", prog: "ssw0198", dias: 1, unidade: FILIAL, campos: () => ({ act: "CSV", t_unidade: FILIAL, nro_romaneio: "", seq_romaneio: "" }) },
};
async function entregaDireta(s, prog, wb) {
  const m = decodeURIComponent(wb).match(/abrir\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\d+\s*,\s*\d+\s*,\s*'([^']*)'/);
  if (!m) throw new Error("Resposta do SSW sem arquivo.");
  const r = await s.get(`ssw0424?act=${encodeURIComponent(m[1])}&filename=${encodeURIComponent(m[1])}&path=${m[3]}&down=1&nw=1`);
  if (r.status !== 200 || !r.buf.length || /^\s*<(!|html)/i.test(r.buf.subarray(0, 40).toString("latin1"))) throw new Error("Download invalido (status " + r.status + ").");
  return { buf: r.buf, arquivo: m[1] };
}
async function relatorio(s, res, rel, url) {
  const def = RELATORIOS[rel];
  if (!def) throw new Error("Relatorio desconhecido: " + rel);
  const usuario = need("SSW_USUARIO").toLowerCase();
  const base = Math.max(0, ...(await fila(s, "")).filter((x) => x.usuario === usuario).map((x) => Number(x.sequencia)));
  const dias = Math.min(Math.max(Number(url.searchParams.get("dias") || def.dias || 1), 1), def.dias === 31 ? 31 : 364);
  const fim = hojeBR(); const ini = atras(fim, dias - 1);
  // 036/038 precisam da filial (a matriz nao tem permissao de baixa entrega); os financeiros seguem na matriz.
  await s.post("menu01", { act: "TRO", f2: def.unidade || process.env.SSW_UNIDADE || "MTZ", f3: def.op });
  await s.post(def.prog, { sequencia: def.op });
  const r = await s.post(def.prog, def.campos(ddmmaa(ini), ddmmaa(fim)));
  const wb = r.texto.match(/name=web_body[^>]*value="([^"]+)"/)?.[1];
  let buf, arquivo = "", seq = "", solicitado = "";
  if (wb) ({ buf, arquivo } = await entregaDireta(s, def.prog, wb));
  else if (/enviada\s+para\s+processamento|enviada%20para/i.test(r.texto)) {
    let job = null;
    for (let t = 0; t < 60 && !job; t++) {
      await dorme(5000);
      job = (await fila(s, def.op)).find((x) => x.usuario === usuario && Number(x.sequencia) > base && concluida(x)) || null;
    }
    if (!job) throw new Error("O relatorio " + rel + " nao concluiu a tempo.");
    const r1 = await s.post("ssw1440", { act: "DOW" + job.sequencia });
    const w2 = r1.texto.match(/name=web_body[^>]*value="([^"]+)"/)?.[1];
    if (!w2) throw new Error("SSW nao devolveu o arquivo do job " + job.sequencia + ".");
    ({ buf, arquivo } = await entregaDireta(s, def.prog, w2)); seq = job.sequencia; solicitado = job.solicitado;
  } else throw new Error("SSW nao entregou o relatorio: " + decodeURIComponent(r.texto).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
  res.writeHead(200, { "content-type": "application/octet-stream", "x-relatorio": rel, "x-arquivo": arquivo, "x-sequencia": seq, "x-solicitado-em": solicitado, "x-periodo": `${ddmmaa(ini)}-${ddmmaa(fim)}` });
  res.end(buf);
}

// 088 - Situacao dos veiculos de coleta/entrega: a tela nao tem arquivo, os dados vem embutidos no proprio
// HTML como <xml id=xmlsr><rs><r><f0>placa</f0><f1>...</f1>...<f12>placa</f12></r>...</rs></xml>.
// Cabecalho das colunas (getDataFieldNames): f0 veiculo, f1 localizacao, f2/f3 qtd coletas pend/coletada,
// f4/f5 kg coletas pend/coletada, f7/f8 qtd entregas sem/com ocorrencia, f9/f10 kg entregas sem/com ocorrencia.
const CAMPOS_088 = { 0: "placa", 2: "qtd_coletas_pendente", 3: "qtd_coletas_coletada", 4: "kg_coletas_pendente", 5: "kg_coletas_coletada", 7: "qtd_entregas_sem_ocorrencia", 8: "qtd_entregas_com_ocorrencia", 9: "kg_entregas_sem_ocorrencia", 10: "kg_entregas_com_ocorrencia" };
const limpaOcultos = (s) => decodifica(s).replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Resumo da resposta do SSW para diagnostico quando a tela nao vem como esperado (vai no corpo do 502).
function resumo(r) {
  let t = r.texto || "";
  const titulo = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 80);
  try { t = decodeURIComponent(t); } catch {}
  const visivel = decodifica(t).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  return { status: r.status, bytes: r.buf.length, titulo, xmlsr: /xmlsr/i.test(r.texto || ""), login: /ssw0422|name=f4\b/i.test(r.texto || ""), texto: visivel };
}
async function veiculosSituacao(s, data) {
  const tro = await s.post("menu01", { act: "TRO", f2: FILIAL, f3: "088" });
  const tela = await s.post("ssw0602", { sequencia: "088" });
  const r = await s.post("ssw0602", { act: "RELOAD", f1: data });
  const xml = r.texto.match(/<xml id="?xmlsr"?>([\s\S]*?)<\/xml>/)?.[1];
  if (!xml) {
    const e = new Error("SSW nao devolveu o XML da situacao dos veiculos.");
    e.diag = { data, filial: FILIAL, tro: resumo(tro), tela: resumo(tela), reload: resumo(r) };
    throw e;
  }
  const linhas = [];
  for (const m of xml.matchAll(/<r>([\s\S]*?)<\/r>/g)) {
    const dados = {};
    for (const c of m[1].matchAll(/<f(\d+)>([\s\S]*?)<\/f\1>/g)) {
      const nome = CAMPOS_088[c[1]];
      if (nome) dados[nome] = limpaOcultos(c[2]);
    }
    if (dados.placa) linhas.push({ placa: dados.placa, dados });
  }
  return linhas;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/saude") { res.writeHead(200, { "content-type": "text/plain", "x-versao": VERSAO, "x-fila": String(proximoTicket - ticketAtual) }); return res.end("ok"); }
  if (req.method !== "POST" || !["/gerar-455", "/baixar-455", "/relatorio", "/veiculos-088"].includes(url.pathname)) return send(res, 404, "nao encontrado");
  if (!process.env.BOT_TOKEN || req.headers["x-bot-token"] !== process.env.BOT_TOKEN) return send(res, 401, "nao autorizado");
  const vez = await entraNaFila();
  if (vez < 0) return send(res, 503, JSON.stringify({ etapa: "fila", erro: "Bot ocupado: espera na fila excedeu " + Math.round(FILA_MAX_ESPERA_MS / 1000) + "s." }), "application/json");
  let etapa = "inicio", diag;
  try {
    const s = new Sessao();
    etapa = "login"; await login(s);
    if (url.pathname === "/relatorio") { etapa = "relatorio"; return await relatorio(s, res, url.searchParams.get("rel") || "", url); }
    if (url.pathname === "/veiculos-088") {
      etapa = "veiculos-088";
      const data = url.searchParams.get("data") || ddmmaa(hojeBR());
      let linhas;
      try { linhas = await veiculosSituacao(s, data); }
      catch (e1) {
        if (!e1.diag) throw e1;
        // 1 nova tentativa com sessao limpa (cobre sessao invalida/instavel do SSW)
        await dorme(3000);
        const s2 = new Sessao(); await login(s2);
        try { linhas = await veiculosSituacao(s2, data); } catch (e2) { if (e2.diag) e2.diag.tentativa1 = e1.diag.reload; throw e2; }
      }
      res.writeHead(200, { "content-type": "application/json", "x-versao": VERSAO });
      return res.end(JSON.stringify({ data, linhas }));
    }
    if (url.pathname === "/baixar-455") {
      etapa = "fila";
      const alvo = (url.searchParams.get("usuario") || need("SSW_USUARIO")).toLowerCase();
      const l = (await fila(s)).find((x) => x.usuario === alvo && concluida(x));
      if (!l) throw new Error(`Nenhuma 455 concluida do usuario ${alvo}.`);
      etapa = "baixar"; return await baixa(s, res, l);
    }
    // /gerar-455
    const usuario = need("SSW_USUARIO").toLowerCase();
    etapa = "fila-baseline";
    const base = Math.max(0, ...(await fila(s)).filter((x) => x.usuario === usuario).map((x) => Number(x.sequencia)));
    etapa = "abrir-455"; await s.post("ssw0230", {});
    const dias = Math.min(Math.max(Number(url.searchParams.get("dias") || "3"), 1), 31);
    const fmt = (d) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCFullYear()).slice(2)}`;
    const hoje = new Date(Date.now() - 3 * 3600_000); // Brasilia
    const ini = new Date(hoje.getTime() - (dias - 1) * 86400_000);
    const campos = { act: "E1", cod_emp_ctb: "00", f3: "A", reg_tipo: "E", f5: "R", f8: "T", f11: fmt(ini), f12: fmt(hoje), f18: "T", f19: "T", f20: "S", f21: "X", f22: "T", f23: "A", f25: "T", f26: "A", f27: "A", f28: "T", ibscbs: "A", f29: "A", f30: "A", f35: url.searchParams.get("arq") || "E", f37: "A", basico: "N" };
    [...(url.searchParams.get("compl") || "ABF")].forEach((letra, i) => { campos[`f${37 + i}`] = letra; });
    try { Object.assign(campos, JSON.parse(url.searchParams.get("campos") || "{}")); } catch {}
    etapa = "enviar-455";
    const env = await s.post("ssw0230", campos);
    if (!/enviada para processamento/i.test(env.texto)) throw new Error("SSW nao confirmou o pedido: " + env.texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
    etapa = "esperar-conclusao";
    for (let t = 0; t < 60; t++) {
      await dorme(5000);
      const l = (await fila(s)).find((x) => x.usuario === usuario && Number(x.sequencia) > base && concluida(x));
      if (l) { etapa = "baixar"; return await baixa(s, res, l); }
    }
    throw new Error("A nova 455 nao concluiu a tempo (base " + base + ").");
  } catch (e) {
    send(res, 502, JSON.stringify({ etapa, erro: String(e.message || e), diag: e.diag || diag, versao: VERSAO }), "application/json");
  } finally {
    saiDaFila();
  }
}).listen(PORT, () => console.log(`grupolobo-ssw-bot na porta ${PORT}`));

function send(res, code, body, type = "text/plain") { res.writeHead(code, { "content-type": type }); res.end(body); }
