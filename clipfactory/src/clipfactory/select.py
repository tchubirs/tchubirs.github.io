"""Seleção dos momentos que viram clipe.

Este é o único ponto do pipeline onde julgamento importa mais que mecânica.
A escolha do trecho é o que separa 300 views de 30.000 — e é exatamente o que
a plataforma paga. Por isso vale gastar tokens de um modelo forte aqui e
economizar em todo o resto.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from pydantic import BaseModel, Field

from .transcript import Segment, to_plaintext

# US$ por 1M de tokens (tabela oficial; confira antes de trocar de modelo)
PRICING = {
    "claude-opus-5":   (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
}


class ClipPick(BaseModel):
    start_s: float = Field(description="Início em segundos, do vídeo-fonte")
    end_s: float = Field(description="Fim em segundos, do vídeo-fonte")
    hook: str = Field(description="Frase-gancho curta, <=42 caracteres, sobreposta nos primeiros segundos")
    why: str = Field(description="Por que este trecho segura atenção — em uma frase")
    score: int = Field(ge=1, le=10, description="Força prevista do gancho, 1 a 10")


class Selection(BaseModel):
    clips: list[ClipPick]


SYSTEM = """Você seleciona trechos de vídeos longos para virarem clipes verticais curtos.

Como o dinheiro funciona nesta operação: a campanha paga por MIL VIEWS VERIFICADAS,
e uma view só conta depois de alguns segundos de retenção. Portanto seu único
objetivo é escolher trechos que sobrevivam aos 2 primeiros segundos e retenham
até o fim. Nada mais importa — nem "trecho informativo", nem "boa explicação".

Critérios, em ordem:
1. O trecho abre em tensão, afirmação forte, número concreto, contradição ou
   pergunta — nunca em preâmbulo, saudação ou "então, como eu ia dizendo".
2. O trecho fecha resolvido. Nada de cortar no meio de uma frase.
3. É compreensível sozinho, sem o resto do vídeo.
4. Tem uma virada, revelação ou pagamento antes do fim.

Regras rígidas:
- start_s e end_s vêm dos timestamps reais fornecidos. Não invente tempos.
- Duração entre {min_s} e {max_s} segundos.
- Os clipes não podem se sobrepor.
- O gancho é escrito em {language} e tem no máximo 42 caracteres. É uma promessa
  que o trecho cumpre — se o trecho não cumpre, escolha outro trecho.
- Nunca prometa no gancho algo que não está no áudio. Isso é o que faz a
  plataforma invalidar as views e estornar o pagamento.
{extra_rules}
Devolva exatamente {n} clipes, os melhores, ordenados do mais forte para o mais fraco."""


@dataclass
class SelectResult:
    clips: list[ClipPick]
    cost_usd: float
    input_tokens: int
    output_tokens: int


def _cost(model: str, tin: int, tout: int) -> float:
    pin, pout = PRICING.get(model, PRICING["claude-opus-5"])
    return (tin / 1e6) * pin + (tout / 1e6) * pout


def select_clips(
    segments: list[Segment],
    *,
    n: int,
    min_s: int,
    max_s: int,
    language: str,
    model: str = "claude-opus-5",
    must_include: list[str] | None = None,
    must_avoid: list[str] | None = None,
) -> SelectResult:
    """Chama Claude para escolher os trechos. Levanta se não houver chave."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY não definida. Sem ela a seleção cai para o modo "
            "heurístico (`--heuristic`), que é bem pior e vai custar views."
        )

    import anthropic

    extra = ""
    if must_include:
        extra += f"- O texto de publicação precisa conter: {', '.join(must_include)}\n"
    if must_avoid:
        extra += f"- Nunca mencione: {', '.join(must_avoid)}\n"

    system = SYSTEM.format(min_s=min_s, max_s=max_s, language=language,
                           n=n, extra_rules=extra)
    transcript = to_plaintext(segments, with_timestamps=True)

    client = anthropic.Anthropic()
    resp = client.messages.parse(
        model=model,
        max_tokens=8000,
        thinking={"type": "adaptive"},
        system=system,
        messages=[{
            "role": "user",
            "content": (
                "Transcrição com timestamps em segundos (o número entre "
                "colchetes é o início da fala):\n\n"
                f"{transcript}\n\n"
                f"Escolha os {n} melhores trechos."
            ),
        }],
        output_format=Selection,
    )
    picks = resp.parsed_output.clips
    validated = _validate(picks, segments, min_s, max_s)
    u = resp.usage
    return SelectResult(
        clips=validated,
        cost_usd=_cost(model, u.input_tokens, u.output_tokens),
        input_tokens=u.input_tokens,
        output_tokens=u.output_tokens,
    )


def _validate(picks: list[ClipPick], segments: list[Segment],
              min_s: int, max_s: int) -> list[ClipPick]:
    """O modelo pode alucinar tempos. Aqui a mecânica corrige a criatividade."""
    if not segments:
        return []
    floor, ceil = segments[0].start, segments[-1].end
    out: list[ClipPick] = []
    for p in sorted(picks, key=lambda c: -c.score):
        s, e = max(floor, p.start_s), min(ceil, p.end_s)
        if e - s < min_s:
            e = min(ceil, s + min_s)
        if e - s > max_s:
            e = s + max_s
        if e - s < min_s:            # não coube na fonte
            continue
        if any(not (e <= o.start_s or s >= o.end_s) for o in out):
            continue                 # sobreposição
        hook = re.sub(r"\s+", " ", p.hook).strip()[:42]
        out.append(ClipPick(start_s=round(s, 2), end_s=round(e, 2),
                            hook=hook, why=p.why, score=p.score))
    return out


def select_heuristic(segments: list[Segment], *, n: int, min_s: int,
                     max_s: int) -> SelectResult:
    """Plano B sem API: janelas de maior densidade de fala.

    É pior que o modelo — assumidamente. Existe para a máquina não parar
    quando a chave da API falhar às 3 da manhã.
    """
    if not segments:
        return SelectResult([], 0.0, 0, 0)
    target = (min_s + max_s) / 2
    cands: list[tuple[float, float, float]] = []
    for i, s in enumerate(segments):
        start, end, words = s.start, s.start, 0
        for t in segments[i:]:
            if t.end - start > max_s:
                break
            end, words = t.end, words + len(t.text.split())
        if end - start >= min_s:
            density = words / max(end - start, 1)
            fit = 1 - abs((end - start) - target) / target
            cands.append((density * (0.6 + 0.4 * fit), start, end))
    cands.sort(reverse=True)
    out: list[ClipPick] = []
    for _, s, e in cands:
        if any(not (e <= o.start_s or s >= o.end_s) for o in out):
            continue
        first = next((g.text for g in segments if g.start >= s), "")
        out.append(ClipPick(start_s=round(s, 2), end_s=round(e, 2),
                            hook=first[:42], why="heurística: densidade de fala",
                            score=5))
        if len(out) >= n:
            break
    return SelectResult(out, 0.0, 0, 0)
