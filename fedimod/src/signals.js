/**
 * Sinais comportamentais de spam.
 *
 * Princípio de projeto: NENHUM sinal lê o significado do texto. Todos olham
 * para comportamento e forma. Isso existe por três motivos:
 *
 *   1. Privacidade — não precisamos entender o que a pessoa escreveu.
 *   2. Idioma — funciona igual em português, árabe ou japonês.
 *   3. Apelação — cada sinal é um número que o administrador consegue
 *      conferir e o usuário consegue contestar. Um classificador neural
 *      diz "0,87 spam" e ninguém sabe defender-se disso.
 *
 * Cada sinal devolve um valor em [0,1], onde 1 = mais suspeito.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Curva suave: 0 quando x<=lo, 1 quando x>=hi, linear no meio. */
function ramp(x, lo, hi) {
  if (!Number.isFinite(x)) return 0;
  if (hi === lo) return x >= hi ? 1 : 0;
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
}

/**
 * Conta nova. Quase toda campanha de spam usa contas recém-criadas porque
 * as antigas já foram derrubadas.
 * 0 dias -> 1,0 · 30 dias -> 0,0
 */
export function accountAge({ createdAt, now }) {
  const days = (now - createdAt) / DAY;
  return 1 - ramp(days, 0, 30);
}

/**
 * Rajada de publicação. Humano não posta 40 vezes por hora; script posta.
 * <=2/h -> 0 · >=20/h -> 1
 */
export function burstRate({ postsLastHour }) {
  return ramp(postsLastHour, 2, 20);
}

/**
 * Menções a quem não segue você. É o mecanismo central do spam no fediverso:
 * a mensagem chega na caixa de quem nunca pediu.
 * <=1 -> 0 · >=8 -> 1
 */
export function strangerMentions({ mentions, mentionsToFollowers }) {
  return ramp((mentions ?? 0) - (mentionsToFollowers ?? 0), 1, 8);
}

/**
 * Assimetria seguindo/seguidores. Segue 2.000, é seguido por 3.
 * Conta legítima nova tem números baixos nos dois lados, não um explodido.
 */
export function followAsymmetry({ following, followers }) {
  if ((following ?? 0) < 50) return 0;   // conta pequena não é sinal
  const ratio = (following ?? 0) / Math.max(followers ?? 0, 1);
  return ramp(ratio, 5, 50);
}

/** Densidade de links. Spam quase sempre precisa levar a algum lugar. */
export function linkDensity({ urlCount, wordCount }) {
  if ((urlCount ?? 0) === 0) return 0;
  const perWord = (urlCount ?? 0) / Math.max(wordCount ?? 0, 1);
  return Math.max(ramp(urlCount, 1, 5), ramp(perWord, 0.02, 0.2));
}

/**
 * Perfil vazio: sem avatar, sem bio, sem nome de exibição.
 * Sozinho é fraco — juntos com os outros, é confirmação.
 */
export function profileEmptiness({ hasAvatar, hasBio, hasDisplayName }) {
  const faltando = [!hasAvatar, !hasBio, !hasDisplayName].filter(Boolean).length;
  return faltando / 3;
}

/**
 * Repetição do próprio conteúdo: a mesma mensagem enviada muitas vezes.
 * Recebe a lista de digests recentes do autor.
 */
export function selfRepetition({ recentDigests }) {
  const lista = recentDigests ?? [];
  if (lista.length < 3) return 0;
  const unicos = new Set(lista.map(String)).size;
  return 1 - ramp(unicos / lista.length, 0.3, 0.9);
}

/**
 * Reincidência federada: quantos OUTROS servidores já reportaram este mesmo
 * digest. Este é o sinal que só existe porque a rede coopera — é o coração
 * do projeto e o que nenhuma ferramenta de servidor único consegue ter.
 */
export function federatedReports({ reportingServers }) {
  return ramp(reportingServers ?? 0, 1, 5);
}

/**
 * Pesos. Somam 1,0. Foram escolhidos para que NENHUM sinal sozinho leve ao
 * bloqueio: mesmo `federatedReports` no máximo dá 0,22, abaixo do limiar de
 * quarentena. Isso é deliberado — evita que um servidor malicioso derrube
 * alguém sozinho reportando em massa.
 */
export const WEIGHTS = Object.freeze({
  federatedReports: 0.22,
  strangerMentions: 0.18,
  burstRate: 0.16,
  accountAge: 0.13,
  linkDensity: 0.12,
  selfRepetition: 0.09,
  followAsymmetry: 0.06,
  profileEmptiness: 0.04,
});

export const EXTRACTORS = Object.freeze({
  accountAge,
  burstRate,
  strangerMentions,
  followAsymmetry,
  linkDensity,
  profileEmptiness,
  selfRepetition,
  federatedReports,
});
