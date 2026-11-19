// Roda DENTRO da pagina do SSW (tms.ssw.inf.br), com a sessao do usuario: as chamadas sao do mesmo site, entao os cookies valem.
// Reproduz as chamadas do robo (ssw-bot/server-http.mjs): formularios POST em /bin/<programa>, fila do 156 e download do arquivo.
// NAO faz login e NAO guarda senha. Devolve ao service worker (background.js) o conteudo dos relatorios em base64.
(() => {
  if (window.__glImportadorSsw) return;
  window.__glImportadorSsw = true;

  // ---------- atividade do usuario (para nao trocar a unidade/opcao da sessao enquanto a pessoa trabalha) ----------
  let ultimaAtividade = Date.now();
  const marca = () => { ultimaAtividade = Date.now(); };
  const EVENTOS = ["mousedown", "keydown", "wheel", "touchstart", "input"];
  const ligar = (w) => { try { EVENTOS.forEach((e) => w.addEventListener(e, marca, true)); } catch { /* frame de outra origem */ } };
  const varrerFrames = () => {
    ligar(window);
    for (const f of document.querySelectorAll("iframe,frame")) {
      try { if (f.contentWindow && f.contentWindow.document) ligar(f.contentWindow); } catch { /* ignora */ }
    }
  };
  varrerFrames();
  setInterval(varrerFrames, 15000);

  // ---------- utilitarios ----------
  class ErroSsw extends Error {
    constructor(mensagem, codigo) { super(mensagem); this.codigo = codigo; }
  }
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  const ddmmaa = (d) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCFullYear()).slice(2)}`;
  const hojeBR = () => new Date(Date.now() - 3 * 3600e3);
  const atras = (d, n) => new Date(d.getTime() - n * 86400e3);
  const decodificaXml = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const decodificaUri = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

  function bytesParaB64(bytes) {
    let s = "";
    const n = 0x8000;
    for (let i = 0; i < bytes.length; i += n) s += String.fromCharCode.apply(null, bytes.subarray(i, i + n));
    return btoa(s);
  }

  // ---------- HTTP do SSW ----------
  async function post(prog, campos = {}) {
    const corpo = new URLSearchParams({ ...campos, dummy: String(Date.now()) }).toString();
    const r = await fetch(`/bin/${prog}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpo,
    });
    if (r.status === 403) throw new ErroSsw("O SSW respondeu 403 (acesso recusado).", 403);
    const buf = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, buf, texto: new TextDecoder("windows-1252").decode(buf) };
  }

  async function get(caminho) {
    const r = await fetch(`/bin/${caminho}`, { credentials: "include" });
    if (r.status === 403) throw new ErroSsw("O SSW respondeu 403 (acesso recusado).", 403);
    return { status: r.status, buf: new Uint8Array(await r.arrayBuffer()) };
  }

  // Fila do 156: linhas <r><f0>seq</f0><f1>opcao</f1><f2>data</f2><f3>usuario</f3>...<f6>situacao</f6>...
  async function fila(prefixo = "") {
    const r = await post("ssw1440", {});
    const linhas = [];
    for (const m of r.texto.matchAll(/<r>([\s\S]*?)<\/r>/g)) {
      const f = {};
      for (const c of m[1].matchAll(/<f(\d+)>([\s\S]*?)<\/f\1>/g)) f[c[1]] = decodificaXml(c[2]).trim();
      if (f[0] && /^\d+$/.test(f[0]) && (!prefixo || (f[1] || "").startsWith(prefixo))) {
        linhas.push({ sequencia: f[0], opcao: f[1] || "", solicitado: f[2], usuario: (f[3] || "").toLowerCase(), situacao: f[6] || "" });
      }
    }
    if (!linhas.length && !/xmlsr/.test(r.texto)) throw new ErroSsw("Sessão do SSW expirada ou fila do 156 indisponível. Entre no SSW novamente.", "sessao");
    return linhas;
  }
  const concluida = (l) => /conclu/i.test(l.situacao);
  const maiorSequencia = (linhas, usuario) => Math.max(0, ...linhas.filter((x) => x.usuario === usuario).map((x) => Number(x.sequencia)));

  // Passo 2 do download: a resposta traz abrir('arquivo','arquivo',1,1,'/caminho/',4); depois GET em ssw0424 entrega o arquivo.
  async function entregaDireta(webBody) {
    const m = decodificaUri(webBody).match(/abrir\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\d+\s*,\s*\d+\s*,\s*'([^']*)'/);
    if (!m) throw new ErroSsw("Resposta do SSW sem arquivo.");
    const r = await get(`ssw0424?act=${encodeURIComponent(m[1])}&filename=${encodeURIComponent(m[1])}&path=${m[3]}&down=1&nw=1`);
    const inicio = new TextDecoder("windows-1252").decode(r.buf.subarray(0, 40));
    if (r.status !== 200 || !r.buf.length || /^\s*<(!|html)/i.test(inicio)) { const trecho = new TextDecoder("windows-1252").decode(r.buf.subarray(0, 1500)).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120); throw new ErroSsw(`Download inválido (status ${r.status}, ${r.buf.length} bytes, arquivo ${m[1]}): ${trecho || "vazio"}`); }
    return { buf: r.buf, arquivo: m[1] };
  }

  async function baixaJob(job) {
    const r1 = await post("ssw1440", { act: "DOW" + job.sequencia });
    const wb = r1.texto.match(/name=web_body[^>]*value="([^"]+)"/)?.[1];
    if (!wb) throw new ErroSsw(`SSW não devolveu o arquivo do job ${job.sequencia}.`);
    return await entregaDireta(wb);
  }

  async function esperarJob(prefixo, usuario, base) {
    const limite = Date.now() + 10 * 60e3; // 10 min de relogio (nao de voltas: cada consulta da fila tambem demora); o 441 de liquidadas passa de 5 min
    while (Date.now() < limite) {
      await dorme(5000);
      const j = (await fila(prefixo)).find((x) => x.usuario === usuario && Number(x.sequencia) > base && concluida(x));
      if (j) return j;
    }
    return null;
  }

  // ---------- relatorios (iguais ao RELATORIOS do robo) ----------
  const FAT441 = (data, sit, dias) => ({ op: "441", prog: "ssw0049", dias, campos: (ini, fim) => ({ act: "ANA", rel_sin_fg_data: "E", rel_sin_per_pesq_ini: fim, rel_sin_per_pesq_fin: fim, rel_sin_classificacao: "F", rel_sin_sit_fat: "T", rel_sin_fg_fat_desc: "I", tp_arquivo: "C", rel_ana_fg_data: data, rel_ana_per_pesq_ini: ini, rel_ana_per_pesq_fin: fim, rel_ana_class_nro_fat: "X", rel_ana_sit_fat: sit, rel_ana_crit_adc: "T", rel_ana_fg_fat_desc: "I", rel_ana_fg_lista_ocor: "N", rel_ana_fg_ctrc_fob_dir: "N", tp_cobranca: "A", rel_ana_vlr_max_fat: "9.999.999,99", rel_ana_periodicidade: "T", rel_ana_arq_excel: "S" }) });
  const definicoes = (filial) => ({
    "fat-emissao": { ...FAT441("E", "T", 31), tipo: "441" },
    "fat-pendentes": { ...FAT441("V", "P", 364), tipo: "441" },
    "fat-liquidadas": { ...FAT441("L", "L", 31), tipo: "441" },
    liquidados: { op: "411", prog: "ssw0309", dias: 31, tipo: "411", campos: (ini, fim) => ({ act: "EXC", cod_emp_ctb: "01", f2: ini, f3: fim, f10: "T", f11: "T" }) },
    "a-faturar": { op: "435", prog: "ssw0103", dias: 0, tipo: "435", campos: (_ini, fim) => ({ act: "PES", cod_emp_ctb: "01", t_data_ref_ini: "010101", t_data_ref_fim: fim, t_tp_fil: "C", t_tp_cliente: "C", t_tp_cli_fat: "T", t_situacao_ctrc: "I", t_periodicidade: "T", t_rel_lista: "T", t_cons_bloqueados: "N", t_cons_a_vista: "N", t_tp_classificacao: "F", t_excel: "S", t_ler_morto: "N" }) },
    "036": { op: "036", prog: "ssw0146", dias: 30, unidade: filial, tipo: "036", campos: (ini, fim) => ({ act: "REL2", t_sigla_rom: filial, t_nro_rom: "", t_cod_barras_rom: "", t_ciot: "", t_ser_mdfe: "", t_nro_mdfe: "", t_excel: "S", t_unidade: filial, t_placa_veic: "", t_cpf_motorista: "", t_dt_ini: ini, t_dt_fin: fim }) },
  });

  async function relatorio(rel, cfg) {
    const def = definicoes(cfg.filial)[rel];
    if (!def) throw new ErroSsw(`Relatório desconhecido: ${rel}`);
    const usuario = cfg.usuario;
    const base = maiorSequencia(await fila(""), usuario);
    const fim = hojeBR();
    const ini = atras(fim, Math.max(def.dias, 1) - 1);
    // 036 precisa da filial; os financeiros seguem na matriz (MTZ), como no robo.
    await post("menu01", { act: "TRO", f2: def.unidade || "MTZ", f3: def.op });
    await post(def.prog, { sequencia: def.op });
    const r = await post(def.prog, def.campos(ddmmaa(ini), ddmmaa(fim)));
    const wb = r.texto.match(/name=web_body[^>]*value="([^"]+)"/)?.[1];
    let arquivo, sequenciaJob = "";
    if (wb) {
      arquivo = await entregaDireta(wb);
    } else if (/enviada\s+para\s+processamento|enviada%20para/i.test(r.texto)) {
      const job = await esperarJob(def.op, usuario, base);
      if (!job) throw new ErroSsw(`O relatório ${rel} não concluiu a tempo.`);
      arquivo = await baixaJob(job);
      sequenciaJob = job.sequencia;
    } else {
      throw new ErroSsw("SSW não entregou o relatório: " + decodificaUri(r.texto).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
    }
    const periodo = `${ddmmaa(ini)}-${ddmmaa(fim)}`;
    return {
      relatorio: rel,
      tipoImport: def.tipo,
      nome: arquivo.arquivo || `${rel}.txt`,
      b64: bytesParaB64(arquivo.buf),
      // 036: periodo; financeiro: "<relatorio> <periodo>" (igual ao fluxo do n8n)
      referencia: def.tipo === "036" ? periodo : null,
      sequencia: def.tipo === "036" ? null : `${rel} ${periodo}`,
      sequenciaJob,
    };
  }

  async function gerar455(janela, cfg) {
    const usuario = cfg.usuario;
    const base = maiorSequencia(await fila("455"), usuario);
    await post("ssw0230", {});
    const campos = { act: "E1", cod_emp_ctb: "00", f3: "A", reg_tipo: "E", f5: "R", f8: "T", f11: janela.f11, f12: janela.f12, f18: "T", f19: "T", f20: "S", f21: "X", f22: "T", f23: "A", f25: "T", f26: "A", f27: "A", f28: "T", ibscbs: "A", f29: "A", f30: "A", f35: "E", f37: "A", f38: "B", f39: "F", basico: "N" };
    if (cfg.filial) campos.f2 = cfg.filial; // Macklog: sem filial na 455 (o robo dela nao envia f2)
    const env = await post("ssw0230", campos);
    if (!/enviada para processamento/i.test(env.texto)) throw new ErroSsw("SSW não confirmou o pedido da 455: " + env.texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
    const job = await esperarJob("455", usuario, base);
    if (!job) throw new ErroSsw(`A nova 455 não concluiu a tempo (base ${base}).`);
    const arquivo = await baixaJob(job);
    return { relatorio: "455", tipoImport: "455", nome: arquivo.arquivo || "455.txt", b64: bytesParaB64(arquivo.buf), referencia: null, sequencia: job.sequencia, sequenciaJob: job.sequencia, janela: `${janela.f11}-${janela.f12}` };
  }

  // Janelas da 455: SSW aceita no maximo 31 dias por pedido; 30 dias cada (igual ao fluxo do n8n).
  function janelas455(quantidade, dias) {
    const fmt = ddmmaa;
    const hoje = hojeBR();
    // Macklog: uma janela de `dias` dias terminando hoje (3 ou 30)
    if (dias) return [{ f11: fmt(atras(hoje, Math.min(Math.max(dias, 1), 31) - 1)), f12: fmt(hoje) }];
    const out = [];
    for (let k = 0; k < quantidade; k++) {
      const fim = new Date(hoje.getTime() - k * 30 * 86400e3);
      const ini = new Date(fim.getTime() - 29 * 86400e3);
      out.push({ f11: fmt(ini), f12: fmt(fim) });
    }
    return out;
  }

  // ---------- execucao de uma tarefa ----------
  let executando = false;
  async function executar(msg) {
    const { jobId, def, cfg } = msg;
    const enviar = (item) => chrome.runtime.sendMessage({ acao: "parcial", jobId, item });
    const lista = def.tipo === "036" ? [{ rel: "036" }]
      : def.tipo === "455" ? janelas455(def.janelas || 1, def.dias).map((j) => ({ janela: j }))
      : ["a-faturar", "fat-emissao", "fat-pendentes", "fat-liquidadas", "liquidados"].map((rel) => ({ rel }));
    for (const alvo of lista) {
      try {
        const item = alvo.janela ? await gerar455(alvo.janela, cfg) : await relatorio(alvo.rel, cfg);
        await enviar(item);
      } catch (e) {
        await enviar({ relatorio: alvo.rel || `455 ${alvo.janela?.f11}-${alvo.janela?.f12}`, tipoImport: alvo.rel ? definicoes(cfg.filial)[alvo.rel]?.tipo : "455", erro: String(e.message || e), codigo: e.codigo || null });
        // 403 ou sessao expirada: nao adianta continuar a tarefa
        if (e.codigo === 403 || e.codigo === "sessao") break;
      }
    }
    chrome.runtime.sendMessage({ acao: "fim", jobId });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
    if (msg?.acao === "ocioso") { responder({ segundos: Math.round((Date.now() - ultimaAtividade) / 1000), executando }); return; }
    if (msg?.acao === "ping") { responder({ ok: true, url: location.href }); return; }
    if (msg?.acao === "executar") {
      if (executando) { responder({ ok: false, ocupado: true }); return; }
      executando = true;
      responder({ ok: true });
      executar(msg)
        .catch((e) => chrome.runtime.sendMessage({ acao: "parcial", jobId: msg.jobId, item: { relatorio: msg.def?.tipo, erro: String(e.message || e), codigo: e.codigo || null } }))
        .finally(() => { executando = false; });
    }
  });
})();
