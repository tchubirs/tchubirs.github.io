# Como rodar — na sua máquina, agora

Um comando. Sem VPS, sem endereço público, sem webhook.

```
npm install
npx playwright install chromium
npm start
```

Na primeira vez ele cria `detetive.config.json` e pede duas linhas:

```json
{
  "canal": "tchubi",
  "fuso": "Europe/Paris",
  "battlemetricsJogador": "",   ← o número em battlemetrics.com/players/NUMERO
  "botrixFidelidade": "https://botrix.live/panel/loyalty"   ← já vem preenchido
}
```

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
