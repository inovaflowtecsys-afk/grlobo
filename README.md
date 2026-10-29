# GrupoLobo — Extração SSW 455 → Supabase

Processo **separado** da Macklog (serviço, workflow, credenciais e banco próprios), feito a partir do mesmo modelo.

Leva o relatório **455 — Fretes Expedidos/Recebidos (CTRCs)** do SSW para a tabela `public.ssw_455_ctrcs` do Supabase do
Grupo Lobo, 3 vezes ao dia, sem duplicar e atualizando o que mudou (manifesto, MDF-e, entrega...).

```
n8n "GrupoLobo - SSW 455 -> Supabase"  (08h, 14h, 19h America/Sao_Paulo)
  -> POST grupolobo-ssw-bot /gerar-455?dias=30&arq=E&compl=ABF   (EasyPanel, HTTP puro, sem navegador)
  -> If statusCode = 200
  -> POST Edge Function sync-ssw-455?dominio=grupolobo&sequencia=<x-sequencia>
  -> RPC ssw_455_upsert (merge jsonb) -> ssw_455_ctrcs + log em ssw_455_cargas
```

## Versão 1.2.4 — 27/10/2026

- Atualização da versão da aplicação web para 1.2.4.

## Versão 1.2.3 — 22/10/2026

- Unificação dos dados do Dashboard e da tela Entregas usando `ctrc_painel`.
- DPE com regras de agendamento, complementares, substituições e ocorrências 93, 94 e 99.
- Dashboard de atrasados alinhado à view operacional `v_atrasados`.
- Filtro por NF, coluna NF e dados de romaneio nas entregas agendadas.

## Estrutura

| Caminho | Para quê |
|---|---|
| `ssw-bot/server-http.mjs` | Robô do SSW (login, pede a 455, espera a fila 156, baixa o arquivo). Também tem `/relatorio?rel=` (435, 441, 411) para o financeiro depois |
| `ssw-bot/gerar-dockerfile.mjs` | Gera `Dockerfile.inline` para colar no EasyPanel (`npm run dockerfile`) |
| `ssw-bot/Dockerfile.inline` | Já gerado — colar em EasyPanel > Source > Dockerfile |
| `ssw-bot/rodar-local-http.mjs` | Roda o bot no PC (porta 3101) lendo `.env` |
| `supabase/migrations/001_ssw_455.sql` | Tabelas, upsert com merge, RLS, colunas tipadas e gatilho |
| `supabase/functions/sync-ssw-455/index.ts` | Edge Function que recebe o arquivo e chama o upsert |
| `n8n/grupolobo-ssw-455.json` | Workflow para importar no n8n |

## Implantação (checklist)

### 1. SSW — usuário do Grupo Lobo
- [ ] Domínio, CPF, usuário e senha de um usuário do SSW do Grupo Lobo com acesso à opção 455.
- [ ] Nesse usuário, configurar as colunas do Excel da 455 (tela `455` > Configuração Excel), igual ao usuário da Macklog.
      As colunas do arquivo dependem dessa configuração; a Edge Function só exige `Série/Número CTRC` ou a chave do CT-e.

### 2. Supabase (projeto do Grupo Lobo)
- [x] SQL Editor: `001_ssw_455.sql` aplicado em 19/10/2026 (projeto `xggknkcipdvksfvlvtmh`, São Paulo).
- [ ] Deploy da função: `supabase functions deploy sync-ssw-455 --project-ref <REF>`.
- [ ] Segredos da função (opcional): `SSW_SYNC_SECRET`, `SSW_DOMINIO_PADRAO=grupolobo`. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm do projeto.

### 3. EasyPanel — serviço novo `grupolobo-ssw-bot` (projeto `inovaflowtec`)
- [ ] App > Source > Dockerfile: colar o conteúdo de `ssw-bot/Dockerfile.inline` (conferir a contagem de caracteres).
- [ ] Environment: `SSW_DOMINIO`, `SSW_CPF`, `SSW_USUARIO`, `SSW_SENHA`, `BOT_TOKEN` (token novo, não reutilizar o da Macklog).
      Usar a mesma porta/configuração de rede do `ssw-455-bot` da Macklog (no workflow a URL interna vai sem porta).
- [ ] Limite de memória 256 MB. Deploy e testar `GET /saude` → `ok`.

### 4. n8n
- [ ] Importar `n8n/grupolobo-ssw-455.json`.
- [ ] Credencial Header Auth **GrupoLobo - Bot SSW**: nome `x-bot-token`, valor = `BOT_TOKEN` do passo 3.
- [ ] Credencial Supabase API **GrupoLobo - Supabase**: URL e service role key do projeto do Grupo Lobo.
- [x] URL da função no nó "Enviar para Supabase" já aponta para `xggknkcipdvksfvlvtmh`.
- [ ] Conferir em Settings que o fuso é `America/Sao_Paulo`. Executar manualmente e depois ativar.

### 5. Teste
```sql
select * from ssw_455_cargas order by recebido_em desc limit 3;
select ctrc, data_autorizacao, pagador_nome, entrega_cidade, valor_frete, data_entrega
from ssw_455_ctrcs order by atualizado_em desc limit 20;
```

## Faturamento (SSW 441, 411 e 435)

Mesmo modelo da Macklog, ligado aos CTRCs da 455. Tela: **Faturamento** (visão geral com faturamento diário por data de emissão,
faturamento do dia por cliente, CT-es a faturar / faturados / vencidos / liquidados; abas Faturas e Conhecimentos).

```
n8n "GrupoLobo - SSW financeiro -> Supabase"  (06h20, 12h20, 15h20, 17h20, 19h20)
  -> POST grupolobo-ssw-bot /relatorio?rel=a-faturar|fat-emissao|fat-pendentes|fat-liquidadas|liquidados   (um por vez)
  -> POST Edge Function sync-ssw-financeiro?tipo=faturas|liquidados|a_faturar&dominio=grupolobo
  -> RPC ssw_fin_upsert -> ssw_faturas, ssw_fatura_ctrcs, ssw_ctrcs_liquidados, ssw_ctrcs_a_faturar + log em ssw_fin_cargas
```

| Caminho | Para quê |
|---|---|
| `supabase/migrations/019_ssw_financeiro.sql` | Tabelas, upsert, gatilhos, RLS, visões `ssw_ctrc_financeiro`, `ssw_ultimas_atualizacoes`, `v_faturamento_diario`, `v_faturamento_dia_cliente`, `v_faturamento_situacao_mensal` |
| `supabase/functions/sync-ssw-financeiro/index.ts` | Recebe o arquivo cru do SSW e chama o upsert |
| `n8n/grupolobo-ssw-financeiro.json` | Workflow (credenciais **GrupoLobo - Bot SSW** e **GrupoLobo - Supabase**, as mesmas da 455) |
| `web/src/pages/FaturamentoPage.tsx` | Tela (serviço em `services/faturamento.ts`) |

### Checklist
- [ ] SSW: o usuário do Grupo Lobo precisa de acesso às opções **441, 411 e 435** (e a coluna "Excel" configurada como no usuário da Macklog). Os relatórios rodam na unidade `SSW_UNIDADE` (padrão `MTZ`) do serviço `grupolobo-ssw-bot`.
- [ ] Supabase: rodar `019_ssw_financeiro.sql` no SQL Editor e `supabase functions deploy sync-ssw-financeiro --project-ref xggknkcipdvksfvlvtmh`.
- [ ] n8n: importar `n8n/grupolobo-ssw-financeiro.json`, executar manualmente uma vez e ativar.
- [ ] Carga inicial: o 441 de pendentes cobre até 364 dias; emitidas, liquidadas e o 411 cobrem 31 dias por execução. Para histórico maior, repetir o `rel` com `&dias=` menor/maior dentro desses limites.

### Ainda não coberto
- **CT-e não emitido**: não há fonte hoje (a 455 só traz CT-e já emitido). "A faturar" = CT-e emitido ainda sem fatura (relatório 435).
- **Frete pago ao motorista por carregamento** (receita x despesa por motorista): vem de manifesto/romaneio, não do financeiro; a definir com as planilhas enviadas.

## Teste local do bot (PC)
```bash
cd ssw-bot
cp .env.example .env   # preencher as credenciais do SSW
npm run local          # sobe em http://localhost:3101
curl -X POST "http://localhost:3101/gerar-455?dias=3" -H "x-bot-token: local" -o 455.txt -D -
```

## Armadilhas (herdadas do modelo Macklog)
- SSW usa nbsp nos textos e às vezes Windows-1252: a função já trata.
- O bot atende uma execução por vez (429 se ocupado): não agendar outro relatório no mesmo minuto.
- Upsert faz merge (`dados = dados || novo`): nunca apaga campo de carga anterior.
- Não rodar versão Playwright/Chromium na VPS (derruba o n8n).
