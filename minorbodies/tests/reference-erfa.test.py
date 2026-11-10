"""Independent reducer contract tests; not a minor-body accuracy corpus."""

import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
import unittest

import erfa
import numpy as np


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "reference-erfa.py"
SPEC = importlib.util.spec_from_file_location("reference_erfa", SCRIPT)
REFERENCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REFERENCE)


class ReferenceErfaTests(unittest.TestCase):
    def test_true_ecliptic_equals_independent_mean_ecliptic_plus_nutation(self):
        # erfa.ecm06 forms the mean ecliptic directly, without pnm06a or rx.
        # True equinox longitude is mean equinox longitude plus nutation in
        # longitude. Compare the full matrices, including poles and bias.
        for jd_tt in [2378496.5, 2451545.0, 2460676.5, 2524958.5]:
            date1, date2 = REFERENCE.J2000, jd_tt - REFERENCE.J2000
            nutation_longitude, _ = erfa.nut06a(date1, date2)
            mean_to_true = erfa.rz(-nutation_longitude, erfa.ecm06(date1, date2))
            actual = REFERENCE.true_ecliptic_matrix(jd_tt)
            np.testing.assert_allclose(actual, mean_to_true, rtol=0, atol=5e-16)
            np.testing.assert_allclose(actual @ actual.T, np.eye(3), rtol=0, atol=1e-15)
            self.assertAlmostEqual(np.linalg.det(actual), 1.0, delta=1e-15)

    def test_cartesian_norm_and_spherical_reconstruction(self):
        sample = {"jdTt": 2451545.0, "positionAu": [3.0, -4.0, 12.0]}
        result = REFERENCE.reduce_sample(sample)
        self.assertEqual(result["distanceAu"], 13.0)
        self.assertTrue(0 <= result["longitudeDeg"] < 360)
        self.assertTrue(-90 <= result["latitudeDeg"] <= 90)
        unit = erfa.s2c(math.radians(result["longitudeDeg"]), math.radians(result["latitudeDeg"]))
        restored = REFERENCE.true_ecliptic_matrix(sample["jdTt"]).T @ (unit * result["distanceAu"])
        np.testing.assert_allclose(restored, sample["positionAu"], rtol=0, atol=4e-15)

    def test_rejects_unsupported_and_nonfinite_inputs(self):
        invalid = [
            {}, {"samples": []}, {"samples": [], "extra": True},
            {"samples": [{"jdTt": True, "positionAu": [1, 2, 3]}]},
            {"samples": [{"jdTt": 2451545, "positionAu": [0, 0, 0]}]},
            {"samples": [{"jdTt": 2451545, "positionAu": [1, 2]}]},
            {"samples": [{"jdTt": 2451545, "positionAu": [1, 2, math.inf]}]},
            {"samples": [{"jdTt": 2451545, "positionAu": [1, 2, 3], "extra": 1}]},
        ]
        for document in invalid:
            with self.subTest(document=document), self.assertRaises(ValueError):
                REFERENCE.reduce_document(document)
        for raw in [b'{"samples": [], "samples": []}', b'{"samples": NaN}', b'\xff']:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                REFERENCE.parse_document(raw)

    def test_cli_reports_dependency_and_script_identity(self):
        document = {"samples": [{"jdTt": 2451545.0, "positionAu": [1.0, 0.0, 0.0]}]}
        completed = subprocess.run([sys.executable, str(SCRIPT)], input=json.dumps(document),
                                   capture_output=True, text=True, check=True)
        result = json.loads(completed.stdout)
        self.assertEqual(result, REFERENCE.reduce_document(document))
        self.assertEqual(result["reference"]["pyerfa"], "2.0.1.5")
        self.assertEqual(result["reference"]["erfa"], "2.0.1")
        self.assertEqual(len(result["reference"]["scriptSha256"]), 64)
        self.assertEqual(completed.stderr, "")


if __name__ == "__main__":
    unittest.main()
