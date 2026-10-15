const PASSO = 30_000;
const mediana = (v) => { const a = [...v].sort((x, y) => x - y); const i = a.length >> 1; return a.length ? a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2 : 0; };

export function unirCobertura(intervalos) {
  const saida = [];
  for (const [a, b] of intervalos.filter(([a, b]) => Number.isFinite(a) && b > a).sort((x, y) => x[0] - y[0])) {
    const ultima = saida.at(-1);
    if (ultima && a <= ultima[1]) ultima[1] = Math.max(b, ultima[1]);
    else saida.push([a, b]);
  }
  return saida;
}

export function trechosFaltando(de, ate, cobertura) {
  const saida = [];
  let inicio = de;
  for (const [a, b] of unirCobertura(cobertura)) {
    if (b <= inicio) continue;
    if (a >= ate) break;
    if (a > inicio) saida.push([inicio, Math.min(a, ate)]);
    inicio = Math.max(inicio, b);
  }
  if (inicio < ate) saida.push([inicio, ate]);
  return saida;
}

export function alvosDaRodada(de, ate, cobertura) {
  const faltas = trechosFaltando(de, ate, cobertura);
  if (faltas.length <= 1) return faltas;
  return [faltas.at(-1), faltas[0]];
}

export function acharPicos({ slug, mensagens, cobertura, deMs, ateMs }) {
  const cobertos = unirCobertura(cobertura);
  const baldes = new Map();
  const vistos = new Set();
  for (const m of mensagens) {
    if (!Number.isFinite(m.ms) || m.ms < deMs || m.ms >= ateMs || vistos.has(String(m.id))) continue;
    vistos.add(String(m.id));
    if (/^\s*!/.test(m.texto || '')) continue;
    const minuto = Math.floor(m.ms / PASSO) * PASSO;
    const b = baldes.get(minuto) || { total: 0, autores: new Map() };
    b.total++;
    const autor = typeof m.autor === 'string' ? m.autor.toLowerCase() : null;
    if (autor) b.autores.set(autor, Math.min(2, (b.autores.get(autor) || 0) + 1));
    baldes.set(minuto, b);
  }
  const historico = [];
  const candidatos = [];
  for (let ms = Math.ceil(deMs / PASSO) * PASSO; ms + PASSO <= ateMs; ms += PASSO) {
    if (!cobertos.some(([a, b]) => a <= ms && b >= ms + PASSO)) continue;
    const b = baldes.get(ms) || { total: 0, autores: new Map() };
    const atividade = [...b.autores.values()].reduce((a, n) => a + n, 0);
    while (historico.length && historico[0].ms < ms - 20 * 60_000) historico.shift();
    const base = historico.map((h) => h.n);
    if (base.length >= 8) {
      const normal = mediana(base);
      const desvio = mediana(base.map((n) => Math.abs(n - normal)));
      const vezes = atividade / Math.max(1, normal);
      const z = (atividade - normal) / Math.max(1, 1.4826 * desvio);
      const autores = b.autores.size;
      const muito = atividade >= 15 && autores >= 5 && vezes >= 5 && z >= 6;
      const acima = atividade >= 8 && autores >= 3 && vezes >= 2.5 && z >= 3;
      if (muito || acima) candidatos.push({
        id: `${slug}|${ms}`, canal: slug, ms, deMs: ms - 30_000, ateMs: ms + 60_000,
        nivel: muito ? 'muito-acima' : 'acima', mensagens: b.total, participantes: autores,
        atividade, normal, vezes: Math.round(vezes * 10) / 10, nota: Math.round(z * 10) / 10,
        origem: 'pico-chat', revisado: false,
      });
    }
    historico.push({ ms, n: atividade });
  }
  const reunidos = [];
  for (const c of candidatos) {
    const anterior = reunidos.at(-1);
    if (anterior && c.ms - anterior.ms <= 90_000) {
      if (c.nota > anterior.nota) reunidos[reunidos.length - 1] = c;
    } else reunidos.push(c);
  }
  return reunidos;
}

export function ordenarPicos(candidatos) {
  return candidatos.map((c) => ({ ...c, canaisProximos: [...new Set(candidatos.filter((x) => x.canal !== c.canal && Math.abs(x.ms - c.ms) <= 90_000).map((x) => x.canal))] }))
    .sort((a, b) => (Number(b.nivel === 'muito-acima') - Number(a.nivel === 'muito-acima')) || b.nota - a.nota || b.participantes - a.participantes || b.ms - a.ms);
}
