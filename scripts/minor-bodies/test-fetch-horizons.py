"""Offline tests of fetch-horizons.py's reuse of the responses it saved.

The network, the clock and the pauses are replaced: no request reaches
Horizons. A saved response is read again only where its sidecar records the
same query and the file's SHA-256, and provenance.json and
oos-observer-100.json then give the time it was first fetched; a changed
query, a missing sidecar or changed bytes fetch it again.

    python3 -I scripts/minor-bodies/test-fetch-horizons.py
"""
import contextlib
import datetime
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
SCRIPT = pathlib.Path(__file__).with_name("fetch-horizons.py")
SPEC = importlib.util.spec_from_file_location("fetch_horizons", SCRIPT)
horizons = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(horizons)

NAMES = [body["name"] for body in horizons.BODIES]


def answer(params):
    """A made-up Horizons response to `params`: three vector rows, or a row for each instant TLIST asks for."""
    if params["EPHEM_TYPE"] == "'VECTORS'":
        rows = "\n".join(f"{2378480.5 + day}, A.D. 1799-Dec-16 00:00:00.0000, 1.0, 2.0, 3.0," for day in range(3))
        return f"Target body name: test {params['COMMAND']}\n$$SOE\n{rows}\n$$EOE\n".encode()
    instants = [float(value.strip("'")) for value in params["TLIST"].split()]
    rows = "\n".join(f"{jd:.6f} 123.4567890 -1.2345678" for jd in instants)
    return f"$$SOE\n{rows}\n$$EOE\n".encode()


class Clock:
    """The script's clock: each reading a minute after the one before, from 2026-01-01 00:00 UTC."""

    def __init__(self):
        self.minutes = 0

    def __call__(self):
        self.minutes += 1
        start = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
        return (start + datetime.timedelta(minutes=self.minutes)).isoformat()


class ReuseTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.out = pathlib.Path(folder.name)
        self.clock = Clock()

    def run_script(self, respond=answer):
        """main() on self.out: the queries it sent, provenance.json and oos-observer-100.json."""
        queries = []

        def fetch(params):
            queries.append(dict(params))
            return respond(params)

        with mock.patch.object(horizons, "fetch", fetch), mock.patch.object(horizons, "utc_now", self.clock), \
                mock.patch.object(horizons.time, "sleep"), contextlib.redirect_stdout(io.StringIO()):
            horizons.main(["--out", str(self.out)])
        return queries, self.read("provenance.json"), self.read("oos-observer-100.json")

    def read(self, name):
        return json.loads((self.out / name).read_text(encoding="utf-8"))

    def test_a_first_run_records_each_query_and_when_it_was_fetched(self):
        queries, provenance, checks = self.run_script()
        self.assertEqual(len(queries), 15)
        meta = self.read("chiron-vectors.meta.json")
        self.assertEqual(meta["api"], horizons.API)
        self.assertEqual(meta["params"], queries[0])
        self.assertEqual(meta["params"]["STEP_SIZE"], "'10 d'")
        self.assertEqual(meta["bytes"], (self.out / "chiron-vectors.txt").stat().st_size)
        self.assertEqual(provenance["bodies"]["Chiron"]["fetchedAtUtc"], meta["fetchedAtUtc"])
        self.assertEqual(provenance["fetchedAtUtc"], "2026-01-01T00:01:00+00:00")
        self.assertEqual(self.read("vesta-observer-1.meta.json")["params"], queries[14])
        self.assertEqual(checks["bodies"]["Vesta"]["batchFetchedAtUtc"][1], "2026-01-01T00:15:00+00:00")
        self.assertEqual(checks["fetchedAtUtc"], "2026-01-01T00:06:00+00:00")

    def test_a_rerun_with_the_same_queries_fetches_nothing_and_keeps_the_first_times(self):
        _, provenance, checks = self.run_script()
        queries, again, checks_again = self.run_script()
        self.assertEqual(queries, [])
        self.assertEqual(again, provenance)
        self.assertEqual(checks_again, checks)
        self.assertEqual(again["fetchedAtUtc"], "2026-01-01T00:01:00+00:00")

    def test_a_changed_query_is_fetched_again_and_records_its_own_time(self):
        _, provenance, checks = self.run_script()
        bodies = [{**horizons.BODIES[0], "step": "20 d"}, *horizons.BODIES[1:]]
        with mock.patch.object(horizons, "BODIES", bodies):
            queries, again, checks_again = self.run_script()
        self.assertEqual([(query["COMMAND"], query["STEP_SIZE"]) for query in queries], [("'2060;'", "'20 d'")])
        self.assertEqual(self.read("chiron-vectors.meta.json")["params"]["STEP_SIZE"], "'20 d'")
        self.assertEqual(again["bodies"]["Chiron"]["step"], "20 d")
        self.assertEqual(again["bodies"]["Chiron"]["fetchedAtUtc"], "2026-01-01T00:16:00+00:00")
        for name in NAMES[1:]:
            self.assertEqual(again["bodies"][name]["fetchedAtUtc"], provenance["bodies"][name]["fetchedAtUtc"])
        self.assertEqual(again["fetchedAtUtc"], "2026-01-01T00:02:00+00:00")
        self.assertEqual(checks_again, checks)

    def test_a_sidecar_that_records_another_query_is_no_reuse(self):
        self.run_script()
        sidecar = self.out / "juno-vectors.meta.json"
        meta = json.loads(sidecar.read_text(encoding="utf-8"))
        meta["params"]["STOP_TIME"] = "'JD 2524600.5'"
        sidecar.write_text(json.dumps(meta), encoding="utf-8")
        queries, again, _ = self.run_script()
        self.assertEqual([query["COMMAND"] for query in queries], ["'3;'"])
        self.assertEqual(again["bodies"]["Juno"]["fetchedAtUtc"], "2026-01-01T00:16:00+00:00")

    def test_a_response_without_its_sidecar_or_with_other_bytes_is_fetched_again(self):
        self.run_script()
        (self.out / "ceres-vectors.meta.json").unlink()
        observer = self.out / "pallas-observer-0.txt"
        observer.write_bytes(observer.read_bytes() + b"\n")
        queries, again, checks = self.run_script()
        self.assertEqual([(query["COMMAND"], query["EPHEM_TYPE"]) for query in queries], [("'1;'", "'VECTORS'"), ("'2;'", "'OBSERVER'")])
        self.assertEqual(again["bodies"]["Ceres"]["fetchedAtUtc"], "2026-01-01T00:16:00+00:00")
        self.assertEqual(checks["bodies"]["Pallas"]["batchFetchedAtUtc"], ["2026-01-01T00:17:00+00:00", "2026-01-01T00:11:00+00:00"])

    def test_a_refused_response_is_not_saved(self):
        def short(params):
            text = answer(params)
            return text if params["EPHEM_TYPE"] == "'VECTORS'" else text.replace(b"$$EOE", b"9.0 1.0 2.0\n$$EOE")

        with self.assertRaisesRegex(RuntimeError, "Chiron batch 0: 50 instants asked, 51 rows given"):
            self.run_script(short)
        self.assertTrue((self.out / "vesta-vectors.meta.json").exists())
        self.assertFalse((self.out / "chiron-observer-0.txt").exists())
        self.assertFalse((self.out / "chiron-observer-0.meta.json").exists())
        with self.assertRaisesRegex(RuntimeError, "no [$][$]SOE"):
            self.run_script(lambda params: b"no table")
        queries, _, _ = self.run_script()
        self.assertEqual(len(queries), 10)


if __name__ == "__main__":
    unittest.main()
