/**
 * Um ZIP, feito no browser, sem biblioteca nenhuma.
 *
 * A montagem de uma noite sao trinta e seis ficheiros, e a pagina pedia-lhe
 * trinta e seis cliques para os guardar. Um clique e trinta e seis cliques
 * fazem a mesma coisa — so que uma delas e trabalho dele.
 *
 * Guardado sem comprimir, de proposito. O video ja esta comprimido: passar
 * meio giga por um deflate no browser custava minutos de CPU para poupar um
 * por cento, e nao ha um deflate nativo que aceite pedacos sem os juntar todos
 * em memoria primeiro.
 *
 * E o ficheiro nunca chega a existir inteiro na memoria: o `Blob` final e uma
 * lista de pedacos, e o browser guarda-os em disco. Um ZIP de meio giga feito
 * a base de `ArrayBuffer` era meio giga de RAM presa — que ja foi o bug que
 * lhe travou a pagina uma vez.
 */

// A tabela do CRC-32, construida uma vez. O polinomio e o do ZIP, do PNG e do
// gzip: todos usam o mesmo.
const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/**
 * O CRC-32, aos bocados.
 *
 * Aos bocados porque os clipes chegam em segmentos, e nunca se quer o ficheiro
 * inteiro em memoria so para lhe tirar uma soma de controlo.
 *
 * @param {Uint8Array} bytes
 * @param {number} anterior o valor devolvido pela chamada anterior, ou 0
 */
export function crc32(bytes, anterior = 0) {
  let c = (anterior ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = (TABELA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Junta o CRC de varios bocados sem os ter de reler. */
export function crc32Total(pedacos) {
  let c = 0;
  for (const p of pedacos) c = crc32(p, c);
  return c;
}

// O ZIP guarda a data no formato do MS-DOS de 1980: dois inteiros de 16 bits.
// A alternativa — deixar tudo a zero — poe os ficheiros com data invalida em
// alguns programas.
const dataDos = (d) => ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
const horaDos = (d) => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);

const escrever = (campos) => {
  const n = campos.reduce((s, [t]) => s + t, 0);
  const b = new Uint8Array(n);
  const v = new DataView(b.buffer);
  let o = 0;
  for (const [tamanho, valor] of campos) {
    if (tamanho === 2) v.setUint16(o, valor, true);
    else if (tamanho === 4) v.setUint32(o, valor >>> 0, true);
    else b.set(valor, o);
    o += tamanho;
  }
  return b;
};

// Acima disto o formato precisa das extensoes ZIP64, que sao outro ficheiro
// inteiro de codigo. Recusar e dizer porque e melhor do que devolver um ZIP
// partido que so da erro na maquina dele, uma hora depois.
export const LIMITE = 0xFFFFFFFF;

/**
 * @param {{nome: string, blob: Blob, crc: number, tamanho: number}[]} ficheiros
 * @param {Date} quando a data que fica dentro do ZIP
 * @returns {Blob}
 */
export function criarZip(ficheiros, quando = new Date()) {
  if (!ficheiros.length) throw new Error('ZIP-VAZIO');
  const total = ficheiros.reduce((s, f) => s + f.tamanho, 0);
  if (total > LIMITE) throw new Error('ZIP-GRANDE-DEMAIS');
  if (ficheiros.length > 0xFFFF) throw new Error('ZIP-FICHEIROS-DEMAIS');

  const data = dataDos(quando);
  const hora = horaDos(quando);
  const nomes = new Set();
  const partes = [];
  const central = [];
  let deslocamento = 0;

  for (const f of ficheiros) {
    // Dois clipes com o mesmo nome dentro de um ZIP: alguns programas extraem
    // um por cima do outro, e ele perde metade da montagem sem dar por nada.
    let nome = f.nome;
    for (let i = 2; nomes.has(nome); i++) nome = f.nome.replace(/(\.[^.]+)?$/, `-${i}$1`);
    nomes.add(nome);
    const bn = new TextEncoder().encode(nome);

    // O bit 11 diz "o nome esta em UTF-8". Sem ele, um nome com acento sai
    // partido em Windows.
    const cabecalho = escrever([
      [4, 0x04034B50], [2, 20], [2, 0x0800], [2, 0], [2, hora], [2, data],
      [4, f.crc], [4, f.tamanho], [4, f.tamanho], [2, bn.length], [2, 0], [bn.length, bn],
    ]);
    partes.push(cabecalho, f.blob);

    central.push(escrever([
      [4, 0x02014B50], [2, 20], [2, 20], [2, 0x0800], [2, 0], [2, hora], [2, data],
      [4, f.crc], [4, f.tamanho], [4, f.tamanho], [2, bn.length], [2, 0], [2, 0],
      [2, 0], [2, 0], [4, 0], [4, deslocamento], [bn.length, bn],
    ]));
    deslocamento += cabecalho.length + f.tamanho;
  }

  const tamanhoCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = escrever([
    [4, 0x06054B50], [2, 0], [2, 0], [2, ficheiros.length], [2, ficheiros.length],
    [4, tamanhoCentral], [4, deslocamento], [2, 0],
  ]);
  return new Blob([...partes, ...central, fim], { type: 'application/zip' });
}
