// Passo 4: passa a detecção real (a do app) pelos clipes aumentados do passo 2, tira a assinatura de cada
// explosão achada e treina o modelo positivo com elas. Os clipes em que a detecção não acha nada ficam fora:
// o modelo só vê o que chegaria até ele no app. Grava só vetores (2 x 22 números), nunca áudio.
//
//   node 4-treinar.mjs <pasta com aug-explosao.f32/.json e aug-tiro.f32/.json> <saida.json>
//
// Imprime a nota do modelo em explosões de sons que ele não viu (metade das famílias de clipes treina, a
// outra metade testa) e em tiros do jogo que a detecção tomou por explosão.
import { openSync, readSync, readFileSync, writeFileSync } from 'node:fs';
import { medirGraves, explosoes } from '../../site/explosoes.js';
import { medirEspectro, assinar, treinarPositivo, pontuar } from '../../site/alertas.js';

const [dir, saida] = process.argv.slice(2);
const L = 14 * 24000;

function assinaturas(cls) {
  const man = JSON.parse(readFileSync(`${dir}/aug-${cls}.json`));
  const fd = openSync(`${dir}/aug-${cls}.f32`, 'r');
  const buf = Buffer.alloc(L * 4);
  const out = [];
  for (const m of man) {
    readSync(fd, buf, 0, buf.length, m.i * L * 4);
    const s = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    const ev = explosoes(medirGraves(s, 24000), m.chao);
    const e = ev.filter((x) => x.inicioS < m.ini + 3 && x.fimS > m.ini - 0.5)
      .sort((a, b) => Math.abs(a.inicioS - m.ini) - Math.abs(b.inicioS - m.ini))[0];
    const a = e && assinar(medirEspectro(s, 24000), e.inicioS, e.fimS);
    if (a) out.push({ clip: m.clip, a });
  }
  console.log(`${cls}: ${man.length} clipes, a detecção achou ${out.length}`);
  return out;
}

const pos = assinaturas('explosao');
const neg = assinaturas('tiro');
const fam = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2;
const modeloMeio = treinarPositivo(pos.filter((p) => fam(p.clip) === 0).map((p) => p.a));
const teste = pos.filter((p) => fam(p.clip) === 1).map((p) => pontuar(p.a, modeloMeio));
const tiros = neg.map((p) => pontuar(p.a, modeloMeio));
const quantis = (v) => { const s = [...v].sort((a, b) => a - b); return [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => s[Math.floor(q * (s.length - 1))].toFixed(2)).join(' / '); };
console.log('nota em explosões não vistas (p05/p25/mediana/p75/p95):', quantis(teste));
console.log('nota em tiros que a detecção tomou por explosão:       ', quantis(tiros));
let ganho = 0;
for (const t of teste) for (const n of tiros) ganho += t > n ? 1 : t === n ? 0.5 : 0;
console.log('AUC explosão contra tiro:', (ganho / (teste.length * tiros.length)).toFixed(2));

const modelo = treinarPositivo(pos.map((p) => p.a));
writeFileSync(saida, saida.endsWith('.js')
  ? `// Modelo positivo (vetores, sem áudio). Refeito por probes/modelo-explosao/4-treinar.mjs.
export default ${JSON.stringify(modelo)};
`
  : JSON.stringify(modelo));
console.log(`modelo de ${modelo.n} explosões gravado em ${saida}`);
