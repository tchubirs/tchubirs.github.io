"""Leak-free supervision masks for the ink pipeline.

The ink trainer removes a segment's validation voxels only from that same
segment (exclude_validation_voxels in ink_detection/data/dataset.py). When two
segments trace the same papyrus, one segment's training labels can sit on top
of another segment's validation region, and the model is then scored on text it
was trained on.

For every segment in one scroll directory, this finds the grid cells whose 3D
position lies near any *other* segment's validation region, removes them from
that segment's supervision mask, and writes the result as the next label
version. Files are named with the segment directory as prefix, which is the
only prefix discover_segment_labels() accepts, so the official loader selects
them; run create_label_zarrs afterwards as usual. No training code changes.

Default is a dry run that only reports. Pass --write to create files.
"""
from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import tifffile

import overlap

LABEL_RE = re.compile(
    r"^(?P<prefix>.*)_(?P<kind>inklabels|supervision_mask|validation_mask)"
    r"(?:_v(?P<version>\d+))?(?P<ext>\.tiff?)$",
    re.IGNORECASE,
)
TIFF_MAGIC = (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+")


def is_tiff(path: Path) -> bool:
    with open(path, "rb") as f:
        return f.read(4) in TIFF_MAGIC


@dataclass
class Labels:
    prefix: str
    version: int                                  # highest version among the chosen files
    files: dict[str, Path] = field(default_factory=dict)   # kind -> latest file


def find_labels(segment_dir: Path) -> Labels:
    """Pick the label files the way discover_segment_labels() would, and one step further.

    The loader only accepts the prefix equal to the directory name. The public
    bucket also has segments whose files drop a trailing "_2um"; for those the
    prefix that the directory name starts with is used instead, so the tool can
    still read them - and the files it writes carry the directory name, which
    fixes the naming for the loader at the same time.
    """
    groups: dict[str, dict[str, dict[int, Path]]] = {}
    for p in sorted(segment_dir.iterdir()):
        m = LABEL_RE.match(p.name)
        if not m or not p.is_file() or not is_tiff(p):
            continue
        version = int(m.group("version") or 1)
        groups.setdefault(m.group("prefix"), {}).setdefault(m.group("kind").lower(), {})[version] = p
    usable = {k: v for k, v in groups.items() if "inklabels" in v and "supervision_mask" in v}
    name = segment_dir.name
    if name in usable:
        prefix = name
    else:
        candidates = [k for k in usable if name.startswith(k + "_")]
        if not candidates:
            raise ValueError(f"{name}: no inklabels + supervision_mask TIFF pair found")
        prefix = max(candidates, key=len)
    kinds = usable[prefix]
    files = {kind: versions[max(versions)] for kind, versions in kinds.items()}
    top = max(v for versions in kinds.values() for v in versions)
    return Labels(prefix, top, files)


def grid_index(n_label: int, n_grid: int) -> np.ndarray:
    """Grid cell of each label row (or column); the same mapping block_any() uses."""
    f = n_label / n_grid
    return np.minimum((np.arange(n_label) / f).astype(np.int64), n_grid - 1)


@dataclass
class Segment:
    path: Path
    labels: Labels
    xyz: np.ndarray            # (H, W, 3) float32
    valid: np.ndarray          # (H, W) bool
    supervised: np.ndarray     # (H, W) bool, grid cells with any supervision
    validation: np.ndarray     # (H, W) bool, grid cells with any validation


def _read_2d(path: Path) -> np.ndarray:
    try:
        a = tifffile.imread(path)
    except Exception as e:  # a truncated or corrupt file must not stop the other segments
        raise ValueError(f"cannot read {path.name}: {e}") from None
    if a.ndim != 2:
        raise ValueError(f"{path.name} is not a 2D image (shape {a.shape})")
    return a


def load(path: Path) -> Segment:
    labels = find_labels(path)
    x, y, z = (_read_2d(path / f"{c}.tif") for c in "xyz")
    valid = (x > 0) & (y > 0) & (z > 0)
    sup = overlap.block_any(_read_2d(labels.files["supervision_mask"]) > 0, x.shape)
    if "validation_mask" in labels.files:
        val = overlap.block_any(_read_2d(labels.files["validation_mask"]) > 0, x.shape)
    else:
        val = np.zeros_like(valid)
    return Segment(path, labels, np.stack([x, y, z], -1), valid, sup & valid, val & valid)


def foreign_validation(segments: list[Segment], cell: float) -> dict[str, np.ndarray]:
    """For each segment, the grid cells lying near another segment's validation cells."""
    out = {}
    for a in segments:
        others = [b.xyz[b.validation] for b in segments if b is not a and b.validation.any()]
        hit = np.zeros(a.valid.shape, dtype=bool)
        if others:
            cand = a.valid & a.supervised
            pts = a.xyz[cand]
            hit[cand] = overlap.covered_mask(pts, np.concatenate(others), cell)
        out[a.path.name] = hit
    return out


def cleaned_supervision(sup_file: Path, drop_cells: np.ndarray, rows_per_block: int = 2048) -> np.ndarray:
    """The supervision image with every label pixel of a dropped grid cell set to 0."""
    sup = tifffile.imread(sup_file)
    h, w = drop_cells.shape
    ys = grid_index(sup.shape[0], h)
    xs = grid_index(sup.shape[1], w)
    out = sup.copy()
    for r0 in range(0, sup.shape[0], rows_per_block):
        r1 = min(r0 + rows_per_block, sup.shape[0])
        block = drop_cells[np.ix_(ys[r0:r1], xs)]
        out[r0:r1][block] = 0
    return out


def run(scroll_dir: Path, cell: float, write: bool) -> dict:
    seg_dirs = sorted(p for p in scroll_dir.iterdir() if p.is_dir() and (p / "x.tif").exists())
    segments, skipped = [], {}
    for d in seg_dirs:
        try:
            segments.append(load(d))
        except ValueError as e:
            skipped[d.name] = str(e)
    drops = foreign_validation(segments, cell)
    report = {"scroll": scroll_dir.name, "cell": cell, "skipped": skipped, "segments": {}}
    for s in segments:
        drop = drops[s.path.name]
        n_sup, n_drop = int(s.supervised.sum()), int(drop.sum())
        entry = {
            "labels_prefix": s.labels.prefix,
            "labels_version": s.labels.version,
            "supervised_cells": n_sup,
            "dropped_cells": n_drop,
            "dropped_fraction": (n_drop / n_sup) if n_sup else 0.0,
            "written": [],
        }
        if write and n_drop:
            v = s.labels.version + 1
            name = s.path.name
            existing = {p.name for p in s.path.iterdir()}
            targets = {k: f"{name}_{k}_v{v}.tif" for k in s.labels.files}
            clash = sorted(t for t in targets.values() if t in existing)
            if clash:
                raise FileExistsError(f"{name}: refusing to overwrite {clash}")
            cleaned = cleaned_supervision(s.labels.files["supervision_mask"], drop)
            tifffile.imwrite(s.path / targets["supervision_mask"], cleaned, compression="zlib")
            for kind in ("inklabels", "validation_mask"):
                if kind in s.labels.files:
                    shutil.copyfile(s.labels.files[kind], s.path / targets[kind])
            entry["written"] = sorted(targets.values())
        report["segments"][s.path.name] = entry
    return report


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scroll_dir", type=Path, help="One scroll directory: segment subdirectories with x/y/z.tif and label TIFFs")
    ap.add_argument("--cell", type=float, default=8.0,
                    help="Cell size in voxels. Every cell within this distance of another segment's validation is dropped (default 8).")
    ap.add_argument("--write", action="store_true", help="Write the next label version instead of only reporting")
    ap.add_argument("--json-out", type=Path)
    args = ap.parse_args()
    rep = run(args.scroll_dir, args.cell, args.write)
    for name, e in rep["segments"].items():
        print(f"{name:34s} v{e['labels_version']} prefix={e['labels_prefix']:30s} "
              f"supervised {e['supervised_cells']:>9,}  dropped {e['dropped_cells']:>7,} ({100*e['dropped_fraction']:.2f}%)"
              + (f"  -> {', '.join(e['written'])}" if e["written"] else ""))
    for name, why in rep["skipped"].items():
        print(f"{name:34s} skipped: {why}")
    if args.json_out:
        args.json_out.write_text(json.dumps(rep, indent=2))
