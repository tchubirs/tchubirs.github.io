'use strict';
/**
 * Identidade portátil.
 *
 * O problema que isto resolve: no ActivityPub, mover seguidores exige uma
 * atividade `Move` assinada pela chave do servidor de origem. Se esse
 * servidor foi apreendido, bloqueado ou desligado, ninguém pode assinar, e
 * os seguidores — a parte insubstituível de uma conta — são perdidos.
 *
 * A saída é inverter de quem é a chave. Enquanto o servidor ainda está vivo,
 * o usuário gera um par de chaves que fica com ELE e publica o compromisso
 * com a chave pública no próprio perfil. Servidores que seguem essa conta já
 * guardam uma cópia do perfil, incluindo o compromisso. Depois, mesmo com o
 * servidor de origem morto, o usuário assina uma declaração de continuidade
 * a partir da conta nova, e qualquer servidor verifica contra a cópia que já
 * tem em cache. O servidor morto nunca é consultado.
 */

const { generateKeyPairSync, createPublicKey, createHash } = require('node:crypto');

/** Prefixo do compromisso publicado no perfil. Curto de propósito: o campo
 *  de biografia do Mastodon é limitado, e o compromisso precisa caber ao lado
 *  do texto que a pessoa realmente quer escrever. */
const PREFIXO = 'fedi-continuity-v1:';

/**
 * Ed25519, e não RSA, por um motivo prático: a chave pública tem 32 bytes.
 * Em base64url isso dá 43 caracteres, e o compromisso inteiro cabe numa
 * linha de biografia. Com RSA-2048 não caberia em lugar nenhum que o usuário
 * consiga editar sozinho.
 */
function gerarIdentidade() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privada: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publica: publicKey.export({ type: 'spki', format: 'pem' }),
    compromisso: compromissoDe(publicKey),
  };
}

/** O texto que a pessoa cola na biografia enquanto o servidor está vivo.
 *  Aceita tanto um KeyObject já público quanto um PEM — `createPublicKey`
 *  recusa um KeyObject que já é público, então só converte quando precisa. */
function compromissoDe(chavePublica) {
  const chave =
    typeof chavePublica === 'object' && chavePublica.type === 'public'
      ? chavePublica
      : createPublicKey(chavePublica);
  const bruta = chave.export({ type: 'spki', format: 'der' });
  // Os 12 últimos bytes do DER de uma chave Ed25519 em SPKI são o cabeçalho
  // do algoritmo; os 32 finais são a chave em si.
  const semente = bruta.subarray(bruta.length - 32);
  return PREFIXO + semente.toString('base64url');
}

/** Extrai o compromisso de um texto de perfil qualquer, ignorando o resto. */
function extrairCompromisso(textoDoPerfil) {
  if (typeof textoDoPerfil !== 'string') return null;
  const m = textoDoPerfil.match(
    new RegExp(PREFIXO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([A-Za-z0-9_-]{43})'),
  );
  return m ? m[0] : null;
}

/** Reconstrói a chave pública a partir do compromisso publicado. */
function chaveDoCompromisso(compromisso) {
  if (!compromisso || !compromisso.startsWith(PREFIXO)) {
    throw new Error('compromisso inválido: prefixo ausente');
  }
  const semente = Buffer.from(compromisso.slice(PREFIXO.length), 'base64url');
  if (semente.length !== 32) {
    throw new Error(`compromisso inválido: esperava 32 bytes, veio ${semente.length}`);
  }
  // Cabeçalho SPKI fixo de Ed25519 (RFC 8410), seguido da chave.
  const cabecalho = Buffer.from('302a300506032b6570032100', 'hex');
  return createPublicKey({
    key: Buffer.concat([cabecalho, semente]),
    format: 'der',
    type: 'spki',
  });
}

/** Identificador estável e curto, para exibir e para deduplicar. */
function impressaoDigital(compromisso) {
  return createHash('sha256').update(compromisso).digest('hex').slice(0, 16);
}

module.exports = {
  PREFIXO,
  gerarIdentidade,
  compromissoDe,
  extrairCompromisso,
  chaveDoCompromisso,
  impressaoDigital,
};
