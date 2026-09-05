"""Madeira envelhecida.

Erro que custou a primeira versão: o veio saiu perpendicular às ripas.
Madeira serrada tem o veio no **comprimento** da tábua, sempre. Veio
atravessado é o sinal mais rápido de textura falsa que existe.
"""
import numpy as np
from ruido import fbm, normalizar, limiar_suave


def ripas(shape, n=7, seed=0):
    """Ripas verticais. Devolve (indice, dist_do_centro, mascara_da_junta)."""
    h, w = shape
    rng = np.random.default_rng(seed)
    larg = rng.uniform(0.80, 1.20, n)
    bordas = np.concatenate([[0.0], np.cumsum(larg / larg.sum()) * w])

    x = np.broadcast_to(np.arange(w, dtype=float)[None, :], shape)
    idx = np.zeros(shape, dtype=int)
    dist = np.ones(shape)
    for i in range(n):
        a, b = bordas[i], bordas[i + 1]
        m = (x >= a) & (x < b)
        idx[m] = i
        meia = max((b - a) / 2, 1e-6)
        dist = np.where(m, np.clip(np.abs(x - (a + b) / 2) / meia, 0, 1), dist)

    # junta: fenda escura entre tábuas
    junta = limiar_suave(dist, 0.965, 0.012)
    # bisel: a quina da tábua pega luz logo antes da fenda
    bisel = limiar_suave(dist, 0.90, 0.035) - junta
    return idx, dist, junta, np.clip(bisel, 0, 1)


def veio(shape, seed=0, vertical=True, aneis=26.0, ondulacao=2.6, seiva=0.55,
         fase=None):
    """Veio por deformação de domínio.

    A primeira tentativa aplicava seno sobre ruído esticado e saía código de
    barras — traço curto, picotado. Veio de verdade é linha **contínua** que
    serpenteia pela tábua inteira.

    A receita certa: pega a coordenada que atravessa a tábua, soma um ruído
    suave nela (isso entorta a linha), e só então aplica o seno. O seno sobre
    coordenada deformada dá anel longo e ondulado, que é o que a madeira tem.
    """
    h, w = shape
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], shape)
    x = np.broadcast_to(np.linspace(0, 1, w)[None, :], shape)

    # eixo que ATRAVESSA a tábua (onde os anéis se sucedem) e eixo do
    # comprimento (onde a linha corre longa)
    atravessa, comprimento = (x, y) if vertical else (y, x)

    # ondulação lenta: faz a linha serpentear sem picotar
    warp = fbm(shape, octaves=4, freq=95, seed=seed + 11) - 0.5
    warp += (fbm(shape, octaves=3, freq=26, seed=seed + 12) - 0.5) * 0.55

    # leve afunilamento ao longo do comprimento — tábua não é perfeitamente reta
    deriva = (fbm(shape, octaves=2, freq=140, seed=seed + 13) - 0.5) * 0.35
    campo = atravessa * aneis + warp * ondulacao + deriva * comprimento * aneis * 0.10
    if fase is not None:
        # cada tábua é uma peça serrada diferente: o veio não pode atravessar
        # a junta como se fosse uma só. Deslocar a fase por ripa resolve.
        campo = campo + fase

    linhas = np.abs(np.sin(campo * np.pi))
    # anel de outono é fino e escuro; o miolo claro é largo
    linhas = linhas ** 0.30

    # poros / fibra fina, alongados no comprimento
    if vertical:
        poro = fbm((h, max(4, w // 3)), octaves=4, freq=18, seed=seed + 21)
        poro = np.repeat(poro, 3, axis=1)[:, :w]
        if poro.shape[1] < w:
            poro = np.pad(poro, ((0, 0), (0, w - poro.shape[1])), mode='edge')
    else:
        poro = fbm((max(4, h // 3), w), octaves=4, freq=18, seed=seed + 21)
        poro = np.repeat(poro, 3, axis=0)[:h, :]
        if poro.shape[0] < h:
            poro = np.pad(poro, ((0, h - poro.shape[0]), (0, 0)), mode='edge')

    return normalizar(linhas * seiva + normalizar(poro) * (1 - seiva))


def tabua(shape, seed=0, vertical=True, clara=(0.470, 0.418, 0.344),
          escura=(0.150, 0.124, 0.098), alongamento=22.0):
    g = veio(shape, seed=seed, vertical=vertical, alongamento=alongamento)
    clara, escura = np.array(clara), np.array(escura)
    return escura + (clara - escura) * g[..., None], g


def superficie_ripada(shape, seed=0, n=7, aneis=40.0):
    """Painel de ripas verticais, com fenda, bisel e tom por tábua."""
    idx, dist, junta, bisel = ripas(shape, n, seed)
    rng0 = np.random.default_rng(seed + 601)
    fase = rng0.uniform(0, 10, n)[idx]
    g = veio(shape, seed=seed, vertical=True, aneis=aneis, ondulacao=1.7, fase=fase)
    clara, escura = np.array([0.470, 0.418, 0.344]), np.array([0.150, 0.124, 0.098])
    rgb = escura + (clara - escura) * g[..., None]

    rng = np.random.default_rng(seed + 7)
    tom = rng.uniform(-0.11, 0.11, n)[idx][..., None]
    rgb = np.clip(rgb + tom, 0, 1)

    rgb *= (1 - junta * 0.90)[..., None]        # fenda funda
    rgb *= (1 + bisel * 0.16)[..., None]        # quina iluminada

    farpa = fbm(shape, octaves=2, freq=2.0, seed=seed + 33)
    rgb *= (0.92 + 0.16 * farpa)[..., None]
    return np.clip(rgb, 0, 1), dist, junta


def carbonizar(rgb, shape, mascara, seed=0, forca=1.0):
    """Carvão de madeira queimada: racha em placas, tipo couro de jacaré.
    É esse padrão que faz o queimado parecer queimado e não sujeira."""
    celulas = fbm(shape, octaves=4, freq=34, seed=seed + 200)
    rachas = 1 - limiar_suave(np.abs(celulas - 0.5), 0.022, 0.014)
    placas = normalizar(fbm(shape, octaves=4, freq=20, seed=seed + 201), 0.62, 1.05)

    # carvão é preto FOSCO. A primeira versão punha laranja demais na racha
    # e o resultado parecia lava, não madeira queimada.
    carvao = np.array([0.043, 0.036, 0.032])
    a = np.clip(mascara * forca, 0, 1)[..., None]
    saida = rgb * (1 - a) + (carvao * placas[..., None]) * a

    fundo = np.array([0.088, 0.052, 0.034])
    ar = (rachas * mascara * 0.55)[..., None]
    return np.clip(saida * (1 - ar) + fundo * ar, 0, 1)
