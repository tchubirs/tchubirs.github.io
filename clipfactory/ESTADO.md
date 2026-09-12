# Estado medido — 12/09/2026

Não é opinião: é a saída de `pytest` e de `clipfactory doctor` corridos nesta data.

## A máquina

| O quê | Estado |
|---|---|
| Testes | **12/12 passam** (0,36 s) |
| ffmpeg | OK |
| yt-dlp | OK |
| anthropic | OK |
| google-api-client | OK |
| `ANTHROPIC_API_KEY` | falta — sem ela a escolha do trecho cai para heurística, que é pior |
| **YouTube OAuth** | **falta — é o único que bloqueia a execução** |
| Instagram | falta (opcional) |

`clipfactory doctor` diz, com estas palavras: *"Bloqueiam a execução: YouTube OAuth"*.

## Porque é o YouTube e não outro

A campanha Dreamina paga $10/1K igual nas três plataformas. Das três:

- **TikTok** — a Content Posting API exige auditoria; até passar, todo post sai
  `SELF_ONLY`, ou seja, ninguém vê. Morto para já.
- **Instagram** — exige conta Business ligada a uma Página do Facebook.
- **YouTube Shorts** — só precisa do OAuth. **É o caminho.**

## A campanha em cima da mesa

**Dreamina AI UGC**, da Propaganda, no `contentrewards.com` (não no Whop):

- **$10 por 1.000 views** — dez vezes as outras campanhas abertas medidas.
- Mínimo para receber: $10 (= 1.000 views). Máximo por vídeo: $1.000.
- Sobram **$20.928,94** de $45.000. Apenas **47 clippers**.
- Entra-se direto: o botão é "Join Campaign", não "Application".

**A dúvida que ainda não está respondida:** o texto diz *"create original
short-form content"*. Isso é UGC, não é clipagem — e a máquina corta vídeo, não
inventa vídeo. Se os materiais do Google Drive da campanha forem vídeo que dá
para cortar, a máquina serve como está. Se exigirem gravação própria, não serve.

## Rejeitado, e porquê

- **Retainer da Propaganda** (`roster.propgda.com`) — $500–$5.000/mês, mas exige
  manager diário, chamada de equipa, resposta rápida, e *"uma página que já está
  a ter views"*. É um emprego. Vende tempo humano, que é exatamente o que não
  queremos vender.
- **Rex Stax Clipping** e **Text Audio Campaign** (mesma agência) — abertas e sem
  candidatura, mas **$1 CPM**. Reserva, não plano.
