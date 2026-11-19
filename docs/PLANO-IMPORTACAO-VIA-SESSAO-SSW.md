# Plano: importar relatórios usando a sessão do SSW aberta no navegador do usuário

Estado: **plano, nada implementado.** Registrado em 16/11/2026.
Ideia do dono: com o SSW aberto e autenticado no usuário, o sistema do Grupo Lobo acessa o SSW e faz as importações dos relatórios.
Contexto: desde 15/11/2026 o SSW (`tms.ssw.inf.br`) recusa com 403 os IPs dos servidores (bot), mas aceita o IP residencial do usuário. Como as chamadas sairiam do navegador do próprio usuário, com a sessão dele, o bloqueio de IP deixa de importar. Complementa o módulo de importação manual (`PLANO-IMPORTACAO-MANUAL.md`), que já valida, pede autorização, registra log e grava pelas mesmas funções `sync-ssw-*`.

## 1. O que o robô faz hoje (e o navegador pode repetir)

Fonte: `ssw-bot/server-http.mjs`. Tudo é HTTP com formulário, sem tela:
- Login: `POST /bin/ssw0422` (act=L). **Com a sessão aberta, o login não é necessário**: os cookies do navegador já valem.
- **036:** `POST /bin/ssw0146` (act=REL2, período, filial) e o arquivo vem direto.
- **455:** `POST /bin/ssw0230` (act=E1) envia o pedido; o resultado aparece na **fila do 156** (`POST /bin/ssw1440`, resposta em XML); o download é `ssw1440 act=DOW<sequência>`.
- **Financeiro:** 441 (faturas), 411 (`ssw0309`, até 31 dias) e 435 (`ssw0103`), entregues na hora ou pela fila 156.
- O robô devolve o período em `x-periodo` e a sequência da fila em `x-sequencia`: dados que o módulo manual precisa e que aqui já vêm de graça.

Vantagem importante: os arquivos obtidos assim são **os mesmos que o robô entrega hoje às funções `sync-ssw-*`**, então o formato deixa de ser uma incógnita.

## 2. Por que o sistema do site não pode chamar o SSW direto

O site do Grupo Lobo roda em outro endereço. O navegador bloqueia chamadas entre sites (CORS) e não envia os cookies do SSW para outro domínio. **Não é viável** o site, sozinho, ler o SSW com a sessão do usuário. É preciso algo que rode **dentro da página do SSW** (mesmo endereço, mesmos cookies).

## 3. Opções

| Opção | Como funciona | Esforço | Prós | Contras |
|---|---|---|---|---|
| **A. Extensão do navegador (Chrome/Edge)** | Script na página do SSW faz as chamadas com a sessão do usuário; uma "ponte" entrega o resultado ao site do Grupo Lobo, que valida, pede autorização e importa pelo módulo existente. | Médio | Um clique no site; nada de arquivo solto; dados e cookies não passam por servidor; pode agendar enquanto a aba do SSW estiver aberta. | Precisa instalar a extensão (modo desenvolvedor ou loja privada); manutenção se o SSW mudar. |
| **B. Favorito (bookmarklet) ou script no console** | Com a aba do SSW aberta, o usuário clica no favorito; ele baixa os relatórios como arquivos TXT na pasta Downloads. Depois o usuário usa a tela **Importação SSW** (pasta) como já está pronta. | Baixo | Rápido de fazer; **nenhuma mudança no backend**; serve de prova de conceito. | Dois passos manuais; precisa abrir a aba e clicar. |
| **C. Programa local com controle remoto do Chrome** | App no computador do usuário controla o Chrome aberto. | Alto | Automático. | Frágil, difícil de instalar e manter. Não recomendado. |
| **D. Site chama o SSW direto** | n/a | n/a | n/a | **Inviável** (seção 2). |

## 4. Recomendação

**Fase 1 (B):** favorito/script que baixa 036, 455, 441 e 411 usando a sessão aberta e salva os TXT. O usuário seleciona a pasta em Importação SSW. Valida a ideia com os arquivos reais e destrava a carga rápido, sem mexer no que já foi implantado.
**Fase 2 (A):** extensão com ponte. A tela Importação SSW ganha o botão **"Buscar do SSW (sessão aberta)"**: a extensão devolve o texto, a tela segue o fluxo já pronto (validar, autorizar, importar). O log registra a origem.

## 5. Como a Fase 2 funcionaria

1. Usuário abre e entra no SSW (aba `tms.ssw.inf.br`) e abre o site do Grupo Lobo (administrador).
2. Na Importação SSW, escolhe o relatório e o período e clica em **Buscar do SSW**.
3. O site envia uma mensagem à extensão (somente o endereço do site pode falar com ela); a extensão manda a ordem ao script da aba do SSW.
4. O script repete as chamadas do robô (seção 1) **com a sessão aberta**, espera a fila do 156 quando for o 455, e devolve o texto, o período e a sequência.
5. O site mostra a prévia, pede autorização e chama `importar-ssw` (a mesma função, sem alteração) com `referencia` e `sequencia` já preenchidos.
6. Opcional: agendamento (por exemplo, uma vez por hora, só com a aba do SSW aberta e logada), com histórico no log e limite de frequência.

## 6. Segurança e cuidados

- **Nenhuma senha, cookie ou token do SSW sai do navegador.** A extensão não guarda credenciais e só devolve o conteúdo do relatório ao site.
- Permissões mínimas: endereço do SSW e endereço do site do Grupo Lobo. Mensagens aceitas só de origem confiável.
- O envio ao Supabase continua autenticado pelo usuário do site e restrito a administradores, como hoje.
- **Uma sessão por usuário no SSW:** usar a sessão que o usuário já abriu não cria sessão nova, mas o robô (desligado hoje) e o usuário não podem usar o mesmo login ao mesmo tempo.
- **Frequência:** manter chamadas espaçadas. O bloqueio recente pode ter relação com volume; o 036 a cada 10 minutos é o primeiro candidato a reduzir.
- **Regras do SSW:** confirmar que a automação por sessão própria do usuário é aceitável para o SSW (ver `MENSAGEM-SSW-LIBERACAO-IP.md`; os dois caminhos podem andar juntos).

## 6.1 Correção importante (16/11/2026): a sessão do SSW tem estado no servidor

Lendo o protocolo do robô (`ssw-bot/server-http.mjs`), cada relatório começa com `POST /bin/menu01` (`act=TRO`), que **troca a unidade e a opção ativas da sessão** (036 e 038 rodam na filial SJP; os financeiros, na matriz MTZ). Se a extensão usar a **mesma sessão em que uma pessoa está trabalhando**, ela muda a unidade e a opção sob os pés dessa pessoa, e a pessoa, ao clicar, pode cair em outra tela ou unidade. Além disso, o SSW aceita **uma sessão por usuário**: um segundo login do mesmo usuário derruba o primeiro.

Consequência para o desenho: a automação deve rodar numa **janela/perfil de navegador dedicado, logado com o usuário do robô** (o mesmo que o robô usa hoje, ou outro usuário criado só para isso), num computador que fique ligado. Pessoas continuam usando o SSW com o próprio usuário, em outro navegador. Não usar a sessão pessoal de quem opera o SSW.

## 6.2 Decisão do dono e implementação (16/11/2026)

O dono pediu **importação automática de tempos em tempos**, **no mesmo horário do automático**, e escolheu **usar a própria sessão** (não uma janela dedicada). Foi construída a **opção A (extensão)**:

- `ssw-extensao/` (Manifest V3): `agenda.js` (mesmos crons e feriados dos fluxos reais do n8n, testado: 85/15/5 execuções por dia útil), `content.js` (porta das chamadas do robô para dentro da página do SSW), `background.js` (agenda, fila, travas), popup e opções. Guia em `ssw-extensao/README.md`.
- Backend: migração `043_importacao_automatica.sql` (coluna `origem` no log e tabela `ssw_importacao_config`, o botão de ligar/desligar, **desligada por padrão**); `_shared/ssw_deteccao.ts` e `_shared/ssw_importacao.ts` (reconhecimento e chamada às `sync-ssw-*`, compartilhados com a importação manual); função nova `importar-ssw-auto` (token `SSW_IMPORT_TOKEN`, lista de tipos, limite por hora). As funções `sync-ssw-*` e os fluxos do n8n **não foram alterados**.
- Site: painel "Importação automática" (ligar/desligar, última importação, último problema) e coluna/filtro de origem no histórico.
- Mitigação do problema da sessão compartilhada (6.1): a extensão **espera 90 s sem atividade** no SSW antes de cada rodada e pula a rodada se o usuário ficar ativo por mais de 10 min. Ela **não restaura** a unidade que a pessoa estava usando (não há como ler isso sem ver a tela do SSW); isso fica como risco aceito pelo dono.
- Travas: para sozinha no 1º 403; botão desligar no site; sessão expirada e "sem aba do SSW" avisam; limite de 60 importações por hora.
- O 435 (a faturar) entra no automático porque o fluxo do n8n sempre o carregou; no manual continua recusado. Observação: o banco não tem nenhuma carga `a_faturar`, então esse relatório provavelmente falhava em silêncio no robô; a extensão registra o erro no log.

Verificação feita: tipos e build do site, `deno check` das funções, `node --check` da extensão, testes com SSW simulado (036, 455 em 3 janelas, financeiro com fila do 156, 403) e testes do `background.js` com a API do Chrome simulada (agenda, ociosidade, 403, desligada, sem aba, pausa, token nunca exposto ao popup).
**Não verificado:** nenhuma chamada real ao SSW (o SSW real só aceita o IP do dono e a sessão dele). O primeiro teste real deve ser com **Rodar 036 agora** no popup, com o SSW aberto.

**Implantado em 16/11/2026 (projeto GrupoLobo `xggknkcipdvksfvlvtmh`):** migração `043` aplicada e conferida (coluna `origem`, linha única em `ssw_importacao_config` com `ativo=false`, 3 políticas, `anon` sem acesso, `service_role` com escrita); `importar-ssw` reimplantada (v2, usa `_shared`) e `importar-ssw-auto` implantada (v1), ambas `verify_jwt=false`. Testado no ar: manual sem login e com token falso → 401; automática sem segredo configurado → 503 "não configurada" (recusa tudo até existir o `SSW_IMPORT_TOKEN`). Demais funções com as mesmas versões e datas de antes.

**Pendente (com o dono):** criar o segredo `SSW_IMPORT_TOKEN` no Supabase (e colar o mesmo valor nas opções da extensão), publicar o site (`web/dist` já tem o painel), instalar a extensão (`ssw-extensao/README.md`), testar com "Rodar 036 agora" e só então ligar a importação automática no site.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| O SSW mudar telas ou parâmetros | Reaproveitar a lógica do robô; testes com arquivo real; versão da extensão |
| Sessão expirada | A extensão detecta (resposta de login) e avisa o usuário para entrar de novo |
| Tela do SSW exigir dados extras da sessão (filial, empresa) | Ler da própria sessão ou perguntar na primeira execução |
| 455 demorar na fila | Mesmo tempo de espera do robô, com indicador de progresso |
| Instalação da extensão | Guia de instalação; modo desenvolvedor ou publicação privada |

## 8. Decisões necessárias

1. Começar pela **Fase 1 (favorito)** e depois a extensão, ou ir direto para a extensão?
2. Navegador usado pelos usuários (Chrome ou Edge)?
3. Só **botão sob demanda** ou também **agendamento** enquanto a aba do SSW estiver aberta?
4. Quais relatórios entram: 036, 455, 441 e 411 (o 435 segue fora, pelo risco de desativar registros)?
5. Quem opera: só administradores do site?
