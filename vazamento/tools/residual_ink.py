import sys
from pathlib import Path
import numpy as np, tifffile
sys.path.insert(0, "/home/user/tchubirs.github.io/vazamento/src")
import overlap
def load(d, sup, val, ink, which):
    x, y, z = (tifffile.imread(d / f"{c}.tif") for c in "xyz"); H, W = x.shape
    def g(f):
        a = tifffile.imread(f); fy, fx = a.shape[0] / H, a.shape[1] / W
        yy = np.minimum((np.arange(H) * fy + fy / 2).astype(int), a.shape[0] - 1)
        xx = np.minimum((np.arange(W) * fx + fx / 2).astype(int), a.shape[1] - 1)
        return a[np.ix_(yy, xx)] > 0
    s, v, k = g(sup), g(val), g(ink)
    region = v if which == "val" else (s & ~v)
    keep = (x > 0) & (y > 0) & (z > 0) & region
    return np.stack([x[keep], y[keep], z[keep]], 1), k[keep]
A = Path("lf16/w028_20251208130119156_2um"); B = Path("lf16/w029_20251212185248662_2um")
pb, ib = load(B, B/"w029_20251212185248662_supervision_mask_v2.tif", B/"w029_20251212185248662_validation_mask_v2.tif", B/"w029_20251212185248662_inklabels_v2.tif", "val")
key = lambda q: (q[:, 0] << 42) ^ (q[:, 1] << 21) ^ q[:, 2]
for tag, sup, val in (("before", "w028_20251208130119156_supervision_mask_v2.tif", "w028_20251208130119156_validation_mask_v2.tif"),
                      ("after ", "w028_20251208130119156_2um_supervision_mask_v3.tif", "w028_20251208130119156_2um_validation_mask_v3.tif")):
    pa, ia = load(A, A/sup, A/val, A/"w028_20251208130119156_inklabels_v2.tif", "train")
    for cell in (8.0, 16.0, 32.0):
        ka = key(np.floor(pa / cell).astype(np.int64)); o = np.argsort(ka); kas = ka[o]
        kb = key(np.floor(pb / cell).astype(np.int64)); pos = np.minimum(np.searchsorted(kas, kb), len(kas) - 1); hit = kas[pos] == kb
        lb, la = ib[hit], ia[o[pos[hit]]]; n = int(hit.sum())
        if n == 0:
            print(f"{tag} cell {cell:>4}: no shared cells"); continue
        cb, ca = lb.mean(), la.mean(); chance = ca * cb + (1 - ca) * (1 - cb)
        print(f"{tag} cell {cell:>4}: {n:>5} shared cells  agreement {(la == lb).mean():.3f}  chance {chance:.3f}  ink IoU {(la & lb).sum() / max((la | lb).sum(), 1):.3f}")
