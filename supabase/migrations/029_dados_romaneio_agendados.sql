-- GrupoLobo | Dados do romaneio e ocorrencia atual em Entregas agendadas.
-- Mantem NF, filtro por NF e a exclusao das ocorrencias 93, 94 e 99.

drop view if exists public.v_agendamentos;
create view public.v_agendamentos with (security_invoker = true) as
select p.dominio, p.ctrc, p.numero_nf, p.destinatario_nome, p.entrega_cidade,
  p.entrega_programada, p.previsao_final as previsao_entrega,
  p.rom_romaneio as romaneio,
  p.rom_data_emissao as data_romaneio,
  p.rom_placa as placa,
  p.rom_motorista as motorista,
  coalesce(p.rom_ocorrencia_ctrc_codigo, p.rom_ocorrencia_codigo, p.ultima_ocorrencia_codigo) as ocorrencia_codigo,
  coalesce(p.rom_ocorrencia_ctrc_descricao, p.rom_ocorrencia_descricao) as ocorrencia_descricao,
  coalesce(p.rom_ocorrencia_ctrc_data, p.rom_ocorrencia_data) as ocorrencia_data,
  case coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo)
    when '15' then 'AGENDADA'
    else 'AGUARDANDO_AGENDAMENTO'
  end as tipo
from public.ctrc_painel p
where p.status_entrega in ('PENDENTE', 'INSUCESSO')
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo) in ('15', '35')
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.rom_ocorrencia_codigo, p.ultima_ocorrencia_codigo, '') not in ('93', '94', '99');

grant select on public.v_agendamentos to authenticated;
