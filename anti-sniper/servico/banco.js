'use strict';
/**
 * Armazenamento. SQLite via node:sqlite — sem dependência externa e sem
 * servidor de banco para manter no ar.
 *
 * O que fica guardado, e nada além disso:
 *   - quem apareceu no chat de cada canal, e QUANDO — em intervalos
 *   - quem esteve no servidor, e QUANDO — nos mesmos intervalos
 *   - nomes de jogadores vistos, para o cruzamento
 * Nunca IP, nunca e-mail, nunca nada de fora da plataforma.
 */

const { DatabaseSync } = require('node:sqlite');

function abrir(caminho = 'detetive.db') {
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS canal (
      id           TEXT PRIMARY KEY,
      plataforma   TEXT NOT NULL,
      slug         TEXT NOT NULL,
      criado_em    INTEGER NOT NULL,
      -- Qual servidor do Discord fala com este canal. Sem isso, o /detetive
      -- não sabe de quem é a audiência que ele deve consultar.
      discord_guild TEXT,
      -- Fuso do streamer. Quando ele digita "22:47", é 22:47 DELE. Errar
      -- isto por duas horas transforma "estava na live" em "não estava".
      fuso          TEXT NOT NULL DEFAULT 'UTC',
      -- Canal no StreamElements, de onde sai a presença de quem assiste
      -- CALADO. Sem isto, só existe quem escreve no chat.
      se_canal      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_canal_guild ON canal (discord_guild);

    -- Uma linha por pessoa por canal. 'blocos' conta presença creditada,
    -- não mensagens: contar mensagem premiaria quem fala muito e ignoraria
    -- quem assiste calado — que é exatamente quem interessa aqui.
    CREATE TABLE IF NOT EXISTS presenca (
      canal_id        TEXT NOT NULL,
      nome            TEXT NOT NULL,
      nome_norm       TEXT NOT NULL,
      usuario_id      TEXT,
      primeira_em     INTEGER NOT NULL,
      ultima_em       INTEGER NOT NULL,
      ultimo_credito  INTEGER NOT NULL,
      blocos          INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (canal_id, nome_norm)
    );

    -- Índice pelo nome NORMALIZADO: é por ele que o cruzamento procura,
    -- e sem índice a consulta varre a tabela inteira a cada pergunta.
    CREATE INDEX IF NOT EXISTS idx_presenca_norm ON presenca (nome_norm);

    CREATE TABLE IF NOT EXISTS live (
      canal_id   TEXT NOT NULL,
      inicio_em  INTEGER NOT NULL,
      fim_em     INTEGER,
      PRIMARY KEY (canal_id, inicio_em)
    );

    -- Retrato do servidor onde o streamer está agora. Uma linha por
    -- jogador visto, substituída a cada rodada do agente.
    CREATE TABLE IF NOT EXISTS no_servidor (
      canal_id    TEXT NOT NULL,
      nome        TEXT NOT NULL,
      nome_norm   TEXT NOT NULL,
      minutos     INTEGER,
      servidor    TEXT,
      visto_em    INTEGER NOT NULL,
      bm_id       TEXT,
      PRIMARY KEY (canal_id, nome_norm)
    );

    -- ESTADA: de quando até quando a pessoa esteve em cada lugar.
    --
    -- Total assistido não responde a pergunta do produto. "Ele assistiu 20h"
    -- não diz nada sobre o minuto em que te mataram; "ele estava na sua live
    -- das 21h10 às 23h05, e você morreu às 22h47" diz tudo.
    --
    -- Guarda INTERVALO, não avistamento solto: o agente lê 1.500 jogadores a
    -- cada 90s, e uma linha por leitura seriam 60 mil linhas por hora.
    CREATE TABLE IF NOT EXISTS estada (
      id         INTEGER PRIMARY KEY,
      canal_id   TEXT NOT NULL,
      onde       TEXT NOT NULL,        -- 'live' ou 'servidor'
      nome_norm  TEXT NOT NULL,
      nome       TEXT NOT NULL,
      inicio_em  INTEGER NOT NULL,
      fim_em     INTEGER NOT NULL,
      amostras   INTEGER NOT NULL DEFAULT 1,
      onde_extra TEXT,                 -- nome do servidor, quando for o caso
      -- Quem é essa pessoa fora daqui. Hoje é o id no BattleMetrics, que
      -- abre o perfil, o histórico de nomes e a SteamID. Sem isso o painel
      -- diz "fulano está no servidor" e não dá para saber quem é.
      ref        TEXT,
      -- De onde veio o sinal: 'chat' (escreveu), 'tempo' (o contador de
      -- tempo assistido subiu, mesmo calado) ou 'servidor'. Quem lê o log
      -- precisa saber se aquilo é uma mensagem ou uma medição.
      fonte      TEXT NOT NULL DEFAULT 'chat',
      -- 1 = a pessoa AINDA está lá. Só a presença da Kick sabe disto: ela
      -- avisa a saída. As outras fontes são pontos soltos, e para elas
      -- "ainda está" é sempre um palpite pelo tempo desde o último sinal.
      -- Sem esta coluna, alguém que a presença viu SAIR continuava
      -- aparecendo em "na live agora" por mais 15 minutos.
      aberta     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_estada_pessoa
      ON estada (canal_id, onde, nome_norm, fim_em);
    CREATE INDEX IF NOT EXISTS idx_estada_tempo
      ON estada (canal_id, onde, inicio_em, fim_em);

    -- De onde vem a audiência de um canal. Uma pessoa que assiste no
    -- YouTube e joga no mesmo servidor é o mesmo caso de quem assiste na
    -- Kick — a pergunta é "essa pessoa estava me assistindo", não "em qual
    -- site". Por isso um canal pode ter várias fontes, e todas caem na
    -- mesma audiência.
    CREATE TABLE IF NOT EXISTS fonte (
      canal_id   TEXT NOT NULL,
      servico    TEXT NOT NULL,        -- 'botrix'
      plataforma TEXT NOT NULL,        -- kick | twitch | youtube | trovo
      usuario    TEXT NOT NULL,
      criado_em  INTEGER NOT NULL,
      PRIMARY KEY (canal_id, servico, plataforma, usuario)
    );

    -- HISTÓRICO DE NOMES, gravado por nós.
    --
    -- Ele mostrou um concorrente com 32 nomes de uma conta, incluindo o que
    -- resolvia o caso. A Steam me entrega 1, porque o perfil é privado.
    -- A diferença não é técnica: eles gravam há anos e nós não gravávamos
    -- nada. Histórico não se compra, se grava — e só começa a existir a
    -- partir do dia em que se liga.
    --
    -- A chave é o id do BattleMetrics, não o nome: é ele que sobrevive à
    -- troca de nome, que é justamente o evento que interessa registrar.
    CREATE TABLE IF NOT EXISTS nome_visto (
      ref        TEXT NOT NULL,        -- id no BattleMetrics
      nome       TEXT NOT NULL,
      nome_norm  TEXT NOT NULL,
      primeira_em INTEGER NOT NULL,
      ultima_em   INTEGER NOT NULL,
      vezes       INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (ref, nome_norm)
    );
    CREATE INDEX IF NOT EXISTS idx_nome_visto_norm ON nome_visto (nome_norm);

    -- Idempotência de webhook: a Kick reentrega evento quando não recebe
    -- 200 a tempo. Sem isto, uma reentrega contaria presença duas vezes.
    CREATE TABLE IF NOT EXISTS evento_visto (
      id       TEXT PRIMARY KEY,
      visto_em INTEGER NOT NULL
    );
  `);

  // Banco criado antes da coluna existir: acrescenta sem perder nada.
  const colNoServidor = db.prepare('PRAGMA table_info(no_servidor)').all().map((c) => c.name);
  if (colNoServidor.length && !colNoServidor.includes('bm_id')) {
    db.exec('ALTER TABLE no_servidor ADD COLUMN bm_id TEXT');
  }

  const colunas = db.prepare('PRAGMA table_info(canal)').all().map((c) => c.name);
  if (!colunas.includes('discord_guild')) {
    db.exec('ALTER TABLE canal ADD COLUMN discord_guild TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_canal_guild ON canal (discord_guild)');
  }
  if (!colunas.includes('fuso')) {
    db.exec("ALTER TABLE canal ADD COLUMN fuso TEXT NOT NULL DEFAULT 'UTC'");
  }
  if (!colunas.includes('se_canal')) {
    db.exec('ALTER TABLE canal ADD COLUMN se_canal TEXT');
  }
  const colEstada = db.prepare('PRAGMA table_info(estada)').all().map((c) => c.name);
  if (colEstada.length && !colEstada.includes('fonte')) {
    db.exec("ALTER TABLE estada ADD COLUMN fonte TEXT NOT NULL DEFAULT 'chat'");
  }
  if (colEstada.length && !colEstada.includes('ref')) {
    db.exec('ALTER TABLE estada ADD COLUMN ref TEXT');
  }
  if (colEstada.length && !colEstada.includes('aberta')) {
    db.exec('ALTER TABLE estada ADD COLUMN aberta INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

module.exports = { abrir };
