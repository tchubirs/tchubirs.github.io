#!/usr/bin/env python3
"""Skin: Porta Carbonizada — Wood Double Door.

Item escolhido por medição: só 16 skins existem (a Facepunch pede
explicitamente que se mire em itens com poucas skins) e é o de maior
faturamento mediano da lista de alvos, US$82.901 bruto na loja.

Desenho, contra as regras publicadas da wiki:
  "items should look dirty and worn"  -> a peça inteira é fogo e ferrugem
  "keep the design within the tier"   -> madeira segue madeira; o ferro é
                                         cinta de reforço, não blindagem
  "adding words... reduces the likelihood" -> zero texto
  "we don't need 100 camo varieties"  -> não é camuflagem
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image
from ruido import fbm, normalizar, limiar_suave
import madeira, sujeira, forma

LADO = 1024
SEMENTE = 20260827


def ferro(shape, mascara, seed, rgb):
    """Cinta de ferro forjado: escura, irregular, comida de ferrugem."""
    grao = fbm(shape, octaves=5, freq=55, seed=seed + 300)
    martelo = fbm(shape, octaves=4, freq=95, seed=seed + 301)
    # ferro forjado: escuro, com marca de martelo, longe de cinza uniforme
    metal = np.array([0.072, 0.066, 0.064]) + \
            np.array([0.145, 0.128, 0.118]) * normalizar(grao * .55 + martelo * .45)[..., None]

    # ferrugem em placas irregulares, com dois tons — corrosão nunca é
    # uma cor só, e laranja chapado é a marca de skin amadora
    corrosao = normalizar(fbm(shape, octaves=5, freq=42, seed=seed + 302))
    fina = normalizar(fbm(shape, octaves=6, freq=16, seed=seed + 303))
    placa = limiar_suave(corrosao, 0.56, 0.09)
    crosta = limiar_suave(corrosao * .6 + fina * .4, 0.66, 0.05)
    metal = metal * (1 - (placa * 0.72)[..., None]) + \
            np.array([0.245, 0.113, 0.046]) * (placa * 0.72)[..., None]
    metal = metal * (1 - (crosta * 0.55)[..., None]) + \
            np.array([0.372, 0.196, 0.078]) * (crosta * 0.55)[..., None]

    a = mascara[..., None]
    saida = rgb * (1 - a) + metal * a

    # sombra da cinta caindo na madeira
    nucleo = np.clip(mascara * 5 - 4, 0, 1)
    saida *= (1 - (mascara - nucleo) * 0.35)[..., None]
    return np.clip(saida, 0, 1)


def uma_folha(shape, seed):
    h, w = shape
    rgb, dist, junta = madeira.superficie_ripada(shape, seed=seed, n=7, aneis=26.0)

    # ---- fogo subindo da base ----
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], shape)
    lingua = normalizar(fbm((1, w), octaves=4, freq=14, seed=seed + 12)[0], 0.62, 1.42)[None, :]
    frente = np.clip(1 - (1 - y) / (0.50 * lingua), 0, 1)
    ruido_b = normalizar(fbm(shape, octaves=5, freq=30, seed=seed + 13))
    queima = limiar_suave(frente * 0.74 + ruido_b * 0.26, 0.44, 0.16)
    rgb = madeira.carbonizar(rgb, shape, queima, seed=seed, forca=0.92)

    # borda da queimada: madeira tostada, ainda não carvão
    borda = np.clip(queima * (1 - queima) * 4, 0, 1)
    rgb = np.clip(rgb * (1 - borda[..., None] * 0.55) +
                  np.array([0.205, 0.108, 0.052]) * (borda * 0.55)[..., None], 0, 1)

    # a fenda entre ripas some sob o carvão, mas volta em cima
    rgb *= (1 - junta * (1 - queima) * 0.55)[..., None]

    # ---- cintas de ferro ----
    cinta = np.zeros(shape)
    cinta = np.maximum(cinta, forma.retangulo(shape, -0.05, 0.115, 1.05, 0.185, suave=0.003))
    cinta = np.maximum(cinta, forma.retangulo(shape, -0.05, 0.760, 1.05, 0.830, suave=0.003))
    rgb = ferro(shape, cinta, seed, rgb)

    pontos = [(0.10, 0.150), (0.345, 0.150), (0.635, 0.150), (0.90, 0.150),
              (0.10, 0.795), (0.345, 0.795), (0.635, 0.795), (0.90, 0.795)]
    pr, rel = forma.rebites(shape, pontos, raio=0.019, suave=0.0035)
    cab = np.array([0.150, 0.132, 0.122])
    # a calota pega luz em cima à esquerda e cai em sombra embaixo à direita
    cabeca = np.clip(cab[None, None, :] * (1 + rel[..., None] * 1.35), 0, 1)
    rgb = rgb * (1 - pr[..., None]) + cabeca * pr[..., None]

    # sombra projetada no metal, deslocada para o lado oposto da luz
    sombra, _ = forma.rebites(shape, [(px + 0.006, py + 0.008) for px, py in pontos],
                              raio=0.019, suave=0.0035)
    rgb *= (1 - np.clip(sombra - pr, 0, 1)[..., None] * 0.55)

    # ---- ferrugem escorrendo das cintas e dos pregos ----
    esc = sujeira.escorrido(shape, seed=seed + 3, forca=0.34)
    esc *= (1 - queima * 0.7)          # não escorre sobre carvão seco
    ocre = np.array([0.298, 0.140, 0.055])
    rgb = np.clip(rgb * (1 - esc[..., None] * 0.45) + ocre * (esc * 0.45)[..., None], 0, 1)

    rgb = sujeira.poeira(rgb, shape, seed=seed, forca=0.20)
    rgb *= sujeira.oclusao(shape, margem=0.09, forca=0.58)[..., None]
    return rgb


def gerar():
    sh = (LADO, LADO // 2)
    folha = np.concatenate([uma_folha(sh, SEMENTE), uma_folha(sh, SEMENTE + 1)], axis=1)

    x = np.linspace(0, 1, LADO)[None, :]
    vinco = np.exp(-((x - 0.5) ** 2) / (2 * 0.0030 ** 2))
    folha *= (1 - vinco * 0.82)[..., None]

    return (np.clip(sujeira.acabamento(folha, saturacao=0.82, contraste=1.10),
                    0, 1) * 255).astype(np.uint8)


if __name__ == '__main__':
    saida = sys.argv[1] if len(sys.argv) > 1 else 'porta.png'
    img = Image.fromarray(gerar(), 'RGB')
    img.save(saida, 'PNG', optimize=True)
    print(f"{saida}  {img.size[0]}x{img.size[1]}  {os.path.getsize(saida)//1024} KB")
