-- GrupoLobo | Tabela unica por CTRC para o front-end (rapida, com indices), mantida por gatilhos.
-- Cada fonte atualiza so as SUAS colunas no SEU ritmo: 455 (hora em hora) e 036 (10 min). Quando uma carga muda linhas,
-- somente os CTRCs afetados sao remontados (operacao em lote, uma por carga). Sem jsonb pesado.
-- Mesmas colunas e regras de public.v_ctrc_unificado (015), que continua como referencia/conferencia.

create table if not exists public.ctrc_painel as
select * from public.v_ctrc_unificado with no data;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ctrc_painel'::regclass and contype = 'p') then
    alter table public.ctrc_painel add primary key (dominio, ctrc);
  end if;
end $$;
create index if not exists ctrc_painel_status_idx on public.ctrc_painel (dominio, status_entrega, previsao_final);
create index if not exists ctrc_painel_romaneio_idx on public.ctrc_painel (dominio, rom_romaneio) where rom_romaneio is not null;
create index if not exists ctrc_painel_placa_idx on public.ctrc_painel (dominio, rom_placa) where rom_placa is not null;
create index if not exists ctrc_painel_atualizado_idx on public.ctrc_painel (atualizado_em desc);

alter table public.ctrc_painel enable row level security;
drop policy if exists ctrc_painel_leitura on public.ctrc_painel;
create policy ctrc_painel_leitura on public.ctrc_painel for select to authenticated using (true);

-- Monta as linhas da tabela para os CTRCs informados (null = todos). Mesma logica da view v_ctrc_unificado.
create or replace function public.ctrc_painel_montar(p_dominios text[], p_ctrcs text[])
returns setof public.ctrc_painel
language sql stable
set search_path = public, ssw_tracking
as $$
  with chaves as (select * from unnest(p_dominios, p_ctrcs) as c(dominio, ctrc)),
  k as (
    select x.* from public.ssw_455_ctrcs x
    where p_ctrcs is null or exists (select 1 from chaves c where c.dominio = x.dominio and c.ctrc = x.ctrc)
  ),
  r as (
    select x.* from ssw_tracking.romaneios x
    where p_ctrcs is null or exists (select 1 from chaves c where c.dominio = x.dominio and c.ctrc = x.ctrc)
  )
  select
    coalesce(k.dominio, r.dominio), coalesce(k.ctrc, r.ctrc),
    k.chave_cte, k.tipo_documento, k.cte, k.data_autorizacao,
    k.remetente_nome, k.remetente_cnpj, k.remetente_uf,
    k.pagador_nome, k.pagador_cnpj,
    k.destinatario_nome, k.destinatario_cnpj, k.destinatario_cidade, k.destinatario_uf,
    k.entrega_cidade, k.entrega_uf, k.entrega_cep,
    k.numero_nf, k.chaves_nfe, k.mercadoria, k.especie, k.volumes,
    k.peso_real_kg, k.peso_calculado_kg, k.cubagem_m3, k.valor_mercadoria, k.valor_frete, k.valor_icms, k.valor_iss,
    k.previsao_entrega, k.entrega_programada, k.data_entrega,
    k.localizacao_atual, k.data_ultima_ocorrencia, k.dados ->> 'codigo_da_ultima_ocorrencia',
    k.primeiro_manifesto, k.data_primeiro_manifesto, k.ultimo_manifesto, k.data_ultimo_manifesto,
    k.placa_coleta, k.placa_cavalo, k.placa_carreta, k.placa_entrega,
    k.data_cancelamento, k.motivo_cancelamento,
    k.praca_expedidora, k.unidade_origem, k.unidade_destino, k.rota, k.setor_destino, k.praca_destino,
    k.tipo_conhecimento, k.qtd_notas,
    k.atualizado_em,
    r.romaneio, r.data_emissao, r.situacao,
    r.placa, r.placa_carreta, r.motorista, r.cpf_motorista,
    r.entrega_endereco, r.entrega_bairro, r.conferente,
    r.ocorrencia_rom_codigo, r.ocorrencia_rom_descricao, r.ocorrencia_rom_data,
    r.ocorrencia_ctrc_codigo, r.ocorrencia_ctrc_descricao, r.ocorrencia_ctrc_data,
    r.prev_entrega,
    r.atualizado_em,
    (r.ctrc is not null),
    case
      when coalesce(k.data_cancelamento is not null, false) or r.situacao = 'CANCELADO' then 'CANCELADA'
      when k.data_entrega is not null or r.ocorrencia_ctrc_codigo = '1' or r.ocorrencia_rom_codigo = '1' then 'REALIZADA'
      when r.ocorrencia_rom_codigo in ('5','11','13','38','52') or r.ocorrencia_ctrc_codigo in ('5','11','13','38','52') then 'INSUCESSO'
      else 'PENDENTE'
    end,
    coalesce(k.data_entrega,
             case when r.ocorrencia_rom_codigo = '1' then r.ocorrencia_rom_data
                  when r.ocorrencia_ctrc_codigo = '1' then r.ocorrencia_ctrc_data end),
    coalesce(k.previsao_entrega, r.prev_entrega),
    case r.ocorrencia_ctrc_codigo when '15' then 'AGENDADA' when '35' then 'AGUARDANDO_AGENDAMENTO' end,
    greatest(k.atualizado_em, r.atualizado_em)
  from k full outer join r on r.dominio = k.dominio and r.ctrc = k.ctrc;
$$;

-- Remonta os CTRCs afetados por uma carga (chamada pelos gatilhos). SECURITY DEFINER: roda como dono, independente de RLS.
create or replace function public.ctrc_painel_sincronizar(p_dominios text[], p_ctrcs text[])
returns void
language plpgsql security definer
set search_path = public, ssw_tracking
as $$
begin
  if p_ctrcs is null or cardinality(p_ctrcs) = 0 then return; end if;
  delete from public.ctrc_painel p
  using unnest(p_dominios, p_ctrcs) as c(dominio, ctrc)
  where p.dominio = c.dominio and p.ctrc = c.ctrc;
  insert into public.ctrc_painel select * from public.ctrc_painel_montar(p_dominios, p_ctrcs);
end;
$$;
revoke all on function public.ctrc_painel_sincronizar(text[], text[]) from public, anon, authenticated;
revoke all on function public.ctrc_painel_montar(text[], text[]) from public, anon, authenticated;

-- Gatilhos por instrucao (uma execucao por carga), separados para INSERT e UPDATE por causa das tabelas de transicao.
create or replace function public.ctrc_painel_trg() returns trigger
language plpgsql security definer set search_path = public, ssw_tracking as $$
declare d text[]; c text[];
begin
  select array_agg(dominio), array_agg(ctrc) into d, c from novos;
  perform public.ctrc_painel_sincronizar(d, c);
  return null;
end;
$$;
revoke all on function public.ctrc_painel_trg() from public, anon, authenticated;

drop trigger if exists ctrc_painel_455_ins on public.ssw_455_ctrcs;
drop trigger if exists ctrc_painel_455_upd on public.ssw_455_ctrcs;
drop trigger if exists ctrc_painel_036_ins on ssw_tracking.romaneios;
drop trigger if exists ctrc_painel_036_upd on ssw_tracking.romaneios;
create trigger ctrc_painel_455_ins after insert on public.ssw_455_ctrcs referencing new table as novos for each statement execute function public.ctrc_painel_trg();
create trigger ctrc_painel_455_upd after update on public.ssw_455_ctrcs referencing new table as novos for each statement execute function public.ctrc_painel_trg();
create trigger ctrc_painel_036_ins after insert on ssw_tracking.romaneios referencing new table as novos for each statement execute function public.ctrc_painel_trg();
create trigger ctrc_painel_036_upd after update on ssw_tracking.romaneios referencing new table as novos for each statement execute function public.ctrc_painel_trg();

-- Carga inicial.
truncate public.ctrc_painel;
insert into public.ctrc_painel select * from public.ctrc_painel_montar(null, null);
