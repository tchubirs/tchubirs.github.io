// Passo 3: marca, em cada .f32 de VOD, onde a detecção já acha "explosão" (o passo 2 evita esses trechos ao
// escolher fundos) e guarda o chão de cada canal. Uso: node 3-detectar-fundos.mjs <pasta com .f32> <saida.json>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { medirGraves, explosoes } from '../../site/explosoes.js';
import { chao } from '../../site/tiros.js';

const [dir, saida] = process.argv.slice(2);
const out = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.f32'))) {
  const b = readFileSync(`${dir}/${f}`);
  const s = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
  const m = medirGraves(s, 24000);
  const c = chao(m.forca);
  const nome = f.replace('.f32', '');
  out[`_chao_${nome}`] = c;
  out[nome] = explosoes(m, c, { alturaMin: 5 }).map((x) => [x.inicioS, x.fimS]);
}
writeFileSync(saida, JSON.stringify(out));
