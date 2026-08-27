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

function criar({ caminhoBanco = 'detetive.db', chavePem = CHAVE_KICK, agora = Date.now } = {}) {
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

  function registrarPresenca(canalId, nome, usuarioId, tMs) {
    if (!nome) return;
    const norm = normalizar(nome);
    if (!norm) return;
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

  /** Cruza um nome de jogador contra tudo que já foi gravado do canal. */
  function consultar(canalId, nomeJogador, { minimo = 0.7 } = {}) {
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
        });
      }
    }
    achados.sort((a, b) => b.confianca - a.confianca);
    return {
      jogador: nomeJogador,
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

    if (req.method === 'GET' && url.pathname === '/api/consultar') {
      const canalId = url.searchParams.get('canal');
      const nome = url.searchParams.get('nome');
      if (!canalId || !nome) return responder(400, { erro: 'informe canal e nome' });
      return responder(200, consultar(canalId, nome));
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

  return { servidor, db, ingerir, consultar, registrarPresenca, verificar,
           guardarServidor, cruzarAgora };
}

module.exports = { criar, verificar, CHAVE_KICK, BLOCO_MS };
