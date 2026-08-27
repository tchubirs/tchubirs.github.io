# A árvore do projeto

> **Corrigida em 27/08/2026.** A primeira versão punha RCON no centro e
> desenhava um monitor preso a um servidor. Ele derrubou: *"rust rcon esquece
> isso, é pra todos os servidores no geral, não é pra ver dentro do jogo e em
> nenhum local, é pra pesquisar — ex: desconfiei de alguém, pego a steam id da
> pessoa e verifico se é ou não sniper."*
>
> Isso muda o produto de **monitor** para **consulta**, e o efeito é enorme:
> com RCON, só servia para quem tem servidor próprio. Sem RCON, serve para
> qualquer streamer, em qualquer servidor, sem pedir nada a ninguém.

```
anti-sniper/
│
├── src/
│   ├── unicode.js          ✅ dobra letra disfarçada de volta ao alfabeto
│   ├── nomes.js            ✅ cruza histórico de nomes com nome de chat
│   ├── steam.js            ✅ histórico de nomes, do perfil público
│   ├── consulta.js         ✅ SteamID entra, evidência sai   ← O PRODUTO
│   │
│   ├── stream/             ← de onde vem "quem assistiu"
│   │   ├── fonte.js        ✅ contrato
│   │   ├── twitch.js       ⬜ Get Chatters + histórico
│   │   ├── streamelements.js ⬜ tempo assistido que ELE JÁ TEM guardado
│   │   ├── kick.js         ⬜
│   │   └── youtube.js      ⬜
│   │
│   ├── vigia.js            ✅ modo ao vivo — depende de fonte do jogo,
│   │                          que hoje não existe sem RCON. Fica guardado.
│   ├── jogo/fonte.js       ✅ contrato, para quando existir
│   │
│   ├── overlay/            ⬜ como aparece na hora da suspeita
│   └── config.js           ⬜
│
├── bin/anti-sniper.js      ⬜ o que ele roda
└── test/                   ✅ 31 testes
```

## Por que o histórico de nomes é a peça central

**Ninguém usa o mesmo nome na Steam e na Twitch.** Comparar o nome de hoje
acha quase nada — e foi o erro da primeira versão.

Mas a Steam guarda todos os nomes anteriores, em endereço público:

```
https://steamcommunity.com/profiles/STEAMID64/ajaxaliases
```

Sem login, sem chave. **Basta UM desses nomes bater.**

E o dado real mostrou o problema que ninguém teria previsto. Um perfil de
verdade tinha estes quatro nomes, trocados em dois minutos:

```
arin        🇦 🇷 🇮 🇳        ᴀʀɪɴ        𝚊𝚛𝚒𝚗
```

**São o mesmo nome para um humano e bytes sem nada em comum para um
computador.** É exatamente o que alguém faz para não ser achado. Por isso
`unicode.js` existe e vem antes de tudo: dobra matemáticos, versalete,
largura inteira, cercados, bandeiras, e cirílico disfarçado de latino
(`ѕniрer` → `sniper`).

Sem essa camada o normalizador apagava esses nomes e sobrava string vazia —
o pior resultado possível: não casava e não avisava que não tinha casado.

## Escopo, e por que ele para aqui

**Só perfil público da Steam + audiência do próprio canal dele.**

Nada de Discord, Twitter, e-mail ou IP. Além de ser o art. 226-18 do código
penal francês (5 anos, 300 mil euros, e pune a COLETA, não só a divulgação),
**não é necessário**: a pergunta "essa pessoa estava me assistindo?" se
responde inteira com esses dois dados.

## A conclusão nunca é "é sniper"

A ferramenta diz **"esteve na sua live"** e mostra qual nome bateu. Assistir
não é crime, e quem julga o contexto é quem jogou a partida.

Existe um teste que verifica isso: a saída não pode conter as palavras
*sniper*, *culpado* ou *banir*.

## Próximo passo

`streamelements.js` — porque ele **já usa StreamElements nos três canais**, e
isso significa que **meses de tempo assistido por pessoa já estão guardados**.
Dá para testar a tese contra uma noite passada em que ele sabe que foi
snipado, sem esperar dado novo.
