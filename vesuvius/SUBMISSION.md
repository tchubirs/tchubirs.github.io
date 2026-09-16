# Progress Prize submission — text to paste into the form

Form: <https://docs.google.com/forms/d/e/1FAIpQLScNBMj25FMnphngRG1Ciryv_2_Mkdq2YPJOD9WqPfZExII2iQ/viewform>

Deadline, from `scrollprize.org/docs/34_prizes.md` in the villa repository:
**11:59pm Pacific, September 30th, 2026.** Terms also state: "Prize winner must provide
payment information to Scroll Prize, Inc. within 30 days of prize announcement to
receive prize."

Levels: $20,000 for the best submission of the month, then a range typically
$20,000 / $10,000 / $5,000 / $2,500 / $1,000 / $500 / $250.

---

## Title

Reproducible surface metrics: removing the clock from the trace ranking metric, and a
tool to measure what is left

## Summary

`winding_valid_fraction` is what `eval_surface_tracer.py` ranks traces by
(`trace_ranking_metric` in `example_config.json`). It is produced by a 1000-restart
random search in `core/src/surface_metrics.cpp` that calls `srand(time(NULL))` once per
annotated point pair. That means the score depends on the time of day, every pair inside
the same second draws the identical pattern instead of an independent one, and the
process-global `rand()` stream used by `QuadSurface.cpp` and `PointCollections.cpp` is
reseeded from under them.

This submission contains:

1. A patch that replaces it with a local `std::mt19937` seeded from the query geometry,
   so the same inputs always give the same number, while different segments still get
   different draws.
2. A `--seed` option on `vc_calc_surface_metrics`, and `winding_metrics_seed` recorded
   in the metrics file, so a trace can be scored under several independent draws.
3. `scripts/evaluation/metric_noise_floor.py`, which scores traces under N seeds and
   reports, for each pair, whether the gap between them is larger than the metric's own
   spread — and how many distinct rankings the seeds produced.
4. 11 unit tests registered under the existing `vc-core` ctest label, each verified by
   deliberately breaking the code nine ways and confirming the tests fail.

## Evidence

Built from `757f70c`, Ubuntu 24.04, gcc 13.3, Release. Run against the project's own
public Scroll 5 `wrap_labels.json` (3888 annotated points) and a published
ThaumatoAnakalyptor autosegmentation cropped to `4300 <= z <= 5600` and converted with
`vc_obj2tifxyz`.

Three runs of the `757f70c` binary and six of the patched one, identical arguments, all
agree to every digit: `surface_missing_fraction 0.9712849855422974`,
`in_surface_frac_valid 0.585106372833252`. Runtime 8.21-8.34 s before, 8.29-8.48 s
after. `ctest -R test_random_restarts` passes.

**What this does not show.** On that surface the metric did not move between draws, so
no wrong ranking was found. `winding_valid_fraction` was pinned at 0 there because
`vc_tifxyz_winding` could not find a winding period on an autosegmentation crop. The
traces the evaluation actually ranks are not public, so the magnitude of the noise on a
production trace remains unmeasured — by anyone, because until this patch the draw could
not be controlled. Measuring it on your traces is one command with the included tool.

## Why it is useful

`num_best_traces_to_average` selects traces on this number. If two traces differ by less
than the metric's sampling spread, that selection is not a measurement. Right now there
is no way to find out which case you are in, because a re-run of the evaluation is a
different sample and cannot be repeated. After this, it is one command.

It also touches the "conservative failure detection" line of the bottleneck table in
2026 Open Problems: a sheet-switch detector whose score cannot be re-run is hard to set a
threshold on.

## Open source

MIT. Repository:
<https://github.com/tchubirs/tchubirs.github.io/tree/claude/ai-revenue-automation-map-g00jks/vesuvius>
(patch, tests, measurement tool, isolated reproduction, full reproduction instructions).

## Disclosure

This work — the analysis, the patch, the tests and the measurements — was produced by an
AI agent (Claude Code) reading the repository and running the project's own tools. Every
number quoted was produced by a command that was actually run, and where the measurement
came out against the hypothesis it is reported that way. I am disclosing this up front
rather than letting you infer it.
