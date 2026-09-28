#!/usr/bin/env python3
"""Diagnostics made after the preregistered comparison, to explain what it
found. None of them is a preregistered check or changes a verdict.

- D1: the engine's nutation angles (astronomy-engine's e_tilt, dumped by
  engine_values.mjs) against ERFA's IAU 2000B (nut00b) and IAU 2006/2000A
  (nut06a), and ERFA's two against each other.
- D2: the barycentric Sun: the engine against Horizons; astronomy-engine's
  barycentre formula (the Sun and four giant planets, each weighted
  m / (m + M_Sun)) and the full Newtonian formula, both evaluated on Horizons's
  own heliocentric vectors, against Horizons.
- D3: the light path against the geometric distance, in Horizons's own
  geocentric vectors (|LT| / |NONE| - 1), for the Moon and Mars.

    python3 docs/evidence/calc-api/tools/diagnostics.py engine.json

Writes ../results/diagnostics.json.
"""
import json
import math
import os
import sys

import erfa
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compare  # noqa: E402  (the same Horizons reader)

AS = 180 * 3600 / math.pi
# GM(Sun) / GM(body), DE440 (Park et al. 2021): system masses; EMB for the Earth and Moon.
SUN_OVER = {'199': 6023657.33, '299': 408523.72, 'EMB': 328900.56, '4': 3098703.59, '5': 1047.348644,
            '6': 3497.901768, '7': 22902.98161, '8': 19412.25977, '9': 136045556.0}
# astronomy-engine 2.1.19's own constants (astronomy.js: SUN_GM, JUPITER_GM ... NEPTUNE_GM), au^3/day^2.
AE_SUN_GM = 0.2959122082855911e-03
AE_GM = {'5': 0.2825345909524226e-06, '6': 0.8459715185680659e-07, '7': 0.1292024916781969e-07,
         '8': 0.1524358900784276e-07}


def worst(values):
    values = np.abs(np.array(values))
    return {'median': float(np.median(values)), 'max': float(values.max())}


def main():
    data = json.load(open(sys.argv[1]))
    out = {'note': 'post hoc diagnostics; not preregistered checks'}

    rows = {'engineMinusNut00b': ([], []), 'engineMinusNut06a': ([], []), 'nut00bMinusNut06a': ([], [])}
    for tilt in data['tilts']:
        d1, d2 = compare.MJD0, 2451545.0 + tilt['tt'] - compare.MJD0
        a, b = erfa.nut06a(d1, d2), erfa.nut00b(d1, d2)
        for name, (dpsi, deps) in (('engineMinusNut00b', (tilt['dpsi'] - b[0] * AS, tilt['deps'] - b[1] * AS)),
                                   ('engineMinusNut06a', (tilt['dpsi'] - a[0] * AS, tilt['deps'] - a[1] * AS)),
                                   ('nut00bMinusNut06a', ((b[0] - a[0]) * AS, (b[1] - a[1]) * AS))):
            rows[name][0].append(dpsi)
            rows[name][1].append(deps)
    out['D1nutationArcsec'] = {name: {'dpsi': worst(p), 'deps': worst(e)} for name, (p, e) in rows.items()}
    out['D1meanObliquityMinusObl06Arcsec'] = worst(
        [t['mobl'] * 3600 - erfa.obl06(compare.MJD0, 2451545.0 + t['tt'] - compare.MJD0) * AS for t in data['tilts']])

    sun = next(c for c in data['cases'] if c['center'] == 'bary' and c['correction'] == 'geometric' and c['body'] == 'Sun')
    bary = compare.horizons('bary', 'NONE', '10')
    helio = {n: compare.horizons('helio', 'NONE', n) for n in ('199', '299', '399', '301', '4', '5', '6', '7', '8', '9')}
    engine_diff, ae_formula, full_formula, series, distance = [], [], [], [], []
    for k, jd in enumerate(data['instants']):
        key = round(jd, 6)
        r = {n: helio[n][key][0] for n in helio}
        r['EMB'] = r['399'] + (r['301'] - r['399']) / (1 + 81.30056)
        names = ['199', '299', 'EMB', '4', '5', '6', '7', '8', '9']
        mass = {n: 1 / SUN_OVER[n] for n in names}
        full = -sum(mass[n] * r[n] for n in names) / (1 + sum(mass.values()))
        ae = -sum(AE_GM[n] / (AE_GM[n] + AE_SUN_GM) * r[n] for n in AE_GM)
        horizons, engine = bary[key][0], np.array(sun['frames']['equatorial-icrs'][k]['xyz'])
        engine_diff.append(np.linalg.norm(engine - horizons))
        ae_formula.append(np.linalg.norm(ae - horizons))
        full_formula.append(np.linalg.norm(full - horizons))
        series.append(np.linalg.norm(engine - ae))
        distance.append(np.linalg.norm(horizons))
    out['D2barycentricSunAu'] = {
        'engineMinusHorizons': worst(engine_diff),
        'astronomyEngineFormulaOnHorizonsPositionsMinusHorizons': worst(ae_formula),
        'fullNewtonianFormulaOnHorizonsPositionsMinusHorizons': worst(full_formula),
        'engineMinusAstronomyEngineFormulaOnHorizonsPositions': worst(series),
        'sunDistanceFromBarycentre': {'min': float(min(distance)), 'max': float(max(distance))},
    }

    out['D3lightPathOverGeometricMinusOne'] = {}
    for label, naif in (('Moon', '301'), ('Mars', '4')):
        lt, none = compare.horizons('geo', 'LT', naif), compare.horizons('geo', 'NONE', naif)
        out['D3lightPathOverGeometricMinusOne'][label] = worst(
            [np.linalg.norm(lt[round(jd, 6)][0]) / np.linalg.norm(none[round(jd, 6)][0]) - 1 for jd in data['instants']])

    with open(os.path.join(compare.RESULTS, 'diagnostics.json'), 'w') as f:
        json.dump(compare.trim(out), f, indent=1)
        f.write('\n')
    print(json.dumps(compare.trim(out), indent=1))


if __name__ == '__main__':
    main()
