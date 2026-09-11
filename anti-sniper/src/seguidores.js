'use strict';
/**
 * Quem entra no servidor logo a seguir a ti.
 *
 * "Comparar nomes e ver quem está no server pra ver quem está snipando."
 *
 * Um sniper não se distingue por jogar bem nem por aparecer no sítio certo —
 * isso é o que ele PARECE. O que ele FAZ, e que fica escrito, é entrar no
 * servidor depois de a live abrir, e entrar outra vez na noite seguinte, e na
 * outra. Uma vez é acaso. Cinco noites seguidas não é.
 *
 * Isto trabalha sobre fotografias da lista de jogadores — o que a consulta
 * A2S devolve, que é a mesma lista que o navegador de servidores do jogo
 * mostra. Sem token, sem subscrição, sem cooperação de ninguém.
 *
 * O que NÃO se faz aqui, de propósito: dizer que alguém é sniper. Isto conta
 * vezes e devolve uma ordem. Quem decide é quem lê, e é por isso que cada
 * linha leva as horas em que aconteceu.
 */

/**
 * As entradas de cada nome, a partir das fotografias.
 *
 * Uma "entrada" é a primeira fotografia em que o nome aparece depois de ter
 * faltado. Sem esta parte, alguém que ficou a noite inteira contava como
 * cinquenta entradas.
 *
 * @param {Array<{ms:number, nomes:string[]}>} fotos por ordem de tempo
 * @returns {Map<string, number[]>} nome -> instantes de entrada
 */
function entradas(fotos) {
  const ordenadas = [...fotos].sort((a, b) => a.ms - b.ms);
  const saida = new Map();
  let antes = new Set();
  for (const f of ordenadas) {
    const agora = new Set(f.nomes);
    for (const n of agora) {
      if (antes.has(n)) continue;
      if (!saida.has(n)) saida.set(n, []);
      saida.get(n).push(f.ms);
    }
    antes = agora;
  }
  return saida;
}

/**
 * Quantas vezes cada pessoa entrou LOGO A SEGUIR ao alvo.
 *
 * A janela é por defeito dez minutos: é quanto demora a ver uma live começar,
 * decidir, e entrar. Menos do que isso perde quem hesita; mais do que isso
 * apanha toda a gente que entra à hora de jantar.
 *
 * O `ignorar` é a equipa dele. Os companheiros entram sempre a seguir uns aos
 * outros — é isso que uma equipa é — e sem os tirar da conta eles ficavam
 * sempre no topo da lista, que é o resultado mais inútil possível.
 *
 * @param {Array<{ms:number, nomes:string[]}>} fotos
 * @param {string} alvo o nome de quem transmite
 * @param {object} op
 * @param {number} [op.janelaMin] minutos depois da entrada do alvo
 * @param {string[]} [op.ignorar] a equipa, e o próprio alvo
 */
function seguidores(fotos, alvo, { janelaMin = 10, ignorar = [] } = {}) {
  const mapa = entradas(fotos);
  const doAlvo = mapa.get(alvo) || [];
  const fora = new Set([alvo, ...ignorar].map((n) => n.toLowerCase()));
  const janela = janelaMin * 60000;

  const contas = new Map();
  for (const [nome, vezes] of mapa) {
    if (fora.has(nome.toLowerCase())) continue;
    for (const t of vezes) {
      // A seguir, e não antes: quem já lá estava não te seguiu a lado nenhum.
      const depoisDe = doAlvo.find((a) => t >= a && t - a <= janela);
      if (depoisDe === undefined) continue;
      if (!contas.has(nome)) contas.set(nome, { nome, vezes: 0, atrasosS: [], entradas: vezes.length });
      const c = contas.get(nome);
      c.vezes++;
      c.atrasosS.push(Math.round((t - depoisDe) / 1000));
    }
  }

  return [...contas.values()]
    .map((c) => ({
      ...c,
      // Quantas das entradas DELE foram a seguir a ti. Alguém que entra vinte
      // vezes por noite acaba por calhar; alguém que só entra quando tu entras
      // é outra coisa, e é esta fracção que separa as duas.
      fatia: c.vezes / c.entradas,
      atrasoMedianoS: c.atrasosS.slice().sort((a, b) => a - b)[Math.floor(c.atrasosS.length / 2)],
    }))
    .sort((a, b) => (b.vezes - a.vezes) || (b.fatia - a.fatia));
}

/**
 * A equipa de alguém: quem joga SEMPRE com essa pessoa.
 *
 * "Se tivesse uma opção ver o time de tal pessoa ajudava muito."
 *
 * Ajuda, sim: quem te mata sozinho é uma coisa, quem te mata com quatro
 * amigos é outra, e saber quem são esses quatro poupa a noite seguinte.
 *
 * A conta que parece certa e está errada é "quem aparece mais ao lado dele".
 * Num servidor de 300 pessoas, quem está online 14 horas por dia aparece ao
 * lado de toda a gente e ficava sempre no topo — a lista dava os jogadores
 * mais viciados do servidor, não a equipa de ninguém.
 *
 * Por isso isto pede as DUAS fracções:
 *
 *   · `dele` — das vezes que o ALVO lá esteve, quantas é que este também
 *   · `dela` — das vezes que ESTE lá esteve, quantas é que o alvo também
 *
 * Um companheiro de equipa tem as duas altas. Quem vive no servidor tem a
 * primeira alta e a segunda baixa, e cai sozinho.
 *
 * @param {Array<{ms:number, nomes:string[]}>} fotos
 * @param {string} alvo
 */
function equipaDe(fotos, alvo, { minFraccao = 0.6, minJuntos = 3, normalizar = (s) => String(s).toLowerCase() } = {}) {
  const chave = normalizar(alvo);
  const ordenadas = [...(fotos || [])].sort((a, b) => a.ms - b.ms);
  const total = new Map();          // nome -> em quantas fotos apareceu
  let fotosDoAlvo = 0;
  const juntos = new Map();         // nome -> em quantas fotos esteve COM o alvo

  for (const f of ordenadas) {
    const presentes = new Map();
    for (const n of f.nomes || []) presentes.set(normalizar(n), n);
    for (const [k] of presentes) total.set(k, (total.get(k) || 0) + 1);
    if (!presentes.has(chave)) continue;
    fotosDoAlvo++;
    for (const [k, nome] of presentes) {
      if (k === chave) continue;
      const v = juntos.get(k) || { nome, vezes: 0 };
      v.vezes++;
      juntos.set(k, v);
    }
  }

  const equipa = [...juntos.entries()]
    .map(([k, v]) => ({
      nome: v.nome,
      juntos: v.vezes,
      dele: fotosDoAlvo ? v.vezes / fotosDoAlvo : 0,
      dela: total.get(k) ? v.vezes / total.get(k) : 0,
    }))
    .filter((x) => x.juntos >= minJuntos && x.dele >= minFraccao && x.dela >= minFraccao)
    .sort((a, b) => (b.dele + b.dela) - (a.dele + a.dela) || b.juntos - a.juntos);

  return { alvo, fotosDoAlvo, equipa };
}

module.exports = { entradas, seguidores, equipaDe };
