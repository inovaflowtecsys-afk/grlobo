-- GrupoLobo | Modulo Empresa (empresa unica + setores, cargos e filiais)

alter table public.empresas
  add column if not exists inscricao_estadual text,
  add column if not exists inscricao_municipal text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_telefone text,
  add column if not exists responsavel_email text,
  add column if not exists cadastro_unico boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- uma unica empresa ativa no sistema; CNPJ nao repete entre as ativas
create unique index if not exists empresas_cadastro_unico_idx on public.empresas (cadastro_unico) where cadastro_unico and deleted_at is null;
create unique index if not exists empresas_cnpj_idx on public.empresas (cnpj) where cnpj is not null and deleted_at is null;

alter table public.empresa_setores
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.empresa_cargos
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.empresa_filiais
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Nome unico apenas entre registros ativos: permite recadastrar um nome apos excluir (exclusao logica).
alter table public.empresa_setores drop constraint if exists empresa_setores_nome_unique;
alter table public.empresa_cargos drop constraint if exists empresa_cargos_nome_unique;
create unique index if not exists empresa_setores_nome_idx on public.empresa_setores (empresa_id, lower(nome)) where deleted_at is null;
create unique index if not exists empresa_cargos_nome_idx on public.empresa_cargos (empresa_id, lower(nome)) where deleted_at is null;

-- Numero da filial automatico (sequencial por empresa) quando nao informado.
create or replace function public.empresa_filiais_numero()
returns trigger language plpgsql as $$
begin
  if nullif(trim(coalesce(new.numero_filial, '')), '') is null then
    select coalesce(max(f.numero_filial::int), 0) + 1 into new.numero_filial
    from public.empresa_filiais f
    where f.empresa_id = new.empresa_id and f.numero_filial ~ '^[0-9]+$';
  end if;
  return new;
end;
$$;
drop trigger if exists empresa_filiais_numero on public.empresa_filiais;
create trigger empresa_filiais_numero before insert on public.empresa_filiais
  for each row execute function public.empresa_filiais_numero();
create unique index if not exists empresa_filiais_numero_idx on public.empresa_filiais (empresa_id, numero_filial) where deleted_at is null;

-- Administradores registram a propria acao na auditoria.
drop policy if exists audit_logs_admin_insert on public.audit_logs;
create policy audit_logs_admin_insert on public.audit_logs for insert to authenticated
  with check (public.current_user_is_admin() and user_id = auth.uid());
