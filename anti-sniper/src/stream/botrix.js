'use strict';
/**
 * Audiência via BotRix.
 *
 * O BotRix é o bot de fidelidade que funciona nas TRÊS plataformas dele —
 * Twitch, Kick e YouTube — e já grava **nome + tempo de visualização** por
 * pessoa. É a fonte de audiência do projeto, e o dado já existe: não precisa
 * ligar nada nem esperar semanas acumulando.
 *
 * Aqui a entrada é a tabela COLADA do painel. Isso é de propósito: procurar
 * a API do BotRix seria mais uma rodada de pesquisa, e colar a tabela
 * funciona hoje. Quando a API aparecer, ela vira só mais uma função com a
 * mesma saída.
 */

/**
 * "2d 19h 10min" -> 3910 minutos. Aceita as formas que o painel produz:
 * com dias, sem dias, só horas, só minutos.
 */
function paraMinutos(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.toLowerCase().replace(',', '');
  let total = 0;
  let achou = false;
  for (const [re, mult] of [
    [/(\d+)\s*d\b/, 1440],
    [/(\d+)\s*h\b/, 60],
    [/(\d+)\s*min\b/, 1],
    [/(\d+)\s*m\b(?!in)/, 1],
  ]) {
    const m = t.match(re);
    if (m) { total += Number(m[1]) * mult; achou = true; }
  }
  return achou ? total : null;
}

/**
 * Lê a tabela colada. Cada linha do painel é:
 *   posição · nome · nível · pontos · tempo de visualização
 *
 * A colagem varia: às vezes vem separada por tabulação, às vezes por vários
 * espaços, às vezes cada célula numa linha. Em vez de exigir um formato,
 * ancora no que é inconfundível — o tempo, que sempre termina em `min` ou `h`
 * — e lê o resto para trás a partir dele.
 */
function lerTabela(texto) {
  if (typeof texto !== 'string') return [];
  const fora = [];
  const vistos = new Set();

  // normaliza: tudo em uma sequência de células
  const celulas = texto
    .split(/\t|\n|\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (let i = 0; i < celulas.length; i++) {
    const min = paraMinutos(celulas[i]);
    if (min == null) continue;
    // andando para trás: pontos, nível, nome
    const pontos = Number(celulas[i - 1]);
    const nivel = Number(celulas[i - 2]);
    const nome = celulas[i - 3];
    if (!nome || Number.isNaN(pontos) || Number.isNaN(nivel)) continue;
    // nome não pode ser número — se for, a linha veio torta e é melhor
    // pular do que registrar um espectador chamado "7"
    if (/^\d+$/.test(nome)) continue;
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    fora.push({ nome, nivel, pontos, minutosAssistidos: min });
  }
  return fora.sort((a, b) => b.minutosAssistidos - a.minutosAssistidos);
}

module.exports = { paraMinutos, lerTabela };
