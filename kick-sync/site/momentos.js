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
  const junta = (slug, antesS, depoisS, papel, letra) => {
    const deMs = momento.ms - antesS * 1000;
    const ateMs = momento.ms + depoisS * 1000;
    if (!filmava(slug, deMs, ateMs)) return;
    saida.push({
      canal: slug,
      papel,
      deMs,
      ateMs,
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
