-- GrupoLobo | NF, busca por NF e exclusao de ocorrencias ignoradas em Aguardando agendamento.
-- 93, 94 e 99 nao devem aparecer nas listas operacionais.

drop view if exists public.v_agendamentos;
create view public.v_agendamentos with (security_invoker = true) as
select p.dominio, p.ctrc, p.numero_nf, p.destinatario_nome, p.entrega_cidade,
  p.entrega_programada, p.previsao_final as previsao_entrega,
  case coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo)
    when '15' then 'AGENDADA'
    else 'AGUARDANDO_AGENDAMENTO'
  end as tipo
from public.ctrc_painel p
where p.status_entrega in ('PENDENTE', 'INSUCESSO')
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo) in ('15', '35')
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.rom_ocorrencia_codigo, p.ultima_ocorrencia_codigo, '') not in ('93', '94', '99');

grant select on public.v_agendamentos to authenticated;
