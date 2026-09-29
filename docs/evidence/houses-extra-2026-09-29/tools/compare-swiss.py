"""Gates P, A and S of PREREGISTRATION.md: the engine's house positions,
co-ascendants and speeds (dump-engine.mjs) against Swiss Ephemeris given the
same RAMC, latitude, obliquity and body. Swiss is run as an instrument; this
prints statistics only, and nothing Swiss computes is written anywhere.

    python3 tools/compare-swiss.py "$WORK/engine.jsonl" > results/swiss.json
"""
import json
import math
import sys

import swisseph as swe

SIDEREAL_RATE = 360.98564736629
CODES = {'whole': b'W', 'placidus': b'P', 'porphyry': b'O', 'equal': b'E', 'equal-mc': b'D', 'vehlow': b'V',
         'koch': b'K', 'regiomontanus': b'R', 'campanus': b'C', 'topocentric': b'T', 'alcabitius': b'B',
         'morinus': b'M', 'meridian': b'X'}
POINTS = ['equatorialAscendant', 'kochCoAscendant', 'munkaseyCoAscendant', 'polarAscendant']


def seam(a, b):
    """a - b in degrees, across the 0/360 seam, in (-180, 180]."""
    return (a - b + 180) % 360 - 180


def speed_tolerance(v):
    return 0.004 + 1e-6 * abs(v)


def summary(values, over):
    values = sorted(values)
    n = len(values)
    if not n:
        return {'n': 0}
    return {'n': n, 'median': float(f'{values[n // 2]:.3g}'), 'p95': float(f'{values[min(n - 1, int(0.95 * n))]:.3g}'),
            'max': float(f'{values[-1]:.3g}'), 'over': over}


class Status:
    def __init__(self):
        self.both = 0
        self.engine_only = 0
        self.swiss_only = 0

    def record(self, engine, swiss):
        if engine is None and swiss is None:
            self.both += 1
        elif engine is None:
            self.engine_only += 1
        elif swiss is None:
            self.swiss_only += 1

    def json(self):
        return {'bothUndefined': self.both, 'engineOnlyUndefined': self.engine_only, 'swissOnlyUndefined': self.swiss_only}


positions = {}   # (set, system) -> [|d| arcsec], over, Status
coasc = {}       # (set, point) -> [|d| arcsec]
cusp_speed = {}  # (set, system) -> per value |Δ|, relative, value over, case over, Status
angle_speed = {}  # (set, angle) -> ...
rates = []
unscaled = 0

for line in open(sys.argv[1]):
    case = json.loads(line)
    s, ramc, lat, eps = case['set'], case['ramc'], case['lat'], case['eps']
    # Gate P
    for name, code in CODES.items():
        entry = positions.setdefault((s, name), {'d': [], 'over': 0, 'status': Status()})
        for (lon, blat), engine in zip(case['bodies'], case['positions'][name]):
            try:
                swiss = swe.house_pos(ramc, lat, eps, (lon, blat), code)
                if not (1 <= swiss < 13):
                    swiss = None
            except swe.Error:
                swiss = None
            entry['status'].record(engine, swiss)
            if engine is None or swiss is None:
                continue
            d = abs(seam((engine - 1) * 30, (swiss - 1) * 30)) * 3600
            entry['d'].append(d)
            if d > 0.01:
                entry['over'] += 1
    # Gate A
    _, ascmc = swe.houses_armc(ramc, lat, eps, b'E')
    for index, point in enumerate(POINTS):
        entry = coasc.setdefault((s, point), {'d': [], 'over': 0})
        engine = case['coAscendants'][index]
        swiss = ascmc[4 + index]
        d = abs(seam(engine, swiss)) * 3600 if math.isfinite(engine) and math.isfinite(swiss) else math.inf
        entry['d'].append(d)
        if not d <= 0.01:
            entry['over'] += 1
    # Gate S
    _, _, _, angle_speeds = swe.houses_armc_ex2(ramc, lat, eps, b'E')
    rate = angle_speeds[2]
    scale = SIDEREAL_RATE / rate if math.isfinite(rate) and rate > 0 else 1.0
    if scale == 1.0:
        unscaled += 1
    rates.append(rate)
    for index, angle in enumerate(['asc', 'mc']):
        entry = angle_speed.setdefault((s, angle), {'d': [], 'rel': [], 'over': 0})
        engine = case['speeds']['equal'][angle]
        swiss = angle_speeds[index] * scale
        d = abs(engine - swiss)
        entry['d'].append(d)
        entry['rel'].append(d / abs(swiss) if swiss else (0.0 if d == 0 else math.inf))
        if not d <= speed_tolerance(swiss):
            entry['over'] += 1
    for name, code in CODES.items():
        entry = cusp_speed.setdefault((s, name), {'d': [], 'rel': [], 'over': 0, 'casesOver': 0, 'status': Status()})
        engine = case['speeds'][name]
        try:
            _, _, speeds, _ = swe.houses_armc_ex2(ramc, lat, eps, code)
        except swe.Error:
            speeds = None
        entry['status'].record(None if engine['fellBack'] else engine, speeds)
        if engine['fellBack'] or speeds is None:
            continue
        worst = 0.0
        case_over = False
        for mine, theirs in zip(engine['cusps'], speeds):
            theirs *= scale
            d = abs(mine - theirs)
            worst = max(worst, d)
            entry['rel'].append(d / abs(theirs) if theirs else (0.0 if d == 0 else math.inf))
            if not d <= speed_tolerance(theirs):
                entry['over'] += 1
                case_over = True
        entry['d'].append(worst)
        if case_over:
            entry['casesOver'] += 1

out = {
    'swisseph': swe.version,
    'positions': {'unit': 'arcseconds of mundane position, (p - 1) x 30 degrees', 'tolerance': 0.01, 'sets': {}},
    'coAscendants': {'unit': 'arcseconds', 'tolerance': 0.01, 'sets': {}},
    'speeds': {
        'unit': 'degrees per day; per case the largest of the twelve cusps; rel is |delta| / |Swiss speed| per value',
        'tolerance': '0.004 deg/day + 1e-6 |v|',
        'rateScaledCases': len(rates) - unscaled,
        'rateUnscaledCases': unscaled,
        'swissRateRelativeToEngineRate': float(f'{max(abs(r / SIDEREAL_RATE - 1) for r in rates):.3g}'),
        'sets': {}
    }
}
for (s, name), e in sorted(positions.items()):
    out['positions']['sets'].setdefault(s, {})[name] = {**summary(e['d'], e['over']), **e['status'].json()}
for (s, point), e in sorted(coasc.items()):
    out['coAscendants']['sets'].setdefault(s, {})[point] = summary(e['d'], e['over'])
for (s, name), e in sorted(cusp_speed.items()):
    rel = summary(e['rel'], None)
    out['speeds']['sets'].setdefault(s, {})[name] = {
        **summary(e['d'], e['over']), 'casesOver': e['casesOver'],
        'relMedian': rel.get('median'), 'relP95': rel.get('p95'), 'relMax': rel.get('max'), **e['status'].json()}
for (s, angle), e in sorted(angle_speed.items()):
    rel = summary(e['rel'], None)
    out['speeds']['sets'].setdefault(s, {})[angle] = {
        **summary(e['d'], e['over']), 'relMedian': rel.get('median'), 'relP95': rel.get('p95'), 'relMax': rel.get('max')}
print(json.dumps(out, indent=1))
