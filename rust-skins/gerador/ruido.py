"""Ruído procedural. Sem scipy — só numpy.

Tudo aqui existe para uma coisa: fazer uma superfície parecer usada de verdade.
A regra da Facepunch é "dirty and worn", e desgaste real não é ruído branco —
é ruído com estrutura em várias escalas.
"""
import numpy as np


def _grade(shape, freq, rng):
    """Uma oitava: grade aleatória pequena, esticada com interpolação suave."""
    h, w = shape
    gh, gw = max(2, int(h / freq)), max(2, int(w / freq))
    g = rng.random((gh + 1, gw + 1))

    # coordenadas normalizadas dentro da grade
    yi = np.linspace(0, gh, h, endpoint=False)
    xi = np.linspace(0, gw, w, endpoint=False)
    y0, x0 = yi.astype(int), xi.astype(int)
    fy, fx = yi - y0, xi - x0

    # smoothstep — interpolação linear deixa artefato de losango visível
    fy = (fy * fy * (3 - 2 * fy))[:, None]
    fx = (fx * fx * (3 - 2 * fx))[None, :]

    a = g[y0][:, x0]
    b = g[y0][:, x0 + 1]
    c = g[y0 + 1][:, x0]
    d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(shape, octaves=5, freq=64.0, gain=0.5, lacunarity=2.0, seed=0):
    """Ruído fractal: soma de oitavas, cada uma com o dobro da frequência
    e metade da amplitude. É o que dá aparência natural em vez de borrão."""
    rng = np.random.default_rng(seed)
    out = np.zeros(shape)
    amp, f, norm = 1.0, freq, 0.0
    for _ in range(octaves):
        out += amp * _grade(shape, f, rng)
        norm += amp
        amp *= gain
        f /= lacunarity
    return out / norm


def normalizar(a, lo=0.0, hi=1.0):
    mn, mx = a.min(), a.max()
    if mx - mn < 1e-9:
        return np.full_like(a, (lo + hi) / 2)
    return lo + (a - mn) * (hi - lo) / (mx - mn)


def limiar_suave(a, borda, suavidade=0.06):
    """Máscara 0..1 com transição macia. Usada para lascar tinta:
    corte duro dá recorte de adesivo, que é o cheiro de skin amadora."""
    return np.clip((a - (borda - suavidade)) / (2 * suavidade), 0, 1)
