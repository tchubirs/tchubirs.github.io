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
├── servico/                ← O PRODUTO. Roda sozinho, 24h, sem você.
│   ├── servidor.js         ✅ webhook da Kick + /api/consultar, /api/alertas,
│   │                          /api/audiencia, /api/servidor, painel em /
│   ├── banco.js            ✅ SQLite nativo (node:sqlite), zero dependência
│   ├── discord.js          ✅ /detetive <nome>, resposta privada (flags 64)
│   └── web/painel.*        ✅ painel no navegador
│
├── agente/                 ← A ponte com o BattleMetrics
│   ├── ler-pagina.js       ✅ lê pela SUA sessão logada, sem API paga
│   └── agente.js           ✅ acha o servidor atual e manda pro serviço
│
├── peekrust/               ← Encaixe no bot que ele JÁ TEM
│   ├── stream-check.js     ✅ "essa pessoa está assistindo sua live?"
│   ├── construir.js        ✅ gera o pacote ESM a partir de src/
│   ├── anti-sniper.mjs     ✅ GERADO — 1 arquivo, 0 dependências
│   └── COMO-ENCAIXAR.md    ✅ 3 edições nos arquivos dele
│
├── extensao/               ← Alternativa sem servidor, no navegador
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
│   ├── tempo.js            ✅ "22:47" no fuso DELE, não em UTC
│   ├── nomes.js            ✅ cruzamento — a fonte única de verdade
│   ├── indice.js           ✅ 1.500 jogadores × 5.000 espectadores: 147s → 0,09s
│   ├── steam.js            ✅ histórico de nomes (teto de 5) + perfil público
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
└── test/                   ✅ 174 testes
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

## A pergunta é QUANDO, não QUANTO

Ele derrubou a primeira versão em uma frase: *"se eu não sei a hora que
entrou e saiu não funciona — não sei se ele estava na live na hora que me
matou."*

Estava certo. Eu guardava **total assistido**. "Assistiu 20h" não diz nada
sobre o minuto da morte.

Agora o banco guarda **estada**: de quando até quando cada pessoa esteve em
cada lugar, na live e no servidor. Não avistamento solto — intervalo. O
agente lê 1.500 jogadores a cada 90s, e uma linha por leitura seriam 60 mil
linhas por hora.

A resposta tem três estados, e a diferença entre eles importa:

| | Quer dizer |
|---|---|
| **sim** | o instante cai dentro de um intervalo observado |
| **provável** | cai perto da borda — ninguém fecha a live e reabre em 4 min |
| **não visto** | não apareceu por perto. **Não é prova de ausência** |

E o fuso vai escrito junto de propósito. O serviço roda em UTC, ele mora na
França: duas horas de erro trocariam a resposta sem ninguém perceber. O site
manda o instante absoluto (o navegador sabe o fuso); o Discord escreve
`(Europe/Paris)` na resposta, para um fuso errado aparecer na cara.

## Onde o produto é entregue

Três portas para a mesma resposta, porque o momento em que a pergunta aparece
não é o mesmo em que dá para abrir um site:

| Porta | Quando serve |
|---|---|
| Chat de equipe do Rust (via PeekRust + Rust+) | No meio da partida, sem tirar a mão |
| Discord `/detetive` | Depois, com espaço para o porquê |
| Painel web | Para olhar a live inteira de uma vez |

## O encaixe no PeekRust muda o alcance do histórico

O `battlemetrics.js` dele usa
`/players/{id}/relationships/sessions` — que devolve o **histórico completo de
nomes por sessão**, não o teto de 5 nomes da Steam. Eu tinha dado esse caminho
como fechado ("API paga, e os termos proíbem usar num produto pago de
terceiro"). Ele já tinha o token funcionando.

Com isso, `xX_Killer_Xx` no jogo — que não bate com ninguém — vira
`D1per` no histórico, que bate com `diper` na audiência a 90%.

## Próximo passo

Hospedar o serviço num endereço público, para o webhook da Kick chegar. É a
única peça que falta para tudo rodar sozinho.
