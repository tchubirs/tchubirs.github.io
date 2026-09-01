/**
 * Achar os tiros. Pela força, como ele disse.
 *
 * A primeira versão disto procurava RITMO: oito ataques em cadência, com um
 * intervalo entre 0,07 e 0,28 s. Ele viu os quinze clipes que ela deu e nenhum
 * era uma kill — e a razão é aritmética. Esse intervalo é uma cadência de 3,6 a
 * 14 Hz, e a cadência das sílabas de quem fala é 4 a 7 Hz. Estava a construir
 * um detector de fala e a chamar-lhe detector de tiroteio. Num dos candidatos
 * fui ver o ecrã dele: estava parado no inventário a saquear um barril.
 *
 * Pior: a envolvente que usava normaliza o som por RMS a cada pedaço. Isso é
 * certo para ALINHAR dois canais — tira o volume da conta e compara só a forma
 * — e é exactamente o contrário do que aqui é preciso. Ele disse-o em duas
 * frases: "quando acontece um som de disparo, é o pico praticamente mais alto
 * do gráfico", e "quando ocorre um acerto na cabeça, o som é muito alto".
 * A força ERA o sinal, e eu dividia-a fora antes de olhar.
 *
 * Então isto mede três coisas, e nenhuma é ritmo:
 *
 *   1. AGUDO. Um tiro é um estouro de banda larga; uma voz vive quase toda
 *      abaixo de 1 kHz. Separa-se com um passa-alto de um pólo — sem FFT.
 *   2. SUBIDA. Um tiro vai do nada ao pico em milissegundos. Uma sílaba não.
 *   3. ALTURA, contra o chão da NOITE INTEIRA e não do pedaço. É isto que faz
 *      "o pico mais alto do gráfico" querer dizer alguma coisa.
 *
 * E os sons que ele listou a seguir ao disparo — o acerto, o impacto de levar
 * um tiro, o headshot — são todos impulsos agudos e bruscos. Caem todos aqui
 * dentro, e o headshot, por ser o mais alto, puxa a luta para o topo da lista.
 */

// 24 kHz e nao 8. A 8 kHz o mundo acaba nos 4 kHz, e e para cima disso que um
// tiro se distingue de uma voz — era como procurar uma cor de olhos fechados.
export const TAXA_TIROS = 24000;
// Dois milissegundos. Nao e um numero arbitrario: e a janela em que um estouro
// se ve e uma silaba nao. Medido — com blocos de 2 ms, o salto de energia de
// um tiro passa os 180x e o da fala nunca passa os 4,3x.
export const BLOCO_MS = 2;
export const FPS = 1000 / BLOCO_MS;

/**
 * Energia bloco a bloco, so do que e agudo.
 *
 * O passa-alto e o sinal menos a sua propria media movel: um polo, uma
 * multiplicacao por amostra. Nao e um filtro bonito, e serve para uma coisa
 * so — tirar da frente os graves, que sao onde vivem a voz e o bombo da
 * musica. Sem ele, uma batida de bateria tambem sobe num instante e passava
 * por tiro.
 */
export function energia(amostras, taxa = TAXA_TIROS) {
  const bl = Math.max(1, Math.round((taxa * BLOCO_MS) / 1000));
  const n = Math.floor(amostras.length / bl);
  const saida = new Float32Array(n);
  const a = Math.exp((-2 * Math.PI * 2000) / taxa);
  let media = 0;
  for (let b = 0; b < n; b++) {
    let soma = 0;
    for (let i = b * bl; i < (b + 1) * bl; i++) {
      media = a * media + (1 - a) * amostras[i];
      const alto = amostras[i] - media;
      soma += alto * alto;
    }
    saida[b] = Math.sqrt(soma / bl);
  }
  return saida;
}

/**
 * O chao: quanto som ha quando nao esta a acontecer nada.
 *
 * A mediana e nao a media, porque a media de uma noite com tiroteios e puxada
 * pelos proprios tiroteios. E de TUDO o que se ouviu, e nao de cada pedaco: o
 * chao tem de ser o mesmo do principio ao fim da noite, senao um bocado
 * silencioso passa a ter os seus proprios "picos mais altos".
 */
export function chao(blocos) {
  if (!blocos.length) return 0;
  const v = Float32Array.from(blocos).sort();
  const m = v[Math.floor(v.length / 2)];
  // Um chao a zero — som mudo, um bocado sem faixa — faria tudo parecer
  // infinitamente alto. Melhor dizer que nao ha chao.
  return m > 0 ? m : 0;
}

/**
 * Os impulsos: alto E instantaneo.
 *
 * As duas condicoes juntas sao o filtro todo, e cada uma sozinha e inutil.
 * Alto sozinho apanha musica, gritos e o inventario a abrir. Instantaneo
 * sozinho apanha cada estalido do jogo, por mais longe que esteja. Um tiro e
 * as duas coisas ao mesmo tempo — foi o que ele descreveu: "e o pico
 * praticamente mais alto do grafico", e sobe do nada.
 *
 * @param {number} alturaMin quantas vezes acima do chao da noite
 * @param {number} saltoMin quantas vezes acima do que estava 2 ms antes.
 *   Medido em som feito de proposito: a fala nunca passa dos 4,3x e um tiro
 *   passa dos 180x. Seis deixa uma folga larga dos dois lados.
 */
export function impulsos(blocos, piso, { alturaMin = 8, saltoMin = 6 } = {}) {
  const saida = [];
  if (!piso) return saida;
  for (let b = 1; b < blocos.length; b++) {
    const altura = blocos[b] / piso;
    if (altura < alturaMin) continue;
    if (blocos[b] / (blocos[b - 1] + 1e-9) < saltoMin) continue;
    saida.push({ bloco: b, altura });
  }
  return saida;
}

/**
 * As lutas: impulsos que andam juntos.
 *
 * Um tiro sozinho a duzentos metros nao e uma luta dele. Quatro juntos sao.
 *
 * Os catorze segundos de intervalo foram medidos no som verdadeiro dele. Com
 * seis — o valor de antes — a duracao mediana de um "tiroteio" dava 4,2 s, e
 * ele viu o resultado: "no 15 o clipe acaba antes de comecar o PvP de
 * verdade". Nao acabava: e que um combate era partido em pedacos de quatro
 * segundos. Com catorze, a mediana passa a 12,8 s e a troca grande das 21:22
 * volta a ser UMA — cinquenta e dois segundos, setenta e quatro disparos, e o
 * kill feed do servidor mostra varias mortes nessa janela.
 *
 * Saem ordenadas pelo IMPULSO MAIS ALTO de cada uma, e nao pelo relogio: o
 * headshot e o som mais alto do jogo, por isso a luta com o pico maior e a que
 * ele quer ver primeiro numa lista de trinta.
 */
export function lutas(imps, { minTiros = 4, juntarS = 14, maxLutaS = 90 } = {}) {
  const juntar = juntarS * FPS;
  const grupos = [];
  let atual = null;
  for (const i of imps) {
    if (atual && i.bloco - atual.fim <= juntar && i.bloco - atual.inicio <= maxLutaS * FPS) {
      atual.fim = i.bloco;
      atual.tiros++;
      atual.pico = Math.max(atual.pico, i.altura);
    } else {
      if (atual && atual.tiros >= minTiros) grupos.push(atual);
      atual = { inicio: i.bloco, fim: i.bloco, tiros: 1, pico: i.altura };
    }
  }
  if (atual && atual.tiros >= minTiros) grupos.push(atual);

  return grupos
    .map((g) => ({
      ...g,
      // O instante que interessa e o do tiro mais alto, e nao o do primeiro:
      // e ai que a coisa acontece.
      inicioS: g.inicio / FPS,
      fimS: g.fim / FPS,
      duracaoS: (g.fim - g.inicio) / FPS,
    }))
    .sort((a, b) => b.pico - a.pico);
}

/** Tudo junto: de amostras a lutas, ordenadas. */
export function procurarTiros(amostras, { taxa = TAXA_TIROS, ...opcoes } = {}) {
  const blocos = energia(amostras, taxa);
  const piso = chao(blocos);
  return lutas(impulsos(blocos, piso, opcoes), opcoes);
}
