/**
 * Calibração das confianças do índice (indice.js): de uma medida (a altura do som, a nota de um acerto, a nota do modelo
 * de explosão, a semelhança de um alerta) a "quantas vezes, em exemplos conhecidos, isso estava certo".
 *
 * O dono quer ver a precisão (%) de cada resultado e da busca. Então cada marca do índice leva uma confiança de 0 a 1 e a
 * fonte dela, e esta tabela diz de onde ela veio. As fontes não valem o mesmo, e o texto da tela tem que dizer qual é:
 *
 *   'rotulos'   contada nos rótulos do dono (live do tchubi de 08/10, `probes/rotulos-tchubi-2026-10-08.json`): as regiões de
 *               som alto que caem em clipes que ele descreveu. É por JANELA (ele diz o que aconteceu no clipe, não em cada
 *               som), então uma faixa de som fraco dentro de um clipe de PvP conta como "tiro". Um canal só.
 *   'sintetico' contada em som feito de propósito: clipes do jogo somados a 600 s de live de verdade (acertos) e explosões do
 *               jogo aumentadas contra tiros do jogo aumentados (explosão, prioridades iguais, só 22 tiros).
 *   'estimado'  uma regra, sem exemplos que a meçam (n pequeno ou zero). Serve para ordenar, não para dizer um percentual.
 *
 * `n` é quantos exemplos há em cada faixa. Refazer: `probes/calibrar-indice.mjs` (rótulos) e `probes/modelo-acertos/` (acertos).
 */

export const VERSAO_CALIBRACAO = 1;

export const CALIBRACAO = {
  // pico: quantas vezes acima do chão da live. p: fração das regiões da faixa que estavam em clipe com tiro.
  tiro: {
    fonte: 'rotulos',
    campo: 'pico',
    faixas: [
      { ate: 60, p: 0.37, n: 52 },
      { ate: 75, p: 0.6, n: 0, fonte: 'estimado' }, // nenhuma região do exemplo caiu aqui: ponto entre as faixas vizinhas
      { ate: 100, p: 0.91, n: 22 },
      { ate: null, p: 1, n: 5 },
    ],
  },
  // nota (correlação com o clipe do jogo) de um acerto. p: fração dos candidatos da faixa que eram um clipe somado de verdade.
  acerto: {
    fonte: 'sintetico',
    campo: 'nota',
    faixas: [
      { ate: 0.65, p: 0.3, n: 46 },
      { ate: 0.75, p: 0.58, n: 43 },
      { ate: 0.85, p: 0.81, n: 16 },
      { ate: null, p: 1, n: 51 },
    ],
  },
  // nota do modelo positivo. p: fração de explosões do jogo (não vistas no treino) entre explosões e tiros do jogo, prioridades iguais.
  explosao: {
    fonte: 'sintetico',
    campo: 'nota',
    faixas: [
      { ate: 0.4, p: 0.21, n: 37 },
      { ate: 0.6, p: 0.55, n: 89 },
      { ate: 0.8, p: 0.57, n: 134 },
      { ate: null, p: 0.7, n: 68 },
    ],
  },
  // semelhança de forma de onda entre as repetições. Um par confirmado pelo dono (0,54); os outros grupos (0,12 a 0,25) não foram confirmados.
  alerta: {
    fonte: 'estimado',
    campo: 'onda',
    faixas: [
      { ate: 0.35, p: 0.05, n: 0 },
      { ate: null, p: 0.9, n: 1 },
    ],
  },
  // Só voz: pico abaixo de 60 e voz de 0,58 ou mais. p: fração das regiões assim que estavam em clipe SEM tiro (14 regiões, 10 sem tiro).
  voz: { fonte: 'rotulos', p: 0.71, n: 14 },
  // Farm ou corpo a corpo: pico abaixo de 60 e 15 s ou mais seguidos. 3 regiões, 1 em clipe sem tiro (farm), 2 num clipe de arco e machadinha em lobos.
  farm: { fonte: 'rotulos', p: 0.33, n: 3 },
  // Grito e pico do chat: nenhum exemplo rotulado. A regra é só uma curva que sobe com a força.
  grito: { fonte: 'estimado' },
  chat: { fonte: 'estimado' },
};

/**
 * A confiança de uma medida: `{ p, n, fonte }`. `valor` é a medida da faixa (pico, nota, onda); os tipos de uma faixa só
 * (voz, farm) ignoram o valor.
 */
export function confianca(tipo, valor, tabela = CALIBRACAO) {
  const c = tabela[tipo];
  if (!c) return { p: null, n: 0, fonte: 'estimado' };
  if (!c.faixas) return { p: c.p ?? null, n: c.n ?? 0, fonte: c.fonte };
  for (const f of c.faixas) {
    if (f.ate === null || valor < f.ate) return { p: f.p, n: f.n, fonte: f.fonte || c.fonte };
  }
  return { p: null, n: 0, fonte: c.fonte };
}
