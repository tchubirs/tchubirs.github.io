# Estado do projeto (passagem da nuvem para o PC local)

## O que é
Povix (pasta `kick-sync/`): site que abre um evento inteiro da Kick (até centenas de streamers) numa só linha do tempo, sincroniza os VODs, deteta lances e ajuda a criar clipes. Corre no navegador, sem servidor (`kick-sync/package.json`).

## Repositório e ramos
- Repo: `tchubirs/tchubirs.github.io` (site publicado em tchubi.org pelo GitHub Pages).
- `claude/ai-revenue-automation-map-g00jks`: ramo de trabalho desta sessão, 50 commits à frente do `main`, tudo já enviado.
- `para-local`: este ramo. É igual ao de cima mais este ficheiro.
- `main`: recebe commits automáticos do GitHub Actions (peneira, prémios).
- Também consultado: `tchubirs/clipes`, ramo `campanha-mw4`. Não tem trabalho desta sessão.

## Estado atual
- Não havia alterações por commitar nem commits por enviar.
- Últimos commits do Povix: tela inicial com dois caminhos (evento inteiro, ou VOD/poucos canais), OCR no navegador para achar o time pelos nomes na tela (experimental, com confirmação) e estudo de voz para texto (`kick-sync/ESTUDO-VOZ.md`).
- Política do Codex em `kick-sync/CLAUDE.md` e skill `.claude/skills/codex-bridge/`.

## O que estava a fazer
1. Tentei ligar o Codex CLI para revisões. Parou porque a sessão não tinha `OPENAI_API_KEY`. O Codex está instalado, mas nunca correu, por isso não houve revisão.
2. O dono pediu para seguir `clipfactory/ia_local/INSTALAR.md` (repo `clipes`, ramo `campanha-mw4`: ComfyUI + Wan 2.2 em `C:\IA`). Não foi possível na nuvem (sem GPU e sem `C:\`). Tem de ser feito pelo Claude do PC.

## Próximo passo
- No PC: seguir o `INSTALAR.md` do repo `clipes`. No fim, escrever o `RELATORIO.md` e fazer push para `campanha-mw4`.
- No PC: se quiseres o Codex, fazer `codex login` localmente e correr uma revisão dos últimos commits do Povix, como manda a política no `CLAUDE.md`.
- Juntar `claude/ai-revenue-automation-map-g00jks` ao `main` quando o dono aprovar.

## O que depende da nuvem
- GitHub Pages (publicação de tchubi.org) e GitHub Actions no `main`: `peneira.yml`, `premios.yml`, `revisao-claude.yml` e `apagar-temporarios.yml`. Estes correm na nuvem do GitHub, não nesta sessão.
- O backend proposto em `kick-sync/ARENA-BACKEND.md` (Cloudflare Pages + D1 + tarefa no Actions) é só um plano, ainda não foi feito.
- O Povix em si não depende da nuvem: abre a Kick diretamente do navegador.
