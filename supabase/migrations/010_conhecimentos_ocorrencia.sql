-- GrupoLobo | Conhecimentos: ocorrencia atual e quantidade de notas na view da lista
-- (colunas novas entram no fim: create or replace view nao permite reordenar as existentes)
create or replace view public.ssw_455_conhecimentos
with (security_invoker = true) as
select
  c.dominio,
  c.chave_linha,
  c.ctrc,
  c.cte,
  coalesce(c.chave_cte, nullif(c.dados->>'chave_ct_e', '')) as chave_cte,
  c.tipo_conhecimento,
  c.data_autorizacao,
  c.remetente_nome,
  c.remetente_cnpj,
  c.destinatario_nome,
  c.destinatario_cnpj,
  c.entrega_cidade,
  c.entrega_uf,
  c.numero_nf,
  c.volumes,
  c.peso_real_kg,
  c.valor_frete,
  c.previsao_entrega,
  c.entrega_programada,
  c.data_entrega,
  c.data_cancelamento,
  c.unidade_origem,
  c.unidade_destino,
  c.rota,
  c.localizacao_atual,
  c.atualizado_em,
  (c.entrega_programada is not null) as agendado,
  case
    when c.data_cancelamento is not null then 'CANCELADO'
    when c.data_entrega is not null then 'ENTREGUE'
    else 'EM_ABERTO'
  end as status_entrega,
  case
    when c.data_cancelamento is not null or c.previsao_entrega is null then null
    when c.data_entrega is not null then case when c.data_entrega > c.previsao_entrega then 'ATRASADO' else 'NO_PRAZO' end
    when c.previsao_entrega < (now() at time zone 'America/Sao_Paulo')::date then 'ATRASADO'
    else 'NO_PRAZO'
  end as situacao_prazo,
  case
    when c.data_cancelamento is not null or c.previsao_entrega is null then null
    when c.data_entrega is not null then greatest(c.data_entrega - c.previsao_entrega, 0)
    else greatest((now() at time zone 'America/Sao_Paulo')::date - c.previsao_entrega, 0)
  end as dias_atraso,
  -- novas
  nullif(trim(c.dados->>'codigo_da_ultima_ocorrencia'), '') as ocorrencia_codigo,
  nullif(trim(c.dados->>'complemento_da_ultima_ocorrencia'), '') as ocorrencia_descricao,
  c.data_ultima_ocorrencia as ocorrencia_data,
  nullif(trim(c.dados->>'unidade_da_ultima_ocorrencia'), '') as ocorrencia_unidade,
  c.qtd_notas
from public.ssw_455_ctrcs c;

grant select on public.ssw_455_conhecimentos to authenticated, service_role;
