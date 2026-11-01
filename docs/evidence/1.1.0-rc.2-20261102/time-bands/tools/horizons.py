#!/usr/bin/env python3
"""Check C2 of ../PREREGISTRATION.md (section 6): the bands of geocentric
positions against JPL Horizons (DE441) rates times the TT band, with its
controls. Standard library only; run with Python 3.9.6 and -I.

    python3 -I horizons.py --dump <dump-T1.json> --horizons <docs/evidence/calc-api/horizons> --out <c2.json>

Records: the T1 dump's records for the Sun, the Moon and the planets,
geocentric, apparent and geometric, in equatorial-icrs and ecliptic-icrs, in
the input forms whose TT band is not 0 (F2 at every instant, F3 before 1972
and after the IERS table, F5 from 1972). Reference: the Horizons vectors that
calc-api committed, read in plain Python (geo-LTS-*, with .2, at t and
t ± 0.0001 day for the apparent case; geo-NONE-* with velocities for the
geometric), ecliptic-icrs being R1(84381.406″) of the ICRF vector, and rates
as calc-api defines them: central differences over t ± 0.0001 day for LT+S,
Horizons's velocity for NONE. Expected band = |Horizons rate| × the TT band /
24, the TT band by R1 written again (bands.py). Rule: |band − expected| ≤
σTT × B / 86,400 / cos(lat) + 1e-9″ for lon, the same without the cosine for
lat, B being the engine's measured speed bound for the case (the result's
bounds.speed). The distance bands are reported, not judged. Without the
dump's T1 records the check has nothing to judge, and says so.
"""
import argparse
import datetime
import json
import math
import os
import sys

# No bytecode is written beside the tools or the arbiter, in the checkout.
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from bands import IERS_FROM_MS, TABLE_TO_MS, load, time_bands  # noqa: E402

NAIF = {'Sun': '10', 'Moon': '301', 'Mercury': '199', 'Venus': '299', 'Mars': '4', 'Jupiter': '5', 'Saturn': '6',
        'Uranus': '7', 'Neptune': '8', 'Pluto': '9'}
STEP = 0.0001
EPS0 = math.radians(84381.406 / 3600)


def vectors(folder, name):
    """Rows of a Horizons VECTORS file (and its .2 file), keyed by the TT Julian date to 6 decimals."""
    rows = {}
    kind = 'LT+S CORRECTED' if '-LTS-' in name else 'GEOMETRIC'
    for path in (os.path.join(folder, name + '.txt'), os.path.join(folder, name + '.2.txt')):
        if not os.path.exists(path):
            continue
        text = open(path, encoding='utf-8').read()
        for banner in ('Reference frame : ICRF', 'Output units    : AU-D', 'Center body name: Earth (399)', f'Output type     : {kind} cartesian states'):
            if banner not in text:
                raise SystemExit(f'{path}: no "{banner}" line')
        for line in text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip().splitlines():
            cells = [c.strip() for c in line.split(',')]
            values = [float(c) for c in cells[2:] if c]
            rows[round(float(cells[0]), 6)] = (values[:3], values[3:6] if len(values) >= 6 else None)
    return rows


def turn(frame, v):
    """equatorial-icrs is the ICRF vector; ecliptic-icrs is R1(ε0) of it."""
    if frame == 'equatorial-icrs':
        return list(v)
    c, s = math.cos(EPS0), math.sin(EPS0)
    return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]


def spherical(v):
    r = math.sqrt(sum(x * x for x in v))
    return math.degrees(math.atan2(v[1], v[0])) % 360.0, math.degrees(math.asin(v[2] / r)), r


def wrap(d):
    return (d + 180.0) % 360.0 - 180.0


def rates(r, v):
    """calc-api's rates from a position and velocity: lon and lat degrees a day, dist au a day."""
    x, y, z = r
    vx, vy, vz = v
    plane = x * x + y * y
    square = plane + z * z
    return (math.degrees((x * vy - y * vx) / plane),
            math.degrees((vz * plane - z * (x * vx + y * vy)) / (square * math.sqrt(plane))),
            (x * vx + y * vy + z * vz) / math.sqrt(square))


def horizons_rate(rows, frame, jd, apparent):
    here = rows.get(round(jd, 6))
    if here is None:
        return None
    if apparent:
        before, after = rows.get(round(jd - STEP, 6)), rows.get(round(jd + STEP, 6))
        if before is None or after is None:
            return None
        lon0, lat0, r0 = spherical(turn(frame, before[0]))
        lon1, lat1, r1 = spherical(turn(frame, after[0]))
        return wrap(lon1 - lon0) / (2 * STEP), (lat1 - lat0) / (2 * STEP), (r1 - r0) / (2 * STEP)
    if here[1] is None:
        return None
    return rates(turn(frame, here[0]), turn(frame, here[1]))


def utc_ms(instant):
    return datetime.datetime.strptime(instant['utc'], '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000


def selected(record):
    """The forms whose TT band is not 0: F2 always, F3 before 1972 and after the table, F5 from 1972."""
    if record['form'] == 'F2':
        return True
    at = utc_ms(record['instant'])
    if record['form'] == 'F3':
        return at < IERS_FROM_MS or at > TABLE_TO_MS
    if record['form'] == 'F5':
        return at >= IERS_FROM_MS
    return False


def cases(records, folder):
    anchors = {r['entry']: r['time']['jd'] for r in records if r['kind'] == 'anchor' and 'time' in r and 'jd' in r['time']}
    files = {}
    out, missing = [], 0
    for record in records:
        if 'C2' not in record.get('checks', []) or record.get('refused') or not selected(record):
            continue
        body = record['request']['body']
        apparent = (record['request'].get('flags') or {}).get('correction', 'apparent') == 'apparent'
        name = f'geo-{"LTS" if apparent else "NONE"}-{NAIF[body]}'
        if name not in files:
            files[name] = vectors(folder, name)
        jd = anchors[record['entry']]
        rate = horizons_rate(files[name], record['request']['frame'], jd, apparent)
        if rate is None:
            missing += 1
            continue
        out.append((record, rate))
    return out, missing


def problems_of(pairs, variant=None):
    problems, distances = [], []
    bodies = [p[0]['request']['body'] for p in pairs]
    by_key = {}
    for record, rate in pairs:
        key = (record['entry'], record['form'], record['request']['frame'], (record['request'].get('flags') or {}).get('correction', 'apparent'))
        by_key.setdefault(key, {})[record['request']['body']] = rate
    order = list(NAIF)
    for record, rate in pairs:
        tt, ut1 = time_bands(record['instant'])
        sigma = ut1 if variant == 'b' else tt
        if variant == 'c':
            key = (record['entry'], record['form'], record['request']['frame'], (record['request'].get('flags') or {}).get('correction', 'apparent'))
            others = by_key[key]
            body = record['request']['body']
            nxt = order[(order.index(body) + 1) % len(order)]
            rate = others.get(nxt, rate)
        band = record['band']
        factor = 1.05 if variant == 'a' else 1.0
        bound = record['speedBound']
        if bound is None:
            problems.append({'entry': record['entry'], 'what': 'no measured speed bound', 'request': record['request']})
            continue
        lat = math.radians(record['lat'])
        for name, got, expected, limit in (
            ('lon', band['lon'] * factor, abs(rate[0]) * sigma / 24, tt * bound / 86400 / math.cos(lat) + 1e-9),
            ('lat', band['lat'] * factor, abs(rate[1]) * sigma / 24, tt * bound / 86400 + 1e-9),
        ):
            if abs(got - expected) > limit:
                problems.append({'entry': record['entry'], 'form': record['form'], 'request': record['request'], 'what': name, 'band': got, 'expected': expected, 'limit': limit})
        if band['dist'] is not None and variant is None:
            distances.append(abs(band['dist'] - abs(rate[2]) * tt / 86400))
    return problems, distances


def t1():
    """T1's TT Julian dates, as corpora.mjs and calc-api compute them."""
    phi = (math.sqrt(5) - 1) / 2
    return [round(2378496.5 + 146097 * ((0.5 + k * phi) % 1.0), 6) for k in range(32)]


def inventory(folder):
    """Without engine values: whether the committed Horizons rows cover T1 for every case C2 reads."""
    out = {}
    for body, naif in NAIF.items():
        for kind in ('LTS', 'NONE'):
            rows = vectors(folder, f'geo-{kind}-{naif}')
            need = [round(jd + d, 6) for jd in t1() for d in ((-STEP, 0.0, STEP) if kind == 'LTS' else (0.0,))]
            out[f'geo-{kind}-{naif}'] = {'rows': len(rows), 'missing': sum(1 for jd in need if jd not in rows)}
    return out


def selftest(folder):
    """The rule and its controls on synthetic records: at T1's first instant, every C2 body and case,
    with a band equal to the expected value and a speed bound of 0.01 arcseconds a day, on a UT1
    input whose TT band is 0.5 s. No engine value is read; the check must pass and every control fail."""
    jd = t1()[0]
    instant = {'utc': '1802-08-19T23:57:18.000Z', 'deltaT': {'sigma': 0.5, 'model': 'zodiacs-deltat/1'},
               'timeScale': {'input': 'ut1', 'basis': 'delta-t', 'ut1MinusUtc': None}}
    records = [{'kind': 'anchor', 'entry': 'S', 'time': {'jd': jd, 'scale': 'tt'}}]
    for body, naif in NAIF.items():
        for correction in ('apparent', 'geometric'):
            rows = vectors(folder, f'geo-{"LTS" if correction == "apparent" else "NONE"}-{naif}')
            for frame in ('equatorial-icrs', 'ecliptic-icrs'):
                rate = horizons_rate(rows, frame, jd, correction == 'apparent')
                lat = spherical(turn(frame, rows[round(jd, 6)][0]))[1]
                records.append({'kind': 'position', 'checks': ['C2'], 'entry': 'S', 'form': 'F2', 'instant': instant,
                                'request': {'body': body, 'frame': frame, 'flags': {'correction': correction}},
                                'lat': lat, 'speedBound': 0.01,
                                'band': {'lon': abs(rate[0]) * 0.5 / 24, 'lat': abs(rate[1]) * 0.5 / 24, 'dist': abs(rate[2]) * 0.5 / 86400}})
    pairs, missing = cases(records, folder)
    problems = problems_of(pairs)[0]
    controls = {name: bool(problems_of(pairs, variant)[0]) for name, variant in (('a', 'a'), ('b', 'b'), ('c', 'c'))}
    print(f'C2 selftest: {len(pairs)} synthetic records, {missing} without rows, {len(problems)} problems; controls failed: {controls}')
    sys.exit(0 if pairs and not missing and not problems and all(controls.values()) else 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--dump', action='append')
    parser.add_argument('--horizons', required=True)
    parser.add_argument('--inventory', action='store_true', help='only check that the Horizons rows cover T1')
    parser.add_argument('--selftest', action='store_true', help='run the rule and its controls on synthetic records built from the Horizons rates')
    parser.add_argument('--out')
    args = parser.parse_args()
    if args.selftest:
        selftest(args.horizons)
        return
    if args.inventory:
        found = inventory(args.horizons)
        print(json.dumps({'check': 'C2 inventory', 'files': found, 'missing': sum(f['missing'] for f in found.values())}, indent=1))
        sys.exit(0 if all(f['missing'] == 0 for f in found.values()) else 1)
    pairs, missing = cases(load(args.dump), args.horizons)
    problems, distances = problems_of(pairs)
    controls = {
        'a: bands times 1.05': problems_of(pairs, 'a')[0],
        'b: the UT1 band in place of the TT band': problems_of(pairs, 'b')[0],
        'c: each body against the next body\'s expected value': problems_of(pairs, 'c')[0],
    }
    report = {
        'check': 'C2',
        'pass': bool(pairs) and not problems and not missing,
        'records': len(pairs),
        'missingHorizonsRows': missing,
        'problems': len(problems),
        'firstProblems': problems[:20],
        'reportedNotJudged': {'distanceBand': {'cases': len(distances), 'largestDifferenceAu': max(distances) if distances else None}},
        'controls': {name: {'failed': bool(found), 'problems': len(found)} for name, found in controls.items()},
        'python': sys.version.split()[0],
        'dumps': [os.path.basename(path) for path in args.dump],
    }
    text = json.dumps(report, indent=1) + '\n'
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(text)
    controls_text = ', '.join(f'{name} {"failed" if c["failed"] else "PASSED"}' for name, c in report['controls'].items())
    print(f'C2: {"pass" if report["pass"] else "FAIL"} ({len(pairs)} records, {missing} without Horizons rows); controls: {controls_text}')
    sys.exit(0 if report['pass'] and all(c['failed'] for c in report['controls'].values()) else 1)


if __name__ == '__main__':
    main()
