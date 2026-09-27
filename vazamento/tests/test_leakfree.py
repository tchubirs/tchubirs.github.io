import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import leakfree  # noqa: E402
import overlap   # noqa: E402

H, W, F = 12, 16, 10          # grid size, label pixels per grid cell


def make_segment(root: Path, dirname: str, prefix: str, z: float, *, version: str = "",
                 val_cols: slice | None = None, ink_value: int = 255,
                 sup_cols: slice | None = None) -> Path:
    """A flat sheet at height z: grid cell (r, c) sits at (c*4 + 1, r*4 + 1, z)."""
    d = root / dirname
    d.mkdir(parents=True)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    tifffile.imwrite(d / "x.tif", xx * 4 + 1)
    tifffile.imwrite(d / "y.tif", yy * 4 + 1)
    tifffile.imwrite(d / "z.tif", np.full((H, W), z, np.float32))
    sup = np.full((H * F, W * F), 255, np.uint8)
    if sup_cols is not None:
        sup[:] = 0
        sup[:, sup_cols.start * F: sup_cols.stop * F] = 255
    ink = np.zeros((H * F, W * F), np.uint8)
    ink[::7, ::5] = ink_value
    tifffile.imwrite(d / f"{prefix}_supervision_mask{version}.tif", sup)
    tifffile.imwrite(d / f"{prefix}_inklabels{version}.tif", ink)
    if val_cols is not None:
        val = np.zeros((H * F, W * F), np.uint8)
        val[:, val_cols.start * F: val_cols.stop * F] = 255
        tifffile.imwrite(d / f"{prefix}_validation_mask{version}.tif", val)
    return d


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


class Leakfree(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "1667"

    def tearDown(self):
        self.tmp.cleanup()

    def test_drops_exactly_the_cells_on_another_segments_validation(self):
        make_segment(self.root, "a", "a", z=100.0)
        make_segment(self.root, "b", "b", z=100.0, val_cols=slice(0, 6))
        rep = leakfree.run(self.root, cell=2.0, write=True)
        new = tifffile.imread(self.root / "a" / "a_supervision_mask_v2.tif")
        # Columns 0-5 of the grid are b's validation, so a loses exactly those cells.
        self.assertTrue((new[:, : 6 * F] == 0).all())
        self.assertTrue((new[:, 6 * F:] == 255).all())
        self.assertEqual(rep["segments"]["a"]["dropped_cells"], H * 6)
        # b has no other segment's validation near it: nothing is written for it.
        self.assertEqual(rep["segments"]["b"]["dropped_cells"], 0)
        self.assertEqual(rep["segments"]["b"]["written"], [])
        self.assertFalse(any("_v2" in p.name for p in (self.root / "b").iterdir()))

    def test_only_supervised_cells_count_as_dropped(self):
        # a is labelled on columns 10-15 only; b's validation covers the whole sheet.
        # The cost of the fix is 6 columns of a's training area, not the whole sheet.
        make_segment(self.root, "a", "a", z=100.0, sup_cols=slice(10, 16))
        make_segment(self.root, "b", "b", z=100.0, val_cols=slice(0, 16))
        rep = leakfree.run(self.root, cell=2.0, write=False)
        self.assertEqual(rep["segments"]["a"]["supervised_cells"], H * 6)
        self.assertEqual(rep["segments"]["a"]["dropped_cells"], H * 6)
        self.assertEqual(rep["segments"]["a"]["dropped_fraction"], 1.0)

    def test_a_neighbouring_sheet_is_left_alone(self):
        make_segment(self.root, "a", "a", z=100.0)
        make_segment(self.root, "b", "b", z=160.0, val_cols=slice(0, 6))
        rep = leakfree.run(self.root, cell=8.0, write=True)
        self.assertEqual(rep["segments"]["a"]["dropped_cells"], 0)
        self.assertEqual(rep["segments"]["a"]["written"], [])

    def test_dry_run_writes_nothing(self):
        make_segment(self.root, "a", "a", z=100.0)
        make_segment(self.root, "b", "b", z=100.0, val_cols=slice(0, 6))
        before = sorted(p.name for p in self.root.rglob("*"))
        rep = leakfree.run(self.root, cell=2.0, write=False)
        self.assertEqual(rep["segments"]["a"]["dropped_cells"], H * 6)
        self.assertEqual(sorted(p.name for p in self.root.rglob("*")), before)

    def test_writes_next_version_under_the_directory_name(self):
        # The published PHerc1667 layout: directory "w028_2um", files "w028_*_v2".
        make_segment(self.root, "w028_2um", "w028", z=100.0, version="_v2")
        b = make_segment(self.root, "w029_2um", "w029", z=100.0, version="_v2", val_cols=slice(0, 4))
        rep = leakfree.run(self.root, cell=2.0, write=True)
        a = self.root / "w028_2um"
        self.assertEqual(rep["segments"]["w028_2um"]["labels_prefix"], "w028")
        self.assertEqual(sorted(rep["segments"]["w028_2um"]["written"]),
                         ["w028_2um_inklabels_v3.tif", "w028_2um_supervision_mask_v3.tif"])
        # The loader's rule: prefix must equal the directory name.
        for name in rep["segments"]["w028_2um"]["written"]:
            self.assertEqual(leakfree.LABEL_RE.match(name).group("prefix"), a.name)
        # Ink labels are carried over byte for byte.
        self.assertEqual(sha(a / "w028_2um_inklabels_v3.tif"), sha(a / "w028_inklabels_v2.tif"))
        # b keeps its own validation; nothing of it is dropped, nothing written.
        self.assertEqual(rep["segments"]["w029_2um"]["written"], [])
        self.assertTrue((b / "w029_validation_mask_v2.tif").exists())

    def test_validation_mask_travels_with_the_new_version(self):
        make_segment(self.root, "a", "a", z=100.0, val_cols=slice(10, 12))
        make_segment(self.root, "b", "b", z=100.0, val_cols=slice(0, 4))
        leakfree.run(self.root, cell=2.0, write=True)
        a = self.root / "a"
        self.assertEqual(sha(a / "a_validation_mask_v2.tif"), sha(a / "a_validation_mask.tif"))
        new = tifffile.imread(a / "a_supervision_mask_v2.tif")
        # a loses b's validation columns (0-3), and b loses a's (10-11).
        self.assertTrue((new[:, : 4 * F] == 0).all())
        self.assertTrue((new[:, 4 * F:] == 255).all())
        newb = tifffile.imread(self.root / "b" / "b_supervision_mask_v2.tif")
        self.assertTrue((newb[:, 10 * F: 12 * F] == 0).all())
        self.assertEqual(int((newb == 0).sum()), H * F * 2 * F)

    def test_refuses_to_overwrite(self):
        # Inputs are "w028_*_v2"; a stray "w028_2um_supervision_mask_v3.tif" (no matching
        # inklabels, so not a usable label set) already sits where the output would go.
        a = make_segment(self.root, "w028_2um", "w028", z=100.0, version="_v2")
        make_segment(self.root, "w029_2um", "w029", z=100.0, version="_v2", val_cols=slice(0, 4))
        stray = a / "w028_2um_supervision_mask_v3.tif"
        tifffile.imwrite(stray, np.full((H * F, W * F), 7, np.uint8))
        before = sha(stray)
        with self.assertRaises(FileExistsError):
            leakfree.run(self.root, cell=2.0, write=True)
        self.assertEqual(sha(stray), before)

    def test_a_corrupt_label_file_skips_that_segment_only(self):
        make_segment(self.root, "a", "a", z=100.0)
        bad = make_segment(self.root, "b", "b", z=100.0, val_cols=slice(0, 6))
        (bad / "b_supervision_mask_v2.tif").write_bytes(b"II*\x00truncated")
        (bad / "b_inklabels_v2.tif").write_bytes(b"II*\x00truncated")
        rep = leakfree.run(self.root, cell=2.0, write=False)
        self.assertIn("b", rep["skipped"])
        self.assertIn("b_supervision_mask_v2.tif", rep["skipped"]["b"])
        self.assertIn("a", rep["segments"])

    def test_non_tiff_files_with_label_names_are_ignored(self):
        # A failed download of a missing v2 file saves an HTML page under the TIFF name.
        a = make_segment(self.root, "a", "a", z=100.0)
        (a / "a_supervision_mask_v2.tif").write_text("<!doctype html>404")
        (a / "a_inklabels_v2.tif").write_text("<!doctype html>404")
        labels = leakfree.find_labels(a)
        self.assertEqual(labels.version, 1)
        self.assertEqual(labels.files["supervision_mask"].name, "a_supervision_mask.tif")

    def test_exact_directory_prefix_wins_over_a_shorter_one(self):
        d = make_segment(self.root, "w1_2um", "w1", z=100.0, version="_v5")
        tifffile.imwrite(d / "w1_2um_supervision_mask.tif", np.zeros((H * F, W * F), np.uint8))
        tifffile.imwrite(d / "w1_2um_inklabels.tif", np.zeros((H * F, W * F), np.uint8))
        labels = leakfree.find_labels(d)
        self.assertEqual(labels.prefix, "w1_2um")
        self.assertEqual(labels.version, 1)

    def test_missing_labels_are_reported_not_fatal(self):
        make_segment(self.root, "a", "a", z=100.0)
        d = self.root / "empty"
        d.mkdir()
        for c in "xyz":
            tifffile.imwrite(d / f"{c}.tif", np.ones((H, W), np.float32))
        rep = leakfree.run(self.root, cell=2.0, write=False)
        self.assertIn("empty", rep["skipped"])
        self.assertIn("a", rep["segments"])

    def test_cell_expansion_round_trips_through_block_any(self):
        rng = np.random.default_rng(0)
        drop = rng.random((H, W)) < 0.3
        sup_file = Path(self.tmp.name) / "sup.tif"
        tifffile.imwrite(sup_file, np.full((H * F + 3, W * F + 7), 255, np.uint8))  # not a multiple
        cleaned = leakfree.cleaned_supervision(sup_file, drop, rows_per_block=17)
        back = overlap.block_any(cleaned == 0, (H, W))
        self.assertTrue((back == drop).all())


if __name__ == "__main__":
    unittest.main()
