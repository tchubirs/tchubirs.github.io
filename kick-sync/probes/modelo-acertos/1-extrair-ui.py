# Le o audio.bundle do Rust (so leitura, nada e escrito na pasta do jogo) e grava em POVIX_AUDIO/ui os clipes de interface:
# os sons de acerto (hit-marker, modern_hitmarker, headshot, modern_kill_notify) e de dano sofrido (player-local-damage).
# Precisa de: pip install UnityPy. Uso: POVIX_AUDIO=<pasta> python -I 1-extrair-ui.py
import UnityPy, os
D = os.environ.get("POVIX_AUDIO") or os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, "ui"); os.makedirs(OUT, exist_ok=True)
p = r"C:\Program Files (x86)\Steam\steamapps\common\Rust\Bundles\shared\audio.bundle"
env = UnityPy.load(p)
n = 0
for k, v in env.container.items():
    if "/audioclips/ui/" in k:
        for nome, b in v.read().samples.items():
            open(os.path.join(OUT, os.path.basename(k)), "wb").write(b); n += 1
print(n, "clipes em", OUT)
