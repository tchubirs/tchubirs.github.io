'use strict';
/**
 * O comando puxa-se a si próprio antes de correr.
 *
 * Isto nasceu de uma corrida dele que deu resultado errado sem dar erro
 * nenhum. A saída dizia "steamid.uk" primeiro e "10 nomes" do steamhistory —
 * eram os dois sintomas de código velho, mas nada na tela dizia isso. Ele
 * estava cinco commits atrás, e os cinco eram justamente as correcções que
 * faltavam. Passou tempo a olhar para uma saída errada a pensar que era o
 * programa que estava mal, quando o programa já estava certo no repositório.
 *
 * A regra dele é clara: *"Tudo que te passe e não conseguiu deixar automático
 * ainda não aceito se não for automático."* Mandar-lhe "faz git pull" é
 * empurrar para ele um passo que a máquina faz melhor — e que ele já esqueceu
 * uma vez, com razão, porque não é trabalho dele lembrar-se.
 *
 * O que esta função NÃO faz, de propósito:
 *   - não mexe se houver alterações por gravar (o trabalho dele vem primeiro)
 *   - não faz merge nem rebase: só `--ff-only`. Se divergiu, avisa e pára.
 *   - não estoura se não houver rede, git, ou se isto não for um repositório.
 *     Sem rede o comando tem de continuar a funcionar; a rede é para o site.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');

/** Corre um git e devolve o texto, ou null se falhar por qualquer razão. */
function git(args, { timeout = 20000 } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: RAIZ, timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Vê se há versão nova e, quando é seguro, traz-la.
 *
 * @returns {{estado:string, atras?:number, ramo?:string, detalhe?:string}}
 *   'atualizado'  — já estava em dia (ou não dá para saber, e isso não é erro)
 *   'trouxe'      — puxou N commits; quem chama deve RECOMEÇAR com o código novo
 *   'sujo'        — há versão nova mas o dono tem trabalho por gravar
 *   'divergiu'    — o ramo local seguiu outro caminho; não toco
 *   'sem-git'     — não é repositório, ou não há git, ou não há rede
 */
function verificarAtualizacao() {
  if (process.env.DETETIVE_SEM_ATUALIZAR === '1') return { estado: 'atualizado' };

  const ramo = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!ramo || ramo === 'HEAD') return { estado: 'sem-git' };

  // Sem rede isto falha e devolve null — e falhar aqui não é problema nenhum:
  // significa apenas que hoje não dá para saber, e o comando segue na mesma.
  if (git(['fetch', 'origin', ramo]) === null) return { estado: 'sem-git' };

  const atras = Number(git(['rev-list', '--count', `HEAD..origin/${ramo}`]));
  const afrente = Number(git(['rev-list', '--count', `origin/${ramo}..HEAD`]));
  if (!Number.isFinite(atras) || !Number.isFinite(afrente)) return { estado: 'sem-git' };
  if (atras === 0) return { estado: 'atualizado', ramo };
  if (afrente > 0) return { estado: 'divergiu', atras, ramo };

  // Alterações por gravar: puxar por cima seria mexer no trabalho dele.
  const sujo = git(['status', '--porcelain']);
  if (sujo) return { estado: 'sujo', atras, ramo, detalhe: sujo.split('\n').length + ' ficheiro(s)' };

  if (git(['merge', '--ff-only', `origin/${ramo}`], { timeout: 30000 }) === null) {
    return { estado: 'divergiu', atras, ramo };
  }
  return { estado: 'trouxe', atras, ramo };
}

module.exports = { verificarAtualizacao };
