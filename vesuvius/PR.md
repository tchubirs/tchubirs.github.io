<!-- Body for a pull request against ScrollPrize/villa, following
     .github/pull_request_template.md. Read CAVEATS.md before opening it. -->

**In one sentence:** Scoring a trace twice with `vc_calc_surface_metrics` now gives the same answer twice, and a new `--seed` lets you score it under several draws to see how much of the score is sampling noise.

**One real example:** Starting with the published Scroll 5 autosegmentation `mesh_0_window_147990_197990_flatboi` and the project's own `wrap_labels.json`, I ran `vc_calc_surface_metrics` three times with identical arguments on the `757f70c` binary and six times on the patched one, and all nine runs agreed to every digit — but only the patched binary can be *asked* to repeat a run, because before this PR the draw came from `time(NULL)`.

**Before:** `find_closest_intersection()` calls `srand(time(NULL))` and then `rand()`, once per adjacent annotated point pair (`core/src/surface_metrics.cpp:85`, called from line 229). Three consequences: the 1000 restarts depend on the time of day, every pair inside the same second draws the identical pattern instead of 1000 independent ones, and the process-global `rand()` stream that `QuadSurface.cpp` (1589, 1709, 1714, 3239) and `PointCollections.cpp` (864-866) also use is reseeded out from under them. The number this produces is `winding_valid_fraction`, which `scripts/evaluation/example_config.json:15` declares as `trace_ranking_metric`.

**After this PR:** the restarts come from a local `std::mt19937` seeded by an FNV-1a digest of the query geometry plus a caller-supplied seed. Same inputs and same seed always give the same cells; different segments still get different draws; the global generator is untouched. `calc_point_winding_metrics` takes `uint32_t seed = 0`, `vc_calc_surface_metrics` takes `--seed`, and the metrics file records `winding_metrics_seed`.

**Proof:**

Same command, same data, `757f70c` vs patched:

```
$ vc_calc_surface_metrics --collection wrap_labels.json --surface wz \
      --winding wz/winding.tif --output m.json --z_min 4300 --z_max 5600 [--seed N]

757f70c, run 1   in_surface_frac_valid 0.585106372833252  surface_missing_fraction 0.9712849855422974  winding_valid_fraction 0.0
757f70c, run 2   (identical)
757f70c, run 3   (identical)
patched, seed 0  (identical)  ... through seed 5 (identical)
```

Runtime over three runs each: 8.21 / 8.28 / 8.34 s before, 8.29 / 8.43 / 8.48 s after.

New test, under the existing `vc-core` ctest label:

```
$ ctest -R test_random_restarts --output-on-failure
1/1 Test #4: test_random_restarts .............   Passed    0.00 sec
Label Time Summary:
    vc-core    =   0.00 sec*proc (1 test)
```

11 cases. Each was checked by breaking `RandomRestarts.hpp` on purpose, nine ways, one at a time — a constant seed, a dropped `user_seed`, height ignored, an off-by-one at the top of the range, an `srand()` put back in, a generator that ignores its seed, the degenerate-grid guard removed, a sampler that returns one point 1000 times, and float bits rounded before hashing. All nine were caught.

And, with no OpenCV or CMake at all, the pattern the old line produces:

```
$ g++ -O2 srand_pattern.cpp -o srand_pattern && ./srand_pattern
1. two calls in the SAME second produce an identical pattern : YES
2. one second later, draws that differ                      : 1976 / 2000 (98.8%)
3. an unrelated caller's rand() stream is clobbered         : YES
```

**Why / where this is useful:** `eval_surface_tracer.py` ranks traces by `winding_valid_fraction` and averages the top `num_best_traces_to_average`. As long as the draw is tied to the clock, a re-run of that evaluation is a different sample and nobody can tell a real difference between two traces from a difference in the draw. This PR makes the number repeatable and adds `scripts/evaluation/metric_noise_floor.py`, which scores traces under N seeds and prints, per pair, whether the gap between them is larger than the metric's own spread — and how many distinct rankings the seeds produced. On my surface the metric did not move at all between draws; on your traces that is now one command to check, and I could not check it myself because those traces are not public.

- [ ] I personally verified that the example and proof above were produced by this PR on the stated data.

## Details

Tested commit: `757f70c`. Ubuntu 24.04, gcc 13.3, `-DCMAKE_BUILD_TYPE=Release -DVC_BUILD_APPS=ON -DVC_TESTING=ON`.

Data, all from `dl.ash2txt.org`:
- `full-scrolls/Scroll5/PHerc172.volpkg/working/wrap_labels.json` (3888 annotated points, 414 collections; 1393 adjacent pairs in `4300 <= z <= 5600`).
- `full-scrolls/Scroll5/PHerc172.volpkg/thaumato_outputs/scroll5_thaumato_jan15/working/working_mesh_0_window_147990_197990_flatboi/mesh_0_window_147990_197990_flatboi.obj`, cropped to `4300 <= z <= 5600` as a pure subset of faces (no vertex moved), converted with `vc_obj2tifxyz`. 1932 x 4234 grid, 1.08 M valid cells. Its `meta.json` scale was rewritten to the measured median 3D spacing between adjacent grid cells (0.2352, 0.1729 samples per voxel), because `vc_obj2tifxyz` in `--uv-metric` mode writes OBJ-units-per-sample there rather than samples-per-voxel when the input OBJ has normalised UVs — that looks like a separate bug and is not touched by this PR.

Limitations, stated plainly:
- `surface_missing_fraction` was 0.9712849855422974 on that surface: 1353 of 1393 pairs found no intersection at all, 40 did. Those 40 are the only ones the draw could have moved, and it moved none of them — the local descent reaches them from essentially anywhere on the grid.
- `winding_valid_fraction` was 0.0 throughout, because `vc_tifxyz_winding` reported `wind x step: 0` on this surface and produced an all-zero winding field. So the ranking metric itself was not exercised. A trace out of `eval_surface_tracer.py` would exercise it; those are not public.
- So this PR does not claim to have found a wrong ranking. It claims the draw was tied to the clock, that this is fixed at no cost in behaviour or runtime, and that the question of how much the metric moves is now answerable.

Two observations found along the way and deliberately left alone, to keep the diff minimal:
- `apps/src/vc_tifxyz_gengt.cpp:108` already runs the same 1000-restart search correctly, with `rand_r()` and a caller-owned seed from the data. This PR makes `surface_metrics.cpp` consistent with it. The same file's line 186 does use bare `rand()`.
- `srand` appears in only one other place in `core/` and `apps/`: `vc_grow_seg_from_seed.cpp:369`, `srand(clock())` once in `main`, which is where seeding belongs.
