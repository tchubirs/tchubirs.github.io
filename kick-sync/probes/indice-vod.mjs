// Roda a passada do modo simples (som, sem chat) numa live já descodificada e mostra o índice: quantos eventos de cada tipo,
// quantas lutas, e a lista de antes (com o corte por hora) contra a de agora (as lutas de confiança alta inteiras). Com o rótulo
// do dono, diz o que caiu em cada janela dele.
//   node probes/indice-vod.mjs <live.f32 (24 kHz, mono, desde o começo da live)> [rotulos.json] [--saida indice.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { varrerNoite } from '../site/procurar-momentos.js';
import { alertasDoCanal } from '../site/alertas.js';
import { montarIndice, consultar, precisaoDaBusca } from '../site/indice.js';
import { montarLista } from '../site/simples-lista.js';

const args = process.argv.slice(2);
const i = args.indexOf('--saida');
const saida = i >= 0 ? args.splice(i, 2)[1] : null;
const [arq, rot] = args;
const b = readFileSync(arq);
const x = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
const TAXA = 24000;
const dur = x.length / TAXA;
const T0 = Date.UTC(2026, 9, 8, 20, 42, 1); // a live de 08/10 do tchubi; só serve para dar um relógio
const t0 = Date.now();
const r = await varrerNoite({
  linha: { slug: 'x' }, deMs: T0, ateMs: T0 + dur * 1000, buscar: null, memoria: new Map(),
  lerSom: async (l, quandoMs, duracaoS) => x.slice(Math.round(((quandoMs - T0) / 1000) * TAXA), Math.round(((quandoMs - T0) / 1000 + duracaoS) * TAXA)),
  filtros: { tiros: true, explosoes: true, gritos: true, acertos: true },
  alertas: alertasDoCanal('x', { getItem: () => null, setItem: () => {} }),
});
const indice = montarIndice({ slug: 'x', inicioMs: T0, fimMs: T0 + dur * 1000, som: r });
console.log(`${(dur / 60).toFixed(0)} min analisados em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const porTipo = {};
for (const e of indice.eventos) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
console.log('eventos no índice:', JSON.stringify(porTipo), `(${(JSON.stringify(indice).length / 1024).toFixed(0)} KB em JSON)`);
console.log('modelos de acerto:', JSON.stringify(indice.modelosAcerto), 'acertos ativos:', indice.acertosAtivos);
const sons = [...r.candidatos.map((c) => ({ ...c, tipo: 'tiros' })), ...r.explosoes.map((c) => ({ ...c, tipo: 'explosao' }))];
const antes = montarLista({ sons, limites: { deMs: T0, ateMs: T0 + dur * 1000 }, quantos: 60 });
const depois = montarLista({ sons, limites: { deMs: T0, ateMs: T0 + dur * 1000 }, quantos: 60, lutas: indice.lutas });
console.log(`lista de antes (corte por hora, só tiros e explosões): ${antes.length}; lutas no índice: ${indice.lutas.length}; lista de agora: ${depois.length}`);
const confs = indice.lutas.map((l) => l.conf);
console.log('lutas por confiança: ', JSON.stringify({ '>=0,85': confs.filter((c) => c >= 0.85).length, '0,6 a 0,85': confs.filter((c) => c >= 0.6 && c < 0.85).length, '<0,6': confs.filter((c) => c < 0.6).length }));
console.log('precisão da busca "lutas":', JSON.stringify(precisaoDaBusca(indice.lutas.map((l) => ({ ...l, fonte: 'rotulos' })))));
console.log('alertas no índice:', consultar(indice, { tipos: ['alerta'] }).map((e) => `${((e.ms - T0) / 60000).toFixed(1)} min conf ${e.conf}`).join(', '));
if (rot) {
  const lances = JSON.parse(readFileSync(rot, 'utf8')).lances;
  for (const l of lances) {
    const de = T0 + (l.minDaLive * 60 - 10) * 1000;
    const ate = T0 + (l.minDaLive * 60 + 60 + l.clipeS) * 1000;
    const ls = indice.lutas.filter((u) => u.ateMs >= de && u.deMs <= ate);
    const ac = consultar(indice, { tipos: ['acerto', 'headshot', 'abate'], deMs: de, ateMs: ate }).length;
    const alerta = consultar(indice, { tipos: ['alerta'], deMs: de, ateMs: ate }).length;
    const exp = consultar(indice, { tipos: ['explosao'], deMs: de, ateMs: ate }).length;
    console.log(`${l.hora} ${l.tiro ? (l.pve ? 'tiro (PvE)' : 'tiro') : 'sem tiro'}: lutas ${ls.length} (conf ${ls.map((u) => u.conf).join('/')}), acertos ${ac}, alertas ${alerta}, explosões ${exp}`);
  }
}
if (saida) writeFileSync(saida, JSON.stringify(indice));
