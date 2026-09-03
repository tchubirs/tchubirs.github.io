// Procurar as MORTES de alguém no VOD dele, para ler quem o matou.
//
// "Tão dando stream sniper no meu companheiro. Consegue achar quem é?"
//
// O Rust responde a essa pergunta sozinho: quando alguém morre, o ecrã da
// VÍTIMA escreve o nome de quem matou. Não é preciso API nenhuma, nem token,
// nem lista de servidor — é preciso olhar para o ecrã dele no instante certo.
//
// O problema é achar o instante numa noite de sete horas. Isto faz isso pela
// cor: o ecrã da morte no Rust é escuro e puxado ao vermelho, e nada mais no
// jogo é as duas coisas ao mesmo tempo por vários segundos seguidos.
//
//   node probes/mortes.mjs <playlist m3u8> <duracaoS> [passoS]
//
// Não descarrega o VOD: pede um frame de cada vez ao ffmpeg, que só busca os
// pedaços à volta daquele segundo. Medido: 1,4 s por frame no 360p, portanto
// uma noite de sete horas a passos de 30 s sai em cerca de vinte minutos e
// uns quarenta megas — em vez dos dois gigas que o VOD inteiro custaria.

import { spawn } from 'node:child_process';

const [playlist, duracao, passo = '30'] = process.argv.slice(2);
if (!playlist || !duracao) {
  console.error('uso: node probes/mortes.mjs <playlist m3u8> <duracaoS> [passoS]');
  process.exit(2);
}

const LARGURA = 320;
const ALTURA = 180;

/** Um frame, em pixels crus, sem passar pelo disco. */
function frame(url, segundos) {
  return new Promise((ok) => {
    const ff = spawn('ffmpeg', [
      '-v', 'error', '-ss', String(segundos), '-i', url, '-frames:v', '1',
      '-vf', `scale=${LARGURA}:${ALTURA}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ]);
    const p = [];
    ff.stdout.on('data', (d) => p.push(d));
    ff.on('error', () => ok(null));
    ff.on('close', () => {
      const b = Buffer.concat(p);
      ok(b.length >= LARGURA * ALTURA * 3 ? b : null);
    });
  });
}

/**
 * Escuro E vermelho.
 *
 * As duas juntas, e nenhuma sozinha: escuro sozinho é uma gruta ou a noite,
 * e vermelho sozinho é o pôr do sol — que numa noite de Rust aparece a cada
 * ciclo. O ecrã da morte é o único sítio onde o vermelho ganha ao verde e ao
 * azul em quase todo o quadro AO MESMO TEMPO que o quadro está escuro.
 */
function medir(b) {
  let soma = 0;
  let vermelhos = 0;
  const n = LARGURA * ALTURA;
  for (let i = 0; i < n; i++) {
    const r = b[i * 3];
    const g = b[i * 3 + 1];
    const a = b[i * 3 + 2];
    soma += (r + g + a) / 3;
    if (r > g + 12 && r > a + 12) vermelhos++;
  }
  return { brilho: soma / n, vermelho: vermelhos / n };
}

const dur = Number(duracao);
const salto = Number(passo);
const linhas = [];
const t0 = Date.now();
for (let t = 0; t < dur; t += salto) {
  // eslint-disable-next-line no-await-in-loop
  const b = await frame(playlist, t);
  if (!b) continue;
  const m = medir(b);
  linhas.push({ t, ...m });
  if (m.brilho < 70 && m.vermelho > 0.35) {
    const h = Math.floor(t / 3600);
    const min = Math.floor((t % 3600) / 60);
    console.log(`CANDIDATO  ${h}:${String(min).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
      + `  (${t}s)  brilho ${m.brilho.toFixed(0)}  vermelho ${(m.vermelho * 100).toFixed(0)}%`);
  }
  if (linhas.length % 60 === 0) {
    const feito = ((t / dur) * 100).toFixed(0);
    console.log(`… ${feito}%  (${linhas.length} frames, ${Math.round((Date.now() - t0) / 1000)}s)`);
  }
}

// O retrato do que se viu, para a próxima vez os cortes saírem de números e
// não de gosto.
const ord = (k) => linhas.map((l) => l[k]).sort((a, b) => a - b);
const pct = (v, p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
const br = ord('brilho');
const vm = ord('vermelho');
console.log(`\n${linhas.length} frames em ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`brilho    p05 ${pct(br, 0.05).toFixed(0)}  mediana ${pct(br, 0.5).toFixed(0)}  p95 ${pct(br, 0.95).toFixed(0)}`);
console.log(`vermelho  p05 ${(pct(vm, 0.05) * 100).toFixed(0)}%  mediana ${(pct(vm, 0.5) * 100).toFixed(0)}%  p95 ${(pct(vm, 0.95) * 100).toFixed(0)}%`);
const escuros = [...linhas].sort((a, b) => a.brilho - b.brilho).slice(0, 10);
console.log('\nos dez mais escuros:');
for (const l of escuros) {
  console.log(`  ${String(l.t).padStart(6)}s  brilho ${l.brilho.toFixed(0)}  vermelho ${(l.vermelho * 100).toFixed(0)}%`);
}
