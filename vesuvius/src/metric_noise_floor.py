#!/usr/bin/env python3
"""Measure how much of a surface metric is sampling noise.

eval_surface_tracer.py ranks traces by `trace_ranking_metric` (by default
`winding_valid_fraction`) and averages the top `num_best_traces_to_average`.
That number comes out of a random-restart search inside
vc_calc_surface_metrics, so it is a sample, not a constant: two traces whose
scores differ by less than the spread of that sample are not actually ranked.

This script scores the same traces repeatedly and reports the spread, then
says which of the rankings it produced survive it.

Two modes:

  --mode seed    (default) re-score with --seed 0..N-1. Needs a binary that
                 has the --seed option. Each seed is an independent draw of
                 the restart points, so the spread across seeds is the
                 sampling noise of the metric.

  --mode repeat  run the identical command N times, changing nothing. On a
                 correct binary every run must return the same number and the
                 spread is exactly zero. A non-zero spread here means the
                 metric is not reproducible at all - the same inputs scored
                 twice give two different answers.

Example:

  python metric_noise_floor.py \\
      --bin-path ../../build/bin \\
      --collection ../volpkgs/PHerc0172.volpkg/wrap_labels.json \\
      --z-min 2000 --z-max 2400 \\
      --seeds 16 \\
      ../out/traces/trace_a ../out/traces/trace_b ../out/traces/trace_c
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
import tempfile
from itertools import combinations
from pathlib import Path


def score_once(bin_path: Path, trace: Path, collection: Path, winding: Path,
               z_min: int, z_max: int, seed: int | None) -> dict:
    """Run vc_calc_surface_metrics once and return the parsed metrics."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "metrics.json"
        cmd = [
            str(bin_path / "vc_calc_surface_metrics"),
            "--collection", str(collection),
            "--surface", str(trace),
            "--winding", str(winding),
            "--output", str(out),
            "--z_min", str(z_min),
            "--z_max", str(z_max),
        ]
        if seed is not None:
            cmd += ["--seed", str(seed)]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0 or not out.exists():
            raise RuntimeError(
                f"vc_calc_surface_metrics failed for {trace}:\n"
                f"  command: {' '.join(cmd)}\n"
                f"  stdout: {result.stdout.strip()}\n"
                f"  stderr: {result.stderr.strip()}"
            )
        return json.loads(out.read_text())


def supports_seed(bin_path: Path) -> bool:
    result = subprocess.run([str(bin_path / "vc_calc_surface_metrics"), "--help"],
                            capture_output=True, text=True)
    return "--seed" in (result.stdout + result.stderr)


def summarize(values: list[float]) -> dict:
    spread = max(values) - min(values)
    return {
        "n": len(values),
        "min": min(values),
        "max": max(values),
        "mean": statistics.fmean(values),
        "stdev": statistics.stdev(values) if len(values) > 1 else 0.0,
        "spread": spread,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("traces", nargs="+", type=Path,
                    help="Trace directories (tifxyz), as passed to --surface")
    ap.add_argument("--bin-path", type=Path, required=True,
                    help="Directory holding vc_calc_surface_metrics")
    ap.add_argument("--collection", type=Path, required=True,
                    help="Point collection with winding annotations (wrap_labels.json)")
    ap.add_argument("--winding-name", default="winding.tif",
                    help="Winding file inside each trace directory (default: winding.tif)")
    ap.add_argument("--z-min", type=int, default=-1)
    ap.add_argument("--z-max", type=int, default=-1)
    ap.add_argument("--seeds", type=int, default=16,
                    help="How many draws to take per trace (default: 16)")
    ap.add_argument("--mode", choices=["seed", "repeat"], default="seed",
                    help="seed: vary --seed. repeat: run the identical command N times.")
    ap.add_argument("--metric", default="winding_valid_fraction",
                    help="Metric to analyse (default: winding_valid_fraction)")
    ap.add_argument("--json-out", type=Path,
                    help="Also write the full result as JSON here")
    args = ap.parse_args()

    seedable = supports_seed(args.bin_path)
    if args.mode == "seed" and not seedable:
        print("This vc_calc_surface_metrics has no --seed option, so the draw cannot\n"
              "be controlled. Use --mode repeat to measure run-to-run reproducibility\n"
              "instead, or build a newer binary.", file=sys.stderr)
        return 2

    per_trace: dict[str, dict] = {}
    draws: dict[str, list[float]] = {}

    for trace in args.traces:
        winding = trace / args.winding_name
        if not winding.exists():
            print(f"skipping {trace}: no {args.winding_name}", file=sys.stderr)
            continue

        values = []
        for i in range(args.seeds):
            # repeat mode changes nothing between runs; seed mode takes one
            # independent draw per iteration.
            seed = i if args.mode == "seed" else (0 if seedable else None)
            metrics = score_once(args.bin_path, trace, args.collection, winding,
                                 args.z_min, args.z_max, seed)
            if args.metric not in metrics:
                raise SystemExit(f"{trace}: metrics.json has no {args.metric!r}; "
                                 f"got {sorted(metrics)}")
            values.append(float(metrics[args.metric]))

        draws[trace.name] = values
        per_trace[trace.name] = summarize(values)

    if not per_trace:
        print("nothing to report: no trace had a winding file", file=sys.stderr)
        return 1

    label = "across seeds" if args.mode == "seed" else "across identical runs"
    print(f"\n{args.metric} {label} ({args.seeds} draws per trace)\n")
    width = max(5, max(len(name) for name in per_trace))
    print(f"{'trace'.ljust(width)}  {'mean':>9}  {'stdev':>9}  {'min':>9}  {'max':>9}  {'spread':>9}")
    for name, s in per_trace.items():
        print(f"{name.ljust(width)}  {s['mean']:9.5f}  {s['stdev']:9.5f}  "
              f"{s['min']:9.5f}  {s['max']:9.5f}  {s['spread']:9.5f}")

    worst_spread = max(s["spread"] for s in per_trace.values())

    if args.mode == "repeat":
        print()
        if worst_spread == 0.0:
            print("Every run returned the same number. The metric is reproducible.")
        else:
            print(f"The same inputs scored {args.seeds} times gave answers up to "
                  f"{worst_spread:.5f} apart.\nThis metric is not reproducible: "
                  f"re-running the evaluation can change the ranking\nwithout anything "
                  f"about the traces changing.")

    if len(per_trace) > 1:
        print(f"\nnoise floor (largest spread seen): {worst_spread:.5f}")
        print("\ntrace pairs, gap vs noise floor:")
        decidable = 0
        pairs = list(combinations(per_trace.items(), 2))
        for (a_name, a), (b_name, b) in pairs:
            gap = abs(a["mean"] - b["mean"])
            verdict = "separated" if gap > worst_spread else "INSIDE THE NOISE"
            if gap > worst_spread:
                decidable += 1
            print(f"  {a_name} vs {b_name}: gap {gap:.5f}  {verdict}")
        print(f"\n{decidable}/{len(pairs)} pairs are ranked by more than the metric's own spread.")

        orderings = set()
        for i in range(args.seeds):
            order = tuple(sorted(draws, key=lambda n: -draws[n][i]))
            orderings.add(order)
        print(f"{len(orderings)} distinct ranking(s) of these traces over {args.seeds} draws.")
        if len(orderings) > 1:
            print("The ranking is not stable, so which trace the evaluation calls best\n"
                  "depends on the draw and not only on the traces.")

    if args.json_out:
        args.json_out.write_text(json.dumps(
            {"metric": args.metric, "mode": args.mode, "seeds": args.seeds,
             "summary": per_trace, "draws": draws}, indent=2))
        print(f"\nwrote {args.json_out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
