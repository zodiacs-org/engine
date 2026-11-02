"""Analytic and tampering checks of the independent reference reducer."""
import copy
import json
import unittest
import horizons as h


class ReferenceTests(unittest.TestCase):
    def test_linear_wrap(self):
        case = dict(id='analytic', kind='ingress', targetDegrees=0, direction='direct')
        self.assertEqual(h.derive(case, [[[0, 359], [100, 1], [200, 3]]]), 50)
        # A far-side branch cut must never be mistaken for a crossing.
        with self.assertRaises(ValueError):
            h.derive(case, [[[0, 179], [100, 181], [200, 183]]])

    def test_quadratic_station(self):
        case = dict(id='analytic', kind='station', direction='direct')
        self.assertEqual(h.derive(case, [[[0, 4], [100, 1], [200, 0], [300, 1], [400, 4]]]), 200)

    def test_pair_alignment(self):
        case = dict(id='analytic', kind='moving-aspect', targetDegrees=90, direction='direct')
        self.assertEqual(h.derive(case, [[[0, 100], [100, 120]], [[0, 20], [100, 20]]]), 50)
        with self.assertRaises(ValueError):
            h.derive(case, [[[0, 100], [100, 120]], [[1, 20], [100, 20]]])

    def test_tampering(self):
        fixture = json.loads((h.ROOT / 'references/horizons.json').read_text())
        for field, value in [('sha256', '0' * 64), ('url', 'https://example.invalid')]:
            changed = copy.deepcopy(fixture)
            changed['events'][0]['responses'][0][field] = value
            with self.assertRaises(ValueError):
                h.verify(changed)
        changed = copy.deepcopy(fixture)
        changed['events'][0]['atMs'] += 1
        with self.assertRaises(ValueError):
            h.verify(changed)

    def test_bad_response(self):
        for raw in ['{"error":"invalid request"}', '{"result":"no ephemeris"}']:
            with self.assertRaises(ValueError):
                h.parse_response(raw)


if __name__ == '__main__':
    unittest.main()
