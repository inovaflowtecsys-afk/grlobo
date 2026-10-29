-- GrupoLobo | Notas fiscais nas listas de Entregas
-- Acrescenta NF, ocorrência e data à view usada pela lista de Pendências.

drop view if exists ssw_tracking.v_pendencias;
create view ssw_tracking.v_pendencias with (security_invoker = true) as
select e.dominio, e.romaneio, e.placa, e.motorista, e.ctrc, p.numero_nf,
  e.destinatario_nome, e.entrega_cidade, e.motivo_insucesso,
  coalesce(e.ocorrencia_rom_codigo, e.ocorrencia_ctrc_codigo) as ocorrencia_codigo,
  coalesce(case when e.ocorrencia_rom_codigo in ('5','11','13','38','52') then e.ocorrencia_rom_data end, e.ocorrencia_ctrc_data) as data_ocorrencia,
  e.aberta_no_ssw
from ssw_tracking.v_entregas_status e
left join public.ctrc_painel p on p.dominio = e.dominio and p.ctrc = e.ctrc
where e.status_entrega = 'INSUCESSO'
  and coalesce(e.ocorrencia_rom_codigo, '') not in ('93', '94', '99')
  and coalesce(e.ocorrencia_ctrc_codigo, '') not in ('93', '94', '99');
