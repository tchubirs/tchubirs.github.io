# Le o audio.bundle do Rust (so leitura, nada e escrito na pasta do jogo) e grava em POVIX_AUDIO/rust-sons os WAV de explosoes e tiros, com _categorias.csv.
# Precisa de: pip install UnityPy numpy. Uso: POVIX_AUDIO=<pasta> python -I 1-extrair-rust.py
import UnityPy, re, csv, sys, wave, numpy as np, os
D = os.environ.get("POVIX_AUDIO") or os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, "rust-sons")
p = r"C:\Program Files (x86)\Steam\steamapps\common\Rust\Bundles\shared\audio.bundle"
EXP = re.compile(r"(explosion|explode|c4-explosion|explosive-ammo|landmine|survey-charge)", re.I)
EXP_NO = re.compile(r"(firework|bee-grenade|flashbang|underwater|splash|debris|torpedo|satellite|attack-helicopter-explosion-debris|dryfire|deploy|reload|storage|rpg_explode_fire|fleeExplosive)", re.I)
VEIC = re.compile(r"(helicopter|bradley|minicopter|workcart)", re.I)
TIRO = re.compile(r"(gunshot-(body|tail|mech|LFE)|-attack(-distant|-far-distant|-silenced|-new|-heavy|-really-distant)?$|^(bow|crossbow|compound-bow|mini-crossbow)-attack|^extra-gunshot|cannon-fire-body|rocket-launcher-.*fire|rocket-launch|launcher_fire|^rocket$|helicopter-machine-gun-single)", re.I)
TIRO_NO = re.compile(r"(water|paintball|snowball|nailgun|toolgun|dryfire|deploy|reload|bolt-action|trap|bowless|dragon|speargun|tiger|confetti|attack-helicopter-rocket|homing-missile-launcher-attack-mech|mlrs|torpedo|f15e|NPCVoice|acoustic|jerrycan|piano|bass|trumpet|tuba)", re.I)
def cat(n):
    base = re.sub(r"[-_]?\d+$", "", n)
    if EXP.search(n) and not EXP_NO.search(n.replace("explosion-distant","explosion").replace("explosion-really-distant","explosion")): 
        return "explosao-veiculo" if VEIC.search(n) else "explosao"
    if re.fullmatch(r"(explosion|explode|rocket_explosion|rocket_explosion-distant|rocket_explosion-really-distant|explosion-distant|explosion_far|explosive-ammo-(close|distant))", base): return "explosao"
    if TIRO.search(base) and not TIRO_NO.search(base): return "tiro"
    if re.fullmatch(r"(impact|metal-impact|hit)[-_a-z]*", base) : return "impacto"
    return None
env = UnityPy.load(p)
rows = []; falhas = []
for o in env.objects:
    if o.type.name != "AudioClip": continue
    d = o.read()
    c = cat(d.m_Name)
    if not c: continue
    try:
        s = d.samples  # dict nome->bytes wav
    except Exception as e:
        falhas.append((d.m_Name, repr(e)[:200])); continue
    for k, b in s.items():
        fn = f"{d.m_Name}.wav" if len(s)==1 else f"{d.m_Name}_{k}.wav"
        fn = re.sub(r"[^\w.\-]", "_", fn)
        if not fn.endswith(".wav"): fn += ".wav"
        open(os.path.join(OUT, fn), "wb").write(b)
        rows.append((fn, d.m_Name, c, round(d.m_Length,2)))
with open(os.path.join(OUT, "_categorias.csv"), "w", newline="", encoding="utf8") as f:
    w = csv.writer(f); w.writerow(["arquivo","clip","categoria","duracao"]); w.writerows(rows)
from collections import Counter
print(Counter(r[2] for r in rows)); print("falhas", len(falhas)); print(falhas[:5])

# Limpeza: tira o que o filtro por nome deixou passar (golpes de corpo a corpo, sons de fusivel e gatilho).
import shutil
GUNS = set("extra semi mp5 m92 thompson m249 lr300 sawnoff revolver bolt m39 pt l96 spas12 eoka ak47 custom hmlmg m16 python double sks hc t1 glock m4 minigun blunderbuss homing mini cannon rocket salvaged smg glass ak74u m15 sar krieg bow crossbow compound launcher_fire".split())
rows = list(csv.DictReader(open(os.path.join(OUT, "_categorias.csv"), encoding="utf8"))); bons = []
for x in rows:
    first = re.sub(r"[-_]?\d+$", "", x["clip"]).split("-")[0]
    ruim = (x["categoria"] == "tiro" and (first not in GUNS or re.search(r"^(diver|industrial|bradley|helicopter)", x["clip"]))) \
        or re.search(r"landmine-trigger|fuse-loop|survey-charge-stick", x["clip"])
    if ruim: os.remove(os.path.join(OUT, x["arquivo"]))
    else: bons.append(x)
w = csv.DictWriter(open(os.path.join(OUT, "_categorias.csv"), "w", newline="", encoding="utf8"), fieldnames=rows[0].keys()); w.writeheader(); w.writerows(bons)
print("depois da limpeza:", Counter(x["categoria"] for x in bons))
