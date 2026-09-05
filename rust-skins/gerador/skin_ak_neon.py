#!/usr/bin/env python3
"""Skin: AK-47 SOBRECARGA — néon / cyber.

Referência de régua: as AK aceitas com brilho (AK From Hell, Midnight Dream,
X-RAY, Alien Red) e as coloridas recentes. O padrão que se repete nelas é
sempre o mesmo: **corpo escuro + traço aceso que acompanha a peça + halo**.

Néon não é cor forte. É base preta, núcleo quase branco e halo em três
escalas. Cor forte sobre cinza dá plástico; é o erro nº 1 de skin cyber.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image
from ruido import fbm, normalizar, limiar_suave
import neon, sujeira

LADO = 1024
SEMENTE = 4707

CIANO = (0.16, 0.94, 1.00)
MAGENTA = (1.00, 0.13, 0.62)
ROXO = (0.52, 0.20, 1.00)


def base_carbono(shape, seed):
    """Fibra de carbono escura com leve varredura de cor. O gradiente
    impede que a peça vire um retângulo preto morto."""
    h, w = shape
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], shape)
    x = np.broadcast_to(np.linspace(0, 1, w)[None, :], shape)

    hexa = neon.hexgrid(shape, escala=40.0, espessura=0.10)
    fibra = fbm(shape, octaves=4, freq=60, seed=seed + 5)
    val = 0.030 + hexa * 0.030 + normalizar(fibra) * 0.022

    # varredura diagonal magenta -> roxo -> ciano, bem fraca
    t = np.clip((x * 0.72 + y * 0.28), 0, 1)
    c1, c2, c3 = np.array(MAGENTA), np.array(ROXO), np.array(CIANO)
    lo = c1[None, None, :] + (c2 - c1)[None, None, :] * np.clip(t * 2, 0, 1)[..., None]
    hi = c2[None, None, :] + (c3 - c2)[None, None, :] * np.clip(t * 2 - 1, 0, 1)[..., None]
    ramp = np.where((t < 0.5)[..., None], lo, hi)

    return val[..., None] * (0.35 + 0.65 * ramp)


def paineis(shape, seed):
    """Linhas de painel: cortes retos que dividem a superfície em placas.
    Sem elas a arma parece pintada; com elas parece montada."""
    h, w = shape
    rng = np.random.default_rng(seed + 40)
    m = np.zeros(shape)
    x = np.broadcast_to(np.linspace(0, 1, w)[None, :], shape)
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], shape)
    for _ in range(9):
        if rng.random() < 0.55:
            p = rng.uniform(0.06, 0.94)
            m = np.maximum(m, 1 - limiar_suave(np.abs(x - p), 0.0016, 0.0011))
        else:
            p = rng.uniform(0.06, 0.94)
            m = np.maximum(m, 1 - limiar_suave(np.abs(y - p), 0.0016, 0.0011))
    return m


def gerar():
    sh = (LADO, LADO)
    rgb = base_carbono(sh, SEMENTE)

    # sulco dos painéis
    pn = paineis(sh, SEMENTE)
    rgb *= (1 - pn * 0.60)[..., None]

    # ================= HIERARQUIA =================
    # A primeira versão pôs tudo no mesmo peso e virou papel de parede.
    # Agora: 3 conduítes mandam, o circuito é apoio, os fios são tempero.

    # 1º plano — conduítes de plasma, ciano, com núcleo branco
    fita, nucleo = neon.conduite(sh, seed=SEMENTE, n=3, largura=0.034,
                                 ondulacao=0.55)
    # calha escura sob o conduíte: dá a impressão de canal rebaixado
    rgb *= (1 - neon.desfoque(fita, 7) * 0.60)[..., None]
    rgb += neon.brilho(fita * 0.85, CIANO) * 0.80
    rgb += neon.brilho(nucleo, (1.0, 1.0, 1.0)) * 1.15

    # 2º plano — circuito magenta, esparso, só onde o conduíte não está
    circ = neon.circuito(sh, seed=SEMENTE, n=13, passo=0.05, espessura=0.0040)
    circ *= (1 - np.clip(neon.desfoque(fita, 10) * 2.6, 0, 1))
    pulso = normalizar(fbm(sh, octaves=4, freq=40, seed=SEMENTE + 60), 0.35, 1.0)
    rgb += neon.brilho(circ * pulso, MAGENTA) * 1.05

    # 3º plano — filamentos roxos finos
    fios = neon.linhas_energia(sh, seed=SEMENTE + 9, n=17, largura=0.0035,
                               ondulacao=0.9, horizontal=True)
    fade = normalizar(fbm(sh, octaves=3, freq=55, seed=SEMENTE + 61), 0.10, 1.0)
    rgb += neon.brilho(fios * fade * 0.55, ROXO) * 0.42

    # ================= ACABAMENTO =================
    # arranhões que pegam a luz do conduíte
    # arranhão é LINHA, não ponto. Com ruído isotrópico saiu chuvisco;
    # a forma certa é reaproveitar as fitas, bem finas e esparsas.
    risco = neon.linhas_energia(sh, seed=SEMENTE + 80, n=54, largura=0.0016,
                                ondulacao=1.5, horizontal=True)
    risco *= limiar_suave(fbm(sh, octaves=3, freq=60, seed=SEMENTE + 82), 0.62, 0.12)
    rgb += risco[..., None] * np.array((0.72, 0.86, 0.95))[None, None, :] * 0.30

    poeira = normalizar(fbm(sh, octaves=5, freq=30, seed=SEMENTE + 81))
    rgb *= (0.88 + 0.18 * poeira)[..., None]

    rgb *= sujeira.oclusao(sh, margem=0.13, forca=0.50)[..., None]
    rgb[..., 0] = np.roll(rgb[..., 0], 2, axis=1)
    rgb[..., 2] = np.roll(rgb[..., 2], -2, axis=1)

    # compressão de alta luz: satura suave em vez de estourar chapado
    rgb = rgb / (1.0 + rgb * 0.48)
    rgb = np.clip(rgb * 1.55, 0, 1)
    return (rgb * 255).astype(np.uint8)


if __name__ == '__main__':
    saida = sys.argv[1] if len(sys.argv) > 1 else 'ak_neon.png'
    img = Image.fromarray(gerar(), 'RGB')
    img.save(saida, 'PNG', optimize=True)
    print(f"{saida}  {img.size[0]}x{img.size[1]}  {os.path.getsize(saida)//1024} KB")
