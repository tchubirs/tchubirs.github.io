# Reproducible surface metrics for volume-cartographer

`winding_valid_fraction` is the number the surface-tracer evaluation ranks traces by.
It is produced by a random-restart search that seeds itself from the wall clock, once
per annotated point pair. This directory holds a patch that removes that, the tests
that hold it removed, a tool for measuring how much of the metric is sampling noise,
and an honest account of what the measurements did and did not show.

Target: [ScrollPrize/villa](https://github.com/ScrollPrize/villa) at `757f70c`.

## Layout

| Path | What it is |
|---|---|
| `patch/0001-surface-metrics-deterministic-restarts.patch` | the whole change, applies to `757f70c` |
| `src/RandomRestarts.hpp` | the new header, as it lands in `core/include/vc/core/util/` |
| `src/test_random_restarts.cpp` | the new test, as it lands in `core/test/` |
| `src/metric_noise_floor.py` | the measurement tool, as it lands in `scripts/evaluation/` |
| `src/surface_metrics.patched.cpp` | the patched file in full, for reading without applying the patch |
| `proof/srand_pattern.cpp` | dependency-free reproduction of the old sampling pattern |
| `PR.md` | body for a pull request against villa |
| `SUBMISSION.md` | text for the Progress Prize form |
| `CAVEATS.md` | what villa's CONTRIBUTING.md requires that this does not meet, and why the prize form is the honest route |

The four files under `src/` are copies of what the patch installs; the patch is the
source of truth.

## The defect

`volume-cartographer/core/src/surface_metrics.cpp:85`, inside
`find_closest_intersection()`:

```cpp
srand(time(NULL));

for (int i = 0; i < 1000; ++i) { // 1000 random trials
    cv::Vec2f nominal_loc = {
        (float)(rand() % s_size.width),
        (float)(rand() % s_size.height)
    };
```

Three separate problems, in one line:

1. **The draw depends on the clock.** Two runs of the same evaluation on the same
   inputs are two different samples, and there is no way to ask for the first one back.
2. **Every call inside the same second draws the identical pattern.** The function is
   called once per adjacent annotated point pair (`surface_metrics.cpp:229`), so within
   one second all those pairs probe the same 1000 cells rather than 1000 independent
   ones each.
3. **It reseeds the process-global generator.** `QuadSurface.cpp` (1589, 1709, 1714,
   3239) and `PointCollections.cpp` (864-866) draw from the same `rand()`. Computing
   metrics silently resets their stream to a function of the time of day.

The number this feeds is `results["winding_valid_fraction"]`
(`surface_metrics.cpp:267`), which `scripts/evaluation/example_config.json:15` declares
as `"trace_ranking_metric"`; `eval_surface_tracer.py` sorts traces by it and averages
the top `num_best_traces_to_average`.

`srand` appears in exactly two places in the whole of `core/` and `apps/`: here, and
`vc_grow_seg_from_seed.cpp:369` (`srand(clock())`, once in `main`, which is where
seeding belongs). This is the only library function that reseeds the global generator
from inside a loop. And the repository already has a correct version of this exact
pattern: `vc_tifxyz_gengt.cpp:108` runs the same 1000-restart search with `rand_r()`
and a caller-owned seed taken from the data. So the patch is a consistency fix, not a
new idea.

### Isolated reproduction

`proof/srand_pattern.cpp` reproduces the sampling loop with no OpenCV and no CMake.
`g++ -O2 srand_pattern.cpp && ./a.out`:

```
W=129 H=129, 1000 trials, 2000 draws per call

1. two calls in the SAME second produce an identical pattern : YES  <-- statistically wrong
2. one second later, draws that differ                      : 1976 / 2000 (98.8%)
3. an unrelated caller's rand() stream is clobbered         : YES  <-- global state

first 6 draws, same second : 98 69 31 119 45 98
first 6 draws, second later: 35 115 20 72 24 22
```

## The patch

`patch/0001-surface-metrics-deterministic-restarts.patch`, which applies cleanly to
`757f70c`:

- **`core/include/vc/core/util/RandomRestarts.hpp`** (new, header-only).
  `restart_seed(a, b, c, user_seed)` is an FNV-1a digest over the float bits of the
  query geometry; `restart_points(w, h, n, seed)` returns `n` start cells from a local
  `std::mt19937`, drawn with rejection sampling so the modulo bias is gone. No global
  state, no clock.
- **`core/src/surface_metrics.cpp`** calls those instead of `srand`/`rand`. The seed is
  derived from the segment endpoints and the proximity point, so different segments
  still get different draws — a fixed constant would be "deterministic" and also make
  every query probe the same 1000 cells.
- **`calc_point_winding_metrics(..., uint32_t seed = 0)`** and a `--seed` option on
  `vc_calc_surface_metrics`, so the same trace can be scored under several draws. The
  chosen seed is written into the metrics file as `winding_metrics_seed`.
- **`core/test/test_random_restarts.cpp`** (new), registered with `vc_add_test` so it
  runs under the existing `vc-core` ctest label in `vc3d-ci.yml`.
- **`scripts/evaluation/metric_noise_floor.py`** (new), described below.

## What was measured

Built from source on Ubuntu 24.04, gcc 13.3, `-DCMAKE_BUILD_TYPE=Release
-DVC_BUILD_APPS=ON -DVC_TESTING=ON`.

### Tests

11 test cases, all passing under the project's own harness:

```
$ ctest -R test_random_restarts --output-on-failure
1/1 Test #4: test_random_restarts .............   Passed    0.00 sec
Label Time Summary:
    vc-core    =   0.00 sec*proc (1 test)
```

Then each of nine deliberate breakages of `RandomRestarts.hpp` was introduced one at a
time to check the tests actually hold the behaviour. All nine were caught:

| Breakage | Caught by |
|---|---|
| seed replaced by a constant | "a different query is a different seed" |
| `user_seed` dropped from the hash | "the user seed changes the draw" |
| height ignored, width used for both axes | "a non-rectangular grid stays inside both bounds" |
| off-by-one at the top of the range | "every point is inside the grid" |
| `srand()` called inside the sampler | "the global rand() stream is left alone" |
| generator ignores its seed | "a different seed is a different sequence" |
| degenerate-grid guard removed | "a degenerate grid yields nothing" |
| same point returned 1000 times | "the draw covers the grid" (and two others) |
| float bits rounded before hashing | "a tiny change of geometry is not ignored" |

### On real scroll data

Inputs, all from the project's own public data:

- `full-scrolls/Scroll5/PHerc172.volpkg/working/wrap_labels.json` — the real
  ground-truth wrap annotations the evaluation uses. 3888 annotated points, 414
  collections; 1393 adjacent pairs fall in the z band used below.
- `thaumato_outputs/scroll5_thaumato_jan15/.../mesh_0_window_147990_197990_flatboi.obj`
  — a published ThaumatoAnakalyptor autosegmentation of Scroll 5, cropped to
  `4300 <= z <= 5600` (a pure subset of faces; no vertex moved) and converted with the
  project's own `vc_obj2tifxyz`. Resulting surface: 1932 x 4234 grid, 1.08 M valid
  cells, bbox `[2522, 1440, 4300] .. [7037, 4703, 5599]`.

Command, run against both the `757f70c` binary and the patched one:

```
vc_calc_surface_metrics --collection wrap_labels.json --surface wz \
    --winding wz/winding.tif --output metrics.json --z_min 4300 --z_max 5600 [--seed N]
```

**Before the patch, three runs, identical inputs:**

```
in_surface_frac_valid 0.585106372833252  surface_missing_fraction 0.9712849855422974  winding_valid_fraction 0.0
in_surface_frac_valid 0.585106372833252  surface_missing_fraction 0.9712849855422974  winding_valid_fraction 0.0
in_surface_frac_valid 0.585106372833252  surface_missing_fraction 0.9712849855422974  winding_valid_fraction 0.0
```

**After the patch, seeds 0 through 5:** the same three numbers, to every digit, for
every seed.

`surface_missing_fraction` of 0.9712849855422974 over 1393 pairs is exactly 1353 pairs
where the search found nothing and 40 where it did. Those 40 are the only ones the draw
could have moved, and it did not move them: the local descent reaches them from
essentially anywhere on the grid, so 1000 restarts find them whatever the restarts are.

So on this surface the metric did not move — not between clock-seeded runs, and not
between draws. Two things follow, and the second is the important one:

- The patch is behaviour-preserving. Same inputs, same numbers as `757f70c`, and now
  reproducible by construction rather than by luck. Runtime over three runs each:
  8.21 / 8.28 / 8.34 s before, 8.29 / 8.43 / 8.48 s after — no regression worth
  reporting.
- **The magnitude of the noise on a production trace is still unmeasured, by anyone.**
  The surface above is an autosegmentation crop, not a trace out of
  `eval_surface_tracer.py`, and its `winding.tif` came out degenerate (all zero) because
  `vc_tifxyz_winding` could not find a winding period on it — which pins
  `winding_valid_fraction` at 0 and makes it insensitive to the draw by construction.
  The traces the evaluation actually ranks are not public, so this is the closest real
  surface available from outside the team.

This is stated plainly because the honest claim is narrower than the obvious one. The
defect is real and provable from the source; whether it changes a reported score
depends on the data, and on the one real surface reachable from outside it did not.
What was impossible before this patch was *checking* — the draw could not be
controlled, so the question could not be asked. That is what the tool below is for.

### The tool

`scripts/evaluation/metric_noise_floor.py` scores the same traces repeatedly and
reports whether the rankings survive the spread:

```
python metric_noise_floor.py --bin-path build/bin --collection wrap_labels.json \
    --z-min 2000 --z-max 2400 --seeds 16 out/traces/trace_a out/traces/trace_b ...
```

- `--mode seed` (default) varies `--seed`. Each seed is an independent draw, so the
  spread across seeds is the sampling noise of the metric. It then prints, for each
  pair of traces, whether the gap between their means is larger than that noise, and
  how many distinct rankings the seeds produced. If more than one ranking comes out,
  which trace the evaluation calls best depends on the draw.
- `--mode repeat` runs the identical command N times and changes nothing. On the
  patched binary the spread must be exactly zero; a non-zero spread is a
  reproducibility failure. This mode works on the unpatched binary too, which is how
  the before/after above was taken.

On the team's own traces this is one command and answers a question the evaluation
currently cannot: is `num_best_traces_to_average` picking the better traces, or the
luckier ones?

Run against the surface above, three seeds, patched binary (the same surface passed
twice, so the pair verdict below is only exercising the code path, not comparing two
real traces):

```
surface_missing_fraction across seeds (3 draws per trace)

trace         mean      stdev        min        max     spread
trace_a    0.97128    0.00000    0.97128    0.97128    0.00000
trace_b    0.97128    0.00000    0.97128    0.97128    0.00000

noise floor (largest spread seen): 0.00000

trace pairs, gap vs noise floor:
  trace_a vs trace_b: gap 0.00000  INSIDE THE NOISE

0/1 pairs are ranked by more than the metric's own spread.
1 distinct ranking(s) of these traces over 3 draws.
```

And `--mode repeat` against the unpatched `757f70c` binary on the same surface:

```
surface_missing_fraction across identical runs (3 draws per trace)

trace       mean      stdev        min        max     spread
wz    0.97128    0.00000    0.97128    0.97128    0.00000

Every run returned the same number. The metric is reproducible.
```

## Reproducing all of it

```
git clone https://github.com/ScrollPrize/villa && cd villa && git checkout 757f70c
git apply /path/to/patch/0001-surface-metrics-deterministic-restarts.patch
cd volume-cartographer
cmake -S . -B build -GNinja -DCMAKE_BUILD_TYPE=Release -DVC_BUILD_APPS=ON -DVC_TESTING=ON
ninja -C build test_random_restarts vc_calc_surface_metrics
(cd build && ctest -R test_random_restarts --output-on-failure)
```

The isolated reproduction needs nothing but a compiler:
`g++ -O2 proof/srand_pattern.cpp -o srand_pattern && ./srand_pattern`.

## Disclosure

The analysis, the patch, the tests and the measurements in this directory were produced
by an AI agent (Claude Code), reading the repository and running the project's own
tools. Everything above that is stated as measured was run and its output pasted, not
described from memory. Where a measurement came out against the hypothesis it is
reported that way.

## Licence

The patch targets a repository under its own licence and is offered under the same
terms. Everything else here is MIT.
