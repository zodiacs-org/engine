#!/usr/bin/env python3
"""Hold a sweep run on the shipped DE440 pack (engine_sweep.mjs --ephemeris de440) to the position bounds
calc() quotes for the pack's places, src/calc-bounds-de440.ts's DE440_MEASURED.

    python3 docs/evidence/de440-sweep-20261111/tools/check_pack.py DIR

DIR holds the run's summary.json (sweep.py merge). For each body whose apparent geocentric place comes from
the pack (the Sun, the Moon and Mercury to Pluto), the largest angle between the pack's direction and the
kernel's apparent place with the Sun's light deflection (sweep.py's APPARENT: erfa.ld with erfa.ldsun's
limiter, none behind the Sun's disc, as JPL Horizons) over every instant and all eight frames, before any
rounding, must be at or under the body's DE440_MEASURED. It prints one line per body and exits 1 if any is
over, or if the run is not a pack run. The table's values are also held by src/calc-bounds-de440.test.ts,
which recomputes them from the conformance suite's L1 vectors (JPL Horizons) and the committed pack sweep.

calc() quotes DE440_AT_LIMB instead within 3 arcseconds of the Sun's limb, where the deflection steps; no
noon instant of the sweep has fallen there, and this check would report one that did as over its bound.

The true node's bound on the pack is not quoted (value null), so its rows are not checked here; its largest
difference from the kernel's osculating node is printed for the record.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPOSITORY = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
TABLE = os.path.join(REPOSITORY, 'src', 'calc-bounds-de440.ts')
BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']


def table():
    text = open(TABLE, encoding='utf-8').read()
    block = re.search(r'export const DE440_MEASURED: Readonly<Record<string, number>> = \{(.*?)\};', text, re.S)
    if not block:
        raise SystemExit(f'{TABLE}: no DE440_MEASURED table')
    rows = dict((name, float(value)) for name, value in re.findall(r'(\w+): ([0-9.]+)', block.group(1)))
    if sorted(rows) != sorted(BODIES):
        raise SystemExit(f'{TABLE}: DE440_MEASURED names {sorted(rows)}, expected {sorted(BODIES)}')
    return rows


def main(directory):
    summary = json.load(open(os.path.join(directory, 'summary.json'), encoding='utf-8'))
    if summary.get('ephemeris') != 'de440':
        raise SystemExit(f'{directory}: a run on {summary.get("ephemeris", "astronomy-engine")}, not on the pack; '
                         'write_bounds.py --against checks astronomy-engine runs')
    bounds = table()
    over = 0
    print(f'engine {summary["engine"]["version"]}, dist {summary["build"]["distSha256"]}, '
          f'{summary["corpus"]["n"]} instants, against {summary["arbiter"]["kernel"]["sha256"][:12]}…')
    for body in BODIES:
        rows = [row for row in summary['de440'] if row['correction'] == 'apparent' and row['body'] == body and row['arbiter'] == 'APPARENT']
        if len(rows) != 1:
            raise SystemExit(f'{body}: {len(rows)} apparent rows in the summary')
        worst = max(rows[0]['frames'], key=lambda frame: frame['position']['max'])
        largest = worst['position']['max']
        verdict = 'ok' if largest <= bounds[body] else 'OVER'
        over += verdict != 'ok'
        print(f'{body:8} largest {largest:.6f}" ({worst["frame"]}, JD {worst["position"]["maxAtJdTt"]} TT) '
              f'bound {bounds[body]}" {verdict}')
    for row in summary['de440']:
        if row['body'] == 'North Node':
            worst = max(frame['position']['max'] for frame in row['frames'])
            print(f'North Node largest {worst:.6f}" from the osculating node (not quoted: calc() gives null on the pack)')
    if over:
        raise SystemExit(f'{over} of {len(BODIES)} bodies over the bound calc() quotes on the pack')
    print(f'all {len(BODIES)} bodies within src/calc-bounds-de440.ts')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: check_pack.py DIR')
    main(sys.argv[1])
