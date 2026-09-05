'use strict';
/**
 * Quanto vale um nome como prova.
 *
 * O cruzamento tinha um buraco que eu não tinha visto: ele trata todo
 * casamento exato como 100%. Só que "bater 100%" em `Joao` e bater 100% em
 * `Tchubita` são coisas opostas — medido na base do steamid.uk, com o plano
 * que ele pagou, em 28/08/2026:
 *
 *     Tchubita             2 contas no mundo
 *     sh4d0wg0d            8
 *     0Suicide           211
 *     Rmotta             739
 *     Joao           315.566
 *     123          6.862.574
 *
 * Um `Joao` no servidor e um `Joao` na live não são notícia nenhuma: há
 * trezentas mil contas com esse nome. Uma `Tchubita` nos dois lados é
 * praticamente a mesma pessoa. Sem este peso, o painel pinta as duas de
 * vermelho igual — e vermelho em cima de coincidência é acusação.
 *
 * A fonte é `namehistory_count.php`, que a API entrega ao plano Silver.
 * Ela nunca devolve os NOMES (isso só na página), mas devolve quantas
 * contas já usaram um texto — que é exatamente o que falta aqui.
 *
 * ⚠️ Zero NÃO quer dizer "único". Quer dizer "esse texto nunca foi nome de
 * Steam" — foi o que deu em `gabriel_uy_mvd` e `hai_suzy`, que são apelidos
 * da Kick. Um nome que não existe na Steam não pode servir de casamento do
 * lado da Steam, e tratá-lo como raríssimo inverteria o sinal.
 */

const URL_BUSCA = 'https://steamidapi.uk/v2/namehistory_count.php';

/** Teto diário do plano. Vale saber para não gastar à toa. */
const LIMITE_DIARIO = 150;

/**
 * De "quantas contas usaram" para "quanto isso pesa".
 *
 * Os cortes vêm da medição acima, não de gosto: 2 contas é identidade, 739
 * é ruído. O peso multiplica a confiança do casamento.
 */
function pesoPorContagem(contas) {
  if (contas == null) return { peso: 1, classe: 'desconhecida', nota: 'não consultado' };
  if (contas === 0) {
    return {
      peso: 1,
      classe: 'fora-da-steam',
      // Nem sobe nem desce: é um nome que não existe do lado da Steam, então
      // a contagem não diz nada sobre este casamento.
      nota: 'nunca foi nome de Steam — a contagem não opina',
    };
  }
  if (contas <= 2) return { peso: 1, classe: 'unico', nota: `só ${contas} conta(s) no mundo usaram este nome` };
  if (contas <= 20) return { peso: 0.95, classe: 'raro', nota: `${contas} contas já usaram este nome` };
  if (contas <= 500) return { peso: 0.75, classe: 'comum', nota: `${contas} contas já usaram este nome` };
  if (contas <= 50000) return { peso: 0.5, classe: 'muito-comum', nota: `${contas.toLocaleString('pt-BR')} contas já usaram este nome` };
  return { peso: 0.3, classe: 'lixo', nota: `${contas.toLocaleString('pt-BR')} contas já usaram este nome — não serve de prova` };
}

/**
 * Quantas contas já usaram este nome.
 *
 * @param {string} nome
 * @param {{chave:string, meuId:string, buscar?:Function}} op
 * @returns {Promise<number|null>} null quando a busca falhou — e null é
 *          resposta, não zero: confundir os dois faria "não perguntei"
 *          virar "não existe".
 */
async function contarContas(nome, { chave, meuId, buscar = globalThis.fetch } = {}) {
  if (!nome || !chave || !meuId) return null;
  const url = `${URL_BUSCA}?myid=${encodeURIComponent(meuId)}&apikey=${encodeURIComponent(chave)}`;
  const r = await buscar(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `input=${encodeURIComponent(nome)}`,
  });
  // NÃO olho o código de estado. Medido: esta rota responde **HTTP 500 com
  // o corpo certo** — `{"auth":{...},"result":{"count":"2"}}`. Descartar
  // pelo status jogava fora a resposta boa, e o painel via "desconhecida"
  // em todo nome. Quem manda é o corpo.
  const j = await r.json().catch(() => null);
  // Erro 17 é timeout da busca deles — acontece com nome comprido. Devolver
  // null aqui deixa o cruzamento seguir sem peso, em vez de derrubar tudo.
  if (!j || j.error) return null;
  const n = Number(j?.result?.count);
  return Number.isFinite(n) ? n : null;
}

/**
 * O peso de um nome, com cache.
 *
 * O plano dá 150 buscas por dia. Um servidor cheio tem 1.500 jogadores —
 * perguntar por todos queimaria a cota dez vezes antes do meio-dia. Por isso
 * o cache é obrigatório, e por isso quem chama decide quando vale gastar:
 * um casamento já suspeito merece a consulta, uma varredura não.
 */
function criarMedidor({ chave, meuId, buscar, cache = new Map() } = {}) {
  let gastos = 0;
  return {
    get gastos() { return gastos; },
    get restam() { return Math.max(0, LIMITE_DIARIO - gastos); },
    async pesar(nome) {
      const k = String(nome || '').toLowerCase();
      if (!k) return pesoPorContagem(null);
      if (cache.has(k)) return cache.get(k);
      if (gastos >= LIMITE_DIARIO) return pesoPorContagem(null);
      gastos += 1;
      const contas = await contarContas(nome, { chave, meuId, buscar });
      const r = { ...pesoPorContagem(contas), contas };
      cache.set(k, r);
      return r;
    },
  };
}

module.exports = { contarContas, pesoPorContagem, criarMedidor, LIMITE_DIARIO, URL_BUSCA };
