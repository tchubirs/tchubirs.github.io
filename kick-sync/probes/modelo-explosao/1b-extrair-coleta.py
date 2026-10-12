# Sons de coleta do Rust (machado, picareta, pedra, árvore, minério) do audio.bundle, só leitura, em POVIX_AUDIO/rust-sons
# com categoria "coleta" no _categorias.csv. Servem de NEGATIVO do tiro: golpe ritmado de ferramenta não é tiroteio.
# Uso: POVIX_AUDIO=<pasta> python -I 1b-extrair-coleta.py
import UnityPy, re, csv, os
D = os.environ.get("POVIX_AUDIO") or os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, "rust-sons")
p = r"C:\Program Files (x86)\Steam\steamapps\common\Rust\Bundles\shared\audio.bundle"
COLETA = re.compile(r"^(hatchet-(stone-)?strike|rock-(strike|impact)|pickaxe-strike|salvaged-(axe|icepick|hammer)-strike|concrete-axe-impact|lumberjack-axe-impact|tree-(impact|bonus-damage|crack-(med|small))|tree_(crack|impact_short)|strike_(rock|wood)|pick-rock|ore-break|rock_break|wood_break|hammer_impact_wood|phys-impact-(stone|wood)|chainsaw-hit-(wood|stone)|hit_wood|stone_gib|wood_gib)[-_]?\d*$", re.I)
env = UnityPy.load(p); novas = []
for o in env.objects:
    if o.type.name != "AudioClip": continue
    d = o.read()
    if not COLETA.match(d.m_Name): continue
    for k, b in d.samples.items():
        fn = re.sub(r"[^\w.\-]", "_", f"{d.m_Name}.wav" if len(d.samples) == 1 else f"{d.m_Name}_{k}.wav")
        open(os.path.join(OUT, fn), "wb").write(b); novas.append((fn, d.m_Name, "coleta", round(d.m_Length, 2)))
csvp = os.path.join(OUT, "_categorias.csv")
antigas = [r for r in csv.reader(open(csvp, encoding="utf8"))][1:]
antigas = [r for r in antigas if r[2] != "coleta"]
with open(csvp, "w", newline="", encoding="utf8") as f:
    w = csv.writer(f); w.writerow(["arquivo", "clip", "categoria", "duracao"]); w.writerows(antigas + novas)
print(len(novas), "sons de coleta")
