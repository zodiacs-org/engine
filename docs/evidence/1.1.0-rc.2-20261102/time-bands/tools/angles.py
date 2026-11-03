#!/usr/bin/env python3
"""Check C3 of ../PREREGISTRATION.md (section 6): the bands of the angles and
cusps against the geometry of the conformance suite's L2 arbiter, with its
controls. Standard library only; run with Python 3.9.6 and -I.

    python3 -I angles.py --dump <dump-T2.json> --dump <dump-T3.json> --arbiter <conformance/arbiters/l2/build.py> --out <c3.json>

Records: the dumps' houses() records tagged C3 in the input forms whose UT1
band is not 0 (F1; F3 and F5 from 1972), at S1 to S5 in all 13 systems (T3:
S1 only), the Lahiri copies of the S1 records, and S7's Placidus and Koch,
which fall back. Reference: the arbiter's Sky, ascendant, midheaven, vertex,
east_point and house_cusps, driven by each result's armc, obliquity and
latitude, at the RAMC moved by ± one UT1 second of the Earth's rotation,
15 × 1.00273781191135448 = 15.04106717867032″; rate = the difference over the
2 s, wrapped into (−180°, 180°]; expected band = |rate| × the UT1 band (R1,
bands.py). Rule: |band − expected| ≤ 1e-6 × expected + 1e-9″, and for
Placidus cusps also + 3.6e-6″ a second × σUT1; whole-sign cusps and the cusps
where Placidus or Koch falls back exactly 0; a case where the arbiter raises
is counted and reported, not judged; the Lahiri copies equal the tropical
bands exactly. At S7 the angles are reported, not judged.

Since the amendment of 2026-11-03 (review 1), an angle's band adds its rate
on TT times the TT band, which this arbiter's geometry does not give: C3
judges only the records whose TT band is 0 (F1, and F3 from 1972 to the end
of the IERS table), and counts the others (F3 after the table, F5 from
1972), unjudged; C4c checks the TT term.

The arbiter imports pyerfa at its head and calls erfa.cal2jd when it loads,
for four date constants (build.py lines 156 and 1256 to 1259) that none of
the functions used here reads. It is loaded with a stub erfa module that
gives cal2jd (the Gregorian calendar to a two-part Julian date, in integer
arithmetic) and raises for every other function, so no ERFA call can reach a
value of this check.
"""
import argparse
import datetime
import importlib.util
import json
import math
import os
import sys
import types

# No bytecode is written beside the tools or the arbiter, in the checkout.
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from bands import IERS_FROM_MS, load, time_bands  # noqa: E402

ONE_SECOND = math.radians(15 * 1.00273781191135448 / 3600)
SOLAR_SECOND = math.radians(15.0 / 3600)
ARBITER_SYSTEM = {'whole': 'whole-sign'}


def arbiter(path):
    class Refusing(types.ModuleType):
        def __getattr__(self, name):
            def refuse(*args, **kwargs):
                raise RuntimeError(f'erfa.{name} was called')
            return refuse

    stub = Refusing('erfa')

    def cal2jd(year, month, day):
        a = (14 - month) // 12
        y, m = year + 4800 - a, month + 12 * a - 3
        jdn = day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
        return 2400000.5, float(jdn - 2400001)

    stub.cal2jd = cal2jd
    sys.modules['erfa'] = stub
    spec = importlib.util.spec_from_file_location('l2_arbiter', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def wrap(d):
    """Radians into (−π, π]."""
    d = math.fmod(d, 2 * math.pi)
    if d > math.pi:
        d -= 2 * math.pi
    elif d <= -math.pi:
        d += 2 * math.pi
    return d


def values(l2, record, theta):
    s = l2.Sky(theta, math.radians(record['obliquity']), math.radians(record['request']['place']['latitude']))
    system = record['request'].get('houseSystem', 'whole')
    out = {'asc': l2.ascendant(s)[0], 'mc': l2.midheaven(s)[0], 'vertex': l2.vertex(s)[0], 'eastPoint': l2.east_point(s)[0]}
    if record['system'] == system:
        out['cusps'] = l2.house_cusps(ARBITER_SYSTEM.get(system, system), s)
    return out


def utc_ms(instant):
    return datetime.datetime.strptime(instant['utc'], '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000


def selected(record):
    """The forms whose UT1 band is not 0: F1 always, F3 and F5 from 1972; T3 at S1 only."""
    if record['entry'].startswith('T3') and record['request']['place'] != {'latitude': 45, 'longitude': 10}:
        return False
    if record['form'] == 'F1':
        return True
    return record['form'] in ('F3', 'F5') and utc_ms(record['instant']) >= IERS_FROM_MS


def judged(record):
    """Selected, and judged only where its TT band is 0 (the amendment of 2026-11-03, review 1)."""
    return selected(record) and time_bands(record['instant'])[0] == 0


def problems_of(l2, records, variant=None):
    problems, raised, reported, unjudged = [], [], [], []
    tropical = {}
    for record in records:
        if 'C3' not in record.get('checks', []) or record.get('refused') or not selected(record):
            continue
        tt, ut1 = time_bands(record['instant'])
        if tt != 0:
            # The band adds the rate on TT times the TT band, which the arbiter's geometry does not give.
            unjudged.append(record)
            continue
        sigma = tt if variant == 'b' else ut1
        step = SOLAR_SECOND if variant == 'a' else ONE_SECOND
        band = record['band']
        sidereal = 'zodiac' in record['request']
        site = record['request']['place']
        key = (record['entry'], record['form'], site['latitude'], site['longitude'], record['request'].get('houseSystem', 'whole'))
        if sidereal:
            if key in tropical and band != tropical[key]:
                problems.append({'entry': record['entry'], 'form': record['form'], 'request': record['request'], 'what': 'the Lahiri copy differs from the tropical band'})
            continue
        tropical[key] = band
        system = record['request'].get('houseSystem', 'whole')
        fallen = record['system'] != system
        if record['system'] == 'whole' and any(c != 0 for c in band['cusps']):
            problems.append({'entry': record['entry'], 'form': record['form'], 'request': record['request'], 'what': 'whole-sign or fallback cusps not exactly 0'})
        polar = abs(site['latitude']) >= 90 - record['obliquity']
        theta = math.radians(record['armc'])
        try:
            after, before = values(l2, record, theta + step), values(l2, record, theta - step)
        except (ArithmeticError, ValueError) as error:
            raised.append({'entry': record['entry'], 'form': record['form'], 'request': record['request'], 'raised': type(error).__name__})
            continue
        names = ['asc', 'mc', 'vertex', 'eastPoint'] + ([f'cusps.{k}' for k in range(12)] if 'cusps' in after and record['system'] != 'whole' else [])
        for name in names:
            if name.startswith('cusps.'):
                k = int(name[6:])
                a, b, got = after['cusps'][k], before['cusps'][k], band['cusps'][k]
            else:
                a, b, got = after[name], before[name], band[name]
            # Arcseconds a second of UT1: the difference over the 2 s (the control turns the Earth at the solar rate).
            rate = abs(wrap(a - b)) / 2 * 180 / math.pi * 3600
            expected = rate * sigma
            limit = 1e-6 * expected + 1e-9 + (3.6e-6 * sigma if system == 'placidus' and name.startswith('cusps.') else 0.0)
            entry = {'entry': record['entry'], 'form': record['form'], 'request': record['request'], 'what': name, 'band': got, 'expected': expected}
            if polar or fallen and name.startswith('cusps.'):
                reported.append(entry)
            elif abs(got - expected) > limit:
                problems.append(dict(entry, limit=limit))
    return problems, raised, reported, unjudged


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--dump', action='append', required=True)
    parser.add_argument('--arbiter', required=True)
    parser.add_argument('--out')
    args = parser.parse_args()
    l2 = arbiter(args.arbiter)
    records = load(args.dump)
    problems, raised, reported, unjudged = problems_of(l2, records)
    judged_count = sum(1 for r in records if 'C3' in r.get('checks', []) and not r.get('refused') and judged(r))
    controls = {
        'a: the solar-time rate, 15 arcseconds a second': problems_of(l2, records, 'a')[0],
        'b: the TT band in place of the UT1 band': problems_of(l2, records, 'b')[0],
    }
    report = {
        'check': 'C3',
        'pass': judged_count > 0 and not problems,
        'records': judged_count,
        'notJudgedWithTtBand': {'records': len(unjudged), 'forms': sorted({r['form'] for r in unjudged})},
        'problems': len(problems),
        'firstProblems': problems[:20],
        'arbiterRaised': {'cases': len(raised), 'first': raised[:10]},
        'reportedNotJudged': {'cases': len(reported), 'largestRelativeDifference': max((abs(r['band'] - r['expected']) / r['expected'] for r in reported if r['expected']), default=None)},
        'controls': {name: {'failed': bool(found), 'problems': len(found)} for name, found in controls.items()},
        'python': sys.version.split()[0],
        'dumps': [os.path.basename(path) for path in args.dump],
    }
    text = json.dumps(report, indent=1) + '\n'
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(text)
    controls_text = ', '.join(f'{name} {"failed" if c["failed"] else "PASSED"}' for name, c in report['controls'].items())
    print(f'C3: {"pass" if report["pass"] else "FAIL"} ({judged_count} records, {len(unjudged)} with a TT band not judged, {len(raised)} where the arbiter raised, {len(reported)} values reported); controls: {controls_text}')
    sys.exit(0 if report['pass'] and all(c['failed'] for c in report['controls'].values()) else 1)


if __name__ == '__main__':
    main()
