# Plano revisado: módulo de importação manual de relatórios SSW

Estado: **plano, nada implementado.** Revisado em 16/11/2026 contra o código do repositório.
Motivo de existir: contingência para quando o bot não consegue baixar os relatórios (em 15/11/2026 o SSW passou a recusar com 403 os IPs dos servidores), e ferramenta de reprocessamento.

## 0. Destino e princípio (definido pelo dono em 16/11/2026)

- **Projeto Supabase de destino:** GrupoLobo, ref `xggknkcipdvksfvlvtmh` (https://supabase.com/dashboard/project/xggknkcipdvksfvlvtmh). Conferido em 16/11/2026: estão implantadas as funções `sync-ssw-036`, `sync-ssw-455` e `sync-ssw-financeiro` (e não existem `sync-ssw-038`/`088`).
- **Princípio: o modo manual usa exatamente as mesmas funções do automático, sem perder o processo.**
  - A função nova **não reimplementa** parse, normalização nem upsert: ela valida e **repassa o arquivo à função de sincronização correspondente** (chamada de servidor para servidor, com o segredo guardado no servidor) ou usa código compartilhado em `_shared` extraído **sem mudar o comportamento**. Assim, manual e automático gravam do mesmo jeito.
  - As funções `sync-ssw-*` só podem ganhar parâmetros **opcionais** (`origem`, `importacao_id`), com padrão `bot`. Sem esses parâmetros, o comportamento é idêntico ao de hoje, então os fluxos do n8n continuam funcionando sem nenhuma alteração.
  - Os fluxos automáticos (n8n, bot, horários) **não são tocados**. A importação manual é um caminho adicional: quando o bot voltar a baixar, as cargas automáticas seguem como antes, e as manuais ficam registradas à parte.
  - A carga manual entra nas mesmas tabelas de carga (`ssw_tracking.cargas`, `ssw_455_cargas`, `ssw_fin_cargas`), então o painel "última atualização" e as consultas existentes já mostram o resultado.
- **Estado das cargas em 16/11/2026 (Brasília), consultado no banco:** última carga OK do 036 em 14/11 15h00; do 455 em 14/11 15h07; do financeiro (faturas e liquidados) em 14/11 19h45. Último erro do 036 em 16/11 07h40 (o bot devolveu o erro e a função o registrou). Não há carga registrada do tipo `a_faturar` (435), embora a função o aceite: confirmar se esse relatório deve entrar.

## 0.1 Fluxo definido pelo dono (16/11/2026) e decisões de desenho

**Sem arquivos de exemplo.** O usuário coloca os arquivos numa pasta; o sistema **valida e registra em log**; só depois o usuário **autoriza** a importação. Estados de cada arquivo no log: `validado` / `recusado` → `autorizado` → `importado` / `erro`.

**Reconhecimento por assinatura de colunas**, extraída do que o banco e as funções já esperam (não depende de amostras):
- **036:** colunas `romaneio`, `ctrc`, `cod_ocorr_rom`, `desc_ocorr_rom` (gatilho `romaneios_preenche_colunas`, migração 012).
- **455:** coluna `serie_numero_ctrc` (ou `sigla_ctrc` + `numero_ctrc`) e colunas como `peso_calculado_em_kg`, `valor_do_frete`, `data_da_entrega_realizada` (migração 001).
- **Financeiro, formato SSW (`0;` título, `1;` cabeçalho, `2;/3;/4;` dados, `9;` rodapé):** **441 faturas** = linhas `3;` e `4;` com cabeçalho `1;` contendo `fatura` e cabeçalho `2;` contendo `ctrc`; **411 liquidados** = cabeçalho `1;` com `data_liquid` e `valor_liqu`; **435 a faturar** = cabeçalho `1;` com `ctrc` sem colunas de liquidação (fora da fase 1: nunca foi carregado).
- Arquivo que não bate com nenhuma assinatura, ou que bate com mais de uma, vira **recusado/ambíguo** com o motivo. Na prévia o usuário **vê o tipo detectado e as colunas lidas** e pode **corrigir o tipo** antes de autorizar.

**Reutilização das mesmas funções (sem mexer nelas):** a função nova valida com uma leitura própria (só para reconhecer e contar) e, na importação, **chama as funções `sync-ssw-036`, `sync-ssw-455` e `sync-ssw-financeiro` do servidor**, com o segredo guardado no servidor. A gravação, a normalização, o upsert e o log nas tabelas de carga existentes são os mesmos do automático. As funções `sync-ssw-*` e os fluxos do n8n **não são alterados**.

**Período/sequência:** campo na prévia (obrigatório para 036 e 455; opcional para o financeiro). Tentar extrair do arquivo (por exemplo, data inicial e final) e sempre deixar editável.

## 1. Escopo

**Fase 1 (obrigatória):** 036, 455 e financeiro (441 faturas, 411 liquidados, 435 a faturar).
**Fora da fase 1:** 038 e 088. A migração `014_remove_038_088.sql` os descontinuou de propósito (redundantes com 036/455) e removeu tabelas, funções de gravação e visões. As funções `sync-ssw-038` e `sync-ssw-088` continuam no código, mas não funcionam. Na tela, 038/088 aparecem como "descontinuado: não importado". Só restaurar o suporte (definições na migração `012_ssw_tracking.sql`, backup das 22 linhas do 088 em `backup/veiculos_situacao_088_20261021.json`) se houver necessidade de negócio confirmada; nesse caso, vira a fase 3.

## 2. Fatos do código que o desenho respeita

- As funções `sync-ssw-036`, `sync-ssw-455` e `sync-ssw-financeiro` recebem o **TXT cru** (ou JSON com `conteudo`) e gravam por upsert com chave única. A importação manual usa o mesmo arquivo que o bot baixa.
- Autenticação atual das funções: `x-sync-secret` ou `Authorization: Bearer <service role>`. O navegador nunca recebe essas chaves.
- Parâmetros obrigatórios por tipo: 036 usa `referencia` (período, ex.: `171026-201026`); 455 usa `sequencia` (fila 156 do SSW); financeiro usa `tipo=faturas|liquidados|a_faturar` e `sequencia` opcional. A importação manual precisa obter esses dados.
- O 435 (`a_faturar`) é um **retrato**: o que some do arquivo é marcado `ativo=false`. Importar arquivo antigo ou parcial desativa registros que ainda existem.
- Logs de carga hoje: `ssw_tracking.cargas` (036/038/088, legível por qualquer usuário autenticado), `ssw_455_cargas` e `ssw_fin_cargas`.
- Permissões: módulos em `web/src/lib/modulos.ts` com lista de "restritos"; regra única `permitido(acesso, chave, administrador)`.

## 3. Fluxo

1. **Selecionar** arquivos, pasta (`webkitdirectory`) ou arrastar e soltar. Ignorar o que não for `.txt`/`.csv`; limite de quantidade e tamanho por arquivo.
2. **Validar no servidor (dry-run).** A tela envia cada arquivo à função nova com `modo=validar`. A função reconhece o tipo pelas **colunas do cabeçalho** (não pelo nome do arquivo), extrai referência/sequência quando houver, conta linhas e devolve avisos. Nada é gravado. Não duplicar a lógica de reconhecimento no navegador.
3. **Prévia por arquivo:** nome, tipo reconhecido, linhas, referência/sequência (editável quando não vier no arquivo), situação (aceito, recusado com motivo, já importado antes, descontinuado) e avisos.
4. **Avisos obrigatórios:** 435 mostra a data do arquivo e exige confirmação marcada ("registros que não estiverem neste arquivo serão marcados como inativos"); 036 e 455 avisam se o período já tem carga mais recente.
5. **Importar** só os aceitos e confirmados. A função nova chama a lógica de gravação existente (extrair para `supabase/functions/_shared` ou chamar a função existente de dentro do servidor com a chave de serviço), mantendo a mesma normalização e deduplicação das cargas automáticas.
6. **Registrar** cada tentativa, inclusive as recusadas.
7. **Histórico** consultável na própria tela.

Regra mantida: código desconhecido nunca é enviado para gravação; vira "recusado" com o motivo registrado.

## 4. Backend

- **Função nova** `importar-ssw` (JWT do usuário obrigatório): valida o usuário, confere a permissão do módulo no servidor (não só no botão), aplica a lista permitida de tipos, limite de tamanho e hash (SHA-256) do arquivo.
- **Tabela de log geral** `ssw_importacoes`: id, usuário, data/hora, nome do arquivo, hash, tipo reconhecido, referência/sequência, modo (validar/importar), status, erro, linhas, novos, atualizados, iguais. RLS: leitura só para quem tem o módulo; escrita só pela função (service role).
- **Marca de origem manual** nas cargas existentes (coluna `origem` com `bot`/`manual` e id da importação) para distinguir nas três tabelas de carga.
- **Idempotência:** o mesmo hash já importado com sucesso vira aviso ("já importado em ..."), não bloqueio, para permitir reprocessar de propósito.

## 5. Acesso

- Novo módulo **restrito** `importacao_ssw` em `modulos.ts`, visível só a administradores ou a quem receber a permissão.
- A tela e a função verificam a permissão; o log novo não é legível por qualquer usuário autenticado (diferente de `ssw_tracking.cargas` hoje).

## 6. Etapas

1. **Amostras reais** de cada tipo (036, 455, 441, 411, 435), para fixar o reconhecimento por cabeçalho e descobrir onde vêm referência/sequência. *Bloqueia o resto.*
2. Migração: tabela `ssw_importacoes` + coluna `origem`.
3. Função `importar-ssw` (validar + importar) e reaproveitamento da lógica existente.
4. Tela: seleção, prévia, avisos, importação, resultado por arquivo.
5. Histórico com filtros (data, usuário, tipo, status) e detalhe do erro.
6. Testes com os arquivos reais: formatos, arquivo vazio/duplicado/desconhecido, 435 com aviso, tempo de execução (036 tem ~2.000 linhas; 455, ~2.400), permissões.
7. (Fase 3, só se confirmado) restaurar 038/088.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| 435 antigo desativa registros válidos | aviso, data do arquivo e confirmação explícita |
| Carga sem referência/sequência | campo editável na prévia; recusar se faltar |
| Reconhecimento errado de tipo | só pelo cabeçalho, lista permitida, dry-run no servidor |
| Importar o mesmo arquivo duas vezes | hash + aviso (a gravação por upsert já evita duplicar dados) |
| Acesso indevido | JWT + permissão no servidor + módulo restrito |
| Timeout em arquivo grande | medir com arquivos reais; processar um arquivo por chamada |

## 9.0 Estado da implantação (16/11/2026)

- **Banco:** migração `042_ssw_importacoes.sql` aplicada no projeto GrupoLobo (`xggknkcipdvksfvlvtmh`). Conferido: RLS ligado, 2 políticas, `anon` sem leitura, `service_role` com escrita, tabela vazia.
- **Função:** `importar-ssw` implantada (versão 1, `verify_jwt: false`, validação de sessão e administrador dentro da função). Testado no ar: sem login → 401 "Sessao nao encontrada."; token falso → 401 "Sessao invalida."; `OPTIONS` → 200. As demais funções (`sync-ssw-036/455/financeiro`, `profissionais-*`, `auth-*`, `alerta-coleta`) **não foram alteradas** (mesmas versões e datas).
- **Site:** build de produção gerado em `web/dist` (8 arquivos, 2,3 MB; contém a rota `/importacao-ssw`). **Falta publicar** no servidor do site (cópia por SSH, feita pelo dono).
- **Falta testar** com administrador logado: validar um arquivo e, só depois, importar. Ainda não houve nenhum arquivo real.
- Observação de ambiente: no PowerShell do dono, `npx` é bloqueado pela política de execução; usar `npx.cmd`. O CLI do Supabase foi autenticado por login no navegador (token guardado pelo próprio CLI). A CLI exige `--yes` para implantar em produção quando roda por agente.

## 9. Implementação no repositório (16/11/2026) e como implantar

**Escrito e verificado (tipos e build do site OK; reconhecimento testado com arquivos sintéticos). Nada foi implantado nem aplicado no banco.**

Arquivos novos/alterados:
- `supabase/migrations/042_ssw_importacoes.sql`: tabela `public.ssw_importacoes` (log), RLS só para administradores, escrita só pela função.
- `supabase/functions/importar-ssw/index.ts` e `deteccao.ts`: valida (reconhece o tipo, conta linhas, registra) e importa (confere o hash do arquivo e chama `sync-ssw-036`, `sync-ssw-455` ou `sync-ssw-financeiro`). **As funções `sync-ssw-*` e os fluxos do n8n não foram alterados.**
- `web/src/pages/ImportacaoSswPage.tsx`, `web/src/services/importacaoSsw.ts`, `web/src/types/importacaoSsw.ts`, `web/src/components/layout/AdminRoute.tsx`; rota `/importacao-ssw` em `App.tsx` e item "Importação SSW" em `AppShell.tsx` (menu Gestão, só para administradores).

Decisões tomadas: só **administradores** importam (menu, rota e função do servidor); 435 reconhecido mas **recusado** nesta fase; período (036) e sequência (455/financeiro) **opcionais e editáveis**; escolher o tipo manualmente refaz a validação.

Implantação (projeto GrupoLobo, ref `xggknkcipdvksfvlvtmh`), nesta ordem, **depois de autorizada**:
1. Rodar `042_ssw_importacoes.sql` no SQL Editor.
2. `supabase functions deploy importar-ssw --no-verify-jwt --project-ref xggknkcipdvksfvlvtmh` (a sessão e o perfil de administrador são validados dentro da função, como nas funções `profissionais-*`).
3. Conferir que a função enxerga `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (injetadas pelo Supabase). `SSW_SYNC_SECRET` é opcional; as funções `sync-ssw-*` aceitam a chave de serviço.
4. Publicar o site (`npm run build` e o procedimento de deploy já usado).
5. Primeiro teste com **um arquivo pequeno de cada tipo**: se algum for recusado, a tela mostra as colunas lidas; os nomes de coluna foram deduzidos do banco e das funções, então a primeira amostra real confirma ou ajusta as assinaturas em `deteccao.ts`.

## 8. Perguntas em aberto

1. Quais são os **formatos exatos** dos arquivos que o usuário baixa à mão no SSW (TXT? separador? codificação)? Vão ser iguais aos do bot?
2. Onde está a **referência** do 036 e a **sequência** do 455/financeiro: no cabeçalho do arquivo, no nome ou só na tela do SSW?
3. Quem pode importar: só administradores ou também outros perfis?
4. O 038 e o 088 ainda são necessários para algum relatório ou rotina?
