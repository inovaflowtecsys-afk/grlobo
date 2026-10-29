-- GrupoLobo | Modulo SSW Tracking (relatorios 036, 038, 088)
-- Schema SEPARADO do 455 (public.ssw_455_*) -- nao mexe nas tabelas/views existentes.
-- Painel de acompanhamento de entregas on-time: romaneio (036), CTRCs pendentes (038), veiculos (088).
-- Mesma tecnica do 455: raw jsonb + hash + upsert idempotente + colunas tipadas via gatilho + RLS.

create schema if not exists ssw_tracking;
grant usage on schema ssw_tracking to authenticated, service_role;

-- ===================== Log compartilhado (uma linha por carga recebida) =====================
create table if not exists ssw_tracking.cargas (
  id uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  relatorio text not null,          -- '036' | '038' | '088'
  dominio text,
  referencia text,                  -- periodo (036), 'snapshot' (038) ou data (088)
  linhas integer,
  novos integer,
  atualizados integer,
  iguais integer,
  sumidos integer,
  ok boolean,
  erro text
);
create index if not exists ssw_tracking_cargas_recebido_idx on ssw_tracking.cargas (recebido_em desc);
create index if not exists ssw_tracking_cargas_relatorio_idx on ssw_tracking.cargas (relatorio);

alter table ssw_tracking.cargas enable row level security;
drop policy if exists cargas_select on ssw_tracking.cargas;
create policy cargas_select on ssw_tracking.cargas for select to authenticated using (true);
drop policy if exists cargas_service_write on ssw_tracking.cargas;
create policy cargas_service_write on ssw_tracking.cargas for all to service_role using (true) with check (true);
-- RLS so controla linhas; sem o GRANT de base o PostgREST nega com "permission denied for table cargas"
-- mesmo para service_role (grant usage on schema, acima, nao basta).
grant select on ssw_tracking.cargas to authenticated;
grant select, insert, update, delete on ssw_tracking.cargas to service_role;

-- ===================== 036: Romaneios de entrega (ssw0146, act=REL2) =====================
create table if not exists ssw_tracking.romaneios (
  dominio text not null,
  ctrc text not null,
  dados jsonb not null,
  hash_dados text not null,
  primeiro_visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (dominio, ctrc)
);
create index if not exists ssw_tracking_romaneios_atualizado_idx on ssw_tracking.romaneios (atualizado_em desc);

create or replace function ssw_tracking.romaneios_upsert(p_dominio text, p_referencia text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ssw_tracking, public
as $$
declare
  v_total integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_novos integer := 0;
  v_atualizados integer := 0;
begin
  with entrada as (
    select distinct on (r->>'ctrc')
      r->>'ctrc' as ctrc,
      r->'dados' as dados,
      md5((r->'dados')::text) as hash_dados
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where coalesce(r->>'ctrc', '') <> ''
    order by r->>'ctrc'
  ),
  gravado as (
    insert into ssw_tracking.romaneios as t (dominio, ctrc, dados, hash_dados)
    select p_dominio, e.ctrc, e.dados, e.hash_dados from entrada e
    on conflict (dominio, ctrc) do update
      set dados = excluded.dados,
          hash_dados = excluded.hash_dados,
          atualizado_em = now()
      where t.hash_dados is distinct from excluded.hash_dados
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido)
    into v_novos, v_atualizados from gravado;

  return jsonb_build_object('linhas', v_total, 'novos', v_novos, 'atualizados', v_atualizados, 'iguais', v_total - v_novos - v_atualizados);
end;
$$;
revoke all on function ssw_tracking.romaneios_upsert(text, text, jsonb) from public, anon, authenticated;
grant execute on function ssw_tracking.romaneios_upsert(text, text, jsonb) to service_role;

alter table ssw_tracking.romaneios enable row level security;
drop policy if exists romaneios_select on ssw_tracking.romaneios;
create policy romaneios_select on ssw_tracking.romaneios for select to authenticated using (true);
drop policy if exists romaneios_service_write on ssw_tracking.romaneios;
create policy romaneios_service_write on ssw_tracking.romaneios for all to service_role using (true) with check (true);
grant select on ssw_tracking.romaneios to authenticated;
grant select, insert, update, delete on ssw_tracking.romaneios to service_role;

alter table ssw_tracking.romaneios
  add column if not exists romaneio text,
  add column if not exists data_emissao date,
  add column if not exists situacao text,
  add column if not exists placa text,
  add column if not exists placa_carreta text,
  add column if not exists motorista text,
  add column if not exists cpf_motorista text,
  add column if not exists tipo_frete text,
  add column if not exists remetente_nome text,
  add column if not exists destinatario_nome text,
  add column if not exists pagador_cnpj text,
  add column if not exists pagador_nome text,
  add column if not exists cidade_pagador text,
  add column if not exists entrega_cidade text,
  add column if not exists entrega_cep text,
  add column if not exists entrega_endereco text,
  add column if not exists entrega_bairro text,
  add column if not exists setor_destino text,
  add column if not exists ocorrencia_rom_codigo text,
  add column if not exists ocorrencia_rom_descricao text,
  add column if not exists ocorrencia_rom_data date,
  add column if not exists ocorrencia_ctrc_codigo text,
  add column if not exists ocorrencia_ctrc_descricao text,
  add column if not exists ocorrencia_ctrc_data date,
  add column if not exists frete_valor numeric,
  add column if not exists peso_calculo_kg numeric,
  add column if not exists volumes integer,
  add column if not exists valor_mercadoria numeric,
  add column if not exists numero_nf text,
  add column if not exists conferente text,
  add column if not exists prev_entrega date,
  add column if not exists entregue boolean;

create or replace function ssw_tracking.romaneios_preenche_colunas()
returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
begin
  new.romaneio             := nullif(trim(d->>'romaneio'), '');
  new.data_emissao         := public.ssw_br_date(d->>'data_emissao');
  new.situacao             := nullif(trim(d->>'situacao'), '');
  new.placa                := nullif(trim(d->>'placa'), '');
  new.placa_carreta        := nullif(trim(d->>'placa_carreta'), '');
  new.motorista            := nullif(trim(d->>'motorista'), '');
  new.cpf_motorista        := nullif(regexp_replace(coalesce(d->>'cpf_do_motorista', ''), '\D', '', 'g'), '');
  new.tipo_frete           := nullif(trim(d->>'tipo_de_frete'), '');
  new.remetente_nome       := nullif(trim(d->>'nome_remetente'), '');
  new.destinatario_nome    := nullif(trim(d->>'nome_destinatario'), '');
  new.pagador_cnpj         := nullif(regexp_replace(coalesce(d->>'cnpj_pagador', ''), '\D', '', 'g'), '');
  new.pagador_nome         := nullif(trim(d->>'nome_pagador'), '');
  new.cidade_pagador       := nullif(trim(d->>'cidade_pagador'), '');
  new.entrega_cidade       := nullif(trim(d->>'cidade_entrega'), '');
  new.entrega_cep          := nullif(regexp_replace(coalesce(d->>'cep_entrega', ''), '\D', '', 'g'), '');
  new.entrega_endereco     := nullif(trim(d->>'local_de_entrega'), '');
  new.entrega_bairro       := nullif(trim(d->>'bairro'), '');
  new.setor_destino        := nullif(trim(d->>'setor_dest'), '');
  new.ocorrencia_rom_codigo    := nullif(trim(d->>'cod_ocorr_rom'), '');
  new.ocorrencia_rom_descricao := nullif(trim(d->>'desc_ocorr_rom'), '');
  new.ocorrencia_rom_data       := public.ssw_br_date(d->>'data_ocorr_rom');
  new.ocorrencia_ctrc_codigo    := nullif(trim(d->>'cod_ocorr_ctrc'), '');
  new.ocorrencia_ctrc_descricao := nullif(trim(d->>'desc_ocorr_ctrc'), '');
  new.ocorrencia_ctrc_data       := public.ssw_br_date(d->>'data_ocorr_ctrc');
  new.frete_valor          := public.ssw_br_num(d->>'frete_ctrc');
  new.peso_calculo_kg      := public.ssw_br_num(d->>'peso_calculo');
  new.volumes              := public.ssw_br_num(d->>'qtde_vol')::integer;
  new.valor_mercadoria     := public.ssw_br_num(d->>'vlr_merc');
  new.numero_nf            := nullif(trim(d->>'numero_nf'), '');
  new.conferente           := nullif(trim(d->>'conferente'), '');
  new.prev_entrega         := public.ssw_br_date(d->>'prev_entrega_ctrc');
  new.entregue             := upper(coalesce(d->>'situacao', '')) = 'BAIXADO';
  return new;
end;
$$;
drop trigger if exists romaneios_colunas on ssw_tracking.romaneios;
create trigger romaneios_colunas
  before insert or update of dados on ssw_tracking.romaneios
  for each row execute function ssw_tracking.romaneios_preenche_colunas();

create index if not exists ssw_tracking_romaneios_placa_idx on ssw_tracking.romaneios (placa);
create index if not exists ssw_tracking_romaneios_motorista_idx on ssw_tracking.romaneios (motorista);
create index if not exists ssw_tracking_romaneios_situacao_idx on ssw_tracking.romaneios (situacao);

-- ===================== 038: CTRCs pendentes de entrega (ssw0198, act=CSV) =====================
-- Foto atual (sem filtro de periodo). Quem some da lista entre uma carga e outra foi entregue/cancelado.
create table if not exists ssw_tracking.ctrc_pendentes (
  dominio text not null,
  ctrc text not null,
  dados jsonb not null,
  hash_dados text not null,
  primeiro_visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  sumiu_em timestamptz,
  primary key (dominio, ctrc)
);
create index if not exists ssw_tracking_ctrc_pendentes_atualizado_idx on ssw_tracking.ctrc_pendentes (atualizado_em desc);

create or replace function ssw_tracking.ctrc_pendentes_upsert(p_dominio text, p_referencia text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ssw_tracking, public
as $$
declare
  v_total integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_novos integer := 0;
  v_atualizados integer := 0;
  v_sumidos integer := 0;
  v_chaves text[];
begin
  select array_agg(r->>'ctrc') into v_chaves
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where coalesce(r->>'ctrc', '') <> '';

  with entrada as (
    select distinct on (r->>'ctrc')
      r->>'ctrc' as ctrc,
      r->'dados' as dados,
      md5((r->'dados')::text) as hash_dados
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where coalesce(r->>'ctrc', '') <> ''
    order by r->>'ctrc'
  ),
  gravado as (
    insert into ssw_tracking.ctrc_pendentes as t (dominio, ctrc, dados, hash_dados)
    select p_dominio, e.ctrc, e.dados, e.hash_dados from entrada e
    on conflict (dominio, ctrc) do update
      set dados = excluded.dados,
          hash_dados = excluded.hash_dados,
          atualizado_em = now(),
          sumiu_em = null
      where t.hash_dados is distinct from excluded.hash_dados or t.sumiu_em is not null
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido)
    into v_novos, v_atualizados from gravado;

  update ssw_tracking.ctrc_pendentes
    set sumiu_em = now()
    where dominio = p_dominio and sumiu_em is null
      and not (ctrc = any(coalesce(v_chaves, array[]::text[])));
  get diagnostics v_sumidos = row_count;

  return jsonb_build_object('linhas', v_total, 'novos', v_novos, 'atualizados', v_atualizados,
                             'iguais', v_total - v_novos - v_atualizados, 'sumidos', v_sumidos);
end;
$$;
revoke all on function ssw_tracking.ctrc_pendentes_upsert(text, text, jsonb) from public, anon, authenticated;
grant execute on function ssw_tracking.ctrc_pendentes_upsert(text, text, jsonb) to service_role;

alter table ssw_tracking.ctrc_pendentes enable row level security;
drop policy if exists ctrc_pendentes_select on ssw_tracking.ctrc_pendentes;
create policy ctrc_pendentes_select on ssw_tracking.ctrc_pendentes for select to authenticated using (true);
drop policy if exists ctrc_pendentes_service_write on ssw_tracking.ctrc_pendentes;
create policy ctrc_pendentes_service_write on ssw_tracking.ctrc_pendentes for all to service_role using (true) with check (true);
grant select on ssw_tracking.ctrc_pendentes to authenticated;
grant select, insert, update, delete on ssw_tracking.ctrc_pendentes to service_role;

alter table ssw_tracking.ctrc_pendentes
  add column if not exists nota_fiscal text,
  add column if not exists remetente_nome text,
  add column if not exists destinatario_nome text,
  add column if not exists entrega_endereco text,
  add column if not exists entrega_cidade text,
  add column if not exists entrega_bairro text,
  add column if not exists entrega_cep text,
  add column if not exists setor text,
  add column if not exists valor_mercadoria numeric,
  add column if not exists volumes integer,
  add column if not exists peso_kg numeric,
  add column if not exists prazo_entrega date,
  add column if not exists atraso_dias integer,
  add column if not exists ultima_ocorrencia text,
  add column if not exists ocorrencia_codigo text,
  add column if not exists ocorrencia_descricao text,
  add column if not exists localizacao text;

create or replace function ssw_tracking.ctrc_pendentes_preenche_colunas()
returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
  v_oc text;
begin
  new.nota_fiscal       := nullif(trim(d->>'nota_fiscal'), '');
  new.remetente_nome    := nullif(trim(d->>'remetente'), '');
  new.destinatario_nome := nullif(trim(d->>'destinatario'), '');
  new.entrega_endereco  := nullif(trim(d->>'endereco'), '');
  new.entrega_cidade    := nullif(trim(d->>'cidade'), '');
  new.entrega_bairro    := nullif(trim(d->>'bairro'), '');
  new.entrega_cep       := nullif(regexp_replace(coalesce(d->>'cep', ''), '\D', '', 'g'), '');
  new.setor             := nullif(trim(d->>'setor'), '');
  new.valor_mercadoria  := public.ssw_br_num(d->>'valor_mercadoria');
  new.volumes           := public.ssw_br_num(d->>'quantidade_volumes')::integer;
  new.peso_kg           := public.ssw_br_num(d->>'peso');
  new.prazo_entrega     := public.ssw_br_date(d->>'prazo_entrega');
  new.atraso_dias       := public.ssw_br_num(d->>'atraso')::integer;
  v_oc := nullif(trim(d->>'ultima_ocorrencia'), '');
  new.ultima_ocorrencia := v_oc;
  new.ocorrencia_codigo    := case when v_oc ~ '^[0-9]+-' then split_part(v_oc, '-', 1) end;
  new.ocorrencia_descricao := case when v_oc ~ '^[0-9]+-' then substring(v_oc from position('-' in v_oc) + 1) else v_oc end;
  new.localizacao       := nullif(trim(d->>'localizacao'), '');
  return new;
end;
$$;
drop trigger if exists ctrc_pendentes_colunas on ssw_tracking.ctrc_pendentes;
create trigger ctrc_pendentes_colunas
  before insert or update of dados on ssw_tracking.ctrc_pendentes
  for each row execute function ssw_tracking.ctrc_pendentes_preenche_colunas();

create index if not exists ssw_tracking_ctrc_pendentes_atraso_idx on ssw_tracking.ctrc_pendentes (atraso_dias desc);
create index if not exists ssw_tracking_ctrc_pendentes_prazo_idx on ssw_tracking.ctrc_pendentes (prazo_entrega);
create index if not exists ssw_tracking_ctrc_pendentes_sumiu_idx on ssw_tracking.ctrc_pendentes (sumiu_em);

-- ===================== 088: Situacao dos veiculos de coleta/entrega (ssw0602, act=RELOAD) =====================
-- Agregado por placa/dia (resposta embutida em XML no HTML, sem download).
create table if not exists ssw_tracking.veiculos_situacao (
  dominio text not null,
  data_referencia date not null,
  placa text not null,
  dados jsonb not null,
  hash_dados text not null,
  atualizado_em timestamptz not null default now(),
  primary key (dominio, data_referencia, placa)
);
create index if not exists ssw_tracking_veiculos_situacao_data_idx on ssw_tracking.veiculos_situacao (data_referencia desc);

create or replace function ssw_tracking.veiculos_situacao_upsert(p_dominio text, p_data date, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ssw_tracking, public
as $$
declare
  v_total integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_novos integer := 0;
  v_atualizados integer := 0;
begin
  with entrada as (
    select distinct on (r->>'placa')
      r->>'placa' as placa,
      r->'dados' as dados,
      md5((r->'dados')::text) as hash_dados
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where coalesce(r->>'placa', '') <> ''
    order by r->>'placa'
  ),
  gravado as (
    insert into ssw_tracking.veiculos_situacao as t (dominio, data_referencia, placa, dados, hash_dados)
    select p_dominio, p_data, e.placa, e.dados, e.hash_dados from entrada e
    on conflict (dominio, data_referencia, placa) do update
      set dados = excluded.dados,
          hash_dados = excluded.hash_dados,
          atualizado_em = now()
      where t.hash_dados is distinct from excluded.hash_dados
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido)
    into v_novos, v_atualizados from gravado;

  return jsonb_build_object('linhas', v_total, 'novos', v_novos, 'atualizados', v_atualizados, 'iguais', v_total - v_novos - v_atualizados);
end;
$$;
revoke all on function ssw_tracking.veiculos_situacao_upsert(text, date, jsonb) from public, anon, authenticated;
grant execute on function ssw_tracking.veiculos_situacao_upsert(text, date, jsonb) to service_role;

alter table ssw_tracking.veiculos_situacao enable row level security;
drop policy if exists veiculos_situacao_select on ssw_tracking.veiculos_situacao;
create policy veiculos_situacao_select on ssw_tracking.veiculos_situacao for select to authenticated using (true);
drop policy if exists veiculos_situacao_service_write on ssw_tracking.veiculos_situacao;
create policy veiculos_situacao_service_write on ssw_tracking.veiculos_situacao for all to service_role using (true) with check (true);
grant select on ssw_tracking.veiculos_situacao to authenticated;
grant select, insert, update, delete on ssw_tracking.veiculos_situacao to service_role;

alter table ssw_tracking.veiculos_situacao
  add column if not exists qtd_coletas_pendente integer,
  add column if not exists qtd_coletas_coletada integer,
  add column if not exists kg_coletas_pendente numeric,
  add column if not exists kg_coletas_coletada numeric,
  add column if not exists qtd_entregas_pendente integer,
  add column if not exists qtd_entregas_com_ocorrencia integer,
  add column if not exists kg_entregas_pendente numeric,
  add column if not exists kg_entregas_com_ocorrencia numeric;

create or replace function ssw_tracking.veiculos_situacao_preenche_colunas()
returns trigger language plpgsql as $$
declare d jsonb := coalesce(new.dados, '{}'::jsonb);
begin
  new.qtd_coletas_pendente       := public.ssw_br_num(d->>'qtd_coletas_pendente')::integer;
  new.qtd_coletas_coletada       := public.ssw_br_num(d->>'qtd_coletas_coletada')::integer;
  new.kg_coletas_pendente        := public.ssw_br_num(d->>'kg_coletas_pendente');
  new.kg_coletas_coletada        := public.ssw_br_num(d->>'kg_coletas_coletada');
  new.qtd_entregas_pendente      := public.ssw_br_num(d->>'qtd_entregas_sem_ocorrencia')::integer;
  new.qtd_entregas_com_ocorrencia := public.ssw_br_num(d->>'qtd_entregas_com_ocorrencia')::integer;
  new.kg_entregas_pendente       := public.ssw_br_num(d->>'kg_entregas_sem_ocorrencia');
  new.kg_entregas_com_ocorrencia := public.ssw_br_num(d->>'kg_entregas_com_ocorrencia');
  return new;
end;
$$;
drop trigger if exists veiculos_situacao_colunas on ssw_tracking.veiculos_situacao;
create trigger veiculos_situacao_colunas
  before insert or update of dados on ssw_tracking.veiculos_situacao
  for each row execute function ssw_tracking.veiculos_situacao_preenche_colunas();

-- ===================== Painel unificado: CTRC (455 + 036 + 038) =====================
-- Junta o conhecimento (455/conhecimentos, ja com status/prazo/placa) com o romaneio (036)
-- e com a foto de pendentes (038), pela chave CTRC.
create or replace view ssw_tracking.painel_ctrcs
with (security_invoker = true) as
select
  coalesce(k.ctrc, r.ctrc, p.ctrc) as ctrc,
  k.dominio as dominio_455,
  k.remetente_nome,
  k.destinatario_nome,
  k.entrega_cidade,
  k.entrega_uf,
  k.previsao_entrega,
  k.data_entrega,
  k.status_entrega,
  k.situacao_prazo,
  k.dias_atraso as dias_atraso_455,
  k.placa_entrega,
  k.agendado,
  r.dominio as dominio_036,
  r.romaneio,
  r.situacao as romaneio_situacao,
  r.placa as romaneio_placa,
  r.motorista,
  r.cpf_motorista,
  r.ocorrencia_ctrc_codigo,
  r.ocorrencia_ctrc_descricao,
  r.ocorrencia_ctrc_data,
  p.dominio as dominio_038,
  p.atraso_dias as atraso_dias_pendente,
  p.ultima_ocorrencia as pendente_ultima_ocorrencia,
  p.ocorrencia_codigo as pendente_ocorrencia_codigo,
  p.ocorrencia_descricao as pendente_ocorrencia_descricao,
  p.localizacao as pendente_localizacao,
  p.prazo_entrega as pendente_prazo,
  (p.ctrc is not null and p.sumiu_em is null) as pendente_hoje,
  greatest(k.atualizado_em, r.atualizado_em, p.atualizado_em) as atualizado_em
from public.ssw_455_conhecimentos k
full outer join ssw_tracking.romaneios r on r.ctrc = k.ctrc
full outer join ssw_tracking.ctrc_pendentes p on p.ctrc = coalesce(k.ctrc, r.ctrc);

revoke all on ssw_tracking.painel_ctrcs from anon;
grant select on ssw_tracking.painel_ctrcs to authenticated, service_role;

-- ===================== Painel unificado: veiculos no dia mais recente =====================
create or replace view ssw_tracking.painel_veiculos
with (security_invoker = true) as
select v.*
from ssw_tracking.veiculos_situacao v
where v.data_referencia = (
  select max(v2.data_referencia) from ssw_tracking.veiculos_situacao v2 where v2.dominio = v.dominio
);

revoke all on ssw_tracking.painel_veiculos from anon;
grant select on ssw_tracking.painel_veiculos to authenticated, service_role;
