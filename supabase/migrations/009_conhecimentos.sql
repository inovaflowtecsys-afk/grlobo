-- GrupoLobo | Modulo Conhecimentos (lista do SSW 455)
-- A view calcula status de entrega, prazo e agendamento; a lista nao precisa carregar o jsonb `dados` (so o popup).

-- Leitura do 455 apenas para usuarios ativos do sistema (antes: qualquer usuario autenticado).
drop policy if exists ssw_455_ctrcs_select on public.ssw_455_ctrcs;
create policy ssw_455_ctrcs_select on public.ssw_455_ctrcs for select to authenticated using (public.current_user_is_active());
drop policy if exists ssw_455_cargas_select on public.ssw_455_cargas;
create policy ssw_455_cargas_select on public.ssw_455_cargas for select to authenticated using (public.current_user_is_active());

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
  -- No prazo / atrasado: entregue compara a entrega com a previsao; em aberto compara a previsao com hoje (Sao Paulo).
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
  end as dias_atraso
from public.ssw_455_ctrcs c;

revoke all on public.ssw_455_conhecimentos from anon;
grant select on public.ssw_455_conhecimentos to authenticated, service_role;

-- Buscas por nome (remetente/destinatario) em ~12 mil linhas, hoje sem indice de texto.
create extension if not exists pg_trgm with schema extensions;
create index if not exists ssw_455_ctrcs_remetente_trgm on public.ssw_455_ctrcs using gin (remetente_nome extensions.gin_trgm_ops);
create index if not exists ssw_455_ctrcs_destinatario_trgm on public.ssw_455_ctrcs using gin (destinatario_nome extensions.gin_trgm_ops);
create index if not exists ssw_455_ctrcs_ctrc_trgm on public.ssw_455_ctrcs using gin (ctrc extensions.gin_trgm_ops);
