"""Breaker, item 2: read the probe's JSON files and say, for each call, whether its result says what it was
computed on. A result is SILENT when the pack was not used (damaged, or the instant outside it), the result
differs from the healthy pack's or the instant is outside the span, and its text carries neither
"de440-unavailable"/"outside-de440-span" nor the name astronomy-engine.
  python probe_report.py <results dir> > report.md
"""
import json, glob, os, sys
d = sys.argv[1]
load = lambda n: json.load(open(os.path.join(d, n)))
healthy = load('probe-healthy-1991.json')
chose = load('probe-chose-astronomy-engine-1991.json')
H = healthy['results']

def says(r):
    if 'threw' in r: return 'THREW ' + r['threw'][:90]
    out = []
    if r['unavailable']: out.append('de440-unavailable')
    if r['outside']: out.append('outside-de440-span')
    if r['namesAstronomyEngine']: out.append('names astronomy-engine')
    if r['namesDe440']: out.append('names jpl-de440')
    return ', '.join(out) or 'says nothing'

print('## Healthy pack, 1991\n')
print('| call | returns | says | top-level ephemeris | top-level flags |\n| --- | --- | --- | --- | --- |')
for k, r in H.items():
    print(f"| `{k}` | {r.get('kind')} | {says(r)} | {r.get('topEphemeris', '')} | {r.get('topFlags', '')} |")

print('\n## Damaged pack, 1991: against the healthy result\n')
modes = sorted(glob.glob(os.path.join(d, 'probe-damaged-*-1991.json')))
table = {}
for path in modes:
    mode = os.path.basename(path)[len('probe-damaged-'):-len('-1991.json')]
    doc = json.load(open(path))
    assert doc['defaultEphemeris']['de440']['opened'] is False, mode
    for k, r in doc['results'].items():
        h = H[k]
        if 'threw' in r: verdict = 'THREW'
        else:
            moved = r['digest'] != h['digest']
            same_as_ae = r['digest'] == chose['results'][k].get('digest')
            flagged = r['unavailable']
            named = r['namesAstronomyEngine']
            if r['namesDe440']: verdict = 'NAMES jpl-de440 WITH THE PACK DAMAGED'
            elif flagged: verdict = 'flagged de440-unavailable' + (', names astronomy-engine' if named else '')
            elif named: verdict = 'names astronomy-engine, no flag' + ('' if moved else ' (same as healthy: astronomy-engine by design)')
            elif moved: verdict = 'SILENT: moved, says nothing' + (' (equals the result after choosing astronomy-engine)' if same_as_ae else '')
            else: verdict = 'unchanged by the damage, says nothing'
        table.setdefault(k, {}).setdefault(verdict, []).append(mode)
print(f'{len(modes)} kinds of damage: ' + ', '.join(os.path.basename(p)[len('probe-damaged-'):-len('-1991.json')] for p in modes) + '\n')
print('| call | verdict (kinds of damage it holds for) |\n| --- | --- |')
counts = {}
for k, v in table.items():
    print(f"| `{k}` | " + '; '.join(f'{verdict} ({len(ms)} of {len(modes)})' for verdict, ms in v.items()) + ' |')
    for verdict in v: counts[verdict.split(':')[0].split(' (')[0]] = counts.get(verdict.split(':')[0].split(' (')[0], 0) + 1
print('\nCounts over calls:', json.dumps(counts))

dependent = {k for k, v in table.items() if not any(verdict.startswith('unchanged') or 'by design' in verdict for verdict in v)}
for year, what in ((1750, 'outside the pack'), (2230, 'outside the pack'), (1785, 'the birth outside the pack, the later date (1813) inside'), (2195, 'the birth inside the pack, the later date (2223) outside')):
    doc = load(f'probe-healthy-{year}.json')
    print(f'\n## Healthy pack, year {year}: {what} (the pack covers 1790-01-01 to 2210-01-01 TDB)\n')
    print('Only the calls whose result depends on the pack (it moved when the pack was damaged).\n')
    print('| call | says | top-level ephemeris | top-level flags |\n| --- | --- | --- | --- |')
    for k, r in doc['results'].items():
        if k not in dependent: continue
        s = says(r)
        mark = ''
        if 'threw' not in r and not r.get('status', '').startswith('refused') and year in (1750, 2230):
            if not r['outside'] and not r['namesAstronomyEngine']: mark = ' **NO LABEL**'
            if r['namesDe440']: mark = ' **NAMES jpl-de440 OUTSIDE THE PACK**'
        print(f"| `{k}` | {s}{mark}{' (status ' + r['status'] + ')' if r.get('status') else ''} | {r.get('topEphemeris', '')} | {r.get('topFlags', '')} |")

print('\n## After setDefaultEphemeris("astronomy-engine"), 1991\n')
print('| call | says | moved from the pack\'s result |\n| --- | --- | --- |')
for k, r in chose['results'].items():
    print(f"| `{k}` | {says(r)} | {'yes' if r.get('digest') != H[k].get('digest') else 'no'} |")
print('\nFunction exports the probe does not call (' + str(len(healthy['notCalled'])) + '): ' + ' '.join(healthy['notCalled']))
