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
// Uma noite não passa disto, contado do primeiro a entrar. Sem teto, vinte canais que transmitem todos
// os dias a horas diferentes nunca deixavam um buraco de seis horas, e a semana inteira virava uma
// "noite" só: a barra do tempo com sete dias e o lance perdido num pixel.
const DOZE_HORAS = 12 * 3600_000;

/**
 * @param {Array<{slug:string, vods:Array<{inicioApi:number, duracaoMs:number}>}>} canais
 * @returns noites, da mais recente para a mais antiga
 */
export function agruparPorNoite(canais, { intervaloMs = SEIS_HORAS, maximoMs = DOZE_HORAS, agoraMs = Date.now() } = {}) {
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
        // Quem está no ar vai até agora, e não até ao instante em que entrou.
        ate: v.aoVivo ? Math.max(v.inicioApi, agoraMs)
          : v.inicioApi + (Number.isFinite(v.duracaoMs) ? v.duracaoMs : 0),
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
    if (ultimo && p.de - ultimo.ultimoInicio < intervaloMs && p.de - ultimo.inicio < maximoMs) {
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
    // Quem COMEÇOU nesta noite pertence-lhe sempre, tenha durado o que tiver.
    //
    // Um VOD que ainda está a decorrer chega da Kick sem duração fiável, e
    // então `ate` é igual a `de`. Com um filtro de sobreposição estrita, esse
    // VOD ficava de fora da sua própria noite: a lista mostrava "0 canais" e
    // a página dizia "nenhum canal com relógio utilizável" — para uma noite
    // que existia e tinha gente lá dentro.
    const daNoite = new Set(g.inicios);
    const itens = pontos.filter((p) => daNoite.has(p) || (p.de < fim && p.ate > g.inicio));
    return {
      inicio: g.inicio,
      fim,
      itens,
      canais: new Set(itens.map((i) => i.slug)).size,
      // Os nomes, e nao so a contagem: quem escolhe uma noite quer saber quem
      // la esteve, e faltar um canal nunca foi impedimento para nada.
      quem: [...new Set(itens.map((i) => i.slug))],
      // Quantos começaram mesmo aqui, por oposição aos que já vinham de trás.
      comecaramAqui: new Set(g.inicios.map((i) => i.slug)).size,
    };
  }).sort((a, b) => b.inicio - a.inicio);
}

/**
 * O rótulo de uma noite: data, hora e quantos ângulos.
 *
 * A tradução entra por parâmetro em vez de ser importada: assim este ficheiro
 * continua a ser puro e testável sem browser nenhum, e a língua é uma escolha
 * de quem chama e não uma dependência escondida.
 */
export function rotuloDaNoite(n, { t } = {}) {
  // Hora local, como o resto da página.
  const p2 = (n) => String(n).padStart(2, '0');
  const hora = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const dia = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  // Uma noite que atravessa a meia-noite tem de dizer os dois dias, senão
  // quem procura o dia 30 não o encontra numa linha que diz 29.
  const ate = dia(n.fim) === dia(n.inicio) ? hora(n.fim) : `${dia(n.fim)} ${hora(n.fim)}`;
  const quantos = t
    ? t(n.canais === 1 ? 'noite.umCanal' : 'noite.canais', { n: n.canais })
    : `${n.canais} ${n.canais === 1 ? 'canal' : 'canais'}`;
  return `${dia(n.inicio)} · ${hora(n.inicio)}–${ate} — ${quantos}`;
}
