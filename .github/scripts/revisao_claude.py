import os
import subprocess
from pathlib import Path

from anthropic import Anthropic


base = os.environ.get("CLAUDE_BASE", "8a3dceb")
files = os.environ.get("CLAUDE_FILES", "kick-sync/site/retrato.js kick-sync/site/app.js").split()
pedido = os.environ.get("CLAUDE_PROMPT", "Revise o diff.")
if not os.environ.get("ANTHROPIC_API_KEY"):
    raise SystemExit("Cadastre o secret ANTHROPIC_API_KEY no repositório.")

diff = subprocess.run(
    ["git", "diff", "--no-ext-diff", f"{base}..HEAD", "--", *files],
    check=True,
    capture_output=True,
    text=True,
    encoding="utf-8",
).stdout
if not diff.strip():
    raise SystemExit(f"O diff {base}..HEAD não tem mudanças nos caminhos informados.")

client = Anthropic()
models = client.models.list(limit=20)
ids = [model.id for model in models.data]
requested_model = os.environ.get("CLAUDE_MODEL", "").strip()
model = requested_model if requested_model in ids else None
model = model or next((item for item in ids if "sonnet" in item.lower()), None)
model = model or next((item for item in ids if "opus" in item.lower()), None) or ids[0]

prompt = f"""Você é uma revisora sênior de front end. Responda em português do Brasil.

Pedido: {pedido}

Revise somente o diff abaixo. Não edite arquivos nem execute comandos. Liste apenas problemas acionáveis, com este formato:
- [CRÍTICO/ALTO/MÉDIO/BAIXO] `arquivo:linha` — problema concreto, evidência no diff, impacto e correção mínima.

Se for hipótese, marque como hipótese e diga o que medir. Não invente problemas genéricos.

DIFF:
{diff}
"""

response = client.messages.create(
    model=model,
    max_tokens=5000,
    system="Seja rigorosa, direta e não exponha segredos.",
    messages=[{"role": "user", "content": prompt}],
)
answer = "\n".join(
    block.text for block in response.content if getattr(block, "type", None) == "text"
)

summary = Path(os.environ.get("GITHUB_STEP_SUMMARY", "/tmp/claude-review-summary.md"))
summary.write_text(f"# Revisão com {model}\n\n{answer}\n", encoding="utf-8")
print(answer)
