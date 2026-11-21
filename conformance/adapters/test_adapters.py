"""Run after installing the pinned engines, with SKYFIELD_BSP set to de440s.bsp."""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

ADAPTERS = Path(__file__).resolve().parent
POSITION = 'position.apparent.ecliptic-true-of-date'


def run_adapter(command, cases, **env):
    requests = [{'id': str(i), 'kind': kind, 'input': inputs}
                for i, (kind, inputs) in enumerate(cases)]
    return subprocess.run(
        command, input=''.join(json.dumps(req) + '\n' for req in requests),
        capture_output=True, text=True, env={**os.environ, **env}, timeout=30,
    )


class AdapterTests(unittest.TestCase):
    def responses(self, command, version, cases):
        run = run_adapter(command, cases)
        self.assertEqual(run.returncode, 0, run.stderr)
        handshake, *responses = map(json.loads, run.stdout.splitlines())
        self.assertEqual(handshake['adapter']['engineVersion'], version)
        self.assertEqual([r['id'] for r in responses], list(map(str, range(len(cases)))))
        return responses

    def test_skyfield_refuses_wrong_kernel_before_handshake(self):
        with TemporaryDirectory() as directory:
            kernel = Path(directory, 'de440s.bsp')
            kernel.write_bytes(b'wrong kernel')
            run = run_adapter([sys.executable, ADAPTERS / 'skyfield.py'], [], SKYFIELD_BSP=str(kernel))
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(run.stdout, '')
        self.assertIn('SHA-256 mismatch', run.stderr)

    def test_skyfield_recovers_after_out_of_range_request(self):
        outside, inside = self.responses([sys.executable, ADAPTERS / 'skyfield.py'], '1.55', [
            (POSITION, {'body': 'Mars', 'jd_tt': 2300000}),
            (POSITION, {'body': 'Mars', 'jd_tt': 2451545}),
        ])
        self.assertTrue(outside['unsupported'])
        self.assertTrue(0 <= inside['output']['lon'] < 360)
        self.assertTrue(-90 <= inside['output']['lat'] <= 90)

    def test_pyephem_refuses_mean_obliquity(self):
        position, delta = self.responses([sys.executable, ADAPTERS / 'pyephem.py'], '4.2.1', [
            (POSITION, {'body': 'Moon', 'jd_tt': 2451545}),
            ('time.delta-t', {'jd_ut1': 2451545}),
        ])
        self.assertIn('mean obliquity', position['unsupported'])
        self.assertIsInstance(delta['output']['delta_t_s'], float)

    def test_astronomia_reports_frame_limits_and_calendar(self):
        moon, pluto, calendar = self.responses(['node', ADAPTERS / 'astronomia.mjs'], '4.3.0', [
            (POSITION, {'body': 'Moon', 'jd_tt': 2451545}),
            (POSITION, {'body': 'Pluto', 'jd_tt': 2451545}),
            ('calendar.from-jdn', {'calendar': 'gregorian', 'jdn': 2451545}),
        ])
        self.assertIn('nutation', moon['unsupported'])
        self.assertIn('J2000', pluto['unsupported'])
        self.assertEqual(calendar['output'], {'year': 2000, 'month': 1, 'day': 1})


if __name__ == '__main__':
    unittest.main()
