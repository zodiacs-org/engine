#!/usr/bin/env python3
"""Independent upstream reference values and orientation identities."""
import json
import math
import unittest
from pathlib import Path

import erfa
import numpy as np

from rotations import (ARCSEC_RAD, metadata, orientation_matrices,
                       project_vector, rx, rz, spherical, versions)


class RotationTests(unittest.TestCase):
    def test_pinned_versions(self):
        self.assertEqual(versions()["pyerfa"], "2.0.1.5")

    def test_upstream_ecm06_matrix(self):
        expected = np.array([
            [0.9999952427708701137, -0.2829062057663042347e-2, -0.1229163741100017629e-2],
            [0.3084546876908653562e-2, 0.9174891871550392514, 0.3977487611849338124],
            [0.2488512951527405928e-5, -0.3977506604161195467, 0.9174935488232863071]])
        result = orientation_matrices(2456165.5, 0.401182685)["mean_of_date_iau2006"]
        np.testing.assert_allclose(result, expected, rtol=0, atol=1e-14)

    def test_upstream_pnm06a_matrix(self):
        expected = np.array([
            [0.9999995832794205484, 0.8372382772630962111e-3, 0.3639684771140623099e-3],
            [-0.8372533744743683605e-3, 0.9999996486492861646, 0.4132905944611019498e-4],
            [-0.3639337469629464969e-3, -0.4163377605910663999e-4, 0.9999999329094260057]])
        np.testing.assert_allclose(erfa.pnm06a(2400000.5, 50123.9999), expected, rtol=0, atol=1e-14)

    def test_upstream_eqec06_spherical(self):
        ra, dec = 1.234, 0.987
        vector = [math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)]
        out = project_vector(vector, 1234.5, 2440000.5)["projections"]["mean_of_date_iau2006"]
        self.assertAlmostEqual(math.radians(out["longitude_deg"]), 1.342509918994654619, delta=1e-14)
        self.assertAlmostEqual(math.radians(out["latitude_deg"]), 0.5926215259704608132, delta=1e-14)

    def test_orthogonality_and_inverse_grid(self):
        for offset in (-73050, -18262.5, 0, 9777.75, 18262.5, 36525, 73050):
            for frame in ("icrs", "mean_j2000"):
                for matrix in orientation_matrices(2451545, offset, input_frame=frame).values():
                    np.testing.assert_allclose(matrix @ matrix.T, np.eye(3), rtol=0, atol=1e-14)
                    self.assertAlmostEqual(np.linalg.det(matrix), 1, delta=1e-14)
                    for vector in ([1, 0, 0], [0, 1, 0], [0, 0, 1], [1.25, -4.5, 0.3]):
                        np.testing.assert_allclose(matrix.T @ (matrix @ vector), vector, rtol=0, atol=1e-13)

    def test_true_vs_mean_is_longitude_nutation(self):
        # Independent construction: rotate the mean-ecliptic axes in longitude.
        for offset in (-73050, -18262.5, 0, 9777.75, 36525, 73050):
            dpsi, _ = erfa.nut06a(2451545, offset)
            matrices = orientation_matrices(2451545, offset)
            alternative = rz(-float(dpsi)) @ matrices["mean_of_date_iau2006"]
            np.testing.assert_allclose(matrices["true_of_date_iau2006_2000a"], alternative, rtol=0, atol=1e-14)

    def test_j2000_bias_cancellation(self):
        matrices = orientation_matrices(2451545, input_frame="mean_j2000")
        np.testing.assert_allclose(matrices["fixed_j2000_iau2006"], rx(84381.406 * ARCSEC_RAD), rtol=0, atol=1e-14)
        np.testing.assert_allclose(matrices["fixed_j2000_obliquity_84381_448"], rx(84381.448 * ARCSEC_RAD), rtol=0, atol=1e-14)

    def test_date_partition_invariance(self):
        a = orientation_matrices(2456165.5, 0.401182685)
        b = orientation_matrices(2451545.0, 4620.901182685)
        for name in a:
            np.testing.assert_allclose(a[name], b[name], rtol=0, atol=1e-14)

    def test_norm_preserved_and_quadrants(self):
        for lon in (0, 0.000001, 89.999999, 90, 180, 270, 359.999999):
            vector = [2 * math.cos(math.radians(lon)), 2 * math.sin(math.radians(lon)), 0]
            result = spherical(vector)
            self.assertAlmostEqual(result["longitude_deg"], lon, delta=1e-10)
            self.assertAlmostEqual(result["radius_input_units"], 2, delta=1e-14)
        out = project_vector([1, 2, 3], 2451545, 9777.75)
        for row in out["projections"].values():
            self.assertAlmostEqual(row["radius_input_units"], math.sqrt(14), delta=1e-14)

    def test_reject_invalid_inputs(self):
        for bad in ([0, 0, 0], [float("nan"), 0, 0], [1, 2], [float("inf"), 0, 0]):
            with self.assertRaises(ValueError):
                project_vector(bad, 2451545)
        with self.assertRaises(ValueError):
            orientation_matrices(float("nan"))
        with self.assertRaises(ValueError):
            orientation_matrices(2451545, input_frame="unlabelled")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(RotationTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    output = {"tests_run": result.testsRun, "passed": result.wasSuccessful(),
              "errors": len(result.errors), "failures": len(result.failures),
              "reference_epoch": metadata(2451545, 9777.75),
              "scope": "Orientation-only controls; no engine positional accuracy claim."}
    Path(__file__).with_name("controls.json").write_text(json.dumps(output, indent=2, allow_nan=False) + "\n")
    raise SystemExit(0 if result.wasSuccessful() else 1)
