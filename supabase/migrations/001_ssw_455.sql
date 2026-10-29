-- GrupoLobo | Modulo SSW 455 (Fretes Expedidos/Recebidos - CTRCs)
-- Rodar UMA vez no SQL Editor do Supabase do Grupo Lobo (projeto proprio, separado da Macklog).
-- Parte 1: tabelas, upsert com merge e RLS | Parte 2: colunas tipadas preenchidas por gatilho.

-- ===================== PARTE 1 =====================

create table if not exists public.ssw_455_ctrcs (
  dominio text not null,
  chave_linha text not null,            -- CTRC (sigla+numero) ou, na falta, a chave do CT-e
  ctrc text,
  chave_cte text,
  dados jsonb not null,                 -- linha completa do TXT, colunas normalizadas
  hash_dados text not null,
  primeira_sequencia text,
  ultima_sequencia text,
  primeiro_visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (dominio, chave_linha)
);
create index if not exists ssw_455_ctrcs_ctrc_idx on public.ssw_455_ctrcs (ctrc);
create index if not exists ssw_455_ctrcs_chave_cte_idx on public.ssw_455_ctrcs (chave_cte);
create index if not exists ssw_455_ctrcs_atualizado_idx on public.ssw_455_ctrcs (atualizado_em desc);

-- Log de cada arquivo recebido (uma linha por sequencia do 156).
create table if not exists public.ssw_455_cargas (
  id uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  dominio text,
  sequencia text,
  linhas integer,
  novos integer,
  atualizados integer,
  iguais integer,
  ok boolean,
  erro text
);
create index if not exists ssw_455_cargas_recebido_idx on public.ssw_455_cargas (recebido_em desc);
create index if not exists ssw_455_cargas_sequencia_idx on public.ssw_455_cargas (sequencia);

-- Upsert por conteudo: insere o que e novo, atualiza o que mudou, ignora o que e igual.
create or replace function public.ssw_455_upsert(p_dominio text, p_sequencia text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_novos integer := 0;
  v_atualizados integer := 0;
begin
  with entrada as (
    select distinct on (r->>'chave_linha')
      r->>'chave_linha' as chave_linha,
      nullif(r->>'ctrc', '') as ctrc,
      nullif(r->>'chave_cte', '') as chave_cte,
      r->'dados' as dados,
      md5((r->'dados')::text) as hash_dados
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where coalesce(r->>'chave_linha', '') <> ''
    order by r->>'chave_linha'
  ),
  gravado as (
    insert into public.ssw_455_ctrcs as t (dominio, chave_linha, ctrc, chave_cte, dados, hash_dados, primeira_sequencia, ultima_sequencia)
    select p_dominio, e.chave_linha, e.ctrc, e.chave_cte, e.dados, e.hash_dados, p_sequencia, p_sequencia from entrada e
    on conflict (dominio, chave_linha) do update
      set ctrc = excluded.ctrc,
          chave_cte = excluded.chave_cte,
          dados = t.dados || excluded.dados,
          hash_dados = md5((t.dados || excluded.dados)::text),
          ultima_sequencia = excluded.ultima_sequencia,
          atualizado_em = now()
      where t.hash_dados is distinct from md5((t.dados || excluded.dados)::text)
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido)
    into v_novos, v_atualizados from gravado;

  return jsonb_build_object('linhas', v_total, 'novos', v_novos, 'atualizados', v_atualizados, 'iguais', v_total - v_novos - v_atualizados);
end;
$$;
revoke all on function public.ssw_455_upsert(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ssw_455_upsert(text, text, jsonb) to service_role;

do $$
declare t text;
begin
  foreach t in array array['ssw_455_ctrcs', 'ssw_455_cargas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_service_write', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_write', t);
  end loop;
end $$;

-- ===================== PARTE 2 =====================
-- Colunas tipadas para public.ssw_455_ctrcs (relatorio 455).
-- O registro bruto continua em `dados` (jsonb); um gatilho preenche as colunas a cada insert/update.
-- Depois de rodar: select * from public.ssw_455_ctrcs order by ctrc;

create or replace function public.ssw_br_num(t text)
returns numeric language sql immutable as $$
  select case when trim(t) ~ '^-?[0-9]+([.][0-9]{3})*(,[0-9]+)?$'
              then replace(replace(trim(t), '.', ''), ',', '.')::numeric end
$$;

create or replace function public.ssw_br_date(t text)
returns date language sql immutable as $$
  select case when trim(t) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' then to_date(substr(trim(t), 1, 10), 'DD/MM/YYYY')
              when trim(t) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' then to_date(trim(t), 'DD/MM/YY') end
$$;

alter table public.ssw_455_ctrcs
  add column if not exists tipo_documento text,
  add column if not exists cte text,
  add column if not exists data_autorizacao date,
  add column if not exists remetente_nome text,
  add column if not exists remetente_cnpj text,
  add column if not exists remetente_uf text,
  add column if not exists pagador_nome text,
  add column if not exists pagador_cnpj text,
  add column if not exists destinatario_nome text,
  add column if not exists destinatario_cnpj text,
  add column if not exists destinatario_cidade text,
  add column if not exists destinatario_uf text,
  add column if not exists entrega_cidade text,
  add column if not exists entrega_uf text,
  add column if not exists entrega_cep text,
  add column if not exists numero_nf text,
  add column if not exists chaves_nfe text,
  add column if not exists mercadoria text,
  add column if not exists especie text,
  add column if not exists volumes integer,
  add column if not exists peso_real_kg numeric,
  add column if not exists peso_calculado_kg numeric,
  add column if not exists cubagem_m3 numeric,
  add column if not exists valor_mercadoria numeric,
  add column if not exists valor_frete numeric,
  add column if not exists valor_icms numeric,
  add column if not exists valor_iss numeric,
  add column if not exists previsao_entrega date,
  add column if not exists entrega_programada date,
  add column if not exists data_entrega date,
  add column if not exists localizacao_atual text,
  add column if not exists data_ultima_ocorrencia date,
  add column if not exists primeiro_manifesto text,
  add column if not exists data_primeiro_manifesto date,
  add column if not exists ultimo_manifesto text,
  add column if not exists data_ultimo_manifesto date,
  add column if not exists placa_coleta text,
  add column if not exists placa_cavalo text,
  add column if not exists placa_carreta text,
  add column if not exists placa_entrega text,
  add column if not exists data_cancelamento date,
  add column if not exists motivo_cancelamento text,
  add column if not exists praca_expedidora text,
  add column if not exists unidade_origem text,
  add column if not exists unidade_destino text,
  add column if not exists rota text,
  add column if not exists setor_destino text,
  add column if not exists praca_destino text,
  add column if not exists praca_comercial_origem text,
  add column if not exists praca_comercial_destino text,
  add column if not exists setor_coleta text,
  add column if not exists unidade_origem_manifesto text,
  add column if not exists unidade_destino_manifesto text,
  add column if not exists tipo_conhecimento text,
  add column if not exists notas_fiscais_json jsonb,
  add column if not exists qtd_notas integer;

create or replace function public.ssw_455_preenche_colunas()
returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
  v_nf text[]; v_ch text[];
begin
  new.tipo_documento      := nullif(trim(d->>'tipo_do_documento'), '');
  new.cte                 := nullif(trim(d->>'serie_numero_ct_e'), '');
  new.data_autorizacao    := public.ssw_br_date(d->>'data_de_autorizacao');
  new.remetente_nome      := nullif(trim(d->>'cliente_remetente'), '');
  new.remetente_cnpj      := nullif(regexp_replace(coalesce(d->>'cnpj_remetente', ''), '\D', '', 'g'), '');
  new.remetente_uf        := nullif(trim(d->>'uf_do_remetente'), '');
  new.pagador_nome        := nullif(trim(d->>'cliente_pagador'), '');
  new.pagador_cnpj        := nullif(regexp_replace(coalesce(d->>'cnpj_pagador', ''), '\D', '', 'g'), '');
  new.destinatario_nome   := nullif(trim(d->>'cliente_destinatario'), '');
  new.destinatario_cnpj   := nullif(regexp_replace(coalesce(d->>'cnpj_destinatario', ''), '\D', '', 'g'), '');
  new.destinatario_cidade := nullif(trim(d->>'cidade_do_destinatario'), '');
  new.destinatario_uf     := nullif(trim(d->>'uf_do_destinatario'), '');
  new.entrega_cidade      := nullif(trim(d->>'cidade_de_entrega'), '');
  new.entrega_uf          := nullif(trim(d->>'uf_de_entrega'), '');
  new.entrega_cep         := nullif(regexp_replace(coalesce(d->>'cep_de_entrega', ''), '\D', '', 'g'), '');
  new.numero_nf           := nullif(trim(coalesce(d->>'notas_fiscais', d->>'numero_da_nota_fiscal')), '');
  new.chaves_nfe          := nullif(trim(d->>'chaves_nf_es'), '');
  new.mercadoria          := nullif(trim(d->>'mercadoria'), '');
  new.especie             := nullif(trim(d->>'especie'), '');
  new.volumes             := public.ssw_br_num(d->>'quantidade_de_volumes')::integer;
  new.peso_real_kg        := public.ssw_br_num(d->>'peso_real_em_kg');
  new.peso_calculado_kg   := public.ssw_br_num(d->>'peso_calculado_em_kg');
  new.cubagem_m3          := public.ssw_br_num(d->>'cubagem_em_m3');
  new.valor_mercadoria    := public.ssw_br_num(d->>'valor_da_mercadoria');
  new.valor_frete         := public.ssw_br_num(d->>'valor_do_frete');
  new.valor_icms          := public.ssw_br_num(d->>'valor_do_icms');
  new.valor_iss           := public.ssw_br_num(d->>'valor_do_iss');
  new.previsao_entrega    := public.ssw_br_date(d->>'previsao_de_entrega');
  new.entrega_programada  := public.ssw_br_date(d->>'entrega_programada');
  new.data_entrega        := public.ssw_br_date(d->>'data_da_entrega_realizada');
  new.localizacao_atual   := nullif(trim(d->>'localizacao_atual'), '');
  new.data_ultima_ocorrencia := public.ssw_br_date(d->>'data_da_ultima_ocorrencia');
  new.primeiro_manifesto  := nullif(trim(d->>'primeiro_manifesto'), '');
  new.data_primeiro_manifesto := public.ssw_br_date(d->>'data_do_primeiro_manifesto');
  new.ultimo_manifesto    := nullif(trim(d->>'ultimo_manifesto'), '');
  new.data_ultimo_manifesto := public.ssw_br_date(d->>'data_do_ultimo_manifesto');
  new.placa_coleta        := nullif(trim(d->>'placa_de_coleta'), '');
  new.placa_cavalo        := nullif(trim(d->>'placa_do_cavalo'), '');
  new.placa_carreta       := nullif(trim(d->>'placa_da_carreta'), '');
  new.placa_entrega       := nullif(trim(d->>'placa_de_entrega'), '');
  new.data_cancelamento   := public.ssw_br_date(d->>'data_do_cancelamento');
  new.motivo_cancelamento := nullif(trim(d->>'motivo_do_cancelamento'), '');
  -- unidades: origem = unidade emissora (ou sigla do CTRC), destino = unidade receptora
  new.praca_expedidora    := nullif(trim(d->>'praca_expedidora'), '');
  new.unidade_origem      := coalesce(nullif(trim(d->>'unidade_emissora'), ''), nullif(substring(coalesce(new.ctrc, d->>'serie_numero_ctrc', '') from '^[A-Za-z]+'), ''));
  new.unidade_destino     := nullif(trim(d->>'unidade_receptora'), '');
  new.rota                := case when new.unidade_origem is not null and new.unidade_destino is not null then new.unidade_origem || ' > ' || new.unidade_destino end;
  new.setor_destino       := nullif(trim(d->>'setor_de_destino'), '');
  new.praca_destino       := nullif(trim(d->>'praca_de_destino'), '');
  new.praca_comercial_origem  := nullif(trim(d->>'praca_comercial_origem'), '');
  new.praca_comercial_destino := nullif(trim(d->>'praca_comercial_destino'), '');
  new.setor_coleta        := nullif(trim(d->>'setor_de_coleta'), '');
  new.unidade_origem_manifesto  := nullif(trim(d->>'unidade_origem_do_primeiro_manifesto'), '');
  new.unidade_destino_manifesto := nullif(trim(d->>'unidade_destino_do_ultimo_manifesto'), '');
  -- tipo de conhecimento normalizado: NORMAL | DEVOLUCAO | COMPLEMENTAR (o texto original fica em tipo_documento)
  new.tipo_conhecimento   := case when upper(coalesce(new.tipo_documento, '')) like '%COMPLEMENT%' then 'COMPLEMENTAR'
                                  when upper(coalesce(new.tipo_documento, '')) like '%DEVOL%' then 'DEVOLUCAO'
                                  when new.tipo_documento is null then null else 'NORMAL' end;
  -- notas fiscais vinculadas: [{nota, serie, numero, chave}] (chave so quando a quantidade de chaves = de notas)
  v_nf := string_to_array(regexp_replace(coalesce(d->>'notas_fiscais', d->>'numero_da_nota_fiscal', ''), '\s+', '', 'g'), ',');
  v_ch := string_to_array(regexp_replace(coalesce(d->>'chaves_nf_es', ''), '\s+', '', 'g'), ',');
  new.notas_fiscais_json := (
    select jsonb_agg(jsonb_build_object(
             'nota', t.n,
             'serie', case when t.n like '%/%' then split_part(t.n, '/', 1) end,
             'numero', case when t.n like '%/%' then split_part(t.n, '/', 2) else t.n end,
             'chave', case when cardinality(v_ch) = cardinality(v_nf) then v_ch[t.i] end) order by t.i)
    from unnest(v_nf) with ordinality as t(n, i) where t.n <> '');
  new.qtd_notas := jsonb_array_length(coalesce(new.notas_fiscais_json, '[]'::jsonb));
  return new;
end;
$$;

drop trigger if exists ssw_455_ctrcs_colunas on public.ssw_455_ctrcs;
create trigger ssw_455_ctrcs_colunas
  before insert or update of dados on public.ssw_455_ctrcs
  for each row execute function public.ssw_455_preenche_colunas();

create index if not exists ssw_455_ctrcs_data_autorizacao_idx on public.ssw_455_ctrcs (data_autorizacao);
create index if not exists ssw_455_ctrcs_pagador_idx on public.ssw_455_ctrcs (pagador_nome);
create index if not exists ssw_455_ctrcs_entrega_uf_idx on public.ssw_455_ctrcs (entrega_uf);
create index if not exists ssw_455_ctrcs_rota_idx on public.ssw_455_ctrcs (unidade_origem, unidade_destino);

-- Preenche as linhas ja existentes (dispara o gatilho sem alterar o conteudo).
update public.ssw_455_ctrcs set dados = dados;
