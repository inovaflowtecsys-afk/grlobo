-- GrupoLobo | Visoes do painel "Control Tower" (so leitura, sem tabelas novas, sem carga extra do SSW).
-- Fontes: ssw_tracking.romaneios (036, operacao do dia) e public.ssw_455_ctrcs (455, historico/rede).
-- Regras de status (acordadas): realizada = ocorrencia 1; insucesso = ocorrencias 5, 11, 13, 38, 52; cancelada = situacao CANCELADO;
-- o resto e pendente. Atraso e agendamento usam SOMENTE datas (o SSW nao traz hora). security_invoker = respeita o RLS das tabelas.

-- 1) Uma linha por CTRC em romaneio, com o status correto (a coluna "entregue" da tabela so significa situacao = BAIXADO).
create or replace view ssw_tracking.v_entregas_status with (security_invoker = true) as
select s.*,
  case when s.status_entrega = 'REALIZADA' then
         case when s.ocorrencia_rom_codigo = '1' then s.ocorrencia_rom_data else s.ocorrencia_ctrc_data end
  end as data_entrega,
  case when s.status_entrega = 'INSUCESSO' then
         coalesce(nullif(case when s.ocorrencia_rom_codigo in ('5','11','13','38','52') then s.ocorrencia_rom_descricao end, ''), s.ocorrencia_ctrc_descricao)
  end as motivo_insucesso
from (
  select r.dominio, r.romaneio, r.placa, r.motorista, r.ctrc, r.data_emissao, r.situacao, r.prev_entrega,
    r.destinatario_nome, r.entrega_cidade, r.entrega_bairro,
    r.ocorrencia_rom_codigo, r.ocorrencia_rom_descricao, r.ocorrencia_rom_data,
    r.ocorrencia_ctrc_codigo, r.ocorrencia_ctrc_descricao, r.ocorrencia_ctrc_data,
    (r.situacao = 'PENDENTE') as aberta_no_ssw,
    case
      when r.situacao = 'CANCELADO' then 'CANCELADA'
      when r.ocorrencia_ctrc_codigo = '1' or r.ocorrencia_rom_codigo = '1' then 'REALIZADA'
      when r.ocorrencia_rom_codigo in ('5','11','13','38','52') or r.ocorrencia_ctrc_codigo in ('5','11','13','38','52') then 'INSUCESSO'
      else 'PENDENTE'
    end as status_entrega,
    case r.ocorrencia_ctrc_codigo when '15' then 'AGENDADA' when '35' then 'AGUARDANDO_AGENDAMENTO' end as agendamento
  from ssw_tracking.romaneios r
) s;

-- 2) Lista de romaneios: placa, motorista, total, pendentes, realizadas, insucesso + DPE do romaneio.
create or replace view ssw_tracking.v_romaneios_resumo with (security_invoker = true) as
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
create or replace view ssw_tracking.v_veiculos with (security_invoker = true) as
select v.dominio, v.placa,
  (array_agg(v.motorista order by v.data_emissao desc nulls last))[1] as motorista,
  count(*) filter (where v.status_romaneio = 'ABERTO') as romaneios_abertos,
  coalesce(sum(v.pendentes) filter (where v.status_romaneio = 'ABERTO'), 0) as entregas_pendentes,
  coalesce(sum(v.insucessos) filter (where v.status_romaneio = 'ABERTO'), 0) as insucessos,
  case when count(*) filter (where v.status_romaneio = 'ABERTO') > 0 then 'EM OPERACAO' else 'DISPONIVEL' end as status_veiculo
from ssw_tracking.v_romaneios_resumo v
where v.placa is not null and v.placa <> ''
group by v.dominio, v.placa;

-- 4) Pendencias = insucessos de entrega (agrupar pelo motivo do proprio SSW, ex.: recusa, local fechado).
create or replace view ssw_tracking.v_pendencias with (security_invoker = true) as
select dominio, romaneio, placa, motorista, ctrc, destinatario_nome, entrega_cidade, motivo_insucesso,
  coalesce(case when ocorrencia_rom_codigo in ('5','11','13','38','52') then ocorrencia_rom_data end, ocorrencia_ctrc_data) as data_ocorrencia,
  aberta_no_ssw
from ssw_tracking.v_entregas_status
where status_entrega = 'INSUCESSO';

-- 5) DPE geral por mes (455): entregue no prazo = data_entrega <= previsao_entrega.
create or replace view public.v_dpe_mensal with (security_invoker = true) as
select dominio, date_trunc('month', data_entrega)::date as mes,
  count(*) as entregues,
  count(*) filter (where data_entrega <= previsao_entrega) as no_prazo,
  round(100.0 * count(*) filter (where data_entrega <= previsao_entrega) / count(*), 1) as dpe_pct
from public.ssw_455_ctrcs
where data_entrega is not null and data_cancelamento is null and previsao_entrega is not null
group by dominio, date_trunc('month', data_entrega);

-- 6) Atrasados (455): sem entrega, nao cancelado, previsao vencida (so data), ultimos 30 dias, fora a ocorrencia 93 (CTRC so de frete).
--    Nao conta o que o 036 ja mostra como entregue (cobre o intervalo entre cargas do 455).
create or replace view public.v_atrasados with (security_invoker = true) as
select c.dominio, c.ctrc, c.destinatario_nome, c.entrega_cidade, c.previsao_entrega,
  ((now() at time zone 'America/Sao_Paulo')::date - c.previsao_entrega) as dias_atraso,
  case
    when ((now() at time zone 'America/Sao_Paulo')::date - c.previsao_entrega) = 1 then '1 dia'
    when ((now() at time zone 'America/Sao_Paulo')::date - c.previsao_entrega) between 2 and 3 then '2 a 3 dias'
    else 'mais de 3 dias'
  end as faixa_atraso,
  c.dados->>'codigo_da_ultima_ocorrencia' as ultima_ocorrencia, c.localizacao_atual
from public.ssw_455_ctrcs c
where c.data_entrega is null and c.data_cancelamento is null
  and c.previsao_entrega < (now() at time zone 'America/Sao_Paulo')::date
  and c.previsao_entrega >= (now() at time zone 'America/Sao_Paulo')::date - 30
  and coalesce(c.dados->>'codigo_da_ultima_ocorrencia', '') <> '93'
  and not exists (select 1 from ssw_tracking.v_entregas_status e where e.ctrc = c.ctrc and e.status_entrega = 'REALIZADA');

-- 7) Agendamentos (455): ocorrencia 15 = entrega agendada (data em entrega_programada); 35 = aguardando agendamento do cliente.
create or replace view public.v_agendamentos with (security_invoker = true) as
select c.dominio, c.ctrc, c.destinatario_nome, c.entrega_cidade, c.entrega_programada, c.previsao_entrega,
  case c.dados->>'codigo_da_ultima_ocorrencia' when '15' then 'AGENDADA' else 'AGUARDANDO_AGENDAMENTO' end as tipo
from public.ssw_455_ctrcs c
where c.data_entrega is null and c.data_cancelamento is null
  and c.dados->>'codigo_da_ultima_ocorrencia' in ('15', '35')
  and not exists (select 1 from ssw_tracking.v_entregas_status e where e.ctrc = c.ctrc and e.status_entrega = 'REALIZADA');

-- Permissao de leitura para o painel (rodar uma vez, por quem administra o banco):
-- grant select on ssw_tracking.v_entregas_status, ssw_tracking.v_romaneios_resumo, ssw_tracking.v_veiculos, ssw_tracking.v_pendencias to authenticated;
-- grant select on public.v_dpe_mensal, public.v_atrasados, public.v_agendamentos to authenticated;
