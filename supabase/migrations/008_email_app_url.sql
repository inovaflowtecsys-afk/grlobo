-- GrupoLobo | Remetente "Grupo Lobo" e endereco do sistema usado nos links dos e-mails
alter table public.configuracao_email add column if not exists app_url text;
update public.configuracao_email set smtp_nome_remetente = 'Grupo Lobo';
