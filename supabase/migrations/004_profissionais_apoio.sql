-- GrupoLobo | Apoio ao modulo Profissionais
-- 1) Setores e cargos iniciais, vindos dos cadastros legados (departamento, cargo).
-- 2) RPC para o proprio usuario concluir a troca da senha provisoria.

insert into public.empresa_setores (empresa_id, nome)
select e.id, d.departamento
from public.departamento d
cross join lateral (select id from public.empresas where deleted_at is null order by created_at limit 1) e
where nullif(trim(d.departamento), '') is not null
on conflict (empresa_id, nome) do nothing;

insert into public.empresa_cargos (empresa_id, nome)
select e.id, c.cargo
from public.cargo c
cross join lateral (select id from public.empresas where deleted_at is null order by created_at limit 1) e
where nullif(trim(c.cargo), '') is not null
on conflict (empresa_id, nome) do nothing;

-- Vinculo do administrador inicial (profissional 10 do legado: GERENTE / ADMINISTRATIVO).
update public.profiles p
set cargo_id = (select id from public.empresa_cargos where nome = 'GERENTE'),
    cargo = 'GERENTE',
    setor_id = (select id from public.empresa_setores where nome = 'ADMINISTRATIVO')
where p.codigo = 10 and p.cargo_id is null;

-- profiles nao tem policy de update para authenticated; esta funcao e a unica escrita permitida ao proprio usuario.
create or replace function public.concluir_troca_senha()
returns void language sql security definer set search_path = public as $$
  update public.profiles set senha_provisoria = false where id = auth.uid();
$$;
revoke all on function public.concluir_troca_senha() from public, anon;
grant execute on function public.concluir_troca_senha() to authenticated;
