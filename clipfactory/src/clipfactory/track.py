"""Leitura de views, avanço do dinheiro e as regras de morte.

O que este arquivo faz é a diferença entre uma operação e um hobby: ele mede,
avança o estado do dinheiro e desliga a campanha sozinho quando os números
dizem que ela não paga.
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import Config
from .ledger import Ledger
from .publish.youtube import check_strikes, fetch_view_counts


@dataclass
class KillVerdict:
    halt: bool
    reasons: list[str]


def refresh(cfg: Config, ledger: Ledger) -> dict:
    """Atualiza views e move o dinheiro de GERADO para PENDENTE/ELEGÍVEL."""
    rows = ledger.published(cfg.campaign.id)
    vids = [r["youtube_video_id"] for r in rows if r["youtube_video_id"]]

    views = fetch_view_counts(vids) if vids else {}
    problems = check_strikes(vids) if vids else {}

    for r in rows:
        vid = r["youtube_video_id"]
        if not vid:
            continue
        if vid in problems:
            ledger.set_clip(r["id"], strike=1, state="REMOVIDO",
                            notes=problems[vid])
            if r["money_state"] not in ("SACADO", "ESTORNADO"):
                ledger.advance_money(r["id"], "ESTORNADO",
                                     reason=problems[vid])
            continue
        v = views.get(vid)
        if v is None:
            continue
        ledger.set_clip(r["id"], views=v)
        usd = cfg.campaign.estimated_usd(v)
        # GERADO -> PENDENTE assim que passa o piso pago pela campanha.
        # ELEGÍVEL/LIQUIDADO/SACADO só a plataforma confirma — quem marca é o
        # dono, com `clipfactory money`. A máquina nunca inventa que recebeu.
        if r["money_state"] == "GERADO" and v >= cfg.campaign.min_views_to_pay:
            ledger.advance_money(r["id"], "PENDENTE", usd=usd,
                                 reason=f"{v} views, aguardando verificação")
        elif r["money_state"] == "PENDENTE":
            ledger.set_clip(r["id"], money_usd=usd)

    return ledger.summary(cfg.campaign.id)


def evaluate_kill_rules(cfg: Config, ledger: Ledger) -> KillVerdict:
    kr, reasons = cfg.kill_rules, []

    if kr.halt_on_any_strike and ledger.strikes(cfg.campaign.id) > 0:
        reasons.append(
            "STRIKE detectado. Pare tudo, não publique mais nada nesta conta e "
            "leia a notificação no YouTube Studio antes de qualquer outra coisa."
        )

    posts = len(ledger.published(cfg.campaign.id))
    if posts >= kr.min_posts_before_judging:
        med = ledger.median_views(cfg.campaign.id)
        if med < kr.median_views_floor:
            reasons.append(
                f"Mediana de {med:.0f} views em {posts} posts, abaixo do piso de "
                f"{kr.median_views_floor}. O formato não pega. Troque de campanha "
                "ou de ângulo — insistir só queima CPU e reputação da conta."
            )

    s = ledger.summary(cfg.campaign.id)
    promised = s["prometido_nao_sacado_usd"] + s["sacado_usd"]
    cost = s["custo_api_usd"]
    if promised > 0 and cost / promised > kr.max_cost_to_revenue_ratio:
        reasons.append(
            f"Custo de API (US$ {cost:.2f}) passou de "
            f"{kr.max_cost_to_revenue_ratio:.0%} da receita prevista "
            f"(US$ {promised:.2f}). Baixe o modelo ou pare."
        )
    elif promised == 0 and cost > 3.0:
        reasons.append(
            f"US$ {cost:.2f} gastos e US$ 0,00 de receita prevista. "
            "Nada está convertendo."
        )

    return KillVerdict(halt=bool(reasons), reasons=reasons)
