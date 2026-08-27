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
const { resolverEntrada, chavesDeIdentidade } = require('../src/steam');
const { verificarDiscord, tratar } = require('./discord');
const { interpretarQuando, relogio } = require('../src/tempo');
const { criarColetor, criarColetorDeAlvos } = require('../src/stream/coletor');
const se = require('../src/stream/streamelements');

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
    'INSERT INTO estada (canal_id, onde, nome_norm, nome, inicio_em, fim_em, amostras, onde_extra, fonte) VALUES (?,?,?,?,?,?,1,?,?)');
  const esticarEstada = db.prepare(
    "UPDATE estada SET fim_em = ?, nome = ?, amostras = amostras + 1, fonte = CASE WHEN fonte = ? THEN fonte ELSE 'ambos' END WHERE id = ?");

  /**
   * Registra que a pessoa foi VISTA em `onde` no instante `tMs`.
   *
   * Estica o intervalo aberto se ela ainda estava ali; abre um novo se ficou
   * tempo demais sem aparecer. Assim uma noite inteira vira duas ou três
   * linhas, não dez mil.
   */
  function ver(canalId, onde, nome, tMs, extra = null, fonte = onde === 'servidor' ? 'servidor' : 'chat') {
    const norm = normalizar(nome);
    if (!norm) return;
    const u = ultimaEstada.get(canalId, onde, norm);
    if (u && tMs >= u.fim_em && tMs - u.fim_em <= GAP[onde]) {
      esticarEstada.run(Math.max(u.fim_em, tMs), nome, fonte, u.id);
      return;
    }
    // Evento fora de ordem dentro de um intervalo já conhecido: não abre
    // sessão nova, senão a linha do tempo ganha buracos que não existiram.
    if (u && tMs >= u.inicio_em && tMs <= u.fim_em) return;
    abrirEstada.run(canalId, onde, norm, nome, tMs, tMs, extra, fonte);
  }

  const pegarCanal = db.prepare('SELECT * FROM canal WHERE id = ?');
  const canaisComSE = db.prepare("SELECT * FROM canal WHERE se_canal IS NOT NULL AND se_canal != ''");

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
        aoVer: (nome, t) => { ver(c.id, 'live', nome, t, null, 'tempo'); registrarPresenca(c.id, nome, null, t); },
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
        aoVer: (nome, t) => { ver(c.id, 'live', nome, t, null, 'tempo'); registrarPresenca(c.id, nome, null, t); },
        agora,
        aoErro: (e) => console.error(`[alvos ${c.id}]`, e.message),
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
      amostras: e.amostras, servidor: e.onde_extra, fonte: e.fonte || 'chat',
    }));
  }

  const naJanela = db.prepare(
    'SELECT * FROM estada WHERE canal_id = ? AND onde = ? AND fim_em >= ? ORDER BY fim_em DESC');

  /**
   * Quem está na live AGORA — visto dentro do gap.
   *
   * É a lista da página principal: o que dá para responder antes de alguém
   * perguntar qualquer coisa.
   */
  function agoraNa(canalId, onde, tMs) {
    return naJanela.all(canalId, onde, tMs - GAP[onde]).map((e) => ({
      nome: e.nome,
      desde: e.inicio_em,
      ultimoSinal: e.fim_em,
      minutos: Math.max(1, Math.round((e.fim_em - e.inicio_em) / 60000)),
      sinais: e.amostras,
      // Quanto tempo faz que ela não dá sinal. Alguém 12 min calado ainda
      // conta como presente, mas quem olha precisa ver a diferença.
      calada: Math.round((tMs - e.fim_em) / 60000),
    }));
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
    return {
      nome,
      total: linhas.length,
      // Do mais recente para trás: é o que se quer ver primeiro.
      linhas: linhas.slice(-limite).reverse(),
      minutosNaLive: linhas.filter((l) => l.onde === 'live').reduce((t, l) => t + l.minutos, 0),
      minutosNoServidor: linhas.filter((l) => l.onde === 'servidor').reduce((t, l) => t + l.minutos, 0),
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

  function registrarPresenca(canalId, nome, usuarioId, tMs) {
    if (!nome) return;
    const norm = normalizar(nome);
    if (!norm) return;
    ver(canalId, 'live', nome, tMs);
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
    'INSERT OR REPLACE INTO no_servidor VALUES (?,?,?,?,?,?)');
  const listarNoServidor = db.prepare('SELECT * FROM no_servidor WHERE canal_id = ?');

  /**
   * Guarda o retrato do servidor e devolve os alertas já cruzados.
   *
   * Substitui em vez de acumular: quem saiu do servidor não pode continuar
   * aparecendo como se estivesse lá. Alerta sobre alguém que já
   * desconectou é pior que alerta nenhum.
   */
  function guardarServidor(canalId, servidor, jogadores, tMs) {
    limparServidor.run(canalId);
    const nome = servidor?.nome ?? null;
    for (const j of jogadores) {
      const norm = normalizar(j.nome);
      if (!norm) continue;
      inserirNoServidor.run(canalId, j.nome, norm, j.minutosNoServidor ?? null, nome, tMs);
      ver(canalId, 'servidor', j.nome, tMs, nome);
    }
    return cruzarAgora(canalId);
  }

  /**
   * Cruza QUEM ESTÁ NO SERVIDOR AGORA contra toda a audiência gravada.
   * É isto que permite avisar sem ninguém perguntar.
   */
  function cruzarAgora(canalId, { minimo = 0.7 } = {}) {
    const audiencia = listarPresenca.all(canalId);
    const achados = [];
    for (const j of listarNoServidor.all(canalId)) {
      let melhor = null;
      for (const e of audiencia) {
        const c = comparar(j.nome, e.nome);
        if (c.confianca >= minimo && (!melhor || c.confianca > melhor.confianca)) {
          melhor = {
            espectador: e.nome,
            confianca: c.confianca,
            motivo: c.motivo,
            minutosAssistidos: Math.round((e.blocos * BLOCO_MS) / 60000),
          };
        }
      }
      if (melhor) achados.push({ ...melhor, jogador: j.nome, minutosNoServidor: j.minutos, servidor: j.servidor });
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
          minutosAssistidos: Math.round((p.blocos * BLOCO_MS) / 60000),
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
        guardarServidor(corpo.canal, corpo.servidor, corpo.jogadores, agora());
        responder(200, { ok: true, jogadores: corpo.jogadores.length });
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
        // Cobertura, dita na cara: sem coleta ligada só existe quem
        // escreve, e o painel não pode deixar isso implícito.
        coleta: {
          ligada: coletores.get(canalId)?.ligado === true,
          fonte: c?.se_canal || null,
        },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/log') {
      const canalId = url.searchParams.get('canal');
      const nome = url.searchParams.get('nome');
      if (!canalId || !nome) return responder(400, { erro: 'informe canal e nome' });
      return responder(200, { ...log(canalId, nome), fuso: fusoDoCanal(canalId) });
    }

    if (req.method === 'GET' && url.pathname === '/api/audiencia') {
      const canalId = url.searchParams.get('canal');
      if (!canalId) return responder(400, { erro: 'informe canal' });
      return responder(200, {
        canal: canalId,
        audiencia: listarPresenca.all(canalId).map((p) => ({
          nome: p.nome,
          minutosAssistidos: Math.round((p.blocos * BLOCO_MS) / 60000),
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
           guardarServidor, cruzarAgora, ver, estadas, momento, agoraNa, log, fusoDoCanal,
           ligarColeta, ligarAlvos, pararColeta, coletores };
}

module.exports = { criar, verificar, CHAVE_KICK, BLOCO_MS };
