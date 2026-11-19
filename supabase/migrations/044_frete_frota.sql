-- GrupoLobo | Frete entrega: cadastro de frotas (placa + tipo) e vinculo no frete.
-- Placa normalizada (maiusculas, sem hifen/espaco), unica entre os registros ativos. Tipo restrito a lista abaixo.
-- Exclusao so logica (deleted_at). Frete.frota_id e opcional para preservar os fretes existentes.
-- Permissoes: mesmas do modulo (incluir/editar/excluir). Esta migration NAO altera GRANT/REVOKE. Idempotente.

create table if not exists public.frete_frota (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  tipo text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  constraint frete_frota_tipo_ck check (tipo in ('FURGAO','TRUCK','3/4','VAN','FURGAO LEVE','OUTROS','TOCO','CAVALO','CARRETA','CAVALO TRUCADO')),
  constraint frete_frota_placa_ck check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$')
);
create unique index if not exists frete_frota_placa_idx on public.frete_frota (placa) where deleted_at is null;

alter table public.frete_entregas add column if not exists frota_id uuid references public.frete_frota(id);
create index if not exists frete_entregas_frota_idx on public.frete_entregas (frota_id);

-- O historico passa a aceitar a entidade PLACA
alter table public.frete_log drop constraint if exists frete_log_entidade_check;
alter table public.frete_log add constraint frete_log_entidade_check check (entidade in ('FRETE', 'MOTORISTA', 'PLACA'));

create or replace function public.frete_frota_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.placa := upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g'));
  new.tipo := upper(trim(coalesce(new.tipo, '')));
  if new.placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Placa inválida. Use o formato ABC1234 ou ABC1D23.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.deleted_at := null;
  else
    if auth.uid() is not null then
      if old.deleted_at is null and new.deleted_at is not null then
        if not public.current_user_pode_frete('excluir') then raise exception 'Você não tem permissão para excluir.'; end if;
      elsif not public.current_user_pode_frete('editar') then
        raise exception 'Você não tem permissão para editar.';
      end if;
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.frete_frota_depois()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_diff jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.frete_log_registrar('PLACA', new.id, 'INSERIU', jsonb_build_object('placa', new.placa, 'tipo', new.tipo));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.frete_log_registrar('PLACA', new.id, 'EXCLUIU', jsonb_build_object('placa', new.placa));
  else
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('de', o.value, 'para', n.value)), '{}'::jsonb) into v_diff
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at', 'updated_by');
    if v_diff <> '{}'::jsonb then
      perform public.frete_log_registrar('PLACA', new.id, 'EDITOU', v_diff);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists frete_frota_antes on public.frete_frota;
create trigger frete_frota_antes before insert or update on public.frete_frota
  for each row execute function public.frete_frota_antes();
drop trigger if exists frete_frota_updated_at on public.frete_frota;
create trigger frete_frota_updated_at before update on public.frete_frota
  for each row execute function public.set_updated_at();
drop trigger if exists frete_frota_depois on public.frete_frota;
create trigger frete_frota_depois after insert or update on public.frete_frota
  for each row execute function public.frete_frota_depois();

alter table public.frete_frota enable row level security;
drop policy if exists frete_frota_select on public.frete_frota;
create policy frete_frota_select on public.frete_frota for select to authenticated using (public.current_user_pode_frete());
drop policy if exists frete_frota_insert on public.frete_frota;
create policy frete_frota_insert on public.frete_frota for insert to authenticated with check (public.current_user_pode_frete('incluir'));
drop policy if exists frete_frota_update on public.frete_frota;
create policy frete_frota_update on public.frete_frota for update to authenticated
  using (public.current_user_pode_frete('editar') or public.current_user_pode_frete('excluir'))
  with check (public.current_user_pode_frete('editar') or public.current_user_pode_frete('excluir'));

comment on table public.frete_frota is 'Cadastro de frotas (placa e tipo de veiculo) do modulo Frete entrega. Exclusao logica.';

-- Carga inicial (planilha baseveiculosN.csv: so placa e tipo; duplicadas ignoradas)
insert into public.frete_frota (placa, tipo) values
  ('MIT3A44', 'FURGAO'),
  ('AWV3856', 'TRUCK'),
  ('AYF8760', '3/4'),
  ('GSI4F09', '3/4'),
  ('AOP9D19', 'VAN'),
  ('EDY1H79', 'FURGAO LEVE'),
  ('RHD9H59', 'TRUCK'),
  ('ALJ1548', '3/4'),
  ('EWQ4E08', 'VAN'),
  ('MFI0468', 'OUTROS'),
  ('MJI6J74', 'VAN'),
  ('DZJ7E81', 'VAN'),
  ('AAA1652', 'VAN'),
  ('ARB9H80', '3/4'),
  ('MFH4G58', 'TOCO'),
  ('AJD6446', '3/4'),
  ('LZY6B14', 'TOCO'),
  ('MKL1A33', 'VAN'),
  ('CPI6G26', 'TRUCK'),
  ('AFH2J69', '3/4'),
  ('ADV0B99', '3/4'),
  ('ALL7G94', 'TRUCK'),
  ('DBL9E16', 'CAVALO'),
  ('ADW0F08', 'VAN'),
  ('AKO3D86', 'CARRETA'),
  ('AVQ1B79', '3/4'),
  ('AKI8035', 'VAN'),
  ('AWZ3G52', '3/4'),
  ('AQI3965', '3/4'),
  ('ADX2455', '3/4'),
  ('NNU4I68', 'VAN'),
  ('AUA8D11', 'FURGAO LEVE'),
  ('MLV8I98', '3/4'),
  ('AYJ9317', '3/4'),
  ('EJZ5239', 'TRUCK'),
  ('EJV9G18', 'TRUCK'),
  ('AQP8A19', '3/4'),
  ('AVA7C00', 'CARRETA'),
  ('MIL5E91', 'CAVALO'),
  ('AVW1213', 'TRUCK'),
  ('OYH0A62', 'CAVALO'),
  ('MAV7B53', '3/4'),
  ('AVJ2D64', 'TRUCK'),
  ('DPB1F60', 'CAVALO'),
  ('CON4J00', 'CARRETA'),
  ('HTS1G38', 'CARRETA'),
  ('CNI5C24', 'CAVALO'),
  ('AXU3H73', 'OUTROS'),
  ('UAT9C13', 'CAVALO'),
  ('SDP1I85', 'CARRETA'),
  ('NJY1820', 'CAVALO'),
  ('AOA8H47', 'CARRETA'),
  ('AUS7F19', 'CAVALO'),
  ('TBL2F53', 'CAVALO'),
  ('TBL2F54', 'CARRETA'),
  ('RHV0I38', 'CAVALO TRUCADO'),
  ('SFH1H50', 'CARRETA'),
  ('EGJ4945', 'TRUCK'),
  ('IVU4J24', 'TRUCK'),
  ('EJY4H54', 'CAVALO'),
  ('BAN4706', 'TRUCK'),
  ('LZW5G13', 'CARRETA'),
  ('AGH9C00', '3/4'),
  ('AYK3E14', '3/4'),
  ('LYF5I91', 'CAVALO'),
  ('MIJ6379', 'TRUCK'),
  ('EJZ5248', 'TRUCK'),
  ('ATT9917', 'CARRETA'),
  ('DZW9681', 'TRUCK'),
  ('BAM9F33', 'CAVALO'),
  ('AZU1C62', 'CARRETA'),
  ('FJE6I81', 'VAN'),
  ('RYB7C84', 'CAVALO'),
  ('RYC7B20', 'CAVALO'),
  ('INF4543', 'CARRETA'),
  ('KNG4993', 'CAVALO'),
  ('AZP2D07', 'TRUCK'),
  ('LZM7615', 'TRUCK'),
  ('JAM5C42', 'CAVALO'),
  ('OLL7G77', 'CARRETA'),
  ('ASP8920', 'CARRETA'),
  ('RHS6H55', 'CARRETA'),
  ('RHS6H53', 'CAVALO TRUCADO'),
  ('MBI6E56', 'TRUCK'),
  ('AGT0E52', '3/4'),
  ('SXK2A68', 'CARRETA'),
  ('RHM0F00', 'CAVALO'),
  ('RHN0F00', 'CARRETA'),
  ('DVS0J16', 'CAVALO'),
  ('CVB3B75', 'CARRETA'),
  ('RHW6I31', 'CAVALO'),
  ('TPY8E08', 'CAVALO'),
  ('RHP9G83', 'CARRETA'),
  ('EOE2F17', 'CAVALO'),
  ('AXF6H66', '3/4'),
  ('AXY2428', 'TRUCK'),
  ('MEX2030', 'TRUCK'),
  ('RHL8H37', 'CARRETA'),
  ('FDB5H35', 'CARRETA'),
  ('SES9J61', 'CAVALO TRUCADO'),
  ('RHX4D08', 'TRUCK'),
  ('IWM5F32', 'TRUCK'),
  ('SWE6E42', 'TRUCK'),
  ('IVG5H10', 'TRUCK'),
  ('AHU0B27', 'CAVALO'),
  ('AEH2673', 'TRUCK'),
  ('SFO3D29', 'CAVALO TRUCADO'),
  ('RHV0H73', 'CARRETA'),
  ('UMG7C74', 'TRUCK'),
  ('MHS9034', 'CARRETA'),
  ('APA3I43', 'TOCO'),
  ('SXD6F97', 'CAVALO'),
  ('SXD4F56', 'CARRETA'),
  ('MLG6049', 'CAVALO'),
  ('TPR0A03', 'CAVALO'),
  ('ODA9H32', 'CAVALO'),
  ('AYZ1330', 'CARRETA'),
  ('AYW1330', 'CAVALO'),
  ('QJD8F35', 'CARRETA'),
  ('BEP2F46', 'CAVALO TRUCADO'),
  ('TPR0A04', 'CARRETA'),
  ('BEP2F47', 'CARRETA'),
  ('QJI8E05', 'CARRETA'),
  ('JBH2F38', 'CAVALO'),
  ('SXY1A48', 'CARRETA'),
  ('UBU0E61', 'CAVALO'),
  ('QJK5A67', 'CAVALO'),
  ('MMH3B22', 'CARRETA'),
  ('RLI1G26', 'CAVALO'),
  ('RLF9C42', 'TRUCK'),
  ('KIP4C21', 'CARRETA'),
  ('IVT7D11', 'CAVALO TRUCADO'),
  ('RDX5I13', 'CAVALO'),
  ('RXM6A70', 'CARRETA'),
  ('AWO1E58', 'TRUCK'),
  ('MBB5H63', 'CARRETA'),
  ('EVO3A52', 'CAVALO'),
  ('MKC9C67', 'CARRETA'),
  ('FWF7A64', 'CAVALO'),
  ('AFK7E03', 'TRUCK'),
  ('ANE3354', 'VAN'),
  ('QHW3F88', 'TRUCK'),
  ('MLH3B98', 'TRUCK'),
  ('APH1J16', 'CAVALO'),
  ('CZZ0435', 'CARRETA'),
  ('UBP3F26', 'CARRETA'),
  ('AKK2117', 'CARRETA'),
  ('UBG6H26', 'CAVALO'),
  ('BCQ7A16', 'CAVALO'),
  ('QJI2H29', 'CARRETA'),
  ('RLD6C65', 'CARRETA'),
  ('AQL2138', 'FURGAO LEVE'),
  ('RXP3H28', 'CAVALO'),
  ('RAG4E53', 'CARRETA'),
  ('MDI8B55', 'CARRETA'),
  ('FLV0F87', 'FURGAO LEVE'),
  ('SXS3C69', 'CARRETA'),
  ('APW3D95', 'FURGAO LEVE'),
  ('SXS4G79', 'CAVALO'),
  ('CYB3B75', 'CARRETA'),
  ('SXE1G65', 'CARRETA'),
  ('RYX6D76', 'CAVALO'),
  ('MQQ7B76', 'CAVALO'),
  ('DPE7D34', 'TRUCK'),
  ('AZO8287', 'CARRETA'),
  ('AVB5B56', 'CARRETA'),
  ('BEO4H94', 'CAVALO TRUCADO'),
  ('RDT5C98', 'CAVALO'),
  ('SXP3F96', 'CARRETA'),
  ('TOL2F80', 'TRUCK'),
  ('RYQ8C12', 'CAVALO'),
  ('SXE0J95', 'CARRETA'),
  ('TBM3A40', 'CARRETA'),
  ('FIS8I32', 'FURGAO LEVE'),
  ('TBM3A60', 'CAVALO TRUCADO'),
  ('BTS4G56', 'CARRETA'),
  ('QEG6D73', 'CAVALO TRUCADO'),
  ('EFO2I84', 'TOCO'),
  ('NPQ3H55', 'TRUCK'),
  ('NDC3H98', '3/4'),
  ('TPJ0I23', 'CARRETA'),
  ('IZI5B60', 'CAVALO'),
  ('TQA8F62', 'CAVALO'),
  ('SXY1F33', 'CARRETA'),
  ('QHD9H65', 'CARRETA'),
  ('QHD9685', 'CARRETA'),
  ('RLA7B96', 'CAVALO'),
  ('TQD4A22', 'CARRETA'),
  ('TQB2A82', 'CAVALO')
on conflict do nothing;
