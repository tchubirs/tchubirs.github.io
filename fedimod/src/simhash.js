/**
 * SimHash de conteúdo — impressão digital que permite comparar duas mensagens
 * sem transmitir nenhuma delas.
 *
 * Por que isto importa para privacidade: servidores podem trocar digests de
 * 64 bits e detectar que a mesma campanha de spam atingiu os dois, sem que
 * nenhum servidor revele o texto do que seus usuários escreveram.
 */

/** FNV-1a 64 bits, em BigInt. Determinístico entre implementações. */
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

export function fnv1a64(str) {
  let h = FNV_OFFSET;
  const bytes = new TextEncoder().encode(str);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

/**
 * Normaliza texto antes do hash. O spammer troca capitalização, pontuação e
 * caracteres unicode parecidos justamente para escapar de comparação exata,
 * então normalizar é o que separa "detecta a campanha" de "detecta nada".
 */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFKD")                       // separa acentos e homoglifos
    .replace(/[̀-ͯ]/g, "")         // remove diacríticos combinantes
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")     // toda URL vira o mesmo token
    .replace(/[@#][\p{L}\p{N}_]+/gu, " handle ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shingles de n palavras — captura ordem, não só vocabulário. */
export function shingles(text, n = 3) {
  const words = normalize(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  if (words.length < n) return [words.join(" ")];
  const out = [];
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * SimHash de 64 bits. Textos parecidos produzem hashes com poucos bits de
 * diferença — ao contrário de um hash criptográfico, onde mudar 1 caractere
 * muda metade dos bits e a comparação deixa de servir.
 */
export function simhash(text, n = 3) {
  const grams = shingles(text, n);
  if (grams.length === 0) return 0n;
  const v = new Array(64).fill(0);
  for (const g of grams) {
    const h = fnv1a64(g);
    for (let i = 0; i < 64; i++) {
      v[i] += (h >> BigInt(i)) & 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let i = 0; i < 64; i++) if (v[i] > 0) out |= 1n << BigInt(i);
  return out;
}

/** Distância de Hamming: quantos bits diferem. 0 = idêntico. */
export function hamming(a, b) {
  let x = a ^ b;
  let count = 0;
  while (x) { x &= x - 1n; count++; }
  return count;
}

/**
 * Dois textos são "a mesma campanha" se diferirem em <= threshold bits.
 * 3 é conservador: pega reescritas leves sem juntar textos genuinamente
 * distintos. Subir isto aumenta falso-positivo, que é o erro mais caro aqui.
 */
export function isNearDuplicate(a, b, threshold = 3) {
  return hamming(a, b) <= threshold;
}

/** Digest hexadecimal estável, para troca entre servidores. */
export function toHex(h) {
  return h.toString(16).padStart(16, "0");
}

export function fromHex(hex) {
  return BigInt("0x" + hex);
}
