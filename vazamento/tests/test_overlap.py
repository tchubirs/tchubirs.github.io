import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import overlap  # noqa: E402


def plane(n=60, z=100.0, x0=0.0, spacing=1.0):
    """A flat n x n grid of points at height z."""
    g = np.arange(n, dtype=np.float32) * spacing
    xx, yy = np.meshgrid(g + x0, g)
    return np.stack([xx.ravel(), yy.ravel(), np.full(xx.size, z, np.float32)], 1)


class CoveredFraction(unittest.TestCase):
    def test_identical_surfaces_are_fully_covered(self):
        p = plane()
        self.assertEqual(overlap.covered_fraction(p, p, 4.0), 1.0)

    def test_a_sheet_one_spacing_away_is_not_the_same_surface(self):
        # Two parallel sheets 40 voxels apart: invisible at tight tolerances,
        # fully covered once the tolerance reaches the spacing.
        a, b = plane(z=100.0), plane(z=140.0)
        self.assertEqual(overlap.covered_fraction(a, b, 4.0), 0.0)
        self.assertEqual(overlap.covered_fraction(a, b, 8.0), 0.0)
        self.assertEqual(overlap.covered_fraction(a, b, 64.0), 1.0)

    def test_tolerance_is_at_least_one_cell_and_at_most_two(self):
        a = plane(z=100.0)
        self.assertEqual(overlap.covered_fraction(a, plane(z=107.0), 8.0), 1.0)   # < cell
        self.assertEqual(overlap.covered_fraction(a, plane(z=125.0), 8.0), 0.0)   # > 2 cells

    def test_partial_overlap_is_measured_not_rounded(self):
        a = plane(n=60)
        b = plane(n=60, x0=30.0)          # covers the right half of a
        f = overlap.covered_fraction(a, b, 2.0)
        self.assertGreater(f, 0.45)
        self.assertLess(f, 0.60)

    def test_direction_matters(self):
        small, big = plane(n=20), plane(n=80)
        self.assertEqual(overlap.covered_fraction(small, big, 2.0), 1.0)
        self.assertLess(overlap.covered_fraction(big, small, 2.0), 0.2)

    def test_empty_sets_cover_nothing(self):
        e = np.zeros((0, 3), np.float32)
        self.assertEqual(overlap.covered_fraction(e, plane(), 4.0), 0.0)
        self.assertEqual(overlap.covered_fraction(plane(), e, 4.0), 0.0)

    def test_cells_straddling_zero_keep_their_width(self):
        # Truncation instead of floor would merge (-1, 1) into one cell twice as
        # wide, and -0.9 would wrongly cover 1.9 at cell 1 (true gap 2.8 > 2).
        a = np.array([[5.0, 5.0, -0.9]], np.float32)
        b = np.array([[5.0, 5.0, 1.9]], np.float32)
        self.assertEqual(overlap.covered_fraction(a, b, 1.0), 0.0)

    def test_negative_coordinates_do_not_alias(self):
        # The key packs three signed ints; a sign error would collide cells.
        a = plane(z=-500.0)
        b = plane(z=500.0)
        self.assertEqual(overlap.covered_fraction(a, b, 8.0), 0.0)


class BlockAny(unittest.TestCase):
    def test_one_pixel_lights_exactly_its_block(self):
        m = np.zeros((100, 200), bool)
        m[57, 133] = True
        out = overlap.block_any(m, (10, 20))
        self.assertEqual(out.sum(), 1)
        self.assertTrue(out[5, 13])

    def test_empty_mask_stays_empty(self):
        self.assertFalse(overlap.block_any(np.zeros((40, 40), bool), (4, 4)).any())


class Prefilter(unittest.TestCase):
    def test_far_apart_segments_are_skipped(self):
        self.assertFalse(overlap.bboxes_touch(plane(), plane(x0=10_000.0), 10.0))
        self.assertTrue(overlap.bboxes_touch(plane(), plane(x0=30.0), 10.0))


class LoadSegment(unittest.TestCase):
    def _write(self, root: Path, name: str, ext: str, supervised_rows: slice):
        d = root / name
        d.mkdir()
        h, w = 8, 8
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        tifffile.imwrite(d / "x.tif", xx + 1)
        tifffile.imwrite(d / "y.tif", yy + 1)
        z = np.full((h, w), 50.0, np.float32)
        z[0, 0] = -1.0                              # one invalid cell
        tifffile.imwrite(d / "z.tif", z)
        mask = np.zeros((h * 10, w * 10), np.uint8)  # labels live at 10x the grid
        mask[supervised_rows, :] = 255
        tifffile.imwrite(d / f"{name}_supervision_mask{ext}", mask)
        return d

    def test_only_supervised_valid_cells_become_points(self):
        with tempfile.TemporaryDirectory() as t:
            d = self._write(Path(t), "seg", ".tif", slice(0, 20))    # grid rows 0-1
            s = overlap.load_segment(d)
            self.assertEqual(len(s.points), 2 * 8 - 1)              # minus the invalid cell
            self.assertEqual(s.n_valid, 8 * 8 - 1)

    def test_tiff_extension_is_accepted(self):
        # The public dataset uses both spellings (w03 and w09 of PHercParis4).
        with tempfile.TemporaryDirectory() as t:
            d = self._write(Path(t), "seg", ".tiff", slice(0, 10))
            s = overlap.load_segment(d)
            self.assertEqual(len(s.points), 8 - 1)


class Pairwise(unittest.TestCase):
    def test_reports_both_directions_and_skips_self(self):
        segs = [overlap.Segment("a", plane(n=20), 400), overlap.Segment("b", plane(n=40), 1600)]
        res = overlap.pairwise(segs, [2.0])
        self.assertEqual(set(res), {"a|b", "b|a"})
        self.assertEqual(res["a|b"]["2.0"], 1.0)


if __name__ == "__main__":
    unittest.main()
