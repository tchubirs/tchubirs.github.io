# Como rodar — na sua máquina

```
npm install
npx playwright install chromium
npm start
```

Painel em **http://127.0.0.1:8790/?canal=tchubi**

Na primeira vez ele cria `detetive.config.json` e pede **uma linha**: o seu
número em `battlemetrics.com/players/NUMERO`. O resto vem preenchido.

---

## As três fontes, e a precisão de cada uma

A pergunta é sempre a mesma — *entrou que horas, saiu que horas* — e a
resposta depende de onde o dado vem.

| Fonte | Precisão | Vê quem | Precisa de |
|---|---|---|---|
| **Presença da Kick** | **ao segundo** | quem abre a live | seu login na Kick |
| Tempo assistido (BotRix) | blocos de ~10 min | quem está logado | nada |
| Chat (webhook da Kick) | ao segundo | só quem **escreve** | endereço público |

**Sniper não escreve no chat.** Por isso a terceira linha é a menos útil,
apesar de ser a mais óbvia.

E a segunda não responde "ficou 5 minutos": o crédito vem em blocos, então
uma visita de 5 min vira 0 ou vira 10. Não é imprecisão do código — é a
resolução da fonte.

## Ao segundo — `npm run presenca`

```
npm run presenca
```

```
  00:10:03  conectado — 7 pessoa(s) já dentro

  00:12:41  ENTROU  dilanzito     (8 dentro)
  00:14:41  saiu    dilanzito     (7 dentro)
```

Depois:

```
npm run presenca -- --ver
```

```
  dilanzito
    29/08  entrou 00:10:03   saiu 00:14:41   4min 38s
    29/08  entrou 01:10:03   saiu 01:10:45   42s

  hai_suzy
    29/08  entrou 00:25:03   AINDA DENTRO
```

**Como funciona:** o chat da Kick roda em Pusher, e existe um canal de
*presenca* que avisa cada entrada e saída no instante em que acontecem.
Medido em 28/08/2026: assinar sem credencial responde **"Auth info required
to subscribe"** — o canal existe —, e `kick.com/broadcasting/auth` responde
401, ou seja, autoriza com sessão válida.

A autorização sai de **dentro da página** no navegador do agente, então
sessão e CSRF vão junto sem ninguém copiar cookie para lugar nenhum.

**O que ainda não foi verificado:** se o canal lista **todos** os
espectadores ou só um subconjunto. Só dá para saber com o seu login. Rode
uma vez e compare quantos aparecem em "já dentro" com o número de viewers
na tela — se bater, é todo mundo.

## Sem login — `npm run gravar`

```
npm run gravar     fica lendo o tempo assistido da BotRix
npm run visitas    mostra o que gravou
```

Blocos de ~10 min. Serve para acumular histórico sem depender de nada.

## Conferir se está tudo de pé

```
npm run conferir
```

Roda o caminho inteiro contra os seus dados reais e dá um veredito:
`✓` funciona · `○` ponto cego conhecido · `✗` quebrado.

```
npm run fontes     quais plataformas suas têm dado na BotRix
```

## Quem é a pessoa

Dois caminhos, e nenhum sozinho resolve — medido nos seus dois casos:

```
dilanzito   nome na Steam "DiLANZiTO" → bate direto       OK
            URL personalizada "8888888899977" → lixo      não

Tchubita    nome na Steam "Tchubita" → não bate           não
            URL personalizada "haisuzy" → é a conta dela  OK
```

Por isso o serviço faz os dois: cruza o nome de exibição e o histórico, **e**
testa o apelido de cada espectador como URL personalizada da Steam.

## O que continua invisível

- **Quem assiste deslogado.** Nenhuma fonte vê. Não existe jeito.
- **Nomes antigos.** A Steam entrega 1 nome de perfil privado; um
  concorrente tem 32 da mesma conta porque grava há anos. A partir de agora
  nós gravamos também — mas só começa a valer com o tempo.
