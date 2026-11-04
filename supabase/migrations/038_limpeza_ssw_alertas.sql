-- Limpeza automática do log de alertas de coleta: não acumula registros.
-- Apaga alertas já RESOLVIDOS há mais de 2 dias. Alertas abertos, ou resolvidos
-- com e-mail de normalização ainda pendente, nunca são apagados.

create or replace function public.ssw_alertas_limpar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apagados integer;
begin
  delete from public.ssw_alertas
   where resolvido_em is not null
     and resolvido_em < now() - interval '2 days'
     and (email_resolucao_enviado_em is not null or email_resolucao_tentativas >= 5);
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

revoke all on function public.ssw_alertas_limpar() from public, anon, authenticated;

-- Todo dia às 03:30 (UTC = 00:30 em Brasília). O corte de 2 dias garante que nada passe disso.
select cron.unschedule('ssw-alertas-limpar')
 where exists (select 1 from cron.job where jobname = 'ssw-alertas-limpar');
select cron.schedule('ssw-alertas-limpar', '30 3 * * *', 'select public.ssw_alertas_limpar()');
