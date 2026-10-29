-- GrupoLobo | Ultima ocorrencia e placa na lista de atrasados

drop view if exists public.v_atrasados;
create view public.v_atrasados with (security_invoker = true) as
select p.dominio, p.ctrc, p.numero_nf, p.destinatario_nome, p.entrega_cidade, p.previsao_final as previsao_entrega,
  ((now() at time zone 'America/Sao_Paulo')::date - p.previsao_final) as dias_atraso,
  case
    when ((now() at time zone 'America/Sao_Paulo')::date - p.previsao_final) = 1 then '1 dia'
    when ((now() at time zone 'America/Sao_Paulo')::date - p.previsao_final) between 2 and 3 then '2 a 3 dias'
    else 'mais de 3 dias'
  end as faixa_atraso,
  coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo) as ultima_ocorrencia,
  p.rom_placa as placa,
  p.localizacao_atual
from public.ctrc_painel p
where p.status_entrega in ('PENDENTE', 'INSUCESSO')
  and p.previsao_final < (now() at time zone 'America/Sao_Paulo')::date
  and p.previsao_final >= (now() at time zone 'America/Sao_Paulo')::date - 30
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.rom_ocorrencia_codigo, p.ultima_ocorrencia_codigo, '') not in ('93', '94', '99', '15', '35');

grant select on public.v_atrasados to authenticated;
