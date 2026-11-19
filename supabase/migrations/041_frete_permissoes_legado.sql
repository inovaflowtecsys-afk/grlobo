-- GrupoLobo | Frete entrega: preserva o acesso de usuarios criados antes das permissoes por acao.
-- Se o modulo ja estava liberado e uma acao ainda nao existia, a acao era implicitamente permitida.
-- Nao altera chaves que ja foram definidas explicitamente.

update public.profiles
set modulos_acesso = modulos_acesso
  || jsonb_build_object(
       'frete_entrega_incluir', coalesce((modulos_acesso ->> 'frete_entrega_incluir')::boolean, true),
       'frete_entrega_editar', coalesce((modulos_acesso ->> 'frete_entrega_editar')::boolean, true),
       'frete_entrega_excluir', coalesce((modulos_acesso ->> 'frete_entrega_excluir')::boolean, true)
     )
where coalesce((modulos_acesso ->> 'frete_entrega')::boolean, false)
  and (
    not (modulos_acesso ? 'frete_entrega_incluir')
    or not (modulos_acesso ? 'frete_entrega_editar')
    or not (modulos_acesso ? 'frete_entrega_excluir')
  );
