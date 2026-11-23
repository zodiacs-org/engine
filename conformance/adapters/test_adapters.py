"""Run after installing the pinned engines, with SKYFIELD_BSP set to de440s.bsp."""
from io import StringIO
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

ADAPTERS = Path(__file__).resolve().parent
POSITION = 'position.apparent.ecliptic-true-of-date'


def request_text(cases):
    requests = [{'id': str(i), 'kind': kind, 'input': inputs}
                for i, (kind, inputs) in enumerate(cases)]
    return ''.join(json.dumps(req) + '\n' for req in requests)


def run_adapter(command, cases, **env):
    return subprocess.run(
        command, input=request_text(cases),
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

    def test_skyfield_observes_planet_centres_and_refuses_unknown_body(self):
        # Import the adapter by its repository path so Skyfield keeps its package name.
        with patch.object(sys, 'path', [str(ADAPTERS.parents[1]), *sys.path]):
            from conformance.adapters import skyfield as adapter
        from skyfield.positionlib import Barycentric

        cases = [(POSITION, {'body': body, 'jd_tt': 2451545})
                 for body in ('Mercury', 'Ceres', 'Venus')]
        kernel = adapter.load_file(adapter.BSP_PATH)
        self.addCleanup(kernel.close)
        # DE440s gives each of these planets and its barycentre the same position.
        # Record the NAIF targets passed to observe() while it calculates both.
        with (
            patch.object(adapter, 'load_file', return_value=kernel),
            patch.object(sys, 'stdin', StringIO(request_text(cases))),
            patch.object(sys, 'stdout', new_callable=StringIO) as stdout,
            patch.object(Barycentric, 'observe', autospec=True,
                         side_effect=Barycentric.observe) as observe,
        ):
            adapter.main()
        _, mercury, unknown, venus = map(json.loads, stdout.getvalue().splitlines())
        self.assertIn('output', mercury)
        self.assertEqual(unknown, {'id': '1', 'unsupported': 'no DE440s target for Ceres'})
        self.assertIn('output', venus)
        target_ids = [call.args[1].target for call in observe.call_args_list]
        self.assertEqual(target_ids, [199, 299])

    def test_pyephem_refuses_mean_obliquity(self):
        position, delta = self.responses([sys.executable, ADAPTERS / 'pyephem.py'], '4.2.1', [
            (POSITION, {'body': 'Moon', 'jd_tt': 2451545}),
            ('time.delta-t', {'jd_ut1': 2451545}),
        ])
        self.assertIn('mean obliquity', position['unsupported'])
        self.assertIsInstance(delta['output']['delta_t_s'], float)

    def test_pyephem_refuses_new_and_full_moons(self):
        window = {'after_tt_s': 0, 'before_tt_s': 30 * 86400}
        new_moon, full_moon = self.responses([sys.executable, ADAPTERS / 'pyephem.py'], '4.2.1', [
            ('event.lunation', {'phase_deg': 0, **window}),
            ('event.lunation', {'phase_deg': 180, **window}),
        ])
        self.assertIn('mean-obliquity', new_moon['unsupported'])
        self.assertIn('mean-obliquity', full_moon['unsupported'])

    def test_astronomia_reports_frame_limits_and_calendar(self):
        moon, pluto, mars, calendar = self.responses(['node', ADAPTERS / 'astronomia.mjs'], '4.3.0', [
            (POSITION, {'body': 'Moon', 'jd_tt': 2451545}),
            (POSITION, {'body': 'Pluto', 'jd_tt': 2451545}),
            (POSITION, {'body': 'Mars', 'jd_tt': 2477779.403028457}),
            ('calendar.from-jdn', {'calendar': 'gregorian', 'jdn': 2451545}),
        ])
        self.assertIn('nutation', moon['unsupported'])
        self.assertIn('J2000', pluto['unsupported'])
        # Horizons vector L1-POS-0195. Mean obliquity misses this latitude by 8.4 arcseconds.
        self.assertAlmostEqual(mars['output']['lat'], 1.2200106871, delta=1 / 3600)
        self.assertEqual(calendar['output'], {'year': 2000, 'month': 1, 'day': 1})


if __name__ == '__main__':
    unittest.main()
