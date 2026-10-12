// Calibra as confianças do índice (site/calibracao.js) com os rótulos do dono: para as regiões de som alto que a detecção achou
// nas janelas que ele descreveu, quantas eram mesmo tiro (janela com tiro dito) ou não eram (só voz, cavalo, farm).
//   node probes/calibrar-indice.mjs <live.f32 de 24 kHz, desde o começo da live> [rotulos.json]
// Sem rótulo de verdade por região, só por janela: a "taxa de acerto" de cada faixa é a fração das regiões da faixa que caíram
// em janela com tiro. É uma estimativa com poucos exemplos (o número vem em `n`), não uma medida limpa.
import { readFileSync } from 'node:fs';
import { varrerNoite } from '../site/procurar-momentos.js';

const [arq, rot = new URL('./rotulos-tchubi-2026-10-08.json', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')] = process.argv.slice(2);
const b = readFileSync(arq);
const x = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
const TAXA = 24000;
const dur = x.length / TAXA;
const r = await varrerNoite({
  linha: { slug: 'x' }, deMs: 0, ateMs: dur * 1000, buscar: null,
  lerSom: async (l, quandoMs, duracaoS) => x.slice(Math.round((quandoMs / 1000) * TAXA), Math.round((quandoMs / 1000 + duracaoS) * TAXA)),
  filtros: { tiros: true, explosoes: false, gritos: true },
});
const lances = JSON.parse(readFileSync(rot, 'utf8')).lances;
// A janela: do minuto dito até um minuto depois do fim do clipe (o dono só diz o minuto). tiro: 1 se ele disse que atirou, 0 se foi
// só voz, cavalo ou farm. Fora: os de resposta mista (farm e tiro no mesmo clipe) e o alerta com tiro longe.
const jan = lances.filter((l) => !(l.tiro && l.falsoTiro) && l.hora !== '22:46').map((l) => ({
  hora: l.hora, de: l.minDaLive * 60 - 10, ate: l.minDaLive * 60 + 60 + l.clipeS, tiro: l.tiro ? 1 : 0, pve: Boolean(l.pve),
}));
const dentro = (c) => jan.find((j) => c.ms / 1000 >= j.de && c.ms / 1000 <= j.ate);
const linhas = r.candidatosTodos.map((c) => ({ ...c, j: dentro(c) })).filter((c) => c.j);
console.log(`${r.candidatosTodos.length} regiões na live; ${linhas.length} caem nas ${jan.length} janelas com resposta`);
const tabela = (nome, campo, cortes, certo) => {
  const saida = [];
  for (let i = 0; i < cortes.length; i++) {
    const de = i ? cortes[i - 1] : -Infinity;
    const ate = cortes[i];
    const s = linhas.filter((c) => c[campo] != null && c[campo] >= de && c[campo] < ate);
    saida.push({ ate: Number.isFinite(ate) ? ate : null, n: s.length, p: s.length ? Math.round((100 * s.filter(certo).length) / s.length) / 100 : null });
  }
  console.log(nome, JSON.stringify(saida));
};
tabela('tiro (pico em vezes o chão; certo = janela com tiro)', 'pico', [40, 60, 75, 100, Infinity], (c) => c.j.tiro === 1);
tabela('voz (parte do som que é voz; certo = janela SEM tiro)', 'vozMed', [0.5, 0.55, 0.6, Infinity], (c) => c.j.tiro === 0);
const porJanela = jan.map((j) => {
  const s = linhas.filter((c) => c.j === j);
  return `${j.hora} (${j.tiro ? 'tiro' : 'sem tiro'}${j.pve ? ', PvE' : ''}): ${s.length} regiões, pico máx ${Math.max(0, ...s.map((c) => c.pico)).toFixed(0)}, voz máx ${Math.max(0, ...s.map((c) => c.vozMed ?? 0)).toFixed(2)}`;
});
console.log(porJanela.join('\n'));
// Voz com pouca força: a mistura que separa "só gente falando" (o chat de voz, o time no Discord) do tiro.
const fraco = (c) => c.pico < 60;
const juntas = [
  ['pico < 60 e voz >= 0,58', (c) => fraco(c) && (c.vozMed ?? 0) >= 0.58],
  ['pico < 60 e voz < 0,58', (c) => fraco(c) && (c.vozMed ?? 0) < 0.58],
  ['pico < 60 e 20 impulsos ou mais', (c) => fraco(c) && c.nImp >= 20],
  ['pico < 60 e duração de 15 s ou mais', (c) => fraco(c) && c.duracaoS >= 15],
];
for (const [nome, f] of juntas) {
  const s = linhas.filter(f);
  console.log(nome, `n ${s.length}`, `em janela sem tiro: ${s.filter((c) => c.j.tiro === 0).length}`, s.map((c) => `${c.j.hora}`).join(' '));
}
