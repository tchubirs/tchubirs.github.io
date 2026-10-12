# Gera site/acertos-modelos.js a partir dos WAV de 1-extrair-ui.py: cada modelo e o clipe a 12 kHz (24 kHz e media de pares,
# como o som da live chega), filtrado na banda dele (as mesmas medias moveis de site/acertos.js, passarBanda), os
# primeiros 0,3 s, em numeros de 8 bits. Precisa de: pip install av numpy. Uso: POVIX_AUDIO=<pasta> python -I 2-gerar-modelos.py <saida.js>
import av, numpy as np, os, sys, base64, json
D = os.environ["POVIX_AUDIO"]
# id, arquivo, tipo, banda (hp, lp em amostras de 12 kHz): classicos e headshot de 300 Hz para cima; os modernos tem o corpo abaixo disso
MODELOS = [
    ("classico-1", "hit-marker-001.wav", "corpo", 18, 1),
    ("classico-2", "hit-marker-003.wav", "corpo", 18, 1),
    ("moderno-1", "modern_hitmarker_1.wav", "corpo", 88, 4),
    ("moderno-2", "modern_hitmarker_2.wav", "corpo", 88, 4),
    ("moderno-3", "modern_hitmarker_3.wav", "corpo", 88, 4),
    ("cabeca", "headshot-1.wav", "cabeca", 18, 1),
    ("morte", "modern_kill_notify.wav", "morte", 88, 4),
]
def a24(f):
    c = av.open(f); r = av.AudioResampler(format="flt", layout="mono", rate=24000)
    return np.concatenate([x.to_ndarray().reshape(-1) for fr in c.decode(audio=0) for x in r.resample(fr)])
def doze(x):
    n = len(x) // 2
    return x[:n * 2].reshape(n, 2).mean(1).astype(np.float32)
def media(x, j):
    if j <= 1: return x.copy()
    n = len(x); cum = np.concatenate([[0], np.cumsum(x.astype(np.float64))]); m = j // 2
    i = np.arange(n); a = np.maximum(0, i - m); z = np.minimum(n, i + m + 1)
    return ((cum[z] - cum[a]) / (z - a)).astype(np.float32)
saida = []
for id_, arq, tipo, hp, lp in MODELOS:
    x = doze(a24(os.path.join(D, "ui", arq)))
    y = media(x, lp) - media(x, hp)
    y = y[:int(0.3 * 12000)]
    q = np.round(y / np.abs(y).max() * 127).astype(np.int8)
    saida.append({"id": id_, "tipo": tipo, "banda": {"hp": hp, "lp": lp}, "n": len(q), "q": base64.b64encode(q.tobytes()).decode()})
cab = ("// Modelos dos sons de acerto do Rust (corpo, cabeca, morte) para site/acertos.js: o clipe a 12 kHz, filtrado na banda de cada um, 0,3 s,\n"
       "// em 8 bits. Sao vetores de correlacao, nao os arquivos de audio do jogo. Refazer: probes/modelo-acertos/ (2 passos).\n")
open(sys.argv[1], "w", encoding="utf8", newline="\n").write(cab + "export default " + json.dumps(saida, separators=(",", ":")) + ";\n")
print(len(saida), "modelos,", sum(len(s["q"]) for s in saida), "bytes de texto")
