-- GrupoLobo | Acesso por modulo do menu lateral
-- Administrador: acesso total (nao usa esta coluna). Usuario: cada modulo e um switch (true = liberado, ausente/false = negado).
-- Chaves: dashboard, conhecimentos, entregas, faturamento. A escrita de profiles continua so pelas Edge Functions (service_role).
-- Idempotente.

alter table public.profiles
  add column if not exists modulos_acesso jsonb not null default '{}'::jsonb;

-- Quem ja usa o sistema nao perde acesso: usuarios existentes comecam com todos os modulos liberados.
update public.profiles
   set modulos_acesso = '{"dashboard": true, "conhecimentos": true, "entregas": true, "faturamento": true}'::jsonb
 where tipo_usuario = 'USUARIO'
   and modulos_acesso = '{}'::jsonb;

comment on column public.profiles.modulos_acesso is 'Modulos liberados para usuario comum: {"dashboard": true, "conhecimentos": true, "entregas": true, "faturamento": true}. Administrador ignora.';
