# Progress Prize form — one answer per field

Form: <https://docs.google.com/forms/d/e/1FAIpQLScNBMj25FMnphngRG1Ciryv_2_Mkdq2YPJOD9WqPfZExII2iQ/viewform>
Deadline: 11:59pm Pacific, 30 September 2026. Multiple submissions per month are allowed.

## 1. Your full name *
Fill in yourself.

## 2. Team description *
```
Individual submission. One person, no team.
```

## 3. Discord display name
Fill in yourself, or leave blank.

## 4. URL *
```
https://github.com/tchubirs/tchubirs.github.io/tree/claude/ai-revenue-automation-map-g00jks/vazamento
```

## 5. What is your contribution? *
```
An audit of how the public ink labels and the official ink-training code (vesuvius/src/vesuvius/ink_detection) keep training data apart from validation data. It found three problems, all measured on your public data: a silent loader bug with a one-file fix, duplicate papyrus under different names in the shipped training corpus, and a validation region that another segment trains on.

(1) WHICH SCROLL DATA

The public ink labels in the scrollprize/datasets bucket on Hugging Face: PHercParis4 (8 segments), PHerc 139 (11), PHerc 1667 (6), PHerc 841 (3), plus the file listings of 814, 0009B, 0500P2 and MAN5. Each segment's x/y/z.tif (3D position of every grid cell), inklabels, supervision_mask and, where published, validation_mask_v2.

(2) HOW THIS HELPS READ THE SCROLLS

Ink models are chosen and tuned on their validation score. If validation pixels are trained on, the score is optimistic and the wrong model or setting wins. Your Grand Prize rules name this directly: "No overlap between training and prediction regions. Overlap leads to the memorization of annotated labels."

Finding 1 - the loader silently drops validation masks. discover_segment_labels() only accepts a label whose prefix equals the segment directory name. Six published segments (PHerc 1667 w018, w023, w028, w029, w031 and 0009B auto_grown_20250919055754487_inp_hr) name their v2 labels and validation mask without the directory's "_2um" suffix. Running villa's own discover_segment_labels(), unmodified, on the exact published file names returns the v1 labels and validation_mask=None for all six: nothing is held out and no warning is raised. validate_segments.py reports the same tree as clean (exit 0) because it never compares the prefix.

Finding 2 - the same papyrus labelled twice under two names. aligned21_fixed_scroll_prior.json already dedupes "duplicate public/native representations" by physical_segment_key, which is a name. By geometry, two pairs in that corpus are the same sheet:
- Paris4 w01_20230702185753_r15 / w02_20231031143852: 4.1% of w02's labelled area within 16 voxels of w01's, flat from 8 to 32 vx. On the shared cells the ink labels agree 94.5% (chance 56.5%), ink IoU 0.84.
- PHerc 139 w028_20260115221 / w044_2026011522: 37% of w028's labelled area within 4 voxels of w044's. Ink agreement 84.7% (chance 50.1%), IoU 0.72.
Every other pair in Paris4, 139 and 841 stays at or below 1% up to 16 vx: neighbouring sheets, not duplicates.

Finding 3 - a validation region trained on through another segment. exclude_validation_voxels() removes a segment's validation voxels only from that same segment. In PHerc 1667, with the published v2 masks, 31.0% (8 vx) to 34.9% (16 vx) of w029's validation area lies on w028's training area (supervision minus validation). On those cells the ink labels agree 90.8% (chance 50.1%), IoU 0.82. Both segments are in the shipped 29-segment corpus.

(3) WHAT IS NOW POSSIBLE THAT WAS NOT

- validate_segments.py catches finding 1. The patch makes it apply the loader's own prefix rule: every label TIFF the training loader would ignore is reported, and it no longer counts as "present". On the published names it flags 8 directories where it previously flagged none.
- src/overlap.py finds duplicate papyrus and cross-segment validation overlap from the files every segment already ships (x/y/z + masks), with no GPU and no volume data. That makes it possible to dedupe by geometry rather than by name, and to check any validation mask against every other segment's training area before trusting a score.

(4) EVIDENCE

- The patch (patch/0001-validate-segments-flag-ignored-labels.patch) applies to 557df7c and f4570bf. A new test in tests/ink_detection/test_curation_preprocessing.py, built on the published 1667 layout, fails on the original code and passes on the patched one; the whole file passes (36 tests). Four deliberate breakages of the fix were each caught.
- Validator before/after on a tree with the exact published names: results/validate_segments_before.txt (exit 0, nothing reported) and results/validate_segments_after.txt (exit 1, each ignored file named).
- tools/run_villa_label_discovery.py imports villa's segment.py unmodified and prints what discover_segment_labels() returns for every published segment.
- overlap.py has 14 unit tests; nine deliberate breakages were each caught. Pairwise tables for Paris4, 139 and 1667 in results/.
- tools/ink_agreement.py computes the ink-label agreement on shared cells used for every "same papyrus" claim above.

WHAT THIS DOES NOT SHOW

I did not retrain a model, so I have not measured how much the leak inflates a reported score; that needs your GPU runs. PHerc 139 w028's published validation area touches none of w044's training area, so that duplicate is a double-counted budget, not a validation leak today. Paris4 publishes no validation masks. The aligned21 corpus uses its own preprocessed copies; finding 1 concerns the public bucket layout that dino_guided_v3.json points segments_path at, and I cannot see whether your internal copies carry the same names. Findings 2 and 3 are geometry and labels, so they hold for any copy of those segments.

DISCLOSURE

The analysis, code, patch and measurements were produced by an AI agent (Claude Code) reading the repository and the public data and running your own code. Every number came from a command that was run; where a measurement came out against the hypothesis it is reported that way.
```

## 6. Terms and Conditions *
Tick **Yes, I agree**.
