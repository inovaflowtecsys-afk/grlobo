-- GrupoLobo | Alerta de coleta SSW parada
-- Roda DENTRO do Supabase (pg_cron), de proposito fora do n8n: se o n8n cair, o aviso ainda sai.
--
-- Regras:
--   * so verifica em dia de coleta (segunda a sabado, sem os feriados que o n8n pula) e dentro da janela dele:
--     segunda a sexta 06:00-20:00; sabado 06:00-15:00 (horario de Brasilia);
--   * SSW 036 (a cada 10 min): alerta com 30 min sem carga concluida com sucesso;
--   * SSW 455 (de hora em hora, minuto :07): alerta com 90 min;
--   * a contagem parte do maior entre a ultima carga OK e as 06:00 do dia (nao alerta pela madrugada);
--   * um alerta por parada: abre uma vez, envia um e-mail, e fecha (com e-mail de normalizacao) quando entra carga nova;
--   * cada alerta fica gravado em public.ssw_alertas (o log).
-- O e-mail e enviado pela Edge Function alerta-coleta (SMTP de public.configuracao_email).
-- Esta migration NAO altera GRANT/REVOKE e nao guarda segredo algum. Idempotente.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Log de alertas
-- ---------------------------------------------------------------------------
create table if not exists public.ssw_alertas (
  id bigint generated always as identity primary key,
  relatorio text not null check (relatorio in ('036', '455')),
  aberto_em timestamptz not null default now(),
  ultima_carga_ok timestamptz,
  minutos_sem_carga integer not null,
  limite_minutos integer not null,
  email_destino text not null default 'gestao@inovaflowtec.com.br',
  email_aviso_enviado_em timestamptz,
  email_aviso_tentativas integer not null default 0,
  email_aviso_erro text,
  resolvido_em timestamptz,
  minutos_parado integer,
  email_resolucao_enviado_em timestamptz,
  email_resolucao_tentativas integer not null default 0,
  email_resolucao_erro text
);
-- no maximo um alerta aberto por relatorio
create unique index if not exists ssw_alertas_aberto_idx on public.ssw_alertas (relatorio) where resolvido_em is null;
create index if not exists ssw_alertas_aberto_em_idx on public.ssw_alertas (aberto_em desc);

alter table public.ssw_alertas enable row level security;
drop policy if exists ssw_alertas_admin_select on public.ssw_alertas;
create policy ssw_alertas_admin_select on public.ssw_alertas for select to authenticated using (public.current_user_is_admin());

comment on table public.ssw_alertas is 'Log das paradas de coleta do SSW (036 e 455) e dos e-mails de alerta enviados.';

-- ---------------------------------------------------------------------------
-- Dia de coleta: domingo e os feriados que o n8n pula nao contam
-- (01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 19/12, 25/12 e Sexta-feira Santa)
-- ---------------------------------------------------------------------------
create or replace function public.ssw_dia_coleta(p_dia date)
returns boolean language plpgsql immutable as $$
declare
  y int := extract(year from p_dia)::int;
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
  mes int; dia int; sexta_santa date;
begin
  if extract(dow from p_dia) = 0 then return false; end if;
  if to_char(p_dia, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-19', '12-25') then
    return false;
  end if;
  -- Pascoa (algoritmo de Meeus/Jones/Butcher) -> Sexta-feira Santa = Pascoa - 2 dias
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451; mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  sexta_santa := make_date(y, mes, dia) - 2;
  return p_dia <> sexta_santa;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verificacao (chamada a cada 10 minutos pelo pg_cron)
-- ---------------------------------------------------------------------------
create or replace function public.ssw_verificar_coleta()
returns void language plpgsql security definer set search_path = public, ssw_tracking, extensions as $$
declare
  v_brt timestamp := now() at time zone 'America/Sao_Paulo';
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hora time := (now() at time zone 'America/Sao_Paulo')::time;
  v_fim time;
  v_em_janela boolean;
  v_inicio timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
  r record;
  v_ultima timestamptz;
  v_ref timestamptz;
  v_min integer;
  v_aberto public.ssw_alertas%rowtype;
begin
  v_fim := case when extract(dow from v_dia) = 6 then time '15:00' else time '20:00' end;
  v_em_janela := public.ssw_dia_coleta(v_dia) and v_hora >= time '06:00' and v_hora <= v_fim;

  for r in select * from (values ('036', 30), ('455', 90)) as t(relatorio, limite) loop
    if r.relatorio = '036' then
      select max(recebido_em) into v_ultima from ssw_tracking.cargas where relatorio = '036' and ok;
    else
      select max(recebido_em) into v_ultima from public.ssw_455_cargas where ok;
    end if;

    select * into v_aberto from public.ssw_alertas where relatorio = r.relatorio and resolvido_em is null;

    if found then
      -- carga nova depois da abertura: a parada acabou
      if v_ultima is not null and v_ultima >= v_aberto.aberto_em then
        update public.ssw_alertas
           set resolvido_em = now(),
               minutos_parado = floor(extract(epoch from (v_ultima - coalesce(v_aberto.ultima_carga_ok, v_aberto.aberto_em))) / 60)::int
         where id = v_aberto.id;
      end if;
    elsif v_em_janela then
      v_ref := greatest(coalesce(v_ultima, v_inicio), v_inicio);
      v_min := floor(extract(epoch from (now() - v_ref)) / 60)::int;
      if v_min >= r.limite then
        insert into public.ssw_alertas (relatorio, ultima_carga_ok, minutos_sem_carga, limite_minutos)
        values (r.relatorio, v_ultima, v_min, r.limite);
      end if;
    end if;
  end loop;

  -- e-mails pendentes (aviso e normalizacao), com no maximo 5 tentativas cada
  if exists (
    select 1 from public.ssw_alertas
     where (email_aviso_enviado_em is null and email_aviso_tentativas < 5)
        or (resolvido_em is not null and email_aviso_enviado_em is not null
            and email_resolucao_enviado_em is null and email_resolucao_tentativas < 5)
  ) then
    perform net.http_post(
      url := 'https://xggknkcipdvksfvlvtmh.supabase.co/functions/v1/alerta-coleta',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agenda: a cada 10 minutos (o pg_cron usa UTC; a funcao ja trabalha em horario de Brasilia)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ssw-verificar-coleta') then
    perform cron.unschedule('ssw-verificar-coleta');
  end if;
  perform cron.schedule('ssw-verificar-coleta', '*/10 * * * *', 'select public.ssw_verificar_coleta()');
end $$;
