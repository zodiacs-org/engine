"""Independent catalog parsing, fixed-year selection and provenance checks."""
import copy
import json
import unittest

from nasa import ROOT, parse_row
from nasa_sample import (catalog_rows, classification, configuration, rows_digest,
                         selected_events, source_specs, validate_rows, verify)


def numerical_row(number=1, year=1970, month='Jan', day=2, time='01:02:03', type_='T'):
    return (f'{number:05d} {year:04d} {month} {day:02d} {time} '
            f'-2 0 1 {type_} xx 0.1000 1.2000')


class CatalogParsingTests(unittest.TestCase):
    def test_html_links_and_normalization(self):
        row = numerical_row()
        html = ('<p>NASA numerical catalog</p><pre>\n'
                '<a href="map">00001</a>  1970 Jan 02 01:02:03 '
                '-2 0 <a href="saros">1</a> T xx 0.1000 1.2000\n</pre>')
        self.assertEqual(catalog_rows(html.encode(), 'solar', 1970, 1970), [row])

    def test_negative_epoch_is_a_tt_label_without_delta_t_subtraction(self):
        parsed = parse_row(numerical_row(year=1969, month='Dec', day=31, time='23:59:59'))
        self.assertEqual(parsed['atMs'], -1000)
        self.assertEqual(parsed['tdLabel'], '1969-12-31T23:59:59')
        self.assertEqual(parsed['catalogDeltaTSeconds'], -2)

    def test_consecutive_catalog_numbers_and_strict_date_order(self):
        first = numerical_row(number=10, day=1)
        second = numerical_row(number=11, day=2)
        validate_rows([first, second], 'solar', 1970, 1970)
        malformed = [
            [first, numerical_row(number=12, day=2)],
            [first, numerical_row(number=10, day=2)],
            [second, first],
            [first, numerical_row(number=11, day=1)],
        ]
        for rows in malformed:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                validate_rows(rows, 'solar', 1970, 1970)

    def test_missing_year_and_wrong_century_are_rejected(self):
        rows = [numerical_row(year=1969), numerical_row(number=2, year=1971)]
        with self.assertRaisesRegex(ValueError, 'Incomplete source century'):
            validate_rows(rows, 'solar', 1969, 1971)
        with self.assertRaisesRegex(ValueError, 'outside source century'):
            validate_rows([numerical_row(year=1971)], 'solar', 1970, 1970)
        with self.assertRaises(ValueError):
            validate_rows([], 'solar', 1970, 1970)

    def test_non_normalized_and_invalid_dates_are_rejected(self):
        for row in [numerical_row().replace(' Jan ', '  Jan '),
                    numerical_row() + ' \t', numerical_row() + ' \u00a0',
                    numerical_row(month='Feb', day=30), numerical_row(time='24:00:00')]:
            with self.subTest(row=row), self.assertRaises(ValueError):
                validate_rows([row], 'solar', 1970, 1970)

    def test_type_mapping_preserves_supported_coarse_classes(self):
        classes = {
            'solar': {
                'partial': ['P', 'Pb', 'Pe', 'A+', 'A-', 'T+', 'T-'],
                'central': ['A', 'T', 'H', 'Am', 'An', 'As', 'Tm', 'Tn', 'Ts',
                            'Hm', 'H2', 'H3'],
            },
            'lunar': {
                'penumbral': ['N', 'Nm', 'Nb', 'Ne', 'N*', 'Nx'],
                'partial': ['P', 'Pm'],
                'total': ['T', 'Tm', 'T+', 'T-'],
            },
        }
        for kind, expected_types in classes.items():
            for expected, types in expected_types.items():
                for type_ in types:
                    with self.subTest(kind=kind, type=type_):
                        self.assertEqual(classification(kind, type_), expected)
        for kind, type_ in [('solar', 'N'), ('solar', 'T?'), ('solar', 'H23'),
                            ('lunar', 'H'), ('lunar', 'Nx+'), ('lunar', ''),
                            ('unknown', 'T')]:
            with self.subTest(kind=kind, type=type_), self.assertRaises(ValueError):
                classification(kind, type_)

    def test_row_hash_covers_normalized_lines_and_final_newline(self):
        from nasa import digest
        row = numerical_row()
        self.assertEqual(rows_digest([row]), digest((row + '\n').encode('ascii')))
        self.assertNotEqual(rows_digest([row]), digest(row.encode('ascii')))


class YearSelectionTests(unittest.TestCase):
    def test_century_routing_includes_exact_endpoint_years(self):
        config = {'years': [1900, 1925, 2000, 2025, 2100]}
        specs = source_specs(config)
        self.assertEqual(len(specs), 6)
        for kind, prefix in [('solar', 'SE'), ('lunar', 'LE')]:
            for first, last in [(1801, 1900), (1901, 2000), (2001, 2100)]:
                spec = specs[f'{kind}-{first}-{last}']
                self.assertEqual(spec, {
                    'kind': kind, 'firstYear': first, 'lastYear': last,
                    'url': f'https://eclipse.gsfc.nasa.gov/{prefix}cat5/{prefix}{first}-{last}.html',
                })

    def test_every_row_in_selected_year_is_kept_and_others_are_excluded(self):
        config = {'years': [1970]}
        sources = {
            'solar-1901-2000': {'rows': [numerical_row(year=1969),
                numerical_row(number=2), numerical_row(number=3, month='Jun', type_='P'),
                numerical_row(number=4, year=1971)]},
            'lunar-1901-2000': {'rows': [numerical_row(type_='N'),
                numerical_row(number=2, month='Jun', type_='T+')]},
        }
        events = selected_events(sources, config)
        self.assertEqual([(event['kind'], event['catalogNumber']) for event in events],
                         [('solar', '00002'), ('solar', '00003'),
                          ('lunar', '00001'), ('lunar', '00002')])
        self.assertEqual([event['classification'] for event in events],
                         ['central', 'partial', 'penumbral', 'total'])
        self.assertTrue(all(event['date'].startswith('1970-') for event in events))
        # Selection retains each raw catalog spelling and TT date arithmetic.
        self.assertEqual(events[-1]['catalogType'], 'T+')
        self.assertEqual(events[0]['atMs'], (86400 + 3600 + 120 + 3) * 1000)

    def test_no_selected_year_may_be_missing_for_either_kind(self):
        sources = {
            'solar-1901-2000': {'rows': [numerical_row()]},
            'lunar-1901-2000': {'rows': [numerical_row(year=1969, type_='N')]},
        }
        with self.assertRaisesRegex(ValueError, 'Selected year has no catalog rows'):
            selected_events(sources, {'years': [1970]})


class FixtureProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / 'references/nasa-sample.json').read_text())

    def test_committed_selection_reproduces_from_all_source_rows(self):
        config = configuration()
        self.assertEqual(config['years'], [1900, 1925, 1950, 1975, 2000,
                                          2025, 2050, 2075, 2100])
        self.assertEqual(config['clock'], 'tt')
        self.assertEqual(config['toleranceMs'], 180000)
        self.assertEqual(verify(self.fixture), len(self.fixture['events']))
        for kind in ['solar', 'lunar']:
            events = [event for event in self.fixture['events'] if event['kind'] == kind]
            self.assertEqual({int(event['date'][:4]) for event in events}, set(config['years']))
            self.assertEqual(len(events), len({event['catalogNumber'] for event in events}))

    def test_selected_noncentral_solar_and_total_penumbral_spellings_are_retained(self):
        events = {(event['kind'], event['catalogNumber']): event
                  for event in self.fixture['events']}
        solar = events['solar', '09398']
        self.assertEqual((solar['date'], solar['catalogType'], solar['classification']),
                         ('1950-03-18', 'A-', 'partial'))
        lunar = events['lunar', '09420']
        self.assertEqual((lunar['date'], lunar['catalogType'], lunar['classification']),
                         ('1900-06-13', 'Nx', 'penumbral'))

    def test_provenance_and_selection_mutations_are_rejected(self):
        source_id = next(iter(self.fixture['sources']))
        document_id = next(iter(self.fixture['documents']))
        changes = {
            'schema': lambda f: f.update(schema=2),
            'clock': lambda f: f.update(clock='utc'),
            'attribution': lambda f: f.update(attribution='unknown'),
            'threshold': lambda f: f['configuration'].update(toleranceMs=180001),
            'selection_years': lambda f: f['configuration']['years'].pop(),
            'source_set': lambda f: f['sources'].pop(source_id),
            'document_set': lambda f: f['documents'].pop(document_id),
            'source_url': lambda f: f['sources'][source_id].update(url='https://example.com'),
            'source_kind': lambda f: f['sources'][source_id].update(kind='lunar'),
            'century': lambda f: f['sources'][source_id].update(firstYear=1900),
            'page_digest': lambda f: f['sources'][source_id].update(sha256='bad'),
            'row_digest': lambda f: f['sources'][source_id].update(rowsSha256='0' * 64),
            'retrieval_clock': lambda f: f['sources'][source_id].update(
                retrievedAt='2026-01-01T00:00:00+00:00'),
            'retrieval_date': lambda f: f['sources'][source_id].update(
                retrievedAt='2026-02-30T00:00:00Z'),
            'document_url': lambda f: f['documents'][document_id].update(url='https://example.com'),
            'document_digest': lambda f: f['documents'][document_id].update(sha256='bad'),
            'event_count': lambda f: f['events'].pop(),
            'event_order': lambda f: f['events'].reverse(),
            'event_clock_arithmetic': lambda f: f['events'][0].update(atMs=0),
            'event_type': lambda f: f['events'][0].update(catalogType='P'),
            'event_classification': lambda f: f['events'][0].update(classification='unknown'),
            'event_source': lambda f: f['events'][0].update(sourceId='unknown'),
            'event_row_hash': lambda f: f['events'][0].update(rowSha256='0' * 64),
        }
        for label, change in changes.items():
            with self.subTest(change=label):
                fixture = copy.deepcopy(self.fixture)
                change(fixture)
                with self.assertRaises(ValueError):
                    verify(fixture)

    def test_rehashed_missing_or_reordered_source_rows_are_rejected(self):
        source_id = next(iter(self.fixture['sources']))
        for operation in ['missing', 'duplicate', 'reordered']:
            fixture = copy.deepcopy(self.fixture)
            source = fixture['sources'][source_id]
            if operation == 'missing':
                source['rows'].pop(1)
            elif operation == 'duplicate':
                source['rows'].insert(1, source['rows'][0])
            else:
                source['rows'][0], source['rows'][1] = source['rows'][1], source['rows'][0]
            source['rowsSha256'] = rows_digest(source['rows'])
            with self.subTest(operation=operation), self.assertRaises(ValueError):
                verify(fixture)


if __name__ == '__main__':
    unittest.main()
