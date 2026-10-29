-- GrupoLobo | Gestao a vista de entregas.
-- 1) DPE do mes corrente por placa (mesma regra da 031, filtrada pela placa do romaneio).
-- 2) ctrc_painel na publicacao realtime, para a tela acompanhar a tabela sem recarregar.

create or replace view ssw_tracking.v_dpe_mes_placa with (security_invoker = true) as
select dominio, rom_placa as placa,
  count(*) as entregues,
  count(*) filter (where data_entrega_final <= previsao_final and entrega_programada is null) as no_prazo,
  round(
    100.0 * count(*) filter (where data_entrega_final <= previsao_final and entrega_programada is null)
    / nullif(count(*), 0),
    1
  ) as dpe_pct
from public.ctrc_painel
where status_entrega = 'REALIZADA'
  and rom_placa is not null and rom_placa <> ''
  and data_entrega_final is not null
  and previsao_final is not null
  and date_trunc('month', data_entrega_final) = date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)
  and not (entrega_programada is not null and entrega_programada <= previsao_final)
  and upper(coalesce(tipo_conhecimento, '')) not in ('COMPLEMENTAR', 'SUBSTITUICAO')
  and upper(coalesce(tipo_documento, '')) not like '%COMPLEMENT%'
  and upper(coalesce(tipo_documento, '')) not like '%SUBSTIT%'
  and coalesce(rom_ocorrencia_ctrc_codigo, '') not in ('93', '94', '99')
  and coalesce(rom_ocorrencia_codigo, '') not in ('93', '94', '99')
  and coalesce(ultima_ocorrencia_codigo, '') not in ('93', '94', '99')
group by dominio, rom_placa;

grant select on ssw_tracking.v_dpe_mes_placa to authenticated;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ctrc_painel'
  ) then
    alter publication supabase_realtime add table public.ctrc_painel;
  end if;
end $$;
