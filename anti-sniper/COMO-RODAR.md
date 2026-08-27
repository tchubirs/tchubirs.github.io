# Como rodar — o ciclo automático

Três peças. Você mexe uma vez em cada e nunca mais.

```
  Kick  ──webhook──▶  SERVIÇO  ◀──lista do servidor──  AGENTE (seu PC)
                         │
                         └──▶  bot do Discord  /detetive <nome>
                         └──▶  alertas sozinho, sem ninguém perguntar
```

## 1. O serviço

```
node servico/iniciar.js
```
Recebe os webhooks da Kick e responde as consultas. Precisa de um endereço
público para a Kick alcançar (VPS de €4/mês serve, ou um túnel).

## 2. O agente, no seu PC

```
DETETIVE_JOGADOR=<seu id no BattleMetrics> \
DETETIVE_CANAL=<id do canal no serviço> \
DETETIVE_SERVICO=https://seu-servico \
node agente/agente.js
```

Na primeira vez, rode com `DETETIVE_VISIVEL=1` e faça login no BattleMetrics.
**A sessão fica salva em `~/.detetive-navegador` e não pede de novo.**

A cada 90 segundos ele: abre seu perfil → vê em que servidor você está →
abre a página daquele servidor → lê a lista → manda para o serviço.

Por que na sua máquina e não no meu servidor: é a **sua sessão** lendo a
**sua tela**. Ninguém está redistribuindo dado de terceiro, e é isso que
mantém o produto limpo.

## 3. O bot do Discord

Registre o comando e aponte o endpoint de interação para
`https://seu-servico/discord`.

```
/detetive FINIK
```

## O que acontece sem você fazer nada

Enquanto você joga e transmite:

- cada mensagem no seu chat vira presença gravada — **automático**
- a cada 90 s o agente atualiza quem está no servidor — **automático**
- o serviço cruza os dois e produz alertas — **automático**

Você só olha quando quiser, ou pergunta um nome no Discord.

## Limites, escritos para não virar surpresa

- **A2S não serve.** Testado: ou o servidor censura a lista, ou devolve
  nomes falsos. A lista real só existe no BattleMetrics.
- **Sniper que usa nome diferente nos dois lados não é pego.** Nenhuma
  ferramenta pega. O que se pega é o descuidado — e é a maioria.
- **"Não encontrado" nunca significa inocente.** A resposta diz isso.
- **Nunca é dito que alguém "é sniper".** Só que esteve na sua live.
  Assistir não é crime; quem julga o contexto é quem jogou a partida.
