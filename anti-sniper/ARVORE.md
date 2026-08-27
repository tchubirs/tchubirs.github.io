# A árvore do projeto

```
anti-sniper/
│
├── src/
│   ├── nomes.js            ✅ cruza nome do jogo com nome do chat
│   ├── vigia.js            ✅ decide e dispara o alerta, na hora
│   │
│   ├── jogo/               ← A PORTA DOS OUTROS JOGOS
│   │   ├── fonte.js        ✅ contrato: devolve [{nome, id?, entrouHa?}]
│   │   ├── rust-a2s.js     ⬜ consulta pública UDP, sem senha    ← próximo
│   │   ├── rust-rcon.js    ⬜ WebSocket, precisa ser admin
│   │   └── (outro-jogo.js) ⬜ um arquivo por jogo, e nada mais muda
│   │
│   ├── stream/             ← A PORTA DAS OUTRAS PLATAFORMAS
│   │   ├── fonte.js        ✅ contrato: devolve [{nome, id?}]
│   │   ├── twitch.js       ⬜ Get Chatters + EventSub stream.online
│   │   ├── kick.js         ⬜ webhooks (chat.message, livestream.status)
│   │   └── youtube.js      ⬜ liveChatMessages
│   │
│   ├── overlay/            ← COMO VOCÊ VÊ, DENTRO DO JOGO
│   │   ├── servidor.js     ⬜ HTTP + WebSocket local
│   │   └── pagina.html     ⬜ fonte de navegador do OBS
│   │
│   ├── laco.js             ⬜ o laço: pergunta às fontes, alimenta o vigia
│   └── config.js           ⬜ qual servidor, qual canal, quais limites
│
├── bin/
│   └── anti-sniper.js      ⬜ o executável que o streamer roda
│
└── test/
    └── vigia.test.js       ✅ 16 testes
```

## As duas decisões que a árvore toma

### 1. Duas portas, e só duas

`src/jogo/` e `src/stream/` existem para uma coisa: **jogo novo é um arquivo
novo, plataforma nova é um arquivo novo, e nada mais no projeto muda.**

Sem isso, "migrar para todos os jogos" vira reescrever tudo a cada jogo. Com
isso, o `vigia.js` nunca fica sabendo se é Rust ou outra coisa.

### 2. Fonte declara o que consegue entregar

Nem toda fonte dá o mesmo. A consulta pública provavelmente dá só **nome**;
o RCON dá **nome, id, tempo de conexão e posição**.

Então cada fonte declara suas capacidades — `NOMES`, `IDENTIDADE`, `ENTRADA`,
`POSICAO` — e o vigia liga só os sinais que a fonte sustenta. Sem isso, o
sinal "entrou logo depois de você" falharia calado com uma fonte que não sabe
horário de entrada. **Melhor dizer "esse sinal está desligado porque sua fonte
não dá o dado" do que não alertar e o streamer achar que está protegido.**

## Por que o overlay é peça de primeira, não enfeite

Sniper se pega no ato. Se o alerta aparece numa janela atrás do jogo, chegou
tarde. Tem que aparecer **por cima do jogo**, onde o olho já está.

O jeito que streamer entende: **fonte de navegador do OBS**. Ele cola uma URL
e pronto — sem instalar, sem configurar, sem ser programador. Por isso o
overlay é um servidor HTTP local que serve uma página, e não uma janela de
aplicativo.

## Ordem de construção

| # | O quê | Por quê nessa ordem |
|---|---|---|
| 1 | `rust-a2s.js` | **decide o produto**: se a consulta pública devolver nomes, qualquer streamer usa sem precisar do dono do servidor. Se não devolver, só serve para quem tem RCON, e o cliente muda |
| 2 | `twitch.js` | o outro lado do cruzamento |
| 3 | `laco.js` + `overlay/` | vira produto que dá para usar |
| 4 | `kick.js` | a plataforma onde ele está agora |
| 5 | `rust-rcon.js` | sinais melhores para quem tem servidor |
| 6 | `youtube.js` | por último |

**O passo 1 é um teste de 30 minutos e ninguém fez.** É a coisa mais barata
que existe capaz de mudar o produto inteiro — precisa só do IP e da porta de
um servidor de Rust.
