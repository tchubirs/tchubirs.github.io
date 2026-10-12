// As mortes do servidor (mortes.js): ler os formatos reais dos plugins, pôr as horas no relógio dos
// vídeos, casar os nomes do jogo com os canais, e o que entra nos melhores lances.
//
// Os arquivos em test/mortes/ usam as frases tal como os plugins as escrevem (lidas no código deles no
// umod.org em 12/10: DeathNotes 6.5.8, Discord Death 2.2.1, Rustcord 3.4.3) e o jeito como o Discord
// copia as mensagens (o autor, "APP", a hora, e "[21:15]" nas mensagens seguidas). Os nomes são de
// mentira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lerMortes, lerFrase, horasDasMortes, canalDoNome, casarMortes, nomesSemCanal, marcasDasMortes, juntarMortes,
  mortesParaGuardar, mortesGuardadas, metros, ordemDasDatas,
} from '../site/mortes.js';
import { sinaisDoEvento, melhoresLances, motivoDoLance, filtrarLances, PONTOS } from '../site/melhores.js';
import { definirIdioma } from '../site/idiomas.js';

const ler = (f) => lerMortes(readFileSync(new URL(`./mortes/${f}`, import.meta.url), 'utf8'));
const resumo = (m) => [m.matador, m.vitima, m.arma, m.distancia, `${m.hora.h}:${m.hora.m}:${m.hora.s ?? '--'}`].join('|');

test('DeathNotes no chat: as frases do plugin, a cor tirada, o NPC e a linha sem hora ficam listados', () => {
  const r = ler('deathnotes-chat.txt');
  assert.deepEqual(r.mortes.map(resumo), [
    'Newt|Zeca|Assault Rifle|45.3|21:14:7',
    'Newt|Zeca|Compound Bow|12.8|21:15:12',
    '[ABS] Elchapo|Newt|Machete||21:16:2',
    'Newt|Elchapo|Flame Thrower||21:17:30',
  ]);
  assert.deepEqual(r.naoLidas.map((x) => [x.linha, x.motivo]), [[3, 'npc'], [6, 'desconhecida'], [7, 'semHora']]);
});

test('DeathNotes no log do Oxide: a hora à frente, e a linha que não é morte fica listada', () => {
  const r = ler('deathnotes-console.txt');
  assert.deepEqual(r.mortes.map(resumo), ['Newt|Zeca|Assault Rifle|45.3|21:14:--', 'Zeca|Damoniak|Custom SMG||21:16:--']);
  assert.deepEqual(r.naoLidas.map((x) => x.texto), ['21:17 [Info] Saving complete']);
});

test('Discord Death copiado do Discord: a frase entre espadas, a hora do cabeçalho, os campos não viram linhas soltas', () => {
  const r = ler('discord-death.txt');
  assert.deepEqual(r.mortes.map(resumo), ['Newt|Zeca|Assault Rifle|45.3|21:14:--', 'Damoniak|Elchapo|Thompson||21:20:--']);
  assert.equal(r.mortes[0].hora.rel, 'hoje');
  // O título do quadro (o nome do servidor) não é uma morte: aparece na lista, nunca some calado.
  assert.deepEqual(r.naoLidas.map((x) => x.texto), ['Abisal Rust', 'Abisal Rust']);
});

test('Rustcord simples copiado do Discord em português: "Hoje às", "[21:15]" e a data com dia/mês', () => {
  const r = ler('rustcord-simples.txt');
  assert.deepEqual(r.mortes.map(resumo), [
    'Newt|Zeca|||21:14:--', 'Zeca|Damoniak|||21:15:--', 'Elchapo|Newt|||21:16:--', 'Damoniak|Elchapo|||23:59:--',
  ]);
  assert.equal(r.mortes[3].hora.data, '2026-10-12');
  assert.deepEqual(r.naoLidas, []);
});

test('Rustcord em quadro: a morte sai dos campos Victim e Killer', () => {
  const r = ler('rustcord-quadro.txt');
  assert.deepEqual(r.mortes.map(resumo), ['Newt|Zeca|||21:14:--']);
  assert.equal(r.mortes[0].hora.rel, 'ontem');
  assert.deepEqual(r.naoLidas, []);
});

test('a forma simples: hora com segundos, arma e distância entre parênteses, e ISO com Z', () => {
  const r = ler('simples.txt');
  assert.deepEqual(r.mortes.map(resumo), [
    'Newt|Zeca|Assault Rifle|45|21:14:7', 'Zeca|Damoniak|||21:15:30', 'Elchapo|Newt|Bolt Action Rifle|210|21:16:0',
  ]);
  assert.equal(r.mortes[2].hora.absMs, Date.parse('2026-10-12T21:16:00Z'));
  assert.deepEqual(r.naoLidas.map((x) => x.texto), ['isto não é uma morte']);
});

test('frases soltas: 12 h com PM, português e espanhol, pés e jardas', () => {
  assert.deepEqual(lerFrase('fulano matou ciclano (AK, 30 m)'), { matador: 'fulano', vitima: 'ciclano', arma: 'AK', distancia: 30 });
  assert.deepEqual(lerFrase('fulano mató a ciclano'), { matador: 'fulano', vitima: 'ciclano', arma: null, distancia: null });
  assert.deepEqual(lerFrase('a Wolf killed Newt'), { npc: true });
  assert.equal(metros('148 feet'), 45.1);
  assert.equal(metros('50 yards'), 45.7);
  const r = lerMortes('Rustcord\nAPP\n — Today at 9:14 PM\n☠️ Newt killed Zeca.\n[9:15 PM]\n☠️ Zeca killed Newt.');
  assert.deepEqual(r.mortes.map((m) => `${m.hora.h}:${m.hora.m}`), ['21:14', '21:15']);
  assert.equal(ordemDasDatas('— 10/13/2026 9:14 PM'), 'md');
  assert.equal(ordemDasDatas('— 10/12/2026 9:14 PM', 'en-US'), 'md');
  assert.equal(ordemDasDatas('— 10/12/2026 21:14', 'pt-BR'), 'dm');
});

test('as horas: o fuso, a meia-noite que passa, a data escrita, a hora absoluta e o alinhamento', () => {
  const ref = Date.parse('2026-10-12T23:00:00Z'); // 20:00 em UTC-3
  const mortes = [
    { hora: { data: null, h: 21, m: 14, s: 7 } },
    { hora: { data: null, h: 23, m: 59, s: 0 } },
    { hora: { data: null, h: 0, m: 10, s: null } },
    { hora: { data: '2026-10-13', h: 1, m: 0, s: 0 } },
    { hora: { data: '2026-10-12', h: 0, m: 0, s: 0, absMs: Date.parse('2026-10-13T05:00:00Z') } },
  ];
  const r = horasDasMortes(mortes, { fusoMin: -180, refMs: ref });
  assert.deepEqual(r.map((m) => new Date(m.ms).toISOString()), [
    '2026-10-13T00:14:07.000Z', '2026-10-13T02:59:00.000Z', '2026-10-13T03:10:00.000Z', '2026-10-13T04:00:00.000Z',
    '2026-10-13T05:00:00.000Z',
  ]);
  assert.equal(r[2].soMinuto, true);
  const alinhadas = horasDasMortes(mortes, { fusoMin: -180, refMs: ref, ajusteMs: 12_000 });
  assert.equal(alinhadas[0].ms - r[0].ms, 12_000);
});

test('os nomes: sem maiúsculas nem acentos, pelo apelido, sem a tag do clã; dois canais iguais não decidem', () => {
  const canais = ['newt_tv', 'zeca', 'elchapotv', 'joao'];
  const apelidos = new Map([['newt_tv', ['Newt']], ['elchapotv', ['ElChapo']]]);
  assert.equal(canalDoNome('NEWT', canais, apelidos), 'newt_tv');
  assert.equal(canalDoNome('Zéca', canais, apelidos), 'zeca');
  assert.equal(canalDoNome('[ABS] Elchapo', canais, apelidos), 'elchapotv');
  assert.equal(canalDoNome('João', canais, apelidos), 'joao');
  assert.equal(canalDoNome('Damoniak', canais, apelidos), null);
  assert.equal(canalDoNome('Zeca', [...canais, 'zecaa'], new Map([['zecaa', ['zeca']]])), null);
});

test('as marcas: uma na faixa de quem matou e outra na de quem morreu, fora do jogo do evento não', () => {
  const r = ler('rustcord-simples.txt');
  const comId = juntarMortes([], r.mortes).mortes;
  const ref = Date.parse('2026-10-12T20:00:00Z');
  const casadas = casarMortes(horasDasMortes(comId, { fusoMin: 0, refMs: ref }), ['newt', 'zeca', 'elchapo']);
  assert.deepEqual(nomesSemCanal(casadas), [{ nome: 'Damoniak', vezes: 2 }]);
  const marcas = marcasDasMortes(casadas);
  assert.deepEqual(marcas.get('newt').map((m) => m.papel), ['matou', 'morreu']);
  assert.deepEqual(marcas.get('zeca').map((m) => m.papel), ['morreu', 'matou']);
  assert.equal(marcas.get('newt')[0].ms, Date.parse('2026-10-12T21:14:00Z'));
  const semZeca = marcasDasMortes(casadas, { fora: (c) => c === 'zeca' });
  assert.equal(semZeca.has('zeca'), false);
  assert.equal(semZeca.get('newt').length, 2);
});

test('importar duas vezes o mesmo texto não repete; o que se guarda volta igual', () => {
  const r = ler('deathnotes-chat.txt');
  const a = juntarMortes([], r.mortes);
  const b = juntarMortes(a.mortes, r.mortes);
  assert.equal(a.novas, 4);
  assert.equal(b.novas, 0);
  assert.equal(b.repetidas, 4);
  const volta = mortesGuardadas(JSON.parse(JSON.stringify(mortesParaGuardar(a.mortes))));
  assert.deepEqual(volta.map((m) => [m.id, m.matador, m.vitima, m.arma, m.hora.h, m.hora.m, m.hora.s]),
    a.mortes.map((m) => [m.id, m.matador, m.vitima, m.arma, m.hora.h, m.hora.m, m.hora.s]));
  assert.deepEqual(mortesGuardadas([{ id: 1, matador: 'x' }, null, 'lixo']), []);
});

test('nos melhores lances: um sinal forte, quem matou e quem morreu juntos, com o motivo escrito', () => {
  definirIdioma('pt');
  const ms = Date.parse('2026-10-12T21:14:07Z');
  const mortes = [{ id: 0, matador: 'Newt', vitima: 'Zeca', ms, canalMatador: 'newt', canalVitima: 'zeca' }];
  // Um pico de chat de outro canal, sem time, no mesmo minuto: não entra no lance da morte.
  const marcas = new Map([['outro', [{ tipo: 'chat', ms: ms + 20_000, vezes: 4 }]]]);
  const lances = melhoresLances(sinaisDoEvento({ marcas, mortes }), { grupoDe: () => null });
  assert.equal(lances.length, 2);
  const [l] = lances;
  assert.deepEqual(l.canais, ['newt', 'zeca'], 'quem matou vai à frente');
  assert.equal(l.ms, ms);
  assert.equal(l.msAbrir, ms - 10_000);
  assert.equal(motivoDoLance(l), 'morte no servidor: Newt matou Zeca');
  assert.ok(l.partes.some((p) => p.tipo === 'morte' && p.pontos === PONTOS.morte));
  assert.equal(filtrarLances(lances, { soKills: true }).length, 1, '"Só com kill" mostra a morte do servidor');
  // A mesma morte posta na montagem não conta duas vezes.
  const momentos = [{ ms, protagonista: 'newt', vitimas: ['zeca'], origem: 'servidor' }];
  const [l2] = melhoresLances(sinaisDoEvento({ mortes, momentos }), { grupoDe: () => null });
  assert.equal(l2.kills, 0);
  assert.equal(l2.pontos, l.pontos);
});
