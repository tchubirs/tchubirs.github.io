'use strict';
/**
 * O serviço. Recebe webhook da Kick e responde consulta.
 *
 * É aqui que o produto deixa de ser manual: o streamer conecta o canal UMA
 * vez, e a partir daí a audiência é gravada sozinha, para sempre, sem ele
 * abrir página nenhuma. A consulta vira uma pergunta — pelo site ou pelo
 * bot do Discord — em vez de copiar e colar duas tabelas.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createVerify, createPublicKey } = require('node:crypto');
const { abrir } = require('./banco');
const { normalizar, comparar } = require('../src/nomes');
const { Indice } = require('../src/indice');
const { resolverEntrada, chavesDeIdentidade } = require('../src/steam');
const { verificarDiscord, tratar } = require('./discord');
const { interpretarQuando, relogio } = require('../src/tempo');
const { criarColetor, criarColetorDeAlvos } = require('../src/stream/coletor');
const se = require('../src/stream/streamelements');
const botrix = require('../src/stream/botrix-api');
const bm = require('../src/battlemetrics');

const CHAVE_KICK = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

const BLOCO_MS = 10 * 60 * 1000;
const JANELA_MS = 10 * 60 * 1000;

/**
 * Quanto silêncio ainda conta como "continua ali".
 *
 * No chat, o sinal é a mensagem: quem fala 21h00 e 21h14 estava ali o tempo
 * todo, mas quem some por meia hora virou outra sessão. 15 min é o meio.
 * No servidor, o agente lê a cada ~90s, então 5 min já é ausência de verdade.
 */
const GAP = { live: 15 * 60 * 1000, servidor: 5 * 60 * 1000 };
/** As fontes que observam a SAÍDA. Para as outras, "saiu" é palpite. */
const PRESENCA_FONTE = new Set(['presenca', 'presenca-parcial']);

function verificar(cabecalhos, corpoBruto, chavePem = CHAVE_KICK, agoraMs = Date.now()) {
  const pega = (n) => cabecalhos[n] ?? cabecalhos[n.toLowerCase()];
  const id = pega('Kick-Event-Message-Id');
  const ts = pega('Kick-Event-Message-Timestamp');
  const assin = pega('Kick-Event-Signature');
  if (!id || !ts || !assin) return { ok: false, motivo: 'cabeçalho ausente' };

  const t = Date.parse(ts);
  if (Number.isNaN(t)) return { ok: false, motivo: 'timestamp inválido' };
  if (Math.abs(agoraMs - t) > JANELA_MS) return { ok: false, motivo: 'fora da janela' };

  const v = createVerify('sha256');
  v.update(Buffer.concat([Buffer.from(`${id}.${ts}.`, 'utf8'), corpoBruto]));
  v.end();
  let ok = false;
  try { ok = v.verify(createPublicKey(chavePem), Buffer.from(assin, 'base64')); } catch { ok = false; }
  if (!ok) return { ok: false, motivo: 'assinatura não confere' };

  return { ok: true, id, tipo: pega('Kick-Event-Type'), em: t };
}

function criar({ caminhoBanco = 'detetive.db', chavePem = CHAVE_KICK, agora = Date.now,
                 tokenBM = process.env.BATTLEMETRICS_TOKEN,
                 chaveDiscord = process.env.DISCORD_PUBLIC_KEY,
                 appDiscord = process.env.DISCORD_APP_ID,
                 canalDoServidor, buscar = globalThis.fetch } = {}) {
  const db = abrir(caminhoBanco);

  const jaVisto = db.prepare('SELECT 1 FROM evento_visto WHERE id = ?');
  const marcarVisto = db.prepare('INSERT OR IGNORE INTO evento_visto (id, visto_em) VALUES (?, ?)');
  const pegarPresenca = db.prepare('SELECT * FROM presenca WHERE canal_id = ? AND nome_norm = ?');
  const inserirPresenca = db.prepare(`INSERT INTO presenca
    (canal_id, nome, nome_norm, usuario_id, primeira_em, ultima_em, ultimo_credito, blocos)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
  const atualizarPresenca = db.prepare(
    'UPDATE presenca SET nome = ?, ultima_em = ?, ultimo_credito = ?, blocos = ? WHERE canal_id = ? AND nome_norm = ?');
  const listarPresenca = db.prepare('SELECT * FROM presenca WHERE canal_id = ?');
  const abrirLive = db.prepare('INSERT OR IGNORE INTO live (canal_id, inicio_em) VALUES (?, ?)');
  const fecharLive = db.prepare(
    'UPDATE live SET fim_em = ? WHERE canal_id = ? AND fim_em IS NULL');

  const ultimaEstada = db.prepare(
    'SELECT * FROM estada WHERE canal_id = ? AND onde = ? AND nome_norm = ? ORDER BY fim_em DESC LIMIT 1');
  const abrirEstada = db.prepare(
    'INSERT INTO estada (canal_id, onde, nome_norm, nome, inicio_em, fim_em, amostras, onde_extra, fonte, ref, aberta) VALUES (?,?,?,?,?,?,1,?,?,?,?)');
  const esticarEstada = db.prepare(
    "UPDATE estada SET fim_em = ?, nome = ?, amostras = amostras + 1, ref = COALESCE(?, ref), fonte = CASE WHEN fonte = ? THEN fonte ELSE 'ambos' END WHERE id = ?");

  /**
   * Registra que a pessoa foi VISTA em `onde` no instante `tMs`.
   *
   * Estica o intervalo aberto se ela ainda estava ali; abre um novo se ficou
   * tempo demais sem aparecer. Assim uma noite inteira vira duas ou três
   * linhas, não dez mil.
   */
  function ver(canalId, onde, nome, tMs, extra = null, fonte = onde === 'servidor' ? 'servidor' : 'chat', ref = null) {
    const norm = normalizar(nome);
    if (!norm) return;
    const u = ultimaEstada.get(canalId, onde, norm);
    if (u && tMs >= u.fim_em && tMs - u.fim_em <= GAP[onde]) {
      // COALESCE no ref: uma leitura sem o id não pode APAGAR o id que já
      // se sabia. Perder a identidade da pessoa no meio da sessão é o mesmo
      // que nunca ter tido.
      esticarEstada.run(Math.max(u.fim_em, tMs), nome, ref, fonte, u.id);
      return;
    }
    // Evento fora de ordem dentro de um intervalo já conhecido: não abre
    // sessão nova, senão a linha do tempo ganha buracos que não existiram.
    if (u && tMs >= u.inicio_em && tMs <= u.fim_em) return;
    abrirEstada.run(canalId, onde, norm, nome, tMs, tMs, extra, fonte, ref, 0);
  }

  const fecharEstadaAberta = db.prepare(
    'UPDATE estada SET fim_em = ?, amostras = amostras + 1, aberta = ? WHERE id = ?');

  /**
   * Um intervalo com começo e fim EXATOS, vindo de uma fonte que sabe os
   * dois — o canal de presença da Kick avisa a entrada e a saída no
   * instante em que acontecem.
   *
   * Diferente de `ver()`, que junta pontos soltos e precisa adivinhar onde
   * uma visita termina. Aqui não há o que adivinhar, e arredondar para os
   * blocos da outra fonte jogaria fora justamente a precisão que ele pediu.
   */
  function verIntervalo(canalId, onde, nome, de, ate, fonte = 'presenca', ref = null, aberta = 0) {
    const norm = normalizar(nome);
    if (!norm || !(ate >= de)) return null;
    const u = ultimaEstada.get(canalId, onde, norm);
    // Continuação exata do mesmo intervalo (a saída chegando depois da
    // entrada já gravada): estica em vez de abrir uma linha nova.
    if (u && de <= u.fim_em && ate >= u.fim_em && u.fonte === fonte) {
      fecharEstadaAberta.run(ate, aberta, u.id);
      return u.id;
    }
    abrirEstada.run(canalId, onde, norm, nome, de, ate, null, fonte, ref, aberta);
    return db.prepare('SELECT last_insert_rowid() AS id').get().id;
  }

  /**
   * Recebe os eventos do canal de presença e vira linha do tempo.
   *
   * A entrada sozinha já grava um intervalo de duração zero: se a gravação
   * cair antes da saída, fica registrado que a pessoa esteve ali — melhor
   * que perder a visita inteira por não ter visto o fim.
   */
  const entradasAbertas = new Map();

  function receberPresenca(canalId, eventos) {
    let entrou = 0; let saiu = 0;
    for (const e of eventos || []) {
      if (!e?.nome || !e?.em) continue;
      const chave = `${canalId}|${e.id ?? e.nome}`;
      if (e.tipo === 'entrou' || e.tipo === 'ja-estava') {
        // "já estava" NÃO é entrada: a pessoa pode estar ali há horas, e
        // fingir que chegou agora inventaria um horário.
        // aberta = 1: está DENTRO até a saída chegar.
        const id = verIntervalo(canalId, 'live', e.nome, e.em, e.em,
          e.tipo === 'entrou' ? 'presenca' : 'presenca-parcial', null, 1);
        entradasAbertas.set(chave, { id, de: e.em, nome: e.nome, tipo: e.tipo });
        // Entra na audiência JÁ na entrada, não só na saída. Quem está
        // assistindo agora e nunca escreveu ficava fora da lista cruzada
        // até fechar a live — justamente a pessoa que este produto existe
        // para enxergar. `jaTemEstada`: o intervalo acima já é o registro
        // bom; aqui só a linha da audiência.
        registrarPresenca(canalId, e.nome, e.id ?? null, e.em, 'presenca', true);
        entrou += 1;
      } else if (e.tipo === 'saiu') {
        const a = entradasAbertas.get(chave);
        entradasAbertas.delete(chave);
        // Saída sem entrada conhecida não vira visita: não sei quando
        // começou, e chutar um começo é inventar.
        if (!a) continue;
        // aberta = 0: a saída foi OBSERVADA, não é palpite.
        verIntervalo(canalId, 'live', e.nome, a.de, e.em,
          a.tipo === 'entrou' ? 'presenca' : 'presenca-parcial', null, 0);
        registrarPresenca(canalId, e.nome, null, e.em, 'presenca', true);
        saiu += 1;
      }
    }
    return { entrou, saiu, abertas: entradasAbertas.size };
  }

  const pegarNomeVisto = db.prepare('SELECT * FROM nome_visto WHERE ref = ? AND nome_norm = ?');
  const inserirNomeVisto = db.prepare(
    'INSERT INTO nome_visto (ref, nome, nome_norm, primeira_em, ultima_em, vezes) VALUES (?,?,?,?,?,1)');
  const tocarNomeVisto = db.prepare(
    'UPDATE nome_visto SET ultima_em = ?, vezes = vezes + 1, nome = ? WHERE ref = ? AND nome_norm = ?');
  const listarNomesVistos = db.prepare(
    'SELECT * FROM nome_visto WHERE ref = ? ORDER BY ultima_em DESC');
  const acharPorNome = db.prepare(
    'SELECT * FROM nome_visto WHERE nome_norm = ? ORDER BY ultima_em DESC');

  /**
   * Registra que esta conta usou este nome.
   *
   * Começa vazio e vale pouco hoje; em um ano é o ativo do produto. O
   * concorrente que ele mostrou tem 32 nomes de uma conta porque grava
   * desde sempre — e o que resolvia o caso dele estava entre os 32.
   */
  function verNome(ref, nome, tMs) {
    if (!ref || !nome) return;
    const norm = normalizar(nome);
    if (!norm) return;
    if (pegarNomeVisto.get(ref, norm)) tocarNomeVisto.run(tMs, nome, ref, norm);
    else inserirNomeVisto.run(ref, nome, norm, tMs, tMs);
  }

  /**
   * Puxa os anos de histórico que o BattleMetrics JÁ tem e guarda aqui.
   *
   * Ele cortou a ideia de gravar do zero: "é pra você acessar algum lugar
   * que grava nome no meio de tantos". Está certo — gravar do zero só
   * valeria daqui a um ano. Isto importa o que já existe, uma vez por
   * pessoa, e a gravação própria vira só a continuação daí para frente.
   */
  async function importarNomes(ref, { token = tokenBM, buscar: b = buscar } = {}) {
    if (!ref) return { importados: 0, motivo: 'sem id do BattleMetrics' };
    if (!token) return { importados: 0, motivo: 'sem BATTLEMETRICS_TOKEN' };
    let r;
    try { r = await bm.nomesPorSessao(ref, token, { buscar: b }); }
    catch (e) { return { importados: 0, motivo: e.message }; }

    let n = 0;
    for (const x of r.nomes) {
      const norm = normalizar(x.nome);
      if (!norm) continue;
      const ja = pegarNomeVisto.get(ref, norm);
      if (ja) {
        // Guarda a data MAIS ANTIGA das duas: o valor do histórico está em
        // quanto ele alcança para trás.
        if (x.de && x.de < ja.primeira_em) {
          db.prepare('UPDATE nome_visto SET primeira_em = ? WHERE ref = ? AND nome_norm = ?')
            .run(x.de, ref, norm);
        }
        continue;
      }
      inserirNomeVisto.run(ref, x.nome, norm, x.de || agora(), x.ate || agora());
      n += 1;
    }
    return { importados: n, sessoes: r.sessoes, total: r.nomes.length };
  }

  /** Todos os nomes que essa conta já usou, do mais recente para trás. */
  function nomesDe(ref) {
    return listarNomesVistos.all(ref).map((n) => ({
      nome: n.nome, de: n.primeira_em, ate: n.ultima_em, vezes: n.vezes,
    }));
  }

  /** O caminho inverso: quem já se chamou assim? */
  function quemUsou(nome) {
    const norm = normalizar(nome);
    if (!norm) return [];
    return acharPorNome.all(norm).map((n) => ({
      ref: n.ref, nome: n.nome, de: n.primeira_em, ate: n.ultima_em,
      perfil: `https://www.battlemetrics.com/players/${n.ref}`,
    }));
  }

  const pegarCanal = db.prepare('SELECT * FROM canal WHERE id = ?');
  const canaisComSE = db.prepare("SELECT * FROM canal WHERE se_canal IS NOT NULL AND se_canal != ''");
  const listarFontes = db.prepare("SELECT * FROM fonte WHERE servico = 'botrix'");
  const guardarFonte = db.prepare(
    'INSERT OR IGNORE INTO fonte (canal_id, servico, plataforma, usuario, criado_em) VALUES (?,?,?,?,?)');

  // ── Presença de quem assiste CALADO ────────────────────────────────────
  // O webhook da Kick só entrega mensagem, e a API pública dela não tem
  // lista de conectados. O ponto de fidelidade sobe por tempo assistido,
  // para quem está lá — falando ou não. Quem subiu, estava.
  const coletores = new Map();

  function ligarColeta({ intervaloMs = 5 * 60 * 1000, placarDe } = {}) {
    for (const c of canaisComSE.all()) {
      if (coletores.has(c.id)) continue;
      const ler = placarDe
        ? () => placarDe(c)
        : () => se.audiencia(c.se_canal, { buscar, limite: 2000 });
      const col = criarColetor({
        placar: ler,
        aoVer: (nome, t) => registrarPresenca(c.id, nome, null, t, 'tempo'),
        agora,
        aoErro: (e) => console.error(`[coleta ${c.id}]`, e.message),
      });
      coletores.set(c.id, col);
      col.ligar(intervaloMs);
    }
    return coletores;
  }

  /**
   * Coleta fina, só em quem interessa.
   *
   * Os alvos são quem está no servidor AGORA e casou com alguém da
   * audiência — meia dúzia de nomes, não a lista inteira. Para esses vale
   * perguntar de 2 em 2 minutos, e é isso que dá a hora de entrada e de
   * saída com precisão, mesmo de quem assiste calado.
   */
  function ligarAlvos({ intervaloMs = 2 * 60 * 1000, medirDe } = {}) {
    for (const c of canaisComSE.all()) {
      const chave = `alvos:${c.id}`;
      if (coletores.has(chave)) continue;
      const col = criarColetorDeAlvos({
        alvos: () => new Set(cruzarAgora(c.id).map((a) => a.espectador)),
        medir: medirDe
          ? (nome) => medirDe(c, nome)
          : (nome) => se.pessoa(c.se_canal, nome, buscar),
        aoVer: (nome, t) => registrarPresenca(c.id, nome, null, t, 'tempo'),
        agora,
        aoErro: (e) => console.error(`[alvos ${c.id}]`, e.message),
      });
      coletores.set(chave, col);
      col.ligar(intervaloMs);
    }
    return coletores;
  }

  // Fidelidade que chega de fora (o agente lendo o BotRix pela sessão dele).
  // O agente não guarda estado de propósito: manda a lista inteira e quem
  // compara é aqui, para uma reinicialização no meio da live não perder nada.
  const anteriorFidelidade = new Map();

  /**
   * Recebe a tabela de fidelidade e credita presença a quem SUBIU.
   *
   * É a única fonte que enxerga quem assiste sem escrever — e sniper não
   * escreve. A primeira leitura nunca credita: sem um "antes" não existe
   * diferença, e tratá-la como presença marcaria a audiência inteira de
   * meses atrás como estando na live agora.
   */
  function receberFidelidade(canalId, pessoas, tMs) {
    const antes = anteriorFidelidade.get(canalId);
    const agora_ = new Map();
    for (const p of pessoas || []) {
      if (p && p.nome != null) agora_.set(p.nome, Number(p.minutosAssistidos) || 0);
    }
    anteriorFidelidade.set(canalId, agora_);
    if (!antes) return { base: true, total: agora_.size, vistos: 0 };

    let vistos = 0;
    for (const [nome, min] of agora_) {
      const m0 = antes.get(nome);
      // Quem só aparece agora na tabela pode ser gente nova de verdade, mas
      // pode ser paginação. Na dúvida, não credita.
      if (m0 == null || min <= m0) continue;
      registrarPresenca(canalId, nome, null, tMs, 'tempo');
      vistos += 1;
    }
    return { base: false, total: agora_.size, vistos };
  }

  /**
   * Coleta pela rota pública da BotRix — sem login, sem navegador.
   *
   * Vem capada em 20 pessoas (medido: limit, count, size, page, offset e
   * top todos devolvem 20), então é o piso e não o teto: pega o topo da
   * fidelidade hoje, e o agente logado traz a lista inteira quando roda.
   */
  function ligarBotrixPublico({ intervaloMs = 5 * 60 * 1000, placarDe } = {}) {
    for (const f of listarFontes.all()) {
      const chave = `botrix:${f.canal_id}:${f.plataforma}:${f.usuario}`;
      if (coletores.has(chave)) continue;
      const col = criarColetor({
        placar: placarDe
          ? () => placarDe(f)
          : () => botrix.placarPublico(f.usuario, f.plataforma, buscar),
        // Todas as fontes caem na MESMA audiência: a pergunta é "essa
        // pessoa estava me assistindo", não "em qual site ela estava".
        aoVer: (nome, t) => registrarPresenca(f.canal_id, nome, null, t, 'tempo'),
        agora,
        aoErro: (e) => console.error(`[botrix ${f.plataforma}/${f.usuario}]`, e.message),
      });
      coletores.set(chave, col);
      col.ligar(intervaloMs);
    }
    return coletores;
  }

  function pararColeta() {
    for (const c of coletores.values()) c.desligar();
    coletores.clear();
  }

  const fusoDoCanal = (canalId) => pegarCanal.get(canalId)?.fuso || 'UTC';

  const listarEstadas = db.prepare(
    'SELECT * FROM estada WHERE canal_id = ? AND onde = ? AND nome_norm = ? ORDER BY inicio_em');

  /** Todos os intervalos conhecidos de uma pessoa num lugar. */
  function estadas(canalId, onde, nome) {
    const norm = normalizar(nome);
    if (!norm) return [];
    return listarEstadas.all(canalId, onde, norm).map((e) => ({
      de: e.inicio_em, ate: e.fim_em,
      minutos: Math.max(1, Math.round((e.fim_em - e.inicio_em) / 60000)),
      // Em segundos também: a fonte de presença sabe o instante exato, e
      // arredondar para minuto apagaria a resposta que ele pediu.
      segundos: Math.round((e.fim_em - e.inicio_em) / 1000),
      amostras: e.amostras, servidor: e.onde_extra, fonte: e.fonte || 'chat',
      bmId: e.ref || null,
      perfil: e.ref ? `https://www.battlemetrics.com/players/${e.ref}` : null,
    }));
  }

  /**
   * O tempo assistido MEDIDO, quando existe medida.
   *
   * O contador de blocos da fidelidade cresce de 10 em 10 minutos. Para
   * quem a presença acompanhou, isso é grosseiro a ponto de mentir: uma
   * visita de 4min22s virava "assistiu 0h10" — mais que o dobro, embaixo do
   * nome de uma pessoa real. É exatamente o erro que ele me pegou fazendo,
   * e a medida certa já estava gravada ao lado, em `estada`.
   *
   * Devolve `null` quando não há medida nenhuma; quem chama cai no bloco e
   * DIZ que é bloco. Um número sem a fonte junto é o que produz a leitura
   * errada.
   */
  const somaMedida = db.prepare(`
    SELECT SUM(CASE WHEN aberta = 1 THEN ? - inicio_em ELSE fim_em - inicio_em END) AS ms,
           COUNT(*) AS visitas, MIN(inicio_em) AS de, MAX(fim_em) AS ate
      FROM estada
     WHERE canal_id = ? AND onde = 'live' AND nome_norm = ?
       AND fonte IN ('presenca','presenca-parcial')`);

  function tempoAssistido(canalId, nome, blocos, tMs) {
    const m = somaMedida.get(tMs, canalId, normalizar(nome));
    if (m?.visitas) {
      return {
        minutosAssistidos: Math.round(m.ms / 60000),
        segundosAssistidos: Math.round(m.ms / 1000),
        visitas: m.visitas,
        exato: true,
      };
    }
    return {
      minutosAssistidos: Math.round((blocos * BLOCO_MS) / 60000),
      segundosAssistidos: null,
      visitas: null,
      exato: false,
    };
  }

  /**
   * Quando chegou o último evento de presença deste canal.
   *
   * O painel precisa disto para não repetir o aviso laranja de "só aparece
   * quem escreveu no chat" numa live em que a presença está gravando ao
   * segundo — o aviso estaria mentindo, e o aviso errado é pior que aviso
   * nenhum: ensina a desconfiar do que está certo.
   */
  const maxPresenca = db.prepare(`
    SELECT MAX(fim_em) AS em, COUNT(*) AS n FROM estada
     WHERE canal_id = ? AND fonte IN ('presenca','presenca-parcial')`);

  function ultimaPresenca(canalId) {
    const r = maxPresenca.get(canalId);
    if (!r?.n) return null;
    return { em: r.em, visitas: r.n };
  }

  // Fonte que sabe a saída manda; fonte de pontos soltos usa a folga.
  // Misturar as duas mantinha na tela alguém que já tinha ido embora.
  const naJanela = db.prepare(`
    SELECT * FROM estada
     WHERE canal_id = ? AND onde = ?
       AND CASE WHEN fonte IN ('presenca','presenca-parcial')
                THEN aberta = 1
                ELSE fim_em >= ? END
     ORDER BY fim_em DESC`);

  /**
   * Quem está na live AGORA — visto dentro do gap.
   *
   * É a lista da página principal: o que dá para responder antes de alguém
   * perguntar qualquer coisa.
   */
  // Quem esteve na live há pouco, tenha saído ou não.
  //
  // Diferente de `naJanela`: aqui a saída OBSERVADA não elimina a pessoa,
  // só marca quando foi. É o caso que ele descreveu — "sei que ele ficou 5
  // minutos no máximo na minha live" —, o sniper que assiste, FECHA a
  // janela e só então ataca. Exigir que ainda esteja dentro é justamente
  // deixar passar quem se comporta como sniper.
  const naJanelaLarga = db.prepare(`
    SELECT * FROM estada
     WHERE canal_id = ? AND onde = ?
       AND (aberta = 1 OR fim_em >= ?)
     ORDER BY fim_em DESC`);

  function linhaDeEstada(e, tMs) {
    const aberta = e.aberta === 1;
    // Uma visita AINDA ABERTA tem fim_em igual ao início: o fim só chega
    // quando a saída chega. Medir a duração entre os dois dava 1 min para
    // quem está lá há 12 — o tipo de número errado que ele já me pegou
    // mostrando. Enquanto está aberta, o fim é AGORA.
    const ate = aberta ? Math.max(e.fim_em, tMs) : e.fim_em;
    return {
      nome: e.nome,
      bmId: e.ref || null,
      perfil: e.ref ? `https://www.battlemetrics.com/players/${e.ref}` : null,
      servidor: e.onde_extra || null,
      desde: e.inicio_em,
      ultimoSinal: e.fim_em,
      minutos: Math.max(1, Math.round((ate - e.inicio_em) / 60000)),
      segundos: Math.round((ate - e.inicio_em) / 1000),
      sinais: e.amostras,
      fonte: e.fonte || 'chat',
      aberta,
      // Quanto tempo faz que ela não dá sinal. Só quer dizer "silêncio"
      // para as fontes que escutam o chat; a presença não escuta nada,
      // ela vê a janela abrir e fechar.
      calada: Math.round((tMs - e.fim_em) / 60000),
    };
  }

  /** Esteve na live nos últimos `janela` ms — inclusive quem já saiu. */
  function esteveNa(canalId, onde, tMs, janela = GAP[onde]) {
    return naJanelaLarga.all(canalId, onde, tMs - janela)
      .map((e) => linhaDeEstada(e, tMs));
  }

  function agoraNa(canalId, onde, tMs) {
    return naJanela.all(canalId, onde, tMs - GAP[onde])
      .map((e) => linhaDeEstada(e, tMs));
  }

  /**
   * Os dois AO MESMO TEMPO, agora.
   *
   * Não é "já assistiu algum dia": é está na live NESTE MOMENTO e está no
   * servidor NESTE MOMENTO. É a linha que merece destaque na página, porque
   * é a única que se responde sem ninguém perguntar nada.
   *
   * Custa pouco de propósito: cruza só os NOMES DE AGORA, sem histórico.
   * Histórico é uma ida à rede por pessoa — com 1.500 jogadores seriam
   * 3.000 requisições e ~18 min por leitura (medido). Por isso o histórico
   * fica para a consulta de uma pessoa só.
   */
  function nosDois(canalId, tMs, { minimo = 0.7 } = {}) {
    // Quem esteve na live há pouco, e não só quem ainda está: fechar a
    // janela antes de atacar é o comportamento, não a exceção.
    const naLive = esteveNa(canalId, 'live', tMs);
    if (!naLive.length) return [];
    // Entrar e sair várias vezes em poucos minutos é sinal por si só: é
    // alguém CONFERINDO a tela, não assistindo. O índice guarda a estada
    // mais recente de cada pessoa (a lista vem por fim_em DESC), então a
    // contagem tem de vir daqui, senão a linha em destaque diz "3 min" e
    // esconde que foram três idas e vindas em catorze minutos.
    const idasEVindas = new Map();
    for (const e of naLive) {
      idasEVindas.set(e.nome, (idasEVindas.get(e.nome) || 0) + 1);
    }
    const idx = new Indice(naLive);
    const fora = [];
    for (const j of agoraNa(canalId, 'servidor', tMs)) {
      const r = idx.procurar(j.nome, { minimo });
      if (!r) continue;
      fora.push({
        // O nome NO JOGO e o link do perfil: sem isso o painel diz que
        // alguém está no servidor e não dá para saber quem, porque o nome
        // do chat não abre perfil nenhum e nome de Rust se troca em dez
        // segundos.
        jogador: j.nome,
        bmId: j.bmId,
        perfil: j.perfil,
        servidor: j.servidor,
        espectador: r.entrada.nome,
        confianca: r.confianca,
        motivo: r.motivo,
        naLiveDesde: r.entrada.desde,
        naLiveMinutos: r.entrada.minutos,
        naLiveVisitas: idasEVindas.get(r.entrada.nome) || 1,
        // A fonte viaja junto: sem ela o painel não sabe se "12 min" veio
        // do relógio da presença ou de um bloco de 10 min da fidelidade, e
        // acaba dizendo "calado há 12 min" de quem está com a live aberta.
        naLiveFonte: r.entrada.fonte,
        naLiveAberta: r.entrada.aberta,
        // Há quantos minutos fechou a live. `null` = ainda está dentro.
        // Só a presença sabe disto; para as outras fontes fica null porque
        // elas não observam saída nenhuma.
        saiuHa: (!r.entrada.aberta && PRESENCA_FONTE.has(r.entrada.fonte))
          ? Math.round((tMs - r.entrada.ultimoSinal) / 60000) : null,
        caladaHa: r.entrada.calada,
        noServidorDesde: j.desde,
        noServidorMinutos: j.minutos,
      });
    }
    return fora.sort((a, b) => b.confianca - a.confianca);
  }

  /**
   * O log completo de uma pessoa: abriu, fechou, abriu de novo, fechou.
   *
   * Junta as duas linhas do tempo numa ordem só, porque a pergunta real é
   * sobre a relação entre elas — entrou no servidor logo depois de abrir a
   * live? saiu da live no minuto em que a partida acabou?
   */
  function log(canalId, nome, { limite = 200 } = {}) {
    const linhas = [];
    for (const onde of ['live', 'servidor']) {
      for (const e of estadas(canalId, onde, nome)) {
        linhas.push({ onde, ...e });
      }
    }
    linhas.sort((a, b) => a.de - b.de);
    const naLive = linhas.filter((l) => l.onde === 'live');
    const noServidor = linhas.filter((l) => l.onde === 'servidor');
    // Somar SEGUNDOS, não minutos já arredondados. Duas visitas de 4min51s
    // e 4min38s viravam 5 + 5 = "0h10" no resumo, contradizendo as próprias
    // linhas logo abaixo, que mostravam 9min29s. O arredondamento tem que
    // acontecer uma vez, no fim — nunca antes da soma.
    const seg = (l) => l.reduce((t, x) => t + (x.segundos ?? x.minutos * 60), 0);
    const exatas = naLive.filter((l) => l.fonte === 'presenca' || l.fonte === 'presenca-parcial');
    return {
      nome,
      total: linhas.length,
      entradasNaLive: naLive.length,
      vezesNoServidor: noServidor.length,
      // Do mais recente para trás: é o que se quer ver primeiro.
      linhas: linhas.slice(-limite).reverse(),
      segundosNaLive: seg(naLive),
      segundosNoServidor: seg(noServidor),
      minutosNaLive: Math.round(seg(naLive) / 60),
      minutosNoServidor: Math.round(seg(noServidor) / 60),
      // O resumo só pode se dizer exato quando TODAS as visitas são exatas:
      // uma só vinda de bloco já contamina o total.
      exatoNaLive: naLive.length > 0 && exatas.length === naLive.length,
    };
  }

  /**
   * A pergunta do produto: **ela estava ali NAQUELE minuto?**
   *
   * Três respostas possíveis, e a diferença entre elas importa:
   *   sim      — o instante cai dentro de um intervalo observado
   *   provavel — cai perto da borda; ela foi vista pouco antes ou pouco
   *              depois, e ninguém fecha a live para reabrir 4 min depois
   *   nao      — não foi vista por perto. NÃO é prova de ausência: quem
   *              assiste calado não gera mensagem nenhuma
   */
  function momento(canalId, onde, nome, quandoMs) {
    const lista = estadas(canalId, onde, nome);
    if (!lista.length) return { estado: 'sem-registro', estadas: [] };

    const dentro = lista.find((e) => quandoMs >= e.de && quandoMs <= e.ate);
    if (dentro) return { estado: 'sim', estada: dentro, estadas: lista };

    let antes = null; let depois = null;
    for (const e of lista) {
      if (e.ate < quandoMs && (!antes || e.ate > antes.ate)) antes = e;
      if (e.de > quandoMs && (!depois || e.de < depois.de)) depois = e;
    }
    const dAntes = antes ? quandoMs - antes.ate : Infinity;
    const dDepois = depois ? depois.de - quandoMs : Infinity;
    const perto = Math.min(dAntes, dDepois);
    if (perto <= GAP[onde]) {
      return {
        estado: 'provavel', minutosDaBorda: Math.round(perto / 60000),
        antes, depois, estadas: lista,
      };
    }
    return {
      estado: 'nao',
      minutosDaBorda: Number.isFinite(perto) ? Math.round(perto / 60000) : null,
      antes, depois, estadas: lista,
    };
  }

  /**
   * @param {boolean} [jaTemEstada] quem já gravou o intervalo por conta
   *        própria não deve gravar de novo por ponto: a segunda gravação
   *        marca a estada como vinda de DUAS fontes e o log passa a mentir
   *        sobre a origem do sinal.
   */
  function registrarPresenca(canalId, nome, usuarioId, tMs, fonte = 'chat', jaTemEstada = false) {
    if (!nome) return;
    const norm = normalizar(nome);
    if (!norm) return;
    if (!jaTemEstada) ver(canalId, 'live', nome, tMs, null, fonte);
    const p = pegarPresenca.get(canalId, norm);
    if (!p) {
      inserirPresenca.run(canalId, nome, norm, usuarioId ?? null, tMs, tMs, tMs);
      return;
    }
    // Crédito contra o último CRÉDITO, não contra a última mensagem: quem
    // escreve a cada minuto nunca fecharia o intervalo e seria subcontado.
    let blocos = p.blocos;
    let credito = p.ultimo_credito;
    const decorrido = tMs - credito;
    if (decorrido >= BLOCO_MS) {
      const novos = Math.floor(decorrido / BLOCO_MS);
      blocos += novos;
      // Avança por blocos INTEIROS, não para `tMs`. Zerar no instante da
      // mensagem joga fora o resto a cada crédito, e o erro acumula: quem
      // ficou 120 minutos era contado com 110.
      credito += novos * BLOCO_MS;
    }
    atualizarPresenca.run(nome, tMs, credito, blocos, canalId, norm);
  }

  function ingerir(canalId, tipo, dados, tMs) {
    switch (tipo) {
      case 'chat.message':
        registrarPresenca(canalId, dados?.sender?.username, dados?.sender?.user_id, tMs);
        return;
      case 'livestream.status.updated':
        if (dados?.is_live) abrirLive.run(canalId, tMs);
        else fecharLive.run(tMs, canalId);
        return;
      default:
    }
  }

  const limparServidor = db.prepare('DELETE FROM no_servidor WHERE canal_id = ?');
  const inserirNoServidor = db.prepare(
    'INSERT OR REPLACE INTO no_servidor (canal_id,nome,nome_norm,minutos,servidor,visto_em,bm_id) VALUES (?,?,?,?,?,?,?)');
  const listarNoServidor = db.prepare('SELECT * FROM no_servidor WHERE canal_id = ?');

  /**
   * Guarda o retrato do servidor e devolve os alertas já cruzados.
   *
   * Substitui em vez de acumular: quem saiu do servidor não pode continuar
   * aparecendo como se estivesse lá. Alerta sobre alguém que já
   * desconectou é pior que alerta nenhum.
   */
  function guardarServidor(canalId, servidor, jogadores, tMs) {
    const nome = servidor?.nome ?? null;
    // Numa transação só. Sem isto cada linha vira sua própria transação com
    // seu próprio fsync: com 1.500 jogadores são ~3.000 gravações em disco
    // a cada leitura, e o agente lê a cada 90s. Medido: 800ms → 40ms.
    db.exec('BEGIN');
    try {
      limparServidor.run(canalId);
      for (const j of jogadores) {
        const norm = normalizar(j.nome);
        if (!norm) continue;
        inserirNoServidor.run(canalId, j.nome, norm, j.minutosNoServidor ?? null, nome, tMs, j.bmId ?? null);
        ver(canalId, 'servidor', j.nome, tMs, nome, 'servidor', j.bmId ?? null);
        verNome(j.bmId, j.nome, tMs);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    versaoServidor += 1;
    // Não cruza aqui por padrão: quem grava é o agente, que só quer saber
    // que chegou. Cruzar de graça custava 5,6s de CPU a cada 90 segundos.
    return { jogadores: jogadores.length };
  }

  /**
   * Cruza QUEM ESTÁ NO SERVIDOR AGORA contra toda a audiência gravada.
   * É isto que permite avisar sem ninguém perguntar.
   */
  // O cruzamento é caro (medido: 5,6s com 1.500 jogadores × 5.000
  // espectadores) e a resposta só muda quando o retrato do servidor muda.
  // O painel pergunta a cada 15s e o agente grava a cada 90s: sem cache,
  // seriam 4 cruzamentos completos para cada um que teria resultado novo.
  const cacheCruz = new Map();
  let versaoServidor = 0;

  function cruzarAgora(canalId, { minimo = 0.7 } = {}) {
    const c = cacheCruz.get(canalId);
    if (c && c.versao === versaoServidor && c.minimo === minimo) return c.achados;
    const achados = cruzarDeVerdade(canalId, minimo, agora());
    cacheCruz.set(canalId, { versao: versaoServidor, minimo, achados });
    return achados;
  }

  function cruzarDeVerdade(canalId, minimo, tMs) {
    // Por índice, não varrendo. Um servidor cheio tem 1.500 jogadores e a
    // audiência de um canal antigo passa de 5.000 — varrer é 7,5 MILHÕES de
    // comparações por leitura, e o agente lê a cada 90s. Medido antes de
    // existir o índice: mais de dois minutos sem terminar.
    const audiencia = listarPresenca.all(canalId);
    if (!audiencia.length) return [];
    const idx = new Indice(audiencia);
    const achados = [];
    for (const j of listarNoServidor.all(canalId)) {
      const r = idx.procurar(j.nome, { minimo });
      if (!r) continue;
      achados.push({
        espectador: r.entrada.nome,
        confianca: r.confianca,
        motivo: r.motivo,
        ...tempoAssistido(canalId, r.entrada.nome, r.entrada.blocos, tMs),
        jogador: j.nome,
        minutosNoServidor: j.minutos,
        servidor: j.servidor,
        bmId: j.bm_id || null,
        perfil: j.bm_id ? `https://www.battlemetrics.com/players/${j.bm_id}` : null,
      });
    }
    achados.sort((a, b) => b.confianca - a.confianca);
    return achados;
  }

  /**
   * Uma entrada, dois caminhos.
   *
   * Se veio SteamID ou link, busca TODOS os nomes que a conta já usou e
   * cruza cada um. Se veio um nome solto, cruza direto — é o caso de quem
   * acabou de morrer e só tem o nome que apareceu na tela.
   */
  async function procurar(canalId, entrada, { minimo = 0.7, quando = null, buscar } = {}) {
    const steamId = await resolverEntrada(entrada, buscar).catch(() => null);
    if (!steamId) return { ...consultar(canalId, entrada, { minimo, quando }), tipo: 'nome' };

    const hist = await chavesDeIdentidade(steamId, buscar);
    // Perfil privado NÃO é perfil limpo: não se olhou nada, e dizer
    // "não encontrado" aqui soaria como inocência.
    if (hist.perfil?.privado) {
      return {
        tipo: 'steamid', steamId, jogador: steamId, historico: [],
        conclusao: 'inconclusivo',
        motivo: 'perfil PRIVADO — não dá para ver nome nem histórico. Isso não é sinal de nada, nem a favor nem contra',
        evidencias: [],
      };
    }
    // URL personalizada só de dígitos ou lixo aleatório não é apelido de
    // ninguém, e cruzá-la só produziria falso positivo.
    const util = (c) => c && !/^[0-9]{6,}$/.test(c) && !/^[0-9a-z]{12,}$/i.test(c);
    const nomes = (hist.chaves || []).filter(util);

    const vistos = new Map();
    let noServidor = null;
    for (const n of nomes) {
      const r = consultar(canalId, n, { minimo, quando });
      if (quando != null && (!noServidor || noServidor.estado === 'sem-registro')) noServidor = r.noServidor;
      for (const e of r.evidencias) {
        const antes = vistos.get(e.espectador);
        if (!antes || antes.confianca < e.confianca) vistos.set(e.espectador, { ...e, nomeSteamQueBateu: n });
      }
    }
    const evidencias = [...vistos.values()].sort((a, b) => b.confianca - a.confianca);
    return {
      tipo: 'steamid', steamId, quando, noServidor,
      jogador: hist.perfil?.nome || steamId,
      historico: nomes,
      conclusao: evidencias.length ? 'esteve na sua live' : 'não encontrado na sua audiência',
      evidencias,
    };
  }

  /** Cruza um nome de jogador contra tudo que já foi gravado do canal. */
  function consultar(canalId, nomeJogador, { minimo = 0.7, quando = null } = {}) {
    const achados = [];
    for (const p of listarPresenca.all(canalId)) {
      const c = comparar(nomeJogador, p.nome);
      if (c.confianca >= minimo) {
        achados.push({
          espectador: p.nome,
          confianca: c.confianca,
          motivo: c.motivo,
          ...tempoAssistido(canalId, p.nome, p.blocos, agora()),
          primeiraVezEm: p.primeira_em,
          ultimaVezEm: p.ultima_em,
          naLive: estadas(canalId, 'live', p.nome),
          // Só faz sentido responder "estava lá?" quando alguém perguntou
          // por um instante. Sem `quando`, isto fica de fora.
          momento: quando != null ? momento(canalId, 'live', p.nome, quando) : null,
        });
      }
    }
    achados.sort((a, b) => b.confianca - a.confianca);
    return {
      jogador: nomeJogador,
      quando,
      // Quem estava no servidor naquele instante — é o outro lado do cruzamento.
      noServidor: quando != null ? momento(canalId, 'servidor', nomeJogador, quando) : null,
      // Nunca "é sniper": mostra presença, não culpa.
      conclusao: achados.length ? 'esteve na sua live' : 'não encontrado na sua audiência',
      evidencias: achados,
    };
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const responder = (codigo, corpo) => {
      res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(corpo));
    };

    if (req.method === 'POST' && url.pathname.startsWith('/webhook/kick/')) {
      const canalId = decodeURIComponent(url.pathname.slice('/webhook/kick/'.length));
      const pedacos = [];
      req.on('data', (c) => pedacos.push(c));
      req.on('end', () => {
        const bruto = Buffer.concat(pedacos);
        const v = verificar(req.headers, bruto, chavePem, agora());
        // Assinatura ruim é 401 e nada é gravado: sem isso, qualquer um que
        // descubra a URL infla a audiência e a ferramenta vira ficção.
        if (!v.ok) return responder(401, { erro: v.motivo });
        if (jaVisto.get(v.id)) return responder(200, { ok: true, repetido: true });
        marcarVisto.run(v.id, agora());
        let dados;
        try { dados = JSON.parse(bruto.toString('utf8')); } catch { return responder(400, { erro: 'json inválido' }); }
        ingerir(canalId, v.tipo, dados, v.em);
        responder(200, { ok: true });
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/servidor') {
      const pedacos = [];
      req.on('data', (c) => pedacos.push(c));
      req.on('end', () => {
        let corpo;
        try { corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8')); }
        catch { return responder(400, { erro: 'json inválido' }); }
        if (!corpo?.canal || !Array.isArray(corpo.jogadores)) {
          return responder(400, { erro: 'informe canal e jogadores' });
        }
        const g = guardarServidor(corpo.canal, corpo.servidor, corpo.jogadores, agora());
        responder(200, { ok: true, ...g });
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/discord') {
      const pedacos = [];
      req.on('data', (c) => pedacos.push(c));
      req.on('end', async () => {
        const bruto = Buffer.concat(pedacos);
        // O Discord TESTA com assinatura inválida ao cadastrar o bot;
        // responder 401 aqui é obrigatório para o cadastro passar.
        if (!verificarDiscord(req.headers, bruto, chaveDiscord)) {
          res.writeHead(401); return res.end('assinatura inválida');
        }
        let corpo;
        try { corpo = JSON.parse(bruto.toString('utf8')); } catch { return responder(400, { erro: 'json inválido' }); }

        const mapear = canalDoServidor
          || ((g) => db.prepare('SELECT id FROM canal WHERE discord_guild = ?').get(g)?.id ?? null);
        let r;
        try { r = tratar(corpo, { canalDoServidor: mapear }); }
        catch { return responder(500, { erro: 'falha ao tratar interação' }); }

        responder(200, r.resposta);
        // Edita a mensagem depois de responder: o prazo de 3s do Discord já
        // foi cumprido, e a consulta à Steam pode levar o tempo que levar.
        if (r.seguir) {
          const dados = await r.seguir(async (c, q, quandoTexto) => {
            const fuso = fusoDoCanal(c);
            const quando = interpretarQuando(quandoTexto, agora(), fuso);
            if (quando === undefined) {
              throw new Error('não entendi o horário — use 22:47, "10 min atrás" ou "agora"');
            }
            return { resultado: await procurar(c, q, { quando, buscar }), fuso };
          });
          await buscar(`https://discord.com/api/v10/webhooks/${appDiscord}/${corpo.token}/messages/@original`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) })
            .catch((e) => console.error('[discord] não consegui editar a resposta:', e.message));
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/consultar') {
      const canalId = url.searchParams.get('canal');
      const nome = url.searchParams.get('nome');
      if (!canalId || !nome) return responder(400, { erro: 'informe canal e nome' });
      return responder(200, consultar(canalId, nome));
    }

    // Uma caixa de busca só, porque é uma pergunta só. O que o streamer tem
    // na mão varia — às vezes o nome de quem matou, às vezes o link do
    // perfil — e obrigar a escolher a aba certa antes de perguntar é o tipo
    // de atrito que faz a ferramenta não ser aberta no momento da suspeita.
    if (req.method === 'GET' && url.pathname === '/api/procurar') {
      const canalId = url.searchParams.get('canal');
      const q = (url.searchParams.get('q') || '').trim();
      if (!canalId || !q) return responder(400, { erro: 'informe canal e q' });
      const fuso = fusoDoCanal(canalId);
      const quando = interpretarQuando(url.searchParams.get('quando'), agora(), fuso);
      if (quando === undefined) {
        return responder(400, { erro: 'não entendi o horário — use 22:47, "10 min atrás" ou "agora"' });
      }
      procurar(canalId, q, { quando }).then((r) => responder(200, { ...r, fuso }),
        (e) => responder(502, { erro: String(e.message || e) }));
      return;
    }

    // A audiência crua, para quem quer cruzar do lado de fora — é assim que
    // o PeekRust entra sem precisar do banco, só de uma URL.
    if (req.method === 'GET' && url.pathname === '/api/agora') {
      const canalId = url.searchParams.get('canal');
      if (!canalId) return responder(400, { erro: 'informe canal' });
      const t = agora();
      const c = pegarCanal.get(canalId);
      return responder(200, {
        em: t, fuso: c?.fuso || 'UTC',
        naLive: agoraNa(canalId, 'live', t),
        noServidor: agoraNa(canalId, 'servidor', t),
        nosDois: nosDois(canalId, t),
        // Cobertura, dita na cara. Ele apontou o que derruba o produto se
        // ficar implícito: "nenhum stream sniper fala no chat". O chat vê
        // só quem escreve, e o sniper é justamente quem não escreve.
        //
        // `presenca` é MEDIDA, não configurada: é o instante do último
        // evento que realmente chegou. Uma flag de "liguei o gravador" iria
        // mentir na hora em que ele mais importa — quando o gravador caiu
        // no meio da live e ninguém percebeu.
        coleta: {
          ligada: coletores.get(canalId)?.ligado === true
            || coletores.get(`alvos:${canalId}`)?.ligado === true,
          fonte: c?.se_canal || null,
          presenca: ultimaPresenca(canalId),
        },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/log') {
      const canalId = url.searchParams.get('canal');
      const nome = url.searchParams.get('nome');
      if (!canalId || !nome) return responder(400, { erro: 'informe canal e nome' });
      return responder(200, { ...log(canalId, nome), fuso: fusoDoCanal(canalId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/presenca') {
      const pedacos = [];
      req.on('data', (c) => pedacos.push(c));
      req.on('end', () => {
        let corpo;
        try { corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8')); }
        catch { return responder(400, { erro: 'json inválido' }); }
        if (!corpo?.canal || !Array.isArray(corpo.eventos)) {
          return responder(400, { erro: 'informe canal e eventos' });
        }
        responder(200, receberPresenca(corpo.canal, corpo.eventos));
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/fidelidade') {
      const pedacos = [];
      req.on('data', (c) => pedacos.push(c));
      req.on('end', () => {
        let corpo;
        try { corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8')); }
        catch { return responder(400, { erro: 'json inválido' }); }
        if (!corpo?.canal || !Array.isArray(corpo.pessoas)) {
          return responder(400, { erro: 'informe canal e pessoas' });
        }
        responder(200, receberFidelidade(corpo.canal, corpo.pessoas, agora()));
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/audiencia') {
      const canalId = url.searchParams.get('canal');
      if (!canalId) return responder(400, { erro: 'informe canal' });
      return responder(200, {
        canal: canalId,
        audiencia: listarPresenca.all(canalId).map((p) => ({
          nome: p.nome,
          ...tempoAssistido(canalId, p.nome, p.blocos, agora()),
          primeiraVezEm: p.primeira_em,
          ultimaVezEm: p.ultima_em,
        })),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/alertas') {
      const canalId = url.searchParams.get('canal');
      if (!canalId) return responder(400, { erro: 'informe canal' });
      const noServidor = listarNoServidor.all(canalId);
      const maisRecente = noServidor.reduce((m, x) => Math.max(m, x.visto_em || 0), 0);
      return responder(200, {
        alertas: cruzarAgora(canalId),
        noServidor: noServidor.length,
        audiencia: listarPresenca.all(canalId).length,
        // Dado velho tem que aparecer como velho no painel: acusar com
        // informação de meia hora atrás é o erro mais fácil de não notar.
        servidorVelho: maisRecente > 0 && agora() - maisRecente > 15 * 60 * 1000,
        servidorVistoEm: maisRecente || null,
      });
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/painel.js')) {
      const arquivo = url.pathname === '/' ? 'painel.html' : 'painel.js';
      const tipo = arquivo.endsWith('.html') ? 'text/html' : 'application/javascript';
      try {
        const corpo = fs.readFileSync(path.join(__dirname, 'web', arquivo));
        res.writeHead(200, { 'Content-Type': `${tipo}; charset=utf-8` });
        return res.end(corpo);
      } catch { return responder(404, { erro: 'painel não encontrado' }); }
    }

    if (req.method === 'GET' && url.pathname === '/saude') {
      return responder(200, { ok: true });
    }
    responder(404, { erro: 'não encontrado' });
  });

  return { servidor, db, ingerir, consultar, procurar, registrarPresenca, verificar,
           guardarServidor, cruzarAgora, ver, estadas, momento, agoraNa, nosDois, log, fusoDoCanal,
           ligarColeta, ligarAlvos, ligarBotrixPublico, pararColeta, coletores, receberFidelidade,
           listarFontes, guardarFonte, verNome, nomesDe, quemUsou, importarNomes,
           verIntervalo, receberPresenca };
}

module.exports = { criar, verificar, CHAVE_KICK, BLOCO_MS };
