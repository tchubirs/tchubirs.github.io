"""Título, descrição e hashtags — no idioma do MERCADO, não no seu."""
from __future__ import annotations

import os

from pydantic import BaseModel, Field

from .select import PRICING, ClipPick, _cost
from .transcript import Segment, to_plaintext, window


class Meta(BaseModel):
    title: str = Field(description="Título do Short, <=90 caracteres, sem clickbait falso")
    description: str = Field(description="2 a 3 linhas + chamada, no idioma do mercado")
    hashtags: list[str] = Field(description="3 a 6 hashtags sem o caractere #")


SYSTEM = """Você escreve o texto de publicação de um clipe vertical curto em {language}.

O título é lido em meio segundo numa lista de vídeos. Ele compete por atenção,
não por precisão descritiva. Mas ele NÃO pode prometer o que o clipe não entrega:
promessa não cumprida derruba a retenção, e retenção baixa é o que faz a
campanha não pagar.

Regras:
- Título até 90 caracteres, em {language}. Sem "VOCÊ NÃO VAI ACREDITAR".
- Descrição de 2 a 3 linhas, em {language}.
- 3 a 6 hashtags, sem o caractere '#', relevantes ao conteúdo real.
- Nunca afirme ser o autor original do conteúdo-fonte.
{extra}"""


def write_metadata(
    clip: ClipPick,
    segments: list[Segment],
    *,
    language: str,
    model: str = "claude-opus-5",
    must_include: list[str] | None = None,
    must_avoid: list[str] | None = None,
    attribution: str = "",
) -> tuple[Meta, float]:
    # A checagem vem ANTES do import: sem chave (ou sem o pacote instalado)
    # o pipeline precisa continuar publicando, não morrer aqui.
    if not os.environ.get("ANTHROPIC_API_KEY"):
        # Plano B: usa o gancho como título. Feio, mas publica.
        return Meta(title=clip.hook[:90], description=clip.hook,
                    hashtags=["shorts"]), 0.0

    import anthropic

    extra = ""
    if must_include:
        extra += f"- A descrição precisa conter: {', '.join(must_include)}\n"
    if must_avoid:
        extra += f"- Nunca mencione: {', '.join(must_avoid)}\n"
    if attribution:
        extra += f"- A descrição precisa creditar a fonte assim: {attribution}\n"

    local = window(segments, clip.start_s, clip.end_s)
    client = anthropic.Anthropic()
    resp = client.messages.parse(
        model=model,
        max_tokens=2000,
        system=SYSTEM.format(language=language, extra=extra),
        messages=[{
            "role": "user",
            "content": (
                f"Gancho definido: {clip.hook}\n"
                f"Por que este trecho: {clip.why}\n\n"
                f"Transcrição do clipe:\n{to_plaintext(local, False)}"
            ),
        }],
        output_format=Meta,
    )
    u = resp.usage
    m = resp.parsed_output
    m.title = m.title.strip()[:90]
    m.hashtags = [h.lstrip("#").strip() for h in m.hashtags][:6]
    return m, _cost(model, u.input_tokens, u.output_tokens)


def youtube_description(meta: Meta, attribution: str, license_note: str) -> str:
    """Descrição final do Short, já com a atribuição obrigatória."""
    parts = [meta.description.strip()]
    if attribution:
        parts.append(attribution.strip())
    parts.append(" ".join(f"#{h}" for h in meta.hashtags + ["Shorts"]))
    if license_note:
        # Registro público de que o corte é autorizado. Vale ouro numa disputa.
        parts.append(f"\nUsed with permission — {license_note}")
    return "\n\n".join(p for p in parts if p)[:4900]
