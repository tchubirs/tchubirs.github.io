# Começar uma conversa nova (12/10/2026)

Tudo o que foi feito está neste repositório, no branch `claude/ai-revenue-automation-map-g00jks`. A conversa nova
começa daqui e não precisa da antiga.

## Mensagem para colar na conversa nova

> Lê COMECAR.md, FILA.md e PENDENTES.md e continua o Povix de onde parou. Instala o Codex
> (`npm i -g @openai/codex`) e me manda o código do login (`codex login --device-auth`). Regras: um agente por vez,
> agentes com Sonnet, e sem rotina de hora em hora enquanto eu estiver por perto.

## Onde o trabalho parou
- **Povix, modo simples, parte 1:** uma caixa e um botão na primeira tela, lista de lances com "Baixar para TikTok",
  "Modo avançado" para o resto. Plano em `kick-sync/ESTUDO-FACIL.md`. Se o commit final não estiver no histórico,
  continuar a partir dos commits "WIP" e da FILA.md.
- **Povix, mortes achadas sozinhas no vídeo:** tela de morte do Rust e nome de quem matou lido na imagem. Arquivos
  `kick-sync/site/achar-mortes*.js`. Mesmo cuidado: ver se o commit final entrou.
- **Depois:** parte 2 do modo simples (a mesma lista para o evento inteiro, com as mortes) e o teste com uma
  clipadora de verdade no celular dela (5 tarefas no fim de `kick-sync/ESTUDO-FACIL.md`).
- **Comparação com o Opus Clip:** `kick-sync/COMPARA-OPUS.md`.

## O que passa sozinho para a conversa nova
- Este repositório, as skills do projeto (`.claude/skills/arena`, `.claude/skills/codex-bridge`) e os comandos
  `codex-consult`, `codex-do` e `codex-review` (`.claude/commands`).
- Os conectores da conta: Canva, Google Drive, Linear, Netlify, OpusClip, Vercel e Anthropic Economic Index.
  O Gmail está conectado, mas desligado nesta conversa; ligue-o na conversa nova se precisar.
- Precisam de nova autorização (em claude.ai, Configurações, Conectores): Stripe e Etsy API. O Google Calendar não
  está conectado.
- O OpusClip só funciona por aqui no plano Pro ou maior do Opus.

## O que não passa e como refazer
- **Codex:** instalar e fazer o login de novo (a mensagem acima já pede). O dono digita o código em
  https://auth.openai.com/codex/device em até 15 minutos.
- **Chaves da Etsy:** ficam no arquivo `.etsy-secret`, que não vai para o GitHub. Para não as perder, ponha
  `ETSY_KEYSTRING` e `ETSY_SHARED_SECRET` nas variáveis do ambiente (menu do ambiente na barra de título da sessão,
  Editar). A autorização da loja se refaz com um link novo (1 min).
- **Vídeos baixados para testes:** baixar de novo quando precisar (`kick-sync/` tem os scripts e as instruções).
- **Rotina de hora em hora:** ela acorda a conversa antiga. Desligar quando a nova começar e criar outra só se o
  dono pedir.

## Rodar no PC, comandando pelo celular
Opcional. No PC: instalar o Claude Desktop (ou o Claude Code), `git clone https://github.com/tchubirs/tchubirs.github.io`,
entrar na pasta e rodar `claude remote-control` (ou abrir a pasta pelo Claude Desktop). A sessão aparece no app
Claude do celular, em Code. Vantagem: os testes usam o Chrome de verdade, que toca os vídeos da Kick, e o login do
Codex fica guardado. O PC precisa ficar ligado.
