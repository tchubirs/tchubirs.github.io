// "Cada um começou a transmitir num horário e acabou noutro — como sincronizar?"
//
// Não se sincroniza pelo início da transmissão. Sincroniza-se pelo RELÓGIO DE
// PAREDE, que cada segmento de vídeo carrega dentro de si.
//
// Cada pedaço de 10 s traz um EXT-X-PROGRAM-DATE-TIME: o instante real, em UTC
// e ao milissegundo, em que aquele vídeo foi capturado. Então a pergunta deixa
// de ser "quanto tempo depois do início" e passa a ser "que horas eram" — e
// essa tem a mesma resposta para toda a gente.
//
// Correr:  node probes/demo-relogio.mjs

import { linhaDoCanal, onde, janelaComum, quantosNoAr } from '../site/relogio.js';

/** Um canal que começou às X e transmitiu Y minutos, em pedaços de 10 s. */
const canal = (slug, comecouEm, minutos) => {
  const inicio = Date.parse(comecouEm);
  const segmentos = [];
  for (let s = 0; s < minutos * 60; s += 10) {
    segmentos.push({ url: `${s}.ts`, inicio: inicio + s * 1000, duracaoS: 10, mediaT: s });
  }
  return linhaDoCanal(slug, [{
    vod: { id: slug },
    playlist: {
      segmentos,
      fonteDoRelogio: 'program-date-time',
      inicio,
      fim: inicio + minutos * 60_000,
      duracaoS: minutos * 60,
    },
  }]);
};

// Uma noite de Rust como ela é: ninguém começa junto, ninguém acaba junto, e um
// deles caiu a meio e voltou vinte minutos depois.
const linhas = [
  canal('tchubi', '2026-08-30T21:00:00Z', 180),
  canal('amigo1', '2026-08-30T21:47:12Z', 95),
  canal('amigo2', '2026-08-30T20:12:40Z', 240),
  canal('atrasado', '2026-08-30T23:30:00Z', 60),
  canal('cedinho', '2026-08-30T19:00:00Z', 70),
];

// O que caiu e voltou: dois VODs, e um buraco de 20 minutos entre eles.
const caiu = linhaDoCanal('caiu', [
  canal('x', '2026-08-30T21:10:00Z', 40).pecas[0],
  canal('x', '2026-08-30T22:10:00Z', 60).pecas[0],
]);
linhas.push({ ...caiu, slug: 'caiu' });

const hora = (ms) => new Date(ms).toISOString().slice(11, 19);
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(3)}min ${String(Math.floor(s % 60)).padStart(2, '0')}s`;

console.log('\nA NOITE, como cada um a viu\n');
for (const l of linhas) {
  console.log(`  ${l.slug.padEnd(10)} ${hora(l.inicio)} → ${hora(l.fim)}`
    + `${l.buracos.length ? `   (caiu ${Math.round(l.buracos[0].segundos / 60)} min)` : ''}`);
}

const j = janelaComum(linhas);
console.log(`\n  a noite inteira:  ${hora(j.inicio)} → ${hora(j.fim)}`);
if (j.haSobreposicao) {
  console.log(`  todos ao mesmo tempo: ${hora(j.sobreposicaoInicio)} → ${hora(j.sobreposicaoFim)}`
    + '   ← só aqui dá para cortar todos os ângulos');
} else {
  // E é isto que acontece nesta noite: o 'cedinho' acabou às 20:10 e o
  // 'atrasado' só começou às 23:30. Não existe um instante com todos. Dizer
  // "23:30 → 20:10" seria pior do que não dizer nada — parece uma resposta.
  console.log('  todos ao mesmo tempo: NUNCA — nem todos estiveram no ar juntos');
}

for (const instante of ['2026-08-30T22:15:30Z', '2026-08-30T21:55:00Z', '2026-08-30T19:30:00Z']) {
  const t = Date.parse(instante);
  console.log(`\nÀS ${hora(t)} — o mesmo instante, para todos\n`);
  console.log(`  (${quantosNoAr(linhas, t)} de ${linhas.length} ângulos existem aqui)\n`);
  for (const l of linhas) {
    const r = onde(l, t);
    const diz = r.estado === 'toca' ? `está no ${mmss(r.tempoS)} do vídeo dele`
      : r.estado === 'antes' ? `ainda não tinha começado (faltavam ${Math.round(r.faltamS / 60)} min)`
        : r.estado === 'depois' ? `já tinha acabado há ${Math.round(r.passouS / 60)} min`
          : r.estado === 'buraco' ? 'estava fora do ar' : 'sem vídeo';
    console.log(`  ${l.slug.padEnd(10)} ${diz}`);
  }
}

console.log('\nRepara: o número da esquerda é o MESMO para todos — são as mesmas horas.');
console.log('O número da direita é diferente em cada um, porque cada um começou');
console.log('a gravar noutra altura. É essa conta que o programa faz por ti.\n');
