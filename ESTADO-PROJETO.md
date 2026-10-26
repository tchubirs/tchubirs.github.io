# Estado do projeto (26/10/2026)

## O que é
Repositório com vários trabalhos do dono. O principal é o Povix (`kick-sync/`): site que abre os VODs de vários
streamers da Kick sincronizados, acha os melhores momentos (chat, som, mortes) e baixa clipes prontos para o TikTok.

## Repositório e branches
- GitHub: `tchubirs/tchubirs.github.io`.
- `claude/ai-revenue-automation-map-g00jks`: todo o trabalho, inclusive o do PC. É o branch que o PC deve puxar.
- `main`: o site publicado. Não recebe push sem o dono pedir.
- Não existe branch `para-local`: esta sessão na nuvem não tinha nada pendente (tudo já estava commitado e enviado
  no branch acima) e só envia para o branch dela.

## Estado atual
- Último commit: 5ddce59 (18/10), feito nas sessões do PC. Árvore limpa na nuvem.
- Povix: modo simples (uma caixa, lista de momentos, baixar 16:9 e 9:16 com webcam, legenda, texto do post),
  mortes achadas sozinhas no vídeo, página de momentos do Abisal com 194 streamers, editor avançado.
- Fila e pendências: `FILA.md` (seção "Povix, onde parou" e o que vem depois) e `PENDENTES.md` (o que só o dono faz).
- Guia de passagem: `COMECAR.md`; preparar o PC: `pc/PREPARAR-PC.bat`.

## O que esta sessão da nuvem fazia
Desde 12/10 nada: o trabalho passou para o PC e a rotina de hora em hora foi desligada.

## Próximo passo
Seguir `FILA.md` no PC. Itens abertos citados lá: índice do evento com confiança medida, gritos na lista de um
streamer só, rótulos para medir explosão, grito e chat, conferir o botão da fala numa live real no Chrome, e o teste
com uma clipadora de verdade no celular (5 tarefas no fim de `kick-sync/ESTUDO-FACIL.md`).

## O que depende de nuvem
- Nada do Povix: é um site estático que roda no navegador.
- Conectores da conta (OpusClip só no plano Pro, Stripe e Etsy pedindo nova autorização) são da conta, não da nuvem.
- A rotina "Reserva: retomar trabalho contínuo" está desligada e aponta para esta sessão; pode ser apagada.
