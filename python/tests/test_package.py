"""Installed-wheel regression and transport tests, not accuracy claims."""
from datetime import datetime, timezone, timedelta
from importlib.metadata import version
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch

import zodiacs

BIRTH = {"utc": "2000-01-01T12:00:00Z", "latitude": 40, "longitude": -74}
TARGET = "2020-01-01T00:00:00Z"


class InstalledPackageTests(unittest.TestCase):
    def test_installed_distribution(self):
        self.assertNotIn("python/src", Path(zodiacs.__file__).as_posix())
        self.assertEqual(zodiacs.__version__, version("zodiacs"))

    def test_parity_with_direct_engine_import(self):
        # Direct calls bypass the bridge and Python argument conversion.
        operations = [
            ("positions", "positions", [BIRTH["utc"]]),
            ("natal_chart", "natalChart", [BIRTH]),
            ("moon_phase", "moonPhase", [TARGET]),
            ("transits", "transits", [BIRTH, TARGET]),
            ("synastry", "synastry", [BIRTH, {**BIRTH, "utc": TARGET}]),
            ("chart_points", "chartPoints", [BIRTH]),
            ("chart_declinations", "chartDeclinations", [BIRTH]),
            ("progressed_bodies", "progressedBodies", [BIRTH["utc"], TARGET]),
            ("progressed_instant", "progressedInstant", [BIRTH["utc"], TARGET]),
        ]
        runtime = zodiacs._runtime()
        for python_name, js_name, args in operations:
            with self.subTest(operation=python_name):
                script = ("import * as e from './engine/dist/index.js';"
                          f"process.stdout.write(JSON.stringify(e.{js_name}(...{json.dumps(args)})))")
                direct = subprocess.run(["node", "--input-type=module", "-e", script],
                                        cwd=runtime, capture_output=True, text=True, check=True)
                self.assertEqual(getattr(zodiacs, python_name)(*args), json.loads(direct.stdout))

    def test_datetime_and_offset_roundtrip(self):
        expected = zodiacs.positions(BIRTH["utc"])
        self.assertEqual(expected, zodiacs.positions("2000-01-01T13:00:00+01:00"))
        self.assertEqual(expected, zodiacs.positions(datetime(2000, 1, 1, 12, tzinfo=timezone.utc)))

    def test_no_time_and_engine_version(self):
        chart = zodiacs.natal_chart({"utc": BIRTH["utc"], "timeKnown": False})
        self.assertIsNone(chart["houses"])
        self.assertIsNone(chart["angles"])
        self.assertEqual(chart["engineVersion"], zodiacs.ENGINE_VERSION)

    def test_reject_ambiguous_or_lossy_dates(self):
        for value in ["2000-01-01", "2000-02-30T00:00:00Z", "2000-01-01T12:00:00",
                      "2000-01-01T12:00:00.0001Z", "2000-01-01T12:00:00+00:99",
                      datetime(2000, 1, 1), 946728000,
                      datetime(2000, 1, 1, tzinfo=timezone(timedelta(microseconds=1))),
                      datetime(1, 1, 1, tzinfo=timezone(timedelta(hours=1))),
                      datetime(2000, 1, 1, microsecond=1, tzinfo=timezone.utc)]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                zodiacs.positions(value)

    def test_bad_inputs(self):
        with self.assertRaises(ValueError):
            zodiacs.natal_chart({**BIRTH, "timeScale": "TT"})
        with self.assertRaises(ValueError):
            zodiacs.natal_chart({**BIRTH, "latitude": float("nan")})
        with self.assertRaises(zodiacs.ZodiacsError) as caught:
            zodiacs.natal_chart({**BIRTH, "latitude": 999})
        self.assertNotIn(BIRTH["utc"], str(caught.exception))

    def test_missing_node_and_timeout(self):
        with self.assertRaisesRegex(zodiacs.ZodiacsError, "Node.js is required"):
            zodiacs.Engine(node="zodiacs-nonexistent-node").positions(BIRTH["utc"])
        with patch("zodiacs.subprocess.run", side_effect=subprocess.TimeoutExpired("node", 1)):
            with self.assertRaisesRegex(zodiacs.ZodiacsError, "timed out"):
                zodiacs.positions(BIRTH["utc"])

    def test_node_versions(self):
        for version in ("v18.20.8", "v20.18.3", "v21.7.3", "v22.6.0"):
            result = subprocess.CompletedProcess([], 0, stdout=version)
            with patch("zodiacs.subprocess.run", return_value=result):
                with self.assertRaisesRegex(zodiacs.ZodiacsError, "Unsupported Node"):
                    zodiacs.positions(BIRTH["utc"])

    def test_node_options_cannot_inject_code(self):
        with patch.dict("os.environ", {"NODE_OPTIONS": "--require=zodiacs-nonexistent-module"}):
            self.assertTrue(zodiacs.positions(BIRTH["utc"]))

    def test_cli(self):
        result = subprocess.run([sys.executable, "-m", "zodiacs", "positions", "--utc", BIRTH["utc"]],
                                capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), zodiacs.positions(BIRTH["utc"]))
        command = shutil.which("zodiacs")
        self.assertIsNotNone(command)
        subprocess.run([command, "--version"], check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
