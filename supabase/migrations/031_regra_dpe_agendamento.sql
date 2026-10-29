-- GrupoLobo | Regra de DPE com agendamento e tipos de conhecimento.
--
-- Regras:
--   * cancelados nao entram (status_entrega = REALIZADA ja os exclui);
--   * complementares e substituicoes nao entram;
--   * ocorrencias 93, 94 e 99 nao entram, independentemente da fonte;
--   * agendamento ate a previsao original e expurgado do DPE;
--   * agendamento depois da previsao entra como ineficiente;
--   * sem agendamento, vale a entrega real contra a previsao original.

create or replace view public.v_dpe_mensal with (security_invoker = true) as
select dominio, date_trunc('month', data_entrega_final)::date as mes,
  count(*) as entregues,
  count(*) filter (
    where data_entrega_final <= previsao_final
      and entrega_programada is null
  ) as no_prazo,
  round(
    100.0 * count(*) filter (
      where data_entrega_final <= previsao_final
        and entrega_programada is null
    ) / nullif(count(*), 0),
    1
  ) as dpe_pct
from public.ctrc_painel
where status_entrega = 'REALIZADA'
  and data_entrega_final is not null
  and previsao_final is not null
  -- Agendado antes ou no prazo: fora do denominador do DPE.
  and not (
    entrega_programada is not null
    and entrega_programada <= previsao_final
  )
  -- Complementar e substituicao: fora do DPE.
  and upper(coalesce(tipo_conhecimento, '')) not in ('COMPLEMENTAR', 'SUBSTITUICAO')
  and upper(coalesce(tipo_documento, '')) not like '%COMPLEMENT%'
  and upper(coalesce(tipo_documento, '')) not like '%SUBSTIT%'
  -- Todas as fontes de ocorrencia precisam estar livres dos codigos ignorados.
  and coalesce(rom_ocorrencia_ctrc_codigo, '') not in ('93', '94', '99')
  and coalesce(rom_ocorrencia_codigo, '') not in ('93', '94', '99')
  and coalesce(ultima_ocorrencia_codigo, '') not in ('93', '94', '99')
group by dominio, date_trunc('month', data_entrega_final);

grant select on public.v_dpe_mensal to authenticated;
