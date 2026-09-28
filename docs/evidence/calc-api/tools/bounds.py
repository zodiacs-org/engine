#!/usr/bin/env python3
"""Write src/calc-bounds.ts from ../results/summary.json, by the bounds rule in
PREREGISTRATION.md (compare.py applies the rule; this only writes it out).

    python3 docs/evidence/calc-api/tools/bounds.py           # write
    python3 docs/evidence/calc-api/tools/bounds.py --check   # fail if the file differs
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUMMARY = os.path.normpath(os.path.join(HERE, '..', 'results', 'summary.json'))
TARGET = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', 'src', 'calc-bounds.ts'))


def number(x):
    return 'null' if x is None else repr(x)


def render(summary):
    first, last = min(summary['instants']), max(summary['instants'])
    basis = (f"largest difference from JPL Horizons (DE441) over {len(summary['instants'])} instants from "
             f"JD {first} to {last} (TT), in all eight frames; docs/evidence/calc-api")
    groups = {}
    for key, row in summary['bounds'].items():
        center, correction, body = key.split('/')
        groups.setdefault(f'{center}/{correction}', []).append((body, row))
    rows = '\n'.join(
        f'  "{group}": {{\n' + ',\n'.join(f'    "{body}": [{number(pos)}, {number(dist)}, {number(speed)}]'
                                          for body, (pos, dist, speed) in entries) + '\n  },'
        for group, entries in groups.items())
    return f'''/**
 * Measured bounds for calc results, by "center/correction" and body. Each row is
 * [largest angular difference in arcseconds, largest relative distance
 * difference, largest angular-rate difference in arcseconds a day], each
 * rounded up to two significant figures; null where nothing was compared.
 *
 * Written by docs/evidence/calc-api/tools/bounds.py from
 * docs/evidence/calc-api/results/summary.json; do not edit by hand.
 * calc-bounds.test.ts checks the two agree.
 */
export const MEASURED_BASIS = {json.dumps(basis)};
export const MEASURED: Readonly<Record<string, Readonly<Record<string, readonly [number, number | null, number | null]>>>> = {{
{rows[:-1]}
}};
'''


def main():
    text = render(json.load(open(SUMMARY)))
    if '--check' in sys.argv:
        if open(TARGET).read() != text:
            raise SystemExit('src/calc-bounds.ts differs from results/summary.json; run tools/bounds.py')
        print('src/calc-bounds.ts agrees with results/summary.json')
        return
    with open(TARGET, 'w') as f:
        f.write(text)


if __name__ == '__main__':
    main()
