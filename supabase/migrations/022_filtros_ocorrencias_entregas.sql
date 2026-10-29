-- GrupoLobo | Ocorrencias que nao devem entrar nos indicadores operacionais
-- 93, 94 e 99 sao desconsideradas em atrasados, pendencias e DPE.

drop view if exists ssw_tracking.v_pendencias;
create view ssw_tracking.v_pendencias with (security_invoker = true) as
select e.dominio, e.romaneio, e.placa, e.motorista, e.ctrc, p.numero_nf, e.destinatario_nome, e.entrega_cidade, e.motivo_insucesso,
  coalesce(e.ocorrencia_rom_codigo, e.ocorrencia_ctrc_codigo) as ocorrencia_codigo,
  coalesce(case when ocorrencia_rom_codigo in ('5','11','13','38','52') then ocorrencia_rom_data end, ocorrencia_ctrc_data) as data_ocorrencia,
  e.aberta_no_ssw
from ssw_tracking.v_entregas_status e
left join public.ctrc_painel p on p.dominio = e.dominio and p.ctrc = e.ctrc
where e.status_entrega = 'INSUCESSO'
  and coalesce(e.ocorrencia_rom_codigo, '') not in ('93', '94', '99')
  and coalesce(e.ocorrencia_ctrc_codigo, '') not in ('93', '94', '99');

create or replace view public.v_dpe_mensal with (security_invoker = true) as
select dominio, date_trunc('month', data_entrega_final)::date as mes,
  count(*) as entregues,
  count(*) filter (where data_entrega_final <= previsao_final) as no_prazo,
  round(100.0 * count(*) filter (where data_entrega_final <= previsao_final) / count(*), 1) as dpe_pct
from public.ctrc_painel
where status_entrega = 'REALIZADA'
  and data_entrega_final is not null
  and previsao_final is not null
  and coalesce(rom_ocorrencia_ctrc_codigo, rom_ocorrencia_codigo, ultima_ocorrencia_codigo, '') not in ('93', '94', '99')
group by dominio, date_trunc('month', data_entrega_final);

create or replace view public.v_atrasados with (security_invoker = true) as
select p.dominio, p.ctrc, p.numero_nf, p.destinatario_nome, p.entrega_cidade, p.previsao_final as previsao_entrega,
  ((now() at time zone 'America/Sao_Paulo')::date - p.previsao_final) as dias_atraso,
  case
    when ((now() at time zone 'America/Sao_Paulo')::date - p.previsao_final) = 1 then '1 dia'
    when ((now() at time zone 'America/Sao_Paulo')::date - p.previsao_final) between 2 and 3 then '2 a 3 dias'
    else 'mais de 3 dias'
  end as faixa_atraso,
  coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo) as ultima_ocorrencia, p.localizacao_atual
from public.ctrc_painel p
where p.status_entrega in ('PENDENTE', 'INSUCESSO')
  and p.previsao_final < (now() at time zone 'America/Sao_Paulo')::date
  and p.previsao_final >= (now() at time zone 'America/Sao_Paulo')::date - 30
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.rom_ocorrencia_codigo, p.ultima_ocorrencia_codigo, '') not in ('93', '94', '99', '15', '35');
