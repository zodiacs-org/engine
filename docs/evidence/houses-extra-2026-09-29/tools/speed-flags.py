"""A diagnostic, not a preregistered gate: whether the cusp speeds over the
tolerance in gate S (the engine's against Swiss's) are the same values as
those over it in swiss-self-difference.py (Swiss's against a central
difference of Swiss's own cusps), value by value. Each value is counted in
one class: over in both, over only against the engine, over only against
Swiss's own difference, or not compared by the difference (a cusp that jumps
within its samples). Cases where the engine falls back or Swiss refuses are
left out, as in gate S. Prints counts only.

    python3 tools/speed-flags.py "$WORK/engine.jsonl" > results/speed-flags.json
"""
import json
import math
import sys

import swisseph as swe

SIDEREAL_RATE = 360.98564736629
CODES = {'whole': b'W', 'placidus': b'P', 'porphyry': b'O', 'equal': b'E', 'equal-mc': b'D', 'vehlow': b'V',
         'koch': b'K', 'regiomontanus': b'R', 'campanus': b'C', 'topocentric': b'T', 'alcabitius': b'B',
         'morinus': b'M', 'meridian': b'X'}
H = 0.001


def seam(a, b):
    return (a - b + 180) % 360 - 180


def over(d, v):
    return not d <= 0.004 + 1e-6 * abs(v)


counts = {}
for line in open(sys.argv[1]):
    case = json.loads(line)
    s, ramc, lat, eps = case['set'], case['ramc'], case['lat'], case['eps']
    _, _, _, angle_speeds = swe.houses_armc_ex2(ramc, lat, eps, b'E')
    rate = angle_speeds[2]
    # As compare-swiss.py: Swiss's speeds rescaled to the engine's sidereal rate.
    scale = SIDEREAL_RATE / rate if math.isfinite(rate) and rate > 0 else 1.0
    for name, code in CODES.items():
        c = counts.setdefault((s, name), {'values': 0, 'overInBoth': 0, 'overAgainstEngineOnly': 0,
                                          'overAgainstOwnDifferenceOnly': 0, 'notDifferenced': 0,
                                          'notDifferencedOverAgainstEngine': 0})
        engine = case['speeds'][name]
        if engine['fellBack']:
            continue
        try:
            _, _, speeds, own_speeds = swe.houses_armc_ex2(ramc, lat, eps, code)
        except swe.Error:
            continue
        try:
            samples = [swe.houses_armc(ramc + step, lat, eps, code)[0] for step in (-H, -H / 2, 0, H / 2, H)]
        except swe.Error:
            samples = None
        for index in range(12):
            c['values'] += 1
            theirs = speeds[index]
            against_engine = over(abs(engine['cusps'][index] - theirs * scale), theirs * scale)
            if samples is None or any(abs(seam(sample[index], samples[2][index])) > 1 for sample in samples):
                c['notDifferenced'] += 1
                c['notDifferencedOverAgainstEngine'] += against_engine
                continue
            m1, m2, _, p2, p1 = (sample[index] for sample in samples)
            # As swiss-self-difference.py: the difference at Swiss's own RAMC rate for this system.
            numeric = (4 * seam(p2, m2) / H - seam(p1, m1) / (2 * H)) / 3 * own_speeds[2]
            against_own = over(abs(theirs - numeric), numeric)
            if against_engine and against_own:
                c['overInBoth'] += 1
            elif against_engine:
                c['overAgainstEngineOnly'] += 1
            elif against_own:
                c['overAgainstOwnDifferenceOnly'] += 1

out = {'swisseph': swe.version,
       'what': "Values over 0.004 deg/day + 1e-6 |v| against the engine's speed (gate S) and against a central "
               "difference of Swiss's own cusps (swiss-self-difference.py), value by value",
       'sets': {}}
for (s, name), c in sorted(counts.items()):
    out['sets'].setdefault(s, {})[name] = c
print(json.dumps(out, indent=1, allow_nan=False))
