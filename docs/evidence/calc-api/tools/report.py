#!/usr/bin/env python3
"""Markdown tables from ../results/summary.json, written to ../results/tables.md.

    python3 docs/evidence/calc-api/tools/report.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.normpath(os.path.join(HERE, '..', 'results'))
ORDER = ['Sun', 'Moon', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
         'North Node', 'South Node', 'Mean Node', 'Mean South Node', 'Black Moon Lilith']
GROUPS = [('geocentric', 'apparent'), ('geocentric', 'astrometric'), ('geocentric', 'geometric'),
          ('heliocentric', 'apparent'), ('heliocentric', 'astrometric'), ('heliocentric', 'geometric'),
          ('barycentric', 'apparent'), ('barycentric', 'astrometric'), ('barycentric', 'geometric'),
          ('topocentric', 'apparent'), ('topocentric', 'astrometric'), ('topocentric', 'geometric')]
WHAT = {
    'C1': 'x, y, z against lon, lat, dist (angle)', 'C1dist': 'x, y, z against lon, lat, dist (relative length)',
    'C2': 'ICRS against J2000.0 turned by the frame bias (bp06)', 'C3': 'mean of date against J2000.0 precessed (bp06 rp)',
    'C4': 'true against mean of date nutated (numat, nut06a)', 'C5a': 'equator against ecliptic of date, ERFA\'s true obliquity',
    'C5b': 'the same, the engine\'s own true obliquity', 'C6': 'mean equator against mean ecliptic of date (obl06)',
    'C7': 'J2000.0 equator against J2000.0 ecliptic (84381.406″)', 'C8': 'ICRS equator against ICRS ecliptic (84381.406″)',
    'C9': 'true of date against J2000.0, whole chain (pnm06a)', 'C10': 'the true node, equator against ecliptic of date',
}


def f(x, digits=3):
    if x is None:
        return '—'
    if x == 0:
        return '0'
    if abs(x) >= 100:
        return f'{x:.0f}'
    if abs(x) >= 0.01:
        return f'{x:.{digits}f}'.rstrip('0').rstrip('.') if '.' in f'{x:.{digits}f}' else f'{x:.{digits}f}'
    return f'{x:.2e}'


def trio(s):
    """median / 95th percentile / maximum of a [n, median, p95, max] statistic."""
    return f"{f(s[1])} / {f(s[2])} / {f(s[3])}" if s else '—'


def main():
    summary = json.load(open(os.path.join(RESULTS, 'summary.json')))
    out = []
    out.append('## Frame-transform consistency (preregistered checks)\n')
    out.append('| check | compares | tolerance | n | median | max | verdict |')
    out.append('| --- | --- | ---: | ---: | ---: | ---: | --- |')
    for c in summary['consistency']:
        unit = '' if c['unit'] == 'relative' else '″'
        out.append(f"| {c['check']} | {WHAT[c['check']]} | {c['tolerance']:g}{unit} | {c['n']} | "
                   f"{c['median']:.2e}{unit} | {c['max']:.2e}{unit} | {c['verdict']} |")

    by_body = {(e['center'], e['correction'], e['body']): e for e in summary['pooled']['byBody']}
    by_frame = {(e['center'], e['correction'], e['frame']): e for e in summary['pooled']['byFrame']}
    frames = sorted({e['frame'] for e in summary['pooled']['byFrame']}, key=lambda x: (not x.startswith('ecl'), x))

    out.append('\n## Against Horizons, by body (all eight frames pooled)\n')
    out.append('Position: angle between directions, arcseconds, median / 95th percentile / maximum. Distance: '
               'largest relative difference. Speed: angular-rate difference, arcseconds a day, median / 95th / max.\n')
    for center, correction in GROUPS:
        rows = [(b, by_body[(center, correction, b)]) for b in ORDER if (center, correction, b) in by_body]
        if not rows:
            continue
        out.append(f'### {center}, {correction}\n')
        out.append('| body | n | position ″ | distance, max | speed ″/day |')
        out.append('| --- | ---: | --- | ---: | --- |')
        for body, e in rows:
            out.append(f"| {body} | {e['position'][0]} | {trio(e['position'])} | "
                       f"{f(e['distance'][3]) if 'distance' in e else '—'} | {trio(e.get('speed'))} |")
        out.append('')

    out.append('## Against Horizons, by frame (bodies pooled)\n')
    out.append('| center, correction | frame | n | position ″ | speed ″/day |')
    out.append('| --- | --- | ---: | --- | --- |')
    for center, correction in GROUPS:
        for frame in frames:
            e = by_frame.get((center, correction, frame))
            if e:
                out.append(f"| {center}, {correction} | {frame} | {e['position'][0]} | {trio(e['position'])} | "
                           f"{trio(e.get('speed'))} |")

    out.append('\n## Per case: longitude and latitude components, two frames\n')
    out.append('Arcseconds, median / 95th / max: the longitude (right ascension) difference times the cosine of the '
               'latitude (declination), and the latitude (declination) difference, in the true ecliptic of date and the '
               'ICRS equator; summary.json has all eight frames. The geocentric apparent Moon is listed against '
               'Horizons\'s apparent (LTS) and geometric (NONE) Moon.\n')
    out.append('| center | correction | body | arbiter | frame | lon·cos lat ″ | lat ″ |')
    out.append('| --- | --- | --- | --- | --- | --- | --- |')
    for r in summary['horizons']:
        for e in r['frames']:
            if 'lonCosLat' in e and e['frame'] in ('ecliptic-true-of-date', 'equatorial-icrs'):
                out.append(f"| {r['center']} | {r['correction']} | {r['body']} | {r['arbiter']} | {e['frame']} | "
                           f"{trio(e['lonCosLat'])} | {trio(e['lat'])} |")

    out.append('\n## The lunar points\n')
    out.append('| point | arbiter | frame | position ″ | speed ″/day |')
    out.append('| --- | --- | --- | --- | --- |')
    for r in summary['horizons']:
        if r['body'] in ORDER[11:]:
            for e in r['frames']:
                out.append(f"| {r['body']} | {r['arbiter']} | {e['frame']} | {trio(e['position'])} | {trio(e.get('speed'))} |")

    out.append('\n## The central difference\'s own error (Richardson, engine only)\n')
    out.append('| center | correction | body | largest estimate, lon rate · cos lat ″/day | lat rate ″/day |')
    out.append('| --- | --- | --- | ---: | ---: |')
    for r in summary['richardson']:
        out.append(f"| {r['center']} | {r['correction']} | {r['body']} | {r['maxLonRateCosLatArcsecPerDay']:.2e} | "
                   f"{r['maxLatRateArcsecPerDay']:.2e} |")
    m = summary['moonLightTimeArcsec']
    out.append(f"\nThe engine's geocentric Moon without its light time: {m['min']:.3f}″ to {m['max']:.3f}″, "
               f"median {m['median']:.3f}″, over the 32 instants.\n")
    p = summary['plutoAnalyticMinusDerivative']
    out.append(f"Pluto's analytic speed against the derivative of its position (fourth-order central difference, "
               f"h = 0.01 day), geocentric, heliocentric and barycentric, J2000.0 and ICRS frames: at most "
               f"{p['maxArcsecPerDay']:.2e}″/day ({p['center']}, {p['frame']}, JD {p['jdTt']} TT).\n")
    u = summary['ut1MinusUtcEffect']
    out.append('The topocentric positions moved by UT1 − UTC, which the ΔT pins leave out after 1962: at most '
               f"{u['withEop']['maxArcsec']:.3f}″ with the IERS values ({u['withEop']['body']}, JD {u['withEop']['jdTt']} TT, "
               f"UT1 − UTC = {u['withEop']['ut1MinusUtc']:.3f} s), and {u['after2026']['maxArcsec']:.3f}″ for 0.1 s "
               'after 2026.\n')

    out.append('## The bounds rule\'s output (src/calc-bounds.ts, which leaves out the barycentric Sun)\n')
    out.append('| center/correction/body | position ″ | distance, relative | speed ″/day |')
    out.append('| --- | ---: | ---: | ---: |')
    for key, (pos, dist, speed) in summary['bounds'].items():
        out.append(f"| {key} | {pos:g} | {'—' if dist is None else f'{dist:g}'} | {'—' if speed is None else f'{speed:g}'} |")
    with open(os.path.join(RESULTS, 'tables.md'), 'w') as fh:
        fh.write('# Tables\n\nWritten by tools/report.py from summary.json; do not edit by hand.\n\n' + '\n'.join(out) + '\n')


if __name__ == '__main__':
    main()
