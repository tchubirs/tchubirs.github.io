// Minimal D1-shaped adapter over node:sqlite for tests only (never shipped to the Worker): the
// real D1 binding is SQLite-based and supports the same RETURNING/UPSERT statements exercised
// here, so this gives the request-handling logic in lib/contexto-api.ts a faithful local check
// without needing a live D1 binding or any new dependency.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(AQUI, "..", "drizzle");

export function criarFakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  for (const nome of readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(DRIZZLE_DIR, nome), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return {
    prepare(query) {
      return {
        _query: query,
        _args: [],
        bind(...valores) {
          return { ...this, _args: valores };
        },
        async first() {
          const stmt = sqlite.prepare(this._query);
          return stmt.get(...this._args) ?? null;
        },
        async run() {
          const stmt = sqlite.prepare(this._query);
          const info = stmt.run(...this._args);
          return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        },
        async all() {
          const stmt = sqlite.prepare(this._query);
          return { success: true, results: stmt.all(...this._args) };
        },
      };
    },
    _raw: sqlite,
  };
}
