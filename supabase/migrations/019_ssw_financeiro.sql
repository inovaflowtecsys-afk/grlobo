-- GrupoLobo | Modulo Faturamento / financeiro do SSW (relatorios 441, 411 e 435), ligado aos CTRCs da 455 (public.ssw_455_ctrcs).
-- Rodar UMA vez no SQL Editor do Supabase do Grupo Lobo (xggknkcipdvksfvlvtmh). Idempotente.
-- Tabelas: ssw_faturas (441 lista de faturas), ssw_fatura_ctrcs (441 CTRCs de cada fatura), ssw_ctrcs_liquidados (411),
--          ssw_ctrcs_a_faturar (435, retrato do que esta disponivel para faturar), ssw_fin_cargas (log).
-- Visao final: public.ssw_ctrc_financeiro (situacao financeira de cada CTRC: PENDENTE_FATURAMENTO, FATURADO, ATRASADO, CONCLUIDO...).
-- Carga: Edge Function sync-ssw-financeiro -> RPC ssw_fin_upsert (merge de jsonb, nunca apaga campos); gatilhos preenchem as colunas tipadas.
-- Depende de public.ssw_br_num / public.ssw_br_date e public.current_user_is_active() (migrations 001 e 003+).

create or replace function public.ssw_digitos(t text) returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '')
$$;

-- ---------------------------------------------------------------------------------------------------------------- tabelas
create table if not exists public.ssw_faturas (
  dominio text not null,
  chave_linha text not null,                -- fatura com DV, ex.: 0004468-7
  dados jsonb not null,
  hash_dados text not null,
  primeira_sequencia text, ultima_sequencia text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  primary key (dominio, chave_linha)
);
create table if not exists public.ssw_fatura_ctrcs (
  dominio text not null,
  chave_linha text not null,                -- fatura sem DV | ctrc
  dados jsonb not null,
  hash_dados text not null,
  primeira_sequencia text, ultima_sequencia text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  primary key (dominio, chave_linha)
);
create table if not exists public.ssw_ctrcs_liquidados (
  dominio text not null,
  chave_linha text not null,                -- ctrc | fatura | data liquidacao | valor liquidado
  dados jsonb not null,
  hash_dados text not null,
  primeira_sequencia text, ultima_sequencia text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  primary key (dominio, chave_linha)
);
create table if not exists public.ssw_ctrcs_a_faturar (
  dominio text not null,
  chave_linha text not null,                -- ctrc
  dados jsonb not null,
  hash_dados text not null,
  ativo boolean not null default true,      -- true = ainda aparece no retrato mais recente da 435
  visto_em timestamptz not null default now(),
  saiu_em timestamptz,                      -- quando deixou de aparecer (foi faturado, cancelado...)
  primeira_sequencia text, ultima_sequencia text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  primary key (dominio, chave_linha)
);
create table if not exists public.ssw_fin_cargas (
  id uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  tipo text not null, dominio text not null, sequencia text,
  linhas integer, novos integer, atualizados integer, iguais integer,
  ok boolean not null default true, erro text
);
create index if not exists ssw_fin_cargas_recebido_idx on public.ssw_fin_cargas (recebido_em desc);

-- colunas tipadas ----------------------------------------------------------------------------------------------------
alter table public.ssw_faturas
  add column if not exists fatura text, add column if not exists fatura_numero text,
  add column if not exists cnpj_cliente text, add column if not exists cliente text, add column if not exists abc text,
  add column if not exists vendedor text, add column if not exists ultimo_movimento date,
  add column if not exists tipo_cobranca text, add column if not exists banco_carteira text, add column if not exists agencia_conta text,
  add column if not exists periodicidade text, add column if not exists email_cobranca text,
  add column if not exists endereco text, add column if not exists bairro text, add column if not exists cep text,
  add column if not exists uf text, add column if not exists cidade text, add column if not exists filial text, add column if not exists empresa text,
  add column if not exists emissao date, add column if not exists vencimento_original date, add column if not exists vencimento date,
  add column if not exists cancelamento date, add column if not exists data_promessa date, add column if not exists pagamento date,
  add column if not exists data_credito_caixa date, add column if not exists valor_credito_caixa numeric,
  add column if not exists dias_atraso integer, add column if not exists situacao_ssw text, add column if not exists situacao text,
  add column if not exists protestada_cartorio text, add column if not exists spc_serasa text, add column if not exists prorrogada text,
  add column if not exists valor_ctrcs numeric, add column if not exists valor_debito numeric, add column if not exists valor_credito numeric,
  add column if not exists motivo_debito_credito text, add column if not exists valor_fatura numeric,
  add column if not exists juros_previstos numeric, add column if not exists multa_prevista numeric, add column if not exists juros numeric,
  add column if not exists desconto numeric, add column if not exists pagamento_parcial numeric, add column if not exists valor_pago numeric,
  add column if not exists saldo numeric, add column if not exists tipo_baixa text, add column if not exists nro_titulo_banco text,
  add column if not exists login_emissao text, add column if not exists ultima_ocorrencia text, add column if not exists unidade_responsavel text,
  add column if not exists pre_fatura_edi text, add column if not exists data_perda date;

alter table public.ssw_fatura_ctrcs
  add column if not exists fatura_numero text, add column if not exists emissao_fatura date, add column if not exists ctrc text,
  add column if not exists cte text, add column if not exists data_emissao date, add column if not exists data_autorizacao date,
  add column if not exists valor_frete numeric, add column if not exists lote_contabil text, add column if not exists valor_contabil numeric;

alter table public.ssw_ctrcs_liquidados
  add column if not exists ctrc text, add column if not exists cte text, add column if not exists numero_formulario text,
  add column if not exists data_emissao date, add column if not exists tipo_frete text,
  add column if not exists remetente_cnpj text, add column if not exists remetente_nome text,
  add column if not exists destinatario_cnpj text, add column if not exists destinatario_nome text,
  add column if not exists pagador_cnpj text, add column if not exists pagador_nome text,
  add column if not exists uf text, add column if not exists cidade text,
  add column if not exists valor_frete numeric, add column if not exists valor_juro numeric, add column if not exists valor_desconto numeric,
  add column if not exists valor_liquidado numeric, add column if not exists data_liquidacao date, add column if not exists unidade_liquidacao text,
  add column if not exists forma_liquidacao text, add column if not exists banco_ag_conta text, add column if not exists fatura text,
  add column if not exists fatura_numero text, add column if not exists data_credito_caixa date, add column if not exists vendedor text,
  add column if not exists cidade_destino text, add column if not exists uf_destino text, add column if not exists login_liquidacao text,
  add column if not exists cod_mercadoria text;

alter table public.ssw_ctrcs_a_faturar
  add column if not exists empresa text, add column if not exists ctrc text, add column if not exists cte text,
  add column if not exists pagador text, add column if not exists cnpj_pagador text, add column if not exists cobranca text,
  add column if not exists unidade_destino text, add column if not exists banco text, add column if not exists valor_frete numeric,
  add column if not exists data_emissao date, add column if not exists canhoto text, add column if not exists nota_fiscal text,
  add column if not exists valor_icms numeric, add column if not exists mercadoria text, add column if not exists tipo_frete text,
  add column if not exists pre_fatura text, add column if not exists ctrc_origem text, add column if not exists tipo_documento text,
  add column if not exists ultima_ocorrencia text, add column if not exists data_entrega date, add column if not exists chave_cte text,
  add column if not exists remetente_cnpj text, add column if not exists remetente text, add column if not exists destinatario_cnpj text,
  add column if not exists destinatario text, add column if not exists previsao_entrega date, add column if not exists observacao text,
  add column if not exists demais_notas text;

-- gatilhos (preenchem as colunas tipadas a partir do jsonb) -----------------------------------------------------------
create or replace function public.ssw_faturas_colunas() returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
begin
  new.fatura := nullif(trim(d->>'fatura'), '');
  new.fatura_numero := nullif(split_part(coalesce(new.fatura, ''), '-', 1), '');
  new.cnpj_cliente := public.ssw_digitos(d->>'cnpj_cpf');
  new.cliente := nullif(trim(d->>'cliente'), '');
  new.abc := nullif(trim(d->>'abc'), '');
  new.vendedor := nullif(trim(d->>'vendedor'), '');
  new.ultimo_movimento := public.ssw_br_date(d->>'ultimo_movimento');
  new.tipo_cobranca := nullif(trim(d->>'tipo_de_cobranca'), '');
  new.banco_carteira := nullif(trim(d->>'banco_carteira'), '');
  new.agencia_conta := nullif(trim(d->>'agencia_conta'), '');
  new.periodicidade := nullif(trim(d->>'periodicidade'), '');
  new.email_cobranca := nullif(trim(d->>'e_mail_cobranca'), '');
  new.endereco := nullif(trim(d->>'endereco'), '');
  new.bairro := nullif(trim(d->>'bairro'), '');
  new.cep := public.ssw_digitos(d->>'cep');
  new.uf := nullif(trim(d->>'uf'), '');
  new.cidade := nullif(trim(d->>'cidade'), '');
  new.filial := nullif(trim(d->>'fil'), '');
  new.empresa := nullif(trim(d->>'empresa'), '');
  new.emissao := public.ssw_br_date(d->>'emissao');
  new.vencimento_original := public.ssw_br_date(d->>'venc_ori');
  new.vencimento := public.ssw_br_date(d->>'vencimen');
  new.cancelamento := public.ssw_br_date(d->>'cancelam');
  new.data_promessa := public.ssw_br_date(d->>'data_promessa');
  new.pagamento := public.ssw_br_date(d->>'pagamento');
  new.data_credito_caixa := public.ssw_br_date(d->>'data_credito_caixa');
  new.valor_credito_caixa := public.ssw_br_num(d->>'valor_credito_caixa');
  new.dias_atraso := public.ssw_br_num(d->>'dias_atraso')::integer;
  new.situacao_ssw := nullif(trim(d->>'liquidada_atrasada'), '');
  new.protestada_cartorio := nullif(trim(d->>'protestada_cartorio'), '');
  new.spc_serasa := nullif(trim(d->>'spc_serasa'), '');
  new.prorrogada := nullif(trim(d->>'prorrogada'), '');
  new.valor_ctrcs := public.ssw_br_num(d->>'vlr_ctrcs');
  new.valor_debito := public.ssw_br_num(d->>'vlr_debito');
  new.valor_credito := public.ssw_br_num(d->>'vlr_credito');
  new.motivo_debito_credito := nullif(trim(d->>'motivo_debito_credito'), '');
  new.valor_fatura := public.ssw_br_num(d->>'vlr_fatur');
  new.juros_previstos := public.ssw_br_num(d->>'jurprev');
  new.multa_prevista := public.ssw_br_num(d->>'multaprev');
  new.juros := public.ssw_br_num(d->>'juros');
  new.desconto := public.ssw_br_num(d->>'desconto');
  new.pagamento_parcial := public.ssw_br_num(d->>'pgto_parcial');
  new.valor_pago := public.ssw_br_num(d->>'vlr_pago');
  new.saldo := public.ssw_br_num(d->>'saldo');
  new.tipo_baixa := nullif(trim(d->>'tipo_baixa'), '');
  new.nro_titulo_banco := nullif(trim(d->>'nro_tit_bco'), '');
  new.login_emissao := nullif(trim(d->>'login_emit'), '');
  new.ultima_ocorrencia := nullif(trim(d->>'ultima_ocorrencia'), '');
  new.unidade_responsavel := nullif(trim(d->>'unidade_responsavel'), '');
  new.pre_fatura_edi := nullif(trim(d->>'pre_fatura_edi'), '');
  new.data_perda := public.ssw_br_date(d->>'data_perda');
  -- situacao da fatura: CANCELADA | LIQUIDADA | ATRASADA (vencida e nao paga) | ABERTA (a vencer)
  new.situacao := case
    when new.cancelamento is not null then 'CANCELADA'
    when upper(coalesce(new.situacao_ssw, '')) like 'LIQUID%' then 'LIQUIDADA'
    when upper(coalesce(new.situacao_ssw, '')) like 'ATRAS%' or (coalesce(new.dias_atraso, 0) > 0 and coalesce(new.saldo, 0) > 0) then 'ATRASADA'
    else 'ABERTA' end;
  return new;
end $$;
drop trigger if exists ssw_faturas_colunas on public.ssw_faturas;
create trigger ssw_faturas_colunas before insert or update of dados on public.ssw_faturas
  for each row execute function public.ssw_faturas_colunas();

create or replace function public.ssw_fatura_ctrcs_colunas() returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
begin
  new.fatura_numero := nullif(trim(d->>'fatura_numero'), '');
  new.emissao_fatura := public.ssw_br_date(d->>'emissao_fatura');
  new.ctrc := nullif(trim(d->>'ctrc'), '');
  new.cte := nullif(trim(d->>'cte'), '');
  new.data_emissao := public.ssw_br_date(d->>'data_emissao');
  new.data_autorizacao := public.ssw_br_date(d->>'data_autorizacao');
  new.valor_frete := public.ssw_br_num(d->>'valor_frete');
  new.lote_contabil := nullif(trim(d->>'lote_contabil'), '');
  new.valor_contabil := public.ssw_br_num(d->>'valor_contabil');
  return new;
end $$;
drop trigger if exists ssw_fatura_ctrcs_colunas on public.ssw_fatura_ctrcs;
create trigger ssw_fatura_ctrcs_colunas before insert or update of dados on public.ssw_fatura_ctrcs
  for each row execute function public.ssw_fatura_ctrcs_colunas();

create or replace function public.ssw_ctrcs_liquidados_colunas() returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
begin
  new.ctrc := nullif(trim(d->>'ctrc'), '');
  new.cte := nullif(trim(d->>'numero_ct_e'), '');
  new.numero_formulario := nullif(trim(d->>'numero_do_formulario'), '');
  new.data_emissao := public.ssw_br_date(d->>'data_emissao');
  new.tipo_frete := nullif(trim(d->>'tipo'), '');
  new.remetente_cnpj := public.ssw_digitos(d->>'cnpj_remetente');
  new.remetente_nome := nullif(trim(d->>'nome_remetente'), '');
  new.destinatario_cnpj := public.ssw_digitos(d->>'cnpj_destinatario');
  new.destinatario_nome := nullif(trim(d->>'nome_destinatario'), '');
  new.pagador_cnpj := public.ssw_digitos(d->>'cnpj_pagador');
  new.pagador_nome := nullif(trim(d->>'nome_pagador'), '');
  new.uf := nullif(trim(d->>'uf'), '');
  new.cidade := nullif(trim(d->>'cidade'), '');
  new.valor_frete := public.ssw_br_num(d->>'vlr_frete');
  new.valor_juro := public.ssw_br_num(d->>'vlr_juro');
  new.valor_desconto := public.ssw_br_num(d->>'vlr_desconto');
  new.valor_liquidado := public.ssw_br_num(d->>'valor_liqu');
  new.data_liquidacao := public.ssw_br_date(d->>'data_liquid');
  new.unidade_liquidacao := nullif(trim(d->>'unidade_liqui'), '');
  new.forma_liquidacao := nullif(trim(d->>'forma_liqu'), '');
  new.banco_ag_conta := nullif(trim(d->>'banco_ag_conta'), '');
  new.fatura := nullif(trim(d->>'fatura'), '');
  new.fatura_numero := nullif(split_part(coalesce(new.fatura, ''), '-', 1), '');
  new.data_credito_caixa := public.ssw_br_date(d->>'data_credito_caixa');
  new.vendedor := nullif(trim(d->>'vendedor'), '');
  new.cidade_destino := nullif(trim(d->>'cidade_destino'), '');
  new.uf_destino := nullif(trim(d->>'uf_destino'), '');
  new.login_liquidacao := nullif(trim(d->>'login'), '');
  new.cod_mercadoria := nullif(trim(d->>'cod_mercadoria'), '');
  return new;
end $$;
drop trigger if exists ssw_ctrcs_liquidados_colunas on public.ssw_ctrcs_liquidados;
create trigger ssw_ctrcs_liquidados_colunas before insert or update of dados on public.ssw_ctrcs_liquidados
  for each row execute function public.ssw_ctrcs_liquidados_colunas();

create or replace function public.ssw_ctrcs_a_faturar_colunas() returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
begin
  new.empresa := nullif(trim(d->>'em'), '');
  new.ctrc := nullif(trim(d->>'ctrc'), '');
  new.cte := nullif(trim(d->>'numero_ct_e_nfps'), '');
  new.pagador := nullif(trim(d->>'pagador'), '');
  new.cnpj_pagador := public.ssw_digitos(d->>'cnpj_pagador');
  new.cobranca := nullif(trim(d->>'cob'), '');
  new.unidade_destino := nullif(trim(d->>'dest'), '');
  new.banco := nullif(trim(d->>'banco'), '');
  new.valor_frete := public.ssw_br_num(d->>'frete');
  new.data_emissao := public.ssw_br_date(d->>'emissao');
  new.canhoto := nullif(trim(d->>'canhot'), '');
  new.nota_fiscal := nullif(trim(d->>'nfiscal'), '');
  new.valor_icms := public.ssw_br_num(d->>'icms');
  new.mercadoria := nullif(trim(d->>'mer'), '');
  new.tipo_frete := nullif(trim(d->>'tip'), '');
  new.pre_fatura := nullif(trim(d->>'pre_fatu'), '');
  new.ctrc_origem := nullif(trim(d->>'ctrc_origem'), '');
  new.tipo_documento := nullif(trim(d->>'tipo_doc'), '');
  new.ultima_ocorrencia := nullif(trim(d->>'ult_ocor'), '');
  new.data_entrega := public.ssw_br_date(d->>'data_entrega');
  new.chave_cte := public.ssw_digitos(d->>'chave_cte');
  new.remetente_cnpj := public.ssw_digitos(d->>'cnpj_remetente');
  new.remetente := nullif(trim(d->>'remetente'), '');
  new.destinatario_cnpj := public.ssw_digitos(d->>'cnpj_destinatario');
  new.destinatario := nullif(trim(d->>'destinatario'), '');
  new.previsao_entrega := public.ssw_br_date(d->>'previsao_de_entrega');
  new.observacao := nullif(trim(d->>'observacao'), '');
  new.demais_notas := nullif(trim(d->>'demais_notas'), '');
  return new;
end $$;
drop trigger if exists ssw_ctrcs_a_faturar_colunas on public.ssw_ctrcs_a_faturar;
create trigger ssw_ctrcs_a_faturar_colunas before insert or update of dados on public.ssw_ctrcs_a_faturar
  for each row execute function public.ssw_ctrcs_a_faturar_colunas();

-- indices ------------------------------------------------------------------------------------------------------------
create index if not exists ssw_faturas_numero_idx on public.ssw_faturas (dominio, fatura_numero);
create index if not exists ssw_faturas_situacao_idx on public.ssw_faturas (situacao, vencimento);
create index if not exists ssw_faturas_cnpj_idx on public.ssw_faturas (cnpj_cliente);
create index if not exists ssw_fatura_ctrcs_ctrc_idx on public.ssw_fatura_ctrcs (dominio, ctrc);
create index if not exists ssw_fatura_ctrcs_fatura_idx on public.ssw_fatura_ctrcs (dominio, fatura_numero);
create index if not exists ssw_ctrcs_liquidados_ctrc_idx on public.ssw_ctrcs_liquidados (dominio, ctrc);
create index if not exists ssw_ctrcs_liquidados_data_idx on public.ssw_ctrcs_liquidados (data_liquidacao);
create index if not exists ssw_ctrcs_a_faturar_ctrc_idx on public.ssw_ctrcs_a_faturar (dominio, ctrc) where ativo;

-- upsert generico (merge de jsonb; para a 435 marca o que saiu do retrato) ----------------------------------------------
create or replace function public.ssw_fin_upsert(p_tabela text, p_dominio text, p_sequencia text, p_rows jsonb, p_retrato boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_total integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_novos integer := 0; v_atualizados integer := 0; v_saiu integer := 0;
  v_extra text := '';
begin
  if p_tabela not in ('ssw_faturas', 'ssw_fatura_ctrcs', 'ssw_ctrcs_liquidados', 'ssw_ctrcs_a_faturar') then
    raise exception 'tabela nao permitida: %', p_tabela;
  end if;
  if p_tabela = 'ssw_ctrcs_a_faturar' then v_extra := ', ativo = true, visto_em = now(), saiu_em = null'; end if;
  execute format($f$
    with entrada as (
      select distinct on (r->>'chave_linha') r->>'chave_linha' as chave_linha, r->'dados' as dados, md5((r->'dados')::text) as hash_dados
      from jsonb_array_elements($1) r where coalesce(r->>'chave_linha', '') <> '' order by r->>'chave_linha'
    ), gravado as (
      insert into public.%1$I as t (dominio, chave_linha, dados, hash_dados, primeira_sequencia, ultima_sequencia)
      select $2, e.chave_linha, e.dados, e.hash_dados, $3, $3 from entrada e
      on conflict (dominio, chave_linha) do update
        set dados = t.dados || excluded.dados,
            hash_dados = md5((t.dados || excluded.dados)::text),
            ultima_sequencia = excluded.ultima_sequencia,
            atualizado_em = now() %2$s
        where t.hash_dados is distinct from md5((t.dados || excluded.dados)::text) %3$s
      returning (xmax = 0) as inserido
    ) select count(*) filter (where inserido), count(*) filter (where not inserido) from gravado
  $f$, p_tabela, v_extra, case when p_tabela = 'ssw_ctrcs_a_faturar' then 'or not t.ativo' else '' end)
  into v_novos, v_atualizados using coalesce(p_rows, '[]'::jsonb), p_dominio, p_sequencia;

  if p_retrato and p_tabela = 'ssw_ctrcs_a_faturar' and v_total > 0 then
    -- tudo que estava ativo e nao veio neste retrato deixou de estar "disponivel para faturar"
    update public.ssw_ctrcs_a_faturar t set ativo = false, saiu_em = now()
     where t.dominio = p_dominio and t.ativo
       and not exists (select 1 from jsonb_array_elements(p_rows) r where r->>'chave_linha' = t.chave_linha);
    get diagnostics v_saiu = row_count;
  end if;
  return jsonb_build_object('linhas', v_total, 'novos', v_novos, 'atualizados', v_atualizados,
                            'iguais', v_total - v_novos - v_atualizados, 'saiu_do_retrato', v_saiu);
end $$;
revoke all on function public.ssw_fin_upsert(text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ssw_fin_upsert(text, text, text, jsonb, boolean) to service_role;

-- RLS: leitura para usuarios autenticados; escrita so pelo service role ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ssw_faturas', 'ssw_fatura_ctrcs', 'ssw_ctrcs_liquidados', 'ssw_ctrcs_a_faturar', 'ssw_fin_cargas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.current_user_is_active())', t || '_select', t);
  end loop;
end $$;

-- visao: situacao financeira de cada CTRC (uma linha por CTRC da 455) -------------------------------------------------------
create or replace view public.ssw_ctrc_financeiro with (security_invoker = true) as
select
  c.dominio, c.ctrc, c.cte, c.data_autorizacao, c.tipo_conhecimento, c.rota, c.unidade_origem, c.unidade_destino,
  c.pagador_nome, c.pagador_cnpj, c.valor_frete, c.data_entrega,
  case
    when c.data_cancelamento is not null then 'CANCELADO'
    when f.situacao = 'LIQUIDADA' or l.ctrc is not null then 'CONCLUIDO'
    when f.situacao = 'ATRASADA' then 'ATRASADO'
    when f.fatura is not null and f.situacao = 'ABERTA' then 'FATURADO'
    when af.ctrc is not null then 'PENDENTE_FATURAMENTO'
    else 'SEM_INFORMACAO'
  end as situacao_financeira,
  f.fatura, f.emissao as fatura_emissao, f.vencimento as fatura_vencimento, f.dias_atraso, f.saldo as fatura_saldo,
  f.valor_fatura, f.situacao as fatura_situacao, f.tipo_baixa,
  l.data_liquidacao, l.valor_liquidado, l.forma_liquidacao, l.data_credito_caixa,
  af.valor_frete as valor_a_faturar, (af.ctrc is not null) as disponivel_para_faturar
from public.ssw_455_ctrcs c
left join lateral (
  select a.* from public.ssw_ctrcs_a_faturar a where a.dominio = c.dominio and a.ctrc = c.ctrc and a.ativo limit 1
) af on true
left join lateral (
  select fc.fatura_numero from public.ssw_fatura_ctrcs fc join public.ssw_faturas ff on ff.dominio = fc.dominio and ff.fatura_numero = fc.fatura_numero
   where fc.dominio = c.dominio and fc.ctrc = c.ctrc and ff.situacao <> 'CANCELADA'
   order by fc.emissao_fatura desc nulls last limit 1
) fx on true
left join public.ssw_faturas f on f.dominio = c.dominio and f.fatura_numero = fx.fatura_numero
left join lateral (
  select x.* from public.ssw_ctrcs_liquidados x where x.dominio = c.dominio and x.ctrc = c.ctrc order by x.data_liquidacao desc nulls last limit 1
) l on true;
grant select on public.ssw_ctrc_financeiro to authenticated;

-- coluna JSON com os CTRCs de cada fatura (ssw_faturas.ctrcs_json), mantida por gatilho em ssw_fatura_ctrcs -----------------
alter table public.ssw_faturas
  add column if not exists ctrcs_json jsonb,
  add column if not exists qtd_ctrcs integer;

create or replace function public.ssw_faturas_atualiza_ctrcs(p_dominio text, p_fatura_numero text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_fatura_numero is null then return; end if;
  update public.ssw_faturas f set
    ctrcs_json = x.js, qtd_ctrcs = coalesce(x.qtd, 0)
  from (
    select jsonb_agg(jsonb_build_object(
             'ctrc', c.ctrc, 'cte', c.cte, 'data_emissao', c.data_emissao, 'data_autorizacao', c.data_autorizacao,
             'valor_frete', c.valor_frete, 'valor_contabil', c.valor_contabil) order by c.ctrc) as js,
           count(*)::integer as qtd
      from public.ssw_fatura_ctrcs c where c.dominio = p_dominio and c.fatura_numero = p_fatura_numero
  ) x
  where f.dominio = p_dominio and f.fatura_numero = p_fatura_numero
    and (f.ctrcs_json is distinct from x.js or f.qtd_ctrcs is distinct from coalesce(x.qtd, 0));
end $$;

create or replace function public.ssw_fatura_ctrcs_atualiza_fatura() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform public.ssw_faturas_atualiza_ctrcs(old.dominio, old.fatura_numero);
  else
    perform public.ssw_faturas_atualiza_ctrcs(new.dominio, new.fatura_numero);
  end if;
  return null;
end $$;
drop trigger if exists ssw_fatura_ctrcs_atualiza_fatura on public.ssw_fatura_ctrcs;
create trigger ssw_fatura_ctrcs_atualiza_fatura after insert or update or delete on public.ssw_fatura_ctrcs
  for each row execute function public.ssw_fatura_ctrcs_atualiza_fatura();

-- quando a fatura chega depois dos CTRCs (ou e atualizada), recalcula tambem
create or replace function public.ssw_faturas_completa_ctrcs() returns trigger language plpgsql as $$
begin
  perform public.ssw_faturas_atualiza_ctrcs(new.dominio, new.fatura_numero);
  return null;
end $$;
drop trigger if exists ssw_faturas_completa_ctrcs on public.ssw_faturas;
create trigger ssw_faturas_completa_ctrcs after insert on public.ssw_faturas
  for each row execute function public.ssw_faturas_completa_ctrcs();

-- preenche o que ja existe
select public.ssw_faturas_atualiza_ctrcs(dominio, fatura_numero) from public.ssw_faturas;

-- referencia de atualizacao para a interface: ultima carga com sucesso por modulo, no fuso de Brasilia ------------------------
-- exemplo de texto: "SSW - 07/10/2026 17:00".  modulo: ctrcs | faturas | liquidados | a_faturar | geral
create or replace view public.ssw_ultimas_atualizacoes with (security_invoker = true) as
with base as (
  select 'ctrcs'::text as modulo, 'CTRCs (relatorio 455)'::text as descricao, max(recebido_em) as atualizado_em
    from public.ssw_455_cargas where ok and coalesce(linhas, 0) > 0
  union all
  select case tipo when 'faturas' then 'faturas' when 'liquidados' then 'liquidados' else 'a_faturar' end,
         case tipo when 'faturas' then 'Faturas (relatorio 441)' when 'liquidados' then 'CTRCs liquidados (relatorio 411)' else 'CTRCs a faturar (relatorio 435)' end,
         max(recebido_em)
    from public.ssw_fin_cargas where ok and coalesce(linhas, 0) > 0 and sequencia not like 'carga-inicial%'
   group by 1, 2
)
select modulo, descricao, 'SSW'::text as fonte, atualizado_em,
       'SSW - ' || to_char(atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as texto
  from base
union all
-- geral: ultima carga bem-sucedida entre os modulos, para a interface acompanhar cada horario agendado
select 'geral', 'Todos os modulos', 'SSW', max(atualizado_em),
       'SSW - ' || to_char(max(atualizado_em) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
  from base;
grant select on public.ssw_ultimas_atualizacoes to authenticated;


-- =====================================================================================================================
-- Visoes de faturamento para a tela (todas security_invoker: respeitam o RLS de quem consulta)
-- =====================================================================================================================

-- Faturamento diario por data de EMISSAO do CT-e (nao por carregamento), com acumulado no mes.
create or replace view public.v_faturamento_diario with (security_invoker = true) as
with dia as (
  select c.dominio, c.data_autorizacao as dia, count(*)::integer as qtd_cte, coalesce(sum(c.valor_frete), 0) as valor_frete
    from public.ssw_455_ctrcs c
   where c.data_autorizacao is not null and c.data_cancelamento is null
   group by 1, 2
)
select d.dominio, d.dia, d.qtd_cte, d.valor_frete,
       sum(d.valor_frete) over (partition by d.dominio, date_trunc('month', d.dia) order by d.dia) as acumulado_mes
  from dia d;
grant select on public.v_faturamento_diario to authenticated;

-- Faturamento do dia por cliente (pagador).
create or replace view public.v_faturamento_dia_cliente with (security_invoker = true) as
select c.dominio, c.data_autorizacao as dia,
       coalesce(nullif(trim(c.pagador_nome), ''), 'Sem pagador') as cliente,
       c.pagador_cnpj as cnpj,
       count(*)::integer as qtd_cte, coalesce(sum(c.valor_frete), 0) as valor_frete
  from public.ssw_455_ctrcs c
 where c.data_autorizacao is not null and c.data_cancelamento is null
 group by 1, 2, 3, 4;
grant select on public.v_faturamento_dia_cliente to authenticated;

-- Situacao dos CT-es emitidos por mes de emissao: emitido x a faturar x faturado x em atraso x cobrado/liquidado.
create or replace view public.v_faturamento_situacao_mensal with (security_invoker = true) as
select f.dominio, date_trunc('month', f.data_autorizacao)::date as mes,
       count(*)::integer                                                                  as qtd_cte_emitidos,
       coalesce(sum(f.valor_frete), 0)                                                    as valor_cte_emitido,
       count(*) filter (where f.situacao_financeira = 'PENDENTE_FATURAMENTO')::integer     as qtd_a_faturar,
       coalesce(sum(f.valor_frete) filter (where f.situacao_financeira = 'PENDENTE_FATURAMENTO'), 0) as valor_a_faturar,
       count(*) filter (where f.situacao_financeira in ('FATURADO', 'ATRASADO', 'CONCLUIDO'))::integer as qtd_faturado,
       coalesce(sum(f.valor_frete) filter (where f.situacao_financeira in ('FATURADO', 'ATRASADO', 'CONCLUIDO')), 0) as valor_faturado,
       count(*) filter (where f.situacao_financeira = 'ATRASADO')::integer                 as qtd_atrasado,
       coalesce(sum(f.valor_frete) filter (where f.situacao_financeira = 'ATRASADO'), 0)   as valor_atrasado,
       count(*) filter (where f.situacao_financeira = 'CONCLUIDO')::integer                as qtd_liquidado,
       coalesce(sum(f.valor_liquidado) filter (where f.situacao_financeira = 'CONCLUIDO'), 0) as valor_liquidado,
       count(*) filter (where f.situacao_financeira = 'SEM_INFORMACAO')::integer           as qtd_sem_informacao
  from public.ssw_ctrc_financeiro f
 where f.data_autorizacao is not null and f.situacao_financeira <> 'CANCELADO'
 group by 1, 2;
grant select on public.v_faturamento_situacao_mensal to authenticated;
