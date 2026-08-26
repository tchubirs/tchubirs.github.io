import test from "node:test";
import assert from "node:assert/strict";

import { simhash, hamming, normalize, isNearDuplicate, toHex, fromHex } from "../src/simhash.js";
import { scoreActivity, VERDICTS, THRESHOLDS } from "../src/score.js";
import { SignalStore, MIN_INDEPENDENT_SERVERS, MAX_REPORTS_PER_SERVER_PER_HOUR } from "../src/exchange.js";

const DAY = 24 * 3600_000;
const NOW = 1_800_000_000_000;

// ─────────────────────── impressão digital ───────────────────────

test("spam reescrito continua sendo reconhecido como a mesma campanha", () => {
  const a = simhash("Buy cheap crypto now at http://x.com massive gains guaranteed today");
  const b = simhash("BUY CHEAP CRYPTO NOW at http://outro.net - massive gains guaranteed today!!!");
  assert.ok(isNearDuplicate(a, b), `distancia ${hamming(a, b)} deveria ser <= 3`);
});

test("texto legitimo nao colide com spam", () => {
  const spam = simhash("Buy cheap crypto now at http://x.com massive gains guaranteed today");
  const real = simhash("I went for a walk in the park this morning and saw three herons");
  assert.ok(!isNearDuplicate(spam, real), `distancia ${hamming(spam, real)} deveria ser > 3`);
});

test("normalizacao neutraliza acentos, caixa e homoglifos", () => {
  assert.equal(normalize("CAFÉ  com   Leite!!!"), "cafe com leite");
  assert.equal(normalize("visite https://a.b/c agora"), "visite url agora");
  assert.equal(normalize("oi @fulano #tag"), "oi handle handle");
});

test("digest sobrevive a ida e volta em hexadecimal", () => {
  const h = simhash("qualquer conteudo de teste aqui para o digest");
  assert.equal(fromHex(toHex(h)), h);
  assert.equal(toHex(h).length, 16);
});

test("texto vazio nao quebra", () => {
  assert.equal(simhash(""), 0n);
  assert.deepEqual(normalize(null), "");
});

// ─────────────────────── pontuação ───────────────────────

const CONTA_LIMPA = {
  createdAt: NOW - 400 * DAY, now: NOW,
  postsLastHour: 1, mentions: 1, mentionsToFollowers: 1,
  following: 180, followers: 220,
  hasAvatar: true, hasBio: true, hasDisplayName: true,
  recentDigests: ["1", "2", "3", "4", "5"],
  reportingServers: 0,
  text: "Fui caminhar no parque hoje de manha e vi tres garcas perto do rio",
};

const CONTA_SPAM = {
  createdAt: NOW - 1 * DAY, now: NOW,
  postsLastHour: 35, mentions: 12, mentionsToFollowers: 0,
  following: 1900, followers: 4,
  hasAvatar: false, hasBio: false, hasDisplayName: false,
  recentDigests: ["a", "a", "a", "a", "a", "a"],
  reportingServers: 6,
  text: "Buy cheap crypto now http://x.co http://y.co http://z.co guaranteed gains",
};

test("conta legitima e liberada", () => {
  const r = scoreActivity(CONTA_LIMPA);
  assert.equal(r.verdict, VERDICTS.ALLOW);
  assert.ok(r.score < THRESHOLDS.LIMIT, `pontuacao ${r.score} deveria ser baixa`);
});

test("conta de spam evidente cai em quarentena", () => {
  const r = scoreActivity(CONTA_SPAM);
  assert.equal(r.verdict, VERDICTS.QUARANTINE);
  assert.ok(r.score >= THRESHOLDS.QUARANTINE);
});

test("toda pontuacao vem com os sinais que a produziram", () => {
  const r = scoreActivity(CONTA_SPAM);
  assert.ok(r.signals.length >= 6, "deveria reportar todos os sinais");
  assert.ok(r.signals.some((s) => s.fired));
  assert.match(r.explanation, /Sinais disparados/);
  // ordenado por contribuicao decrescente: o administrador ve o motivo principal primeiro
  for (let i = 1; i < r.signals.length; i++) {
    assert.ok(r.signals[i - 1].contribution >= r.signals[i].contribution);
  }
});

test("NENHUM sinal sozinho no maximo causa quarentena", () => {
  // Esta e a garantia central contra derrubada por um unico eixo.
  const base = { ...CONTA_LIMPA };
  const extremos = {
    reportingServers: 99, postsLastHour: 999, mentions: 99,
    following: 99999, followers: 1,
  };
  for (const [campo, valor] of Object.entries(extremos)) {
    const r = scoreActivity({ ...base, [campo]: valor });
    assert.notEqual(
      r.verdict, VERDICTS.QUARANTINE,
      `${campo} sozinho no maximo causou quarentena (pontuacao ${r.score})`,
    );
  }
});

test("dados faltando nao penalizam a conta", () => {
  const r = scoreActivity({ text: "oi", now: NOW, createdAt: NOW - 400 * DAY });
  assert.equal(r.verdict, VERDICTS.ALLOW);
  assert.ok(Number.isFinite(r.score));
});

test("pontuacao fica sempre em [0,1]", () => {
  for (const a of [CONTA_LIMPA, CONTA_SPAM, {}, { text: "" }]) {
    const r = scoreActivity(a);
    assert.ok(r.score >= 0 && r.score <= 1, `fora do intervalo: ${r.score}`);
  }
});

// ─────────────────────── troca federada ───────────────────────

test("um servidor sozinho nunca confirma — defesa contra silenciamento", () => {
  const s = new SignalStore();
  const d = simhash("mensagem legitima que alguem quer silenciar por vinganca");
  for (let i = 0; i < 50; i++) s.report({ digest: d, server: "malicioso.example", at: NOW });
  assert.equal(s.reportingServers(d, NOW), 0, "reporte em massa de 1 servidor deve valer zero");
});

test("servidores independentes confirmam a partir do minimo", () => {
  const s = new SignalStore();
  const d = simhash("campanha de spam identica atingindo varios servidores agora");
  s.report({ digest: d, server: "a.example", at: NOW });
  assert.equal(s.reportingServers(d, NOW), 0, "1 servidor ainda nao basta");
  s.report({ digest: d, server: "b.example", at: NOW });
  assert.equal(s.reportingServers(d, NOW), MIN_INDEPENDENT_SERVERS);
});

test("reportar varias vezes nao infla a contagem do proprio servidor", () => {
  const s = new SignalStore();
  const d = simhash("mesma campanha reportada muitas vezes pela mesma origem aqui");
  for (let i = 0; i < 20; i++) s.report({ digest: d, server: "a.example", at: NOW });
  s.report({ digest: d, server: "b.example", at: NOW });
  assert.equal(s.reportingServers(d, NOW), 2, "20 relatos de A + 1 de B = 2 servidores");
});

test("limite de taxa recusa inundacao", () => {
  const s = new SignalStore();
  let recusados = 0;
  for (let i = 0; i < MAX_REPORTS_PER_SERVER_PER_HOUR + 25; i++) {
    const ok = s.report({ digest: simhash("campanha numero " + i + " distinta"), server: "flood.example", at: NOW });
    if (!ok) recusados++;
  }
  assert.equal(recusados, 25, "excedente deveria ser recusado");
});

test("variacoes da mesma campanha caem no mesmo balde", () => {
  const s = new SignalStore();
  const a = simhash("Buy cheap crypto now at http://x.com massive gains guaranteed today");
  const b = simhash("BUY CHEAP CRYPTO NOW at http://outro.net - massive gains guaranteed today!!!");
  s.report({ digest: a, server: "a.example", at: NOW });
  s.report({ digest: b, server: "b.example", at: NOW });
  assert.equal(s.reportingServers(a, NOW), 2, "reescrita deveria agrupar com o original");
});

test("relatos vencidos param de contar", () => {
  const s = new SignalStore({ retentionMs: 3600_000 });
  const d = simhash("campanha antiga que ja deveria ter sido esquecida pelo sistema");
  s.report({ digest: d, server: "a.example", at: NOW });
  s.report({ digest: d, server: "b.example", at: NOW });
  assert.equal(s.reportingServers(d, NOW), 2);
  assert.equal(s.reportingServers(d, NOW + 2 * 3600_000), 0, "deveria vencer");
});

test("feed publicado nao vaza conteudo", () => {
  const s = new SignalStore();
  const texto = "segredo do usuario que jamais pode sair deste servidor aqui";
  s.report({ digest: simhash(texto), server: "a.example", at: NOW });
  const feed = s.publish(NOW);
  const json = JSON.stringify(feed);
  assert.equal(feed.version, 1);
  for (const palavra of ["segredo", "usuario", "jamais", "servidor"]) {
    assert.ok(!json.includes(palavra), `feed vazou a palavra "${palavra}"`);
  }
  for (const item of feed.items) {
    assert.match(item.digest, /^[0-9a-f]{16}$/, "digest deve ser 16 hex, nada mais");
    assert.deepEqual(Object.keys(item).sort(), ["digest", "servers"]);
  }
});

test("ingestao de feed alheio funciona e rejeita formato desconhecido", () => {
  const a = new SignalStore();
  const d = simhash("campanha de spam que circula entre instancias federadas hoje");
  a.report({ digest: d, server: "a.example", at: NOW });

  const b = new SignalStore();
  b.report({ digest: d, server: "b.example", at: NOW });
  const aceitos = b.ingest(a.publish(NOW), "a.example", NOW);
  assert.equal(aceitos, 1);
  assert.equal(b.reportingServers(d, NOW), 2);

  assert.throws(() => b.ingest({ version: 99, items: [] }, "x.example"));
  assert.throws(() => b.ingest(null, "x.example"));
});

// ─────────────────────── integração ───────────────────────

test("sinal federado eleva a pontuacao, mas so junto com os outros", () => {
  const suspeita = {
    createdAt: NOW - 2 * DAY, now: NOW,
    postsLastHour: 9, mentions: 5, mentionsToFollowers: 0,
    following: 600, followers: 8,
    hasAvatar: false, hasBio: false, hasDisplayName: true,
    recentDigests: ["a", "a", "a", "b"],
    text: "Promo imperdivel acesse http://a.co e http://b.co agora mesmo",
  };
  const sem = scoreActivity({ ...suspeita, reportingServers: 0 });
  const com = scoreActivity({ ...suspeita, reportingServers: 5 });
  assert.ok(com.score > sem.score, "confirmacao federada deveria elevar a pontuacao");
  assert.ok(com.score - sem.score <= 0.25, "um unico eixo nao pode dominar");
});
