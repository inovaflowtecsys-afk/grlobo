-- GrupoLobo | Painel: ultima atualizacao de cada tabela do SSW (uma linha por tabela).
-- ultima_carga_ok = ultima carga concluida com sucesso; ultima_mudanca = ultima vez que alguma linha da tabela foi realmente criada/alterada.
-- "iguais" numa carga significa que o SSW nao trouxe nada novo, entao ultima_mudanca pode ser mais antiga que ultima_carga_ok.
with ult036 as (
  select distinct on (relatorio) relatorio, recebido_em, linhas, novos, atualizados, iguais
  from ssw_tracking.cargas where ok and relatorio = '036'
  order by relatorio, recebido_em desc
), ult455 as (
  select recebido_em, linhas, novos, atualizados, iguais
  from public.ssw_455_cargas where ok
  order by recebido_em desc limit 1
), falha036 as (
  select max(recebido_em) as em from ssw_tracking.cargas where relatorio = '036' and not ok
), falha455 as (
  select max(recebido_em) as em from public.ssw_455_cargas where not ok
)
select 'SSW 036 - ssw_tracking.romaneios' as tabela,
       (u.recebido_em at time zone 'America/Sao_Paulo') as ultima_carga_ok_brasilia,
       round(extract(epoch from now() - u.recebido_em) / 60) as minutos_atras,
       u.linhas, u.novos, u.atualizados, u.iguais,
       (select max(atualizado_em) at time zone 'America/Sao_Paulo' from ssw_tracking.romaneios) as ultima_mudanca_brasilia,
       (select count(*) from ssw_tracking.romaneios) as total_linhas,
       (f.em at time zone 'America/Sao_Paulo') as ultimo_erro_brasilia
from ult036 u, falha036 f
union all
select 'SSW 455 - public.ssw_455_ctrcs',
       (u.recebido_em at time zone 'America/Sao_Paulo'),
       round(extract(epoch from now() - u.recebido_em) / 60),
       u.linhas, u.novos, u.atualizados, u.iguais,
       (select max(atualizado_em) at time zone 'America/Sao_Paulo' from public.ssw_455_ctrcs),
       (select count(*) from public.ssw_455_ctrcs),
       (f.em at time zone 'America/Sao_Paulo')
from ult455 u, falha455 f;
