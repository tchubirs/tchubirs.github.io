// Quem morreu? — a conta, separada de onde as imagens vêm.
//
// O dono disse a coisa certa: "não faço ideia de quem eu matei, por isso é que
// ia ver o ecrã de todos". Perguntar-lhe quem morreu era devolver-lhe o
// trabalho todo. O que a página tem de fazer é OLHAR pelos seis ao mesmo
// tempo e dizer quem parece ter morrido.
//
// O sinal, no Rust: quem morre vai para um ecrã de morte — cinzento, escuro, e
// completamente diferente do que estava lá dois segundos antes. Quem não
// morreu continua a ver o jogo: colorido, e parecido com o que via antes.
//
// Três medidas, sobre dois frames do mesmo canal (antes e depois do tiro):
//   mudou    — quanto do ecrã trocou
//   dessaturou — quanta cor se perdeu
//   escureceu  — quanto brilho se perdeu
//
// Nenhuma delas sozinha decide. Uma explosão muda o ecrã todo sem ninguém
// morrer; uma noite escura já é escura antes. Juntas, e comparadas ENTRE os
// canais do mesmo instante, separam bem.

/** Média de brilho e de saturação de um frame RGBA. */
export function medir(pixeis) {
  let brilho = 0;
  let saturacao = 0;
  let n = 0;
  for (let i = 0; i < pixeis.length; i += 4) {
    const r = pixeis[i];
    const g = pixeis[i + 1];
    const b = pixeis[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    brilho += (max + min) / 2;
    // Saturação como no HSL, mas sem o custo de converter: a distância entre o
    // canal mais forte e o mais fraco diz o mesmo para o que se procura aqui.
    saturacao += max === 0 ? 0 : (max - min) / max;
    n++;
  }
  return n ? { brilho: brilho / n / 255, saturacao: saturacao / n } : { brilho: 0, saturacao: 0 };
}

/** Quanto do ecrã trocou, de 0 a 1. */
export function diferenca(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let soma = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    soma += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    n++;
  }
  return n ? soma / n / 255 : 0;
}

/**
 * A nota de "isto parece uma morte", para um canal.
 *
 * Devolve também as partes, porque uma nota sozinha não se pode discutir — e
 * quem está a olhar para o ecrã tem de poder perceber porque é que a página
 * acha o que acha.
 */
export function notaDeMorte(antes, depois) {
  if (!antes || !depois) return null;
  const a = medir(antes);
  const d = medir(depois);
  const mudou = diferenca(antes, depois);
  const dessaturou = Math.max(0, a.saturacao - d.saturacao);
  const escureceu = Math.max(0, a.brilho - d.brilho);
  return {
    mudou,
    dessaturou,
    escureceu,
    // Os pesos dizem o que importa: perder a cor é o sinal mais próprio do
    // ecrã de morte; mudar tudo acontece em qualquer luta.
    nota: dessaturou * 2 + escureceu * 1.2 + mudou * 0.6,
    brilhoDepois: d.brilho,
    saturacaoDepois: d.saturacao,
  };
}

/**
 * Ordenar os candidatos e dizer quais valem a pena — comparando ENTRE canais.
 *
 * Um limite fixo não serve: uma noite de chuva baixa a saturação de toda a
 * gente. O que separa é a distância ao resto do grupo. Só se aponta alguém
 * quando ele se destaca dos outros, e nunca mais do que dois — em Rust morre
 * um, às vezes dois, nunca a equipa inteira.
 */
export function quemMorreu(notas, { destaqueMin = 1.6, maximo = 2 } = {}) {
  const validos = Object.entries(notas).filter(([, v]) => v && Number.isFinite(v.nota));
  if (validos.length < 2) return { sugeridos: [], ordenados: validos.map(([c, v]) => ({ canal: c, ...v })) };

  const ordenados = validos.map(([canal, v]) => ({ canal, ...v })).sort((x, y) => y.nota - x.nota);
  const restantes = ordenados.slice(1).map((x) => x.nota);
  const mediana = restantes.length
    ? [...restantes].sort((x, y) => x - y)[Math.floor(restantes.length / 2)]
    : 0;

  const sugeridos = [];
  for (const c of ordenados.slice(0, maximo)) {
    // Destacar-se do MEIO do grupo, e não do segundo: com dois mortos, o
    // segundo também está alto e escondia o primeiro.
    if (mediana > 0 ? c.nota >= mediana * destaqueMin : c.nota > 0.08) sugeridos.push(c.canal);
  }
  return { sugeridos, ordenados };
}

// ── o instante certo ────────────────────────────────────────────────────────
//
// "O ponto 0 do vídeo é quando acerto o primeiro disparo, ou quando mato, ou
// quando morro. Eu marco a kill mas não no timing certo, até porque não sei
// qual é o timing."
//
// Não tem de saber. Marcada a kill à volta do sítio certo, e sabido quem
// morreu, o instante exacto é onde o ecrã DELE vira — e isso encontra-se por
// bissecção, com meia dúzia de imagens em vez de cem.

/**
 * A fronteira entre "vivo" e "morto", a meio caminho entre os dois extremos.
 *
 * Um limite fixo não serve: uma noite de chuva já é cinzenta para toda a
 * gente. O que serve é o meio entre o que ESTE canal mostrava antes e o que
 * mostra depois.
 */
export function limiar(vivo, morto) {
  return {
    saturacao: (vivo.saturacao + morto.saturacao) / 2,
    brilho: (vivo.brilho + morto.brilho) / 2,
    // Sem diferença nenhuma não há fronteira a encontrar, e fingir uma daria
    // um instante ao calhas com ar de medição.
    utilizavel: vivo.saturacao - morto.saturacao > 0.08 || vivo.brilho - morto.brilho > 0.08,
  };
}

/** Este frame já é do lado da morte? */
export function pareceMorto(medida, lim) {
  if (!medida || !lim?.utilizavel) return false;
  return medida.saturacao <= lim.saturacao || medida.brilho <= lim.brilho;
}

/**
 * O primeiro instante do lado da morte, a partir de amostras já recolhidas.
 *
 * Separado da busca para poder ser testado sem vídeo nenhum: a bissecção que
 * escolhe QUE imagens pedir vive na página, esta função só decide.
 */
export function pontoDeViragem(amostras, lim) {
  const ordenadas = [...amostras].sort((a, b) => a.ms - b.ms);
  const primeiro = ordenadas.find((a) => pareceMorto(a.medida, lim));
  return primeiro ? primeiro.ms : null;
}
