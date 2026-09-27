# October 2026 submission — ready, not sent

Follow-up to the September submission of this directory. To be sent in October, after
the September results are out. Same six fields as before; only field 5 changes.

## 4. URL
```
https://github.com/tchubirs/tchubirs.github.io/tree/claude/ai-revenue-automation-map-g00jks/vazamento
```

## 5. What is your contribution?
```
A fix for the validation leak I reported in September, verified on your published PHerc 1667 labels with your own loader.

(1) WHICH SCROLL DATA

PHerc 1667, the six ink-labelled segments in the public scrollprize/datasets bucket (x/y/z.tif, inklabels, supervision_mask and validation_mask_v2).

(2) HOW THIS HELPS READ THE SCROLLS

Ink models are chosen on their validation score. In the published PHerc 1667 labels, 31-35% of w029's validation area lies on w028's training area, and on those cells the text is the same (ink labels agree 90.8%, chance 50.1%). The trainer removes validation voxels only from the segment they belong to, so a model trained on this corpus is partly scored on text it has trained on.

(3) WHAT IS NOW POSSIBLE THAT WAS NOT

src/leakfree.py removes, for every segment in a scroll directory, the training cells that lie near any other segment's validation region, and writes the result as the next label version under the directory-name prefix. discover_segment_labels() selects it and create_label_zarrs converts it as usual: no change to the training code.

(4) EVIDENCE

- w029 validation lying on w028 training, at 4 / 8 / 16 vx: 10.2% / 31.0% / 34.9% before; 0 / 0 / 0 after the default 16 vx fix. With exact-cell matching no cell is shared at 8, 16 or 32 vx after the fix.
- Cost: w028 loses 5,465 of 34,335 training cells (15.9%); w023 loses 317 of 219,020 (0.14%). Every other segment is unchanged.
- Why 16 vx and not 8: the two traces of this papyrus drift up to ~30 vx apart. After an 8 vx fix, 368 cells still shared at 32 vx carry the same text (88.6% agreement, chance 64.8%). After 16 vx, none.
- The 317 w023 cells are collateral, not a duplicate: 65.6% agreement (chance 49.7%, IoU 0.42) against 92% (IoU 0.77-0.82) for the w028/w029 pair.
- On the written files: the new w028 supervision mask only switches pixels off (2,159,328), none on; your own discover_segment_labels(extension=".tif"), unmodified, selects the new inklabels, supervision_mask and validation_mask v3 - including the validation mask it could not see before because of the "_2um" naming mismatch.
- 27 unit tests; thirteen deliberate breakages of leakfree.py were each caught.

WHAT THIS DOES NOT SHOW

I still have not retrained a model, so how many points the leak adds to a reported score is not measured. The fix is conservative: it gives up 15.9% of w028's training cells to remove the leak completely.

DISCLOSURE

Produced by an AI agent (Claude Code) reading your repository and public data and running your code. Every number came from a command that was run.
```
