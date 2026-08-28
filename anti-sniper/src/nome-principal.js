'use strict';
/**
 * Qual destes 344 nomes é o nome DA PESSOA.
 *
 * A regra é dele, e é conhecimento de quem joga — eu não teria como saber:
 *
 *   *"normalmente o nome principal da pessoa é o que ela usa mais de uma
 *   vez e uns dos primeiros da conta"*
 *
 * Faz sentido pelos dois lados. Quem troca de nome trezentas vezes está a
 * brincar, mas **volta** ao nome que é seu. E os primeiros nomes da conta
 * são de antes de a brincadeira começar — mais perto de quem a pessoa é.
 *
 * Isto importa porque o cruzamento usa esses nomes para casar com o apelido
 * da Kick. Tratar os 344 como iguais afoga o nome verdadeiro no meio de
 * trezentas piadas: "Bloco2A", "ze polvinho" e "messi messi messi" pesariam
 * o mesmo que o nome pelo qual a pessoa é conhecida.
 *
 * Três sinais, do mais forte para o mais fraco:
 *
 *   VOLTOU   usou, largou, e voltou anos depois. É o mais forte que existe:
 *            ninguém volta por acaso a um nome que não é seu.
 *   REPETIU  aparece mais de uma vez.
 *   CEDO     está no começo da conta.
 *
 * ⚠️ Isto ordena por PROBABILIDADE, não decide identidade. Um nome no topo
 * desta lista continua a ser um palpite melhor, não uma prova — e quem
 * mistura as duas coisas acusa inocente.
 */

/**
 * Agrupa as ocorrências por nome e mede os três sinais.
 *
 * @param {Array<{nome:string, em:string|number}>} ocorrencias
 *        a lista crua, COM repetições — é delas que sai o sinal
 * @returns {Array<object>} do mais provável para o menos
 */
function ordenarPorIdentidade(ocorrencias) {
  const lista = (ocorrencias || []).filter((o) => o && o.nome);
  if (!lista.length) return [];

  // O ano, venha de onde vier. As fontes escrevem a data de três jeitos:
  //   steamid.uk   "2026"                         (só o ano)
  //   Steam        "May 7, 2019 @ 11:04pm"        (por extenso)
  //   tabelas      "27/08/2026, 08:45:00"         (dia/mês/ano)
  // Aqui só interessa o ano, e procurá-lo em qualquer posição cobre os três
  // sem eu ter de saber de antemão de qual fonte veio a lista.
  const ano = (o) => {
    const m = String(o.em ?? '').match(/(19[89]\d|20[0-4]\d)/);
    return m ? Number(m[1]) : null;
  };

  const anos = lista.map(ano).filter(Number.isFinite);
  const maisAntigo = anos.length ? Math.min(...anos) : null;
  const maisNovo = anos.length ? Math.max(...anos) : null;
  const span = (maisNovo != null && maisAntigo != null) ? maisNovo - maisAntigo : 0;

  // Ordem cronológica, do mais antigo para o mais novo. "Uns dos primeiros
  // da conta" é POSIÇÃO, não período — e a lista chega do mais recente
  // para trás, então tem de ser invertida antes de contar posição.
  const cronologica = [...lista].sort((a, b) => (ano(a) ?? 9999) - (ano(b) ?? 9999));

  const por = new Map();
  cronologica.forEach((o, i) => {
    const chave = String(o.nome).trim().toLowerCase();
    if (!chave) return;
    if (!por.has(chave)) por.set(chave, { nome: o.nome, vezes: 0, anos: new Set(), posicao: i });
    const g = por.get(chave);
    g.vezes += 1;
    const a = ano(o);
    if (a != null) g.anos.add(a);
  });

  const fora = [];
  for (const g of por.values()) {
    const usados = [...g.anos].sort((a, b) => a - b);
    const primeiro = usados[0] ?? null;
    const ultimo = usados[usados.length - 1] ?? null;

    // VOLTOU: usado em anos separados por um buraco. Não basta aparecer em
    // 2024 e 2025 — isso é continuidade. Voltar é 2019 e depois 2024.
    const voltou = usados.length >= 2 && (ultimo - primeiro) >= 2;

    // CEDO: entre os PRIMEIROS nomes da conta, por posição.
    //
    // Media isto por ano antes, e numa conta real com os nomes amontoados
    // em 2010-2011 marcou 7 de 10 como "cedo" — o que não separa nada. Ele
    // disse "uns dos primeiros", e "uns" é um punhado, não um terço da
    // vida da conta. Cinco no máximo, e nunca mais de um quinto da lista.
    // E só vale quando há linha do tempo. Com todos os nomes no MESMO ano,
    // a posição é a ordem que a fonte devolveu, não a verdade — eleger o
    // primeiro daí seria escolher um vencedor ao acaso e chamar-lhe sinal.
    const quantosContam = Math.max(1, Math.min(5, Math.ceil(por.size / 5)));
    const cedo = span >= 1 && g.posicao < quantosContam;

    const repetiu = g.vezes > 1;

    // Os pesos são ordinais, não medidos: eu não tenho dados para calibrar
    // isto, e fingir que tenho seria inventar precisão. O que a ordem
    // garante é que voltar > repetir > ser cedo, que é a regra dele.
    let pontos = 0;
    if (voltou) pontos += 5;
    if (repetiu) pontos += 2 + Math.min(g.vezes - 1, 3);
    if (cedo) pontos += 2;

    fora.push({
      nome: g.nome,
      vezes: g.vezes,
      anosUsados: usados,
      primeiroEm: primeiro,
      ultimoEm: ultimo,
      voltou,
      repetiu,
      cedo,
      pontos,
      porque: [
        voltou && `voltou a usar depois de ${ultimo - primeiro} anos`,
        repetiu && `usou ${g.vezes}×`,
        cedo && `é o ${g.posicao + 1}º nome da conta`,
      ].filter(Boolean),
    });
  }

  // Empate desfeito pelo mais antigo: entre dois nomes igualmente pontuados,
  // o que veio primeiro é o mais provável de ser o original.
  return fora.sort((a, b) => b.pontos - a.pontos
    || (a.primeiroEm ?? 9999) - (b.primeiroEm ?? 9999)
    || b.vezes - a.vezes);
}

/**
 * Os poucos nomes que valem a pena cruzar.
 *
 * Cruzar 344 nomes contra a audiência é o caminho certo para um falso
 * positivo: com trezentos tiros, algum acerta por acaso. Esta função escolhe
 * os que têm sinal — e devolve TODOS quando não há sinal nenhum, porque aí
 * escolher seria escolher a esmo.
 */
function nomesQueValem(ocorrencias, { teto = 12 } = {}) {
  const ord = ordenarPorIdentidade(ocorrencias);
  const comSinal = ord.filter((n) => n.pontos > 0);
  return (comSinal.length ? comSinal : ord).slice(0, teto);
}

module.exports = { ordenarPorIdentidade, nomesQueValem };
