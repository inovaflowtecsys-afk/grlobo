-- GrupoLobo | Autenticacao e cadastro de profissionais (modelo Macklog)
-- Aditiva: reaproveita public.profiles, public.empresas e public.empresa_filiais ja existentes no projeto.
-- Nao altera as tabelas do sistema legado (profissional, cargo, departamento, filiais).
-- profiles.id = auth.users.id. Escrita de profiles/usuarios so pelas Edge Functions (service_role).

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Empresa unica do sistema (CNPJ e demais dados sao completados depois).
insert into public.empresas (razao_social, nome_fantasia)
select 'Grupo Lobo', 'Grupo Lobo'
where not exists (select 1 from public.empresas where deleted_at is null);

create table if not exists public.empresa_setores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_setores_nome_unique unique (empresa_id, nome)
);

create table if not exists public.empresa_cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_cargos_nome_unique unique (empresa_id, nome)
);

-- codigo = numero do profissional (0-14 reservados ao cadastro legado; novos a partir de 15).
create sequence if not exists public.profiles_codigo_seq start 15;

alter table public.profiles
  add column if not exists codigo integer,
  add column if not exists avatar_url text,
  add column if not exists setor_id uuid references public.empresa_setores(id) on delete set null,
  add column if not exists cargo_id uuid references public.empresa_cargos(id) on delete set null,
  add column if not exists cargo text,
  add column if not exists tipo_usuario text not null default 'USUARIO',
  add column if not exists senha_provisoria boolean not null default false;

alter table public.profiles alter column codigo set default nextval('public.profiles_codigo_seq');
alter sequence public.profiles_codigo_seq owned by public.profiles.codigo;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_tipo_usuario_check') then
    alter table public.profiles add constraint profiles_tipo_usuario_check check (tipo_usuario in ('ADMINISTRADOR', 'USUARIO'));
  end if;
end $$;

create unique index if not exists profiles_codigo_idx on public.profiles (codigo);
create unique index if not exists profiles_email_idx on public.profiles (lower(email)) where deleted_at is null;
create index if not exists profiles_filial_idx on public.profiles (filial_id) where deleted_at is null;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  acao text not null,
  entidade text,
  entidade_id uuid,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

do $$
declare t text;
begin
  foreach t in array array['empresa_setores', 'empresa_cargos', 'empresa_filiais', 'profiles'] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Usuario ativo e administrador (security definer evita recursao de RLS em profiles).
create or replace function public.current_user_is_active()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo and p.deleted_at is null);
$$;

create or replace function public.current_user_is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.deleted_at is null
      and (p.administrador or p.tipo_usuario = 'ADMINISTRADOR'));
$$;

revoke all on function public.current_user_is_active() from public, anon;
revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_active() to authenticated, service_role;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

alter table public.empresas enable row level security;
alter table public.empresa_filiais enable row level security;
alter table public.empresa_setores enable row level security;
alter table public.empresa_cargos enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: o proprio perfil (mesmo inativo, para o app avisar), colegas ativos e, para admin, todos.
-- Sem policy de insert/update/delete para authenticated: so a service_role (Edge Functions) grava.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_select_ativos on public.profiles;
create policy profiles_select_ativos on public.profiles for select to authenticated
  using (deleted_at is null and public.current_user_is_active());
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.current_user_is_admin());

do $$
declare t text;
begin
  foreach t in array array['empresas', 'empresa_filiais', 'empresa_setores', 'empresa_cargos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (deleted_at is null and public.current_user_is_active())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin())', t || '_admin_write', t);
  end loop;
end $$;

drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs for select to authenticated using (public.current_user_is_admin());

-- Primeiro administrador: profissional 10 do cadastro legado (Luciano Freitas), ja existente no Auth.
insert into public.profiles (id, empresa_id, nome, email, codigo, tipo_usuario, administrador, ativo, senha_provisoria)
select u.id, (select id from public.empresas where deleted_at is null order by created_at limit 1),
       'Luciano Freitas', u.email, 10, 'ADMINISTRADOR', true, true, false
from auth.users u
where lower(u.email) = 'lucsilfreitas@gmail.com'
on conflict (id) do update
  set codigo = 10, tipo_usuario = 'ADMINISTRADOR', administrador = true, ativo = true, deleted_at = null;
