#!/usr/bin/env python3
"""Mede o que aconteceu ao grupo de tokens fixado em dados/coorte.json.

Estudo prospectivo: o grupo é fixado ANTES de se saber o desfecho, e mede-se
depois. É a única forma de não cair no viés que estraga tudo o que se lê sobre
este mercado — quem publica resultados publica os que sobreviveram, e a
listagem dos que morreram no primeiro minuto não existe em lado nenhum.
"""
import json, time, urllib.request, urllib.error, datetime as dt, statistics as st, sys, pathlib

BASE = "https://api.geckoterminal.com/api/v2/networks/solana"
AQUI = pathlib.Path(__file__).parent


def pega(u, tent=5):
    espera = 3
    for _ in range(tent):
        try:
            r = urllib.request.Request(u, headers={"Accept": "application/json",
                                                   "User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(r, timeout=30) as f:
                return json.loads(f.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return "sumiu"          # a piscina deixou de existir
            if e.code != 429:
                return None
            time.sleep(espera); espera *= 2
        except Exception:
            time.sleep(espera)
    return None


def main():
    c = json.load(open(AQUI / "dados" / "coorte.json"))
    linhas, sumidos, falhas = [], 0, 0

    for i, t in enumerate(c["tokens"]):
        d = pega(f"{BASE}/pools/{t['endereco']}")
        time.sleep(2.6)
        if d == "sumiu":
            sumidos += 1
            linhas.append({**t, "desfecho": "sumiu", "retorno": 0.0})
            continue
        if not d:
            falhas += 1
            continue
        a = d.get("data", {}).get("attributes", {})
        preco = float(a.get("base_token_price_usd") or 0)
        liq = float(a.get("reserve_in_usd") or 0)
        linhas.append({
            **t,
            "desfecho": "vivo",
            "precoAgora": preco,
            "liquidezAgora": liq,
            "retorno": (preco / t["precoEntrada"]) if preco > 0 else 0.0,
            "vol24hAgora": float((a.get("volume_usd") or {}).get("h24") or 0),
        })
        if (i + 1) % 20 == 0:
            print(f"  … {i+1}/{len(c['tokens'])}", file=sys.stderr)

    rets = sorted(x["retorno"] for x in linhas)
    n = len(rets)
    if not n:
        print("nenhuma medida"); return

    def pct(p): return rets[min(n - 1, int(n * p))]
    resumo = {
        "fixadoEm": c["fixadoEm"],
        "medidoEm": dt.datetime.now(dt.timezone.utc).isoformat(),
        "horasDepois": round((dt.datetime.now(dt.timezone.utc)
                              - dt.datetime.fromisoformat(c["fixadoEm"])).total_seconds() / 3600, 2),
        "fixados": c["quantos"], "medidos": n, "sumiram": sumidos, "falharam": falhas,
        "retornoMediano": round(st.median(rets), 4),
        "retornoMedio": round(st.fmean(rets), 4),
        "p10": round(pct(0.10), 4), "p25": round(pct(0.25), 4),
        "p75": round(pct(0.75), 4), "p90": round(pct(0.90), 4),
        "melhor": round(rets[-1], 4),
        "abaixoDaEntrada": sum(1 for r in rets if r < 1),
        "perdeu90ouMais": sum(1 for r in rets if r <= 0.10),
        "dobrou": sum(1 for r in rets if r >= 2),
        "fez10x": sum(1 for r in rets if r >= 10),
        # Comprar todos em partes iguais: é a média, não a mediana.
        "carteiraIgualitaria": round(st.fmean(rets), 4),
    }
    json.dump({"resumo": resumo, "tokens": linhas},
              open(AQUI / "dados" / "resultado.json", "w"), indent=1)

    print(json.dumps(resumo, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
