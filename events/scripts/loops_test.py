"""Numerical reduction and provenance tests for the paired reference rows."""
import copy
import json
import unittest

from horizons import ROOT
from loops import crossings, verify


class LoopsTest(unittest.TestCase):
    def test_wrap_and_linear_interpolation(self):
        self.assertEqual(crossings([[0, 359], [10, 1], [20, 359]], 0), [
            {'atMs': 5, 'direction': 'direct'}, {'atMs': 15, 'direction': 'retrograde'}])
        self.assertEqual(crossings([[0, 179], [10, 181]], 0), [])

    def test_targets(self):
        for target in [-1, 360, float('nan'), float('inf'), True]:
            with self.assertRaises(ValueError):
                crossings([[0, 1], [10, 2]], target)

    def test_original_and_tampering(self):
        original = json.loads((ROOT / 'references/loop-cases.json').read_text())
        verify(original)
        for field, value in [('sourceFixtureSha256', 'changed'),
                             ('sourceRetrievedAt', '2000-01-01'),
                             ('sourceFixture', '../outside.json'), ('toleranceMs', 999999)]:
            changed = copy.deepcopy(original)
            changed[field] = value
            with self.assertRaises(ValueError):
                verify(changed)
        for field, value in [('sourceResponseSha256', 'changed'), ('start', '2000-01-01'),
                             ('events', []), ('targetDegrees', 0)]:
            changed = copy.deepcopy(original)
            changed['cases'][0][field] = value
            with self.assertRaises(ValueError):
                verify(changed)


if __name__ == '__main__':
    unittest.main()
