"""Livro-razão da operação: cada clipe e cada centavo, com estado explícito.

O ponto deste arquivo é não perder dinheiro por não saber onde ele está.
Toda a máquina de estados do dinheiro vive aqui — nada de "aproximadamente".

Estados do dinheiro (transições permitidas no final do arquivo):

  GERADO     — o clipe foi publicado e acumulou views. Ainda não é dinheiro.
  PENDENTE   — views enviadas à campanha, aguardando verificação (janela ~48h).
  ELEGIVEL   — verificado pela plataforma, passou o piso de views, virou saldo.
  RETIDO     — plataforma segurou por revisão antifraude / disputa.
  ESTORNADO  — views invalidadas ou clipe removido; o valor voltou a zero.
  LIQUIDADO  — saldo liberado para saque na plataforma.
  SACADO     — saiu da plataforma e entrou na conta do dono. Só isto é dinheiro.
"""
from __future__ import annotations

import json
import sqlite3
import statistics
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

MONEY_STATES = (
    "GERADO", "PENDENTE", "ELEGIVEL", "RETIDO",
    "ESTORNADO", "LIQUIDADO", "SACADO",
)

# Para onde cada estado pode ir. Qualquer outra transição é bug e levanta erro.
ALLOWED: dict[str, set[str]] = {
    "GERADO":    {"PENDENTE", "ESTORNADO"},
    "PENDENTE":  {"ELEGIVEL", "RETIDO", "ESTORNADO"},
    "ELEGIVEL":  {"LIQUIDADO", "RETIDO", "ESTORNADO"},
    "RETIDO":    {"ELEGIVEL", "ESTORNADO"},
    "LIQUIDADO": {"SACADO", "RETIDO", "ESTORNADO"},
    "SACADO":    set(),
    "ESTORNADO": set(),
}

CLIP_STATES = ("PLANEJADO", "RENDERIZADO", "PUBLICADO", "FALHOU", "REMOVIDO")

SCHEMA = """
CREATE TABLE IF NOT EXISTS clips (
  id                TEXT PRIMARY KEY,
  campaign_id       TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  state             TEXT NOT NULL,
  source_url        TEXT,
  start_s           REAL,
  end_s             REAL,
  hook              TEXT,
  title             TEXT,
  description       TEXT,
  file_path         TEXT,
  youtube_video_id  TEXT,
  instagram_media_id TEXT,
  published_at      TEXT,
  views             INTEGER NOT NULL DEFAULT 0,
  views_checked_at  TEXT,
  money_state       TEXT NOT NULL DEFAULT 'GERADO',
  money_usd         REAL NOT NULL DEFAULT 0.0,
  strike            INTEGER NOT NULL DEFAULT 0,
  notes             TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  clip_id     TEXT,
  kind        TEXT NOT NULL,
  payload     TEXT
);
CREATE TABLE IF NOT EXISTS costs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  item        TEXT NOT NULL,
  usd         REAL NOT NULL,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_clips_campaign ON clips(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clips_money ON clips(money_state);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Clip:
    id: str
    campaign_id: str
    state: str
    start_s: float
    end_s: float
    hook: str
    title: str = ""
    description: str = ""
    file_path: str = ""
    youtube_video_id: str = ""
    views: int = 0
    money_state: str = "GERADO"
    money_usd: float = 0.0


class Ledger:
    def __init__(self, path: str | Path = "state/ledger.db"):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.db.commit()

    # ── escrita ────────────────────────────────────────────────
    def add_clip(self, clip_id: str, campaign_id: str, *, source_url: str,
                 start_s: float, end_s: float, hook: str) -> None:
        self.db.execute(
            "INSERT OR IGNORE INTO clips (id, campaign_id, created_at, state, "
            "source_url, start_s, end_s, hook) VALUES (?,?,?,?,?,?,?,?)",
            (clip_id, campaign_id, _now(), "PLANEJADO", source_url,
             start_s, end_s, hook),
        )
        self.db.commit()
        self.event(clip_id, "clip.planejado",
                   {"start_s": start_s, "end_s": end_s, "hook": hook})

    def set_clip(self, clip_id: str, **fields) -> None:
        if not fields:
            return
        if "state" in fields and fields["state"] not in CLIP_STATES:
            raise ValueError(f"estado de clipe inválido: {fields['state']}")
        cols = ", ".join(f"{k}=?" for k in fields)
        self.db.execute(f"UPDATE clips SET {cols} WHERE id=?",
                        (*fields.values(), clip_id))
        self.db.commit()

    def advance_money(self, clip_id: str, to_state: str, *,
                      usd: float | None = None, reason: str = "") -> None:
        """Move o dinheiro de um clipe, validando a transição."""
        if to_state not in MONEY_STATES:
            raise ValueError(f"estado de dinheiro inválido: {to_state}")
        row = self.db.execute(
            "SELECT money_state, money_usd FROM clips WHERE id=?", (clip_id,)
        ).fetchone()
        if row is None:
            raise KeyError(f"clipe desconhecido: {clip_id}")
        cur = row["money_state"]
        if to_state == cur:
            return
        if to_state not in ALLOWED[cur]:
            raise ValueError(
                f"transição proibida {cur} -> {to_state} no clipe {clip_id}. "
                "Isto quase sempre significa que a leitura da plataforma veio "
                "errada; investigue antes de forçar."
            )
        new_usd = 0.0 if to_state == "ESTORNADO" else (
            row["money_usd"] if usd is None else float(usd)
        )
        self.db.execute(
            "UPDATE clips SET money_state=?, money_usd=? WHERE id=?",
            (to_state, new_usd, clip_id),
        )
        self.db.commit()
        self.event(clip_id, "money.transicao",
                   {"de": cur, "para": to_state, "usd": new_usd, "motivo": reason})

    def add_cost(self, campaign_id: str, item: str, usd: float,
                 detail: str = "") -> None:
        self.db.execute(
            "INSERT INTO costs (at, campaign_id, item, usd, detail) VALUES (?,?,?,?,?)",
            (_now(), campaign_id, item, float(usd), detail),
        )
        self.db.commit()

    def event(self, clip_id: str | None, kind: str, payload: dict | None = None) -> None:
        self.db.execute(
            "INSERT INTO events (at, clip_id, kind, payload) VALUES (?,?,?,?)",
            (_now(), clip_id, kind, json.dumps(payload or {}, ensure_ascii=False)),
        )
        self.db.commit()

    # ── leitura ────────────────────────────────────────────────
    def published(self, campaign_id: str) -> list[sqlite3.Row]:
        return self.db.execute(
            "SELECT * FROM clips WHERE campaign_id=? AND state='PUBLICADO' "
            "ORDER BY published_at", (campaign_id,)
        ).fetchall()

    def total_cost(self, campaign_id: str) -> float:
        r = self.db.execute(
            "SELECT COALESCE(SUM(usd),0) c FROM costs WHERE campaign_id=?",
            (campaign_id,)).fetchone()
        return float(r["c"])

    def money_by_state(self, campaign_id: str) -> dict[str, float]:
        rows = self.db.execute(
            "SELECT money_state, COALESCE(SUM(money_usd),0) s FROM clips "
            "WHERE campaign_id=? GROUP BY money_state", (campaign_id,)).fetchall()
        out = {s: 0.0 for s in MONEY_STATES}
        for r in rows:
            out[r["money_state"]] = float(r["s"])
        return out

    def strikes(self, campaign_id: str) -> int:
        r = self.db.execute(
            "SELECT COALESCE(SUM(strike),0) s FROM clips WHERE campaign_id=?",
            (campaign_id,)).fetchone()
        return int(r["s"])

    def median_views(self, campaign_id: str) -> float:
        vals = [r["views"] for r in self.published(campaign_id)]
        return statistics.median(vals) if vals else 0.0

    def summary(self, campaign_id: str) -> dict:
        pub = self.published(campaign_id)
        money = self.money_by_state(campaign_id)
        cost = self.total_cost(campaign_id)
        # "Dinheiro de verdade" = só o que já saiu da plataforma.
        real = money["SACADO"]
        # "Prometido" = tudo que ainda pode virar dinheiro.
        promised = sum(money[s] for s in ("GERADO", "PENDENTE", "ELEGIVEL",
                                          "RETIDO", "LIQUIDADO"))
        return {
            "campanha": campaign_id,
            "posts_publicados": len(pub),
            "views_totais": sum(r["views"] for r in pub),
            "views_mediana": self.median_views(campaign_id),
            "dinheiro_por_estado_usd": money,
            "sacado_usd": round(real, 4),
            "prometido_nao_sacado_usd": round(promised, 4),
            "custo_api_usd": round(cost, 4),
            "resultado_liquido_real_usd": round(real - cost, 4),
            "strikes": self.strikes(campaign_id),
        }

    @contextmanager
    def tx(self):
        try:
            yield self.db
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def close(self) -> None:
        self.db.close()
