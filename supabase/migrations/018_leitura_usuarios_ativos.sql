-- GrupoLobo | Painel de entregas: leitura das tabelas do 036 e do ctrc_painel so para usuarios ativos do sistema
-- (antes: qualquer usuario autenticado, inclusive logins sem cadastro em profiles). As views security_invoker herdam a regra.
drop policy if exists ctrc_painel_leitura on public.ctrc_painel;
create policy ctrc_painel_leitura on public.ctrc_painel for select to authenticated using (public.current_user_is_active());

drop policy if exists romaneios_select on ssw_tracking.romaneios;
create policy romaneios_select on ssw_tracking.romaneios for select to authenticated using (public.current_user_is_active());

drop policy if exists cargas_select on ssw_tracking.cargas;
create policy cargas_select on ssw_tracking.cargas for select to authenticated using (public.current_user_is_active());
