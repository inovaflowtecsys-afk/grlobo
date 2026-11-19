-- GrupoLobo | Importacao AUTOMATICA de relatorios SSW (extensao do navegador): configuracao e origem do log.
-- A extensao envia cada relatorio para a funcao importar-ssw-auto, que reconhece o tipo (mesmas regras da importacao manual) e grava
-- pelas MESMAS funcoes do robo (sync-ssw-036 / sync-ssw-455 / sync-ssw-financeiro). Esta tabela e o botao de desligar tudo.

alter table public.ssw_importacoes
  add column if not exists origem text not null default 'manual';
alter table public.ssw_importacoes drop constraint if exists ssw_importacoes_origem_check;
alter table public.ssw_importacoes
  add constraint ssw_importacoes_origem_check check (origem in ('manual', 'automatica'));
create index if not exists ssw_importacoes_origem_idx on public.ssw_importacoes (origem, criado_em desc);

create table if not exists public.ssw_importacao_config (
  id               boolean primary key default true check (id),   -- uma unica linha
  ativo            boolean not null default false,                 -- botao de desligar: false = a extensao para na hora
  tipos_permitidos text[] not null default array['036', '455', '441', '411', '435'],
  limite_por_hora  integer not null default 60 check (limite_por_hora between 1 and 1000),  -- trava contra repeticao descontrolada
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references auth.users(id) on delete set null
);

insert into public.ssw_importacao_config (id) values (true) on conflict (id) do nothing;

alter table public.ssw_importacao_config enable row level security;

drop policy if exists ssw_importacao_config_select_admin on public.ssw_importacao_config;
create policy ssw_importacao_config_select_admin on public.ssw_importacao_config for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.deleted_at is null
      and (coalesce(p.administrador, false) or p.tipo_usuario = 'ADMINISTRADOR')
  ));

drop policy if exists ssw_importacao_config_update_admin on public.ssw_importacao_config;
create policy ssw_importacao_config_update_admin on public.ssw_importacao_config for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.deleted_at is null
      and (coalesce(p.administrador, false) or p.tipo_usuario = 'ADMINISTRADOR')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.deleted_at is null
      and (coalesce(p.administrador, false) or p.tipo_usuario = 'ADMINISTRADOR')
  ));

drop policy if exists ssw_importacao_config_service on public.ssw_importacao_config;
create policy ssw_importacao_config_service on public.ssw_importacao_config for all to service_role using (true) with check (true);

revoke all on public.ssw_importacao_config from anon;
grant select on public.ssw_importacao_config to authenticated;
grant update (ativo, tipos_permitidos, limite_por_hora, atualizado_em, atualizado_por) on public.ssw_importacao_config to authenticated;
grant select, insert, update, delete on public.ssw_importacao_config to service_role;

comment on table public.ssw_importacao_config is 'Configuracao da importacao automatica de relatorios SSW (liga/desliga e tipos permitidos).';
