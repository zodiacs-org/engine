"""Synthetic reducer checks and offline provenance checks for the sample."""
import copy
import json
import unittest

import horizons_sample as h


class ReductionTests(unittest.TestCase):
    def test_strict_crossings_and_zero_runs(self):
        self.assertEqual(h.zero_crossings([[0, -2], [100, 2]]), [
            dict(atMs=50, direction='direct', bracketMs=[0, 100])])
        self.assertEqual(h.zero_crossings([[0, 2], [100, 0], [200, 0], [300, -2]]), [
            dict(atMs=150, direction='retrograde', bracketMs=[0, 300])])
        self.assertEqual(h.zero_crossings([[0, -2], [100, 0], [200, 2]]), [
            dict(atMs=100, direction='direct', bracketMs=[0, 200])])

    def test_zero_touches_and_unconfirmed_boundaries(self):
        for values in [
                [[0, -1], [100, 0], [200, -1]],
                [[0, 1], [100, 0], [200, 0], [300, 1]],
                [[0, 0], [100, 0], [200, 1]],
                [[0, -1], [100, 0], [200, 0]],
                [[0, 0], [100, 0], [200, 0]]]:
            with self.subTest(values=values):
                self.assertEqual(h.zero_crossings(values), [])

    def test_station_secants_preserve_rounded_zero_run(self):
        rows = [[0, 4], [100, 1], [200, 0], [300, 0], [400, 0], [500, 1]]
        self.assertEqual(h.station_dates(rows), [
            dict(atMs=300, direction='direct', bracketMs=[150, 450])])
        self.assertEqual(h.station_dates([[0, 0], [100, 1], [200, 1], [300, 0]]), [
            dict(atMs=150, direction='retrograde', bracketMs=[50, 250])])

    def test_station_touches_boundaries_and_wrap(self):
        for rows in [
                [[0, 4], [100, 1], [200, 1], [300, 0]],
                [[0, 0], [100, 0], [200, 1], [300, 2]],
                [[0, 2], [100, 1], [200, 0], [300, 0]],
                [[0, 359], [100, 0], [200, 1]]]:
            with self.subTest(rows=rows):
                self.assertEqual(h.station_dates(rows), [])

    def test_ingress_zero_runs_and_both_wrap_directions(self):
        self.assertEqual(h.ingress_dates([[0, 359], [100, 0], [200, 0], [300, 1]]), [
            dict(atMs=150, direction='direct', bracketMs=[0, 300], targetDegrees=0)])
        self.assertEqual(h.ingress_dates([[0, 1], [100, 0], [200, 359]]), [
            dict(atMs=100, direction='retrograde', bracketMs=[0, 200], targetDegrees=0)])
        self.assertEqual(h.ingress_dates([[0, 29], [100, 30], [200, 31]]), [
            dict(atMs=100, direction='direct', bracketMs=[0, 200], targetDegrees=30)])

    def test_ingress_touch_boundary_and_far_side_jump(self):
        for rows in [
                [[0, 1], [100, 0], [200, 1]],
                [[0, 0], [100, 1], [200, 2]],
                [[0, 358], [100, 359], [200, 0]]]:
            with self.subTest(rows=rows):
                self.assertEqual(h.ingress_dates(rows), [])
        self.assertEqual(h.zero_crossings([[0, 179], [100, -179]], angular=True), [])
        self.assertEqual(h.ingress_dates([[0, 179], [100, 180], [200, 181]]), [
            dict(atMs=100, direction='direct', bracketMs=[0, 200], targetDegrees=180)])

    def test_first_per_direction_selection_and_padding(self):
        survey = dict(body='Mercury', command='199', year=1900)
        start = h.epoch('1900-01-01')
        rows = [[start + i * h.DAY, lon]
                for i, lon in enumerate([29, 31, 29, 27, 29, 31, 29, 27, 29])]
        plan = dict(toleranceMs=dict(station=1200000, ingress=600000))
        cases, absent = h.selected_cases(survey, rows, plan)
        self.assertEqual(absent, [])
        self.assertEqual(cases, [
            dict(id='mercury-1900-station-direct', kind='station', body='Mercury',
                 command='199', start='1900-01-02', end='1900-01-06',
                 direction='direct', toleranceMs=1200000),
            dict(id='mercury-1900-station-retrograde', kind='station', body='Mercury',
                 command='199', start='1900-01-01', end='1900-01-04',
                 direction='retrograde', toleranceMs=1200000),
            dict(id='mercury-1900-ingress-direct', kind='ingress', body='Mercury',
                 command='199', start='1900-01-01', end='1900-01-03',
                 direction='direct', toleranceMs=600000, targetDegrees=30),
            dict(id='mercury-1900-ingress-retrograde', kind='ingress', body='Mercury',
                 command='199', start='1900-01-01', end='1900-01-04',
                 direction='retrograde', toleranceMs=600000, targetDegrees=30)])
        self.assertEqual(h.selected_cases(survey, rows, plan), (cases, absent))

    def test_absent_directions_are_explicit(self):
        survey = dict(body='Mercury', command='199', year=1900)
        start = h.epoch('1900-01-01')
        rows = [[start + i * h.DAY, lon] for i, lon in enumerate([29, 30, 31, 32])]
        plan = dict(toleranceMs=dict(station=1200000, ingress=600000))
        cases, absent = h.selected_cases(survey, rows, plan)
        self.assertEqual([c['id'] for c in cases], ['mercury-1900-ingress-direct'])
        self.assertEqual(absent, [dict(kind='station', direction='direct'),
                                  dict(kind='station', direction='retrograde'),
                                  dict(kind='ingress', direction='retrograde')])


class ResponseTests(unittest.TestCase):
    def setUp(self):
        self.case = dict(body='Mercury', command='199', start='2000-01-01',
                         end='2000-01-01T02:00:00')
        start = h.epoch(self.case['start'])
        # Invented coordinates exercise the parser without an ephemeris.
        data = '\n'.join(f'{2440587.5 + (start + i * h.HOUR) / h.DAY:.12f}, , , {10 + i}, 0,'
                         for i in range(3))
        self.text = ('Target body name: Mercury (199) {source: synthetic}\n'
                     'Center body name: Earth (399) {source: DE441}\n'
                     'Center-site name: GEOCENTRIC\n'
                     'Atmos refraction: NO (AIRLESS)\n'
                     'Date_________JDTT, , , ObsEcLon, ObsEcLat,\n'
                     '$$SOE\n' + data + '\n$$EOE\n')

    def test_identity_conventions_and_cadence(self):
        rows = h.rows_from(self.text, self.case, h.HOUR)
        self.assertEqual([r[1] for r in rows], [10, 11, 12])
        changes = [
            ('Mercury (199)', 'Venus (299)'),
            ('Mercury (199)', 'Mercury (1)'),
            ('Earth (399)', 'Earth (3)'),
            ('GEOCENTRIC', 'TOPOCENTRIC'),
            ('Date_________JDTT', 'Date_________JDUT'),
            ('NO (AIRLESS)', 'YES'),
            ('$$EOE', '$$EOE\n$$EOE')]
        for old, new in changes:
            with self.subTest(old=old):
                with self.assertRaises(ValueError):
                    h.rows_from(self.text.replace(old, new), self.case, h.HOUR)
        with self.assertRaisesRegex(ValueError, 'cadence'):
            h.rows_from(self.text, self.case, h.DAY)
        first_label = f'{2440587.5 + h.epoch(self.case["start"]) / h.DAY:.12f}'
        second_label = f'{2440587.5 + (h.epoch(self.case["start"]) + h.HOUR) / h.DAY:.12f}'
        with self.assertRaisesRegex(ValueError, 'cadence'):
            h.rows_from(self.text.replace(second_label, first_label), self.case, h.HOUR)
        wrong_window = dict(self.case, end='2000-01-01T03:00:00')
        with self.assertRaisesRegex(ValueError, 'cover'):
            h.rows_from(self.text, wrong_window, h.HOUR)

    def test_nonfinite_and_out_of_range_longitude(self):
        for invalid in ['nan', 'inf', '-1', '360']:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    h.rows_from(self.text.replace(', 10, 0,', f', {invalid}, 0,'),
                                self.case, h.HOUR)

    def test_extraction_preserves_table_and_omits_footer(self):
        result = 'EOP file: synthetic\nEOP coverage: synthetic\n' + self.text + 'contact footer\n'
        extracted = h.excerpt(json.dumps(dict(result=result)))
        self.assertEqual(extracted, self.text)
        with self.assertRaises(ValueError):
            h.excerpt(json.dumps(dict(result=result.replace('$$EOE', ''))))

    def test_utc_retrieval_timestamp_is_required(self):
        h.timestamp('2026-10-20T00:00:00+00:00')
        for value in ['2026-10-20T00:00:00', '2026-10-20T00:00:00+01:00', 'invalid']:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    h.timestamp(value)


class FixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((h.ROOT / 'references/horizons-sample.json').read_text())

    def test_committed_sample_reproduces(self):
        self.assertIs(h.verify(self.fixture), self.fixture)

    def test_fixture_source_plan_and_selection_tampering(self):
        mutations = [
            lambda f: f.update(clock='utc'),
            lambda f: f.update(samplePlanSha256='0' * 64),
            lambda f: f['surveys'].reverse(),
            lambda f: f['surveys'][0].update(absentFromDailySelection=[dict(kind='station', direction='direct')]),
            lambda f: f['events'].reverse(),
            lambda f: f['events'][0]['case'].update(toleranceMs=1)]
        for mutate in mutations:
            changed = copy.deepcopy(self.fixture)
            mutate(changed)
            with self.subTest(mutation=mutations.index(mutate)):
                with self.assertRaises(ValueError):
                    h.verify(changed)

    def test_response_provenance_and_date_tampering(self):
        mutations = [
            lambda e: e['response'].update(url='https://example.invalid'),
            lambda e: e['response']['parameters'].update(TIME_TYPE="'UT'"),
            lambda e: e['response'].update(extraction='unreviewed extraction'),
            lambda e: e['response'].update(excerptSha256='0' * 64),
            lambda e: e['response'].update(sourceSha256='invalid'),
            lambda e: e['response'].update(sourceBytes=h.LIMIT + 1),
            lambda e: e['response'].update(retrievedAt='2026-10-20T00:00:00'),
            lambda e: e['reference'].update(atMs=e['reference']['atMs'] + 1),
            lambda e: e['reference']['bracketMs'].__setitem__(0, e['reference']['bracketMs'][0] + 1)]
        for mutate in mutations:
            changed = copy.deepcopy(self.fixture)
            mutate(changed['events'][0])
            with self.subTest(mutation=mutations.index(mutate)):
                with self.assertRaises(ValueError):
                    h.verify(changed)

    def test_rehashed_excerpt_still_checks_target_identity(self):
        changed = copy.deepcopy(self.fixture)
        response = changed['events'][0]['response']
        body = changed['events'][0]['case']['body']
        response['excerpt'] = response['excerpt'].replace('Target body name: ' + body,
                                                         'Target body name: unrelated')
        response['excerptSha256'] = h.digest(response['excerpt'].encode())
        with self.assertRaisesRegex(ValueError, 'identity'):
            h.verify(changed)


if __name__ == '__main__':
    unittest.main()
