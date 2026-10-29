-- GrupoLobo | Recuperacao de senha por codigo de uso unico enviado por e-mail
-- Ambas as tabelas ficam fechadas ao navegador (RLS ligada, sem policy): so as Edge Functions (service_role) acessam.

create table if not exists public.configuracao_email (
  id uuid primary key default gen_random_uuid(),
  smtp_host text not null,
  smtp_porta integer not null,
  smtp_usuario text not null,
  smtp_senha text not null,
  smtp_ssl boolean not null default true,
  smtp_remetente text not null,
  smtp_nome_remetente text,
  updated_at timestamptz not null default now()
);

create table if not exists public.senha_codigos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo_hash text not null,           -- sha256(user_id:codigo); o codigo em si nunca e gravado
  motivo text not null check (motivo in ('novo', 'reset', 'esqueci')),
  expira_em timestamptz not null,
  usado_em timestamptz,
  tentativas integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists senha_codigos_user_idx on public.senha_codigos (user_id, created_at desc);

alter table public.configuracao_email enable row level security;
alter table public.senha_codigos enable row level security;
revoke all on public.configuracao_email from anon, authenticated;
revoke all on public.senha_codigos from anon, authenticated;

drop trigger if exists set_configuracao_email_updated_at on public.configuracao_email;
create trigger set_configuracao_email_updated_at before update on public.configuracao_email
  for each row execute function public.set_updated_at();
