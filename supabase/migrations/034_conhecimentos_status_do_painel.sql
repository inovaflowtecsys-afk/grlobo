-- GrupoLobo | Conhecimentos: status de entrega e ultima ocorrencia passam a considerar ctrc_painel.
-- Motivo: o relatorio 455 chega depois do 036. Enquanto o 455 nao traz a data de entrega, o detalhe do CT-e
-- mostrava "Pendente/Atrasado" mesmo com o romaneio baixado e ctrc_painel = REALIZADA (ex.: SJP012470-2, 03/11/2026).
-- Mesmas colunas e mesma ordem da view anterior (011); so mudam as expressoes.
create or replace view public.ssw_455_conhecimentos
with (security_invoker = true) as
with base as (
  select
    c.*,
    -- entrega efetiva: 455 ou, na falta dele, a entrega ja registrada no painel (ocorrencia 1 do 036)
    coalesce(c.data_entrega, case when p.status_entrega = 'REALIZADA' then p.data_entrega_final end) as entrega_efetiva,
    -- ocorrencia mais recente entre 455 e painel (036)
    (p.rom_ocorrencia_ctrc_data is not null
      and (c.data_ultima_ocorrencia is null or p.rom_ocorrencia_ctrc_data > c.data_ultima_ocorrencia)) as usa_painel
  from public.ssw_455_ctrcs c
  left join public.ctrc_painel p on p.dominio = c.dominio and p.ctrc = c.ctrc
)
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
  c.entrega_efetiva as data_entrega,
  c.data_cancelamento,
  c.unidade_origem,
  c.unidade_destino,
  c.rota,
  c.localizacao_atual,
  c.atualizado_em,
  (c.entrega_programada is not null) as agendado,
  case
    when c.data_cancelamento is not null then 'CANCELADO'
    when c.entrega_efetiva is not null then 'ENTREGUE'
    else 'EM_ABERTO'
  end as status_entrega,
  case
    when c.data_cancelamento is not null or c.previsao_entrega is null then null
    when c.entrega_efetiva is not null then case when c.entrega_efetiva > c.previsao_entrega then 'ATRASADO' else 'NO_PRAZO' end
    when c.previsao_entrega < (now() at time zone 'America/Sao_Paulo')::date then 'ATRASADO'
    else 'NO_PRAZO'
  end as situacao_prazo,
  case
    when c.data_cancelamento is not null or c.previsao_entrega is null then null
    when c.entrega_efetiva is not null then greatest(c.entrega_efetiva - c.previsao_entrega, 0)
    else greatest((now() at time zone 'America/Sao_Paulo')::date - c.previsao_entrega, 0)
  end as dias_atraso,
  case when c.usa_painel then nullif(trim(p.rom_ocorrencia_ctrc_codigo), '')
       else nullif(trim(c.dados->>'codigo_da_ultima_ocorrencia'), '') end as ocorrencia_codigo,
  case when c.usa_painel then nullif(trim(p.rom_ocorrencia_ctrc_descricao), '')
       else nullif(trim(c.dados->>'complemento_da_ultima_ocorrencia'), '') end as ocorrencia_descricao,
  case when c.usa_painel then p.rom_ocorrencia_ctrc_data else c.data_ultima_ocorrencia end as ocorrencia_data,
  case when c.usa_painel then null
       else nullif(trim(c.dados->>'unidade_da_ultima_ocorrencia'), '') end as ocorrencia_unidade,
  c.qtd_notas,
  nullif(trim(c.placa_entrega), '') as placa_entrega
from base c
left join public.ctrc_painel p on p.dominio = c.dominio and p.ctrc = c.ctrc;

grant select on public.ssw_455_conhecimentos to authenticated, service_role;
