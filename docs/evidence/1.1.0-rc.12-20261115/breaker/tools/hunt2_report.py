"""Breaker rc.12: read hunt2.mjs's files. A call is SILENT in a state where the pack was not used (damaged,
or the year outside it) if its result differs from the healthy 1991 result (damaged) or is outside the span,
is not a refusal or a throw, and its text has neither fallback flag nor the name astronomy-engine.
  python hunt2_report.py <dir> > report.md"""
import json, glob, os, sys
d = sys.argv[1]
H = json.load(open(os.path.join(d, 'hunt2-healthy-1991.json')))['results']
print('| call | healthy 1991 | ' + ' | '.join(['damaged (modes silent / moved / of)', '1750', '2230']) + ' |\n| --- | --- | --- | --- | --- |')
dam = [json.load(open(p)) for p in sorted(glob.glob(os.path.join(d, 'hunt2-damaged-*.json')))]
for x in dam: assert x['defaultEphemeris']['de440']['opened'] is False
out = {y: json.load(open(os.path.join(d, f'hunt2-healthy-{y}.json')))['results'] for y in (1750, 2230)}
silent = []
def says(r):
    if 'threw' in r: return 'THREW ' + r['threw'][:60]
    s = [k for k, f in (('de440-unavailable', 'unavailable'), ('outside-de440-span', 'outside'), ('names astronomy-engine', 'namesAE'), ('names jpl-de440', 'namesDe440')) if r[f]]
    return (', '.join(s) or 'says nothing') + (f" ({r['status']})" if r.get('status') else '')
for k, h in H.items():
    moved = sum(1 for x in dam if x['results'][k].get('digest') != h.get('digest'))
    sil = sum(1 for x in dam if x['results'][k].get('digest') != h.get('digest') and 'threw' not in x['results'][k] and not (x['results'][k]['unavailable'] or x['results'][k]['namesAE']))
    wrong = sum(1 for x in dam if x['results'][k].get('namesDe440'))
    if sil: silent.append(k + ' (damaged)')
    cells = []
    for y in (1750, 2230):
        r = out[y][k]; cells.append(says(r))
        if 'threw' not in r and not r['outside'] and not r['namesAE'] and not str(r.get('status', '')).startswith('refused') and moved: silent.append(f'{k} ({y})')
        if 'threw' not in r and r['namesDe440']: silent.append(f'{k} ({y}: names jpl-de440)')
    print(f"| `{k}` | {says(h)} | {sil} / {moved} / {len(dam)}{' NAMES jpl-de440 x' + str(wrong) if wrong else ''} | {cells[0]} | {cells[1]} |")
print('\nSilent or mislabelled:', silent or 'none')
print('Healthy 1991 results carrying a fallback flag:', [k for k, h in H.items() if 'threw' not in h and (h['unavailable'] or h['outside'])] or 'none')
print('Threw when healthy:', {k: h['threw'] for k, h in H.items() if 'threw' in h} or 'none')
