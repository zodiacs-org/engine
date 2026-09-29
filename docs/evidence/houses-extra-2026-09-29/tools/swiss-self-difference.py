"""A diagnostic, not a preregistered gate: whether Swiss Ephemeris's own
cusp speeds (swe_houses_armc_ex2) are the derivatives of its own cusps
(swe_houses_armc), by the same Richardson-extrapolated central difference as
gate F (h = 0.001 degree of RAMC). Prints statistics only.

    python3 tools/swiss-self-difference.py > results/swiss-self-difference.json
"""
import json
import math
import subprocess
import sys

import swisseph as swe

CODES = {'whole': b'W', 'placidus': b'P', 'porphyry': b'O', 'equal': b'E', 'equal-mc': b'D', 'vehlow': b'V',
         'koch': b'K', 'regiomontanus': b'R', 'campanus': b'C', 'topocentric': b'T', 'alcabitius': b'B',
         'morinus': b'M', 'meridian': b'X'}
H = 0.001


def seam(a, b):
    return (a - b + 180) % 360 - 180


def cases():
    """The two grids, from grids.mjs, so the diagnostic runs on the same cases."""
    script = ("import('./grids.mjs').then(g => { for (const c of [...g.ladder(), ...g.globalGrid()]) "
              "console.log(JSON.stringify([c.set, c.ramc, c.lat, c.eps])); })")
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=sys.path[0], capture_output=True, text=True,
                         check=True).stdout
    return [json.loads(line) for line in out.splitlines()]


stats = {}
for s, ramc, lat, eps in cases():
    for name, code in CODES.items():
        e = stats.setdefault((s, name), {'rel': [], 'over': 0, 'void': 0, 'undefined': 0})
        try:
            samples = [swe.houses_armc(ramc + step, lat, eps, code)[0] for step in (-H, -H / 2, 0, H / 2, H)]
            _, _, speeds, ascmc_speeds = swe.houses_armc_ex2(ramc, lat, eps, code)
        except swe.Error:
            e['undefined'] += 1
            continue
        rate = ascmc_speeds[2]
        for index in range(12):
            m1, m2, c0, p2, p1 = (sample[index] for sample in samples)
            if any(abs(seam(v, c0)) > 1 for v in (m1, m2, p2, p1)):
                e['void'] += 1
                continue
            numeric = (4 * seam(p2, m2) / H - seam(p1, m1) / (2 * H)) / 3 * rate
            d = abs(speeds[index] - numeric)
            e['rel'].append(d / abs(numeric) if numeric else (0.0 if d == 0 else math.inf))
            if not d <= 0.004 + 1e-6 * abs(numeric):
                e['over'] += 1

out = {'swisseph': swe.version, 'what': "Swiss's cusp speeds against a central difference of Swiss's own cusps",
       'tolerance': '0.004 deg/day + 1e-6 |v| (as gates S and F)', 'sets': {}}
def rounded(value):
    """Three significant figures; null for an infinite ratio, which relInfinite counts, so the output is strict JSON."""
    return float(f'{value:.3g}') if math.isfinite(value) else None


for (s, name), e in sorted(stats.items()):
    rel = sorted(e['rel'])
    n = len(rel)
    out['sets'].setdefault(s, {})[name] = {
        'values': n, 'over': e['over'], 'void': e['void'], 'undefined': e['undefined'],
        'relMedian': rounded(rel[n // 2]) if n else None,
        'relMax': rounded(rel[-1]) if n else None,
        # Values where Swiss's own difference is 0 and its speed is not: the ratio is infinite.
        'relInfinite': sum(1 for value in rel if math.isinf(value))}
print(json.dumps(out, indent=1, allow_nan=False))
