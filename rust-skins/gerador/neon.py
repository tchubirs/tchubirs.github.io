"""Ferramentas de néon.

O que faz néon parecer néon não é a cor — é o **brilho em várias escalas**:
um núcleo quase branco, um halo apertado na cor, e um clarão largo e fraco
por cima de tudo. Uma linha colorida sem essas três camadas parece adesivo.
"""
import numpy as np
from ruido import fbm, normalizar, limiar_suave


def desfoque(a, raio):
    """Borrão separável. Três passadas de média móvel ~= gaussiana,
    e roda em O(n) em vez de convolução."""
    if raio < 1:
        return a
    r = int(raio)
    out = a.astype(np.float64)
    for _ in range(3):
        for eixo in (0, 1):
            cs = np.cumsum(np.pad(out, [(r + 1, r)] * 2 if False else
                                  ([(r + 1, r), (0, 0)] if eixo == 0 else [(0, 0), (r + 1, r)]),
                                  mode='edge'), axis=eixo)
            if eixo == 0:
                out = (cs[2 * r + 1:] - cs[:-(2 * r + 1)]) / (2 * r + 1)
            else:
                out = (cs[:, 2 * r + 1:] - cs[:, :-(2 * r + 1)]) / (2 * r + 1)
    return out


def brilho(emissivo, cor, escalas=((1, 1.00), (4, 0.55), (13, 0.26), (38, 0.11))):
    """Converte um mapa 0..1 de 'onde acende' em luz RGB.

    Várias escalas somadas: perto da linha o brilho é forte e apertado,
    longe vira clarão. É essa soma que o olho lê como luz de verdade.
    """
    cor = np.asarray(cor, dtype=float)
    halo = np.zeros_like(emissivo)
    for raio, peso in escalas:
        halo += desfoque(emissivo, raio) * peso
    halo = np.clip(halo, 0, 3.2)

    luz = halo[..., None] * cor[None, None, :]
    # núcleo: onde a linha é cheia, satura para branco — é o que dá a
    # sensação de que a fonte é quente e não só colorida
    nucleo = np.clip(emissivo * 2.10 - 0.35, 0, 1)[..., None]
    return luz + nucleo * (0.55 + 0.45 * cor[None, None, :])


def circuito(shape, seed=0, n=26, passo=0.055, espessura=0.0055):
    """Trilhas ortogonais com curvas de 45°, tipo placa de circuito.

    Ortogonal puro parece grade de planilha. O chanfro de 45° na quina é
    o detalhe que faz ler como eletrônica.
    """
    h, w = shape
    rng = np.random.default_rng(seed)
    m = np.zeros(shape)
    vias = []
    yy = np.broadcast_to(np.linspace(0, 1, h)[:, None], shape)
    xx = np.broadcast_to(np.linspace(0, 1, w)[None, :], shape)

    for _ in range(n):
        x = rng.uniform(0.04, 0.96)
        y = rng.uniform(0.04, 0.96)
        vias.append((x, y))
        for _ in range(rng.integers(2, 6)):
            horiz = rng.random() < 0.5
            comp = rng.uniform(passo, passo * 4.5)
            sinal = 1 if rng.random() < 0.5 else -1
            if horiz:
                x2 = np.clip(x + sinal * comp, 0.02, 0.98)
                faixa = (np.abs(yy - y) < espessura) & \
                        (xx >= min(x, x2)) & (xx <= max(x, x2))
                x = x2
            else:
                y2 = np.clip(y + sinal * comp, 0.02, 0.98)
                faixa = (np.abs(xx - x) < espessura) & \
                        (yy >= min(y, y2)) & (yy <= max(y, y2))
                y = y2
            m[faixa] = 1.0
        vias.append((x, y))

    # vias (furos) nas pontas
    for vx, vy in vias:
        d = np.hypot(xx - vx, yy - vy)
        m = np.maximum(m, np.clip((espessura * 2.6 - d) / 0.0018 + 0.5, 0, 1))
    return np.clip(m, 0, 1)


def hexgrid(shape, escala=26.0, espessura=0.16):
    """Favo de mel. Base de fibra técnica em quase toda skin cyber."""
    h, w = shape
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], shape) * escala
    x = np.broadcast_to(np.linspace(0, 1, w)[None, :], shape) * escala * (w / h)
    # coordenadas hexagonais por dobra
    a = np.abs(((x) % 1.0) - 0.5)
    b = np.abs(((x + 0.5) % 1.0) - 0.5)
    c = np.abs(((y * 0.866) % 1.0) - 0.5)
    borda = np.minimum(np.minimum(a, b), c)
    return 1 - limiar_suave(borda, espessura * 0.5, 0.03)


def linhas_energia(shape, seed=0, n=7, largura=0.010, ondulacao=1.4,
                   horizontal=True):
    """Fitas de energia que correm no comprimento da peça.

    Erro da primeira versão: ondulação alta fechava as linhas em laço e o
    resultado virava mapa topográfico. A fita tem que **atravessar** a
    textura de ponta a ponta — numa arma, o desenho corre no eixo do cano.
    """
    h, w = shape
    y = np.broadcast_to(np.linspace(0, 1, h)[:, None], shape)
    x = np.broadcast_to(np.linspace(0, 1, w)[None, :], shape)
    atravessa, corre = (y, x) if horizontal else (x, y)

    # a deformação varia ao longo de `corre` e quase nada em `atravessa`,
    # assim a fita ondula sem nunca se fechar
    warp = np.zeros(shape)
    for k, (f, a) in enumerate(((260, 1.00), (120, 0.45), (55, 0.18))):
        oit = fbm(shape, octaves=2, freq=f, seed=seed + k) - 0.5
        warp += oit * a
    warp *= ondulacao / n

    campo = (atravessa + warp) * n
    d = np.abs(campo - np.round(campo)) / n
    return 1 - limiar_suave(d, largura * 0.5, largura * 0.40)


def conduite(shape, seed=0, n=3, largura=0.055, ondulacao=0.55):
    """Conduítes grossos: os poucos elementos que dominam a composição.

    Hierarquia é o que separa skin de papel de parede — dois ou três
    elementos grandes mandam, o resto é detalhe.
    """
    fita = linhas_energia(shape, seed=seed, n=n, largura=largura,
                          ondulacao=ondulacao, horizontal=True)
    nucleo = linhas_energia(shape, seed=seed, n=n, largura=largura * 0.26,
                            ondulacao=ondulacao, horizontal=True)
    return fita, nucleo
