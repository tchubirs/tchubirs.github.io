import sys, types, importlib.util
from dataclasses import dataclass, field
from pathlib import Path
import numpy as np, tifffile
sys.path.insert(0, "/home/user/tchubirs.github.io/vazamento/src")
import overlap, leakfree

root = Path("lf8"); a = root / "w028_20251208130119156_2um"; b = root / "w029_20251212185248662_2um"

# 1. The new supervision differs from the old one only by pixels switched off.
old = tifffile.imread(a / "w028_20251208130119156_supervision_mask_v2.tif")
new = tifffile.imread(a / "w028_20251208130119156_2um_supervision_mask_v3.tif")
print("1. same shape:", old.shape == new.shape, "| pixels turned on:", int(((new > 0) & (old == 0)).sum()),
      "| pixels turned off:", int(((new == 0) & (old > 0)).sum()), "| values:", sorted(np.unique(new).tolist()))

# 2. villa's own discover_segment_labels(), unmodified, on the written directory.
cfg = types.ModuleType("vesuvius.ink_detection.config"); cfg.InkDataConfig = object
typ = types.ModuleType("vesuvius.ink_detection.types")
@dataclass
class DataCfg: label_version: str | None = None
@dataclass
class Seg:
    segment_dir: Path; segment_name: str; data_config: DataCfg = field(default_factory=DataCfg)
    inklabels: Path | None = None; supervision_mask: Path | None = None; validation_mask: Path | None = None
typ.Segment = Seg
for n in ("vesuvius", "vesuvius.ink_detection"): sys.modules.setdefault(n, types.ModuleType(n))
sys.modules["vesuvius.ink_detection.config"] = cfg; sys.modules["vesuvius.ink_detection.types"] = typ
spec = importlib.util.spec_from_file_location("seg", "/home/user/scrollprize/villa/vesuvius/src/vesuvius/ink_detection/data/segment.py")
seg = importlib.util.module_from_spec(spec); spec.loader.exec_module(seg)
r = seg.discover_segment_labels(Seg(a, a.name), extension=".tif")
print("2. villa loader picks:", r.inklabels.name, "|", r.supervision_mask.name, "|", r.validation_mask.name)

# 3. Residual: w029's validation against w028's training, before (v2) and after (v3).
def train_points(d, sup_file, val_file):
    x, y, z = (tifffile.imread(d / f"{c}.tif") for c in "xyz"); valid = (x > 0) & (y > 0) & (z > 0)
    sup = overlap.block_any(tifffile.imread(sup_file) > 0, x.shape); val = overlap.block_any(tifffile.imread(val_file) > 0, x.shape)
    keep = valid & sup & ~val
    return np.stack([x[keep], y[keep], z[keep]], 1)
wb = leakfree.load(b); vb = wb.xyz[wb.validation]
before = train_points(a, a / "w028_20251208130119156_supervision_mask_v2.tif", a / "w028_20251208130119156_validation_mask_v2.tif")
after = train_points(a, a / "w028_20251208130119156_2um_supervision_mask_v3.tif", a / "w028_20251208130119156_2um_validation_mask_v3.tif")
print("3. share of w029's validation lying on w028's training")
print("   vx:      " + "  ".join(f"{c:>6}" for c in (4, 8, 16, 32)))
for label, pts in (("before", before), ("after ", after)):
    print(f"   {label}:  " + "  ".join(f"{overlap.covered_fraction(vb, pts, c):6.3f}" for c in (4, 8, 16, 32)))
print("   training cells before/after:", len(before), len(after))
