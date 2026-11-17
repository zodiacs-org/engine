#!/usr/bin/env python3
"""Checks of the L4 generator that need no kernel: python3 conformance/arbiters/l4/test_build.py

- the committed sources/l4 matches SHA256SUMS, and one changed byte in a copy of it is refused (the mutation
  check of DESIGN.md);
- a saved Horizons response is read as the cross-check needs it, and a response from the wrong centre or with
  refraction is refused;
- the tolerance rule gives the sizes DESIGN.md states for typical motions;
- the Horizons requests stay within the limits the fetch job was given.
Needs what build.py needs (numpy, pyerfa, jplephem), since it imports it.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402

RESPONSE = """API VERSION: 1.2
API SOURCE: NASA/JPL Horizons API

*******************************************************************************
Target body name: Sun (10)                        {source: DE441}
Center body name: Earth (399)                     {source: DE441}
Atmos refraction: NO (AIRLESS)
*******************************************************************************
 Date__(TT)__HR:MN:SC.fff, , ,    ObsEcLon,   ObsEcLat,
*******************************************************
$$SOE
 2026-Nov-22 07:24:29.747, , , 240.0000000,  0.0000100,
 2026-Nov-22 08:24:29.747, , , 240.0415000,  0.0000100,
$$EOE
"""


class Sources(unittest.TestCase):
    def test_committed_sources_match(self):
        self.assertEqual(build.verify_sources(), [])

    def test_one_changed_byte_is_refused(self):
        saved = (build.SOURCES, build.SUMS)
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, 'l4')
            shutil.copytree(build.SOURCES, copy)
            target = os.path.join(copy, 'solutions.json')
            with open(target, 'rb') as f:
                data = bytearray(f.read())
            data[100] ^= 0x01
            with open(target, 'wb') as f:
                f.write(bytes(data))
            build.SOURCES, build.SUMS = copy, os.path.join(copy, 'SHA256SUMS')
            try:
                problems = build.verify_sources()
            finally:
                build.SOURCES, build.SUMS = saved
        self.assertTrue(any('solutions.json' in p and 'SHA-256' in p for p in problems), problems)

    def test_an_unlisted_file_is_refused(self):
        saved = (build.SOURCES, build.SUMS)
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, 'l4')
            shutil.copytree(build.SOURCES, copy)
            os.makedirs(os.path.join(copy, 'horizons'), exist_ok=True)
            with open(os.path.join(copy, 'horizons', 'extra.txt'), 'w') as f:
                f.write(RESPONSE)
            build.SOURCES, build.SUMS = copy, os.path.join(copy, 'SHA256SUMS')
            try:
                problems = build.verify_sources()
            finally:
                build.SOURCES, build.SUMS = saved
        self.assertTrue(any('horizons/extra.txt' in p for p in problems), problems)


class Horizons(unittest.TestCase):
    def test_a_response_is_read(self):
        hid, rows = build.parse_horizons(RESPONSE)
        self.assertEqual(hid, '10')
        self.assertEqual(len(rows), 2)
        t0 = build.seconds(2026, 11, 22) + 7 * 3600 + 24 * 60 + 29.747
        self.assertAlmostEqual(rows[0][0], t0, places=6)
        self.assertEqual(rows[1][1], 240.0415)

    def test_a_wrong_banner_is_refused(self):
        for wrong in ('Center body name: Earth (399)', 'Atmos refraction: NO (AIRLESS)'):
            with self.assertRaises(ValueError):
                build.parse_horizons(RESPONSE.replace(wrong, 'something else'))

    def test_an_ingress_cross_check(self):
        t = build.seconds(2026, 11, 22) + 8 * 3600 + 24 * 60 + 29.747
        table = {'10': [(t - 3600, 239.9585, 0.0), (t, 240.0000 + 0.4 / 3600, 0.0), (t + 3600, 240.0415, 0.0)]}
        record = {'kind': 'event.ingress', 'name': 'Sun', 'tt_s': t, 'target': 240.0, 'tolerance': 24}
        ok, dev, _ = build.cross_check(record, table)
        self.assertTrue(ok)
        self.assertAlmostEqual(dev, 0.4, places=6)
        table['10'][1] = (t, 240.0 + 0.5 / 3600, 0.0)
        self.assertFalse(build.cross_check(record, table)[0])
        self.assertIsNone(build.cross_check(record, {}))

    def test_a_station_cross_check(self):
        t = 1000.0
        acc = 2.0 / 6600.0 ** 2 / 3600.0          # deg/s^2, a Mercury-like station with tolerance 6600 s
        shift = 3000.0                             # Horizons's own station, 3000 s after the solved instant
        lon = lambda x: 100.0 + 0.5 * acc * (x - t - shift) ** 2   # noqa: E731
        table = {'199': [(x, lon(x), 0.0) for x in (t - 3600, t, t + 3600)]}
        record = {'kind': 'event.station', 'name': 'Mercury', 'tt_s': t, 'target': None, 'tolerance': 6600}
        ok, measured, _ = build.cross_check(record, table)
        self.assertTrue(ok)
        self.assertAlmostEqual(measured, shift, delta=1.0)


class Rules(unittest.TestCase):
    def test_tolerances(self):
        def ingress(rate_arcsec_s):
            d = rate_arcsec_s * 3600 / 3600.0
            return build.tolerance('event.ingress', 'Sun', {'lon': [100 - d, 100.0, 100 + d]})[0]
        self.assertEqual(ingress(0.0411), 25)
        self.assertEqual(ingress(0.55), 2)
        self.assertEqual(ingress(5.0), 1)
        self.assertEqual(ingress(0.00026), 3847)
        acc = 2.0 / 6600.0 ** 2                    # arcsec/s^2
        d2 = acc * 3600.0 ** 2 / 3600.0            # second difference in degrees
        self.assertIn(build.tolerance('event.station', 'Mercury', {'lon': [100 + d2 / 2, 100.0, 100 + d2 / 2]})[0], (6600, 6601))
        self.assertEqual(build.tolerance('event.station', 'Mars', {'lon': [105.0, 100.0, 105.0]})[0], 60)   # the floor

    def test_requests(self):
        with open(build.REQUESTS, encoding='ascii') as f:
            urls = f.read().split()
        self.assertLessEqual(len(urls), 40)
        for url in urls:
            self.assertTrue(url.startswith(build.HORIZONS_API + '?'))
            for part in ("QUANTITIES=%2731%27", "TIME_TYPE=%27TT%27", "CENTER=%27500@399%27", "EXTRA_PREC=%27YES%27"):
                self.assertIn(part, url)


if __name__ == '__main__':
    unittest.main()
