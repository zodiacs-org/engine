#!/usr/bin/env python3
"""Checks C1, C1b and C5 of ../PREREGISTRATION.md (section 6), with their
controls, on the engine's dumps (dump.mjs). Standard library only; run with
Python 3.9.6 and -I. It imports nothing from the engine: the bands are R1 to
R3 written again from the preregistration, from each result's own fields and
its receipt instant's deltaT and timeScale (C1); the recorded sigmas are
computed again from their sources, the site's Python twin of the ΔT model and
the IERS rows the engine commits (C1b); and the events' bands from those
sources at each event (C5).

    python3 -I bands.py c1  --dump <dump.json> ... --out <c1.json>
    python3 -I bands.py c1b --dump <dump.json> ... --site-lib <lib.py> --site-table <table.json> \\
        --sources <scripts/time-scale-sources> --out <c1b.json>
    python3 -I bands.py c5  --dump <dump-E.json> --site-lib <lib.py> --site-table <table.json> \\
        --sources <scripts/time-scale-sources> --out <c5.json>

The site's lib.py and table.json are read from site main's git objects
(9a67f761, docs/platform/evidence/deltat-2026-09-25/) into files outside every
checkout; this tool loads lib.py from the path it is given. A control is a
deliberately wrong variant applied to a copy of the engine's dump (or to the
reference, where its row says so); every control must make its check fail.
"""
import argparse
import datetime
import gzip
import importlib.util
import json
import math
import os
import sys

# No bytecode is written for the modules this tool loads.
sys.dont_write_bytecode = True

RAD = 180.0 / math.pi
# The constants of the engine's observer (src/calc-reduce.ts) and astronomy-engine 2.1.19's KM_PER_AU.
OMEGA = 7.292115e-5
EARTH_A_KM = 6378.1366
KM_PER_AU = 1.4959787069098932e8
UT1_FALLBACK = 0.9
TABLE_BOUND = 0.00079
DAY_MS = 86400000.0
MJD_UNIX = 40587
# The IERS basis: UTC from 1972-01-01 to the table's last instant, 2027-10-02T00:00Z (docs/time.md).
# TABLE_TO_MS read 1822521600000.0 (2027-10-03T00:00Z), one day late, until the amendment of 2026-11-03
# (review 1), which corrected it before any formal run.
IERS_FROM_MS = 63072000000.0
TABLE_TO_MS = 1822435200000.0


def load(paths):
    records = []
    for path in paths:
        with open(path, encoding='utf-8') as f:
            records.extend(json.load(f)['data'])
    return records


# --------------------------------------------------------------------------- R1, written again


def time_bands(instant, rule='R'):
    """The TT and UT1 bands, s, of a recorded instant (R1). Rule 'a': the pre-rc.15 reading, the
    TT band d on every UTC input; rule 'b': the linear sum u + d after the IERS table."""
    sigma = instant['deltaT']['sigma']
    d = 0.0 if sigma is None else float(sigma)
    scale = instant['timeScale']
    u = 0.0 if scale['ut1MinusUtc'] is None else float(scale['ut1MinusUtc']['sigma'])
    if scale['input'] == 'tt':
        return 0.0, d
    if scale['input'] == 'ut1':
        return d, 0.0
    if rule == 'a':
        return d, u
    if scale['basis'] == 'iers':
        return 0.0, u
    if scale['basis'] == 'pinned':
        return u, u
    return (u + d if rule == 'b' else math.hypot(u, d)), u


def position_band(record, tt, ut1, rule='R'):
    """R2 (a) and (b): lon and lat in arcseconds, dist in au. Rule 'd': the topocentric bands without w."""
    s = record['speeds']
    center = record['request'].get('center')
    v = w = 0.0
    if isinstance(center, dict):
        height = center['topocentric'].get('height', 0)
        v = OMEGA * (EARTH_A_KM + max(height, 0) / 1000.0) / KM_PER_AU
        if rule != 'd':
            w = v / (record['dist'] * (1 - 1e-3)) * RAD * 3600
    across = w / math.cos(math.radians(record['lat']))
    lon = (abs(s['lon']) / 24 + across) * tt + across * ut1
    lat = (abs(s['lat']) / 24 + w) * tt + w * ut1
    dist = None if s['dist'] is None else (abs(s['dist']) / 86400 + v) * tt + v * ut1
    return lon, lat, dist


def close(actual, expected):
    """Within 1e-12 of its size, as src/calc-fixtures.test.ts compares numbers."""
    return abs(actual - expected) <= 1e-12 * max(1.0, abs(expected))


# --------------------------------------------------------------------------- C1


def c1_problems(records, rule='R'):
    """C1 against the reference with `rule`: (problems, records judged)."""
    problems, judged = [], 0

    def fail(record, what):
        if len(problems) < 50:
            problems.append({'entry': record.get('entry'), 'form': record.get('form'), 'request': record.get('request'), 'problem': what})
        else:
            problems.append(None)

    for record in records:
        if 'C1' not in record.get('checks', []) or record.get('refused'):
            continue
        judged += 1
        kind = record['kind']
        if kind == 'events':
            for event in record['events']:
                band = event.get('band')
                if band is None:
                    fail(record, f'event {event["at"]} carries no band')
                    continue
                at = datetime.datetime.strptime(event['at'], '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000
                if IERS_FROM_MS <= at <= TABLE_TO_MS and band['utc'] != 0:
                    fail(record, f'event {event["at"]} on the IERS basis: utc band {band["utc"]!r} is not exactly 0')
            if record['conventions'][-1] != BAND_ID:
                fail(record, 'the receipt does not name time-band:first-order last')
            continue
        band = record.get('band')
        tt, ut1 = time_bands(record['instant'], rule)
        if kind == 'position' and record['speeds'] is None:
            if band is not None:
                fail(record, 'a band without speeds')
            continue
        if band is None:
            fail(record, 'no band')
            continue
        for name, expected in (('time.tt', tt), ('time.ut1', ut1)):
            got = band['time'][name[5:]]
            if abs(got - expected) > 1e-12 or (expected == 0 and got != 0):
                fail(record, f'{name} {got!r}, expected {expected!r}')
        if kind == 'position':
            pairs = zip(('lon', 'lat', 'dist'), position_band(record, tt, ut1, rule))
        elif kind == 'chart':
            if (band['asc'] is None) != (record['angles'] is None) or (band['mc'] is None) != (record['angles'] is None):
                fail(record, 'the angles\' bands are null where the chart has angles, or the reverse')
            pairs = [(f'bodies.{row["body"]}', abs(row['speed']) / 24 * tt) for row in record['bodies']]
            given = {f'bodies.{row["body"]}': row['lon'] for row in band['bodies']}
            band = dict(band, **given)
        else:
            pairs = []
        for name, expected in pairs:
            got = band[name]
            if expected is None or got is None:
                if expected is not got:
                    fail(record, f'{name} {got!r}, expected {expected!r}')
            elif not close(got, expected) or (expected == 0 and got != 0):
                fail(record, f'{name} {got!r}, expected {expected!r}')
        if BAND_ID not in record['conventions'] or record['conventions'][-1] != BAND_ID:
            fail(record, 'the receipt does not name time-band:first-order last')
    return problems, judged


BAND_ID = 'time-band:first-order'


def rebanded(records, rule):
    """A copy of the dump whose bands are those of the variant `rule` (the controls of C1)."""
    out = []
    for record in records:
        if record.get('refused') or record.get('band') is None or record['kind'] not in ('position', 'chart', 'houses'):
            out.append(record)
            continue
        tt, ut1 = time_bands(record['instant'], rule)
        band = dict(record['band'], time={'tt': tt, 'ut1': ut1})
        if record['kind'] == 'position':
            band['lon'], band['lat'], band['dist'] = position_band(record, tt, ut1, rule)
        elif record['kind'] == 'chart':
            band['bodies'] = [{'body': row['body'], 'lon': abs(row['speed']) / 24 * tt} for row in record['bodies']]
        out.append(dict(record, band=band))
    return out


def tiny_zeros(value):
    """Every zero band in a copy of a record's band replaced by 5e-324 (control c)."""
    if isinstance(value, dict):
        return {k: tiny_zeros(v) for k, v in value.items()}
    if isinstance(value, list):
        return [tiny_zeros(v) for v in value]
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value == 0:
        return 5e-324
    return value


def c1(args):
    records = load(args.dump)
    problems, judged = c1_problems(records)
    zeros = []
    for record in records:
        if record.get('band') is not None:
            zeros.append(dict(record, band=dict(tiny_zeros(record['band']), time=tiny_zeros(record['band']['time']))))
        elif record['kind'] == 'events' and not record.get('refused'):
            zeros.append(dict(record, events=[dict(e, band=tiny_zeros(e['band'])) if e.get('band') else e for e in record['events']]))
        else:
            zeros.append(record)
    # Control e (added after review 2, the amendment of 2026-11-04): a zero band given to each position
    # without speeds, which "band is null exactly where speeds is null" must reject. It fails only on a dump
    # that holds such a position, as dump.mjs's since that amendment do.
    unbanded = [dict(r, band={'time': {'tt': 0.0, 'ut1': 0.0}, 'lon': 0.0, 'lat': 0.0, 'dist': 0.0})
                if r.get('kind') == 'position' and not r.get('refused') and r.get('speeds') is None else r for r in records]
    controls = {
        'a: the TT band d on every UTC input': c1_problems(rebanded(records, 'a'))[0],
        'b: the linear sum u + d after the table': c1_problems(rebanded(records, 'b'))[0],
        'c: every zero band replaced by 5e-324': c1_problems(zeros)[0],
        'd: the topocentric bands without w': c1_problems(rebanded(records, 'd'))[0],
        'e: a zero band where speeds is null': c1_problems(unbanded)[0],
    }
    return {
        'check': 'C1',
        'pass': not problems,
        'records': judged,
        'problems': len(problems),
        'firstProblems': [p for p in problems if p][:20],
        'controls': {name: {'failed': bool(found), 'problems': len(found)} for name, found in controls.items()},
    }


# --------------------------------------------------------------------------- C1b and C5: the sigmas from their sources


class Sources:
    """d from the site's twin of the ΔT model; u from the IERS rows the engine commits, by the rule of
    docs/time.md and src/time-scale-data.ts: before 1973-01-02 C04's largest 1972 formal error;
    through 2026-09-24 the largest formal error, among the rows flagged I, of the instant's UTC year;
    after it the formal errors of the rows flagged P on 2026-09-25, on every tenth day after it and on
    2027-10-02, interpolated linearly (and the first held before 2026-09-25); each in whole
    microseconds, as the table stores them; then the table's 0.79 ms added; outside the table, 0.9 s."""

    def __init__(self, lib, table, sources):
        spec = importlib.util.spec_from_file_location('deltat_twin', lib)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with open(table, encoding='utf-8') as f:
            self.model = module.Model(json.load(f))
        c04 = []
        with open(os.path.join(sources, 'eopc04-1972.txt'), encoding='utf-8') as f:
            for line in f:
                if line.startswith('#') or not line.strip():
                    continue
                cells = line.split()
                c04.append((int(float(cells[4])), float(cells[15])))
        self.early = max(round(error * 1e6) for _, error in c04) / 1e6
        self.finals_from = None
        self.observed = {}
        predicted = {}
        with gzip.open(os.path.join(sources, 'finals2000A-20260924-ut1.csv.gz'), 'rt', encoding='utf-8') as f:
            next(f)
            for line in f:
                mjd, date, flag, _, error = line.strip().split(',')
                mjd = int(mjd)
                if self.finals_from is None:
                    self.finals_from = mjd
                if flag == 'I':
                    year = int(date[:4])
                    self.observed[year] = max(self.observed.get(year, 0), round(float(error) * 1e6))
                    self.observed_to = mjd
                elif flag == 'P':
                    predicted[mjd] = round(float(error) * 1e6)
        self.to = max(predicted)
        days = list(range(self.observed_to + 1, self.to, 10)) + [self.to]
        self.knots = [(mjd, predicted[mjd] / 1e6) for mjd in days]

    def d(self, jd_ut1):
        return self.model.sigma(2000 + (jd_ut1 - 2451545) / 365.25)

    def u(self, utc_ms):
        """The table's band at a UTC instant the table answers for, held at its ends: a UT1 or TT input
        on its last day can have a UTC a fraction of a second past it (docs/time.md)."""
        mjd = utc_ms / DAY_MS + MJD_UNIX
        if mjd < self.finals_from:
            return self.early + TABLE_BOUND
        if mjd <= self.observed_to:
            year = datetime.datetime.fromtimestamp(utc_ms / 1000, datetime.timezone.utc).year
            return self.observed[year] / 1e6 + TABLE_BOUND
        knots = self.knots
        if mjd <= knots[0][0]:
            return knots[0][1] + TABLE_BOUND
        for (m0, e0), (m1, e1) in zip(knots, knots[1:]):
            if mjd <= m1:
                return e0 + (mjd - m0) / (m1 - m0) * (e1 - e0) + TABLE_BOUND
        return knots[-1][1] + TABLE_BOUND


def utc_ms_of(instant):
    """The UTC instant, ms: the record's utc, to the millisecond."""
    return datetime.datetime.strptime(instant['utc'], '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000


def instants_of(records):
    """Every zodiacs-deltat/1 and iers-utc/1 instant of the dumps, once each."""
    seen = {}
    for record in records:
        for instant in [record.get('instant')] + list(record.get('instants') or []):
            if instant and instant['deltaT']['model'] != 'pinned':
                key = json.dumps(instant, sort_keys=True)
                seen.setdefault(key, instant)
    return list(seen.values())


def c1b_problems(instants, sources, variant=None):
    problems = []
    for instant in instants:
        model = instant['deltaT']['model']
        if model == 'zodiacs-deltat/1':
            jd = instant['jdTt'] if variant == 'b' else instant['jdUt1']
            expected = sources.d(jd)
            if abs(instant['deltaT']['sigma'] - expected) > 1e-9:
                problems.append({'utc': instant['utc'], 'what': 'deltaT.sigma', 'got': instant['deltaT']['sigma'], 'expected': expected})
        ut1 = instant['timeScale']['ut1MinusUtc']
        if ut1 is not None and instant['timeScale']['input'] == 'utc':
            outside = not IERS_FROM_MS <= utc_ms_of(instant) <= TABLE_TO_MS
            if outside != (ut1['source'] == 'fallback'):
                problems.append({'utc': instant['utc'], 'what': 'ut1MinusUtc.source', 'got': ut1['source'], 'expected': 'fallback' if outside else 'the table'})
        if ut1 is not None:
            expected = UT1_FALLBACK if ut1['source'] == 'fallback' else sources.u(utc_ms_of(instant))
            if variant == 'a' and ut1['source'] != 'fallback':
                expected -= TABLE_BOUND
            if abs(ut1['sigma'] - expected) > 1e-9:
                problems.append({'utc': instant['utc'], 'what': 'ut1MinusUtc.sigma', 'got': ut1['sigma'], 'expected': expected})
            if model == 'iers-utc/1' and abs(instant['deltaT']['sigma'] - expected) > 1e-9:
                problems.append({'utc': instant['utc'], 'what': 'deltaT.sigma on the IERS basis', 'got': instant['deltaT']['sigma'], 'expected': expected})
    return problems


def c1b(args):
    sources = Sources(args.site_lib, args.site_table, args.sources)
    instants = instants_of(load(args.dump))
    problems = c1b_problems(instants, sources)
    controls = {
        'a: u without the 0.79 ms': c1b_problems(instants, sources, 'a'),
        'b: d at the year of jdTt': c1b_problems(instants, sources, 'b'),
    }
    return {
        'check': 'C1b',
        'pass': not problems,
        'records': len(instants),
        'models': {m: sum(1 for i in instants if i['deltaT']['model'] == m) for m in ('zodiacs-deltat/1', 'iers-utc/1')},
        'problems': len(problems),
        'firstProblems': problems[:20],
        'controls': {name: {'failed': bool(found), 'problems': len(found)} for name, found in controls.items()},
    }


def event_reference(event, sources):
    """R1 for a UTC-input instant at the event's own at, with d and u from the sources there."""
    at = datetime.datetime.strptime(event['at'], '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000
    d = sources.d(event['jdUt1'])
    if IERS_FROM_MS <= at <= TABLE_TO_MS:
        u = sources.u(at)
        return 0.0, u
    if at < IERS_FROM_MS:
        return d, d
    return math.hypot(UT1_FALLBACK, d), d


def c5_problems(records, sources, variant=None):
    problems, events = [], 0
    for record in records:
        if record['kind'] != 'events' or record.get('refused'):
            continue
        first = record['instants'][0]
        for event in record['events']:
            events += 1
            band = event.get('band')
            if band is None:
                problems.append({'at': event['at'], 'what': 'no band'})
                continue
            got_utc, got_ut1 = band['utc'], band['ut1']
            if variant == 'a':
                got_utc = got_ut1
            elif variant == 'b':
                got_utc, got_ut1 = time_bands(dict(first, timeScale=dict(first['timeScale'], input='utc')))[0], first['deltaT']['sigma']
            utc, ut1 = event_reference(event, sources)
            for name, got, expected in (('utc', got_utc, utc), ('ut1', got_ut1, ut1)):
                if abs(got - expected) > 1e-9 or (expected == 0 and got != 0):
                    problems.append({'at': event['at'], 'window': record['entry'], 'what': name, 'got': got, 'expected': expected})
    return problems, events


def c5(args):
    sources = Sources(args.site_lib, args.site_table, args.sources)
    records = load(args.dump)
    problems, events = c5_problems(records, sources)
    controls = {
        'a: band.utc = d': c5_problems(records, sources, 'a')[0],
        'b: the bands of the window\'s first instant': c5_problems(records, sources, 'b')[0],
    }
    return {
        'check': 'C5',
        'pass': not problems,
        'records': events,
        'windows': sum(1 for r in records if r['kind'] == 'events'),
        'problems': len(problems),
        'firstProblems': problems[:20],
        'controls': {name: {'failed': bool(found), 'problems': len(found), 'windows': sorted({p.get('window') for p in found if p.get('window')})} for name, found in controls.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('check', choices=('c1', 'c1b', 'c5'))
    parser.add_argument('--dump', action='append', required=True)
    parser.add_argument('--site-lib')
    parser.add_argument('--site-table')
    parser.add_argument('--sources')
    parser.add_argument('--out')
    args = parser.parse_args()
    report = {'c1': c1, 'c1b': c1b, 'c5': c5}[args.check](args)
    report['python'] = sys.version.split()[0]
    report['dumps'] = [os.path.basename(path) for path in args.dump]
    text = json.dumps(report, indent=1) + '\n'
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(text)
    controls = ', '.join(f'{name} {"failed" if c["failed"] else "PASSED"}' for name, c in report['controls'].items())
    print(f'{report["check"]}: {"pass" if report["pass"] else "FAIL"} ({report["records"]} records); controls: {controls}')
    sys.exit(0 if report['pass'] and all(c['failed'] for c in report['controls'].values()) else 1)


if __name__ == '__main__':
    main()
