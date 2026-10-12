// Quanto tempo falta para um VOD da Kick sumir (IDEIAS.md, item 7).
//
// A Kick guarda o VOD por 7 dias, ou 30 se o canal for verificado, e o streamer pode apagar antes
// (help.kick.com, "Kick VODs / stream replays"). A lista de VODs de um canal (`/channels/<slug>/videos`)
// não diz até quando cada um fica, nem se o canal é verificado. O que ela mostra de graça: um VOD que
// ainda está lá com mais de 8 dias prova que o canal guarda 30. Sem essa prova conta-se 7, que é o caso
// mais curto: avisar cedo demais custa um download, avisar tarde perde o lance.

export const DIA_MS = 24 * 3600 * 1000;
export const RETENCAO_PADRAO = 7;
export const RETENCAO_VERIFICADO = 30;
// Um dia de folga sobre os 7: a Kick não diz a que horas apaga, e um VOD de 7 dias e 2 horas que ainda
// está na lista não prova nada.
const PROVA_MS = (RETENCAO_PADRAO + 1) * DIA_MS;

/**
 * Quantos dias o canal guarda os VODs, pela lista que a Kick devolveu.
 *
 * A conta é entre os VODs da própria lista, e não contra o relógio de agora: a lista pode vir guardada
 * de horas antes, e um VOD com 8 dias a mais que o mais novo estava lá quando ela foi lida.
 *
 * @param {{inicioApi:number|null}[]} vods os VODs de `vodsDoCanal`
 * @returns {{ dias: number, visto: boolean }} `visto` quando os 30 dias foram provados pela lista
 */
export function retencaoDoCanal(vods) {
  const inicios = (vods || []).map((v) => v?.inicioApi).filter(Number.isFinite);
  if (inicios.length < 2) return { dias: RETENCAO_PADRAO, visto: false };
  const maisNovo = Math.max(...inicios);
  const maisVelho = Math.min(...inicios);
  return maisNovo - maisVelho > PROVA_MS
    ? { dias: RETENCAO_VERIFICADO, visto: true }
    : { dias: RETENCAO_PADRAO, visto: false };
}

/**
 * Quando um VOD some e quantos dias faltam.
 *
 * Conta desde o início da live (`inicioApi`). `dias` arredonda para cima: com 30 horas faltam 2 dias,
 * e "some em 1 dia" com 30 horas pela frente seria pior que dizer a mais. Zero ou menos quer dizer que
 * pela conta já pode ter sumido. Sem hora de início, ou com a live ainda no ar, devolve `null`.
 */
export function prazoDoVod(vod, { retencaoDias = RETENCAO_PADRAO, agoraMs = Date.now() } = {}) {
  if (!vod || vod.aoVivo || !Number.isFinite(vod.inicioApi)) return null;
  const expiraMs = vod.inicioApi + retencaoDias * DIA_MS;
  return { expiraMs, dias: Math.ceil((expiraMs - agoraMs) / DIA_MS), retencaoDias };
}

/**
 * A ordem de guardar: o que some primeiro vai primeiro. O que não tem prazo conhecido vai no fim, e o
 * empate fica na ordem em que veio (a da montagem).
 *
 * @template T
 * @param {T[]} itens
 * @param {(item: T) => number|null|undefined} expiraDe
 * @returns {T[]}
 */
export function ordemDeGuardar(itens, expiraDe) {
  return (itens || [])
    .map((item, i) => ({ item, i, e: expiraDe(item) }))
    .sort((a, b) => {
      const ea = Number.isFinite(a.e) ? a.e : Infinity;
      const eb = Number.isFinite(b.e) ? b.e : Infinity;
      return ea - eb || a.i - b.i;
    })
    .map((x) => x.item);
}
