-- GrupoLobo | Permissoes das views do painel de Entregas
-- DROP VIEW remove os grants anteriores; restaura a leitura para usuarios autenticados.

grant select on ssw_tracking.v_pendencias to authenticated;
grant select on public.v_atrasados to authenticated;
grant select on public.v_dpe_mensal to authenticated;
