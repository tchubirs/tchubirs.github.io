// Ouvir um ficheiro e dizer, som a som, o que o detector achou que era um tiro.
//
// "Criei 3 clipes automáticos e não, eu não dou 1 tiro. Você com certeza está
//  vendo algo errado." — e tem razão: o detector não sabe explicar-se. Marca
//  uma luta e cala-se. Sem saber O QUE ele ouviu, qualquer correcção que eu
//  fizesse aos números (8x, 6x, 14 s) era um palpite.
//
// Isto corre o MESMO código de `site/tiros.js` — não uma cópia parecida — em
// cima de um ficheiro que ele descarregou, e imprime o que lá está: o chão, os
// impulsos, a altura de cada um, e se davam ou não uma luta.
//
//   node probes/ouvir.mjs clipe.webm
//   node probes/ouvir.mjs clipe.webm --chao 0.0012   (o chão da noite inteira)
//
// O chão é a única coisa que um clipe curto não sabe: em `tiros.js` é a mediana
// da NOITE, e aqui, sem mais nada, só pode ser a mediana do clipe. Num clipe de
// 70 s quase todo em tiroteio, essa mediana vem alta e ESCONDE os impulsos —
// por isso o `--chao` existe, e por isso o número aparece impresso em vez de
// ficar escondido dentro da conta.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  TAXA_TIROS, BLOCO_MS, FPS, energia, chao, impulsos, lutas,
} from '../site/tiros.js';

/** ffmpeg a despir o ficheiro: mono, 24 kHz, float cru. */
function descodificar(caminho) {
  return new Promise((ok, mal) => {
    const ff = spawn('ffmpeg', [
      '-v', 'error', '-i', caminho,
      '-vn', '-ac', '1', '-ar', String(TAXA_TIROS), '-f', 'f32le', '-',
    ]);
    const pedacos = []; let erro = '';
    ff.stdout.on('data', (d) => pedacos.push(d));
    ff.stderr.on('data', (d) => { erro += d; });
    ff.on('error', mal);
    ff.on('close', (c) => {
      if (c !== 0) return mal(new Error(erro.trim() || `ffmpeg saiu com ${c}`));
      const b = Buffer.concat(pedacos);
      return ok(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)));
    });
  });
}

const relogio = (s) => {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};

const caminho = process.argv[2];
if (!caminho) {
  console.error('uso: node probes/ouvir.mjs <ficheiro> [--chao N] [--altura N] [--salto N]');
  process.exit(2);
}
const arg = (nome, omissao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? Number(process.argv[i + 1]) : omissao;
};

const amostras = await descodificar(caminho);
const duracaoS = amostras.length / TAXA_TIROS;
const bytes = readFileSync(caminho).length;
console.log(`ficheiro   ${caminho}  (${(bytes / 1048576).toFixed(1)} MB)`);
console.log(`som        ${duracaoS.toFixed(2)} s a ${TAXA_TIROS} Hz, blocos de ${BLOCO_MS} ms`);
if (!amostras.length) {
  console.log('\nSEM SOM NENHUM. O ficheiro tem imagem mas não tem faixa de áudio —');
  console.log('e um clipe mudo é a explicação mais simples para um tiro que não existiu.');
  process.exit(0);
}

const blocos = energia(amostras, TAXA_TIROS);
const doClipe = chao(blocos);
const piso = arg('chao', doClipe);
const alturaMin = arg('altura', 8);
const saltoMin = arg('salto', 6);

const orden = Float32Array.from(blocos).sort();
const pct = (p) => orden[Math.min(orden.length - 1, Math.floor(orden.length * p))];
console.log(`chão       ${doClipe.toExponential(3)} (mediana DESTE clipe)`
  + (piso === doClipe ? '' : `  →  a usar ${piso.toExponential(3)}`));
console.log(`percentis  p10 ${pct(0.1).toExponential(2)}  p50 ${pct(0.5).toExponential(2)}`
  + `  p90 ${pct(0.9).toExponential(2)}  máx ${orden[orden.length - 1].toExponential(2)}`);
console.log(`o mais alto do clipe está a ${(orden[orden.length - 1] / piso).toFixed(1)}x do chão`);

const imps = impulsos(blocos, piso, { alturaMin, saltoMin });
console.log(`\nimpulsos   ${imps.length}  (alto ≥${alturaMin}x o chão E salto ≥${saltoMin}x em 2 ms)`);
for (const i of imps.slice(0, 60)) {
  console.log(`  ${relogio(i.bloco / FPS)}   ${i.altura.toFixed(1)}x`);
}
if (imps.length > 60) console.log(`  … e mais ${imps.length - 60}`);

const gs = lutas(imps, { minTiros: 4, juntarS: 14, maxLutaS: 90 });
console.log(`\nlutas      ${gs.length}  (≥4 impulsos a ≤14 s uns dos outros)`);
for (const g of gs) {
  console.log(`  ${relogio(g.inicioS)} → ${relogio(g.fimS)}   ${g.duracaoS.toFixed(1)} s`
    + `   ${g.tiros} impulsos   pico ${g.pico.toFixed(1)}x`);
}
if (!gs.length && imps.length) {
  console.log('  nenhuma: há impulsos soltos, mas nunca quatro suficientemente juntos.');
}

// Os mais altos do clipe, hajam ou não impulsos. É a resposta à pergunta dele:
// "o que é que ele ouviu ali?" — mesmo quando a resposta é "nada de especial".
const topo = [...blocos.entries()].sort((a, b) => b[1] - a[1]);
const vistos = [];
for (const [b, v] of topo) {
  if (vistos.some((o) => Math.abs(o.b - b) < FPS * 0.5)) continue;
  vistos.push({ b, v });
  if (vistos.length === 10) break;
}
console.log('\nos 10 momentos mais altos do clipe (meio segundo de intervalo entre eles):');
for (const { b, v } of vistos) {
  console.log(`  ${relogio(b / FPS)}   ${(v / piso).toFixed(1)}x o chão`
    + `   salto ${(v / (blocos[b - 1] + 1e-9)).toFixed(1)}x`);
}
