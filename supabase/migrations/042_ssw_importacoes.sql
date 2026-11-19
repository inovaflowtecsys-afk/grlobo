-- GrupoLobo | Importacao manual de relatorios SSW: log de validacoes e importacoes.
-- A gravacao dos dados continua nas funcoes sync-ssw-036 / sync-ssw-455 / sync-ssw-financeiro (as mesmas do modo automatico);
-- esta tabela so registra quem enviou cada arquivo, o que o sistema reconheceu, o que foi autorizado e o resultado.
-- Estados: validado | recusado -> (autorizacao do usuario) -> importado | erro.

create table if not exists public.ssw_importacoes (
  id              uuid primary key default gen_random_uuid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  usuario_id      uuid references auth.users(id) on delete set null,
  usuario_nome    text,
  nome_arquivo    text not null,
  tamanho_bytes   integer,
  hash_sha256     text not null,
  tipo            text not null default 'desconhecido',   -- 036 | 455 | 441 | 411 | 435 | desconhecido | ambiguo
  tipo_informado  text,                                    -- tipo escolhido pelo usuario ao corrigir o reconhecimento
  status          text not null default 'validado' check (status in ('validado', 'recusado', 'importado', 'erro')),
  motivo          text,
  referencia      text,                                    -- 036: periodo (ex.: 171026-201026)
  sequencia       text,                                    -- 455 / financeiro: sequencia da fila do SSW
  linhas          integer,
  novos           integer,
  atualizados     integer,
  iguais          integer,
  cabecalho       jsonb,
  avisos          jsonb not null default '[]'::jsonb,
  autorizado_em   timestamptz,
  autorizado_por  uuid references auth.users(id) on delete set null,
  importado_em    timestamptz
);

create index if not exists ssw_importacoes_criado_idx on public.ssw_importacoes (criado_em desc);
create index if not exists ssw_importacoes_hash_idx on public.ssw_importacoes (hash_sha256);
create index if not exists ssw_importacoes_status_idx on public.ssw_importacoes (status);

alter table public.ssw_importacoes enable row level security;

-- Leitura so para administradores ativos; escrita so pela funcao importar-ssw (service role).
drop policy if exists ssw_importacoes_select_admin on public.ssw_importacoes;
create policy ssw_importacoes_select_admin on public.ssw_importacoes for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo
      and p.deleted_at is null
      and (coalesce(p.administrador, false) or p.tipo_usuario = 'ADMINISTRADOR')
  ));

drop policy if exists ssw_importacoes_service_write on public.ssw_importacoes;
create policy ssw_importacoes_service_write on public.ssw_importacoes for all to service_role using (true) with check (true);

revoke all on public.ssw_importacoes from anon;
grant select on public.ssw_importacoes to authenticated;
grant select, insert, update, delete on public.ssw_importacoes to service_role;

comment on table public.ssw_importacoes is 'Log da importacao manual de relatorios SSW (validacao, autorizacao e resultado por arquivo).';
