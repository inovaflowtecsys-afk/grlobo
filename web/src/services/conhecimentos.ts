import { supabase } from "../lib/supabase";
import { numerosDasNotas } from "../lib/conhecimentoFormat";
import { type ConhecimentoListItem, type ConhecimentosQuery, type NotaFiscal, OCORRENCIAS_INSUCESSO } from "../types/conhecimento";

const LIST_COLUMNS =
  "dominio,chave_linha,ctrc,cte,chave_cte,tipo_conhecimento,data_autorizacao,remetente_nome,remetente_cnpj,destinatario_nome,destinatario_cnpj," +
  "entrega_cidade,entrega_uf,numero_nf,volumes,peso_real_kg,valor_frete,previsao_entrega,entrega_programada,data_entrega,data_cancelamento," +
  "unidade_origem,unidade_destino,rota,localizacao_atual,atualizado_em,agendado,status_entrega,situacao_prazo,dias_atraso," +
  "ocorrencia_codigo,ocorrencia_descricao,ocorrencia_data,ocorrencia_unidade,qtd_notas,placa_entrega";

// vírgula, parênteses, % e * têm significado nos filtros .or()/.ilike do PostgREST
const limpar = (valor: string) => valor.replace(/[,()%*\\]/g, " ").trim();

export async function listConhecimentos(query: ConhecimentosQuery) {
  const from = (query.page - 1) * query.pageSize;

  let request = supabase.from("ssw_455_conhecimentos").select(LIST_COLUMNS, { count: "exact" });

  const busca = limpar(query.busca).replace(/\s+/g, "");
  if (busca) {
    // Busca por número: procura em todo o histórico, sem filtro de período.
    const campos = [`ctrc.ilike.%${busca}%`, `cte.ilike.%${busca}%`, `numero_nf.ilike.%${busca}%`];
    if (busca.replace(/\D/g, "").length >= 20) campos.push(`chave_cte.ilike.%${busca}%`);
    request = request.or(campos.join(","));
  } else {
    if (query.de) request = request.gte("data_autorizacao", query.de);
    if (query.ate) request = request.lte("data_autorizacao", query.ate);
  }

  const remetente = limpar(query.remetente);
  if (remetente) request = filtroPessoa(request, "remetente", remetente);
  const destinatario = limpar(query.destinatario);
  if (destinatario) request = filtroPessoa(request, "destinatario", destinatario);

  if (query.status === "INSUCESSO") {
    // em aberto cuja última ocorrência é de insucesso
    request = request.eq("status_entrega", "EM_ABERTO").in("ocorrencia_codigo", [...OCORRENCIAS_INSUCESSO]);
  } else if (query.status === "EM_ABERTO") {
    // pendente de entrega = em aberto sem ocorrência de insucesso (código vazio também conta)
    request = request.eq("status_entrega", "EM_ABERTO").or(`ocorrencia_codigo.is.null,ocorrencia_codigo.not.in.(${OCORRENCIAS_INSUCESSO.join(",")})`);
  } else if (query.status) {
    request = request.eq("status_entrega", query.status);
  }
  if (query.prazo) request = request.eq("situacao_prazo", query.prazo);
  if (query.agendamento) request = request.eq("agendado", query.agendamento === "sim");

  const { data, error, count } = await request
    .order(query.sortBy, { ascending: query.sortDirection === "asc", nullsFirst: false })
    .order("chave_linha", { ascending: true })
    .range(from, from + query.pageSize - 1);
  if (error) throw error;

  return { data: (data ?? []) as unknown as ConhecimentoListItem[], count: count ?? 0 };
}

// Nome parcial ou CNPJ (só dígitos), no remetente ou no destinatário.
function filtroPessoa<T extends { or: (filtros: string) => T }>(request: T, lado: "remetente" | "destinatario", termo: string) {
  const digitos = termo.replace(/\D/g, "");
  const filtros = [`${lado}_nome.ilike.%${termo}%`];
  if (digitos.length >= 6) filtros.push(`${lado}_cnpj.ilike.%${digitos}%`);
  return request.or(filtros.join(","));
}

/** Todos os campos do 455 de um conhecimento (o jsonb completo), carregado só quando o popup abre. */
export async function getConhecimentoDados(dominio: string, chaveLinha: string) {
  const { data, error } = await supabase.from("ssw_455_ctrcs").select("dados").eq("dominio", dominio).eq("chave_linha", chaveLinha).maybeSingle();
  if (error) throw error;
  return (data?.dados ?? null) as Record<string, string> | null;
}

/** Todas as notas fiscais do conhecimento, com série e (quando o SSW traz uma chave por nota) a chave de acesso. */
export async function getNotasFiscais(dominio: string, chaveLinha: string, numeroNf: string | null): Promise<NotaFiscal[]> {
  const { data, error } = await supabase.from("ssw_455_ctrcs").select("notas_fiscais_json").eq("dominio", dominio).eq("chave_linha", chaveLinha).maybeSingle();
  if (error) throw error;

  const json = (data?.notas_fiscais_json ?? null) as NotaFiscal[] | null;
  if (json?.length) return json;
  return numerosDasNotas(numeroNf).map((numero) => ({ nota: numero, serie: null, numero, chave: null }));
}

/** Um conhecimento da lista pelo número do CTRC (usado ao abrir os detalhes a partir do painel de entregas). */
export async function getConhecimentoPorCtrc(ctrc: string) {
  const [conhecimento, painel] = await Promise.all([
    supabase.from("ssw_455_conhecimentos").select(LIST_COLUMNS).eq("ctrc", ctrc).order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ctrc_painel").select("atualizado_em,rom_ocorrencia_ctrc_codigo,rom_ocorrencia_ctrc_descricao,rom_ocorrencia_ctrc_data,rom_ocorrencia_codigo,rom_ocorrencia_descricao,rom_ocorrencia_data,ultima_ocorrencia_codigo").eq("ctrc", ctrc).order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (conhecimento.error) throw conhecimento.error;
  if (painel.error) throw painel.error;
  if (!conhecimento.data) return null;

  const base = conhecimento.data as unknown as ConhecimentoListItem;
  const p = painel.data as {
    atualizado_em: string | null;
    rom_ocorrencia_ctrc_codigo: string | null;
    rom_ocorrencia_ctrc_descricao: string | null;
    rom_ocorrencia_ctrc_data: string | null;
    rom_ocorrencia_codigo: string | null;
    rom_ocorrencia_descricao: string | null;
    rom_ocorrencia_data: string | null;
    ultima_ocorrencia_codigo: string | null;
  } | null;
  if (!p) return base;

  const ocorrenciaCodigo = p.rom_ocorrencia_ctrc_codigo || p.rom_ocorrencia_codigo || p.ultima_ocorrencia_codigo || base.ocorrencia_codigo;
  const ocorrenciaDescricao = p.rom_ocorrencia_ctrc_descricao || p.rom_ocorrencia_descricao || base.ocorrencia_descricao;
  const ocorrenciaData = p.rom_ocorrencia_ctrc_data || p.rom_ocorrencia_data || base.ocorrencia_data;
  return {
    ...base,
    atualizado_em: p.atualizado_em && new Date(p.atualizado_em) > new Date(base.atualizado_em) ? p.atualizado_em : base.atualizado_em,
    ocorrencia_codigo: ocorrenciaCodigo,
    ocorrencia_descricao: ocorrenciaDescricao,
    ocorrencia_data: ocorrenciaData,
  };
}
