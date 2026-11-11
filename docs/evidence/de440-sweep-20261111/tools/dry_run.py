#!/usr/bin/env python3
"""What src/calc-bounds.ts would become if the dense sweep's rows replaced the
ones it has, without writing it: a dry run (../PLAN.md, P3).

    python3 docs/evidence/de440-sweep-20261111/tools/dry_run.py [RESULTS_DIR]

RESULTS_DIR (default ../results) holds the sweep's summary.json. It writes
there report.md, the readable account, and calc-bounds.dry-run.diff, the
change to the table's numbers as a unified diff. It runs the unmodified
docs/evidence/calc-api/tools/bounds.py --check on the sweep's summary first
and reports what that says. No file outside RESULTS_DIR is written.
"""
import difflib
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPOSITORY = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
CALC_API = os.path.join(REPOSITORY, 'docs', 'evidence', 'calc-api')
RESULTS = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.normpath(os.path.join(HERE, '..', 'results'))
BOUNDS_PY = os.path.join(CALC_API, 'tools', 'bounds.py')
# The summary the committed table was written from (src/calc-bounds.ts names it).
CURRENT = os.path.join(CALC_API, 'rc16')

# The largest differences ZOD-65 quotes from an accuracy review of 1.1.0-rc.2 against DE440 on 146,097
# daily dates. The review's data is not in this repository: these are shown beside the sweep's, and
# nothing is derived from them.
REVIEW = {'Sun': 2.4, 'Moon': 12.0, 'Venus': 22.9, 'Pluto': 29.2, 'North Node': 32.4}
PUBLIC_LIMIT_ARCSEC = 30.0
BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
COLUMNS = ['position, arcseconds', 'relative distance', 'rate, arcseconds a day']


def bounds_module():
    """bounds.py, loaded as it runs for the committed table: CALC_API_RESULTS naming rc16."""
    os.environ['CALC_API_RESULTS'] = CURRENT
    spec = importlib.util.spec_from_file_location('calc_api_bounds', BOUNDS_PY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def show(x):
    return 'none' if x is None else f'{x:g}'


def main():
    sweep = json.load(open(os.path.join(RESULTS, 'summary.json')))
    current = json.load(open(os.path.join(CURRENT, 'summary.json')))
    bounds = bounds_module()
    # The baseline is the table bounds.py writes from rc16/summary.json, which src/calc-bounds.ts held until
    # 1.1.0-rc.7. From 1.1.0-rc.7 the file is write_bounds.py's, which takes the sweep's rows; "now" in the
    # report means the table before that candidate, and write_bounds.py --against checks a run against the file.
    committed = bounds.render(current)

    # 1. The unmodified tool on the sweep's summary.
    check = subprocess.run([sys.executable, BOUNDS_PY, '--check'], env={**os.environ, 'CALC_API_RESULTS': RESULTS},
                           capture_output=True, text=True)
    said = (check.stdout + check.stderr).strip().replace(REPOSITORY + os.sep, '')
    if os.path.isabs(RESULTS) and not RESULTS.startswith(REPOSITORY):
        said = said.replace(os.path.relpath(RESULTS, REPOSITORY), '<RESULTS_DIR>')

    # 2. Row by row.
    rows, changed, lower = [], 0, []
    for key, new in sweep['bounds'].items():
        old = current['bounds'].get(key)
        marks = []
        for k in range(3):
            before = None if old is None else old[k]
            if new[k] is None or before == new[k]:
                marks.append('same' if before == new[k] else 'kept')
            else:
                marks.append('up' if before is None or new[k] > before else 'down')
        if 'up' in marks or 'down' in marks:
            changed += 1
        if 'down' in marks:
            lower.append(key)
        rows.append((key, old, new, marks))
    untouched = [key for key in current['bounds'] if key not in sweep['bounds']]

    # 3. The table's numbers with the swept rows replaced. A value the sweep did not measure (the nodes'
    #    distance and rate) keeps what it has. The basis sentences are left as they are: they would have
    #    to name DE440, the kernel and the 146,097 instants for the swept rows only, which is a change to
    #    bounds.py and calc.ts for the candidate that takes these numbers, not for a dry run.
    merged = dict(current)
    merged['bounds'] = dict(current['bounds'])
    for key, new in sweep['bounds'].items():
        old = current['bounds'].get(key, [None, None, None])
        merged['bounds'][key] = [old[k] if new[k] is None else new[k] for k in range(3)]
    diff = ''.join(difflib.unified_diff(committed.splitlines(keepends=True), bounds.render(merged).splitlines(keepends=True),
                                        'src/calc-bounds.ts', 'src/calc-bounds.ts (dry run)'))
    with open(os.path.join(RESULTS, 'calc-bounds.dry-run.diff'), 'w') as f:
        f.write(diff)

    longitudes = sweep['longitudes']
    corpus = sweep['corpus']
    worst_body = max(BODIES, key=lambda body: longitudes[body]['max'])
    worst_bent = max(BODIES, key=lambda body: longitudes[body]['withDeflection']['max'])
    within = longitudes[worst_body]['max'] <= PUBLIC_LIMIT_ARCSEC and longitudes[worst_bent]['withDeflection']['max'] <= PUBLIC_LIMIT_ARCSEC
    node = longitudes['North Node']

    lines = ['# The dense DE440 sweep: report', '',
             f"Engine {sweep['engine']['name']} {sweep['engine']['version']} (commit `{sweep['build']['commit']}`) against NAIF's "
             f"`de440.bsp` (SHA-256 `{sweep['arbiter']['kernel']['sha256']}`), geocentric, at {corpus['n']:,} instants: "
             f"{corpus['what']}. Workflow run {sweep['run']['runId']} (attempt {sweep['run']['runAttempt']}) of "
             f"`{sweep['run']['repository']}`. Written by `tools/dry_run.py`; the method is `PLAN.md`'s, every table is in "
             '`tables.md`, and every number here is in `summary.json`.', '',
             '## The largest differences, beside the review\'s and the limits a receipt quotes now', '',
             'Arcseconds. "Longitude" is the difference of the apparent ecliptic longitudes of date, which is what a zodiac '
             'position is; "any frame" is the largest angle between the two directions over all eight frames, which is what '
             'the bounds rule takes. The review\'s figures are the ones ZOD-65 quotes, measured on 1.1.0-rc.2; its data is '
             'not in this repository. The limit now is `src/calc-bounds.ts`, from 32 instants against Horizons (DE441).', '',
             '| body | review, as quoted | sweep, longitude | sweep, any frame | limit now | limit by the same rule from the sweep |',
             '| --- | ---: | ---: | ---: | ---: | ---: |']
    for body in BODIES + ['North Node']:
        key = f'geocentric/apparent/{body}'
        frames = next(case for case in sweep['de440'] if case['correction'] == 'apparent' and case['body'] == body
                      and case['arbiter'] != 'NONE')['frames']
        lines.append(f"| {body} | {show(REVIEW.get(body)) if body in REVIEW else ''} | {longitudes[body]['max']:.2f} | "
                     f"{max(f['position']['max'] for f in frames):.2f} | {show(current['bounds'][key][0])} | {show(sweep['bounds'][key][0])} |")
    lines += ['',
              '## The 30 arcsecond sentence', '',
              f"Over the {corpus['n']:,} instants the largest difference in apparent ecliptic longitude of date among the Sun, the "
              f"Moon and Mercury to Pluto is {longitudes[worst_body]['max']:.2f} arcseconds ({worst_body}); with the Sun's light "
              f"deflection in the reference, which the engine's apparent place leaves out, {longitudes[worst_bent]['withDeflection']['max']:.2f} "
              f"arcseconds ({worst_bent}). Both are {'within' if within else 'NOT within'} {PUBLIC_LIMIT_ARCSEC:g} arcseconds. "
              f"The true node's largest is {node['max']:.2f} arcseconds, {'within' if node['max'] <= PUBLIC_LIMIT_ARCSEC else 'over'} "
              f"{PUBLIC_LIMIT_ARCSEC:g}. Mars to Pluto are the planets' system barycentres, on both sides.", '',
              '## The self-checks', '']
    for name in ('S1', 'S2'):
        entry = sweep['selfChecks'][name]
        lines.append(f"- {name}: {entry['what']}. Largest {entry['maxArcsec']:g} arcseconds, gate {entry['gateArcsec']:g}: {entry['verdict']}.")
    lines += ['',
              '## The dry run', '',
              'The unmodified `docs/evidence/calc-api/tools/bounds.py --check`, with `CALC_API_RESULTS` naming these results, says:', '',
              '```', f'exit status {check.returncode}', said, '```', '',
              'That tool writes the whole table from one summary, and this summary holds the geocentric rows only, so its output '
              'says that the file would differ and not how. Row by row, by the preregistered rule (the largest over every '
              f"instant and frame, rounded up to two significant figures): of the {len(rows)} rows swept, {changed} would change"
              + (f", {len(lower)} of them with a value that falls ({', '.join(lower)})" if lower else ', and no value would fall')
              + f". The {len(untouched)} rows not swept (heliocentric, barycentric, topocentric, the mean points) would stay as they are. "
              '`calc-bounds.dry-run.diff` is the same change as a diff of the file\'s numbers.', '',
              '| row | ' + ' | '.join(f'{c}: now | from the sweep' for c in COLUMNS) + ' | change |',
              '| --- | ' + ' | '.join('---: | ---:' for _ in COLUMNS) + ' | --- |']
    for key, old, new, marks in rows:
        cells = ' | '.join(f"{show(None if old is None else old[k])} | {show(new[k]) if new[k] is not None else 'not measured'}" for k in range(3))
        what = ', '.join(f'{COLUMNS[k].split(",")[0]} {marks[k]}' for k in range(3) if marks[k] in ('up', 'down')) or 'none'
        lines.append(f'| {key} | {cells} | {what} |')
    text = '\n'.join(lines) + '\n'
    with open(os.path.join(RESULTS, 'report.md'), 'w') as f:
        f.write(text)
    print(text)
    print(diff)


if __name__ == '__main__':
    main()
