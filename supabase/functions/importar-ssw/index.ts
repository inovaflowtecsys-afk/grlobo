import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient, json, options, requireAdmin } from "../_shared/profissionais.ts";
import { DESTINOS, detectar, type Tipo } from "../_shared/ssw_deteccao.ts";
import { chamarSync, sha256, textoOuNulo } from "../_shared/ssw_importacao.ts";

// Importacao manual de relatorios SSW (GrupoLobo).
//
//   POST /functions/v1/importar-ssw   (Authorization: Bearer <JWT do usuario logado>; so administradores)
//
//   { "modo": "validar",  "nome": "arquivo.txt", "conteudo": "<texto>", "tipo"?: "036|455|441|411", "referencia"?: "...", "sequencia"?: "..." }
//        Reconhece o tipo, conta as linhas e REGISTRA o resultado em public.ssw_importacoes (status validado ou recusado).
//        Nao grava nenhum dado de relatorio.
//   { "modo": "importar", "importacao_id": "<uuid>", "nome": "...", "conteudo": "<o mesmo texto>", "referencia"?: "...", "sequencia"?: "..." }
//        So para registros "validado". Confere que o arquivo e o MESMO que foi validado (hash) e entao chama a funcao de
//        sincronizacao ja existente (sync-ssw-036 / sync-ssw-455 / sync-ssw-financeiro), a mesma do modo automatico.
//
// Deploy: supabase functions deploy importar-ssw --no-verify-jwt   (a sessao e o perfil de administrador sao validados aqui).
// A importacao AUTOMATICA (extensao do navegador) fica na funcao importar-ssw-auto, que usa os mesmos modulos de _shared.

const MAX_CHARS = 20_000_000;

serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  try {
    const admin = getAdminClient();
    const auth = await requireAdmin(request, admin);
    if (auth.error || !auth.user) return auth.error ?? json({ error: "Sessão inválida." }, 401);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Corpo inválido." }, 400);

    const modo = String(body.modo || "");
    const nome = String(body.nome || "").slice(0, 300);
    const conteudo = typeof body.conteudo === "string" ? body.conteudo : "";
    if (!nome) return json({ error: "Informe o nome do arquivo." }, 400);
    if (conteudo.length > MAX_CHARS) return json({ error: "Arquivo grande demais." }, 413);

    const hash = await sha256(conteudo);
    const tamanho = new TextEncoder().encode(conteudo).length;
    const usuario = { id: auth.user.id, nome: auth.user.email ?? auth.user.id };

    if (modo === "validar") return await validar(admin, usuario, { nome, conteudo, hash, tamanho, body });
    if (modo === "importar") return await importar(admin, usuario, { nome, conteudo, hash, body });
    return json({ error: "Informe modo=validar ou modo=importar." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});

type Admin = ReturnType<typeof getAdminClient>;
type Usuario = { id: string; nome: string };

async function validar(admin: Admin, usuario: Usuario, p: { nome: string; conteudo: string; hash: string; tamanho: number; body: Record<string, unknown> }) {
  const tipoInformado = p.body.tipo ? String(p.body.tipo) : "";
  const det = detectar(p.conteudo, tipoInformado || undefined);

  const avisos = [...det.avisos];
  const { data: antes } = await admin
    .from("ssw_importacoes")
    .select("importado_em")
    .eq("hash_sha256", p.hash)
    .eq("status", "importado")
    .order("importado_em", { ascending: false })
    .limit(1);
  if (antes?.length) {
    avisos.push(`Este mesmo arquivo já foi importado em ${new Date(antes[0].importado_em as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Importar de novo não duplica dados (a gravação atualiza por chave).`);
  }

  const status = !det.motivo && (det.tipo in DESTINOS) ? "validado" : "recusado";
  const referencia = textoOuNulo(p.body.referencia) ?? det.referencia ?? null;
  const sequencia = textoOuNulo(p.body.sequencia);

  const { data, error } = await admin
    .from("ssw_importacoes")
    .insert({
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      nome_arquivo: p.nome,
      tamanho_bytes: p.tamanho,
      hash_sha256: p.hash,
      tipo: det.tipo,
      tipo_informado: tipoInformado && tipoInformado !== "auto" ? tipoInformado : null,
      status,
      motivo: det.motivo ?? null,
      referencia,
      sequencia,
      linhas: det.linhas,
      cabecalho: det.cabecalho.slice(0, 80),
      avisos,
      origem: "manual",
    })
    .select("*")
    .single();
  if (error) throw new Error(`Não foi possível registrar o log: ${error.message}`);
  return json({ ok: true, importacao: data });
}

async function importar(admin: Admin, usuario: Usuario, p: { nome: string; conteudo: string; hash: string; body: Record<string, unknown> }) {
  const id = String(p.body.importacao_id || "");
  if (!id) return json({ error: "Informe importacao_id." }, 400);

  const { data: reg, error: erroReg } = await admin.from("ssw_importacoes").select("*").eq("id", id).maybeSingle();
  if (erroReg || !reg) return json({ error: "Validação não encontrada. Valide o arquivo de novo." }, 404);
  if (reg.status === "importado") return json({ error: "Este arquivo já foi importado nesta validação." }, 409);
  if (reg.status !== "validado") return json({ error: "Só arquivos validados podem ser importados." }, 409);
  if (reg.hash_sha256 !== p.hash) return json({ error: "O arquivo enviado não é o mesmo que foi validado. Valide de novo." }, 409);

  const destino = DESTINOS[reg.tipo as Tipo];
  if (!destino) return json({ error: "Tipo de relatório não permitido para importação." }, 422);

  const referencia = textoOuNulo(p.body.referencia) ?? reg.referencia ?? null;
  const sequencia = textoOuNulo(p.body.sequencia) ?? reg.sequencia ?? null;
  const parametro = destino.param === "referencia" ? referencia : sequencia;

  const agora = new Date().toISOString();
  await admin.from("ssw_importacoes").update({ autorizado_em: agora, autorizado_por: usuario.id, referencia, sequencia, atualizado_em: agora }).eq("id", id);

  const r = await chamarSync(destino, p.conteudo, parametro);

  const fim = new Date().toISOString();
  const { data, error } = await admin
    .from("ssw_importacoes")
    .update(
      r.ok
        ? { status: "importado", motivo: null, linhas: r.contagem.linhas || reg.linhas, novos: r.contagem.novos, atualizados: r.contagem.atualizados, iguais: r.contagem.iguais, importado_em: fim, atualizado_em: fim }
        : { status: "erro", motivo: r.erro.slice(0, 500), atualizado_em: fim },
    )
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Importação executada, mas o log falhou: ${error.message}`);
  return json({ ok: r.ok, importacao: data, error: r.ok ? undefined : r.erro });
}
