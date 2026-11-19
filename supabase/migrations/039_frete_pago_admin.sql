-- GrupoLobo | Frete entrega: registro pago protegido para usuarios comuns.
-- Administradores continuam sujeitos as permissoes de editar/excluir do modulo.

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
      if old.pago and not public.current_user_is_admin() then
        raise exception 'Registro pago: somente o administrador pode editar ou excluir este frete.';
      elsif old.deleted_at is null and new.deleted_at is not null then
        if not public.current_user_pode_frete('excluir') then raise exception 'Voce nao tem permissao para excluir.'; end if;
      elsif not public.current_user_pode_frete('editar') then
        raise exception 'Voce nao tem permissao para editar.';
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

