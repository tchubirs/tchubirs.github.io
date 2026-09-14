import json, time, urllib.request, urllib.error, datetime as dt, sys

BASE = "https://api.geckoterminal.com/api/v2/networks/solana"

def pega(u, tent=5):
    espera = 3
    for _ in range(tent):
        try:
            r = urllib.request.Request(u, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(r, timeout=30) as f:
                return json.loads(f.read())
        except urllib.error.HTTPError as e:
            if e.code != 429: return None
            time.sleep(espera); espera *= 2
        except Exception:
            time.sleep(espera)
    return None

agora = dt.datetime.now(dt.timezone.utc)
coorte, vistos = [], set()
for p in range(1, 11):
    d = pega(f"{BASE}/new_pools?page={p}")
    if not d:
        print(f"  pagina {p}: falhou", file=sys.stderr); time.sleep(4); continue
    for x in d.get("data", []):
        end = x["id"].split("_")[-1]
        if end in vistos: continue
        vistos.add(end)
        a = x["attributes"]
        preco = a.get("base_token_price_usd")
        if not preco or float(preco) <= 0: continue
        coorte.append({
            "endereco": end,
            "nome": a.get("name", "?"),
            "criada_em": a.get("pool_created_at"),
            "precoEntrada": float(preco),
            "liquidezEntrada": float(a.get("reserve_in_usd") or 0),
            "vol24hEntrada": float((a.get("volume_usd") or {}).get("h24") or 0),
        })
    time.sleep(4)

saida = {
    "fixadoEm": agora.isoformat(),
    "rede": "solana",
    "fonte": "geckoterminal new_pools, paginas 1-10",
    "quantos": len(coorte),
    "tokens": coorte,
}
json.dump(saida, open("/home/user/tchubirs.github.io/estudo-memecoin/dados/coorte.json", "w"), indent=1)
idades = [(agora - dt.datetime.fromisoformat(t["criada_em"].replace("Z", "+00:00"))).total_seconds()/60
          for t in coorte if t.get("criada_em")]
print(f"fixados {len(coorte)} tokens")
if idades: print(f"idade a fixar: {min(idades):.0f}–{max(idades):.0f} min")
