"""Offline parsing and provenance checks independent of the engine."""
import copy
import json
import unittest
from nasa import ROOT, digest, parse_row, select_rows, verify


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads((ROOT / 'references/nasa.json').read_text())

    def test_hand_calculated_epoch_and_no_delta_t_subtraction(self):
        parsed = parse_row('00001 1970 Jan 02 01:02:03 99 0 1 T xx 0 1')
        self.assertEqual(parsed['atMs'], (86400 + 3600 + 120 + 3) * 1000)
        self.assertEqual(parsed['catalogDeltaTSeconds'], 99)
        self.assertEqual(parsed['tdLabel'], '1970-01-02T01:02:03')

    def test_html_links_and_whitespace(self):
        row = '00001 1970 Jan 02 01:02:03 99 0 1 T xx 0 1'
        html = '<pre>\n<a href="map">00001</a> 1970 Jan 02 01:02:03 99 0 1 T xx 0 1\n</pre>'
        selected = select_rows(html.encode(), [{'catalogNumber': '00001'}])
        self.assertEqual(selected['00001'][0], row)
        with self.assertRaises(ValueError):
            select_rows((html+html).encode(), [{'catalogNumber': '00001'}])
        with self.assertRaises(ValueError):
            select_rows(html.encode(), [{'catalogNumber': '99999'}])

    def test_invalid_rows(self):
        for row in ['', '00001 2023 Feb 30 00:00:00 1 1 1 P x 0 1',
                    '00001 2023 Feb 01 24:00:00 1 1 1 P x 0 1',
                    '00001 2023 Bad 01 00:00:00 1 1 1 P x 0 1']:
            with self.assertRaises(ValueError):
                parse_row(row)

    def test_offline_reproduction(self):
        self.assertEqual(verify(self.fixture), len(self.fixture['configuration']['cases']))

    def test_tampering_rejects(self):
        changes = [lambda f: f.update(clock='utc'),
                   lambda f: f.update(attribution='unknown'),
                   lambda f: f['sources']['solar'].update(url='https://example.com'),
                   lambda f: f['sources']['lunar'].update(sha256='bad'),
                   lambda f: f['events'][0].update(atMs=0),
                   lambda f: f['events'][0].update(rowSha256='0'*64),
                   lambda f: f['events'].reverse(),
                   lambda f: f['configuration'].update(toleranceMs=999999)]
        for change in changes:
            fixture = copy.deepcopy(self.fixture)
            change(fixture)
            with self.assertRaises(ValueError):
                verify(fixture)
        # A recomputed row hash does not allow a row to change the selected date.
        fixture = copy.deepcopy(self.fixture)
        event = fixture['events'][0]
        event['row'] = event['row'].replace('Aug 21', 'Aug 22')
        event.update(parse_row(event['row']), rowSha256=digest(event['row'].encode()))
        with self.assertRaises(ValueError):
            verify(fixture)


if __name__ == '__main__':
    unittest.main()
