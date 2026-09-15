'use strict';
//
// A conta que o Devpost não faz.
//
// O site ordena por prémio. O prémio é a pergunta errada: $50.000 com um único
// vencedor entre 3.000 pessoas é lotaria, e $400 repartidos por 3 prémios entre
// 234 pessoas não é.
//
// Quem precisa de PROVAR que entra dinheiro quer a HIPÓTESE de receber alguma
// coisa — prémios em dinheiro a dividir pelos inscritos — e não o valor esperado
// máximo. São perguntas diferentes e dão ordens diferentes.
//

/** Limites, à vista para se poder discordar. Medidos, não inventados. */
const LIMITES = {
  // Amostra de 15/09/2026, 49 concursos abertos: prémio mediano $275,
  // inscritos mediana 195. 21 dos 49 tinham prémio ZERO.
  diasMinimos: 3,          // menos de três dias não chega para construir e submeter
  hipoteseFraca: 0.01,     // abaixo de 1% de hipótese é bilhete de rifa
};

const num = (x) => (Number.isFinite(x) ? x : null);

/**
 * FORA, TARDE, FRACO ou VALE.
 *
 * `FORA` é eliminação por regra dura — não é opinião, é um facto que o impede
 * de participar ou de receber. `VALE` nunca quer dizer "vais ganhar".
 */
function julgar(c, { limites = LIMITES } = {}) {
  if (!c || !c.titulo) return null;

  const fora = [], avisos = [], notas = [];

  if (!c.aberto) fora.push('já fechou');
  if (c.soPorConvite) fora.push('é só por convite, e ninguém o convidou');
  // 9 dos 49 abertos eram presenciais — Bengaluru, Munique, Baltimore. O melhor
  // rácio da amostra inteira era um deles, e não servia para nada.
  if (!c.online) fora.push(`é presencial${c.local ? ` (${c.local})` : ''}`);
  // 21 dos 49 abertos não tinham dinheiro nenhum. É a eliminação mais comum.
  if (!(c.premioTotal > 0)) fora.push('não tem dinheiro nenhum em prémios');
  else if (!(c.premiosEmDinheiro > 0)) {
    fora.push(`anuncia $${c.premioTotal.toLocaleString('pt-PT')} mas nenhum prémio é em dinheiro`);
  }

  const hipotese = (c.inscritos > 0 && c.premiosEmDinheiro > 0)
    ? c.premiosEmDinheiro / c.inscritos : null;
  const porInscrito = (c.inscritos > 0 && c.premioTotal > 0)
    ? c.premioTotal / c.inscritos : null;

  const dias = num(c.diasQueFaltam);
  if (dias != null && dias < limites.diasMinimos) {
    avisos.push(`faltam ${dias} dias: não dá para construir e submeter`);
  }
  if (hipotese != null && hipotese < limites.hipoteseFraca) {
    avisos.push(`${(hipotese * 100).toFixed(1)}% de hipótese de receber alguma coisa`);
  }
  if (c.inscritos === 0) notas.push('ainda sem inscritos — o rácio não quer dizer nada');

  let veredicto;
  if (fora.length) veredicto = 'FORA';
  else if (dias != null && dias < limites.diasMinimos) veredicto = 'TARDE';
  else if (hipotese != null && hipotese < limites.hipoteseFraca) veredicto = 'FRACO';
  else veredicto = 'VALE';

  return {
    veredicto,
    porque: [...fora, ...avisos],
    notas,
    hipotese,
    porInscrito,
    // Dito sempre, para ninguém confundir um rácio com uma promessa.
    aviso: veredicto === 'VALE'
      ? 'VALE quer dizer "passa nos filtros e a hipótese não é de rifa" — não quer dizer que ganhas'
      : null,
  };
}

/** Os que valem a pena, do melhor para o pior. */
function ordenar(linhas) {
  const ordem = { VALE: 0, FRACO: 1, TARDE: 2, FORA: 3 };
  return [...linhas].sort((a, b) =>
    (ordem[a.j.veredicto] ?? 9) - (ordem[b.j.veredicto] ?? 9)
    || (b.j.hipotese ?? 0) - (a.j.hipotese ?? 0));
}

module.exports = { julgar, ordenar, LIMITES };
