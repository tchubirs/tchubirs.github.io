// Mede o filtro de alertas (site/alertas.js) em som de lives de verdade: lista as explosões que a detecção
// acha, o que o filtro tira (grupo que repete, ou alerta que o canal já conhecia) e porquê, e grava
// amostras (WAV e PNG do espectro) de cada alerta aprendido para o dono ouvir e olhar.
//
// O som tem que vir já descodificado: mono, 24 kHz, float cru. Com ffmpeg:
//   ffmpeg -i trecho.ts -vn -ac 1 -ar 24000 -f f32le canal.f32
// (ou, sem ffmpeg, `probes/pcm-8khz.py` com taxa 24000, que precisa do pacote av).
//
//   node probes/alertas-vods.mjs --saida <pasta> canal1.f32 canal2.f32 ...
//   node probes/alertas-vods.mjs --saida <pasta> --positivo modelo.json canal.f32
//   node probes/alertas-vods.mjs --treinar confirmadas.json --saida <pasta>
//       confirmadas.json: [{ "arquivo": "canal.f32", "inicioS": 120.5, "fimS": 122 }, ...]
//       grava <pasta>/modelo-explosao.json (vetores, não áudio: pode ir para o git)
//
// O que sai é MEDIDA do filtro e não verdade: ninguém ouve o som aqui. O chão de verdade é o que se
// confirma por fora (chat, tela, o dono a ouvir as amostras).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import zlib from 'node:zlib';
import { medirGraves, explosoes as acharExplosoes } from '../site/explosoes.js';
import { chao } from '../site/tiros.js';
import {
  medirEspectro, assinar, tirarAlertas, treinarPositivo, pontuar, FPS_ESP, BANDAS, TAXA_ESP,
} from '../site/alertas.js';

const TAXA = TAXA_ESP;
const args = process.argv.slice(2);
const pega = (nome) => { const i = args.indexOf(`--${nome}`); if (i < 0) return null; const [, v] = args.splice(i, 2); return v; };
const saida = pega('saida') || '.';
const positivoArq = pega('positivo');
const treinarArq = pega('treinar');
mkdirSync(saida, { recursive: true });

function ler(caminho) {
  const b = readFileSync(caminho);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
}

const relogio = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;

function wav(caminho, x) {
  const d = Buffer.alloc(44 + x.length * 2);
  d.write('RIFF', 0); d.writeUInt32LE(36 + x.length * 2, 4); d.write('WAVEfmt ', 8);
  d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22);
  d.writeUInt32LE(TAXA, 24); d.writeUInt32LE(TAXA * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34);
  d.write('data', 36); d.writeUInt32LE(x.length * 2, 40);
  let pico = 0;
  for (const v of x) pico = Math.max(pico, Math.abs(v));
  const g = pico > 0 ? 0.8 / pico : 1;
  for (let i = 0; i < x.length; i++) d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] * g)) * 32767), 44 + i * 2);
  writeFileSync(caminho, d);
}

function png(caminho, esp, de, ate, k = 8) {
  // espectrograma em cinza: tempo para a direita, graves em baixo; cada quadro ocupa k pixels
  const n = ate - de;
  const L = n * k;
  const A = BANDAS * k;
  const cru = Buffer.alloc((L + 1) * A);
  for (let y = 0; y < A; y++) {
    const b = BANDAS - 1 - Math.floor(y / k);
    cru[y * (L + 1)] = 0;
    for (let x = 0; x < L; x++) cru[y * (L + 1) + 1 + x] = Math.min(255, Math.max(0, (esp.quadros[(de + Math.floor(x / k)) * BANDAS + b] - 40) * 2.2));
  }
  const crc = (buf) => { let c = ~0; for (const v of buf) { c ^= v; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const bloco = (tipo, dados) => {
    const m = Buffer.alloc(12 + dados.length);
    m.writeUInt32BE(dados.length, 0); m.write(tipo, 4); dados.copy(m, 8); m.writeUInt32BE(crc(m.subarray(4, 8 + dados.length)), 8 + dados.length);
    return m;
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(L, 0); ih.writeUInt32BE(A, 4); ih[8] = 8; ih[9] = 0;
  writeFileSync(caminho, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ih), bloco('IDAT', zlib.deflateSync(cru)), bloco('IEND', Buffer.alloc(0))]));
}

if (treinarArq) {
  const lista = JSON.parse(readFileSync(treinarArq, 'utf8'));
  const cache = new Map();
  const ass = lista.map((c) => {
    if (!cache.has(c.arquivo)) cache.set(c.arquivo, medirEspectro(ler(c.arquivo), TAXA));
    return assinar(cache.get(c.arquivo), c.inicioS, c.fimS);
  });
  const m = treinarPositivo(ass);
  if (!m) { console.log(`poucas amostras (${ass.filter(Boolean).length}); precisa de 4 ou mais`); process.exit(1); }
  writeFileSync(join(saida, 'modelo-explosao.json'), JSON.stringify(m));
  console.log(`modelo de ${m.n} explosões gravado em ${join(saida, 'modelo-explosao.json')}`);
  process.exit(0);
}

const positivo = positivoArq ? { modelo: JSON.parse(readFileSync(positivoArq, 'utf8')), minimo: 0.05 } : null;
const resumo = [];
for (const arq of args) {
  const nome = basename(arq).replace(/\.f32$/, '');
  const som = ler(arq);
  const duracaoS = som.length / TAXA;
  const m = medirGraves(som, TAXA);
  const achadas = acharExplosoes(m, chao(m.forca));
  const esp = medirEspectro(som, TAXA);
  const r = tirarAlertas(achadas, esp, { positivo });
  const so = tirarAlertas(achadas, esp, { positivo: null });
  console.log(`\n== ${nome}: ${relogio(duracaoS)} de som, ${achadas.length} explosões detectadas`);
  console.log('   hora      dur   pico  plano  nota   destino');
  achadas.forEach((e, i) => {
    const a = r.assinaturas[i];
    const fora = r.removidos.find((x) => x.inicioS === e.inicioS);
    const grupo = r.grupos.findIndex((g) => g.indices.includes(i));
    const nota = positivo && a ? pontuar(a, positivo.modelo).toFixed(2) : ' -- ';
    console.log(`   ${relogio(e.picoS)}  ${e.duracaoS.toFixed(1).padStart(4)}s ${e.pico.toFixed(0).padStart(5)}x  ${a ? a.plano.toFixed(2) : ' -- '}  ${nota}   `
      + `${fora ? `SAI (${fora.porque}, grupo ${grupo}${fora.repeticoes ? `, ${fora.repeticoes} repetições, semelhança ${fora.semelhanca.toFixed(2)}` : ''})` : 'fica'}`
      + (!fora && grupo >= 0 && r.grupos[grupo].indices.length > 1 ? `  [grupo ${grupo}: ${r.grupos[grupo].indices.length} parecidas, semelhança ${r.grupos[grupo].media.toFixed(2)}, plano ${r.grupos[grupo].plano.toFixed(2)}]` : ''));
  });
  // amostras dos alertas aprendidos
  r.grupos.forEach((g, gi) => {
    if (!g.alerta) return;
    g.indices.slice(0, 3).forEach((i, k) => {
      const e = achadas[i];
      const de = Math.max(0, Math.round((e.inicioS - 0.3) * TAXA));
      const ate = Math.min(som.length, Math.round((e.fimS + 0.3) * TAXA));
      const base = join(saida, `${nome}-alerta${gi}-${k + 1}`);
      wav(`${base}.wav`, som.subarray(de, ate));
      png(`${base}.png`, esp, Math.floor(e.inicioS * FPS_ESP), Math.min(esp.plano.length, Math.floor(e.inicioS * FPS_ESP) + Math.min(80, Math.ceil((e.fimS - e.inicioS) * FPS_ESP))));
      console.log(`   amostra: ${base}.wav / .png`);
    });
  });
  resumo.push({
    canal: nome,
    duracaoS: Math.round(duracaoS),
    antes: achadas.length,
    depois: r.mantidos.length,
    soAlertas: so.mantidos.length,
    removidosPorRepetir: r.removidos.filter((x) => x.porque === 'repete').length,
    removidosPeloPositivo: r.removidos.filter((x) => x.porque === 'nao-parece-explosao').length,
    alertasAprendidos: r.novos.length,
  });
}
console.log('\n' + JSON.stringify(resumo, null, 1));
writeFileSync(join(saida, 'resumo.json'), JSON.stringify(resumo, null, 1));
