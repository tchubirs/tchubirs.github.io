# Progress Prize form — one answer per field

Form: <https://docs.google.com/forms/d/e/1FAIpQLScNBMj25FMnphngRG1Ciryv_2_Mkdq2YPJOD9WqPfZExII2iQ/viewform>
Deadline: 11:59pm Pacific, 30 September 2026.

---

## 1. Your full name *

Fill in yourself. Nothing here writes your name for you.

## 2. Team description *

```
Individual submission. One person, no team.
```

## 3. Discord display name

Fill in yourself if you are on their Discord; otherwise leave blank.

## 4. URL of your open source / publicly available contribution *

```
https://github.com/tchubirs/tchubirs.github.io/tree/claude/ai-revenue-automation-map-g00jks/vesuvius
```

That tree holds the patch (`patch/`), the new header and test and measurement tool
(`src/`), the dependency-free reproduction (`proof/`), and the full write-up with
reproduction steps (`README.md`). MIT.

## 5. What is your contribution? *

```
I fixed a reproducibility defect in the metric that eval_surface_tracer.py uses to rank surface traces, and added the tooling to measure how much of that metric is sampling noise.

(1) WHICH SCROLL DATA

Scroll 5 (PHerc. 172), using your own published files:

- full-scrolls/Scroll5/PHerc172.volpkg/working/wrap_labels.json - 3,888 annotated wrap points across 414 collections; 1,393 adjacent pairs fall in the z band I used.
- full-scrolls/Scroll5/PHerc172.volpkg/thaumato_outputs/scroll5_thaumato_jan15/working/working_mesh_0_window_147990_197990_flatboi/mesh_0_window_147990_197990_flatboi.obj - cropped to 4300 <= z <= 5600 (a pure subset of faces; no vertex moved) and converted to tifxyz with your own vc_obj2tifxyz. 1932 x 4234 grid, 1.08 M valid cells.

(2) HOW THIS HELPS READ THE SCROLLS

winding_valid_fraction is declared as trace_ranking_metric in scripts/evaluation/example_config.json. eval_surface_tracer.py sorts traces by it and averages the top num_best_traces_to_average. It is produced by a 1,000-restart random search in core/src/surface_metrics.cpp that calls srand(time(NULL)) once per annotated point pair (line 85, called from line 229).

Three consequences: the score depends on the time of day; every pair inside the same second draws the identical pattern instead of 1,000 independent restarts each; and the process-global rand() stream that QuadSurface.cpp (1589, 1709, 1714, 3239) and PointCollections.cpp (864-866) also draw from is reseeded out from under them.

A trace-selection criterion that cannot be re-run cannot be audited, and a threshold cannot be set on it with confidence. This is also the "conservative failure detection" row of the bottleneck table in 2026 Open Problems: a sheet-switch detector whose score moves between runs is hard to threshold.

The repository already contains the correct version of this exact pattern - vc_tifxyz_gengt.cpp:108 runs the same 1,000-restart search with rand_r() and a caller-owned seed taken from the data. srand appears in only one other place in all of core/ and apps/: vc_grow_seg_from_seed.cpp:369, once in main, which is where seeding belongs. So this is a consistency fix, not a new idea.

(3) WHAT IS NOW POSSIBLE THAT WAS NOT

Repeating a score, and asking for a different one on purpose. Before this patch the draw came from the clock, so neither was possible.

After it: calc_point_winding_metrics(..., uint32_t seed = 0), a --seed option on vc_calc_surface_metrics, and winding_metrics_seed recorded in the metrics file. The restarts come from a local std::mt19937 seeded by an FNV-1a digest of the query geometry, with rejection sampling so the modulo bias is gone; different segments still get different draws, and the global generator is untouched.

That makes the noise floor of the ranking metric measurable for the first time, and scripts/evaluation/metric_noise_floor.py does the measuring: it scores traces under N seeds and prints, for each pair of traces, whether the gap between their means is larger than the metric's own spread, and how many distinct rankings the seeds produced. If more than one ranking comes out, which trace the evaluation calls best depends on the draw. It also has a --mode repeat that runs the identical command N times and works on an unpatched binary, which is how the before/after below was taken.

(4) EVIDENCE

Built from 757f70c. Ubuntu 24.04, gcc 13.3, Release, -DVC_BUILD_APPS=ON -DVC_TESTING=ON.

Same command, same data, three runs of the 757f70c binary and six runs of the patched binary at seeds 0 through 5 - all nine return, to every digit:
  in_surface_frac_valid     0.585106372833252
  surface_missing_fraction  0.9712849855422974
  winding_valid_fraction    0.0
Behaviour-preserving. Runtime 8.21 / 8.28 / 8.34 s before, 8.29 / 8.43 / 8.48 s after.

11 new test cases, registered with vc_add_test so they run under the existing vc-core ctest label in vc3d-ci.yml. Each was validated by breaking RandomRestarts.hpp on purpose nine different ways, one at a time: a constant seed, a dropped user seed, height ignored, an off-by-one at the top of the range, an srand() put back in, a generator that ignores its seed, the degenerate-grid guard removed, a sampler returning one point 1,000 times, and float bits rounded before hashing. All nine were caught.

A dependency-free reproduction of the old sampling pattern (proof/srand_pattern.cpp, needs only g++): two calls in the same second produce an identical pattern; one second later 1,976 of 2,000 draws differ; an unrelated caller's rand() stream is clobbered.

One methodology note for anyone reproducing: the converted surface's meta.json scale had to be rewritten to the measured median 3D spacing between adjacent grid cells (0.2352, 0.1729 samples per voxel), because vc_obj2tifxyz in --uv-metric mode writes OBJ-units-per-sample there rather than samples-per-voxel when the input OBJ has normalised UVs. That looks like a separate bug; this submission does not touch it.

WHAT THIS DOES NOT CLAIM

On that surface the metric did not move between draws, so I have not found a wrong ranking. winding_valid_fraction was pinned at 0 there because vc_tifxyz_winding reported "wind x step: 0" on an autosegmentation crop and produced an all-zero winding field, so the ranking metric itself was not exercised. surface_missing_fraction was 0.9712849855422974, which over 1,393 pairs is exactly 1,353 pairs where the search found nothing and 40 where it did; the local descent reaches those 40 from essentially anywhere on the grid, so the restarts did not matter there.

The traces your evaluation actually ranks are not public, so the magnitude of the noise on a production trace is still unmeasured - by anyone, because until this patch the draw could not be controlled. On your traces it is now one command.

DISCLOSURE

The analysis, the patch, the tests and the measurements were produced by an AI agent (Claude Code) reading the repository and running your own tools. Every number above came from a command that was actually run, and where a measurement came out against the hypothesis it is reported that way. I am saying this up front rather than letting you infer it.
```

## 6. Terms and Conditions *

Tick **Yes, I agree**.
