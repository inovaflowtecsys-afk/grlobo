-- GrupoLobo | Visao unica por CTRC: 455 (historico/rede, carga de hora em hora) + 036 (romaneio/operacao, carga a cada 10 min).
-- E uma VIEW de proposito: nao copia dados (sem armazenamento duplicado nem egress extra) e cada coluna reflete a ultima carga da sua propria fonte.
-- Colunas do 036 levam o prefixo rom_. Nao expoe o jsonb "dados" (pesado); leia so as colunas necessarias e pagine.
create or replace view public.v_ctrc_unificado with (security_invoker = true) as
select
  coalesce(k.dominio, r.dominio) as dominio,
  coalesce(k.ctrc, r.ctrc) as ctrc,

  -- ===== 455 (atualiza de hora em hora) =====
  k.chave_cte, k.tipo_documento, k.cte, k.data_autorizacao,
  k.remetente_nome, k.remetente_cnpj, k.remetente_uf,
  k.pagador_nome, k.pagador_cnpj,
  k.destinatario_nome, k.destinatario_cnpj, k.destinatario_cidade, k.destinatario_uf,
  k.entrega_cidade, k.entrega_uf, k.entrega_cep,
  k.numero_nf, k.chaves_nfe, k.mercadoria, k.especie, k.volumes,
  k.peso_real_kg, k.peso_calculado_kg, k.cubagem_m3, k.valor_mercadoria, k.valor_frete, k.valor_icms, k.valor_iss,
  k.previsao_entrega, k.entrega_programada, k.data_entrega,
  k.localizacao_atual, k.data_ultima_ocorrencia, k.dados ->> 'codigo_da_ultima_ocorrencia' as ultima_ocorrencia_codigo,
  k.primeiro_manifesto, k.data_primeiro_manifesto, k.ultimo_manifesto, k.data_ultimo_manifesto,
  k.placa_coleta, k.placa_cavalo, k.placa_carreta, k.placa_entrega,
  k.data_cancelamento, k.motivo_cancelamento,
  k.praca_expedidora, k.unidade_origem, k.unidade_destino, k.rota, k.setor_destino, k.praca_destino,
  k.tipo_conhecimento, k.qtd_notas,
  k.atualizado_em as atualizado_455_em,

  -- ===== 036 (atualiza a cada 10 min; so existe para CTRC em romaneio) =====
  r.romaneio as rom_romaneio, r.data_emissao as rom_data_emissao, r.situacao as rom_situacao,
  r.placa as rom_placa, r.placa_carreta as rom_placa_carreta, r.motorista as rom_motorista, r.cpf_motorista as rom_cpf_motorista,
  r.entrega_endereco as rom_entrega_endereco, r.entrega_bairro as rom_entrega_bairro, r.conferente as rom_conferente,
  r.ocorrencia_rom_codigo as rom_ocorrencia_codigo, r.ocorrencia_rom_descricao as rom_ocorrencia_descricao, r.ocorrencia_rom_data as rom_ocorrencia_data,
  r.ocorrencia_ctrc_codigo as rom_ocorrencia_ctrc_codigo, r.ocorrencia_ctrc_descricao as rom_ocorrencia_ctrc_descricao, r.ocorrencia_ctrc_data as rom_ocorrencia_ctrc_data,
  r.prev_entrega as rom_prev_entrega,
  r.atualizado_em as atualizado_036_em,

  -- ===== Derivados (regra acordada: so datas) =====
  (r.ctrc is not null) as em_romaneio,
  case
    when coalesce(k.data_cancelamento is not null, false) or r.situacao = 'CANCELADO' then 'CANCELADA'
    when k.data_entrega is not null or r.ocorrencia_ctrc_codigo = '1' or r.ocorrencia_rom_codigo = '1' then 'REALIZADA'
    when r.ocorrencia_rom_codigo in ('5','11','13','38','52') or r.ocorrencia_ctrc_codigo in ('5','11','13','38','52') then 'INSUCESSO'
    else 'PENDENTE'
  end as status_entrega,
  coalesce(k.data_entrega,
           case when r.ocorrencia_rom_codigo = '1' then r.ocorrencia_rom_data
                when r.ocorrencia_ctrc_codigo = '1' then r.ocorrencia_ctrc_data end) as data_entrega_final,
  coalesce(k.previsao_entrega, r.prev_entrega) as previsao_final,
  case r.ocorrencia_ctrc_codigo when '15' then 'AGENDADA' when '35' then 'AGUARDANDO_AGENDAMENTO' end as agendamento,
  greatest(k.atualizado_em, r.atualizado_em) as atualizado_em
from public.ssw_455_ctrcs k
full outer join ssw_tracking.romaneios r on r.dominio = k.dominio and r.ctrc = k.ctrc;

-- Leitura pelo painel (rodar uma vez, por quem administra o banco):
-- grant select on public.v_ctrc_unificado to authenticated;
