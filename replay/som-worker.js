// Descodificar o AAC fora do fio da página.
//
// Medido no teste real de 12/10: com 33 ângulos abertos, o `AudioDecoder` da página levava 9 a 10 s a
// descodificar 10 s de som (partilha o fio de média com os leitores de vídeo), e o "Sincronizar por
// áudio" levava 30 min. O mesmo pedaço, descodificado aqui num Worker com os vídeos a tocar: 0,18 s.

import { descodificarAac } from './alinhar.js?v=3195cb16bc';

onmessage = async ({ data: { id, aac, taxaAlvo } }) => {
  try {
    const mono = await descodificarAac(aac, { taxaAlvo, noFio: true });
    postMessage({ id, mono }, [mono.buffer]);
  } catch (e) {
    postMessage({ id, erro: e?.message || String(e), nome: e?.name || 'Error' });
  }
};
