# Encaixar o anti-sniper no PeekRust

O `/peek` responde **quem é esse jogador**. Falta a pergunta que interessa no
meio da partida: **e ele está assistindo a sua live agora?**

São 3 edições nos arquivos que você já tem, mais 1 arquivo copiado.

---

## 1. Copiar o arquivo

```bash
cp anti-sniper/peekrust/anti-sniper.mjs  PeekRust/services/anti-sniper.mjs
```

Um arquivo, zero dependências, ESM igual ao resto do projeto. **Não edite ele**
— é gerado por `node peekrust/construir.js` a partir de `src/`. Editar à mão
cria uma segunda versão do cruzamento de nomes, e os testes deixam de valer.

## 2. `.env` — duas linhas

```
ANTISNIPER_URL=https://seu-servico
ANTISNIPER_CANAL=tchubi
```

## 3. `services/player-lookup.js`

```diff
 import { getSteamProfile, getRustHours, getSteamBans, getSteamLevel } from './steam.js';
-import { getBattleMetricsPlayer, getPlayerServerHours } from './battlemetrics.js';
+import { getBattleMetricsPlayer, getPlayerServerHours, getPlayerNameHistory } from './battlemetrics.js';
+import { criarVerificador, audienciaDoServico } from './anti-sniper.mjs';
+
+// Uma instância só: ela guarda o índice da audiência em cache por 5 min.
+// Criar dentro da função jogaria o cache fora a cada /peek.
+const verificarLive = process.env.ANTISNIPER_URL
+  ? criarVerificador({
+      nomesDoJogador: getPlayerNameHistory,
+      audiencia: audienciaDoServico(process.env.ANTISNIPER_URL, process.env.ANTISNIPER_CANAL),
+    })
+  : null;

 export async function lookupPlayer(steamId) {
   ...
   if (!steam) return null;

-  const categoryHours = bm?.id ? await loadCategoryHours(bm.id) : null;
+  // Em paralelo: as horas por categoria e a checagem da live não dependem
+  // uma da outra, e o chat do jogo não espera duas idas em fila.
+  const [categoryHours, live] = await Promise.all([
+    bm?.id ? loadCategoryHours(bm.id) : null,
+    verificarLive && bm?.id ? verificarLive(bm.id, steam.name) : null,
+  ]);

   return {
     name: steam.name,
     ...
     steamLevel: level,
+    live,
   };
 }
```

`verificarLive(bm.id, ...)` recebe o **id do BattleMetrics**, não a SteamID —
é o que `getPlayerNameHistory` espera.

## 4. `services/chat-formatter.js`

```diff
+import { pedacoParaChat } from './anti-sniper.mjs';
+
 export function formatPlayerResponse(player) {
   const parts = [truncateName(player.name)];

+  // Logo depois do nome, de propósito: composeMessage corta em 120 e este
+  // é o campo que não pode ser o cortado.
+  const live = pedacoParaChat(player.live);
+  if (live) parts.push(live);
+
   parts.push(formatRustHours(player));
```

Sai assim no chat de equipe:

```
xX_Killer_Xx | LIVE 5h! | Rust 4200h | AIM 380h | BUILD 12h | BANS 0 | LVL 42
```

## 5. Discord (opcional)

Em `commands/peek.js`, para a versão com o motivo:

```js
import { textoLongo } from '../services/anti-sniper.mjs';
const linha = textoLongo(player.live);   // null quando não há nada a dizer
```

```
🔴 Esteve na sua live como **diper** — 5h12 assistidos (90%, por nome antigo "D1per").
```

---

## O que cada resposta quer dizer

| No chat | Estado | Significa |
|---|---|---|
| `LIVE 20h!` | `assistindo` | Um dos nomes dessa conta esteve na sua live 20h |
| `LIVE ?` | `nao-encontrado` | Nenhum dos nomes bateu. **Não inocenta** |
| *(nada)* | `sem-audiencia` | Você ainda não gravou audiência nenhuma |
| *(nada)* | `indisponivel` | Serviço fora do ar — o resto do `/peek` continua valendo |

Nunca sai "é sniper". Sai "esteve na sua live", que é o que o dado sustenta.

## Por que o histórico é o produto

`xX_Killer_Xx` no jogo não bate com ninguém no chat. Mas
`getPlayerNameHistory` devolve as sessões inteiras do BattleMetrics, e lá está
`D1per` — que bate com `diper` na sua audiência, com 90% (leet `1`→`i`).

Ninguém usa o mesmo nome nos dois lados. **Basta um dos nomes antigos bater**,
e é por isso que a Steam sozinha não serve: ela devolve no máximo 5 nomes.
