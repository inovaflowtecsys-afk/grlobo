-- GrupoLobo | Modulo Frete entrega
-- Cadastro de fretes pagos a motoristas, cadastro de motoristas e log de auditoria do modulo.
-- Acesso: administrador ou usuario com modulos_acesso.frete_entrega = true.
-- Exclusao so logica (deleted_at). Idempotente. Esta migration NAO altera GRANT/REVOKE.

-- ---------------------------------------------------------------------------
-- Permissao do modulo
-- ---------------------------------------------------------------------------
create or replace function public.current_user_pode_frete()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.deleted_at is null
      and (p.administrador
           or p.tipo_usuario = 'ADMINISTRADOR'
           or coalesce(p.modulos_acesso ->> 'frete_entrega', 'false') = 'true'));
$$;

-- ---------------------------------------------------------------------------
-- Motoristas
-- ---------------------------------------------------------------------------
create table if not exists public.frete_motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  cpf text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create unique index if not exists frete_motoristas_nome_idx on public.frete_motoristas (lower(trim(nome))) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Fretes
-- ---------------------------------------------------------------------------
create table if not exists public.frete_entregas (
  id uuid primary key default gen_random_uuid(),
  data_registro timestamptz not null default now(),
  motorista_id uuid not null references public.frete_motoristas(id),
  valor_frete numeric(12,2) not null default 0 check (valor_frete >= 0),
  valor_chapa numeric(12,2) not null default 0 check (valor_chapa >= 0),
  valor_descarga numeric(12,2) not null default 0 check (valor_descarga >= 0),
  valor_adicional numeric(12,2) not null default 0 check (valor_adicional >= 0),
  observacao text,
  pago boolean not null default false,
  data_pagamento timestamptz,
  pago_por uuid references auth.users(id) on delete set null,
  nota_fiscal text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  constraint frete_entregas_pago_nf_ck check (not pago or nullif(trim(coalesce(nota_fiscal, '')), '') is not null)
);
create index if not exists frete_entregas_data_idx on public.frete_entregas (data_registro desc) where deleted_at is null;
create index if not exists frete_entregas_motorista_idx on public.frete_entregas (motorista_id);
create index if not exists frete_entregas_pago_idx on public.frete_entregas (pago) where deleted_at is null;
create index if not exists frete_entregas_nf_idx on public.frete_entregas (nota_fiscal);

-- ---------------------------------------------------------------------------
-- Log
-- ---------------------------------------------------------------------------
create table if not exists public.frete_log (
  id bigint generated always as identity primary key,
  entidade text not null check (entidade in ('FRETE', 'MOTORISTA')),
  registro_id uuid not null,
  acao text not null check (acao in ('INSERIU', 'EDITOU', 'PAGOU', 'EXCLUIU')),
  usuario_id uuid,
  usuario_nome text,
  em timestamptz not null default now(),
  detalhes jsonb
);
create index if not exists frete_log_registro_idx on public.frete_log (entidade, registro_id, em desc);

create or replace function public.frete_log_registrar(p_entidade text, p_registro uuid, p_acao text, p_detalhes jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.frete_log (entidade, registro_id, acao, usuario_id, usuario_nome, detalhes)
  values (p_entidade, p_registro, p_acao, auth.uid(),
          (select p.nome from public.profiles p where p.id = auth.uid()), p_detalhes);
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: motoristas
-- ---------------------------------------------------------------------------
create or replace function public.frete_motoristas_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.nome := trim(new.nome);
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.frete_motoristas_depois()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_diff jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.frete_log_registrar('MOTORISTA', new.id, 'INSERIU', jsonb_build_object('nome', new.nome, 'cpf', new.cpf));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.frete_log_registrar('MOTORISTA', new.id, 'EXCLUIU', jsonb_build_object('nome', new.nome));
  else
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('de', o.value, 'para', n.value)), '{}'::jsonb) into v_diff
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at', 'updated_by');
    if v_diff <> '{}'::jsonb then
      perform public.frete_log_registrar('MOTORISTA', new.id, 'EDITOU', v_diff);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists frete_motoristas_antes on public.frete_motoristas;
create trigger frete_motoristas_antes before insert or update on public.frete_motoristas
  for each row execute function public.frete_motoristas_antes();
drop trigger if exists frete_motoristas_updated_at on public.frete_motoristas;
create trigger frete_motoristas_updated_at before update on public.frete_motoristas
  for each row execute function public.set_updated_at();
drop trigger if exists frete_motoristas_depois on public.frete_motoristas;
create trigger frete_motoristas_depois after insert or update on public.frete_motoristas
  for each row execute function public.frete_motoristas_depois();

-- ---------------------------------------------------------------------------
-- Triggers: fretes
-- Pagamento: data e responsavel sao definidos pelo servidor; depois de pago, pagamento e nota fiscal ficam travados.
-- ---------------------------------------------------------------------------
create or replace function public.frete_entregas_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.nota_fiscal := nullif(trim(coalesce(new.nota_fiscal, '')), '');
  new.observacao := nullif(trim(coalesce(new.observacao, '')), '');

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.deleted_at := null;
    if new.pago then
      if new.nota_fiscal is null then raise exception 'Informe a nota fiscal para registrar o pagamento.'; end if;
      new.data_pagamento := now();
      new.pago_por := auth.uid();
    else
      new.data_pagamento := null;
      new.pago_por := null;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if old.pago then
      new.pago := true;
      new.data_pagamento := old.data_pagamento;
      new.pago_por := old.pago_por;
      new.nota_fiscal := old.nota_fiscal;
    elsif new.pago then
      if new.nota_fiscal is null then raise exception 'Informe a nota fiscal para registrar o pagamento.'; end if;
      new.data_pagamento := now();
      new.pago_por := auth.uid();
    else
      new.data_pagamento := null;
      new.pago_por := null;
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.frete_entregas_depois()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_diff jsonb; v_edit jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.frete_log_registrar('FRETE', new.id, 'INSERIU',
      jsonb_build_object('motorista_id', new.motorista_id, 'data_registro', new.data_registro, 'valor_frete', new.valor_frete,
                         'valor_chapa', new.valor_chapa, 'valor_descarga', new.valor_descarga, 'valor_adicional', new.valor_adicional));
    if new.pago then
      perform public.frete_log_registrar('FRETE', new.id, 'PAGOU',
        jsonb_build_object('nota_fiscal', new.nota_fiscal, 'data_pagamento', new.data_pagamento));
    end if;
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.frete_log_registrar('FRETE', new.id, 'EXCLUIU', jsonb_build_object('motorista_id', new.motorista_id, 'valor_frete', new.valor_frete));
  else
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('de', o.value, 'para', n.value)), '{}'::jsonb) into v_diff
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at', 'updated_by');
    v_edit := v_diff - 'pago' - 'data_pagamento' - 'pago_por' - 'nota_fiscal';
    if v_edit <> '{}'::jsonb then
      perform public.frete_log_registrar('FRETE', new.id, 'EDITOU', v_edit);
    end if;
    if not old.pago and new.pago then
      perform public.frete_log_registrar('FRETE', new.id, 'PAGOU',
        jsonb_build_object('nota_fiscal', new.nota_fiscal, 'data_pagamento', new.data_pagamento));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists frete_entregas_antes on public.frete_entregas;
create trigger frete_entregas_antes before insert or update on public.frete_entregas
  for each row execute function public.frete_entregas_antes();
drop trigger if exists frete_entregas_updated_at on public.frete_entregas;
create trigger frete_entregas_updated_at before update on public.frete_entregas
  for each row execute function public.set_updated_at();
drop trigger if exists frete_entregas_depois on public.frete_entregas;
create trigger frete_entregas_depois after insert or update on public.frete_entregas
  for each row execute function public.frete_entregas_depois();

-- ---------------------------------------------------------------------------
-- RLS: so quem tem o modulo. Sem policy de delete (exclusao logica) e sem insert/update no log.
-- ---------------------------------------------------------------------------
alter table public.frete_motoristas enable row level security;
alter table public.frete_entregas enable row level security;
alter table public.frete_log enable row level security;

drop policy if exists frete_motoristas_select on public.frete_motoristas;
create policy frete_motoristas_select on public.frete_motoristas for select to authenticated using (public.current_user_pode_frete());
drop policy if exists frete_motoristas_insert on public.frete_motoristas;
create policy frete_motoristas_insert on public.frete_motoristas for insert to authenticated with check (public.current_user_pode_frete());
drop policy if exists frete_motoristas_update on public.frete_motoristas;
create policy frete_motoristas_update on public.frete_motoristas for update to authenticated
  using (public.current_user_pode_frete()) with check (public.current_user_pode_frete());

drop policy if exists frete_entregas_select on public.frete_entregas;
create policy frete_entregas_select on public.frete_entregas for select to authenticated using (public.current_user_pode_frete());
drop policy if exists frete_entregas_insert on public.frete_entregas;
create policy frete_entregas_insert on public.frete_entregas for insert to authenticated with check (public.current_user_pode_frete());
drop policy if exists frete_entregas_update on public.frete_entregas;
create policy frete_entregas_update on public.frete_entregas for update to authenticated
  using (public.current_user_pode_frete()) with check (public.current_user_pode_frete());

drop policy if exists frete_log_select on public.frete_log;
create policy frete_log_select on public.frete_log for select to authenticated using (public.current_user_pode_frete());

-- ---------------------------------------------------------------------------
-- Carga inicial de motoristas a partir dos romaneios do SSW (nome e CPF mais recentes de cada motorista)
-- ---------------------------------------------------------------------------
insert into public.frete_motoristas (nome, cpf)
select distinct on (lower(trim(r.motorista))) trim(r.motorista), r.cpf_motorista
  from ssw_tracking.romaneios r
 where nullif(trim(coalesce(r.motorista, '')), '') is not null
 order by lower(trim(r.motorista)), r.atualizado_em desc nulls last
on conflict do nothing;

comment on table public.frete_entregas is 'Modulo Frete entrega: fretes pagos a motoristas. Exclusao logica; pagamento e nota fiscal travados depois de pago.';
