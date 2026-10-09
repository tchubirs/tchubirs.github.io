# Backend do Povix: recomendação

## Resposta

Escolha o **Cloudflare Pages**, publicado pelo **GitHub Actions**, com uma função de contagem e um banco D1. São quatro peças, todas com plano grátis, e só o domínio custa dinheiro: cerca de 9 euros no primeiro ano. Não há servidor para o dono manter.

Uma ressalva antes de tudo: o pedido 2 depende de a Kick responder ao GitHub. Isso não está medido. Se ela bloquear, não há saída garantida dentro das regras do dono; a saída que resolve é a autorização escrita da Kick (ver Riscos). Os pedidos 1 e 3 não dependem disso.

Por que não menos: sem a função e o banco não há como contar clipes. Por que não mais: não há fila, cache próprio, login nem painel. Cada peça tirada quebra um dos três pedidos.

| Pedido do evento | Peça que resolve |
|---|---|
| 1. Endereço próprio, https, cabeçalhos de `site/_headers` | Cloudflare Pages lê o `_headers` que já existe |
| 2. Lista do evento pronta em um arquivo | Uma tarefa do GitHub Actions a cada 10 minutos gera `dados/vods.json` e publica |
| 3. Contar clipes e aberturas sem guardar vídeo | Uma função `/api/n` soma um número por dia no D1; o dono lê com uma consulta pronta |

## Como fica montado

1. **Hoje:** cada navegador pede ao `kick.com` a lista de VODs de cada canal. Com 500 canais, cada pessoa faz 500 pedidos.
2. **Depois:** o Actions pede à Kick uma vez por rodada, grava um arquivo único e o publica junto com o site. A página lê `/dados/vods.json`. Para um canal que está no arquivo, ela não pergunta à Kick.
3. **Vídeo:** continua indo do servidor de vídeo da Kick direto para o navegador. Nada de vídeo passa por nós.
4. **Sem o arquivo:** se ele faltar ou tiver mais de 3 horas, a página volta a perguntar à Kick, como hoje. O pior caso é o presente, não uma página quebrada.
5. **Quem entra no ar depois:** o arquivo responde a cada canal uma vez por sessão. O pedido repetido de 2 em 2 minutos (ABISAL.md, item 6) vai à Kick, como hoje, só para os canais ainda sem VOD (no máximo 25 por vez). Assim o streamer que começa a live 1 minuto depois da rodada aparece sozinho.

A mudança no código existente é pequena (menos de dez linhas). O `kick.js` e o `carregar.js` não mudam. A página apenas troca o `fetch` que entrega ao evento por um que olha primeiro o arquivo.

## Código

### `kick-sync/site/lista.js` (novo)

```js
// Serve a lista de VODs a partir do arquivo do evento; o que não está nele vai à Kick.
// Cada canal sai do arquivo uma vez por sessão. O pedido repetido (quem ainda não entrou no ar) vai à Kick.
const idadeMaxMs = 3 * 3600 * 1000;
const recargaMs = 2 * 60 * 1000;

export function buscarComLista(buscar = fetch) {
  let carga = null;
  let quando = 0;
  const servidos = new Set();
  const lista = () => {
    if (carga && Date.now() - quando < recargaMs) return carga;
    quando = Date.now();
    carga = (async () => {
      try {
        const r = await buscar(new URL('dados/vods.json', location.href), { cache: 'no-cache' });
        if (!r.ok) return null;
        const j = await r.json();
        return j && Date.now() - j.geradoEm < idadeMaxMs ? j : null;
      } catch { return null; }
    })();
    return carga;
  };
  return async (url, ...resto) => {
    const m = /^https:\/\/kick\.com\/api\/v2\/channels\/([^/?]+)\/videos$/.exec(String(url));
    if (m) {
      let c = null;
      try { c = (await lista())?.canais?.[decodeURIComponent(m[1]).toLowerCase()]; } catch { /* nome estragado */ }
      if (c && !servidos.has(m[1])) {
        servidos.add(m[1]);
        return c.status === 200
          ? new Response(JSON.stringify(c.v), { status: 200 })
          : new Response('', { status: c.status });
      }
    }
    return buscar(url, ...resto);
  };
}
```

### `kick-sync/site/registrar.js` (novo)

```js
// Conta sem identificar ninguém: só o tipo e uma quantidade. Nada de cookie, nome, evento ou endereço de rede.
// Um pedido na abertura e um com a soma dos downloads de clipe da sessão (em blocos de 50, o teto da função).
// Fora de um navegador (testes em Node) não há `location`: a conta fica desligada, sem erro.
const local = (() => {
  try { return /^(localhost|127\.|\[::1\])/.test(location.hostname); } catch { return true; }
})();
let clipes = 0;
function enviar(corpo) {
  if (local) return;
  try {
    fetch('/api/n', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    }).catch(() => {});
  } catch { /* contar nunca atrapalha o uso */ }
}
// Chamar só quando o elenco vem do link do evento, não do exemplo nem de texto colado.
export function registrarAbertura() {
  try { if (sessionStorage.getItem('povix.n')) return; sessionStorage.setItem('povix.n', '1'); } catch { /* segue */ }
  enviar({ t: 'abertura', n: 1 });
}
export function registrarClipe() { clipes++; }
// A soma sai quando a aba some ou fica escondida. O que sobra no celular que mata a aba se perde: a contagem de clipes é para baixo.
try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    while (clipes > 0) {
      const n = Math.min(clipes, 50);
      enviar({ t: 'clipe', n });
      clipes -= n;
    }
  });
} catch { /* sem document, sem contagem */ }
```

O piloto é um evento só. Por isso a contagem não separa eventos: tudo que chega ao endereço publicado durante o piloto é do piloto. O elenco que o Povix lê (`lerElenco`, `descodificar`) não traz o nome do evento, só `times` e `soltos`, então não dá para ler "abisal" dele. Se vier um segundo evento, separe por um parâmetro no endereço da página de cada evento.

### Ligações no código atual

Os números de linha mudam a cada commit. Use as linhas âncora abaixo, que são únicas no arquivo.

- `site/app.js`: importar `buscarComLista` e `registrarClipe`. Na linha `const evento = montarEvento({`, acrescentar `buscar: buscarComLista(),` como primeira propriedade do objeto.
- `site/evento-ui.js`: acrescentar `import { registrarAbertura } from './registrar.js';` junto dos outros `import` do topo. Em `abrirDoLink`, depois da linha `await abrirElenco(elenco, { quandoMs: tq ? Number(tq[1]) : null });`, acrescentar `try { registrarAbertura(); } catch { /* contar nunca atrapalha */ }`. Não ponha em `abrirElenco`: ela também serve ao botão de exemplo e ao texto colado, que não são visitas ao evento. Sem o `import` a chamada dá ReferenceError e o mapa não pinta.
- `site/app.js`, três downloads de clipe. Cada um é o bloco `a.href = url; a.download = nome; a.click();`, e os três são iguais. Acrescente `registrarClipe();` logo depois do `a.click()` que é seguido por: (a) `t('retrato.pronto')`; (b) `t('angulos.pronto')`; (c) `c.pararExportar = null;`. Confira com `grep -n "a.click()" site/app.js`: devem ser 3, e os 3 com `registrarClipe();` na linha seguinte. Um esquecido subconta clipes sem erro visível. O que se conta é download de clipe, não clipe único: quem baixa duas vezes conta duas.

A política de segurança já permite tudo isso: `connect-src 'self'`.

### `kick-sync/gerar-lista.mjs` (novo)

```js
// Gera dados/vods.json: todos os vídeos que a Kick devolve para cada canal dos arquivos eventos/*.txt, em um arquivo só.
// Sem corte por data: a página recebe a mesma lista que receberia da Kick, só com menos campos.
// Sem login e sem truque: um pedido por canal, com nome claro, e para se a Kick fechar a porta.
import fs from 'node:fs';
import path from 'node:path';
import { lerElenco } from './site/elenco.js';
import { slugDoNome } from './site/kick.js';

const saida = process.argv[2];
const pasta = new URL('./eventos/', import.meta.url);
const arquivos = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((f) => f.endsWith('.txt')) : [];
const canais = new Set();
for (const f of arquivos) {
  const e = lerElenco(fs.readFileSync(new URL(f, pasta), 'utf8'));
  for (const c of [...e.times.flatMap((t) => t.canais), ...e.soltos]) canais.add(slugDoNome(c));
}
if (!canais.size) { console.log('nenhum evento em eventos/, nada a gerar'); process.exit(0); }

const campos = (v) => ({
  id: v.id, session_title: v.session_title, start_time: v.start_time, duration: v.duration,
  is_live: v.is_live, source: v.source,
  video: { is_private: v.video?.is_private, is_pruned: v.video?.is_pruned, deleted_at: v.video?.deleted_at },
});
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
let bloqueios = 0;

async function um(slug) {
  for (let i = 0; i < 3; i++) {
    let r;
    try {
      r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/videos`, {
        headers: { 'user-agent': 'PovixLista/1 (+https://github.com/tchubirs/tchubirs.github.io)', accept: 'application/json' },
      });
    } catch { await dormir(2000 * 2 ** i); continue; }
    if (r.status === 404 || r.status === 400 || r.status === 410) return { status: r.status };
    if (r.status === 429 || r.status >= 500) { await dormir(2000 * 2 ** i); continue; }
    if (r.status === 401 || r.status === 403) { bloqueios++; return null; }
    if (!r.ok) return null;
    let l;
    try { l = await r.json(); } catch { return null; }
    if (!Array.isArray(l)) return null;
    return { status: 200, v: l.map(campos) };
  }
  return null;
}

const fila = [...canais];
const out = {};
let i = 0;
let falhas = 0;
const fora = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < fila.length && bloqueios < 5) {
    const slug = fila[i++];
    const r = await um(slug);
    if (r) out[slug] = r; else { falhas++; fora.push(slug); }
  }
}));

if (bloqueios >= 5 || falhas > fila.length * 0.1) {
  console.error(`falhou: ${falhas} de ${fila.length} canais, ${bloqueios} bloqueios. Nada foi gerado.`);
  console.error(`fora: ${fora.join(', ')}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify({ geradoEm: Date.now(), canais: out }));
console.log(`ok: ${Object.keys(out).length} de ${fila.length} canais; ${falhas} ficam para a página pedir à Kick`);
if (fora.length) console.log(`fora do arquivo: ${fora.join(', ')}`);
```

Sem corte por data, o arquivo tem o mesmo conjunto de vídeos que a Kick devolveria a cada navegador, só com menos campos (cerca de 250 bytes por vídeo; 500 canais com 20 vídeos dão perto de 2,5 megabytes, comprimidos bem menos, e arquivo estático da Cloudflare não tem limite de banda). Um canal que falhou fica fora do arquivo, e a página o pede à Kick. Depois de 5 respostas 403 ou 401, a rodada inteira para: não se insiste e não se disfarça.

### `kick-sync/functions/api/n.js` (novo)

```js
const tipos = new Set(['abertura', 'clipe']);

export async function onRequestPost({ request, env }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 });
  let c;
  try {
    const texto = await request.text();
    if (texto.length > 100) return new Response(null, { status: 413 });
    c = JSON.parse(texto);
  } catch { return new Response(null, { status: 400 }); }
  if (!tipos.has(c?.t) || !Number.isInteger(c?.n) || c.n < 1 || c.n > 50) return new Response(null, { status: 400 });
  const dia = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    'insert into contagem(dia, tipo, n) values(?, ?, ?) on conflict(dia, tipo) do update set n = n + excluded.n',
  ).bind(dia, c.t, c.n).run();
  return new Response(null, { status: 204 });
}
```

Não há rota de leitura: os totais não ficam públicos. O dono lê no Console do D1 (ver abaixo). A checagem de `origin` só barra o uso a partir de outras páginas. Quem usa `curl` a falsifica. Ela não é defesa (ver Riscos, "Abuso da contagem").

### `kick-sync/functions/schema.sql` (novo)

```sql
create table if not exists contagem (
  dia text not null, tipo text not null, n integer not null,
  primary key (dia, tipo)
) without rowid;
```

Consulta do relatório, para colar no Console do D1 (troque as datas pelas do evento):

```sql
select tipo, sum(n) as total from contagem
where dia between '2026-11-01' and '2026-11-03' group by tipo;
select dia, tipo, n from contagem order by dia, tipo;
```

### `kick-sync/site/abisal/index.html` (novo, a página do evento)

Substitua `CODIGO` pelo que o botão "Partilhar evento" gera quando o elenco real está aberto.

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abisal no Povix</title>
<meta http-equiv="refresh" content="0; url=/#evento=CODIGO">
</head><body><p><a href="/#evento=CODIGO">Abrir o mapa do Abisal</a></p></body></html>
```

Uma linha nova no `publicar.sh`, depois da cópia do `_headers`:

```bash
mkdir -p "$DESTINO/abisal" && cp site/abisal/index.html "$DESTINO/abisal/"
```

### `site/_headers`: acrescentar no fim

A política (CSP) hoje só existe em `/` e `/index.html`. A página `/abisal/` seria divulgada sem ela e poderia ser posta em iframe. Copie a linha `Content-Security-Policy: ...` inteira do bloco `/index.html` para dois blocos novos:

```
/abisal/
  Content-Security-Policy: <a mesma linha de /index.html>

/abisal/index.html
  Content-Security-Policy: <a mesma linha de /index.html>

/dados/*
  Cache-Control: public, max-age=60
```

O `meta refresh` da página não é barrado por essa política.

### `kick-sync/eventos/abisal.txt` (novo)

A lista de canais do evento, no formato que o Povix já lê (um time por linha, ou a página de times colada). São nomes de canal públicos, sem dados de quem usa o Povix. O arquivo ainda não existe no repositório. Quem fornece a lista é a organização do Abisal (a página de times). Sem ela o gerador sai com "nada a gerar" e a página segue pedindo à Kick.

### `.github/workflows/povix.yml` (novo)

```yaml
name: povix-no-ar
on:
  push:
    branches: [main]
    paths: ['kick-sync/site/**', 'kick-sync/functions/**', 'kick-sync/eventos/**',
            'kick-sync/gerar-lista.mjs', 'kick-sync/publicar.sh', '.github/workflows/povix.yml']
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch:
concurrency:
  group: povix-no-ar
  cancel-in-progress: false
permissions:
  contents: read
jobs:
  publicar:
    # A rodada agendada só roda enquanto a variável EVENTO_ATIVO for "sim".
    if: github.event_name != 'schedule' || vars.EVENTO_ATIVO == 'sim'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: kick-sync
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      PROJETO: ${{ vars.PROJETO_PAGES || 'povix' }}
      POVIX_URL: ${{ vars.POVIX_URL }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
      - run: ./publicar.sh dist
      # A lista que está no ar entra primeiro em dist. Se a rodada falhar, ela segue lá (um push comum não a apaga).
      - run: |
          mkdir -p dist/dados
          if [ -n "$POVIX_URL" ]; then curl -fsS "$POVIX_URL/dados/vods.json" -o dist/dados/vods.json || rm -f dist/dados/vods.json; fi
      - id: lista
        continue-on-error: true
        run: node gerar-lista.mjs dist/dados/vods.json
      # Em rodada agendada, se a lista falhou, não se publica. Em push, publica-se com a lista anterior baixada acima (a página ignora a de mais de 3 h).
      - if: steps.lista.outcome == 'success' || github.event_name != 'schedule'
        run: |
          npx --yes wrangler@4 pages project list | grep -qw "$PROJETO" || npx --yes wrangler@4 pages project create "$PROJETO" --production-branch=main
          npx --yes wrangler@4 pages deploy dist --project-name="$PROJETO" --branch=main
      # Se a lista falhou, o fluxo termina em vermelho de propósito: o GitHub avisa por e-mail.
      - if: always() && steps.lista.outcome == 'failure'
        run: |
          echo "A lista de VODs falhou nesta rodada. Veja o passo 'lista'."
          exit 1
```

O nome do projeto na Cloudflare é único na plataforma. Se `povix` estiver tomado, a criação falha e o fluxo fica vermelho; defina a variável `PROJETO_PAGES` com outro nome e rode de novo. Depois da primeira publicação que funcionar, troque `wrangler@4` pela versão exata que rodou. O `functions/` é lido da pasta `kick-sync`, onde o comando roda.

## Custo por mês

| Item | Custo | Limite do plano grátis | Fonte |
|---|---|---|---|
| Cloudflare Pages, arquivos estáticos | 0 | Pedidos e banda de arquivos estáticos grátis e sem limite; 20.000 arquivos; 25 mebibytes por arquivo | [limites do Pages](https://developers.cloudflare.com/pages/platform/limits/), [preço das funções](https://developers.cloudflare.com/pages/functions/pricing/) |
| Função `/api/n` | 0 | 100.000 pedidos por dia, somados com os de outros Workers da conta | [preço das funções](https://developers.cloudflare.com/pages/functions/pricing/), [limites dos Workers](https://developers.cloudflare.com/workers/platform/limits/) |
| D1 | 0 | 100.000 linhas escritas por dia, 5 milhões lidas, 5 gigabytes | [preço do D1](https://developers.cloudflare.com/d1/platform/pricing/) |
| GitHub Actions | 0 | Grátis em repositório público com runner padrão | [cobrança do Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) |
| Domínio `povix.app` | cerca de 9 euros no 1º ano; renovação cerca de 14 euros por ano | Preço de 06/10/2026 no registrador da Vercel: 9,99 e 15,00 dólares | estudo de hospedagem do repositório; **falta confirmar** o preço no registrador da Cloudflare |

Total no mês do evento: **0 euro** de hospedagem, com o repositório público (ver Riscos, "Repositório privado: decisão"). Total no primeiro ano: cerca de 9 euros, bem abaixo dos 100. Se a contagem passar do plano grátis, soma-se uns 5 dólares por mês, ainda dentro do orçamento. Conferido em 09/10/2026 nas páginas acima.

Plano grátis da Cloudflare sem cartão cadastrado não tem como gerar cobrança. Quando passa do limite, os pedidos da função falham (a contagem para; o site continua). **Falta confirmar** esse comportamento na página de limites dos Workers antes do evento.

Conta de folga, com a correção de que o limite que vale é o do D1 (linhas escritas), não o da função. Cada pessoa manda 1 pedido na abertura e, se baixou clipe, 1 pedido com a soma. Com S sessões por dia e uma fração p que baixa clipe, são S x (1 + p) somas. Cada soma escreve 1 linha na tabela `without rowid` (a chave é a própria linha), o que **falta medir**: no teste do passo 5, mande 100 pedidos e leia "Row Metrics" no D1. Se forem 2 linhas por soma, divida o teto por 2.

| Público no dia | p | Somas | Linhas (1 por soma) | Linhas (2 por soma) | Cabe em 100.000? |
|---|---|---|---|---|---|
| 10.000 sessões | 0,3 | 13.000 | 13.000 | 26.000 | sim |
| 30.000 sessões | 0,3 | 39.000 | 39.000 | 78.000 | sim |
| 50.000 sessões | 0,3 | 65.000 | 65.000 | 130.000 | só com 1 linha |

O público do Abisal não está estimado em nenhuma fonte que eu tenha lido. Peça o número à organização antes do evento. Se passar de 40.000 sessões por dia, ou se o teste mostrar 2 linhas por soma, o plano pago dos Workers (cerca de 5 dólares por mês, **falta confirmar** na [página de preços](https://developers.cloudflare.com/workers/platform/pricing/)) tira o teto e cabe nos 100 euros. Isso não exige trocar o desenho: é só ligar o plano e cobrir o mês.

## O que o dono configura (cerca de 30 minutos)

1. Criar a conta grátis na Cloudflare.
2. Criar um token de acesso com a permissão "Cloudflare Pages: Edit" e copiar o código da conta (Account Id).
3. No GitHub, em Settings, Secrets and variables, Actions, guardar os dois como segredos: `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. O token fica só aí, nunca no repositório.
4. No painel da Cloudflare, criar um banco D1 chamado `povix`, abrir o Console e colar o conteúdo de `functions/schema.sql` (uma tabela de 3 colunas; o assistente de código manda o texto pronto). Antes do passo 7, a primeira publicação sai sem lista anterior para preservar.
5. Depois da primeira publicação: no projeto `povix`, em Settings, Bindings, ligar o D1 com o nome de variável `DB` ao banco `povix`, e rodar o fluxo de novo.
6. Nos dias do evento, criar a variável `EVENTO_ATIVO` com o valor `sim` (em Settings, Secrets and variables, Actions, Variables). Fora deles, apagar. Esquecer de apagar não custa dinheiro: só roda uma tarefa grátis a cada 10 minutos.
7. Anotar o endereço real do projeto (aparece no painel e no fim do passo de publicação) e guardá-lo como variável `POVIX_URL`, por exemplo `https://povix.pages.dev`, sem barra no fim. Ele serve para o fluxo preservar a lista no ar. Se o nome `povix` estiver tomado, o endereço terá outro nome, e a variável `PROJETO_PAGES` define o nome escolhido.
8. Quando decidir o domínio, comprá-lo e ligá-lo em Custom domains do projeto. Antes disso tudo já funciona no endereço `.pages.dev`, com https e cabeçalhos. Depois, atualizar `POVIX_URL`.
9. Para ver os números: abrir o Console do D1 e colar a consulta do relatório (acima, depois do esquema) com as datas do evento. Não há painel nem rota pública.

Os nomes dos menus mudam com o tempo. Se algum não bater, a busca do painel acha pelo nome.

## Passos para pôr no ar

1. Quem está programando com o dono (o assistente de código) cria e comita os arquivos acima, inclusive as ligações em `app.js` e `evento-ui.js`. O dono não edita código. A lista `eventos/abisal.txt` e o `CODIGO` da página `/abisal/` só existem quando a organização do Abisal entrega o elenco. Peça isso agora: é o item que mais atrasa.
2. **Teste da Kick, antes de tudo:** rodar o fluxo à mão (workflow_dispatch) e ler o passo "lista". Se o Actions levar 403, pare aqui (ver Riscos). Em 09/10/2026 esta máquina levou 200 do `kick.com`, mas isso não prova nada sobre os servidores do GitHub.
3. Abrir o endereço `.pages.dev`, conferir `curl -I` em `/` e em `/abisal/` (os dois devem mostrar `content-security-policy` e `frame-ancestors 'none'`) e abrir o elenco: a aba de rede deve mostrar 1 pedido a `/dados/vods.json` e nenhum a `kick.com/.../videos`.
4. Abrir o mapa e baixar um clipe, depois fechar ou esconder a aba (abra o mapa pelo link do evento, não pelo exemplo): no Console do D1, a consulta deve mostrar `abertura` e `clipe` do dia. Em seguida mande 100 aberturas de teste e leia as linhas escritas no D1 (conta de folga acima). Apague as linhas de teste (`delete from contagem;`) no Console do D1 na véspera do evento.
5. Ligar `EVENTO_ATIVO` um dia antes do evento. Testar com o elenco real e conferir que o `n` do teste foi apagado.
6. Testes de código a escrever: `buscarComLista` com arquivo presente, ausente, velho (mais de 3 h), com canal fora do arquivo e com o mesmo canal pedido duas vezes (a segunda vai à Kick); o fluxo com `gerar-lista` falhando num push (o `dist` mantém o `vods.json` anterior); a função com `origin` errado, tipo inválido, `n` fora de 1 a 50 e corpo grande; e `abrirElenco` com o registro ligado, para provar que o `import` está lá e que o mapa pinta mesmo se a contagem falhar. Rode também a suíte atual (`test/evento.test.mjs` importa `evento-ui.js` direto no Node, e por isso `registrar.js` não pode exigir `location`) e `test/pagina.test.mjs` depois de mexer no `index.html`. Teste do registro: 120 downloads somam 50, 50 e 20, sem perda.
7. Peça ao dono para ligar, na conta do GitHub, os avisos por e-mail de falha do Actions (Settings, Notifications, Actions). Assim uma rodada vermelha chega a ele sem ler log.

## Riscos

- **A Kick pode bloquear o Actions (o maior risco, e não está medido).** O pedido 2 depende de a Kick responder aos servidores do GitHub. Não tenho teste disso: esta máquina levou 200 em 09/10/2026, e IP de datacenter pode levar 403. Não dou um percentual, porque não há dado para isso. O que o dono faz, sem programar:
  1. Rodar o teste do passo 2 na primeira semana, não na véspera. Ele diz sim ou não em 5 minutos.
  2. Se der 403 ou 429: não contornar. Pedir à Kick, por escrito, o "pode usar" e um acesso autorizado. É o caminho que resolve de verdade.
  3. Enquanto isso não vem, o site e a contagem funcionam do mesmo jeito (pedidos 1 e 3 não dependem da Kick). O pedido 2 fica como hoje: cada navegador pede à Kick, 500 pedidos por pessoa. Esse é o cenário que o dono já tem, e não resolve o item 7 do ABISAL.md.
  4. Segundo ponto de geração, a testar no mesmo dia: um Worker da própria Cloudflare com agendamento (Cron Trigger) que faz o mesmo trabalho do `gerar-lista.mjs` e guarda o resultado no D1, e a função serve `/dados/vods.json` a partir dele. Fica na mesma conta, sem servidor para manter, e o dono só liga o agendamento. Não escrevi esse código e não sei se a Kick aceita o IP da Cloudflare melhor que o do GitHub. Só se constrói se o teste do GitHub falhar. **Falta confirmar** limites e preço dos Cron Triggers nos [limites dos Workers](https://developers.cloudflare.com/workers/platform/limits/).
  5. Se ambos levarem 403, não há solução técnica dentro das regras: o pedido 2 só se resolve com a autorização da Kick. Diminuir o número de canais não ajuda no 403 (ele vale para qualquer canal); só ajuda se a resposta for 429, de volume.
  Sem o arquivo, 3 horas depois a página volta a 500 pedidos por pessoa.
- **Termos da Kick.** O estudo do repositório (seção 5) já registra o risco de usar endpoints não documentados e de guardar conteúdo por mais de 24 h. O arquivo guarda só título, horário e endereço da playlist, renovados a cada 10 minutos, e nenhum vídeo. Mesmo assim, é um acesso feito por um servidor nosso. Peça o "pode usar" por escrito antes do evento.
- **A lista não cobre tudo.** O chat (para os picos) e as playlists continuam indo da página à Kick. O arquivo tira os 500 pedidos de VODs por pessoa, não todos.
- **Dado velho de até 10 minutos, ou mais.** Quem entra no ar tarde aparece como sem VOD por esse tempo (hoje a página repete a busca a cada 2). Um VOD que está ao vivo traz no arquivo a duração e o `is_live` de até 10 minutos atrás, então o fim estimado dele fica atrasado. A lista de quem está ao vivo (`procurarAoVivo`) é outro pedido, que continua indo direto à Kick, e não passa pelo arquivo. Ainda assim, **falta testar** no ensaio se o mapa do lance ao vivo aceita esse atraso. Os agendamentos do GitHub também atrasam, às vezes mais de 10 minutos. O canal que entra no ar depois da rodada não depende disso: o pedido repetido vai à Kick. O atraso afeta só a duração de quem já estava no ar. O arquivo não tem corte por data: lances de noites antigas continuam no mapa enquanto a Kick os devolver.
- **Agendamento parado.** O GitHub desliga tarefas agendadas de repositório público sem atividade por 60 dias. Uma publicação nova religa. Confira na semana do evento.
- **Repositório privado: decisão.** SEGURANCA.md pede repositório privado antes de mostrar o código a um comprador, não antes do evento. Decisão: o repositório continua público até o fim do piloto, e o custo do Actions é 0. Passe para privado depois do evento. Se o dono quiser privado antes, o fluxo deve rodar a cada 30 minutos (troque `*/10` por `*/30` na linha do `cron`; é uma edição que o assistente de código faz) e só nos dias do evento (`EVENTO_ATIVO`). Conta aproximada: cada rodada leva uns 3 minutos, 48 rodadas por dia dão cerca de 150 minutos por dia. O plano grátis do GitHub para repositório privado dá 2.000 minutos por mês (**falta confirmar** na [página de cobrança](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions)), o que cobre uns 13 dias de evento. A 10 minutos, 144 rodadas por dia gastam 430 minutos por dia e o limite acaba em cerca de 4 dias. O excesso é cobrado por minuto; **falta confirmar** o preço, e a conta fica dentro dos 100 euros para um piloto curto.
- **Contagem aproximada, e o que ela não diz.** "Aberturas" são sessões de navegador que abriram o link do evento, não pessoas únicas; o exemplo e o texto colado não contam, mas testes do próprio dono contam, por isso o relatório soma só os dias do evento. "Clipes" são downloads de clipe: quem baixa duas vezes conta duas, e um clipe que vai para a fila de arquivos sem download não conta. Os clipes de uma sessão que o celular mata antes de a aba ficar escondida se perdem. Os dois números são ordem de grandeza para o relatório, não auditoria, e não devem ser apresentados a patrocinador como dado verificado. Isso é o preço de não identificar ninguém. **Não cobre** "quais lances rodaram mais" nem "clipes únicos" do ABISAL.md: isso exigiria identificar o lance, e a contagem de hoje só soma por dia e por tipo. Se o patrocinador pedir, é uma tabela a mais com o código do lance (sem pessoa), decisão do dono depois do piloto.
- **Abuso da contagem.** Qualquer pessoa com `curl` pode mandar pedidos falsos (até 50 clipes por pedido) e gastar o limite diário de 100.000 pedidos ou de linhas escritas do D1. O efeito é a contagem parar naquele dia ou ficar inflada. Impedir isso de verdade exigiria identificar quem usa, o que as regras do dono proíbem. O que se faz: os totais não são públicos; o relatório compara as aberturas com as visitas do painel da Cloudflare e confere a razão clipes por abertura (acima de uns 5 por abertura em um dia, trate o dia como suspeito e diga isso no relatório). O site e o arquivo de VODs seguem no ar, porque são arquivos estáticos. Se virar problema, uma regra de limite de pedidos na Cloudflare resolve (**falta confirmar** se o plano grátis a inclui).
- **Publicações demais?** O fluxo publica a cada 10 minutos (cerca de 4.300 publicações por mês). O limite de 500 builds por mês da Cloudflare é de builds por Git; a publicação por upload direto, usada aqui, não roda build. **Falta confirmar** que ela não entra nessa conta. Se entrar, passe para 30 minutos ou para uma rodada por hora.
- **Privacidade, e SEGURANCA.md deixa de ser verdade.** Aquele arquivo diz que "não existe servidor nosso" e que nenhum dado sai do aparelho. Com a contagem, cada visita manda um POST à Cloudflare, que como hospedagem vê o endereço de rede, o navegador e a hora. Nós não guardamos nada disso: a tabela só tem dia, tipo e soma. Faça duas coisas. (1) Corrigir o texto em SEGURANCA.md, na seção "O que está bem": trocar a frase por "o Povix guarda apenas dois totais por dia (aberturas e clipes), sem identificar ninguém". (2) Colocar no rodapé do `index.html`, em português, a linha: "O Povix conta aberturas e clipes por dia, sem cookie, nome ou endereço de rede. A hospedagem (Cloudflare) vê o endereço de rede para entregar a página." Não ligue os registros (logs) das funções no painel da Cloudflare: **falta confirmar** que vêm desligados por padrão. Os registros de acesso da própria rede da Cloudflare não estão sob nosso controle.
- **Pages pode ser substituído pelos Workers.** A Cloudflare empurra projetos novos para Workers com arquivos estáticos. O mesmo `_headers` e a mesma função migram para lá com pouca mudança. Um projeto de Direct Upload não passa depois para o modo Git.
- **Segredos.** O token tem só a permissão de publicar o Pages e vive nos segredos do GitHub. O fluxo não usa `pull_request_target`.
- **Lista apagada por engano.** O fluxo baixa a lista que está no ar antes de cada publicação, então um push comum não a apaga. Se `POVIX_URL` estiver vazia ou errada, o push publica sem lista e a página volta a 500 pedidos por pessoa até a próxima rodada boa. Confira a variável no passo 7 do dono.
- **Sem o D1 ligado** (passo 5), a função devolve erro 500 e a contagem fica parada. O site continua.

## Segunda melhor opção: Netlify

Netlify também lê o `_headers`, tem funções e armazenamento, e faria o mesmo trabalho. Perde pelo modelo de cobrança, que não combina com publicar o arquivo a cada 10 minutos.

A página oficial do plano ([planos por créditos](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), lida em 09/10/2026) diz:

- O plano grátis tem 300 créditos por mês, com limite rígido (sem recarga).
- Cada publicação em produção gasta 15 créditos. Uma rodada a cada 10 minutos gasta 2.160 por dia. Os 300 créditos acabam na vigésima publicação, em cerca de 3 horas.
- Banda: 20 créditos por gigabyte. Com cerca de 1 megabyte por visita, 300 créditos dão perto de 15.000 visitas, se nada mais for gasto.

Dá para contornar: publicar o arquivo de VODs fora do site (ou a cada hora), ou pagar o plano Pessoal (9 dólares por mês, 1.000 créditos). Isso soma peças ou custo. Na Cloudflare, arquivos estáticos não têm limite de banda, e a publicação por upload direto não é build (a confirmar, ver Riscos). **Falta confirmar** o que a Netlify faz quando o limite rígido é atingido (a página diz "hard limit", sem detalhar).

Os outros perdem por tamanho. GitHub Pages não aplica `_headers` (`LANCAR.md`, tabela de hospedagem). Vercel Hobby é para uso pessoal, não comercial (`LANCAR.md`). Servidor próprio, Supabase ou Firebase exigem manutenção ou cartão, e o dono não mantém servidor. Para Supabase e Firebase **falta confirmar** preços e limites; não os li.

## Premissas

- O piloto é um evento só, e a contagem não separa eventos. O relatório soma só os dias do evento.
- "Visualizações do evento" quer dizer aberturas do mapa por sessão de navegador, sem identificar pessoas. "Clipes feitos" quer dizer downloads de clipe.
- O elenco do Abisal estará pronto antes do evento. Sem ele, não há o que listar.
- A Kick responde aos servidores do GitHub. Isso é uma aposta não medida; ver Riscos. Se não responder, o pedido 2 pode ficar sem solução até a Kick autorizar.
- O domínio só será comprado quando o dono decidir. Até lá vale o endereço `.pages.dev` do projeto (`povix.pages.dev` se o nome estiver livre).
- Preços e limites acima foram lidos nas páginas citadas em 09/10/2026. Onde está "falta confirmar", não consegui ler a fonte.
