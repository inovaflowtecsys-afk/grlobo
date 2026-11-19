-- GrupoLobo | Frete entrega: valores adicionais solicitados pelo cliente.
-- Campos opcionais para preservar o cadastro dos registros existentes.

alter table public.frete_entregas
  add column if not exists valor_frete_carga numeric(12,2) not null default 0,
  add column if not exists valor_coleta numeric(12,2) not null default 0;

alter table public.frete_entregas
  drop constraint if exists frete_entregas_valores_adicionais_ck;

alter table public.frete_entregas
  add constraint frete_entregas_valores_adicionais_ck check (
    valor_frete_carga >= 0 and valor_coleta >= 0
  );
