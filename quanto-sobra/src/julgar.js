'use strict';
//
// A conta que o site não faz.
//
// O painel mostra "$4.553 de $5.600" e uma barra verde. O que decide não é
// isso: é quanto sobra A DIVIDIR pela velocidade a que está a sair. Uma
// campanha com $1.046 no banco parece viva; a queimar $240 por dia, morre na
// quinta-feira, e quem publicar na sexta trabalha de graça.
//

const DIA_MS = 24 * 3600 * 1000;

/**
 * Quanto a campanha paga MESMO por mil views, medido nela própria.
 *
 * O CPM anunciado é o tecto, não a média. O Rex Stax anuncia $1 e teve 15,8
 * milhões de views — a $1 seriam $15.842, mas pagou $4.553. A diferença é
 * submissão reprovada e o tecto de $500 por vídeo. Usar o CPM anunciado para
 * prever a queima dá uma campanha a morrer 3,4 vezes mais depressa do que
 * morre, e faz recusar campanhas boas.
 *
 * Devolve `null` enquanto não houver history suficiente para medir.
 */
function taxaRealizada(c) {
  if (!Number.isFinite(c.viewsTotais) || c.viewsTotais < 1000) return null;
  if (!Number.isFinite(c.gasto) || c.gasto <= 0) return null;
  return c.gasto / (c.viewsTotais / 1000);
}

/** Quanto sai por dia, em dólares, medido nas views dos últimos `janela` dias. */
function queimaPorDia(c, { janela = 7 } = {}) {
  const real = taxaRealizada(c);
  const cpm = real ?? c.cpmMin ?? c.cpmMax;
  const pontos = (c.porDia || []).slice(-janela);
  // O último ponto é o dia de hoje, ainda a meio: contá-lo puxa a média para
  // baixo e faz uma campanha a morrer parecer que tem semanas pela frente.
  const fechados = pontos.length > 1 ? pontos.slice(0, -1) : pontos;

  if (Number.isFinite(cpm) && fechados.length) {
    const views = fechados.reduce((s, p) => s + p.views, 0);
    const de = real ? 'views x taxa real' : 'views x CPM anunciado';
    return { valor: (views / 1000) * cpm / fechados.length, de, dias: fechados.length, taxa: cpm };
  }
  // Sem histórico: a média desde que foi listada. Pior, mas é honesto dizê-lo.
  const desde = c.listadaEm ? Date.parse(c.listadaEm) : NaN;
  if (Number.isFinite(desde) && Number.isFinite(c.gasto)) {
    const idade = Math.max(1, (Date.now() - desde) / DIA_MS);
    return { valor: c.gasto / idade, de: 'media desde que foi listada', dias: Math.round(idade), taxa: real };
  }
  return { valor: null, de: null, dias: 0, taxa: null };
}

/**
 * ENTRA, CUIDADO ou MORTA — com o motivo escrito, para se poder discordar.
 *
 * Os limites são números e estão aqui à vista de propósito. Um veredicto que
 * não diz porquê não é um veredicto, é um palpite com ar de autoridade.
 */
const LIMITES = {
  progressoMorta: 0.90,   // gastou 90% do orçamento
  diasMinimos: 7,         // menos de uma semana de orçamento é tarde demais
  restanteMinimo: 100,    // abaixo de $100 não vale o trabalho de entrar
};

function julgar(c, { limites = LIMITES } = {}) {
  if (!c) return null;
  const queima = queimaPorDia(c);
  const diasRestantes = queima.valor > 0 ? c.restante / queima.valor : null;

  const porque = [];
  let veredicto = 'ENTRA';
  const matar = (m) => { veredicto = 'MORTA'; porque.push(m); };
  const avisar = (m) => { if (veredicto !== 'MORTA') veredicto = 'CUIDADO'; porque.push(m); };

  if (c.estado !== 'active') matar(`a campanha está "${c.estado}", não activa`);
  if (c.restante < limites.restanteMinimo) matar(`só restam $${c.restante.toFixed(2)}`);
  if (c.progresso != null && c.progresso >= limites.progressoMorta) {
    matar(`já gastou ${(c.progresso * 100).toFixed(1)}% do orçamento`);
  }
  if (diasRestantes != null && diasRestantes < limites.diasMinimos) {
    avisar(`ao ritmo actual o dinheiro acaba em ${diasRestantes.toFixed(1)} dias`);
  }
  if (c.exigeCandidatura) avisar('exige candidatura, não se entra direto');
  if (c.privada) avisar('é privada');
  if (!c.agenciaVerificada) avisar('a agência não está verificada');
  if (veredicto === 'ENTRA') {
    porque.push(`restam $${c.restante.toFixed(2)} e ${(diasRestantes ?? Infinity).toFixed(1)} dias de orçamento`);
  }

  return {
    veredicto,
    porque,
    queimaPorDia: queima.valor,
    queimaDe: queima.de,
    queimaDias: queima.dias,
    taxaPorMil: queima.taxa,
    diasRestantes,
    // Quanto sobra por cada pessoa que já lá está. É a melhor medida de
    // concorrência: $20.000 com 47 clippers vale mais que $5.000 com 2.600.
    porClipper: c.clippers ? c.restante / c.clippers : null,
  };
}

module.exports = { taxaRealizada, queimaPorDia, julgar, LIMITES, DIA_MS };
