-- GrupoLobo | Frete entrega: permissoes por acao (incluir, editar, excluir)
-- Chaves em profiles.modulos_acesso: frete_entrega (abrir o modulo), frete_entrega_incluir, frete_entrega_editar, frete_entrega_excluir.
-- Regra: usuario comum precisa da chave = true; administrador tem tudo, EXCETO o que estiver explicitamente false
-- (administrador tambem pode ser limitado; chave ausente = liberado, entao quem ja era admin nao perde acesso).
-- Esta migration NAO altera GRANT/REVOKE. Idempotente.

-- Permissao de uma chave (sem a chave do modulo nao vale nenhuma acao)
create or replace function public.current_user_pode_frete(p_acao text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.deleted_at is null
      and case
            when p.administrador or p.tipo_usuario = 'ADMINISTRADOR' then
              coalesce(p.modulos_acesso ->> 'frete_entrega', 'true') <> 'false'
              and (p_acao is null or coalesce(p.modulos_acesso ->> ('frete_entrega_' || p_acao), 'true') <> 'false')
            else
              coalesce(p.modulos_acesso ->> 'frete_entrega', 'false') = 'true'
              and (p_acao is null or coalesce(p.modulos_acesso ->> ('frete_entrega_' || p_acao), 'false') = 'true')
          end);
$$;

-- Acesso ao modulo (leitura)
create or replace function public.current_user_pode_frete()
returns boolean language sql security definer stable set search_path = public as $$
  select public.current_user_pode_frete(null::text);
$$;

-- Escrita: incluir (insert) e editar/excluir (update). A distincao entre editar e excluir e feita nos triggers.
drop policy if exists frete_motoristas_insert on public.frete_motoristas;
create policy frete_motoristas_insert on public.frete_motoristas for insert to authenticated
  with check (public.current_user_pode_frete('incluir'));
drop policy if exists frete_entregas_insert on public.frete_entregas;
create policy frete_entregas_insert on public.frete_entregas for insert to authenticated
  with check (public.current_user_pode_frete('incluir'));

drop policy if exists frete_motoristas_update on public.frete_motoristas;
create policy frete_motoristas_update on public.frete_motoristas for update to authenticated
  using (public.current_user_pode_frete('editar') or public.current_user_pode_frete('excluir'))
  with check (public.current_user_pode_frete('editar') or public.current_user_pode_frete('excluir'));
drop policy if exists frete_entregas_update on public.frete_entregas;
create policy frete_entregas_update on public.frete_entregas for update to authenticated
  using (public.current_user_pode_frete('editar') or public.current_user_pode_frete('excluir'))
  with check (public.current_user_pode_frete('editar') or public.current_user_pode_frete('excluir'));

-- Triggers BEFORE: acrescentam a checagem de acao (so quando ha usuario logado; service_role nao passa por aqui)
create or replace function public.frete_motoristas_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.nome := trim(new.nome);
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    if auth.uid() is not null then
      if old.deleted_at is null and new.deleted_at is not null then
        if not public.current_user_pode_frete('excluir') then raise exception 'Você não tem permissão para excluir.'; end if;
      elsif not public.current_user_pode_frete('editar') then
        raise exception 'Você não tem permissão para editar.';
      end if;
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

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
    if auth.uid() is not null then
      if old.deleted_at is null and new.deleted_at is not null then
        if not public.current_user_pode_frete('excluir') then raise exception 'Você não tem permissão para excluir.'; end if;
      elsif not public.current_user_pode_frete('editar') then
        raise exception 'Você não tem permissão para editar.';
      end if;
    end if;
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
