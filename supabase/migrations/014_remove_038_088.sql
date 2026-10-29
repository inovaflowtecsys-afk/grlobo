-- Descontinua as cargas 038 e 088 (redundantes com 036/455). Backup das 22 linhas do 088 em backup/veiculos_situacao_088_20261021.json.
drop view if exists ssw_tracking.painel_ctrcs;
drop view if exists ssw_tracking.painel_veiculos;
drop function if exists ssw_tracking.ctrc_pendentes_upsert(text, text, jsonb);
drop function if exists ssw_tracking.veiculos_situacao_upsert(text, date, jsonb);
drop table if exists ssw_tracking.ctrc_pendentes;
drop table if exists ssw_tracking.veiculos_situacao;
drop function if exists ssw_tracking.ctrc_pendentes_preenche_colunas();
drop function if exists ssw_tracking.veiculos_situacao_preenche_colunas();
