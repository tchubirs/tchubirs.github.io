"""Spatial overlap between labelled regions of tifxyz segments.

Two ink-labelled segments that trace the same piece of papyrus share labels:
a model trained on one and evaluated on the other is scored on text it has
already seen. This measures how much of each segment's supervised area lies
on top of another segment's supervised area, at several distance tolerances,
using only the segments' own x/y/z grids and supervision masks.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import tifffile

OFFSETS = np.array([(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1)])


@dataclass
class Segment:
    name: str
    points: np.ndarray   # (N, 3) float32, supervised + valid only
    n_valid: int         # valid grid cells, supervised or not


def block_any(mask: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """Reduce a high-resolution mask to `shape` by 'any pixel set in the block'."""
    h, w = shape
    fy, fx = mask.shape[0] / h, mask.shape[1] / w
    ys = np.minimum((np.arange(mask.shape[0]) / fy).astype(np.int64), h - 1)
    xs = np.minimum((np.arange(mask.shape[1]) / fx).astype(np.int64), w - 1)
    out = np.zeros(shape, dtype=bool)
    rows = np.nonzero(mask.any(axis=1))[0]
    for r in rows:
        cols = np.nonzero(mask[r])[0]
        out[ys[r], xs[cols]] = True
    return out


def load_segment(path: Path, mask_suffix: str = "_supervision_mask.tif") -> Segment:
    x = tifffile.imread(path / "x.tif")
    y = tifffile.imread(path / "y.tif")
    z = tifffile.imread(path / "z.tif")
    valid = (x > 0) & (y > 0) & (z > 0)
    # The dataset names this file with both .tif and .tiff (e.g. w03, w09).
    candidates = [path / f"{path.name}{mask_suffix}", path / f"{path.name}{mask_suffix}f"]
    mask_file = next((c for c in candidates if c.exists()), candidates[0])
    if mask_file.exists():
        sup = block_any(tifffile.imread(mask_file) > 0, x.shape)
    else:
        sup = np.ones_like(valid)
    keep = valid & sup
    pts = np.stack([x[keep], y[keep], z[keep]], axis=1).astype(np.float32)
    return Segment(path.name, pts, int(valid.sum()))


def cell_keys(points: np.ndarray, cell: float) -> np.ndarray:
    q = np.floor(points / cell).astype(np.int64)
    # 21 bits per axis: fine for coordinates below 2**21 * cell.
    return (q[:, 0] << 42) ^ (q[:, 1] << 21) ^ q[:, 2]


def covered_fraction(a: np.ndarray, b: np.ndarray, cell: float) -> float:
    """Fraction of points of `a` within roughly `cell` of some point of `b`.

    A point counts as covered when its cell or any of the 26 neighbouring cells
    holds a point of `b`, so the tolerance is between `cell` and 2*`cell`.
    """
    if len(a) == 0 or len(b) == 0:
        return 0.0
    kb = np.unique(cell_keys(b, cell))
    qa = np.floor(a / cell).astype(np.int64)
    hit = np.zeros(len(a), dtype=bool)
    for off in OFFSETS:
        q = qa + off
        k = (q[:, 0] << 42) ^ (q[:, 1] << 21) ^ q[:, 2]
        hit |= np.isin(k, kb, assume_unique=False)
    return float(hit.mean())


def subsample(points: np.ndarray, n: int, seed: int = 0) -> np.ndarray:
    if len(points) <= n:
        return points
    idx = np.random.default_rng(seed).choice(len(points), n, replace=False)
    return points[idx]


def pairwise(segments: list[Segment], cells: list[float], sample: int = 200_000) -> dict:
    out = {}
    for a in segments:
        sa = subsample(a.points, sample)
        for b in segments:
            if a is b:
                continue
            out[f"{a.name}|{b.name}"] = {str(c): covered_fraction(sa, b.points, c) for c in cells}
    return out


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("segments", nargs="+", type=Path)
    ap.add_argument("--cells", default="4,8,16,32,64,128")
    ap.add_argument("--json-out", type=Path)
    args = ap.parse_args()
    cells = [float(c) for c in args.cells.split(",")]
    segs = [load_segment(p) for p in args.segments]
    for s in segs:
        print(f"{s.name:28s} supervised points {len(s.points):>10,}  valid cells {s.n_valid:>11,}")
    res = pairwise(segs, cells)
    print("\ncovered fraction of A's supervised area by B's supervised area")
    print(f"{'A':28s} {'B':28s} " + " ".join(f"{c:>7g}" for c in cells))
    for k, v in res.items():
        a, b = k.split("|")
        if max(v.values()) < 0.001:
            continue
        print(f"{a:28s} {b:28s} " + " ".join(f"{v[str(c)]:7.3f}" for c in cells))
    if args.json_out:
        args.json_out.write_text(json.dumps(res, indent=2))
