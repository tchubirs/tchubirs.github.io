'use strict';
/**
 * A raiz que se repete por baixo dos nomes.
 *
 * Ele olhou para a saída e disse: *"ta errado ja aviso tem um nome muito
 * similar que aparece muitas vezes"*. Tinha razão, e o erro era meu de raiz:
 * eu contava repetição EXACTA. No histórico dele estava isto —
 *
 *     Recruta · SenhorRecruta · R3crutatv · Recrutáxi · [YT] Senhor Recruta
 *     [YT CANAL] Senhor Recruta · [BDM]Senhor recruta · Recruta EU QUERO ARK
 *
 * — dez nomes, a mesma pessoa, de 2015 a 2026. Para o meu contador eram dez
 * nomes DIFERENTES, cada um usado uma vez, sinal zero. Por isso a saída foi
 * buscar "Juice Fruit" ao acaso: sem sinal nenhum, o desempate escolhe.
 *
 * Quem troca de nome trezentas vezes não repete a string — repete a IDEIA.
 * Muda o prefixo do canal, troca uma letra por um número, junta um sufixo. O
 * que fica igual é o miolo. É isso que esta função procura.
 *
 * ⚠️ Continua a ser probabilidade. Uma raiz forte é o melhor palpite que
 * estes dados dão, não uma identidade provada.
 */

/** Um nome reduzido ao que nele é letra: sem enfeite, sem tag, sem leet. */
function normalizar(nome) {
  return String(nome ?? '')
    // "SenhorRecruta" -> "Senhor Recruta". Tem de vir ANTES do lowercase,
    // senão a fronteira entre as duas palavras desaparece para sempre.
    .replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, '$1 $2')
    // Tags de canal: [YT], [BDM], (BR), {clan}. São a moldura, não o nome.
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // ç -> c, ã -> a
    .toLowerCase()
    // Leet. "R3crutatv" e "sInToN1A" só se juntam ao resto depois disto.
    .replace(/[0]/g, 'o').replace(/[1|!]/g, 'i').replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/[7]/g, 't')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Palavras que ligam e não identificam ninguém. Sem esta lista, "para" e
// "quero" apareceriam como raiz forte só por serem comuns.
const VAZIAS = new Set([
  'para', 'pelo', 'pela', 'como', 'mais', 'menos', 'esse', 'essa', 'este',
  'esta', 'isso', 'aqui', 'onde', 'quando', 'porque', 'quero', 'meu', 'minha',
  'seu', 'sua', 'nao', 'sim', 'com', 'sem', 'dos', 'das', 'que', 'the', 'and',
  'for', 'you', 'your', 'his', 'her', 'have', 'from', 'this', 'that', 'with',
  'dont', 'shoot', 'lucky',
]);

const MIN_LETRAS = 4;    // "grau" conta; "do" não
const MIN_NOMES = 3;     // duas coincidências são coincidência

/**
 * Riso e enchimento não são identidade.
 *
 * Na primeira corrida a sério, o topo da lista dele saiu assim:
 *
 *     4 pt  HIHIHIHIHI   é a raiz que 2 outros nomes repetem
 *
 * a partir de "HIHIHIHIHI", "HIHIHHIHIHIHIHIHI" e "hihihihihihihihihihihihihi".
 * A mecânica funcionou — três nomes, o mesmo miolo. Mas a conclusão é absurda:
 * ninguém se chama assim. É riso, e riso repete-se por definição, o que faz
 * dele o falso positivo perfeito para uma regra que procura repetição.
 *
 * Uma raiz feita de uma sílaba curta repetida — hihihi, kkkkk, hahaha, rsrsrs —
 * é isso. O limite de três repetições protege nomes curtos de verdade: "Lulu"
 * e "Coco" têm quatro letras e passam.
 */
function ehRisada(raiz) {
  for (let n = 1; n <= 3; n++) {
    if (raiz.length >= n * 3 && raiz.length % n === 0) {
      const unidade = raiz.slice(0, n);
      if (unidade.repeat(raiz.length / n) === raiz) return true;
    }
  }
  return false;
}

/**
 * Acha as raízes que atravessam nomes diferentes.
 *
 * @param {Array<{nome:string, em?:string}>} ocorrencias
 * @param {{minNomes?:number}} [op]
 * @returns {Array<{raiz:string, nomes:string[], quantos:number, anos:number[], pontos:number}>}
 */
function raizesRepetidas(ocorrencias, { minNomes = MIN_NOMES } = {}) {
  const lista = (ocorrencias || []).filter((o) => o && o.nome);
  if (lista.length < minNomes) return [];

  const ano = (o) => {
    const m = String(o.em ?? '').match(/(19[89]\d|20[0-4]\d)/);
    return m ? Number(m[1]) : null;
  };

  // Um registo por NOME distinto. Dez usos do mesmo nome não fazem uma raiz:
  // fazem um nome repetido, que o outro sinal já mede.
  const porNome = new Map();
  for (const o of lista) {
    const limpo = normalizar(o.nome);
    if (!limpo) continue;
    const chave = String(o.nome).trim().toLowerCase();
    if (!porNome.has(chave)) {
      porNome.set(chave, { nome: o.nome, limpo, junto: limpo.replace(/ /g, ''), anos: new Set() });
    }
    const a = ano(o);
    if (a != null) porNome.get(chave).anos.add(a);
  }
  const nomes = [...porNome.values()];
  if (nomes.length < minNomes) return [];

  // Candidatas: cada palavra com corpo suficiente para ser um nome.
  const candidatas = new Set();
  for (const n of nomes) {
    for (const t of n.limpo.split(' ')) {
      if (t.length >= MIN_LETRAS && !VAZIAS.has(t) && !ehRisada(t)) candidatas.add(t);
    }
  }

  const fora = [];
  for (const raiz of candidatas) {
    // Contém como PEDAÇO, não como palavra igual: é assim que "recruta"
    // apanha "recrutatv" e "recrutaxi", que é justamente o caso dele.
    const casam = nomes.filter((n) => n.junto.includes(raiz));
    if (casam.length < minNomes) continue;
    // Uma raiz que está em TODOS os nomes não distingue nada dentro da conta.
    //
    // Eu tinha cortado a metade, e estava errado nos dois sentidos. Numa lista
    // curta matava raízes verdadeiras — cinco variações em nove nomes é uma
    // pessoa a assinar, não ruído. E numa lista longa a metade nunca acontece,
    // por isso a guarda não protegia de nada onde era precisa. O que
    // realmente não informa é a raiz que cobre a lista inteira.
    if (casam.length >= nomes.length * 0.95) continue;

    const anos = [...new Set(casam.flatMap((n) => [...n.anos]))].sort((a, b) => a - b);
    const alcance = anos.length >= 2 ? anos[anos.length - 1] - anos[0] : 0;

    // Quantos nomes a raiz atravessa é o sinal principal. Os anos entram como
    // reforço: voltar à mesma ideia dez anos depois não é hábito, é identidade.
    // A ordem (nomes acima de anos) é a mesma da regra dele.
    fora.push({
      raiz,
      nomes: casam.map((n) => n.nome),
      quantos: casam.length,
      anos,
      alcance,
      pontos: casam.length * 2 + Math.min(alcance, 10),
    });
  }

  // Junta as raízes que são a mesma coisa dita em pedaços diferentes.
  //
  // "recru", "recrut" e "recruta" são uma família. Ficar com a que apanha mais
  // nomes daria "recru", que é feio e diz menos — e nem sequer é por acaso: o
  // "recru" ganha um nome só porque o site CORTOU "NconsigoResponder Senhor
  // Recru..". Deixar o rótulo ser decidido por um nome truncado seria deixar
  // o defeito da fonte escolher a palavra que eu mostro a ele.
  //
  // Então dentro da família fica a MAIS LONGA que ainda apanha quase tudo.
  // Perder um nome em dez para ganhar a palavra inteira é troca boa.
  const ordenadas = fora.sort((a, b) => b.quantos - a.quantos || b.raiz.length - a.raiz.length);
  const familias = [];
  for (const r of ordenadas) {
    const dela = familias.find((f) => f.some((g) => g.raiz.includes(r.raiz) || r.raiz.includes(g.raiz)));
    if (dela) dela.push(r); else familias.push([r]);
  }
  const guardadas = familias.map((f) => {
    const teto = Math.max(...f.map((x) => x.quantos));
    // A folga é por RAZÃO e por CONTAGEM: 85% resolve as famílias grandes, mas
    // com cinco nomes o 85% arredonda para cinco e volta a excluir a palavra
    // inteira por um nome de diferença. Um nome de folga cobre esse caso.
    const chao = Math.max(minNomes, Math.min(teto - 1, Math.ceil(teto * 0.85)));
    const bons = f.filter((x) => x.quantos >= chao);
    return bons.reduce((a, b) => (b.raiz.length > a.raiz.length ? b : a));
  });
  return guardadas.sort((a, b) => b.pontos - a.pontos || b.quantos - a.quantos);
}

module.exports = { raizesRepetidas, normalizar, ehRisada };
