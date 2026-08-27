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
├── extensao/               ← O PRODUTO. Automático, sem colar nada.
│   ├── manifest.json       ✅ só 2 sites, só permissão de storage
│   ├── comum.js            ✅ lê tabela por CABEÇALHO, não por classe CSS
│   ├── ler-battlemetrics.js ✅ pega a lista do servidor que você já abriu
│   ├── ler-botrix.js       ✅ pega a audiência, acumulando entre páginas
│   ├── painel.html/.js     ✅ cruza tudo sozinho e mostra
│   ├── construir.js        ✅ gera nomes.js a partir de src/
│   └── nomes.js            ✅ GERADO — nunca editar à mão
│
├── src/
│   ├── unicode.js          ✅ dobras seguras (𝚊𝚛𝚒𝚗 → arin)
│   ├── nomes.js            ✅ cruzamento — a fonte única de verdade
│   ├── steam.js            ✅ histórico de nomes (teto de 5)
│   ├── consulta.js         ✅ SteamID → evidência
│   ├── vigia.js            ✅ modo ao vivo
│   ├── jogo/
│   │   ├── fonte.js        ✅ contrato
│   │   └── rust-a2s.js     ⚠️  feito, mas A2S não serve pro Rust
│   └── stream/
│       ├── fonte.js        ✅ contrato
│       ├── kick.js         ✅ app próprio, 2 escopos, token 60d
│       ├── botrix.js       ✅ lê tabela colada (o modo manual)
│       └── streamelements.js ✅
│
├── bin/                    ✅ consulta, autorização, teste de servidor
└── test/                   ✅ 91 testes
```

## Por que extensão, e não copiar e colar

Colar tabela é demonstração, não produto. Ninguém copia duas tabelas no meio
de uma raid.

A extensão lê **as páginas que você já tem abertas e logadas**. Não consulta
a API do BattleMetrics e não redistribui nada — é a sua tela, que só você vê.
Ela apenas evita o copiar e colar. É o mesmo padrão que o concorrente já usa:
o RustWho vende "Extension paid features".

## Duas decisões que sustentam a extensão

**Lê por cabeçalho, nunca por classe de CSS.** Um seletor tipo `.sc-hKgILt`
quebra sozinho no próximo deploy do site, e o usuário só descobre quando a
ferramenta silenciosamente para de achar gente. Procurar pela coluna
("Name", "Play time") aguenta redesign, porque o texto do cabeçalho é o que o
site precisa manter legível para o próprio usuário.

**O código do navegador é GERADO a partir de `src/`.** Ter duas versões do
cruzamento — uma testada e outra em uso — é a pior falha possível aqui: os
testes continuariam verdes enquanto o usuário usa outra regra. Um teste roda
o gerador e falha se o pacote estiver velho.

## Dado velho aparece como velho

Passados 15 minutos, o painel marca a fonte em laranja. Acusar alguém com
informação de ontem é o erro mais fácil de cometer e o mais difícil de
perceber.


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
