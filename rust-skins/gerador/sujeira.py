"""Sujeira, fuligem e oclusão. É esta camada que separa skin aceita de
skin rejeitada — a Facepunch escreve "items should look dirty and worn"
antes de qualquer outra regra."""
import numpy as np
from ruido import fbm, normalizar, limiar_suave


def escorrido(shape, seed=0, forca=0.55, de_cima=True):
    """Água suja escorrendo. Vertical, com começos irregulares e
    comprimentos diferentes — é o que a chuva faz numa porta de verdade."""
    h, w = shape
    rng = np.random.default_rng(seed)
    col = fbm((1, w), octaves=4, freq=26, seed=seed)[0]
    col = normalizar(col)
    inicio = rng.uniform(0.0, 0.35, w)
    comp = 0.25 + col * 0.75

    y = np.linspace(0, 1, h)[:, None]
    if not de_cima:
        y = 1 - y
    perfil = np.clip((y - inicio[None, :]) / comp[None, :], 0, 1)
    perfil = (1 - perfil) ** 2.1
    perfil *= limiar_suave(col, 0.42, 0.14)[None, :]

    quebra = fbm(shape, octaves=4, freq=30, seed=seed + 5)
    return np.clip(perfil * normalizar(quebra, 0.35, 1.0) * forca, 0, 1)


def oclusao(shape, margem=0.16, forca=0.75):
    """Escurece as bordas da textura. No modelo 3D essas áreas caem em
    quina e recebem menos luz — sem isso a peça fica 'chapada'."""
    h, w = shape
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], (h, w))
    x = np.broadcast_to(np.linspace(0, 1, w)[None, :], (h, w))
    d = np.minimum(np.minimum(y, 1 - y), np.minimum(x, 1 - x)) / margem
    return 1 - (1 - np.clip(d, 0, 1) ** 0.75) * forca


def fuligem(rgb, shape, seed=0, altura=0.42, forca=0.86):
    """Queimado subindo da base. Carvão não é preto puro — é marrom
    muito escuro e come o contraste do que está embaixo."""
    h, w = shape
    y = np.linspace(0, 1, h)[:, None]
    lingua = fbm((1, w), octaves=4, freq=18, seed=seed + 12)[0]
    lingua = normalizar(lingua, 0.55, 1.45)[None, :]

    campo = np.clip(1 - (1 - y) / (altura * lingua), 0, 1)
    borda = fbm(shape, octaves=5, freq=34, seed=seed + 13)
    campo = limiar_suave(campo * 0.72 + normalizar(borda) * 0.28, 0.42, 0.13)

    carvao = np.array([0.055, 0.042, 0.036])
    a = (campo * forca)[..., None]
    out = rgb * (1 - a) + carvao[None, None, :] * a

    # brasa: pontinhos quentes onde o carvão rachou
    rach = fbm(shape, octaves=6, freq=110, seed=seed + 14)
    brasa = limiar_suave(rach, 0.80, 0.02) * campo
    out += brasa[..., None] * np.array([0.26, 0.075, 0.012])[None, None, :]
    return np.clip(out, 0, 1)


def poeira(rgb, shape, seed=0, forca=0.30):
    sujo = fbm(shape, octaves=5, freq=44, seed=seed + 21)
    a = (normalizar(sujo) * forca)[..., None]
    terra = np.array([0.238, 0.205, 0.156])
    return np.clip(rgb * (1 - a) + terra[None, None, :] * a, 0, 1)


def acabamento(rgb, saturacao=0.80, contraste=1.06, preto=0.018):
    """Paleta do Rust: dessaturada e sem preto puro. Skin colorida demais
    é a razão nº 1 de recusa citada na wiki."""
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    rgb = lum[..., None] + (rgb - lum[..., None]) * saturacao
    rgb = (rgb - 0.5) * contraste + 0.5
    rgb = preto + rgb * (1 - preto)
    return np.clip(rgb, 0, 1)
