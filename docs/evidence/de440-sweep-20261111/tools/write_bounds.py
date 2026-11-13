#!/usr/bin/env python3
"""Write src/calc-bounds.ts from two comparisons: the dense DE440 sweep's rows
(../results/summary.json) where it measured them, and the 32-instant Horizons
comparison's (docs/evidence/calc-api/rc16/summary.json) for every other row.

    python3 docs/evidence/de440-sweep-20261111/tools/write_bounds.py            # write
    python3 docs/evidence/de440-sweep-20261111/tools/write_bounds.py --check    # fail if the file differs
    python3 docs/evidence/de440-sweep-20261111/tools/write_bounds.py --against DIR

The sweep measured the geocentric rows only: the Sun, the Moon and Mercury to
Pluto with each of the three corrections, and the true node and its opposite
point (32 rows). Those rows take the sweep's values, by the same rule
(docs/evidence/calc-api/PREREGISTRATION.md: the largest over every instant
and frame, rounded up to two significant figures), and the sweep's basis. A
value the sweep did not measure (the nodes' distance and rate) keeps what the
row had, which is null. Every other row (heliocentric, barycentric,
topocentric, and the mean node, the mean south node and Black Moon Lilith)
keeps its value and its basis from the 32 instants, word for word as
docs/evidence/calc-api/tools/bounds.py writes them.

Before writing, it refuses a sweep whose largest difference is over the plan's
sanity limits (60 arcseconds for any body, 10 for the Sun), and one where a
largest difference, which the sweep keeps to six significant figures, falls
exactly on a two-figure value: rounding up from there could give a bound one
unit low in its second figure.

--against DIR reads another run's summary.json (and DIR/eras/, when present)
and checks that every largest difference it found, before rounding, is within
the limit the committed src/calc-bounds.ts quotes for that row. It prints one
line per row and exits 1 if any is over. With DIR/eras/ it also says, era by
era, whether the engine's values are the same bytes as the committed sweep's.
"""
import importlib.util
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SWEEP_DIR = os.path.normpath(os.path.join(HERE, '..'))
REPOSITORY = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
SWEEP = os.path.join(SWEEP_DIR, 'results', 'summary.json')
CALC_API = os.path.join(REPOSITORY, 'docs', 'evidence', 'calc-api')
CURRENT = os.path.join(CALC_API, 'rc16')
BOUNDS_PY = os.path.join(CALC_API, 'tools', 'bounds.py')
TARGET = os.path.join(REPOSITORY, 'src', 'calc-bounds.ts')
MEAN_POINTS = ('Mean Node', 'Mean South Node', 'Black Moon Lilith')
SANITY_ARCSEC, SANITY_SUN_ARCSEC = 60.0, 10.0


def rel(path):
    return os.path.relpath(path, REPOSITORY)


def bounds_module():
    """docs/evidence/calc-api/tools/bounds.py as it runs for the rc16 table."""
    os.environ['CALC_API_RESULTS'] = CURRENT
    spec = importlib.util.spec_from_file_location('calc_api_bounds', BOUNDS_PY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def up2(value):
    """Rounded up to two significant figures (compare.py's and sweep.py's)."""
    if value <= 0:
        return 0.0
    exponent = math.floor(math.log10(value)) - 1
    return float(f'{math.ceil(value / 10 ** exponent - 1e-9) * 10 ** exponent:.12g}')


def maxima(summary):
    """Each row's largest position, distance and rate difference over every instant and frame, before rounding."""
    out = {}
    for case in summary['de440']:
        if case['body'] == 'Moon' and case['correction'] == 'apparent' and case['arbiter'] == 'NONE':
            continue
        top = lambda metric: max((f[metric]['max'] for f in case['frames'] if metric in f), default=None)
        out[f"geocentric/{case['correction']}/{case['body']}"] = [top('position'), top('distance'), top('speed')]
    return dict(sorted(out.items()))


def checked(sweep):
    """The sweep's rows, after the sanity limits and the rounding check."""
    raw = maxima(sweep)
    if raw.keys() != sweep['bounds'].keys():
        raise SystemExit('the sweep\'s bounds and its cases do not name the same rows')
    for key, row in raw.items():
        if [None if x is None else up2(x) for x in row] != sweep['bounds'][key]:
            raise SystemExit(f'{key}: the sweep\'s bound is not its largest difference rounded up')
        limit = SANITY_SUN_ARCSEC if key.endswith('/Sun') else SANITY_ARCSEC
        if row[0] > limit:
            raise SystemExit(f'{key}: {row[0]} arcseconds, over the plan\'s sanity limit of {limit:g}; investigate before writing')
        for x in row:
            if x is not None and up2(x) == x:
                raise SystemExit(f'{key}: the largest difference {x:g} sits on a two-figure value; its bound could be one unit low')
    return sweep['bounds']


def table(sweep, current):
    """The rows of src/calc-bounds.ts, and which comparison each comes from."""
    swept = checked(sweep)
    rows, source = {}, {}
    for key, old in current['bounds'].items():
        new = swept.get(key)
        rows[key] = old if new is None else [old[k] if new[k] is None else new[k] for k in range(3)]
        source[key] = 'sweep' if new is not None else 'mean' if key.split('/')[2] in MEAN_POINTS else 'horizons'
    if set(swept) - set(current['bounds']):
        raise SystemExit('the sweep measured a row the table does not have')
    return rows, source


def render(sweep, current):
    bounds = bounds_module()
    rows, source = table(sweep, current)
    old = bounds.render(current)
    constant = lambda name: re.search(rf'^export const {name} = (".*");$', old, re.M).group(1)
    groups = {}
    for key, row in rows.items():
        if key in bounds.DERIVED:
            continue
        center, correction, body = key.split('/')
        groups.setdefault(f'{center}/{correction}', []).append((body, row))
    # The sweep's rows are whole groups but for the mean points, so the file names the groups, and a test checks it.
    swept_groups = sorted({key.rsplit('/', 1)[0] for key, s in source.items() if s == 'sweep'})
    for key, s in source.items():
        if key in bounds.DERIVED:
            continue
        in_group = key.rsplit('/', 1)[0] in swept_groups and s != 'mean'
        if in_group != (s == 'sweep'):
            raise SystemExit(f'{key}: the swept groups do not describe which rows the sweep gives')
    counts = {s: sum(1 for key, v in source.items() if v == s and key not in bounds.DERIVED) for s in ('sweep', 'mean', 'horizons')}

    corpus = sweep['corpus']
    swept_basis = (f"largest difference from JPL's DE440 found at noon TT on each of {corpus['n']:,} days, "
                   f"JD {corpus['firstJdTt']} to {corpus['lastJdTt']} (TT), in all eight frames; {rel(SWEEP_DIR)}")

    def body(entries, indent):
        return '{\n' + ',\n'.join(f'{indent}  "{name}": [{bounds.number(pos)}, {bounds.number(dist)}, {bounds.number(speed)}]'
                                   for name, (pos, dist, speed) in entries) + f'\n{indent}}}'

    # A group equal to an earlier one is written once, as a constant both name (bounds.py's rule).
    texts = {group: body(entries, '') for group, entries in groups.items()}
    shared, constants = {}, []
    for group, text in texts.items():
        if list(texts.values()).count(text) > 1 and text not in shared:
            shared[text] = group.replace('/', '_').upper()
            constants.append(f'const {shared[text]}: Rows = {text};\n')
    table_text = ',\n'.join(f'  "{group}": ' + (shared[texts[group]] if texts[group] in shared else body(entries, '  '))
                            for group, entries in groups.items())
    return f'''/**
 * Measured bounds for calc results, by "center/correction" and body. Each row is
 * [largest angular difference in arcseconds, largest relative distance
 * difference, largest angular-rate difference in arcseconds a day], each
 * rounded up to two significant figures; null where nothing was compared. The
 * barycentric Sun is left out: calc.ts derives its bounds from the
 * barycentre's error.
 *
 * Each row rests on one of three bases:
 * - SWEPT_BASIS, the dense DE440 sweep: every row of the groups SWEPT names
 *   but the mean points ({counts['sweep']} rows), from
 *   {rel(SWEEP)};
 * - MEAN_POINTS_BASIS (their rates MEAN_POINTS_SPEED_BASIS): the Mean Node,
 *   the Mean South Node and Black Moon Lilith ({counts['mean']} rows), and
 * - MEASURED_BASIS, 32 instants against JPL Horizons: every other row
 *   ({counts['horizons']} rows, heliocentric, barycentric and topocentric), both from
 *   {rel(os.path.join(CURRENT, 'summary.json'))}.
 *
 * Written by {rel(os.path.abspath(__file__))}; do not
 * edit by hand. calc-bounds.test.ts checks that they agree.
 */
export const SWEPT_BASIS = {json.dumps(swept_basis)};
/** The groups whose rows, but the mean points', rest on SWEPT_BASIS. */
export const SWEPT: readonly string[] = {json.dumps(swept_groups)};
export const MEASURED_BASIS = {constant('MEASURED_BASIS')};
/** The basis of the mean node's, the mean south node's and Black Moon Lilith's bounds. */
export const MEAN_POINTS_BASIS = {constant('MEAN_POINTS_BASIS')};
/** The basis of their speed bounds, compared in the true ecliptic of date only. */
export const MEAN_POINTS_SPEED_BASIS = {constant('MEAN_POINTS_SPEED_BASIS')};
type Rows = Readonly<Record<string, readonly [number, number | null, number | null]>>;
{"".join(constants)}export const MEASURED: Readonly<Record<string, Rows>> = {{
{table_text}
}};
'''


def committed_limits():
    """The [position, distance, rate] limits src/calc-bounds.ts quotes now, by row."""
    rows, _ = table(json.load(open(SWEEP)), json.load(open(os.path.join(CURRENT, 'summary.json'))))
    if render(json.load(open(SWEEP)), json.load(open(os.path.join(CURRENT, 'summary.json')))) != open(TARGET).read():
        raise SystemExit('src/calc-bounds.ts is not this tool\'s output; run it first')
    return rows


def against(directory):
    run = json.load(open(os.path.join(directory, 'summary.json')))
    limits = committed_limits()
    found = maxima(run)
    names = ('position', 'distance', 'rate')
    units = ('arcsec', 'relative', 'arcsec/day')
    over = []
    print(f"{run['engine']['name']} {run['engine']['version']}, build {run['build']['distSha256']}, commit {run['build']['commit']}, "
          f"run {run['run']['runId']} attempt {run['run']['runAttempt']}, {run['corpus']['n']:,} instants")
    print('row: largest found / limit quoted, for position (arcsec), distance (relative) and rate (arcsec/day)')
    for key, row in found.items():
        cells = []
        for k in range(3):
            if row[k] is None:
                cells.append(f'{names[k]} not measured')
                continue
            limit = limits[key][k]
            ok = limit is not None and row[k] <= limit
            if not ok:
                over.append(f'{key} {names[k]}')
            cells.append(f"{names[k]} {row[k]:g} / {'none' if limit is None else f'{limit:g}'} {units[k]}{'' if ok else ' OVER'}")
        print(f'{key}: ' + '; '.join(cells))
    lon = run['longitudes']
    print('apparent ecliptic longitude of date, largest difference (arcsec): ' +
          ', '.join(f"{b} {e['max']:g}" for b, e in lon.items()))
    eras = os.path.join(directory, 'eras')
    if os.path.isdir(eras):
        committed = os.path.join(SWEEP_DIR, 'results', 'eras')
        for name in sorted(os.listdir(committed)):
            mine = os.path.join(eras, name)
            if not os.path.exists(mine):
                print(f'{name}: missing from this run')
                continue
            a, b = json.load(open(os.path.join(committed, name))), json.load(open(mine))
            same = a['engineValuesSha256'] == b['engineValuesSha256']
            print(f"{name}: engine values {b['engineValuesSha256']}, "
                  f"{'the same bytes as' if same else 'NOT the same as'} the committed sweep's ({a['engine']['version']})")
    if over:
        raise SystemExit('over the limit quoted: ' + ', '.join(over))
    print(f'every largest difference of the {len(found)} rows is within the limit src/calc-bounds.ts quotes')


def main():
    if '--against' in sys.argv:
        against(os.path.abspath(sys.argv[sys.argv.index('--against') + 1]))
        return
    text = render(json.load(open(SWEEP)), json.load(open(os.path.join(CURRENT, 'summary.json'))))
    if '--check' in sys.argv:
        if open(TARGET).read() != text:
            raise SystemExit(f'src/calc-bounds.ts differs from {rel(SWEEP)} and the rc16 summary; run {rel(os.path.abspath(__file__))}')
        print('src/calc-bounds.ts agrees with its two summaries')
        return
    with open(TARGET, 'w') as f:
        f.write(text)


if __name__ == '__main__':
    main()
