# Grupo Lobo · Importador SSW (extensão do navegador)

Busca os relatórios do SSW (**036, 455 e financeiro**) usando a **sessão que você já abriu** no SSW e envia ao sistema do Grupo Lobo, **nos mesmos horários do robô do n8n**. O servidor valida cada arquivo e grava pelas **mesmas funções** do modo automático (`sync-ssw-036`, `sync-ssw-455`, `sync-ssw-financeiro`).

Por que existe: desde 15/11/2026 o SSW recusa (403) os IPs dos servidores, mas aceita o IP do seu computador.

## Como funciona

- A cada minuto a extensão confere a agenda (`agenda.js`, em horário de Brasília):
  - **036:** a cada 10 min. Seg a sex das 6h às 19h50 e às 20h00; sábado das 6h às 14h50 e às 15h00. Pula feriados.
  - **455:** no minuto 07. Seg a sex das 6h às 20h; sábado das 6h às 15h. Às 6h pede 3 janelas de 30 dias (90 dias); nos demais horários, 1 janela. Pula feriados.
  - **Financeiro:** 6h45, 12h45, 15h45, 17h45 e 19h45, todos os dias. 5 relatórios em sequência (a faturar, faturas emitidas, pendentes, liquidadas e CTRCs liquidados).
  - Feriados: os mesmos do n8n (nacionais, 19/12 do Paraná e Sexta-feira Santa).
- Um script dentro da página do SSW (`content.js`) repete as chamadas do robô com a sua sessão. A extensão **não guarda senha**.
- O arquivo vai para a função `importar-ssw-auto`, que reconhece o tipo (mesmas regras da importação manual). **Se não for o tipo pedido, é recusado e nada é gravado.**

## Instalação (Chrome ou Edge)

1. Abra `chrome://extensions` (no Edge, `edge://extensions`) e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha esta pasta (`ssw-extensao`).
3. Fixe o ícone **SSW** na barra do navegador.
4. Clique no ícone, em **Opções**, e preencha:
   - **Usuário do SSW**: o login que você usa no SSW (como aparece na fila do 156).
   - **Token do importador**: o mesmo valor do segredo `SSW_IMPORT_TOKEN` do Supabase (veja abaixo).
   - Filial (`SJP`) e o tempo de espera de ociosidade (90 s).
5. Entre no SSW (`tms.ssw.inf.br`) nesta janela e **deixe a aba aberta**.
6. No site, em **Importação SSW**, clique em **Ligar importação automática**.

### Criar o token (uma vez)

Gere um texto aleatório e já deixe copiado, sem mostrar na tela:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_}) | Set-Clipboard
```

1. No painel do Supabase do projeto GrupoLobo: **Edge Functions → Secrets → Add new secret**, nome `SSW_IMPORT_TOKEN`, valor = cole.
2. Na extensão, **Opções → Token**: cole o mesmo valor e salve.
3. No popup, clique em **Testar conexão**. Deve dizer "Conexão OK. Importação automática LIGADA no site".

## Travas de segurança

- **Para sozinha no 1º 403 do SSW**, avisa por notificação e fica parada até você clicar em **Retomar**. Não insiste.
- **Botão desligar no site** (Importação SSW): desliga tudo na hora; a extensão volta sozinha quando for religada.
- **Espera você ficar parado**: antes de cada rodada espera 90 s sem mouse/teclado no SSW, porque os relatórios **trocam a unidade e a opção da sessão do SSW** (o robô faz o mesmo). Se você ficar ativo por mais de 10 min, a rodada é pulada (aparece no popup).
- **Token secreto, lista de tipos permitidos e limite de 60 importações por hora** no servidor.
- **Sessão expirada** ou **nenhuma aba do SSW aberta**: avisa e volta quando você entrar de novo.
- Cada arquivo, inclusive recusado ou com erro, fica no **histórico** do site (origem "Automática").

## Requisitos e limites

- O computador e o navegador precisam estar **ligados**, com o SSW aberto e logado numa aba. Se a sessão cair, para até você entrar de novo.
- O SSW aceita **uma sessão por usuário**: não deixe o robô do n8n ligado ao mesmo tempo no mesmo usuário.
- Usar a mesma sessão em que você trabalha pode mudar a unidade ativa do SSW durante a busca (por isso a espera de ociosidade). Para não ter nenhuma interferência, use uma janela/perfil dedicado com o usuário do robô.
- O 036 a cada 10 minutos é o volume que parece ter levado ao bloqueio dos servidores. Se o SSW recusar o seu IP, a extensão para sozinha; reduza a frequência em `agenda.js` antes de retomar.

## Arquivos

- `manifest.json`: permissões mínimas (SSW e o Supabase do Grupo Lobo).
- `background.js`: agenda, fila, travas e envio ao servidor.
- `content.js`: chamadas ao SSW dentro da página (porta do `ssw-bot/server-http.mjs`).
- `agenda.js`: horários e feriados (testado contra os crons do n8n).
- `popup.html/js` e `options.html/js`: estado, ações e configuração.
