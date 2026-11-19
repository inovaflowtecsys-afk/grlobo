const $ = (id) => document.getElementById(id);

async function carregar() {
  const { cfg } = await chrome.storage.local.get("cfg");
  const c = cfg || {};
  $("perfil").value = c.perfil || "grupolobo";
  $("usuario").value = c.usuario || "";
  $("token").value = c.token || "";
  $("filial").value = c.filial || "SJP";
  $("ocioso").value = c.ociosoSeg ?? 90;
  $("ignorar").checked = !!c.ignorarAtividade;
  const h = c.habilitados || {};
  $("h036").checked = h["036"] !== false;
  $("h455").checked = h["455"] !== false;
  $("hfin").checked = h.financeiro !== false;
}

$("salvar").onclick = async () => {
  const { cfg: antigo } = await chrome.storage.local.get("cfg");
  const cfg = {
    ...(antigo || {}),
    perfil: $("perfil").value,
    usuario: $("usuario").value.trim(),
    token: $("token").value.trim(),
    // Macklog nao usa filial; Grupo Lobo: SJP por padrao
    filial: $("perfil").value === "macklog" ? $("filial").value.trim().toUpperCase() : ($("filial").value.trim() || "SJP").toUpperCase(),
    ociosoSeg: Math.max(0, Math.min(900, Number($("ocioso").value) || 90)),
    ignorarAtividade: $("ignorar").checked,
    habilitados: { "036": $("h036").checked, "455": $("h455").checked, financeiro: $("hfin").checked },
  };
  await chrome.storage.local.set({ cfg });
  chrome.runtime.sendMessage({ acao: "cfgSalva" });
  $("ok").textContent = "Salvo.";
  setTimeout(() => ($("ok").textContent = ""), 2500);
};

$("perfil").onchange = () => { $("filial").value = $("perfil").value === "macklog" ? "" : "SJP"; };

carregar();
