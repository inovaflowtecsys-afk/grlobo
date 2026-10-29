import { formatarCampo } from "./conhecimentoFormat";

// Organiza as ~170 colunas do relatório 455 em grupos legíveis para o popup do conhecimento.
// A primeira regra que casar com a chave define o grupo; o que não casar vai para "Outros".

export type GrupoCampos = { titulo: string; campos: { chave: string; rotulo: string; valor: string }[] };

const GRUPOS: { titulo: string; regra: RegExp }[] = [
  { titulo: "Prazo e entrega", regra: /^(previsao_de_entrega|entrega_programada|data_da_entrega_realizada|quantidade_de_dias_de_atraso|local_de_entrega|data_da_liquidacao|tipo_de_baixa|data_do_cancelamento|motivo_do_cancelamento|cidade_de_entrega|uf_de_entrega|cep_de_entrega|endereco|bairro)$/ },
  { titulo: "Remetente", regra: /remetente/ },
  { titulo: "Destinatário", regra: /destinatario/ },
  { titulo: "Recebedor", regra: /recebedor/ },
  { titulo: "Pagador", regra: /pagador/ },
  { titulo: "Expedidor", regra: /expedidor/ },
  { titulo: "Última ocorrência", regra: /ocorrencia/ },
  { titulo: "Mercadoria e carga", regra: /^(mercadoria|especie|volumes|quantidade_de_|peso_|cubagem_|valor_da_mercadoria|notas_fiscais|numero_da_nota_fiscal|chaves_nf_es|numero_dos_pedidos|capa_de_canhoto_de_nf|volume_cliente_shipment|co2$)/ },
  { titulo: "Frete, taxas e impostos", regra: /^(valor_|frete_|adicional_|aliquota|base_calculo|imposto_|gris$|cat$|tde$|tda$|tdc$|trt$|tar$|tas$|rdc$|itr$|pos$|pedagio$|despacho$|coleta$|capatazia$|separacao$|paletizacao$|outros$|suframa$|reembolso$|redespacho_|seguro_|dev_canhoto_nf$|agendamento$|abc_pagador$)/ },
  { titulo: "Transporte e rota", regra: /(manifesto|romaneio|placa_|praca_|setor_|unidade_|veiculo_|conferente_|localizacao_atual|cidade_origem_da_prestacao|uf_origem_da_prestacao)/ },
  { titulo: "Identificação do documento", regra: /^(serie_numero|chave_ct_e|tipo_do_documento|tipo_de_calculo|tabela_de_calculo|numero_de_controle|modalidade|tipo_do_frete|cfop$|login$|data_de_|hora_de_|lote_rps|inscricao_unidade_emissora|codigo_dos_correios|segmento_do_pagador)/ },
];

const ORDEM_GRUPOS = ["Identificação do documento", "Prazo e entrega", "Remetente", "Destinatário", "Recebedor", "Pagador", "Expedidor", "Mercadoria e carga", "Frete, taxas e impostos", "Transporte e rota", "Última ocorrência", "Outros"];

const SIGLAS = new Set(["cnpj", "cep", "uf", "icms", "iss", "ibs", "cbs", "cfop", "rps", "ie", "ntc", "gris", "cat", "tde", "tda", "tdc", "trt", "tas", "tar", "rdc", "itr", "pos", "abc", "co2", "ctrc", "cte", "nf"]);

// O SSW exporta os nomes de coluna sem acento; aqui voltam a ser legíveis.
const ACENTOS: Record<string, string> = {
  autorizacao: "autorização", emissao: "emissão", numero: "número", serie: "série", calculo: "cálculo", previsao: "previsão",
  ocorrencia: "ocorrência", localizacao: "localização", endereco: "endereço", praca: "praça", especie: "espécie", liquidacao: "liquidação",
  codigo: "código", inscricao: "inscrição", aliquota: "alíquota", pedagio: "pedágio", paletizacao: "paletização", separacao: "separação",
  prestacao: "prestação", inclusao: "inclusão", veiculo: "veículo", ultimo: "último", ultima: "última", usuario: "usuário", destinatario: "destinatário",
  responsavel: "responsável", mercadoria: "mercadoria", dedicado: "dedicado", complemento: "complemento", base: "base", calculo_: "cálculo",
  m3: "m³", canhoto: "canhoto", pedidos: "pedidos", rodoviario: "rodoviário", despacho: "despacho", tabela: "tabela", unidade: "unidade", cancelamento: "cancelamento",
};

export function rotuloCampo(chave: string) {
  const texto = chave
    .split("_")
    .map((parte, i) => {
      if (SIGLAS.has(parte)) return parte.toUpperCase();
      const acentuada = ACENTOS[parte] ?? parte;
      return i === 0 ? acentuada.charAt(0).toUpperCase() + acentuada.slice(1) : acentuada;
    })
    .join(" ");
  return texto.replace(/\bct e\b/gi, "CT-e").replace(/\bnf es\b/gi, "NF-e");
}

export function agruparCampos(dados: Record<string, string>, incluirVazios: boolean, filtro: string): GrupoCampos[] {
  const termo = filtro.trim().toLowerCase();
  const grupos = new Map<string, GrupoCampos>();

  for (const [chave, bruto] of Object.entries(dados)) {
    const valor = String(bruto ?? "").trim();
    if (!incluirVazios && !valor) continue;
    const rotulo = rotuloCampo(chave);
    if (termo && !rotulo.toLowerCase().includes(termo) && !valor.toLowerCase().includes(termo)) continue;

    const titulo = GRUPOS.find((g) => g.regra.test(chave))?.titulo ?? "Outros";
    const grupo = grupos.get(titulo) ?? { titulo, campos: [] };
    grupo.campos.push({ chave, rotulo, valor: formatarCampo(chave, valor) });
    grupos.set(titulo, grupo);
  }

  return [...grupos.values()]
    .map((g) => ({ ...g, campos: g.campos.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")) }))
    .sort((a, b) => ORDEM_GRUPOS.indexOf(a.titulo) - ORDEM_GRUPOS.indexOf(b.titulo));
}
