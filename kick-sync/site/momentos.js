// A montagem: uma lista de momentos, e os clipes que cada um gera.
//
// O fluxo é o do dono, e não um genérico: numa kill, mostra-se a POV DELE
// inteira — o antes, a luta, a morte do outro — e logo a seguir a POV de quem
// morreu, curtinha, dois ou três segundos, só o instante do delete. Depois
// outra kill, outra morte. E assim por diante.
//
// Por isso um momento não é um corte: é UM corte longo (o protagonista) mais N
// cortes curtos (os outros ângulos), na ordem em que entram na montagem. O que
// esta página tem de entregar é essa lista pronta, com os ficheiros já
// numerados para caírem na ordem certa dentro do editor.

/** Quanto tempo, por omissão, de cada lado — os números do próprio dono. */
export const PADRAO = {
  protagonistaAntesS: 5,
  protagonistaDepoisS: 2,
  vitimaAntesS: 1,
  vitimaDepoisS: 2,
};

/** Uma marca nova, com o protagonista de quem se está a ver naquele instante. */
export function novoMomento(quandoMs, protagonista, extra = {}) {
  return {
    ms: Math.round(quandoMs),
    protagonista: protagonista || null,
    // Quem morreu, por nome. Vazio de propósito.
    //
    // A primeira versão cortava TODOS os outros ângulos em cada kill. O
    // resultado, nas palavras do dono: "vejo clipes de pessoas, elas nem
    // morreram, não acontece nada". Numa kill morre um, às vezes dois — os
    // outros quatro clipes são lixo que ele tem de apagar à mão, e apagar
    // lixo é exactamente o trabalho que isto devia estar a poupar.
    vitimas: [],
    nota: '',
    ...PADRAO,
    ...extra,
  };
}

/** Pôr ou tirar alguém da lista de quem morreu neste momento. */
export function alternarVitima(momento, slug) {
  const tem = (momento.vitimas || []).includes(slug);
  return {
    ...momento,
    vitimas: tem
      ? momento.vitimas.filter((v) => v !== slug)
      : [...(momento.vitimas || []), slug],
  };
}

/** Sempre por ordem de relógio: é a ordem em que entram na montagem. */
export function ordenar(momentos) {
  return [...momentos].sort((a, b) => a.ms - b.ms);
}

/**
 * Dois momentos a dois segundos um do outro são a mesma kill marcada duas
 * vezes — carregar depressa na tecla não pode duplicar trabalho.
 */
export function acrescentar(momentos, novo, { juntarMs = 2000 } = {}) {
  if (momentos.some((m) => Math.abs(m.ms - novo.ms) < juntarMs)) return momentos;
  return ordenar([...momentos, novo]);
}

export function remover(momentos, ms) {
  return momentos.filter((m) => m.ms !== ms);
}

/**
 * Apagar muitos de uma vez.
 *
 * A busca automatica devolve uma noite inteira de candidatos — quinze por
 * hora — e a maioria nao e kill nenhuma. Apagar um a um e o trabalho manual
 * que a busca automatica existe para tirar.
 */
export function removerVarios(momentos, msLista) {
  const fora = new Set(msLista);
  return momentos.filter((m) => !fora.has(m.ms));
}

/** Um momento so conta como kill confirmada se se viu alguem morrer nele. */
export const temMorte = (m) => Boolean((m.vitimas || []).length);

/**
 * A lista que ele quer ver, e nao a lista toda.
 *
 * Sao tres perguntas diferentes: "o que ja esta pronto para montar"
 * (comMorte), "o que falta eu decidir" (semMorte) e "tudo". Um filtro
 * desconhecido devolve tudo — melhor mostrar a mais do que esconder trabalho
 * sem ele perceber porque.
 */
export function filtrar(momentos, filtro) {
  if (filtro === 'comMorte') return momentos.filter(temMorte);
  if (filtro === 'semMorte') return momentos.filter((m) => !temMorte(m));
  return momentos;
}

const dois = (n) => String(n).padStart(2, '0');

/**
 * Os clipes de um momento, na ordem em que entram na montagem.
 *
 * O protagonista primeiro e longo; os outros a seguir e curtos. Só entram os
 * ângulos que estavam mesmo a filmar — um clipe vazio de quem já tinha
 * desligado é trabalho a mais para quem monta, não uma cortesia.
 *
 * @param {(slug:string, deMs:number, ateMs:number) => boolean} filmava
 */
export function clipesDoMomento(momento, canais, indice, { filmava = () => true } = {}) {
  const saida = [];
  // O combate INTEIRO, e as margens dele por fora.
  //
  // "Falta tempo antes e tempo depois... esse tempo extra é fora o combate
  // completo: antes do primeiro disparo e depois do último." Antes disto o
  // clipe era cinco segundos antes do instante e dois depois — e um tiroteio
  // de vinte segundos ficava cortado ao meio. O que ele marca à mão continua a
  // ser um instante só, e aí as duas pontas são o mesmo número.
  const a = Number.isFinite(momento.combateDeMs) ? momento.combateDeMs : momento.ms;
  const b = Number.isFinite(momento.combateAteMs) ? momento.combateAteMs : momento.ms;
  // Ordenadas, e nao como vierem: um combate com as pontas trocadas dava um
  // clipe de duracao negativa, que o cortador aceita e devolve vazio.
  const combateDe = Math.min(a, b);
  const combateAte = Math.max(a, b);
  // O ajuste dele manda, quando existe.
  //
  // "Quando eu clico em ajeitar e ajeito, quero um botao pra salvar alteracao;
  //  ai vou fazendo em tudo e depois baixo tudo junto." O ajuste sao as pontas
  // que ele apurou no editor, e vale so para a POV dele — e a dele que ele
  // corta a mao; as dos outros continuam a sair pelas margens.
  const aj = momento.ajuste;
  const junta = (slug, antesS, depoisS, papel, letra) => {
    const ajustado = papel === 'protagonista' && aj
      && Number.isFinite(aj.deMs) && Number.isFinite(aj.ateMs) && aj.ateMs > aj.deMs;
    const deMs = ajustado ? aj.deMs : combateDe - antesS * 1000;
    const ateMs = ajustado ? aj.ateMs : combateAte + depoisS * 1000;
    if (!filmava(slug, deMs, ateMs)) return;
    saida.push({
      canal: slug,
      papel,
      deMs,
      ateMs,
      // O retrato, quando ele o guardou: e com isto que a montagem sabe que
      // tem de tirar tambem o 9:16 deste clipe, e com que enquadramento.
      retrato: ajustado && aj.formato ? {
        modo: aj.formato, rects: aj.rects || [], divisao: aj.divisao,
      } : null,
      // A que kill este clipe pertence. Sem isto nao havia maneira de pedir os
      // clipes de UMA kill sem refazer o plano todo por fora.
      ms: momento.ms,
      // O nome carrega a ordem: no editor os ficheiros caem já certos, e
      // ninguém tem de andar a adivinhar qual vem antes de qual.
      prefixo: `${dois(indice + 1)}${letra}`,
    });
  };

  if (momento.protagonista) {
    junta(momento.protagonista, momento.protagonistaAntesS, momento.protagonistaDepoisS, 'protagonista', 'a');
  }
  // Só quem o dono disse que morreu. Sem ninguém marcado, o momento é só a
  // POV dele — que é um resultado honesto, e não uma pilha de clipes vazios.
  let letra = 'b';
  for (const slug of momento.vitimas || []) {
    if (slug === momento.protagonista || !canais.includes(slug)) continue;
    junta(slug, momento.vitimaAntesS, momento.vitimaDepoisS, 'vitima', letra);
    letra = String.fromCharCode(letra.charCodeAt(0) + 1);
  }
  return saida;
}

/** A montagem inteira: todos os momentos, todos os clipes, já em ordem. */
export function planoDaMontagem(momentos, canais, opcoes = {}) {
  return ordenar(momentos).flatMap((m, i) => clipesDoMomento(m, canais, i, opcoes));
}


/**
 * Guardar num momento o que ele apurou no editor.
 *
 * Devolve um momento novo — os momentos nunca se mudam no sitio, e assim o
 * `guardar()` da sessao e o desenho da lista ficam sempre certos. `formato`
 * nulo quer dizer "so 16:9"; 'um' ou 'dois' quer dizer "e o 9:16 tambem, com
 * estes enquadramentos".
 */
export function comAjuste(momento, { deMs, ateMs, formato = null, rects = [], divisao } = {}) {
  if (!Number.isFinite(deMs) || !Number.isFinite(ateMs) || ateMs <= deMs) return momento;
  return {
    ...momento,
    ajuste: {
      deMs: Math.round(deMs),
      ateMs: Math.round(ateMs),
      formato: formato === 'um' || formato === 'dois' ? formato : null,
      rects: rects.map((r) => ({ x: r.x, y: r.y, largura: r.largura, altura: r.altura })),
      divisao: Number.isFinite(divisao) ? divisao : undefined,
    },
  };
}

/** Tirar o ajuste: volta ao combate medido e as margens. */
export function semAjuste(momento) {
  if (!momento.ajuste) return momento;
  const { ajuste, ...resto } = momento;
  void ajuste;
  return resto;
}
