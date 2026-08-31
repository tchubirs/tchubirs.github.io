// Que noites existem, e quem esteve em cada uma.
//
// Parece contas de calendário e não é: um canal 24/7 tem um único VOD de
// trinta e oito horas, e a primeira versão disto agrupava noites que se
// TOCAVAM. Bastou esse VOD para colar cinco dias num só bloco — o dia 30
// existia, estava lá dentro, e não havia como escolhê-lo. O ecrã dizia
// "27 de agosto, 6 canais" e por baixo mostrava uma janela de quatro dias.
//
// A correcção é olhar para os INÍCIOS. Quem começou a transmitir com poucas
// horas de diferença esteve na mesma noite; quanto tempo cada um ficou no ar
// não muda isso. Depois, cada noite recolhe todos os VODs que a ATRAVESSAM —
// e assim o VOD de trinta e oito horas aparece em todas as noites que cobre,
// que é exactamente o que é verdade.

const SEIS_HORAS = 6 * 3600_000;

/**
 * @param {Array<{slug:string, vods:Array<{inicioApi:number, duracaoMs:number}>}>} canais
 * @returns noites, da mais recente para a mais antiga
 */
export function agruparPorNoite(canais, { intervaloMs = SEIS_HORAS } = {}) {
  const pontos = [];
  for (const c of canais || []) {
    for (const v of c.vods || []) {
      if (!Number.isFinite(v.inicioApi)) continue;
      pontos.push({
        slug: c.slug,
        v,
        de: v.inicioApi,
        // Sem duração conhecida não se inventa um fim: o VOD conta como um
        // instante, e a playlist dirá a verdade quando for lida.
        ate: v.inicioApi + (Number.isFinite(v.duracaoMs) ? v.duracaoMs : 0),
      });
    }
  }
  if (!pontos.length) return [];
  pontos.sort((a, b) => a.de - b.de);

  // Agrupar INÍCIOS. Comparar com o início anterior, e nunca com o fim do
  // grupo: é o fim que um VOD gigante estica até engolir os dias seguintes.
  const grupos = [];
  for (const p of pontos) {
    const ultimo = grupos.at(-1);
    if (ultimo && p.de - ultimo.ultimoInicio < intervaloMs) {
      ultimo.ultimoInicio = p.de;
      ultimo.inicios.push(p);
    } else {
      grupos.push({ inicio: p.de, ultimoInicio: p.de, inicios: [p] });
    }
  }

  return grupos.map((g) => {
    // A janela da noite é a dos que COMEÇARAM nela. Um VOD de 38 h que passa
    // por aqui entra na lista, mas não estica a noite para dois dias.
    const fim = Math.max(...g.inicios.map((p) => p.ate));
    const itens = pontos.filter((p) => p.de < fim && p.ate > g.inicio);
    return {
      inicio: g.inicio,
      fim,
      itens,
      canais: new Set(itens.map((i) => i.slug)).size,
      // Quantos começaram mesmo aqui, por oposição aos que já vinham de trás.
      comecaramAqui: new Set(g.inicios.map((i) => i.slug)).size,
    };
  }).sort((a, b) => b.inicio - a.inicio);
}

/** O rótulo de uma noite: data, hora e quantos ângulos. */
export function rotuloDaNoite(n) {
  const d = new Date(n.inicio);
  const hora = (ms) => new Date(ms).toISOString().slice(11, 16);
  const dia = (ms) => new Date(ms).toISOString().slice(0, 10);
  // Uma noite que atravessa a meia-noite tem de dizer os dois dias, senão
  // quem procura o dia 30 não o encontra numa linha que diz 29.
  const ate = dia(n.fim) === dia(n.inicio) ? hora(n.fim) : `${dia(n.fim)} ${hora(n.fim)}`;
  return `${d.toISOString().slice(0, 10)} · ${hora(n.inicio)}–${ate} — ${n.canais} ${n.canais === 1 ? 'canal' : 'canais'}`;
}
