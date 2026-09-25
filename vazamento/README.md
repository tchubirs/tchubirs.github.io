# Ink-label leakage audit for the Vesuvius Challenge

Three measured problems in how the public ink labels and the official ink-training
code (`vesuvius/src/vesuvius/ink_detection`) keep training data apart from validation
data, a one-file fix for the one that is a plain bug, and the tool that finds the
other two.

Everything below was measured on the public `scrollprize/datasets` ink bucket on
Hugging Face and the `ScrollPrize/villa` code at `557df7c`, on 2026-09-25.

## 1. The official loader silently drops published validation masks

`discover_segment_labels()` (`ink_detection/data/segment.py`) only accepts a label
file whose prefix is exactly the segment directory's name. In the public bucket, six
segments ship their v2 labels and their validation mask under a prefix without the
directory's `_2um` suffix:

| Segment directory | Published validation mask | What the loader returns |
|---|---|---|
| `1667/w018_20240304144031_2um` | `w018_20240304144031_validation_mask_v2` | v1 labels, `validation_mask=None` |
| `1667/w023_20240304161941_2um` | `w023_20240304161941_validation_mask_v2` | v1 labels, `validation_mask=None` |
| `1667/w028_20251208130119156_2um` | `w028_20251208130119156_validation_mask_v2` | v1 labels, `validation_mask=None` |
| `1667/w029_20251212185248662_2um` | `w029_20251212185248662_validation_mask_v2` | v1 labels, `validation_mask=None` |
| `1667/w031_2025122323_2um` | `w031_2025122323_validation_mask_v2` | v1 labels, `validation_mask=None` |
| `0009b/auto_grown_20250919055754487_inp_hr_2um` | `auto_grown_20250919055754487_inp_hr_validation_mask_v2` | v1 labels, `validation_mask=None` |

The right-hand column is not my reading of the code: `tools/run_villa_label_discovery.py`
imports villa's own `segment.py`, unmodified, and calls `discover_segment_labels()` on
directories carrying exactly the file names the bucket publishes. With no validation
mask, nothing is held out: every pixel the dataset authors marked for validation is
trained on, with the older label version, and no error or warning is raised.

The repository already has a checker for the dataset, `validate_segments.py`. It parses
the same label names but never compares the prefix with the directory, so it reports
these segments as fine. Run over a tree with the published names
(`tools/mirror_published_names.py`, tiny blank files, real names):

- **before**: exit 0, not one line about any of these segments
  (`results/validate_segments_before.txt`)
- **after the patch**: exit 1, every ignored file named, in 8 directories — the six
  above, `1667/w013_20240304141531_2um` (v1 TIFFs only), and `phercparis4/w05_4424`,
  which carries stray `4424_*` copies beside its correctly named labels
  (`results/validate_segments_after.txt`)

### The patch

`patch/0001-validate-segments-flag-ignored-labels.patch`, applies to `557df7c` and
`f4570bf`. `validate_segments.py` now applies the loader's prefix rule: a label TIFF
whose prefix is not the directory name is reported as an issue, and it no longer
counts towards "required label present". One new test in
`tests/ink_detection/test_curation_preprocessing.py`, built on the published 1667
layout. It fails on the original code and passes on the patched one; the whole file
passes (36 tests). Four deliberate breakages of the fix were each caught by it.

The data itself is the other half of the fix — renaming the 1667 and 0009B label files
in the bucket — and that is the maintainers' call.

## 2. The same papyrus, labelled twice, under two different names

`configs/aligned21_fixed_scroll_prior.json`, the shipped 29-segment training corpus,
already knows duplicates exist: *"duplicate public/native representations share one
physical-segment budget"*, keyed by `physical_segment_key`. That key is a name. Two
segments with different names that trace the same sheet are invisible to it.

Every published segment carries the 3D position of every grid cell (`x/y/z.tif`) and
its supervision mask. `src/overlap.py` measures, for each pair, how much of one
segment's labelled area lies within a given distance of the other's. Same-sheet traces
show a flat plateau from a few voxels on; neighbouring sheets only appear once the
tolerance reaches the sheet spacing. Then `tools/ink_agreement.py` checks the ink
labels on the shared cells: the same papyrus must carry the same text.

| Pair (both in the corpus) | Shared labelled area | Ink agreement on shared cells | Chance | Ink IoU |
|---|---|---|---|---|
| Paris4 `w01_20230702185753_r15` / `w02_20231031143852` | 4.1% of w02's within 16 vx (plateau 3.8–4.4% from 8 to 32) | 94.5% (7,053 cells) | 56.5% | 0.84 |
| PHerc 139 `w028_20260115221` / `w044_2026011522` | 37% of w028's within 4 vx (flat to 128) | 84.7% (1,656 cells) | 50.1% | 0.72 |

Every other pair across Paris4 (8 segments), PHerc 139 (11) and PHerc 841 (3) stays
at or below 1.0% of labelled area up to 16 vx and only grows from 32 vx on — the
signature of a neighbouring sheet, not a duplicate. (The largest: Paris4 `w06_1321`
over `w05_4424`, 0.1% at 8 vx and 0.8% at 16; PHerc 139 `w041` over `w040`, 1.0% at
16.) Full tables in `results/`.

## 3. A validation region that another segment trains on

The in-segment exclusion (`exclude_validation_voxels` in `data/dataset.py`) removes a
segment's validation voxels from *that segment's* training patches. Nothing removes
them from another segment that covers the same papyrus.

PHerc 1667, with the v2 masks the dataset publishes (training = supervision minus
validation):

| Validation area of | Lies on the training area of | 4 vx | 8 vx | 16 vx | 32 vx |
|---|---|---|---|---|---|
| `w029_20251212185248662_2um` | `w028_20251208130119156_2um` | 10.2% | **31.0%** | 34.9% | 36.9% |
| `w028_20251208130119156_2um` | `w023_20240304161941_2um` | 0.0% | 0.0% | 1.9% | 17.9% |

On the w029/w028 cells the ink labels agree 90.8% (458 cells; chance 50.1%), ink IoU
0.82. About a third of w029's validation set is text the model is trained on through
w028. Both segments are in the shipped corpus. The second row is a neighbouring sheet
(nothing below 16 vx), not a leak.

## What this does not show

- **No retrained model.** I have not measured how much the leak inflates a reported
  validation score; that needs the GPU training runs the team already has. What is
  measured is the overlap and that the text on it is the same.
- **PHerc 139 w028/w044 is not a validation leak today.** w028's published validation
  area touches none of w044's training area (0.000 at every tolerance up to 32 vx).
  The duplicate still counts twice against the per-scroll budget the manifest sets out
  to control.
- **Paris4 publishes no validation masks**, so for w01/w02 the leak depends on where a
  user draws one.
- **The aligned21 corpus uses its own preprocessed copies** (`public_2p4_level2_zmean4`,
  `native_9p362_level0`). Finding 1 is about the public bucket layout that
  `dino_guided_v3.json` points `segments_path` at; I cannot see whether the internal
  copies carry the same names. Findings 2 and 3 are about geometry and labels, so they
  hold for any copy of those segments.
- PHerc 1667 `w013` publishes no v2 masks, so it was left out of section 3.

## Reproducing it

```
pip install numpy tifffile imagecodecs
python -m unittest discover -s tests          # 14 tests for overlap.py
python src/overlap.py <segment dirs...>       # pairwise labelled-area overlap
python tools/ink_agreement.py A B 8 <root>    # ink-label agreement on shared cells
python tools/run_villa_label_discovery.py 1667   # villa's own loader on the published names
```

`tests/test_overlap.py`: 14 tests. Nine deliberate breakages of `overlap.py` (no
neighbour cells, truncation instead of floor, z dropped from the cell key, supervision
ignored, invalid cells counted, `.tiff` not accepted, prefilter always false, fraction
of the wrong set, mask downsampling off by one row) were each caught.

## Disclosure

The analysis, code, patch and measurements were produced by an AI agent (Claude Code)
reading the repository and the public data and running villa's own code. Every number
above came from a command that was run; where a measurement came out against the
hypothesis (PHerc 139 validation, PHerc 841, the w023 row) it is reported that way.

MIT licence.
