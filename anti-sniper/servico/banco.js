'use strict';
/**
 * Armazenamento. SQLite via node:sqlite — sem dependência externa e sem
 * servidor de banco para manter no ar.
 *
 * O que fica guardado, e nada além disso:
 *   - quem apareceu no chat de cada canal, e quando
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
      criado_em    INTEGER NOT NULL
    );

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

    -- Idempotência de webhook: a Kick reentrega evento quando não recebe
    -- 200 a tempo. Sem isto, uma reentrega contaria presença duas vezes.
    CREATE TABLE IF NOT EXISTS evento_visto (
      id       TEXT PRIMARY KEY,
      visto_em INTEGER NOT NULL
    );
  `);
  return db;
}

module.exports = { abrir };
