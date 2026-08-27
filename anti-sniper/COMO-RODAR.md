# Como rodar — na sua máquina, agora

Um comando. Sem VPS, sem endereço público, sem webhook.

```
npm install
npx playwright install chromium
npm start
```

Na primeira vez ele cria `detetive.config.json` e pede **uma linha**:

```json
{
  "canal": "tchubi",
  "fuso": "Europe/Paris",
  "battlemetricsJogador": "",   ← o número em battlemetrics.com/players/NUMERO
  "botrixFidelidade": "https://botrix.live/panel/loyalty",
  "fontes": [{ "plataforma": "kick", "usuario": "tchubi" }]
}
```

## Qual das suas plataformas tem dado

```
node bin/checar-fontes.js tchubi
```

Medido em 27/08/2026:

```
  kick      ✓ 20 pessoas, 20 com tempo assistido  (topo: gabriel_uy_mvd, 50 min)
  twitch    — existe, mas veio VAZIO
  youtube   — existe, mas veio VAZIO
  trovo     · sem canal com esse nome
```

A BotRix tem fidelidade nas quatro, e as quatro caem na **mesma audiência**:
a pergunta é *"essa pessoa estava me assistindo"*, não *"em qual site"*. Hoje
só a Kick tem o que entregar — o painel da BotRix diz o mesmo ("você ainda
não tem dados do seu canal" na Twitch).

**Sobre a plataforma selecionada:** o painel guarda isso na sessão, não na
URL. O agente lê a lista COMPLETA da que estiver selecionada lá. A rota
pública lê as outras sem mexer na sua escolha — por isso as duas coisas
existem.

Preencha e rode `npm start` de novo. Abre uma janela do navegador: **faça
login no BattleMetrics e no BotRix**. A sessão fica salva em
`~/.detetive-navegador` e não pede nunca mais.

> Parte disso já funciona **sem login nenhum**: a BotRix tem uma rota
> pública que devolve os 20 primeiros da fidelidade do seu canal, com tempo
> assistido por pessoa. O serviço usa ela sozinho. O login serve para a
> lista **completa**, que só o dono do canal enxerga.

Painel: **http://127.0.0.1:8790/?canal=tchubi**

## Por que dá para começar sem servidor nenhum

O webhook da Kick entrega **mensagem de chat**. E sniper não escreve no chat
— então essa peça não é a que importa. O que enxerga sniper é **tempo
assistido**, e isso vem do BotRix, lido pela sua própria sessão.

Ou seja: a parte que importa roda 100% na sua máquina.

Medido contra um canal ao vivo em 27/08/2026, 22 minutos:

```
31 pessoas falaram no chat
47 pessoas ganharam tempo assistido
   → 45 dessas 47 NUNCA disseram uma palavra
```

**96% de quem o sensor detectou estava calado.** É exatamente essa a
população que interessa.

## Como saber se está bom

### 1. A conferência automática — 20 segundos

```
npm run conferir
```

Roda o caminho inteiro contra os **seus dados reais** e dá um veredito.
Rodado em 27/08/2026 no seu canal:

```
  ✓ BotRix responde: 20 pessoas, 20 com tempo assistido
      mais assistiu: gabriel_uy_mvd (50 min)
  ✓ Steam entrega histórico de nomes: 10 nomes numa conta de teste
  ✓ Link de perfil vira SteamID
  ✓ O cruzamento acha alguém disfarçado
      "[BR] GABR1EL_UY_MVD" → gabriel_uy_mvd (90%, idêntico tratando leet)
  ✓ Não inventa casamento para quem não está na audiência
  ✓ Grava presença de quem SUBIU o tempo assistido
      2 de 20, sem ninguém falar nada
  ✓ O log mostra entrada e saída, marcado como "calado"
  ✓ Responde "estava na live NAQUELE minuto?"
  ✓ Quem não tem registro fica "sem-registro", nunca "não estava"
  ✓ A resposta mostra presença, nunca acusa
  ○ Sem battlemetricsJogador no config
  ○ Quem assiste DESLOGADO — nenhuma fonte vê. Não existe jeito.

  ESTÁ BOM. 10 checagens passaram, 2 pontos cegos conhecidos.
```

`✓` funciona · `○` ponto cego conhecido · `✗` quebrado.

**Não é `npm test`.** Aquele prova que o código faz o que eu escrevi. Este
prova que o produto responde a sua pergunta, hoje, com a internet e as
contas de verdade.

### 2. O teste ao vivo — 20 minutos, e é o que vale

O único jeito de ter certeza é com uma pessoa de verdade assistindo calada.

1. `npm start`, deixe rodando.
2. Entre ao vivo na Kick.
3. Peça a alguém (ou use outra conta sua, **logada**) para abrir a live e
   **não escrever nada**. Deixe aberta **20 minutos** — o crédito vem em
   blocos de 10 min, então menos que isso pode não aparecer.
4. Abra `http://127.0.0.1:8790/?canal=tchubi`.

**Está bom se:** o nome aparece em *"na sua live agora"* com o selo
**`calado`**, e clicando nele o log mostra o intervalo com
`× tempo assistido` — não `msg`.

**Se não aparecer**, na ordem:
- essa conta chegou a ganhar ponto? Confira o ranking na BotRix.
- passaram 20 minutos de verdade? Menos que um bloco não credita.
- a fidelidade está ligada para essa plataforma na BotRix?

### 3. Se você lembra de uma noite em que foi snipado

Depois de alguns dias gravando, pegue a SteamID de quem você desconfia,
cole na busca com a **hora da morte**, e veja a linha do tempo. Antes de
ter dias de gravação isso não responde nada — é gravação contínua, não
consulta mágica.

## O que roda, e a cada quanto

| | |
|---|---|
| Serviço + painel | na porta 8790, local |
| Agente: servidor do BattleMetrics | a cada 90 s |
| Agente: fidelidade do BotRix | a cada 90 s |
| Crédito de tempo assistido | em blocos de **10 min** (medido) |

Se o navegador travar, o agente volta sozinho e o painel nunca cai — são
processos separados de propósito.

## A resolução, medida

Lendo a cada 5 min, o contador sobe +10 a cada 10 minutos:

```
t+   0s   wt=1080720
t+ 301s   wt=1080730  (+10)
t+ 601s   wt=1080730  (+0)
t+ 902s   wt=1080740  (+10)
t+1202s   wt=1080740  (+0)
t+1503s   wt=1080750  (+10)
```

Então a entrada e a saída ficam com **10 minutos de folga**, não com
precisão de minuto. Em 9 canais reais, 10 min é o padrão e 5 min foi o mais
curto que apareceu (`loud_coringa`). No seu canal você escolhe o intervalo.

## O que ainda não vê

- **Quem assiste deslogado.** Nenhuma fonte vê. Não existe jeito.
- **Chat da Kick.** Precisa de endereço público para o webhook chegar. Fica
  para quando subir num servidor — e, pelo que foi medido acima, não é a
  peça que decide.

## Depois, quando quiser subir

```
node servico/iniciar.js
```
num VPS (~€4/mês), e o agente continua na sua máquina apontando para lá com
`DETETIVE_SERVICO=https://seu-endereco`. Aí entra o webhook da Kick e o bot
do Discord.
