-- GrupoLobo | o upsert da 455 recebe janelas de 30 dias (~4,5 MB, ~2.300 CTRCs).
-- O limite padrao de 8s do PostgREST para a chave de servico estoura nas janelas maiores
-- ("canceling statement due to statement timeout"). Sobe o limite so para o service_role.
alter role service_role set statement_timeout = '180s';
notify pgrst, 'reload config';
select rolname, rolconfig from pg_roles where rolname = 'service_role';

-- Consulta util: CTRCs de um mes pela data de autorizacao (a 455 nao tem "data de emissao")
-- select ctrc, cte, data_autorizacao, pagador_nome, destinatario_nome, entrega_uf, valor_frete, data_entrega
-- from ssw_455_ctrcs
-- where dominio = 'grupolobo' and data_autorizacao >= date '2026-10-01' and data_autorizacao < date '2026-11-01'
-- order by data_autorizacao, ctrc;
