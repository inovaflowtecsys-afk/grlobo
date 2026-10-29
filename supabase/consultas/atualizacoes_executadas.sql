-- GrupoLobo | Atualizacoes executadas (036 e 455), da mais recente para a mais antiga.
-- Colar no SQL Editor do Supabase. Troque o intervalo no filtro (ex.: '24 hours', '7 days').
select * from (
  select 'SSW 036 (romaneios)' as relatorio,
         (recebido_em at time zone 'America/Sao_Paulo') as executado_em_brasilia,
         case when ok then 'OK' else 'ERRO' end as resultado,
         linhas, novos, atualizados, iguais, erro
  from ssw_tracking.cargas
  where relatorio = '036'
  union all
  select 'SSW 455 (conhecimentos)',
         (recebido_em at time zone 'America/Sao_Paulo'),
         case when ok then 'OK' else 'ERRO' end,
         linhas, novos, atualizados, iguais, erro
  from public.ssw_455_cargas
) t
where executado_em_brasilia >= (now() at time zone 'America/Sao_Paulo') - interval '24 hours'
order by executado_em_brasilia desc;

-- Resumo rapido: ultima carga com sucesso de cada relatorio e ha quantos minutos.
-- select 'SSW 036' r, max(recebido_em) ultima, round(extract(epoch from now() - max(recebido_em)) / 60) min_atras from ssw_tracking.cargas where relatorio = '036' and ok
-- union all
-- select 'SSW 455', max(recebido_em), round(extract(epoch from now() - max(recebido_em)) / 60) from public.ssw_455_cargas where ok;
