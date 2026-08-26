"""Carrega config.yaml + variáveis de ambiente, com validação estrita.

Regra de projeto: nada de default silencioso em campo que afeta dinheiro ou
conformidade. Se faltar, levanta erro com a instrução do que preencher.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Source:
    url: str
    license_note: str


@dataclass(frozen=True)
class Campaign:
    id: str
    platform: str
    name: str
    cpm_usd: float
    min_views_to_pay: int
    max_payout_per_post_usd: float
    source: Source
    must_include: list[str] = field(default_factory=list)
    must_avoid: list[str] = field(default_factory=list)

    def estimated_usd(self, views: int) -> float:
        """Receita estimada de um post, já aplicando piso e teto do brief."""
        if views < self.min_views_to_pay:
            return 0.0
        gross = (views / 1000.0) * self.cpm_usd
        return min(gross, self.max_payout_per_post_usd)


@dataclass(frozen=True)
class Production:
    clips_per_run: int
    clip_seconds_min: int
    clip_seconds_max: int
    style: str
    captions: bool
    burn_hook: bool
    model: str


@dataclass(frozen=True)
class KillRules:
    min_posts_before_judging: int
    median_views_floor: int
    max_cost_to_revenue_ratio: float
    halt_on_any_strike: bool


@dataclass(frozen=True)
class Config:
    market_language: str
    campaign: Campaign
    production: Production
    publish: dict
    kill_rules: KillRules
    root: Path

    # ── segredos (vêm do ambiente, nunca do yaml) ──
    @property
    def anthropic_key(self) -> str | None:
        return os.environ.get("ANTHROPIC_API_KEY") or None

    def require(self, *names: str) -> dict[str, str]:
        missing = [n for n in names if not os.environ.get(n)]
        if missing:
            raise ConfigError(
                "Faltam variáveis de ambiente: "
                + ", ".join(missing)
                + "\nVeja clipfactory/.env.example e o README (seção 'Seus minutos')."
            )
        return {n: os.environ[n] for n in names}


def _req(d: dict, key: str, where: str):
    if key not in d:
        raise ConfigError(f"config.yaml: falta '{key}' em {where}")
    return d[key]


def load(path: str | Path = "config.yaml") -> Config:
    p = Path(path)
    if not p.exists():
        raise ConfigError(
            f"{p} não existe. Copie config.example.yaml para config.yaml e preencha "
            "com os dados do brief da campanha que você aceitou."
        )
    raw = yaml.safe_load(p.read_text(encoding="utf-8")) or {}

    c = _req(raw, "campaign", "raiz")
    s = _req(c, "source", "campaign")
    if not str(s.get("license_note", "")).strip():
        raise ConfigError(
            "campaign.source.license_note está vazio. Cole a frase do brief que "
            "autoriza o corte. Rodar sem prova de licença é o risco de morte nº 1 "
            "desta operação — o programa se recusa a continuar."
        )

    prod = _req(raw, "production", "raiz")
    if prod["clip_seconds_max"] >= 60:
        raise ConfigError(
            "production.clip_seconds_max deve ser < 60 para manter elegibilidade "
            "de Shorts/Reels."
        )
    if prod["style"] not in ("blur", "crop"):
        raise ConfigError("production.style deve ser 'blur' ou 'crop'")

    kr = _req(raw, "kill_rules", "raiz")

    return Config(
        market_language=raw.get("market_language", "en"),
        campaign=Campaign(
            id=str(_req(c, "id", "campaign")),
            platform=str(c.get("platform", "outro")),
            name=str(c.get("name", "")),
            cpm_usd=float(_req(c, "cpm_usd", "campaign")),
            min_views_to_pay=int(c.get("min_views_to_pay", 1000)),
            max_payout_per_post_usd=float(c.get("max_payout_per_post_usd", 1e9)),
            source=Source(url=str(_req(s, "url", "campaign.source")),
                          license_note=str(s["license_note"]).strip()),
            must_include=list((c.get("rules") or {}).get("must_include") or []),
            must_avoid=list((c.get("rules") or {}).get("must_avoid") or []),
        ),
        production=Production(
            clips_per_run=int(prod.get("clips_per_run", 4)),
            clip_seconds_min=int(prod.get("clip_seconds_min", 18)),
            clip_seconds_max=int(prod["clip_seconds_max"]),
            style=prod["style"],
            captions=bool(prod.get("captions", True)),
            burn_hook=bool(prod.get("burn_hook", True)),
            model=str(prod.get("model", "claude-opus-5")),
        ),
        publish=raw.get("publish") or {},
        kill_rules=KillRules(
            min_posts_before_judging=int(kr.get("min_posts_before_judging", 12)),
            median_views_floor=int(kr.get("median_views_floor", 400)),
            max_cost_to_revenue_ratio=float(kr.get("max_cost_to_revenue_ratio", 0.6)),
            halt_on_any_strike=bool(kr.get("halt_on_any_strike", True)),
        ),
        root=p.resolve().parent,
    )
