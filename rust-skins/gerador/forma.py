"""Formas em máscara. Tudo com distância assinada, para a borda sair
com anti-serrilhado de verdade em vez de escada de pixel."""
import numpy as np


def grade(shape):
    h, w = shape
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], (h, w))
    x = np.broadcast_to(np.linspace(0, 1, w)[None, :], (h, w))
    return x, y


def barra(shape, p0, p1, espessura, suave=0.004, aspecto=1.0):
    """Barra de p0 a p1. `aspecto` corrige a distorção quando a textura
    não é quadrada no modelo."""
    x, y = grade(shape)
    x = x * aspecto
    ax, ay = p0[0] * aspecto, p0[1]
    bx, by = p1[0] * aspecto, p1[1]
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy + 1e-12
    t = np.clip(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1)
    d = np.hypot(x - (ax + t * dx), y - (ay + t * dy))
    return np.clip((espessura / 2 - d) / suave + 0.5, 0, 1)


def retangulo(shape, x0, y0, x1, y1, suave=0.004):
    x, y = grade(shape)
    dx = np.minimum(x - x0, x1 - x)
    dy = np.minimum(y - y0, y1 - y)
    d = np.minimum(dx, dy)
    return np.clip(d / suave + 0.5, 0, 1)


def rebites(shape, pontos, raio=0.010, suave=0.0025, aspecto=1.0):
    """Cabeças de prego. Devolve (mascara, relevo).

    `relevo` vai de -1 a +1 e diz de que lado da cabeça a luz bate. Sem ele
    o prego vira uma bolinha escura chapada — foi assim na primeira versão,
    e era o detalhe mais falso da imagem inteira.
    """
    x, y = grade(shape)
    x = x * aspecto
    masc = np.zeros(shape)
    rel = np.zeros(shape)
    for px, py in pontos:
        dx = x - px * aspecto
        dy = y - py
        d = np.hypot(dx, dy)
        m = np.clip((raio - d) / suave + 0.5, 0, 1)
        # normal aproximada da calota, projetada na direção da luz
        # (luz vindo de cima à esquerda, como no ambiente do Rust)
        alt = np.sqrt(np.clip(1 - (d / max(raio, 1e-6)) ** 2, 0, 1))
        lum = (-dx - dy) / max(raio, 1e-6) * 0.55 + alt * 0.45
        rel = np.where(m > masc, np.clip(lum, -1, 1), rel)
        masc = np.maximum(masc, m)
    return masc, rel
