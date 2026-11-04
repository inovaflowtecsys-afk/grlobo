import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.15";
import { getAdminClient, json, options } from "../_shared/profissionais.ts";

// Chamada pelo pg_cron (ssw_verificar_coleta) quando ha e-mail pendente. verify_jwt fica desligado no deploy.
// Nao recebe dados: so envia o que ja esta registrado em public.ssw_alertas e ainda nao foi enviado,
// entao chamar de novo nao gera e-mail repetido.

const N8N_URL = "https://inovaflowtec-n8n.gcpffo.easypanel.host";
const NOMES: Record<string, string> = { "036": "SSW 036 (romaneios)", "455": "SSW 455 (conhecimentos)" };
const CADENCIA: Record<string, string> = { "036": "a cada 10 minutos", "455": "de hora em hora (minuto :07)" };

const brt = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "sem registro";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function duracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function montar(a: any, tipo: "aviso" | "resolucao") {
  const nome = NOMES[a.relatorio] ?? a.relatorio;
  const linhas =
    tipo === "aviso"
      ? [
          `A coleta do relatório ${nome} está parada.`,
          "",
          `Sem carga concluída há ${duracao(a.minutos_sem_carga)} (limite: ${a.limite_minutos} min; cadência normal: ${CADENCIA[a.relatorio]}).`,
          `Última carga com sucesso: ${brt(a.ultima_carga_ok)}`,
          `Alerta aberto em: ${brt(a.aberto_em)}`,
          "",
          "Onde verificar:",
          `- n8n (execuções do workflow): ${N8N_URL}`,
          "- EasyPanel: serviço do n8n, banco do n8n (Postgres) e bot do SSW",
          "- Já houve quedas do banco do n8n (erro 503 \"Database is not ready\"). Se o n8n responde 503, reinicie o banco e depois o n8n, e reative os workflows se os agendamentos não voltarem.",
          "",
          "Enquanto a coleta estiver parada, o DPE e os demais indicadores ficam desatualizados.",
        ]
      : [
          `A coleta do relatório ${nome} voltou ao normal.`,
          "",
          `Duração da parada: cerca de ${duracao(a.minutos_parado ?? 0)}.`,
          `Alerta aberto em: ${brt(a.aberto_em)}`,
          `Normalizada em: ${brt(a.resolvido_em)}`,
        ];
  const assunto =
    tipo === "aviso"
      ? `[Grupo Lobo] Coleta ${nome} parada há ${duracao(a.minutos_sem_carga)}`
      : `[Grupo Lobo] Coleta ${nome} normalizada`;
  const cor = tipo === "aviso" ? "#c54852" : "#15803d";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#0a1119">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e6ebf2">
    <h2 style="margin:0 0 4px 0;color:#12437f">Grupo Lobo</h2>
    <p style="margin:0 0 16px 0;font-weight:700;color:${cor}">${esc(tipo === "aviso" ? "Alerta de coleta parada" : "Coleta normalizada")}</p>
    ${linhas.map((l) => (l ? `<p style="margin:0 0 8px 0;font-size:14px">${esc(l)}</p>` : `<div style="height:8px"></div>`)).join("")}
  </div></body></html>`;
  return { assunto, text: linhas.join("\n"), html };
}

serve(async (request) => {
  if (request.method === "OPTIONS") return options();

  try {
    const admin = getAdminClient();

    const { data: pendentes, error } = await admin
      .from("ssw_alertas")
      .select("*")
      .or("and(email_aviso_enviado_em.is.null,email_aviso_tentativas.lt.5),and(resolvido_em.not.is.null,email_aviso_enviado_em.not.is.null,email_resolucao_enviado_em.is.null,email_resolucao_tentativas.lt.5)")
      .order("id")
      .limit(20);
    if (error) throw new Error(error.message);
    if (!pendentes?.length) return json({ enviados: 0 });

    const { data: cfg, error: cfgErro } = await admin
      .from("configuracao_email")
      .select("smtp_host,smtp_porta,smtp_usuario,smtp_senha,smtp_ssl,smtp_remetente,smtp_nome_remetente")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cfgErro) throw new Error(cfgErro.message);
    if (!cfg) throw new Error("Configuração de e-mail não encontrada.");

    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: Number(cfg.smtp_porta),
      secure: Boolean(cfg.smtp_ssl),
      auth: { user: cfg.smtp_usuario, pass: cfg.smtp_senha },
    });

    let enviados = 0;
    for (const a of pendentes) {
      // aviso primeiro; a normalizacao so depois de o aviso ter saido
      const tipo: "aviso" | "resolucao" = a.email_aviso_enviado_em ? "resolucao" : "aviso";
      const msg = montar(a, tipo);
      const campos = tipo === "aviso"
        ? { enviado: "email_aviso_enviado_em", tentativas: "email_aviso_tentativas", erro: "email_aviso_erro" }
        : { enviado: "email_resolucao_enviado_em", tentativas: "email_resolucao_tentativas", erro: "email_resolucao_erro" };
      try {
        await transporter.sendMail({
          from: `"${cfg.smtp_nome_remetente || "Grupo Lobo"}" <${cfg.smtp_remetente}>`,
          to: a.email_destino,
          subject: msg.assunto,
          text: msg.text,
          html: msg.html,
        });
        await admin.from("ssw_alertas").update({ [campos.enviado]: new Date().toISOString(), [campos.erro]: null }).eq("id", a.id);
        enviados += 1;
      } catch (e) {
        const texto = e instanceof Error ? e.message : String(e);
        console.error(`falha ao enviar ${tipo} do alerta ${a.id}:`, texto);
        await admin.from("ssw_alertas").update({ [campos.tentativas]: (a[campos.tentativas] ?? 0) + 1, [campos.erro]: texto.slice(0, 500) }).eq("id", a.id);
      }
    }
    return json({ enviados });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
