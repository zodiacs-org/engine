#!/usr/bin/env python3
"""Write src/calc-bounds.ts from ../results/summary.json, by the bounds rule in
PREREGISTRATION.md (compare.py applies the rule; this only writes it out), or
from the summary.json of the directory CALC_API_RESULTS names.

    python3 docs/evidence/calc-api/tools/bounds.py           # write
    python3 docs/evidence/calc-api/tools/bounds.py --check   # fail if the file differs
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPOSITORY = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
SUMMARY = os.path.join(os.path.abspath(os.environ.get('CALC_API_RESULTS') or os.path.join(HERE, '..', 'results')), 'summary.json')
SOURCE = os.path.relpath(SUMMARY, REPOSITORY)
# The evidence the bounds cite: this directory, or the rerun's own.
EVIDENCE = os.path.relpath(os.path.dirname(SUMMARY) if os.environ.get('CALC_API_RESULTS') else os.path.join(HERE, '..'), REPOSITORY)
TARGET = os.path.join(REPOSITORY, 'src', 'calc-bounds.ts')


def number(x):
    return 'null' if x is None else repr(x)


# calc.ts derives the barycentric Sun's bounds from the barycentre's error instead (RESULTS.md, Deviation 8).
DERIVED = {'barycentric/apparent/Sun', 'barycentric/astrometric/Sun', 'barycentric/geometric/Sun'}


def render(summary):
    first, last = min(summary['instants']), max(summary['instants'])
    basis = (f"largest difference from JPL Horizons (DE441) over {len(summary['instants'])} instants from "
             f"JD {first} to {last} (TT), in all eight frames; {EVIDENCE}")
    groups = {}
    for key, row in summary['bounds'].items():
        if key in DERIVED:
            continue
        center, correction, body = key.split('/')
        groups.setdefault(f'{center}/{correction}', []).append((body, row))

    def rows(entries, indent):
        return '{\n' + ',\n'.join(f'{indent}  "{body}": [{number(pos)}, {number(dist)}, {number(speed)}]'
                                   for body, (pos, dist, speed) in entries) + f'\n{indent}}}'

    # A group equal to an earlier one is written once, as a constant both name.
    texts = {group: rows(entries, '') for group, entries in groups.items()}
    shared, constants = {}, []
    for group, text in texts.items():
        if list(texts.values()).count(text) > 1 and text not in shared:
            shared[text] = group.replace('/', '_').upper()
            constants.append(f'const {shared[text]}: Rows = {text};\n')
    body = ',\n'.join(f'  "{group}": ' + (shared[texts[group]] if texts[group] in shared else rows(entries, '  '))
                      for group, entries in groups.items())
    return f'''/**
 * Measured bounds for calc results, by "center/correction" and body. Each row is
 * [largest angular difference in arcseconds, largest relative distance
 * difference, largest angular-rate difference in arcseconds a day], each
 * rounded up to two significant figures; null where nothing was compared. The
 * barycentric Sun is left out: calc.ts derives its bounds from the
 * barycentre's error.
 *
 * Written by docs/evidence/calc-api/tools/bounds.py from
 * {SOURCE}; do not edit by hand.
 * calc-bounds.test.ts checks the two agree.
 */
export const MEASURED_BASIS = {json.dumps(basis)};
type Rows = Readonly<Record<string, readonly [number, number | null, number | null]>>;
{"".join(constants)}export const MEASURED: Readonly<Record<string, Rows>> = {{
{body}
}};
'''


def main():
    text = render(json.load(open(SUMMARY)))
    if '--check' in sys.argv:
        if open(TARGET).read() != text:
            raise SystemExit(f'src/calc-bounds.ts differs from {SOURCE}; run tools/bounds.py')
        print(f'src/calc-bounds.ts agrees with {SOURCE}')
        return
    with open(TARGET, 'w') as f:
        f.write(text)


if __name__ == '__main__':
    main()
