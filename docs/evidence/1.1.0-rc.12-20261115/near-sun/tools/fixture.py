#!/usr/bin/env python3
"""The fixture src/de440-behind-sun.test.ts reads: Horizons's places of the planet and the Sun at the three passages
of each planet nearest the Sun's centre (1800 to 2200), at the least separation and at f = +-0.6, +-0.95 and +-1.3
of the way to the limb (passages.mjs), from compare.py's output and horizons.json; and the figure the test holds them
to, the largest relative-to-the-Sun difference compare.py found for calc() at any instant inside the disc or
outside it (the limb zone excluded), rounded up to two significant figures.

    python3 fixture.py near-sun.json horizons.json fixture.json
"""
import json, math, sys

def up2(x):
    unit = 10 ** (math.floor(math.log10(x)) - 1)
    return float(f'{math.ceil(x / unit - 1e-9) * unit:.2g}')

result, hz = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))['places']
rows = [r for r in result['rows'] if r['zone'] != 'limb']
figure = up2(max(r['engine']['relativeToTheSun'] for r in rows))
passages = {}
for r in result['rows']:
    if r['f'] == 0:
        passages.setdefault(r['body'], []).append((r['separationArcsec'], r['passage']))
chosen = {p for body in passages for _, p in sorted(passages[body])[:3]}
out = []
for r in rows:
    if r['passage'] in chosen and r['f'] in (0, 0.6, -0.6, 0.95, -0.95, 1.3, -1.3):
        key = f"{r['jdTt']:.6f}"
        b, s = hz[r['body']][key], hz['Sun'][key]
        out.append({'body': r['body'], 'jdTt': r['jdTt'], 'zone': r['zone'],
                    'horizons': {'ra': b['ra'], 'dec': b['dec'], 'sunRa': s['ra'], 'sunDec': s['dec']}})
json.dump({'what': __doc__.split('\n\n')[0].replace('\n', ' '), 'relativeToTheSunArcsec': figure,
           'largestFound': max(r['engine']['relativeToTheSun'] for r in rows), 'rows': out}, open(sys.argv[3], 'w'), indent=1)
print(len(out), 'rows; figure', figure)
