const SLUG = /^[a-z0-9_-]{1,60}$/;

export function transmissoesDoEvento(json) {
  if (!Array.isArray(json?.data?.streams)) throw new Error('lista-de-transmissoes-invalida');
  const vistos = new Set();
  return json.data.streams.flatMap(s => {
    const slug = s?.channel?.slug;
    const id = s?.channel?.id;
    if (!SLUG.test(slug || '') || !Number.isSafeInteger(id) || id <= 0 || vistos.has(slug)) return [];
    vistos.add(slug);
    return [{ slug, id, titulo: String(s.livestream?.title || '').slice(0, 300),
      espectadores: Number.isFinite(s.livestream?.view_count) ? s.livestream.view_count : null }];
  });
}

export function clipesDoEvento(json) {
  if (!Array.isArray(json?.data?.clips)) throw new Error('lista-de-clipes-invalida');
  return json.data.clips.flatMap(c => {
    const canal = c?.channel?.slug;
    const ms = Date.parse(c?.started_at);
    if (!SLUG.test(canal || '') || !/^clip_[a-z0-9]{1,70}$/i.test(c?.id || '') ||
        !Number.isFinite(ms) || !Number.isFinite(c.duration) || c.duration <= 0 || c.duration > 180) return [];
    return [{ id: c.id, canal, titulo: String(c.title || '').slice(0, 300), ms, duracaoS: c.duration,
      visualizacoes: Number.isFinite(c.views_count) ? c.views_count : 0,
      link: `https://kick.com/${canal}/clips/${c.id}`, origem: 'clipe-publico-kick', revisado: false }];
  });
}

export async function consultarEventoKick(id, { buscar = fetch } = {}) {
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id || '')) throw new Error('id-do-evento-invalido');
  const fontes = [
    ['transmissoes', 'streams', transmissoesDoEvento],
    ['recentes', 'clips?sort_by=clip_id&order=desc', clipesDoEvento],
    ['populares', 'clips?sort_by=view_count&order=desc', clipesDoEvento],
  ];
  const resultados = await Promise.allSettled(fontes.map(async ([, endpoint, ler]) => {
    const r = await buscar(`https://web.kick.com/api/v1/events/${id}/${endpoint}`);
    if (!r.ok) throw new Error(`http-${r.status}`);
    return ler(await r.json());
  }));
  const saida = { falhas: [] };
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') saida[fontes[i][0]] = r.value;
    else saida.falhas.push({ fonte: fontes[i][0], motivo: r.reason.message });
  });
  return saida;
}
