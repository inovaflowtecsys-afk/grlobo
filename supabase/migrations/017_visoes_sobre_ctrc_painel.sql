-- GrupoLobo | Refaz as visoes do painel (013) em cima de public.ctrc_painel (016): uma fonte so, rapida, com indices.
-- Mesmas colunas e regras de antes (so datas; realizada = ocorrencia 1; insucesso = 5, 11, 13, 38, 52); a diferenca e que agora
-- o 455 e o 036 ja vem juntos. Todas security_invoker (respeitam o RLS). Sem permissoes novas: ver GRANTs comentados no fim.
drop view if exists public.v_atrasados;
drop view if exists public.v_agendamentos;
drop view if exists public.v_dpe_mensal;
drop view if exists ssw_tracking.v_veiculos;
drop view if exists ssw_tracking.v_pendencias;
drop view if exists ssw_tracking.v_romaneios_resumo;
drop view if exists ssw_tracking.v_entregas_status;

-- 1) Uma linha por CTRC em romaneio.
create view ssw_tracking.v_entregas_status with (security_invoker = true) as
select p.dominio, p.rom_romaneio as romaneio, p.rom_placa as placa, p.rom_motorista as motorista, p.ctrc,
  p.rom_data_emissao as data_emissao, p.rom_situacao as situacao, p.previsao_final as prev_entrega,
  p.destinatario_nome, p.entrega_cidade, p.rom_entrega_bairro as entrega_bairro,
  p.rom_ocorrencia_codigo as ocorrencia_rom_codigo, p.rom_ocorrencia_descricao as ocorrencia_rom_descricao, p.rom_ocorrencia_data as ocorrencia_rom_data,
  p.rom_ocorrencia_ctrc_codigo as ocorrencia_ctrc_codigo, p.rom_ocorrencia_ctrc_descricao as ocorrencia_ctrc_descricao, p.rom_ocorrencia_ctrc_data as ocorrencia_ctrc_data,
  (p.rom_situacao = 'PENDENTE') as aberta_no_ssw,
  p.status_entrega, p.agendamento,
  case when p.status_entrega = 'REALIZADA' then p.data_entrega_final end as data_entrega,
  case when p.status_entrega = 'INSUCESSO' then
         coalesce(nullif(case when p.rom_ocorrencia_codigo in ('5','11','13','38','52') then p.rom_ocorrencia_descricao end, ''), p.rom_ocorrencia_ctrc_descricao)
  end as motivo_insucesso
from public.ctrc_painel p
where p.em_romaneio;

-- 2) Lista de romaneios: placa, motorista, total, pendentes, realizadas, insucesso + DPE do romaneio.
create view ssw_tracking.v_romaneios_resumo with (security_invoker = true) as
select e.dominio, e.romaneio,
  max(e.placa) as placa, max(e.motorista) as motorista, min(e.data_emissao) as data_emissao,
  count(*) filter (where e.status_entrega <> 'CANCELADA') as total_entregas,
  count(*) filter (where e.status_entrega = 'REALIZADA') as realizadas,
  count(*) filter (where e.status_entrega = 'PENDENTE') as pendentes,
  count(*) filter (where e.status_entrega = 'INSUCESSO') as insucessos,
  count(*) filter (where e.status_entrega = 'PENDENTE' and e.agendamento is not null) as agendadas,
  count(*) filter (where e.status_entrega = 'REALIZADA' and e.data_entrega <= e.prev_entrega) as realizadas_no_prazo,
  round(100.0 * count(*) filter (where e.status_entrega = 'REALIZADA' and e.data_entrega <= e.prev_entrega)
        / nullif(count(*) filter (where e.status_entrega = 'REALIZADA'), 0), 1) as dpe_pct,
  case
    when count(*) filter (where e.status_entrega <> 'CANCELADA') = 0 then 'CANCELADO'
    when count(*) filter (where e.aberta_no_ssw) > 0 then 'ABERTO'
    else 'FECHADO'
  end as status_romaneio
from ssw_tracking.v_entregas_status e
group by e.dominio, e.romaneio;

-- 3) Veiculos/motoristas: em operacao = tem romaneio aberto; disponivel = nenhum aberto.
create view ssw_tracking.v_veiculos with (security_invoker = true) as
select v.dominio, v.placa,
  (array_agg(v.motorista order by v.data_emissao desc nulls last))[1] as motorista,
  count(*) filter (where v.status_romaneio = 'ABERTO') as romaneios_abertos,
  coalesce(sum(v.pendentes) filter (where v.status_romaneio = 'ABERTO'), 0) as entregas_pendentes,
  coalesce(sum(v.insucessos) filter (where v.status_romaneio = 'ABERTO'), 0) as insucessos,
  case when count(*) filter (where v.status_romaneio = 'ABERTO') > 0 then 'EM OPERACAO' else 'DISPONIVEL' end as status_veiculo
from ssw_tracking.v_romaneios_resumo v
where v.placa is not null and v.placa <> ''
group by v.dominio, v.placa;

-- 4) Pendencias = insucessos de entrega.
create view ssw_tracking.v_pendencias with (security_invoker = true) as
select dominio, romaneio, placa, motorista, ctrc, destinatario_nome, entrega_cidade, motivo_insucesso,
  coalesce(case when ocorrencia_rom_codigo in ('5','11','13','38','52') then ocorrencia_rom_data end, ocorrencia_ctrc_data) as data_ocorrencia,
  aberta_no_ssw
from ssw_tracking.v_entregas_status
where status_entrega = 'INSUCESSO';

-- 5) DPE geral por mes: entregue no prazo = data da entrega <= previsao.
create view public.v_dpe_mensal with (security_invoker = true) as
select dominio, date_trunc('month', data_entrega_final)::date as mes,
  count(*) as entregues,
  count(*) filter (where data_entrega_final <= previsao_final) as no_prazo,
  round(100.0 * count(*) filter (where data_entrega_final <= previsao_final) / count(*), 1) as dpe_pct
from public.ctrc_painel
where status_entrega = 'REALIZADA' and data_entrega_final is not null and previsao_final is not null
group by dominio, date_trunc('month', data_entrega_final);

-- 6) Atrasados: nao entregue, nao cancelado, previsao vencida (so data), ultimos 30 dias, fora a ocorrencia 93 (CTRC so de frete)
--    e fora 15/35 (agendado / aguardando agendamento: vao para v_agendamentos).
create view public.v_atrasados with (security_invoker = true) as
select p.dominio, p.ctrc, p.destinatario_nome, p.entrega_cidade, p.previsao_final as previsao_entrega,
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
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo, '') not in ('93', '15', '35');

-- 7) Agendamentos: ocorrencia 15 = entrega agendada (data em entrega_programada); 35 = aguardando agendamento do cliente.
create view public.v_agendamentos with (security_invoker = true) as
select p.dominio, p.ctrc, p.destinatario_nome, p.entrega_cidade, p.entrega_programada, p.previsao_final as previsao_entrega,
  case coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo) when '15' then 'AGENDADA' else 'AGUARDANDO_AGENDAMENTO' end as tipo
from public.ctrc_painel p
where p.status_entrega in ('PENDENTE', 'INSUCESSO')
  and coalesce(p.rom_ocorrencia_ctrc_codigo, p.ultima_ocorrencia_codigo) in ('15', '35');

-- Permissao de leitura (rodar uma vez, por quem administra o banco):
-- revoke all on ssw_tracking.v_entregas_status, ssw_tracking.v_romaneios_resumo, ssw_tracking.v_veiculos, ssw_tracking.v_pendencias,
--   public.v_dpe_mensal, public.v_atrasados, public.v_agendamentos from anon, authenticated;
-- grant select on ssw_tracking.v_entregas_status, ssw_tracking.v_romaneios_resumo, ssw_tracking.v_veiculos, ssw_tracking.v_pendencias to authenticated;
-- grant select on public.v_dpe_mensal, public.v_atrasados, public.v_agendamentos to authenticated;
