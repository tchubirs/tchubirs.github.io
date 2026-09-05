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
const { raizesRepetidas, normalizar } = require('./raiz');
const { momento, ano, chaveDoDia } = require('./data');

function ordenarPorIdentidade(ocorrencias, { listaCompleta = true } = {}) {
  const lista = (ocorrencias || []).filter((o) => o && o.nome);
  if (!lista.length) return [];

  // A raiz por baixo dos nomes, antes de tudo o resto.
  //
  // Foi ele que apanhou: *"tem um nome muito similar que aparece muitas
  // vezes"*. Quem troca de nome trezentas vezes não repete a string, repete a
  // IDEIA — muda o prefixo do canal, troca uma letra por um número, junta um
  // sufixo. Contar só repetição exacta via dez nomes diferentes com sinal
  // zero, e a saída ia buscar um nome ao acaso.
  const raizes = raizesRepetidas(lista);
  const raizDe = (nome) => {
    const junto = normalizar(nome).replace(/ /g, '');
    return raizes.find((r) => junto.includes(r.raiz)) || null;
  };

  // A leitura da data vive em `src/data.js`: é a MESMA que a junção das
  // fontes usa para deduplicar. Duas cópias da regra seriam duas regras.
  const anos = lista.map(ano).filter(Number.isFinite);
  const maisAntigo = anos.length ? Math.min(...anos) : null;
  const maisNovo = anos.length ? Math.max(...anos) : null;

  // Há linha do tempo? A pergunta é sobre DIAS distintos, não sobre anos.
  //
  // Eu exigia `span >= 1` — ou seja, o histórico tinha de atravessar a virada
  // do calendário. A razão era boa quando a fonte só dava o ano: com tudo no
  // mesmo ano, a posição era a ordem que o site devolveu, não a verdade. Só
  // que desde que leio o dia isso deixou de ser assim. Uma conta com trinta
  // nomes de 01 Jan a 29 Out do mesmo ano tem dez meses de cronologia exacta,
  // e mesmo assim perdia o sinal inteiro. Empurrar UM desses nomes para
  // Janeiro seguinte fazia o sinal aparecer — o calendário a decidir o que os
  // dados já diziam.
  const carimbos = new Set(lista.map(momento).filter(Number.isFinite));
  const temLinhaDoTempo = carimbos.size > 1;

  // Ordem cronológica, do mais antigo para o mais novo. "Uns dos primeiros
  // da conta" é POSIÇÃO, não período.
  //
  // O desempate `b.i - a.i` é a outra metade da correcção: quando duas datas
  // dão o mesmo número — mesmo dia, ou só o ano de ambos —, a ordem que resta
  // é a da página, que vem ao contrário. Invertê-la aqui é o que o comentário
  // antigo prometia e o código nunca fazia.
  const cronologica = [...lista]
    .map((o, i) => ({ o, i }))
    .sort((a, b) => momento(a.o) - momento(b.o) || b.i - a.i)
    .map((x) => x.o);

  const por = new Map();
  cronologica.forEach((o, i) => {
    const chave = String(o.nome).trim().toLowerCase();
    if (!chave) return;
    if (!por.has(chave)) {
      por.set(chave, {
        nome: o.nome, vezes: 0, anos: new Set(), posicao: i, primeiroDaConta: false,
      });
    }
    const g = por.get(chave);
    // Aqui conta-se LINHA a linha, e é o correcto — desde que quem chama já
    // tenha juntado as fontes como deve ser.
    //
    // A tentação era desduplicar por dia aqui dentro. Seria errado: numa
    // página só-ano, quatro crachás debaixo de "2019" são quatro usos que a
    // fonte só soube datar até ao ano, e colapsá-los deitaria fora sinal
    // verdadeiro. O que não pode acontecer é a MESMA troca de nome, lida em
    // dois sites, contar duas vezes — e esse é problema da junção, que é onde
    // ele se resolve (ver a chave em bin/nomes.js). Um sítio a desduplicar,
    // não dois.
    g.vezes += 1;
    if (o.secao === 'primeiro-nome') g.primeiroDaConta = true;
    const a = ano(o);
    if (a != null) g.anos.add(a);
  });

  // "Cedo" é da IDENTIDADE, não da forma.
  //
  // Sem isto a família partia-se ao meio: "[BDM]Senhor capitao" de 2016 apanhava
  // o bónus de estar no começo e "Capitao" de 2026 não, e a resposta passava a
  // ser a forma com moldura por ser a mais velha. Mas quem estava no começo da
  // conta era a PESSOA — a forma que ela usou nesse dia é acidente. Se qualquer
  // membro da família é dos primeiros, a família é.
  const quantosContam = Math.max(1, Math.min(5, Math.ceil(por.size / 5)));
  // "É o 1º nome da conta" só se pode dizer sobre a conta INTEIRA.
  //
  // Na corrida dele o steamhistory devolveu 100 de 344 nomes, e a saída dizia
  //     2 pt  Juice Fruit   é o 1º nome da conta
  // O "Juice Fruit" é o mais antigo dos CEM que eu li. Os nomes verdadeiramente
  // antigos são de 2015 e estavam nos 244 que ficaram de fora. Ou seja: eu
  // pegava no fundo do meu balde e chamava-lhe o fundo do poço.
  //
  // A marca do site ("First name seen by SteamID") continua a valer, porque
  // aí quem afirma é a fonte e não a minha contagem.
  const cedoDaForma = (g) => g.primeiroDaConta
    || (listaCompleta && temLinhaDoTempo && g.posicao < quantosContam);
  const familiaCedo = new Set();
  for (const g of por.values()) {
    const r = raizDe(g.nome);
    if (r && cedoDaForma(g)) familiaCedo.add(r.raiz);
  }

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
    // RAIZ: partilha o miolo com outros nomes da mesma conta.
    const raiz = raizDe(g.nome);
    // E há um caso especial dentro da família: o nome que É a raiz, sem mais
    // nada à volta. Ele confirmou-o a olhar para os dados — "recruta é o
    // correto", não "SenhorRecruta" nem "[BDM]Senhor recruta". Faz sentido:
    // as outras formas são esta com moldura por cima.
    const ehARaiz = Boolean(raiz) && normalizar(g.nome).replace(/ /g, '') === raiz.raiz;

    // Três maneiras de ser "cedo", da melhor para a pior.
    //
    // A marca "First name seen by SteamID" é o próprio site a dizer qual foi o
    // primeiro: não há nada a deduzir, e a exigência de linha do tempo não se
    // aplica. Por posição é dedução minha, e por isso exige linha do tempo:
    // sem dias distintos a posição é a ordem que a fonte devolveu, não a
    // verdade. E por família é herdado: outra forma do mesmo nome estava lá no
    // começo, logo esta identidade estava.
    const proprio = cedoDaForma(g);
    const cedo = proprio || Boolean(raiz && familiaCedo.has(raiz.raiz));

    const repetiu = g.vezes > 1;


    // Os pesos são ordinais, não medidos: eu não tenho dados para calibrar
    // isto, e fingir que tenho seria inventar precisão. O que a ordem
    // garante é que voltar > repetir > ser cedo, que é a regra dele.
    let pontos = 0;
    if (voltou) pontos += 5;
    if (repetiu) pontos += 2 + Math.min(g.vezes - 1, 3);
    if (cedo) pontos += 2;
    // A raiz pesa MAIS que voltar ao nome, e isto é uma mudança à regra dele
    // que eu faço de olhos abertos: nove variações da mesma ideia espalhadas
    // por dez anos são mais prova que um regresso único à mesma string. A
    // ordem entre os três sinais antigos fica intacta.
    if (raiz) pontos += 2 + Math.min(raiz.quantos - 1, 6);

    fora.push({
      nome: g.nome,
      vezes: g.vezes,
      // Onde a PRIMEIRA aparição deste nome cai na linha do tempo. Já era
      // usada aqui dentro para escrever "é o Nº nome da conta"; sai agora
      // também no resultado, porque é o único jeito de um teste conferir a
      // ordem cronológica — e foi exactamente aí que o erro do dia se
      // escondeu, sem ninguém a poder apanhar de fora.
      posicao: g.posicao,
      anosUsados: usados,
      primeiroEm: primeiro,
      ultimoEm: ultimo,
      voltou,
      repetiu,
      cedo,
      raiz: raiz ? raiz.raiz : null,
      raizEm: raiz ? raiz.quantos : 0,
      ehARaiz,
      primeiroDaConta: g.primeiroDaConta,
      pontos,
      porque: [
        raiz && (ehARaiz
          ? `é a raiz que ${raiz.quantos - 1} outros nomes repetem`
          : `partilha a raiz "${raiz.raiz}" com ${raiz.quantos - 1} outros nomes`),
        voltou && `voltou a usar depois de ${ultimo - primeiro} anos`,
        repetiu && `usou ${g.vezes}×`,
        // A frase distingue as duas: uma é o site a afirmar, a outra sou eu
        // a contar posições. Dar-lhes o mesmo texto escondia dele qual é qual.
        cedo && (g.primeiroDaConta
          ? 'é o primeiro nome que a Steam registou'
          : proprio
            ? `é o ${g.posicao + 1}º nome da conta`
            : 'esta identidade já estava no começo da conta, noutra forma'),
      ].filter(Boolean),
    });
  }

  // Empate desfeito pelo mais antigo: entre dois nomes igualmente pontuados,
  // o que veio primeiro é o mais provável de ser o original. O nome marcado
  // pelo site como primeiro da conta entra à frente disso — sem esta linha
  // ele perdia todos os empates por não ter ano a que agarrar-se
  // (`primeiroEm` fica null → 9999, ou seja, o mais recente de todos).
  return fora.sort((a, b) => b.pontos - a.pontos
    || (b.primeiroDaConta === true) - (a.primeiroDaConta === true)
    // Dentro da família, o nome que É a raiz vem primeiro — e tem de vir ANTES
    // da data, senão nunca chega a correr: "SenhorRecruta" é de 2016 e
    // "Recruta" de 2026, e a data sozinha elegia o de 2016. Só que a resposta
    // à pergunta "quem é esta pessoa" é o nome sem moldura, não o mais antigo
    // com moldura — foi ele que o disse a olhar para os dados.
    || (a.raiz && a.raiz === b.raiz ? (b.ehARaiz === true) - (a.ehARaiz === true) : 0)
    || (a.primeiroEm ?? 9999) - (b.primeiroEm ?? 9999)
    || b.vezes - a.vezes
    // Entre variações DA MESMA RAIZ, a mais curta é o nome e as outras são
    // moldura. Fora da família isto não vale nada — premiar o nome curto entre
    // dois estranhos empatados seria escolher por sorteio e chamar-lhe critério.
    || (a.raiz && a.raiz === b.raiz ? String(a.nome).length - String(b.nome).length : 0)
    // E o último desempate é a cronologia: mais antigo à frente.
    || a.posicao - b.posicao);
}

/**
 * Os poucos nomes que valem a pena cruzar.
 *
 * Cruzar 344 nomes contra a audiência é o caminho certo para um falso
 * positivo: com trezentos tiros, algum acerta por acaso. Esta função escolhe
 * os que têm sinal — e devolve TODOS quando não há sinal nenhum, porque aí
 * escolher seria escolher a esmo.
 */
function nomesQueValem(ocorrencias, { teto = 12, porRaiz = false, listaCompleta = true } = {}) {
  const ord = ordenarPorIdentidade(ocorrencias, { listaCompleta });
  const comSinal = ord.filter((n) => n.pontos > 0);
  let fila = comSinal.length ? comSinal : ord;

  // `porRaiz`: uma família conta como UM candidato, não como nove.
  //
  // A ordem importa e foi onde eu me enganei primeiro: se o tecto cortar antes
  // de juntar as famílias, as nove variações de "recruta" ocupam a lista toda
  // e empurram para fora o "Trynitythegod", que tinha sinal PRÓPRIO — é o
  // primeiro nome da conta. Juntar depois de cortar é cortar a informação.
  if (porRaiz) {
    const vistas = new Set();
    fila = fila.filter((n) => {
      if (!n.raiz) return true;
      if (vistas.has(n.raiz)) return false;
      vistas.add(n.raiz);
      return true;
    });
  }
  return fila.slice(0, teto);
}

module.exports = { ordenarPorIdentidade, nomesQueValem, raizesRepetidas };
