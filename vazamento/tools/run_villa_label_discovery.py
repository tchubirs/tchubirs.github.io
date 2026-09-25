"""Run villa's own discover_segment_labels() on the exact file names published on HF."""
import sys, types, json, re, html, urllib.request, importlib.util
from dataclasses import dataclass, field
from pathlib import Path
import tempfile

VILLA = Path("/home/user/scrollprize/villa/vesuvius/src")
# Stub only the two imports segment.py needs; the function under test is theirs, unmodified.
cfg = types.ModuleType("vesuvius.ink_detection.config"); cfg.InkDataConfig = object
typ = types.ModuleType("vesuvius.ink_detection.types")
@dataclass
class DataCfg: label_version: str | None = None
@dataclass
class Segment:
    segment_dir: Path; segment_name: str; data_config: DataCfg = field(default_factory=DataCfg)
    inklabels: Path | None = None; supervision_mask: Path | None = None; validation_mask: Path | None = None
typ.Segment = Segment
for n in ("vesuvius", "vesuvius.ink_detection"): sys.modules.setdefault(n, types.ModuleType(n))
sys.modules["vesuvius.ink_detection.config"] = cfg; sys.modules["vesuvius.ink_detection.types"] = typ
spec = importlib.util.spec_from_file_location("seg", VILLA / "vesuvius/ink_detection/data/segment.py")
seg = importlib.util.module_from_spec(spec); spec.loader.exec_module(seg)

def listing(path):
    s = urllib.request.urlopen(f"https://huggingface.co/buckets/scrollprize/datasets/tree/{path}", timeout=60).read().decode()
    out = set()
    for m in re.findall(r'data-props="([^"]+)"', s):
        try: d = json.loads(html.unescape(m))
        except Exception: continue
        def walk(o):
            if isinstance(o, dict):
                if "path" in o and "type" in o: out.add((o["type"], o["path"].split("/")[-1]))
                for v in o.values(): walk(v)
            elif isinstance(o, list):
                for v in o: walk(v)
        walk(d)
    return out

scroll = sys.argv[1]
segs = sorted(n for t, n in listing(f"ink/{scroll}") if t == "directory")
for name in segs:
    names = listing(f"ink/{scroll}/{name}")
    with tempfile.TemporaryDirectory() as t:
        d = Path(t) / name; d.mkdir()
        for typ_, n in names:
            (d / n).mkdir() if typ_ == "directory" else (d / n).touch()
        published_val = sorted(n for _, n in names if "_validation_mask" in n)
        for ext in (".zarr", ".tif"):
            try:
                r = seg.discover_segment_labels(Segment(d, name), extension=ext)
                got = {k: (getattr(r, k).name if getattr(r, k) else None) for k in ("inklabels", "supervision_mask", "validation_mask")}
            except ValueError as e:
                got = {"error": str(e).split("/")[-1][:90]}
            print(f"{scroll}/{name} [{ext}] -> {got}")
        if published_val: print(f"    published validation files: {published_val}")
