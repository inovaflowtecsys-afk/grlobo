-- GrupoLobo | Permissoes dos cadastros
-- Dashboard e liberado para todos; Empresa e Profissionais passam a ser modulos configuraveis.

alter table public.profiles
  add column if not exists modulos_acesso jsonb not null default '{}'::jsonb;

update public.profiles
   set modulos_acesso = coalesce(modulos_acesso, '{}'::jsonb)
       || jsonb_build_object('dashboard', true)
 where ativo and deleted_at is null;

-- Usuarios existentes preservam o acesso que ja tinham e recebem os dois novos modulos.
update public.profiles
   set modulos_acesso = modulos_acesso
       || jsonb_build_object('empresa', true, 'profissionais', true)
 where tipo_usuario = 'USUARIO'
   and ativo
   and deleted_at is null;

comment on column public.profiles.modulos_acesso is
  'Modulos liberados: dashboard (sempre true), conhecimentos, entregas, faturamento, empresa e profissionais.';
