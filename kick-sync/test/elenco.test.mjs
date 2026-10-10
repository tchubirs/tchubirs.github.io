// O elenco de um evento, lido de tudo o que um organizador pode mandar.
//
// Sem rede: o módulo não faz pedidos, e a página de times que aqui se usa é
// reconstruída com a marcação e os canais REAIS da rustkickoff.com/teams,
// medida em 06/10/2026 — 10 times de 15, com o texto dos links diferente do
// canal ("Pheetus" -> impheetus) e um link em http. Um elenco errado não dá
// erro nenhum: dá um ângulo de outra pessoa na grelha. Por isso os testes
// comparam o resultado inteiro e não só contagens.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerElenco, paraTexto, codificar, descodificar, contar, canalDe } from '../site/elenco.js';

const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);

// O elenco real do Rust Kick Off 2, por ordem da página (capitão, vice, resto).
const REAL = `Team Oilrats: oilrats trausi posty purpluu qaixx smokin impheetus goes mammoth gelotris roledyr blueberrygabi swizz chad sven
Team Krolay: krolay ravenrust noragee toxxicbrofr zb0ub skull_sensei folldarmee twixgauche klawz abaraii swidy skidohunter risesfr needex packam
Team Spoonkid: spoonkid throat luckyllama kickz vincentsmg wally1k enardo twig toofreezy jteles fredplayspoker franzj jakknife judelow walski
Team Panpots: panpots v2unstoppable murloc_cg m2cg lukasito_cg edinz xguiry starwraith notoriuspig danikongi agusss04 mills_rp neptuno naoww ludovici
Team Welyn: welyn picco gorliac chickencoop riqqeloff ezbompany m0hr jennifer potatokai disfigure poetic bcjfps trey24k jonk kayli_j
Team CoconutB: coconutb winnie xkevv toonyx gevad1ch jennaxl awecoop chinaslime xultra irisk alle basharam dezignful aikobliss spinky
Team Ricoy: ricoy dilanzito uruguayo28 tchubi kodd ciscoo s3kox poionako xomegaa lautaarg00 gustavocsgo kzeco zeko artzinwww itrol
Team Willjum: willjum sinks skrust wash cheese albin imvertzo solutize jozukai morgausse arkhram vgumiho itzmino rhino ledoo
Team Erobb221: erobb221 angelaoreo lifestomper galaaxxy hardstuck r00t9r coma moons domerrust funfps bloomerr dyanna snipernamedg goosey basetrade
Team hJune: hjune frost hutnik chasetb20 snuffyfluffy blooprint alpacasita lost4k ninirust dapr hyperrattv zikzlol chap frexs jdxl`
  .split('\n').map((l) => {
    const [nome, resto] = l.split(': ');
    return { nome, canais: resto.split(' ') };
  });

// O que a página mostra não é o canal. Estes quatro são da página medida.
const MOSTRADO = { impheetus: 'Pheetus', blueberrygabi: 'Gabi', roledyr: 'RoleDyr', xkevv: 'xKevv.' };
const HREF = { posty: 'http://kick.com/posty', roledyr: 'https://kick.com/RoleDyr', blueberrygabi: 'https://kick.com/BlueberryGabi' };
const link = (c) => `<a href="${HREF[c] || `https://kick.com/${c}`}" target="_blank" rel="noopener"
                            class="text-xs font-bold uppercase hover:text-primary-container">${MOSTRADO[c] || c}</a>`;

/** Um cartão como os da página: cabeçalho, capitão e vice, e o elenco. */
function cartao({ nome, canais }, n, { repetirCapitaes = false } = {}) {
  const [cpt, vice, ...resto] = canais;
  const elenco = repetirCapitaes ? canais : resto;
  return `
                <div class="group relative overflow-hidden bg-surface-container-low">
                        <!-- Captain banner background -->
            <img src="/assets/img/captain-banners/${nome.replace(/ /g, '_')}.webp" alt="${nome} banner" loading="lazy" class="absolute inset-0">
            <div class="absolute inset-0 bg-gradient-to-b"></div>
                        <!-- Team header -->
            <div class="relative z-10 p-5">
                <div class="flex items-center justify-between">
                    <h3 class="font-headline text-xl sm:text-2xl font-black uppercase tracking-tight italic">${nome}</h3>
                    <span class="text-[10px] font-black uppercase tracking-widest">TEAM ${n}</span>
                </div>
                <!-- Captain & Co-Captain -->
                <div class="mt-3 flex gap-2">
                    <a href="https://kick.com/${cpt}" target="_blank" rel="noopener">
                            <span>CPT</span>
                            <span>${MOSTRADO[cpt] || cpt}</span>
                        </a>
                    <a href="https://kick.com/${vice}" target="_blank" rel="noopener">
                            <span>CO-CPT</span>
                            <span>${vice}</span>
                        </a>
                </div>
            </div>
            <!-- Roster -->
            <div class="relative z-10 px-5 pb-5">
                <p class="text-[10px] uppercase">Roster (${canais.length})</p>
                <div class="flex flex-wrap gap-x-3">
                    ${elenco.map(link).join('\n                    ')}
                </div>
            </div>
            <!-- Hover border effect -->
            <div class="absolute inset-0 border-2 border-transparent"></div>
        </div>`;
}

function paginaDeTimes(times, opcoes) {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: times.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, item: { '@type': 'SportsTeam', name: t.nome, sport: 'Rust' },
    })),
  });
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Teams | Rust Kick Off</title>
<script type="application/ld+json">${jsonLd}</script>
<script>window.__x = '<h3>Team Falso</h3><a href="https://kick.com/falso">falso</a>';</script>
<style>.glow-orb { position: absolute; }</style>
</head><body>
<nav class="fixed top-0"><a href="/">Home</a><a href="https://kick.com/category/rust">Watch Rust</a>
<a href="https://kick.com/rustkickoff">Live on KICK</a></nav>
<!-- Minimalist Hero Section -->
<section class="relative"><img alt="Rust Landscape" src="/assets/img/team_bg.png"/>
<span>10 Teams. 150 Creators. $100K.</span>
<h1 class="font-headline">
                COMPETING <span class="text-primary-container">TEAMS</span>
</h1>
<p>Meet the squads battling it out for their share of the prize pool. Every creator streaming live on KICK.</p>
</section>
<!-- Official Roster Section -->
<div class="relative"><div class="text-center"><h2 class="font-headline">Official <span>Roster</span></h2>
<p>10 teams. 150 content creators. All streaming live on KICK.</p></div>
<div class="grid gap-6">${times.map((t, i) => cartao(t, i + 1, opcoes?.(i))).join('')}
</div></div>
<footer class="border-t"><a href="https://kick.com/category/rust">Rust on KICK</a>
<a href="https://kick.com/rustkickoff">rustkickoff</a><a href="https://twitter.com/rustkickoff">X</a></footer>
</body></html>`;
}

const html = (corpo) => `<html><body>${corpo}</body></html>`;
const so = (e) => ({ times: e.times, soltos: e.soltos });

// ── canais ──────────────────────────────────────────────────────────────────

test('um canal escreve-se de muitas maneiras e é sempre o mesmo', () => {
  const casos = [
    ['Ricoy', 'ricoy'],
    ['@Ricoy', 'ricoy'],
    ['  ricoy  ', 'ricoy'],
    ['https://kick.com/RoleDyr', 'roledyr'],
    ['http://kick.com/posty', 'posty'],
    ['kick.com/ricoy', 'ricoy'],
    ['//kick.com/ricoy', 'ricoy'],
    ['https://www.kick.com/ricoy/videos', 'ricoy'],
    ['https://kick.com/ricoy?ref=rko#x', 'ricoy'],
    ['https://kick.com/popout/ricoy/chat', 'ricoy'],
    ['https://player.kick.com/ricoy', 'ricoy'],
    ['<https://kick.com/ricoy>', 'ricoy'],
    ['(kick.com/ricoy)', 'ricoy'],
    ['xKevv.', 'xkevv'],
    ['skull_sensei', 'skull_sensei'],
    ['mills-rp', 'mills-rp'],
    ['a'.repeat(60), 'a'.repeat(60)],
  ];
  for (const [entrada, esperado] of casos) assert.equal(canalDe(entrada), esperado, entrada);
});

test('o que não é um canal da Kick é null, e nunca um palpite', () => {
  const casos = [
    '', '   ', null, undefined, '@', '-', '...', 'nome com espaço', 'tchübi', 'a'.repeat(61), 'a/b',
    'kick.com', 'https://kick.com/', 'https://kick.com/category/rust', 'kick.com/categories',
    'https://kick.com/video/abc', 'https://kick.com/videos/abc', 'kick.com/clips/clip_01', 'kick.com/search?q=x',
    'kick.com/browse', 'kick.com/following', 'kick.com/dashboard', 'kick.com/about', 'kick.com/terms-of-service',
    'kick.com/privacy-policy', 'kick.com/community-guidelines', 'kick.com/help', 'kick.com/settings',
    'kick.com/subscriptions', 'kick.com/signup', 'kick.com/login', 'category',
    'twitch.tv/ricoy', 'https://twitch.tv/ricoy', 'https://notkick.com/ricoy', 'https://kick.com.evil.io/ricoy',
    'https://kick.com/%E0%A4%A', 'javascript:alert(1)',
  ];
  for (const c of casos) assert.equal(canalDe(c), null, String(c));
});

// ── HTML ────────────────────────────────────────────────────────────────────

test('a página real de times dá os 10 times e os 150 canais, pela ordem da página', () => {
  const e = lerElenco(paginaDeTimes(REAL));
  assert.deepEqual(e.times, REAL, 'o texto dos links nunca é o canal: Pheetus é impheetus');
  assert.deepEqual(e.soltos, ['rustkickoff'], 'o canal do evento, no menu e no rodapé, fica sem time');
  assert.deepEqual(e.avisos, []);
  assert.deepEqual(contar(e), { times: 10, canais: 151 });
  // Nada do que está em <script> conta: nem o JSON-LD nem HTML dentro de uma string.
  assert.ok(!JSON.stringify(e).includes('falso'));
});

test('capitão e vice repetidos no mesmo cartão contam uma vez e não dão aviso', () => {
  const e = lerElenco(paginaDeTimes(REAL, () => ({ repetirCapitaes: true })));
  assert.deepEqual(e.times, REAL);
  assert.deepEqual(e.avisos, []);
});

test('cada link vai para o título mais próximo acima dele, de qualquer nível', () => {
  const e = lerElenco(html(`
    <a href="https://kick.com/organizador">org</a>
    <h2>Grupo A</h2>
    <h4>Os Brabos</h4><p><a href="https://kick.com/a1">A1</a> <a href='https://kick.com/a2'>A2</a></p>
    <h5>Lobos</h5><ul><li><a href=https://kick.com/b1>B1</a></li></ul>
    <h1>Final</h1><a class="x" href="https://kick.com/organizador">org outra vez</a><a href="https://kick.com/c1">c</a>
  `));
  assert.deepEqual(so(e), {
    times: [
      { nome: 'Os Brabos', canais: ['a1', 'a2'] },
      { nome: 'Lobos', canais: ['b1'] },
      // O organizador apareceu solto antes; dentro de um time passa a ser do time.
      { nome: 'Final', canais: ['organizador', 'c1'] },
    ],
    soltos: [],
  });
  assert.deepEqual(e.avisos, []);
});

test('o link pertence ao título onde fecha: dentro ou à volta do título', () => {
  const e = lerElenco(html(`
    <h3>Team Velho</h3><a href="https://kick.com/v1">v1</a>
    <a href="https://kick.com/ricoy"><h3>Team Ricoy</h3></a><a href="https://kick.com/tchubi">t</a>
    <h3><a href="https://kick.com/willjum">Team Willjum</a></h3><a href="https://kick.com/sinks">s</a>
  `));
  assert.deepEqual(e.times, [
    { nome: 'Team Velho', canais: ['v1'] },
    { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] },
    { nome: 'Team Willjum', canais: ['willjum', 'sinks'] },
  ]);
});

test('um subtítulo de papel não é um time; uma secção sem time manda para os soltos', () => {
  const e = lerElenco(html(`
    <h2>Teams</h2>
    <h3>Team Ricoy</h3>
      <h4>Captain</h4><a href="https://kick.com/ricoy">Ricoy</a>
      <h4>Co-Captain</h4><a href="https://kick.com/dilanzito">Dilanzito</a>
      <h4>Players (2)</h4><a href="https://kick.com/tchubi">Tchubi</a><a href="https://kick.com/kodd">Kod</a>
      <h4>Substitutes</h4><a href="https://kick.com/itrol">Itrol</a>
    <h3>Team Willjum</h3>
      <h4>Jogadores</h4><a href="https://kick.com/willjum">Willjum</a>
    <h2>Streamers</h2><a href="https://kick.com/convidado">convidado</a>
    <h3>Free Agents</h3><a href="https://kick.com/livre">livre</a>
  `));
  assert.deepEqual(so(e), {
    times: [
      { nome: 'Team Ricoy', canais: ['ricoy', 'dilanzito', 'tchubi', 'kodd', 'itrol'] },
      { nome: 'Team Willjum', canais: ['willjum'] },
    ],
    soltos: ['convidado', 'livre'],
  });
});

test('um subtítulo que se repete em times diferentes é rótulo; o mesmo cartão repetido junta-se', () => {
  const rotulos = lerElenco(html(`
    <h3>Team A</h3><h4>Main</h4><a href="https://kick.com/a1">1</a><h4>Bench</h4><a href="https://kick.com/a2">2</a>
    <h3>Team B</h3><h4>Main</h4><a href="https://kick.com/b1">1</a><h4>Bench</h4><a href="https://kick.com/b2">2</a>
  `));
  assert.deepEqual(rotulos.times, [
    { nome: 'Team A', canais: ['a1', 'a2'] },
    { nome: 'Team B', canais: ['b1', 'b2'] },
  ]);
  // A versão de telemóvel da mesma grelha: os mesmos títulos debaixo do MESMO pai.
  const responsivo = lerElenco(html(`
    <h2>Roster oficial</h2>
    <div class="md:hidden"><h3>Team A</h3><a href="https://kick.com/a1">1</a><h3>Team B</h3><a href="https://kick.com/b1">1</a></div>
    <div class="hidden md:block"><h3>TEAM A</h3><a href="https://kick.com/a1">1</a><h3>Team B</h3><a href="https://kick.com/b1">1</a></div>
  `));
  assert.deepEqual(so(responsivo), {
    times: [{ nome: 'Team A', canais: ['a1'] }, { nome: 'Team B', canais: ['b1'] }],
    soltos: [],
  });
  assert.deepEqual(responsivo.avisos, []);
});

test('um canal em dois times fica no primeiro, e o aviso diz os dois', () => {
  const e = lerElenco(html(`
    <h3>Team Ricoy</h3><a href="https://kick.com/tchubi">t</a><a href="https://kick.com/ricoy">r</a>
    <h3>Team Willjum</h3><a href="https://kick.com/willjum">w</a><a href="https://kick.com/Tchubi">t</a>
  `));
  assert.deepEqual(e.times, [
    { nome: 'Team Ricoy', canais: ['tchubi', 'ricoy'] },
    { nome: 'Team Willjum', canais: ['willjum'] },
  ]);
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /tchubi/);
  assert.match(e.avisos[0], /Team Ricoy/);
  assert.match(e.avisos[0], /Team Willjum/);
});

test('o rodapé do site não é do último time, mas o rodapé de um cartão é', () => {
  const e = lerElenco(html(`
    <h3>Team A</h3><a href="https://kick.com/a1">1</a>
    <article><h3>Team B</h3><a href="https://kick.com/b1">1</a><footer><a href="https://kick.com/b2">capitão</a></footer></article>
    <footer><a href="https://kick.com/patrocinador">Patrocinador</a></footer>
  `));
  assert.deepEqual(so(e), {
    times: [{ nome: 'Team A', canais: ['a1'] }, { nome: 'Team B', canais: ['b1', 'b2'] }],
    soltos: ['patrocinador'],
  });
});

test('títulos sem texto, com entidades ou com marcação perigosa', () => {
  const e = lerElenco(html(`
    <h3><img src="logo.png" alt="Team Águia"></h3><a href="https://kick.com/a1">1</a>
    <h3>   </h3><a href="https://kick.com/b1">1</a>
    <h3>Ricoy &amp; Tchubi&#39;s &lt;b&gt;crew&lt;/b&gt; &#x1F525;</h3><a href="https://kick.com/c1">1</a>
    <h3>&lt;img src=x onerror=alert(1)&gt;Team Mau</h3><a href="https://kick.com/d1">1</a>
    <h3>Vazio</h3>
    <h3>Team &quot;Lobo&quot;</h3><a href="https://kick.com/e1?a=1&amp;b=2">1</a>
  `));
  assert.deepEqual(e.times, [
    { nome: 'Team Águia', canais: ['a1'] },
    { nome: 'Time 2', canais: ['b1'] },
    { nome: "Ricoy & Tchubi's bcrew/b 🔥", canais: ['c1'] },
    { nome: 'img src=x onerror=alert(1)Team Mau', canais: ['d1'] },
    { nome: 'Team "Lobo"', canais: ['e1'] },
  ]);
  for (const t of e.times) assert.ok(!/[<>]/.test(t.nome), 'um nome nunca pode virar marcação');
});

test('uma página montada por JavaScript ainda dá os canais, sem time e com aviso', () => {
  const spa = `<!doctype html><html><body><div id="root"></div>
    <script id="__NEXT_DATA__" type="application/json">{"teams":[{"name":"Team Ricoy","links":["https:\\/\\/kick.com\\/ricoy","https:\\/\\/kick.com\\/tchubi"]},{"x":"https://kick.com/category/rust"}]}</script>
    </body></html>`;
  const e = lerElenco(spa);
  assert.deepEqual(so(e), { times: [], soltos: ['ricoy', 'tchubi'] });
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /sem time/);

  const nada = lerElenco('<html><body><h1>Teams</h1><a href="/teams/1">Team 1</a></body></html>');
  assert.deepEqual(so(nada), { times: [], soltos: [] });
  assert.match(nada.avisos.join(' '), /não encontrei nenhum canal/);
});

test('o mesmo time em duas fases continua a ser um time, e não um papel', () => {
  const a = (c) => `<a href="https://kick.com/${c}">${c}</a>`;
  const fases = lerElenco(html(`
    <h2>Group Stage</h2><h3>Team A</h3>${a('a1')}<h3>Team B</h3>${a('b1')}
    <h2>Playoffs</h2><h3>Team A</h3>${a('a2')}<h3>Team B</h3>${a('b2')}
  `));
  assert.deepEqual(so(fases), {
    times: [{ nome: 'Team A', canais: ['a1', 'a2'] }, { nome: 'Team B', canais: ['b1', 'b2'] }],
    soltos: [],
  });
  assert.deepEqual(fases.avisos, []);
  // Sem "Team" no nome decide a conta: três times em duas fases são times...
  const nomes = lerElenco(html(`
    <h2>Fase 1</h2><h3>Águias</h3>${a('a1')}<h3>Lobos</h3>${a('b1')}<h3>Ursos</h3>${a('c1')}
    <h2>Final</h2><h3>Águias</h3>${a('a2')}<h3>Lobos</h3>${a('b2')}<h3>Ursos</h3>${a('c2')}
  `));
  assert.deepEqual(nomes.times, [
    { nome: 'Águias', canais: ['a1', 'a2'] },
    { nome: 'Lobos', canais: ['b1', 'b2'] },
    { nome: 'Ursos', canais: ['c1', 'c2'] },
  ]);
  // ...e dois subtítulos em três times são papéis.
  const papeis = lerElenco(html(['A', 'B', 'C'].map((t) => (
    `<h3>Team ${t}</h3><h4>Main</h4>${a(`${t.toLowerCase()}1`)}<h4>Bench</h4>${a(`${t.toLowerCase()}2`)}`)).join('')));
  assert.deepEqual(papeis.times, [
    { nome: 'Team A', canais: ['a1', 'a2'] },
    { nome: 'Team B', canais: ['b1', 'b2'] },
    { nome: 'Team C', canais: ['c1', 'c2'] },
  ]);
});

test('um título sem nome recebe um número que não é o de outro título', () => {
  const e = lerElenco(html(`<h1>COMPETING TEAMS</h1><h2>Official Roster</h2>
    <h3></h3><a href="https://kick.com/a1">1</a><h3>Time 3</h3><a href="https://kick.com/b1">1</a>`));
  assert.deepEqual(so(e), {
    times: [{ nome: 'Time 1', canais: ['a1'] }, { nome: 'Time 3', canais: ['b1'] }],
    soltos: [],
  });
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /"Time 1"/);
  // O número seguinte já é um título da página: salta-se, em vez de juntar dois times.
  const colisao = lerElenco(html(`<h3>Team X</h3><a href="https://kick.com/x1">1</a>
    <h3></h3><a href="https://kick.com/a1">1</a><h3>Time 2</h3><a href="https://kick.com/b1">1</a>`));
  assert.deepEqual(colisao.times, [
    { nome: 'Team X', canais: ['x1'] },
    { nome: 'Time 3', canais: ['a1'] },
    { nome: 'Time 2', canais: ['b1'] },
  ]);
});

test('o rodapé de um cartão feito com <div> é do cartão; o do site não é', () => {
  const e = lerElenco(html(`
    <div class="grelha">
      <div><h3>Team A</h3><a href="https://kick.com/a1">1</a>
        <footer><a href="https://kick.com/a2">2</a></footer><a href="https://kick.com/a3">3</a></div>
      <div><h3>Team B</h3><a href="https://kick.com/b1">1</a></div>
    </div>
    <footer><a href="https://kick.com/patrocinador">Patrocinador</a></footer>
  `));
  assert.deepEqual(so(e), {
    times: [{ nome: 'Team A', canais: ['a1', 'a2', 'a3'] }, { nome: 'Team B', canais: ['b1'] }],
    soltos: ['patrocinador'],
  });
});

test('só o atributo href conta, e o ponto no fim sai como num texto', () => {
  const e = lerElenco(html(`<h3>T</h3><a data-href="https://kick.com/errado" href="https://kick.com/certo">x</a>
    <a href="https://kick.com/abc.">abc.</a>`));
  // Um nome da Kick não acaba em ponto: o do href sai como o de um texto, e o
  // elenco é o mesmo depois de "Corrigir elenco" e depois de um link.
  assert.deepEqual(e.times, [{ nome: 'T', canais: ['certo', 'abc'] }]);
  assert.equal(canalDe('kick.com/abc.'), 'abc');
});

test('um elenco lido de uma página volta igual de paraTexto e do link', async () => {
  const e = lerElenco('<h3>T</h3><a href="https://kick.com/certo">x</a><a href="https://kick.com/abc.">abc.</a>');
  assert.deepEqual(lerElenco(paraTexto(e)).times, e.times);
  assert.deepEqual((await descodificar(await codificar(e))).times, e.times);
});

test('o texto solto de uma página ao lado dos links não vira time', () => {
  const e = lerElenco('<h3>Team A</h3><a href="https://kick.com/a1">a1</a>\nWelcome everyone\nsponsor\nhome');
  assert.deepEqual(e, { times: [{ nome: 'Team A', canais: ['a1'] }], soltos: [], avisos: [] });
  // O texto do organizador com "Nome: canais" continua a contar.
  const org = lerElenco('<h3>Team A</h3><a href="https://kick.com/a1">a1</a>\nWelcome everyone\nTeam B: b1, b2');
  assert.deepEqual(so(org), {
    times: [{ nome: 'Team A', canais: ['a1'] }, { nome: 'Team B', canais: ['b1', 'b2'] }], soltos: [],
  });
});

test('cem mil <script> e <!-- por fechar acabam depressa, e não escondem o que veio antes', () => {
  const t0 = performance.now();
  const script = lerElenco(`<h3>T</h3><a href="https://kick.com/a1">1</a>${'<script>x'.repeat(100_000)}`);
  const comentario = lerElenco(`<h3>T</h3><a href="https://kick.com/a1">1</a>${'<!--x'.repeat(100_000)}`);
  // Uma regex por cada abertura sem fecho varria o resto da página de cada vez: ~25 s aqui.
  assert.ok(performance.now() - t0 < 3000, `${Math.round(performance.now() - t0)} ms`);
  assert.deepEqual(script.times, [{ nome: 'T', canais: ['a1'] }]);
  assert.deepEqual(comentario.times, [{ nome: 'T', canais: ['a1'] }]);
});

test('texto antes e depois de um pedaço de HTML também é lido', () => {
  const e = lerElenco('Team A: a1, a2\n<h3>Team B</h3><a href="https://kick.com/b1">b1</a>\nSem time: org');
  assert.deepEqual(so(e), {
    times: [{ nome: 'Team A', canais: ['a1', 'a2'] }, { nome: 'Team B', canais: ['b1'] }],
    soltos: ['org'],
  });
  assert.deepEqual(e.avisos, []);
  // O texto de um link na mesma linha da marcação é da página, não do organizador.
  const cortado = lerElenco('<h3>Team B</h3><a href="https://kick.com/impheetus">Pheetus');
  assert.deepEqual(so(cortado), { times: [{ nome: 'Team B', canais: ['impheetus'] }], soltos: [] });
});

test('num pedaço de HTML, o texto de um link é da página, e uma linha de texto no meio não corta o time', () => {
  // Uma linha solta entre o título e os links, copiada do código da página, não é do organizador...
  const meio = lerElenco('<h3>Team A</h3>\nCaptain\n<a href="https://kick.com/a1">a1</a>');
  assert.deepEqual(so(meio), { times: [{ nome: 'Team A', canais: ['a1'] }], soltos: [] });
  assert.deepEqual(meio.avisos, []);
  // ...e o texto de um link, mesmo sozinho numa linha, nunca é um canal.
  const link = lerElenco('<h3>Team A</h3>\n<a href="https://kick.com/impheetus">\nPheetus\n</a>\nSem time: org');
  assert.deepEqual(so(link), { times: [{ nome: 'Team A', canais: ['impheetus'] }], soltos: ['org'] });
  assert.deepEqual(link.avisos, []);
});

test('um <script> por fechar vai até ao fim, como no navegador: o HTML dentro dele não é um time', () => {
  const e = lerElenco(`<h3>T</h3><a href="https://kick.com/a1">1</a><script>var x = '<h3>Falso</h3><a href="https://kick.com/falso">'`);
  assert.deepEqual(so(e), { times: [{ nome: 'T', canais: ['a1'] }], soltos: [] });
  const comentario = lerElenco('<h3>T</h3><a href="https://kick.com/a1">1</a><!-- <h3>Velho</h3><a href="https://kick.com/velho">');
  assert.deepEqual(so(comentario), { times: [{ nome: 'T', canais: ['a1'] }], soltos: [] });
});

test('um rodapé no corpo da página é do site, mesmo numa página de um time só', () => {
  const corpo = '<h3>Team A</h3><a href="https://kick.com/a1">a1</a><footer><a href="https://kick.com/sponsor">s</a></footer>';
  for (const pagina of [corpo, html(corpo), html(`<main>${corpo}</main>`)]) {
    assert.deepEqual(so(lerElenco(pagina)), { times: [{ nome: 'Team A', canais: ['a1'] }], soltos: ['sponsor'] }, pagina);
  }
});

test('uma secção de papel sem time por cima diz porquê os canais ficaram sem time', () => {
  const e = lerElenco(html(`<h2>Streamers</h2><a href="https://kick.com/convidado">c</a>
    <h3>Free Agents</h3><a href="https://kick.com/livre">l</a>`));
  assert.deepEqual(so(e), { times: [], soltos: ['convidado', 'livre'] });
  assert.equal(e.avisos.length, 1, '"Free Agents" já diz que não tem time');
  assert.match(e.avisos[0], /"Streamers" parece um papel/);
});

test('dois times em duas fases, sem "Team" no nome, continuam a ser times', () => {
  // Dois nomes debaixo de dois pais é empate: na dúvida vale o título mais próximo.
  const a = (c) => `<a href="https://kick.com/${c}">${c}</a>`;
  const e = lerElenco(html(`<h2>Fase 1</h2><h3>Águias</h3>${a('a1')}<h3>Lobos</h3>${a('b1')}
    <h2>Final</h2><h3>Águias</h3>${a('a2')}<h3>Lobos</h3>${a('b2')}`));
  assert.deepEqual(e.times, [{ nome: 'Águias', canais: ['a1', 'a2'] }, { nome: 'Lobos', canais: ['b1', 'b2'] }]);
});

test('400 mil títulos por fechar (2,4 MB) acabam depressa', () => {
  const lixo = `<h3>${'<h3>x '.repeat(400_000)}`;
  const t0 = performance.now();
  const e = lerElenco(lixo);
  // ~1,5 s aqui. Varrer a página inteira por cada título seriam horas: o
  // limite só tem de separar as duas coisas, não medir a máquina.
  assert.ok(performance.now() - t0 < 15_000, 'não pode varrer a página inteira por cada título');
  assert.deepEqual(so(e), { times: [], soltos: [] });
});

// ── texto ───────────────────────────────────────────────────────────────────

test('uma linha por time, com vírgulas, ponto e vírgula, barras ou espaços', () => {
  const e = lerElenco([
    'Team Ricoy: ricoy, tchubi; kodd | ciscoo',
    'Team Willjum: willjum sinks skrust wash',
    'Team Erobb221:erobb221,@angelaoreo,https://kick.com/LifeStomper,kick.com/galaaxxy',
    'Time 1: Os Brabos: a1, a2',
    'Lobos - @b1, @b2',
  ].join('\n'));
  assert.deepEqual(so(e), {
    times: [
      { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd', 'ciscoo'] },
      { nome: 'Team Willjum', canais: ['willjum', 'sinks', 'skrust', 'wash'] },
      { nome: 'Team Erobb221', canais: ['erobb221', 'angelaoreo', 'lifestomper', 'galaaxxy'] },
      { nome: 'Time 1: Os Brabos', canais: ['a1', 'a2'] },
      { nome: 'Lobos', canais: ['b1', 'b2'] },
    ],
    soltos: [],
  });
  assert.deepEqual(e.avisos, []);
});

test('o elenco real escrito à mão, um time por linha com 15 canais separados por espaços', () => {
  const texto = REAL.map((t) => `${t.nome}: ${t.canais.join(' ')}`).join('\n');
  assert.deepEqual(lerElenco(texto).times, REAL);
});

test('um nome de time e um canal por linha, até à linha em branco', () => {
  const e = lerElenco([
    'Team Ricoy',
    'ricoy',
    '@tchubi',
    '',
    'Los Pibes',
    '- kodd',
    '- ciscoo',
    '',
    'Time 3:',
    '1. itrol',
    '2) zeko',
    '',
    '## Águias',
    '* https://kick.com/s3kox',
    '',
    '**Lobos**',
    'kick.com/poionako',
  ].join('\n'));
  assert.deepEqual(so(e), {
    times: [
      { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] },
      { nome: 'Los Pibes', canais: ['kodd', 'ciscoo'] },
      { nome: 'Time 3', canais: ['itrol', 'zeko'] },
      { nome: 'Águias', canais: ['s3kox'] },
      { nome: 'Lobos', canais: ['poionako'] },
    ],
    soltos: [],
  });
});

test('um nome que também podia ser canal só é nome quando o texto está em blocos', () => {
  const blocos = lerElenco('Oilrats\noilrats\ntrausi\n\nKrolay\nkrolay\nravenrust\n');
  assert.deepEqual(blocos.times, [
    { nome: 'Oilrats', canais: ['oilrats', 'trausi'] },
    { nome: 'Krolay', canais: ['krolay', 'ravenrust'] },
  ]);
  // Uma lista simples nunca perde o primeiro canal para um time fantasma.
  const lista = lerElenco('Oilrats\noilrats\ntrausi\nposty');
  assert.deepEqual(so(lista), { times: [], soltos: ['oilrats', 'trausi', 'posty'] });
  // Várias linhas de canais com espaços também não são um nome e os seus membros.
  const linhas = lerElenco('ricoy tchubi kodd ciscoo\nwilljum sinks skrust wash');
  assert.deepEqual(so(linhas), {
    times: [],
    soltos: ['ricoy', 'tchubi', 'kodd', 'ciscoo', 'willjum', 'sinks', 'skrust', 'wash'],
  });
});

test('debaixo de um nome, uma linha que não é canal fica de fora com aviso e não abre outro time', () => {
  const gralha = lerElenco('Team Ricoy\nricoy\ntchübi\nkodd\nciscoo');
  assert.deepEqual(so(gralha), { times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'kodd', 'ciscoo'] }], soltos: [] });
  assert.equal(gralha.avisos.length, 1);
  assert.match(gralha.avisos[0], /"tchübi" ficou de fora de "Team Ricoy"/);
  // O que nunca pode ser o canal sai: enfeites sem letras, a numeração "1 - " e as notas de papel.
  const COROA = String.fromCodePoint(0x1f451);
  for (const [texto, canais] of [
    [`Team Ricoy\n${COROA} ricoy\ntchubi\nkodd`, ['ricoy', 'tchubi', 'kodd']],
    ['Team Ricoy\n1 - ricoy\n2 - tchubi', ['ricoy', 'tchubi']],
    ['Team Ricoy\nricoy - capitão\ntchubi\nkodd', ['ricoy', 'tchubi', 'kodd']],
    ['Team Ricoy\nricoy (C)\ntchubi\n[CPT] kodd', ['ricoy', 'tchubi', 'kodd']],
  ]) {
    const e = lerElenco(texto);
    assert.deepEqual(so(e), { times: [{ nome: 'Team Ricoy', canais }], soltos: [] }, texto);
    assert.deepEqual(e.avisos, [], texto);
  }
  // Um nome com espaço não se parte em dois canais, nem se escolhe um deles à sorte.
  const nomes = lerElenco('Team Ricoy\nricoy\nMills RP\nGabi (blueberrygabi)\nkodd');
  assert.deepEqual(so(nomes), { times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'kodd'] }], soltos: [] });
  assert.equal(nomes.avisos.length, 2);
  assert.match(nomes.avisos[0], /"Mills RP" ficou de fora de "Team Ricoy"/);
  assert.match(nomes.avisos[1], /"Gabi \(blueberrygabi\)" ficou de fora/);
  // Uma linha só, com três canais ou mais, ainda é a lista do time; e "Team ..." ainda abre outro time.
  assert.deepEqual(lerElenco('Team Ricoy\nricoy tchubi kodd ciscoo').times,
    [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd', 'ciscoo'] }]);
  assert.deepEqual(lerElenco('Team Ricoy\nricoy\nTeam Willjum\nwilljum').times,
    [{ nome: 'Team Ricoy', canais: ['ricoy'] }, { nome: 'Team Willjum', canais: ['willjum'] }]);
});

test('um canal logo depois de uma linha "Time: a, b" fica sem time, e com aviso', () => {
  const e = lerElenco('Team A: a1, a2\nTeam B: b1, b2\nrustkickoff');
  assert.deepEqual(so(e), {
    times: [{ nome: 'Team A', canais: ['a1', 'a2'] }, { nome: 'Team B', canais: ['b1', 'b2'] }],
    soltos: ['rustkickoff'],
  });
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /"rustkickoff" veio logo depois de "Team B"/);
  // Com a linha em branco não há dúvida, e um papel ("Reservas:") continua a ser do time de cima.
  const claro = lerElenco('Team A: a1, a2\nReservas: a3\n\nrustkickoff');
  assert.deepEqual(so(claro), { times: [{ nome: 'Team A', canais: ['a1', 'a2', 'a3'] }], soltos: ['rustkickoff'] });
  assert.deepEqual(claro.avisos, []);
});

test('um nome logo depois de uma linha "Time: a, b" abre outro time, como no começo de um bloco', () => {
  const e = lerElenco('Team A: a1, a2\nÁguias\nb1\nb2\nOs Lobos\nc1');
  assert.deepEqual(so(e), {
    times: [{ nome: 'Team A', canais: ['a1', 'a2'] }, { nome: 'Águias', canais: ['b1', 'b2', 'c1'] }],
    soltos: [],
  });
  // Debaixo de "Águias" já é um membro por linha, até à linha em branco: "Os Lobos" não é canal e
  // fica de fora com aviso, e o c1 continua a ser do Águias.
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /"Os Lobos" ficou de fora de "Águias"/);
  // Logo depois da linha "Time: a, b", com um canal por linha por baixo, um nome de duas palavras é time.
  const dois = lerElenco('Team A: a1\nOs Lobos\nc1\nc2');
  assert.deepEqual(so(dois), {
    times: [{ nome: 'Team A', canais: ['a1'] }, { nome: 'Os Lobos', canais: ['c1', 'c2'] }],
    soltos: [],
  });
  assert.deepEqual(dois.avisos, []);
});

test('um grupo com nome de papel fica sem time, mas diz porquê', () => {
  const e = lerElenco('Staff: a1, a2\nThe Streamers: b1\nBench: c1\nOthers: d1');
  assert.deepEqual(so(e), { times: [], soltos: ['a1', 'a2', 'b1', 'c1', 'd1'] });
  assert.equal(e.avisos.length, 3, '"Others" já diz que não tem time');
  for (const nome of ['Staff', 'The Streamers', 'Bench']) assert.match(e.avisos.join('\n'), new RegExp(`"${nome}" parece um papel`));
  // Debaixo de um time, o papel é desse time.
  const dentro = lerElenco('Team Ricoy: ricoy\nBench: c1');
  assert.deepEqual(so(dentro), { times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'c1'] }], soltos: [] });
  assert.deepEqual(dentro.avisos, []);
});

test('um enfeite à frente de um @ ou de um link não é o nome de um time', () => {
  const COROA = String.fromCodePoint(0x1f451);
  const ESTRELA = String.fromCodePoint(0x2b50);
  const e = lerElenco(`Team Ricoy\n${COROA} @ricoy\n1 - @tchubi\nkodd`);
  assert.deepEqual(so(e), { times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd'] }], soltos: [] });
  assert.deepEqual(e.avisos, []);
  const lista = lerElenco(`${ESTRELA} kick.com/ricoy\n${ESTRELA} kick.com/tchubi`);
  assert.deepEqual(lista, { times: [], soltos: ['ricoy', 'tchubi'], avisos: [] });
});

test('dentro de um bloco, os papéis e as notas ficam no time', () => {
  // "Capitão: ricoy" é um papel do time de cima: não fecha o bloco como "Team B: b1" fecharia.
  const e = lerElenco('Team Ricoy\nCapitão: ricoy\nJogadores: tchubi, kodd\nciscoo');
  assert.deepEqual(so(e), { times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd', 'ciscoo'] }], soltos: [] });
  assert.deepEqual(e.avisos, []);
  // Numa linha "Time: a, b", "(C)" e "[CPT]" são notas, e não um canal chamado "c".
  const notas = lerElenco('Team Ricoy: ricoy (C), tchubi, [CPT] kodd');
  assert.deepEqual(so(notas), { times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd'] }], soltos: [] });
  assert.deepEqual(notas.avisos, []);
});

test('debaixo de uma secção, o nome na linha seguinte é o do primeiro time', () => {
  const e = lerElenco('Times confirmados:\nÁguias\na1\na2\n\nGrupo B\nOs Lobos\nb1');
  assert.deepEqual(so(e), {
    times: [{ nome: 'Águias', canais: ['a1', 'a2'] }, { nome: 'Os Lobos', canais: ['b1'] }],
    soltos: [],
  });
  assert.deepEqual(e.avisos, []);
});

test('numa lista sem título, uma linha que não é canal fica de fora e não abre um time', () => {
  const e = lerElenco('ricoy\ntchübi\nkodd');
  assert.deepEqual(so(e), { times: [], soltos: ['ricoy', 'kodd'] });
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /"tchübi" ficou de fora: não é um nome de canal da Kick/);
});

test('um nome com maiúsculas por cima de uma lista fica canal, e o aviso diz como fazer dele um time', () => {
  const lista = lerElenco('Oilrats\noilrats\ntrausi\nposty');
  assert.deepEqual(so(lista), { times: [], soltos: ['oilrats', 'trausi', 'posty'] });
  assert.equal(lista.avisos.length, 1);
  assert.match(lista.avisos[0], /"Oilrats" ficou como canal; se for o nome de um time, escreva "Oilrats:"/);
  // Com os dois-pontos é time, e sem aviso.
  assert.deepEqual(lerElenco('Oilrats:\noilrats\ntrausi\nposty'), {
    times: [{ nome: 'Oilrats', canais: ['oilrats', 'trausi', 'posty'] }], soltos: [], avisos: [],
  });
  // Numa lista onde todos têm maiúsculas nenhum se distingue, e não há aviso.
  assert.deepEqual(lerElenco('Ricoy\nTchubi\nKodd').avisos, []);
});

test('uma menção do Discord copiada crua não é um canal', () => {
  const e = lerElenco('Team A: <@123456789012345678>, <@!42>, ricoy');
  assert.deepEqual(so(e), { times: [{ nome: 'Team A', canais: ['ricoy'] }], soltos: [] });
  assert.equal(e.avisos.length, 2);
  for (const a of e.avisos) assert.match(a, /menção do Discord/);
  for (const m of ['<@123456789012345678>', '<#123456789012345678>', '<@&42>']) assert.equal(canalDe(m), null, m);
});

test('emojis compostos e nomes compridos não se partem', () => {
  const FAMILIA = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
  assert.equal(lerElenco(`Team ${FAMILIA}: a1`).times[0].nome, `Team ${FAMILIA}`);
  // 80 caracteres no máximo, mas sem meio emoji no fim.
  const longo = lerElenco(`${'a'.repeat(79)}${String.fromCodePoint(0x1f600)}: b1`).times[0].nome;
  assert.equal(longo, 'a'.repeat(79));
});

test('o nome de um título limpa-se até ao fim: ler, escrever e ler outra vez dá o mesmo', async () => {
  const e = lerElenco(html(`<h3>${'- '.repeat(20)}Team</h3><a href="https://kick.com/a1">1</a>`));
  assert.deepEqual(e.times, [{ nome: 'Team', canais: ['a1'] }]);
  assert.deepEqual(so(lerElenco(paraTexto(e))), so(e));
  assert.deepEqual(so(await descodificar(await codificar(e))), so(e));
});

test('CSV com cabeçalho, em qualquer ordem de colunas e com colunas a mais', () => {
  const simples = lerElenco('time,canal\nTeam Ricoy,ricoy\nTeam Ricoy,tchubi\nTeam Willjum,willjum\n');
  assert.deepEqual(simples.times, [
    { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] },
    { nome: 'Team Willjum', canais: ['willjum'] },
  ]);
  const pontoEVirgula = lerElenco('Time;Canal\r\nRicoy;ricoy\r\nRicoy;@tchubi\r\n');
  assert.deepEqual(pontoEVirgula.times, [{ nome: 'Ricoy', canais: ['ricoy', 'tchubi'] }]);
  // A exportação de um formulário: carimbo, nome, e-mail, e o time e o canal pelo meio.
  const formulario = lerElenco([
    'Carimbo de data/hora,Nome,E-mail,Time,Canal da Kick',
    '2026/10/01 18:00:00,Ana,ana@exemplo.com,Team Ricoy,https://kick.com/ricoy',
    '2026/10/01 18:02:13,Bruno,bruno@exemplo.com,Team Ricoy,@Tchubi',
    '2026/10/01 18:05:41,Caio,caio@exemplo.com,,convidado',
  ].join('\n'));
  assert.deepEqual(so(formulario), {
    times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] }],
    soltos: ['convidado'],
  });
  // Um time por linha, um jogador por coluna, com aspas à volta de um nome com vírgula.
  const porLinha = lerElenco([
    'Time,Capitão,Jogador 2,Jogador 3,Jogador 4',
    '"Ricoy, Tchubi & Cia",ricoy,tchubi,kodd,ciscoo',
    'Team Willjum,willjum,sinks,,wash',
  ].join('\n'));
  assert.deepEqual(porLinha.times, [
    { nome: 'Ricoy, Tchubi & Cia', canais: ['ricoy', 'tchubi', 'kodd', 'ciscoo'] },
    { nome: 'Team Willjum', canais: ['willjum', 'sinks', 'wash'] },
  ]);
  assert.deepEqual(porLinha.avisos, []);
});

test('CSV sem cabeçalho: o time é a coluna que se repete', () => {
  const comEspacos = lerElenco('Team Ricoy,ricoy\nTeam Ricoy,tchubi\nTeam Willjum;willjum');
  assert.deepEqual(comEspacos.times, [
    { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] },
    { nome: 'Team Willjum', canais: ['willjum'] },
  ]);
  const umaPalavra = lerElenco('ricoy,ricoy\nricoy,tchubi\nwilljum,willjum\nwilljum,sinks');
  assert.deepEqual(umaPalavra.times, [
    { nome: 'ricoy', canais: ['ricoy', 'tchubi'] },
    { nome: 'willjum', canais: ['willjum', 'sinks'] },
  ]);
  // Sem repetição, "a,b" são dois canais e não o time "a".
  assert.deepEqual(lerElenco('ricoy, tchubi'), { times: [], soltos: ['ricoy', 'tchubi'], avisos: [] });
});

test('CSV sem cabeçalho: um time de uma linha só ainda é um time, e na dúvida há aviso', () => {
  const um = lerElenco('alpha,a1\nalpha,a2\nbeta,b1\ngamma,g1\ngamma,g2');
  assert.deepEqual(so(um), {
    times: [{ nome: 'alpha', canais: ['a1', 'a2'] }, { nome: 'beta', canais: ['b1'] }, { nome: 'gamma', canais: ['g1', 'g2'] }],
    soltos: [],
  });
  assert.deepEqual(um.avisos, []);
  // O canal escrito como link ou @ em todas as linhas diz qual das duas colunas é o time.
  const links = lerElenco('Alpha,https://kick.com/a1\nBravo,https://kick.com/b1');
  assert.deepEqual(so(links), {
    times: [{ nome: 'Alpha', canais: ['a1'] }, { nome: 'Bravo', canais: ['b1'] }],
    soltos: [],
  });
  // Sem nada que o diga, ficam canais, e o aviso explica como dizer que é time;canal.
  const duvida = lerElenco('Alpha;a1\nBravo;b1');
  assert.deepEqual(so(duvida), { times: [], soltos: ['alpha', 'a1', 'bravo', 'b1'] });
  assert.equal(duvida.avisos.length, 1);
  assert.match(duvida.avisos[0], /"time;canal"/);
  // Um CSV num bloco não muda a leitura de uma lista noutro bloco.
  const separados = lerElenco('alpha,a1\nalpha,a2\n\nricoy, tchubi');
  assert.deepEqual(separados, { times: [{ nome: 'alpha', canais: ['a1', 'a2'] }], soltos: ['ricoy', 'tchubi'], avisos: [] });
});

test('uma lista "nome, link" sem cabeçalho são canais, e não um time por streamer', () => {
  const soltos = { times: [], soltos: ['ricoy', 'tchubi', 'kodd'], avisos: [] };
  assert.deepEqual(lerElenco('Ricoy,https://kick.com/ricoy\nTchubi,https://kick.com/tchubi\nKodd,https://kick.com/kodd'), soltos);
  assert.deepEqual(lerElenco('Ricoy\thttps://kick.com/ricoy\nTchubi\thttps://kick.com/tchubi\nKodd\thttps://kick.com/kodd'), soltos);
  assert.deepEqual(lerElenco('ricoy,@ricoy\ntchubi,@tchubi\nkodd,@kodd'), soltos);
  const misto = lerElenco('Team Alpha: ricoy, tchubi\nTeam Bravo: kodd\n\nRicoy,https://kick.com/ricoy2\nX,https://kick.com/x');
  assert.deepEqual(so(misto), {
    times: [{ nome: 'Team Alpha', canais: ['ricoy', 'tchubi'] }, { nome: 'Team Bravo', canais: ['kodd'] }],
    soltos: ['ricoy2', 'x'],
  });
});

test('um time com os membros escritos "Nome, link" continua a ser um time', () => {
  const e = lerElenco('Team Alpha\nRicoy, https://kick.com/ricoy\nTchubi, https://kick.com/tchubi');
  assert.deepEqual(e, { times: [{ nome: 'Team Alpha', canais: ['ricoy', 'tchubi'] }], soltos: [], avisos: [] });
});

test('CSV sem cabeçalho lido só pelos links diz que leu um time por linha', () => {
  const e = lerElenco('Alpha,https://kick.com/a1\nBravo,https://kick.com/b1');
  assert.deepEqual(e.times, [{ nome: 'Alpha', canais: ['a1'] }, { nome: 'Bravo', canais: ['b1'] }]);
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /um time por linha/);
});

test('o cabeçalho conhece os nomes mais comuns da coluna do canal, e uma linha de dados não é cabeçalho', () => {
  for (const cab of ['Team Name,Kick Username', 'Team,Channel Name', 'Team,Kick Channel', 'Time,Nome do canal',
    'Team,Kick URL', 'Equipa,Nome na Kick']) {
    const e = lerElenco(`${cab}\nAlpha,a1\nAlpha,a2\nBeta,b1`);
    assert.deepEqual(so(e), {
      times: [{ nome: 'Alpha', canais: ['a1', 'a2'] }, { nome: 'Beta', canais: ['b1'] }],
      soltos: [],
    }, cab);
  }
  // "Time 1,player1" tem cara de cabeçalho, mas "Time 1" volta a aparecer na mesma coluna.
  const dados = lerElenco('Time 1,player1\nTime 1,ricoy\nTime 2,tchubi\nTime 2,kodd');
  assert.deepEqual(dados.times, [
    { nome: 'Time 1', canais: ['player1', 'ricoy'] },
    { nome: 'Time 2', canais: ['tchubi', 'kodd'] },
  ]);
});

test('o cabeçalho não toma o utilizador do Discord pelo canal da Kick', () => {
  const e = lerElenco('Time,Discord Username,Kick\nAlpha,ana#1,a1\nAlpha,bia#2,a2\nBeta,caio#3,b1');
  assert.deepEqual(e, {
    times: [{ nome: 'Alpha', canais: ['a1', 'a2'] }, { nome: 'Beta', canais: ['b1'] }], soltos: [], avisos: [],
  });
});

test('uma planilha com cabeçalho e sem time: o canal vem só da coluna do link, o resto é ignorado', () => {
  const csv = [
    'kick_url,seguidores,origem',
    'https://kick.com/lontrafeliz,38000,nick igual + Rust nas categorias',
    'https://kick.com/Pato_Bravo,,seguido por voce + nome parecido [Discord: Patinho]',
    'https://kick.com/gatomia,1200,"lista do Discord, canal #geral [Discord: Mia, a Gata]"',
    'https://kick.com/zebra99,7,"nota com ""aspas"", e vírgulas"',
    '',
  ].join('\r\n');
  const soltos = ['lontrafeliz', 'pato_bravo', 'gatomia', 'zebra99'];
  assert.deepEqual(lerElenco(csv), { times: [], soltos, avisos: [] });
  // A mesma coisa colada de uma folha (tabs), e com o link noutra coluna.
  const tsv = 'seguidores\tCanal\tnota\n10\tlontrafeliz\tDiscord: Lontra\n\tpato_bravo\t\n5\t@gatomia\tx, y\n3\tkick.com/zebra99\tok';
  assert.deepEqual(lerElenco(tsv), { times: [], soltos, avisos: [] });
  for (const cab of ['url,notas', 'link,notas', 'Streamer,notas', 'channel,notas']) {
    assert.deepEqual(lerElenco(`${cab}\nkick.com/lontrafeliz,"a, b [Discord: X]"\nkick.com/gatomia,c`),
      { times: [], soltos: ['lontrafeliz', 'gatomia'], avisos: [] }, cab);
  }
  // Uma coluna de Twitch não é a do canal.
  assert.deepEqual(lerElenco('twitch,kick\nlontra_tw,lontrafeliz\ngato_tw,gatomia').soltos, ['lontrafeliz', 'gatomia']);
});

test('uma planilha com coluna de time e notas com vírgulas lê o time e o canal, e mais nada', () => {
  const e = lerElenco([
    'kick_url,seguidores,time,origem',
    'https://kick.com/lontrafeliz,38000,Os Bichos,"nota, com vírgula [Discord: Lontra]"',
    'https://kick.com/gatomia,,Os Bichos,[Discord: Mia]',
    'https://kick.com/zebra99,7,,sem time',
  ].join('\n'));
  assert.deepEqual(e, { times: [{ nome: 'Os Bichos', canais: ['lontrafeliz', 'gatomia'] }], soltos: ['zebra99'], avisos: [] });
  const streamer = lerElenco('Streamer;Equipo\nlontrafeliz;Alfa\ngatomia;Alfa\nzebra99;Beta');
  assert.deepEqual(streamer.times, [{ nome: 'Alfa', canais: ['lontrafeliz', 'gatomia'] }, { nome: 'Beta', canais: ['zebra99'] }]);
});

test('de qualquer lista só saem os canais da Kick: pelo link, ou pela coluna do canal', () => {
  const soltos = { times: [], soltos: ['lontrafeliz', 'gatomia'], avisos: [] };
  for (const texto of [
    // CSV sem cabeçalho: o link e colunas de seguidores e notas.
    'https://kick.com/lontrafeliz,38000,nick igual + Rust\nhttps://kick.com/gatomia,,"seguido, por voce [Discord: Mia]"',
    // O link noutra coluna, com e sem cabeçalho, e com o nome do Discord ao lado.
    'nome,seguidores,endereco\nFulano,10,https://kick.com/lontrafeliz\nBeltrano,,https://kick.com/gatomia',
    'Fulano,10,https://kick.com/lontrafeliz\nBeltrano,,https://kick.com/gatomia',
    'Fulano\tDiscord: Lontra\tkick.com/lontrafeliz\nBeltrano\tDiscord: Mia\tkick.com/gatomia',
    // Texto: o link e uma nota à frente.
    'https://kick.com/lontrafeliz 38000 nick igual [Discord: Lontra]\nhttps://kick.com/gatomia',
    'kick.com/lontrafeliz - Discord: Lontra\nkick.com/gatomia (Discord: Zé Mia)',
    // Sem link: o nome do canal na coluna do canal, e a do Discord de fora.
    'Discord,Kick\nLontra#1,lontrafeliz\nMia#2,gatomia',
    'nome\tseguidores\tperfil\nFulano\t10\tlontrafeliz\nBeltrano\t\tgatomia',
  ]) assert.deepEqual(lerElenco(texto), soltos, texto);
  // Uma folha de um time por linha, com links em várias colunas, continua a dar times.
  assert.deepEqual(lerElenco('Os Bichos,kick.com/lontrafeliz,kick.com/gatomia\nAs Aves,kick.com/zebra99,kick.com/pato').times, [
    { nome: 'Os Bichos', canais: ['lontrafeliz', 'gatomia'] },
    { nome: 'As Aves', canais: ['zebra99', 'pato'] },
  ]);
});

test('uma lista sem cabeçalho cuja primeira linha tem cara de cabeçalho continua a ser dados', () => {
  // "Nick" é palavra de cabeçalho, mas a linha traz um link: é dado.
  assert.deepEqual(lerElenco('Nick,https://kick.com/nick\nRicoy,https://kick.com/ricoy\nTchubi,https://kick.com/tchubi'),
    { times: [], soltos: ['nick', 'ricoy', 'tchubi'], avisos: [] });
});

test('uma tabela com cabeçalho acaba na linha em branco; uma linha vazia da folha não a acaba', () => {
  const e = lerElenco('time,canal\nAlpha,a1\nAlpha,a2\n\nTeam B: b1, b2, b3');
  assert.deepEqual(so(e), {
    times: [{ nome: 'Alpha', canais: ['a1', 'a2'] }, { nome: 'Team B', canais: ['b1', 'b2', 'b3'] }],
    soltos: [],
  });
  assert.deepEqual(e.avisos, []);
  const folha = lerElenco('Time\tCanal\nAlpha\ta1\n\t\nAlpha\ta2\nBeta\tb1');
  assert.deepEqual(folha.times, [{ nome: 'Alpha', canais: ['a1', 'a2'] }, { nome: 'Beta', canais: ['b1'] }]);
  assert.deepEqual(folha.avisos, []);
});

test('uma folha de cálculo colada (tabs) e uma tabela Markdown', () => {
  const folha = lerElenco('Team Ricoy\tricoy\ttchubi\tkodd\tciscoo\nTeam Willjum\twilljum\tsinks\n');
  assert.deepEqual(folha.times, [
    { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd', 'ciscoo'] },
    { nome: 'Team Willjum', canais: ['willjum', 'sinks'] },
  ]);
  const tabela = lerElenco('| Time | Canal |\n|---|---|\n| Team Ricoy | ricoy |\n| Team Ricoy | @tchubi |\n');
  assert.deepEqual(tabela.times, [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] }]);
});

test('canais soltos, e o que fica de fora diz porquê', () => {
  const e = lerElenco([
    'ricoy',
    '@tchubi',
    'https://kick.com/kodd',
    'kick.com/ciscoo/videos',
    'www.kick.com/itrol?ref=x',
    'twitch.tv/zeko',
    'kick.com/category/rust',
    '@tchübi',
    'ricoy',
  ].join('\n'));
  assert.deepEqual(so(e), { times: [], soltos: ['ricoy', 'tchubi', 'kodd', 'ciscoo', 'itrol'] });
  assert.equal(e.avisos.length, 3);
  assert.match(e.avisos[0], /twitch\.tv\/zeko.*não é da Kick/);
  assert.match(e.avisos[1], /category\/rust.*não um canal/);
  assert.match(e.avisos[2], /tchübi.*não é um nome de canal/);
});

test('uma mensagem de Discord inteira, com prosa, papéis e quem não tem time', () => {
  const e = lerElenco([
    '# Rust Kick Off 3 — times',
    'Boa sorte a todos, e bom jogo!',
    '',
    '**Team Ricoy**',
    '1. kick.com/Ricoy',
    '2. @tchubi',
    '3. [Kod](https://kick.com/kodd)',
    '4. ciscoo',
    '',
    'Team Willjum: willjum, sinks; skrust | wash',
    'Reservas: ledoo',
    'Capitão: willjum',
    '',
    'Team Erobb221 @erobb221 @angelaoreo',
    '',
    'Sem time: rustkickoff, @kickstreaming',
    'Não esquecer de ligar o OBS antes das 18:00.',
    'Nota: o evento começa às 18h.',
    '',
    'Team Spoonkid: spoonkid, throat, luckyllama.',
  ].join('\n'));
  assert.deepEqual(so(e), {
    times: [
      { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd', 'ciscoo'] },
      { nome: 'Team Willjum', canais: ['willjum', 'sinks', 'skrust', 'wash', 'ledoo'] },
      { nome: 'Team Erobb221', canais: ['erobb221', 'angelaoreo'] },
      // Um ponto no fim de uma lista é pontuação, não uma frase.
      { nome: 'Team Spoonkid', canais: ['spoonkid', 'throat', 'luckyllama'] },
    ],
    soltos: ['rustkickoff', 'kickstreaming'],
  });
  assert.deepEqual(e.avisos, []);
});

test('repetições no texto: o mesmo time junta-se, o primeiro time ganha o canal', () => {
  const e = lerElenco([
    'convidado',
    '',
    'Team Ricoy: ricoy, tchubi, ricoy',
    'TEAM RICOY: kodd',
    'Team Willjum: willjum, tchubi, convidado',
    '',
    'Sem time: willjum, solto',
  ].join('\n'));
  assert.deepEqual(so(e), {
    times: [
      { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi', 'kodd'] },
      { nome: 'Team Willjum', canais: ['willjum', 'convidado'] },
    ],
    soltos: ['solto'],
  });
  assert.equal(e.avisos.length, 1, 'repetir no mesmo time, ou voltar a pôr solto, não é aviso');
  assert.match(e.avisos[0], /"tchubi" aparece em "Team Ricoy" e em "Team Willjum"; ficou em "Team Ricoy"/);
});

test('times vazios saem, e entradas vazias dão um elenco vazio', () => {
  assert.deepEqual(lerElenco('Team Vazio:\n\nTeam Ricoy: ricoy\nTeam Nada'), {
    times: [{ nome: 'Team Ricoy', canais: ['ricoy'] }], soltos: [], avisos: [],
  });
  for (const vazio of ['', '   \n\t\n', null, undefined]) {
    assert.deepEqual(lerElenco(vazio), { times: [], soltos: [], avisos: [] }, String(vazio));
  }
  assert.deepEqual(lerElenco(42), { times: [], soltos: ['42'], avisos: [] });
  const so_lixo = lerElenco('Olá! Isto não tem canais nenhuns, só conversa.');
  assert.deepEqual(so(so_lixo), { times: [], soltos: [] });
  assert.match(so_lixo.avisos.join(' '), /não encontrei nenhum canal/);
});

test('BOM, espaços que não partem e quebras de linha do Windows não mudam nada', () => {
  const e = lerElenco(`${BOM}Team${NBSP}Ricoy:${NBSP}ricoy,${NBSP}tchubi\r\nTeam Willjum: willjum\r\n`);
  assert.deepEqual(so(e), {
    times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] }, { nome: 'Team Willjum', canais: ['willjum'] }],
    soltos: [],
  });
});

test('demasiados avisos são resumidos em vez de encher o ecrã', () => {
  const e = lerElenco(Array.from({ length: 100 }, (_, i) => `@inválido${i}`).join('\n'));
  // 40 avisos, o resumo, e à cabeça o único que explica os outros todos.
  assert.equal(e.avisos.length, 42);
  assert.match(e.avisos[0], /não encontrei nenhum canal/);
  assert.equal(e.avisos.at(-1), 'e mais 60 avisos');
});

// ── paraTexto ───────────────────────────────────────────────────────────────

test('paraTexto escreve uma linha por time e os soltos no fim', () => {
  const e = { times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] }, { nome: 'Lobos', canais: ['a1'] }], soltos: ['org', 'x'] };
  assert.equal(paraTexto(e), 'Team Ricoy: ricoy, tchubi\nLobos: a1\n\nSem time: org, x');
  assert.equal(paraTexto({ times: [], soltos: ['org'] }), 'Sem time: org');
  assert.equal(paraTexto({ times: [], soltos: [] }), '');
  assert.equal(paraTexto(null), '');
});

test('paraTexto e lerElenco vão e voltam sem perder nada', () => {
  const casos = [
    lerElenco(paginaDeTimes(REAL)),
    { times: REAL, soltos: [] },
    { times: [], soltos: ['ricoy'] },
    { times: [], soltos: ['team', 'players', 'sem', 'time', 'canal', 'kick'] },
    { times: [{ nome: 'x', canais: ['x'] }], soltos: ['y'] },
    {
      times: [
        { nome: 'Time 1: Os Brabos', canais: ['a1', 'a2'] },
        { nome: 'Ricoy, Tchubi & Cia', canais: ['b1'] },
        { nome: '#1 Squad', canais: ['c1'] },
        { nome: '100 Thieves', canais: ['d1'] },
        { nome: 'Team (BR) | Norte; Sul', canais: ['e1'] },
        { nome: 'Águias do Norte 🔥', canais: ['f1'] },
        { nome: 'A - B', canais: ['g1'] },
        { nome: 'http://exemplo.com/time', canais: ['h1'] },
        { nome: 'kick.com/ricoy', canais: ['i1'] },
        { nome: 'Time "Lobo"', canais: ['j1.x', 'j_2', 'j-3'] },
        { nome: '@Team', canais: ['k1'] },
        { nome: 'Os Players United', canais: ['l1'] },
        { nome: '12:30 Squad', canais: ['m1'] },
      ],
      soltos: ['s1', 's2'],
    },
  ];
  for (const e of casos) {
    const volta = lerElenco(paraTexto(e));
    assert.deepEqual(so(volta), so(e), paraTexto(e));
    assert.deepEqual(volta.avisos, []);
  }
});

test('ida e volta com nomes e canais aleatórios: o texto é um ponto fixo', () => {
  let semente = 12345;
  const rnd = () => ((semente = (Math.imul(semente, 1103515245) + 12345) >>> 0) / 0x100000000);
  const escolher = (s) => s[Math.floor(rnd() * s.length)];
  const PEDACOS = ['Team', 'Time', ' ', ':', ': ', ',', ';', '|', '-', ' - ', '#', '1.', '**', '`', '<b>', '@', 'kick.com/',
    'https://', 'Águia', 'Ricoy', 'ricoy', '(BR)', '"', "'", '🔥', NBSP, '\t', '[x](y)', 'Players', 'Sem time', '12:30'];
  const LETRAS = 'abcdefghijklmnopqrstuvwxyz0123456789_.-';
  for (let volta = 0; volta < 300; volta++) {
    const bruto = {
      times: Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({
        nome: Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => escolher(PEDACOS)).join(''),
        canais: Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => (
          Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => escolher(LETRAS)).join(''))),
      })),
      soltos: Array.from({ length: Math.floor(rnd() * 3) }, () => `s${Math.floor(rnd() * 50)}`),
    };
    // A primeira passagem limpa o que um elenco feito à mão traz de inválido;
    // a partir daí escrever e ler de volta não pode mudar nada.
    const limpo = lerElenco(paraTexto(bruto));
    const outraVez = lerElenco(paraTexto(limpo));
    assert.deepEqual(so(outraVez), so(limpo), `${JSON.stringify(bruto)}\n${paraTexto(limpo)}`);
    assert.deepEqual(outraVez.avisos, []);
  }
});

test('paraTexto arruma um elenco feito à mão com as regras de sempre', () => {
  const e = {
    times: [
      { nome: '  Team   Ricoy: ', canais: ['@Ricoy', 'https://kick.com/Tchubi', 'ricoy', 'inválido!'] },
      { nome: 'team ricoy', canais: ['kodd'] },
      { nome: 'Players', canais: ['solto1'] },
      { nome: 'Vazio', canais: [] },
      { canais: ['semnome'] },
    ],
    soltos: ['@org', 'kodd'],
  };
  assert.equal(paraTexto(e), 'Team Ricoy: ricoy, tchubi, kodd\n\nSem time: solto1, semnome, org');
});

// ── link ────────────────────────────────────────────────────────────────────

/** Um gerador de canais com a mesma cara dos reais: cadeia de Markov de ordem 1 sobre os 150 reais.
 *  Medido: comprime PIOR do que canais reais que o gerador nunca viu (5,4 contra 5,0 bytes por canal),
 *  por isso o teste de tamanho não passa por sorte. */
function geradorDeCanais(semente) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const reais = REAL.flatMap((t) => t.canais);
  const proximo = new Map();
  for (const r of reais) {
    const w = `^${r}$`;
    for (let i = 1; i < w.length; i++) {
      if (!proximo.has(w[i - 1])) proximo.set(w[i - 1], []);
      proximo.get(w[i - 1]).push(w[i]);
    }
  }
  const vistos = new Set(reais);
  return () => {
    for (;;) {
      let w = '^';
      while (w.length < 30) {
        const op = proximo.get(w.at(-1));
        const c = op[Math.floor(rnd() * op.length)];
        if (c === '$') break;
        w += c;
      }
      const canal = w.slice(1);
      if (canal.length >= 3 && canal.length <= 16 && !vistos.has(canal)) { vistos.add(canal); return canal; }
    }
  };
}

const ADJETIVOS = ['Night', 'Iron', 'Red', 'Black', 'Silent', 'Golden', 'Frozen', 'Wild', 'Rusty', 'Toxic',
  'Savage', 'Lost', 'Dark', 'Crimson', 'Steel', 'Ghost', 'Lucky', 'Mad', 'Feral', 'Electric'];
const BICHOS = ['Raiders', 'Wolves', 'Bandits', 'Rats', 'Kings', 'Hunters', 'Nomads', 'Vipers', 'Outlaws', 'Ravens',
  'Scrappers', 'Goats', 'Bears', 'Pirates', 'Snakes', 'Sharks', 'Reapers', 'Miners', 'Owls', 'Crabs'];

/** 125 times de 4. Com `capitao`, os nomes são como os da página real: "Team <capitão>", e um em cada
 *  cinco com maiúsculas fora do sítio, como "Team hJune" e "Team CoconutB". Sem ele, duas palavras
 *  que não têm nada a ver com os canais ("Night Raiders"), como num evento que inventa os nomes. */
function eventoDe500(semente = 7, { capitao = true } = {}) {
  const novo = geradorDeCanais(semente);
  let s = (semente * 7919) >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const usados = new Set();
  const inventado = () => {
    for (;;) {
      const n = `${ADJETIVOS[Math.floor(rnd() * 20)]} ${BICHOS[Math.floor(rnd() * 20)]}`;
      if (!usados.has(n)) { usados.add(n); return n; }
    }
  };
  return {
    times: Array.from({ length: 125 }, (_, i) => {
      const canais = [novo(), novo(), novo(), novo()];
      const c = canais[0];
      const nome = !capitao ? inventado()
        : i % 5 === 4 ? `Team ${c.slice(0, -1)}${c.slice(-1).toUpperCase()}` : `Team ${c[0].toUpperCase()}${c.slice(1)}`;
      return { nome, canais };
    }),
    soltos: [],
    avisos: [],
  };
}

test('125 times de 4 cabem num link de menos de 4000 caracteres com os nomes da página real, e voltam iguais', async () => {
  for (const semente of [7, 42, 2026]) {
    const e = eventoDe500(semente);
    assert.equal(contar(e).canais, 500);
    const s = await codificar(e);
    assert.match(s, /^[A-Za-z0-9_-]+$/, 'só caracteres que um endereço aceita sem escapar');
    assert.ok(s.length < 4000, `${s.length} caracteres`);
    assert.deepEqual(await descodificar(s), e);
  }
});

test('com nomes de time inventados o link passa dos 4000 caracteres, mas não muito, e volta igual', async () => {
  // Os 4000 só se garantem quando o nome repete o capitão, que é o que `marcarNome` aproveita.
  // Nomes que não têm nada a ver com os canais custam 4142 a 4347 (medido com estas sementes):
  // o link abre na mesma, mas pode não caber numa mensagem do Discord de 4000.
  for (const semente of [7, 42, 2026]) {
    const e = eventoDe500(semente, { capitao: false });
    assert.equal(contar(e).canais, 500);
    const s = await codificar(e);
    assert.ok(s.length < 4600, `${s.length} caracteres`);
    assert.deepEqual(await descodificar(s), e);
  }
});

test('um elenco que não se poderia abrir de um link dá null em codificar, em vez de um link estragado', async () => {
  const soltos = (n) => Array.from({ length: n }, (_, i) => `c${i}`);
  assert.equal(await codificar({ times: [], soltos: soltos(2001) }), null);
  assert.deepEqual(await descodificar(await codificar({ times: [], soltos: soltos(2000) })),
    { times: [], soltos: soltos(2000), avisos: [] });
});

test('um elenco cujo link passaria do tamanho que se abre também dá null', async () => {
  // 2000 times com nomes de 80 letras ao acaso: canais dentro do limite, mas o link teria centenas de
  // milhares de caracteres, e `descodificar` recusa tudo o que passa dos 200 mil.
  let semente = 1;
  const rnd = () => ((semente = (Math.imul(semente, 1103515245) + 12345) >>> 0) / 0x100000000);
  const nome = () => Array.from({ length: 80 }, () => String.fromCodePoint(0x4e00 + Math.floor(rnd() * 20000))).join('');
  const e = { times: Array.from({ length: 2000 }, (_, i) => ({ nome: nome(), canais: [`c${i}`] })), soltos: [] };
  assert.equal(await codificar(e), null);
});

test('codificar e descodificar vão e voltam em todos os feitios de elenco', async () => {
  const casos = [
    lerElenco(paginaDeTimes(REAL)),
    { times: [], soltos: [], avisos: [] },
    { times: [], soltos: ['org', 'x'], avisos: [] },
    {
      times: [
        { nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] },
        { nome: 'team ricoy jr', canais: ['ricoyjr'] },
        { nome: 'ricoy2', canais: ['ricoy2'] },
        { nome: 'Os do ricoy3 e do Ricoy3', canais: ['ricoy3'] },
        { nome: '1st Squad', canais: ['1st'] },
        { nome: 'Águias 🔥 "BR"', canais: ['a.b', 'c_d', 'e-f'] },
      ],
      soltos: ['s1'],
      avisos: [],
    },
  ];
  for (const e of casos) {
    const s = await codificar(e);
    assert.deepEqual(await descodificar(s), e, JSON.stringify(e));
    assert.deepEqual(await descodificar(`  ${s}\n`), e, 'espaços à volta, de um copiar e colar');
  }
});

test('codificar arruma o elenco antes de o pôr no link', async () => {
  const s = await codificar({ times: [{ nome: 'A', canais: ['@Ricoy', 'kick.com/Tchubi', 'tchübi', 'a b'] }], soltos: ['ricoy', '@Org'] });
  assert.deepEqual(await descodificar(s), {
    times: [{ nome: 'A', canais: ['ricoy', 'tchubi'] }], soltos: ['org'], avisos: [],
  });
  assert.deepEqual(await descodificar(await codificar(null)), { times: [], soltos: [], avisos: [] });
});

/** Empacota qualquer coisa como `codificar` empacota, para fabricar links estragados. */
async function empacotar(texto) {
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(fluxo).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('um link estragado é null, nunca meio elenco', async () => {
  const bom = await codificar({ times: [{ nome: 'Team Ricoy', canais: ['ricoy', 'tchubi'] }], soltos: [] });
  const casos = [
    // Lixo DEPOIS do fim do deflate não está aqui de propósito: o Node aceita-o
    // e o Chrome recusa-o, e o elenco lido é o inteiro nos dois casos.
    '', '   ', '!!!!', 'não é base64', 'abc', 'A', bom.slice(0, -5), `${bom.slice(0, 10)}${bom.slice(11)}x`,
    `${bom}=`, `#${bom}`, `${bom.slice(0, 20)}+/${bom.slice(20)}`,
    await empacotar('isto não é JSON'),
    await empacotar('null'),
    await empacotar('[1,[],""]'),
    await empacotar('{"v":2,"t":[],"s":""}'),
    await empacotar('{"v":1,"t":{},"s":""}'),
    await empacotar('{"v":1,"t":[["A"]],"s":""}'),
    await empacotar('{"v":1,"t":[["A",["a"]]],"s":""}'),
    await empacotar('{"v":1,"t":[[1,"a"]],"s":""}'),
    await empacotar('{"v":1,"t":[],"s":["a"]}'),
    // Mais canais do que um evento real pode ter: é um ataque, não um elenco.
    await empacotar(JSON.stringify({ v: 1, t: [], s: Array.from({ length: 2001 }, (_, i) => `c${i}`).join(' ') })),
    'A'.repeat(200_001),
  ];
  for (const s of casos) assert.equal(await descodificar(s), null, String(s).slice(0, 80));
  for (const s of [null, undefined, 42, {}, [bom]]) assert.equal(await descodificar(s), null, String(s));
});

test('uma bomba de descompressão desiste cedo em vez de pendurar o separador', async () => {
  const bomba = await empacotar(`{"v":1,"t":[],"s":"${' '.repeat(20 << 20)}"}`);
  assert.ok(bomba.length < 100_000, `${bomba.length}`);
  const t0 = performance.now();
  assert.equal(await descodificar(bomba), null);
  assert.ok(performance.now() - t0 < 2000);
});

test('um link de outra pessoa passa pelas mesmas regras do texto colado', async () => {
  const s = await empacotar(JSON.stringify({
    v: 1,
    t: [
      ['*<script>', 'ricoy <img/src=x> TCHUBI ricoy'],
      ['Team Willjum', 'willjum tchubi'],
      ['Players', 'jogador'],
      ['Vazio', ''],
    ],
    s: 'org ricoy kick.com/category/rust',
  }));
  const e = await descodificar(s);
  assert.deepEqual(so(e), {
    times: [{ nome: 'Ricoyscript', canais: ['ricoy', 'tchubi'] }, { nome: 'Team Willjum', canais: ['willjum'] }],
    soltos: ['jogador', 'org'],
  });
  assert.equal(e.avisos.length, 4);
  assert.match(e.avisos.join('\n'), /"Players" parece um papel/);
  assert.match(e.avisos.join('\n'), /img\/src=x/);
  assert.match(e.avisos.join('\n'), /"tchubi" aparece em "Ricoyscript" e em "Team Willjum"/);
  assert.match(e.avisos.join('\n'), /category\/rust/);
});

// ── contar ──────────────────────────────────────────────────────────────────

test('contar conta times com gente e cada canal uma vez', () => {
  assert.deepEqual(contar(lerElenco(paginaDeTimes(REAL))), { times: 10, canais: 151 });
  assert.deepEqual(contar({ times: [{ nome: 'A', canais: ['a', 'b'] }, { nome: 'B', canais: ['b'] }, { nome: 'C', canais: [] }], soltos: ['a', 'c'] }),
    { times: 1, canais: 3 });
  for (const vazio of [null, undefined, {}, { times: 'x', soltos: 3 }]) {
    assert.deepEqual(contar(vazio), { times: 0, canais: 0 });
  }
});

// ── nunca atira ─────────────────────────────────────────────────────────────

test('lixo aleatório nunca atira e dá sempre um elenco bem formado', () => {
  let semente = 99;
  const rnd = () => ((semente = (Math.imul(semente, 1103515245) + 12345) >>> 0) / 0x100000000);
  const PEDACOS = ['<h3>', '</h3>', '<a href="https://kick.com/', '">', '</a>', '<a href=', 'kick.com/', '@', ':', ',', ';',
    '|', '\t', '\n', '\n\n', ' ', 'Team ', 'ricoy', 'tchubi', 'Players', 'Sem time', '"', '#', '**', '-', '1.', 'é', '🔥',
    '<footer>', '<nav>', '<article>', '</article>', 'time,canal\n', '&amp;', '&#0;', '&#x110000;', '<script>', '<!--'];
  for (let i = 0; i < 500; i++) {
    const texto = Array.from({ length: Math.floor(rnd() * 60) }, () => PEDACOS[Math.floor(rnd() * PEDACOS.length)]).join('');
    const e = lerElenco(texto);
    const todos = [...e.times.flatMap((t) => t.canais), ...e.soltos];
    assert.equal(new Set(todos).size, todos.length, `um canal num só sítio: ${JSON.stringify(texto)}`);
    for (const c of todos) assert.match(c, /^[a-z0-9_.-]{1,60}$/);
    for (const t of e.times) {
      assert.ok(t.canais.length > 0);
      assert.ok(t.nome && !/[<>]/.test(t.nome));
    }
    assert.ok(Array.isArray(e.avisos));
  }
});
