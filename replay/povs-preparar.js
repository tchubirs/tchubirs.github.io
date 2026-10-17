import { carregarCanais } from './carregar.js?v=f2ceb77d96';
import { lerMaster, lerPlaylist } from './kick.js?v=f2ceb77d96';
import { agruparPorNoite, noiteParaAbrir } from './noites.js?v=f2ceb77d96';
import { linhaDoCanal, janelaComum, trechoComum } from './relogio.js?v=f2ceb77d96';

export async function prepararPovs({ canais, ms, nudges, vodsPorCanal, vodsDoEvento, pecasLidas, lerTexto, sinal, buscar = fetch }) {
  const cancelar = () => { if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError'); };
  cancelar();
  const catalogo = new Map();
  const faltam = [];
  for (const canal of canais) {
    const memo = vodsPorCanal.get(canal) || vodsDoEvento.get(canal);
    if (memo?.estado === 'ok') catalogo.set(canal, memo);
    else faltam.push(canal);
  }
  for (const r of await carregarCanais(faltam, { buscar, sinal, paralelos: 4, tentativas: 1 })) catalogo.set(r.slug, r);
  cancelar();
  const resultados = canais.map((c) => catalogo.get(c));
  if (resultados.some((r) => r?.estado !== 'ok')) return null;
  const noites = agruparPorNoite(resultados);
  const indice = noiteParaAbrir(noites, { fixoMs: ms });
  const noite = noites[indice];
  if (!noite) return null;

  const lidas = new Map();
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < noite.itens.length) {
      cancelar();
      const { slug, v } = noite.itens[proximo++];
      const chave = `${slug}|${v.id}`;
      const memo = v.aoVivo ? null : pecasLidas.get(chave);
      if (memo) { lidas.set(chave, memo); continue; }
      if (!v.master) continue;
      try {
        const master = lerMaster(await lerTexto(v.master, { sinal }), v.master);
        cancelar();
        const barato = master.at(-1);
        if (!barato) continue;
        const playlist = lerPlaylist(await lerTexto(barato.url, { sinal }), barato.url);
        cancelar();
        if (Number.isFinite(playlist.inicio)) lidas.set(chave, { vod: v, playlist, escada: master, barato });
      } catch (erro) {
        if (sinal?.aborted || erro?.name === 'AbortError') throw erro;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, noite.itens.length) }, trabalhador));
  cancelar();
  const linhas = canais.map((canal) => linhaDoCanal(canal, noite.itens.filter((p) => p.slug === canal)
    .map(({ slug, v }) => lidas.get(`${slug}|${v.id}`)).filter(Boolean)));
  const trecho = trechoComum(linhas, ms, { nudges });
  const janela = janelaComum(linhas);
  if (!trecho || trecho.inicio > ms || ms >= trecho.fim || trecho.fim - trecho.inicio < 1000 || !janela) return null;
  if (ms < Math.max(janela.inicio, noite.inicio) || ms >= Math.min(janela.fim, noite.fim)) return null;
  return { catalogo: resultados, noites, indice, noite, lidas };
}
