#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""After-the-fact check of the L2 arbiter against Swiss Ephemeris (pyswisseph).

    python3 conformance/arbiters/l2/check_swiss.py [--ephe DIR] [--verbose]

Writes conformance/arbiters/l2/swiss-check.json with STATISTICS ONLY: for each
kind and house system, n and the median and maximum |arbiter - Swiss| in
arcsec (differences taken on the circle; for cusps the per-vector maximum over
the twelve). No Swiss output value is written to any file. Swiss is an
instrument here, never an arbiter (SPEC rule 3), and build.py never reads
this file.

Comparisons
  geometry             swe.houses_armc_ex2 fed the arbiter's own RAMC and true
                       obliquity: isolates the angle and house geometry.
  pipeline-arbiter-dT  swe.houses_ex2 from jd_ut1 with Swiss's Delta T pinned
                       to the vector's jd_tt - jd_ut1: adds Swiss's sidereal-time,
                       obliquity and nutation models. Split by window, because
                       Swiss changes its sidereal-time model outside 1850..2050.
  pipeline-swiss-dT    swe.houses_ex2 with Swiss's own Delta T: what running
                       Swiss as an engine against the suite measures.
  models               Swiss minus ERFA for GAST, ARMC and true obliquity at the
                       arbiter's TT; Swiss minus arbiter for Delta T; and how much
                       each sidereal time moves per second of Delta T.
  placidus_condition   the residual of the Placidus defining equation (arcsec
                       of right ascension) at each side's intermediate cusps.
  status               for the undefined (polar) vectors: whether Swiss raised,
                       returned the arbiter's Porphyry cusps (a substitution), or
                       returned other numbers. Counts only.
--verbose prints per-vector differences (never values) to stderr.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import statistics
import sys

import erfa
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # leave no __pycache__ beside the arbiter
import build  # noqa: E402  (the arbiter's own time scale, frame and Placidus equation)

ROOT = build.ROOT
OUT = os.path.join(HERE, 'swiss-check.json')
HSYS = {'placidus': b'P', 'koch': b'K', 'regiomontanus': b'R', 'campanus': b'C', 'porphyry': b'O',
        'alcabitius': b'B', 'equal': b'E', 'whole-sign': b'W', 'morinus': b'M', 'meridian': b'X',
        'topocentric': b'T', 'vehlow': b'V', 'equal-mc': b'D'}
ANGLE_HSYS = b'O'  # any system would do: Swiss's ascmc does not depend on it
HOUSES_FLAGS = 0   # tropical, Swiss's default models
WINDOW = (build.cal2jd(1850, 1, 1), build.cal2jd(2050, 1, 1))


def arcsec_diff(a_deg: float, b_deg: float) -> float:
    return abs((a_deg - b_deg + 180.0) % 360.0 - 180.0) * 3600.0


def sig(x: float) -> float:
    return float('%.3g' % x)


def stats(xs, unit='arcsec'):
    if not xs:
        return {'n': 0}
    out = {'n': len(xs), 'median_' + unit: sig(statistics.median(xs)), 'max_' + unit: sig(max(xs))}
    if unit == 'arcsec':
        out['over_1_arcsec'] = sum(1 for x in xs if x > 1.0)  # vectors that would fail the 1" tolerance
    return out


def sha256_path(p):
    with open(p, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def in_window(jd):
    return WINDOW[0] <= jd < WINDOW[1]


def main():
    ephe = '/tmp/claude-0/swisslab/ephe'
    if '--ephe' in sys.argv:
        ephe = sys.argv[sys.argv.index('--ephe') + 1]
    verbose = '--verbose' in sys.argv
    swe.set_ephe_path(ephe)

    vec_path = os.path.join(ROOT, build.OUTPUT)
    with open(vec_path, encoding='utf-8') as f:
        doc = json.load(f)

    groups = {name: {} for name in ('geometry', 'pipeline-arbiter-dT', 'pipeline-swiss-dT')}
    models = {k: {'in': [], 'out': []} for k in ('gast_mas', 'armc_mas', 'true_obliquity_mas', 'delta_t_s',
                                                  'swiss_sidtime_per_dt_s', 'erfa_gst06a_per_dt_s')}
    placidus = {'arbiter': [], 'swiss': []}
    status = {}
    verdicts = {name: {} for name in groups}  # per kind and window: [vectors, vectors with any field over 1"]

    def add(group, kind, key, jd, d):
        slot = groups[group].setdefault(kind, {}).setdefault(key, {'all': [], 'in': [], 'out': []})
        slot['all'].append(d)
        slot['in' if in_window(jd) else 'out'].append(d)

    for v in doc['vectors']:
        inp = v['input']
        jd_ut1, jd_tt, lat, lon = inp['jd_ut1'], inp['jd_tt'], inp['lat'], inp['lon']
        gast, eps = build.earth_angles(jd_ut1, jd_tt)
        ramc = build.anp(gast + lon * build.DEG)
        armc_deg, eps_deg = ramc / build.DEG, eps / build.DEG
        system = inp.get('system')
        hsys = HSYS[system] if system else ANGLE_HSYS
        win = 'in' if in_window(jd_ut1) else 'out'

        if v['expected'].get('status') == 'undefined':
            s = build.Sky(ramc, eps, lat * build.DEG)
            porph = [build.anp(x) / build.DEG for x in build.house_cusps('porphyry', s)]
            st = status.setdefault(system, {'n': 0, 'geometry': {}, 'pipeline-swiss-dT': {}})
            st['n'] += 1
            for mode in ('geometry', 'pipeline-swiss-dT'):
                try:
                    if mode == 'geometry':
                        cusps = swe.houses_armc_ex2(armc_deg, lat, eps_deg, hsys)[0]
                    else:
                        cusps = swe.houses_ex2(jd_ut1, lat, lon, hsys, HOUSES_FLAGS)[0]
                    worst = max(arcsec_diff(a, b) for a, b in zip(porph, cusps))
                    outcome = ("returned the arbiter's Porphyry cusps (substitution)" if worst < 1e-3
                               else 'returned other numbers')
                except swe.Error:
                    outcome = 'raised swisseph.Error (refused)'
                st[mode][outcome] = st[mode].get(outcome, 0) + 1
            continue

        if v['kind'] == 'houses.cusps':
            key_pairs = [('cusps', None)]
        elif v['kind'] == 'angles.asc-mc':
            key_pairs = [('asc', 0), ('mc', 1)]
        else:
            key_pairs = [('vertex', 3), ('east_point', 4)]

        results = {'geometry': swe.houses_armc_ex2(armc_deg, lat, eps_deg, hsys)[:2]}
        swe.set_delta_t_userdef(jd_tt - jd_ut1)
        results['pipeline-arbiter-dT'] = swe.houses_ex2(jd_ut1, lat, lon, hsys, HOUSES_FLAGS)[:2]
        sid_hours = swe.sidtime(jd_ut1)
        true_eps = swe.calc_ut(jd_ut1, swe.ECL_NUT, 0)[0][0]
        swe.set_delta_t_userdef(jd_tt - jd_ut1 + 60.0 / 86400.0)
        sid_hours_60 = swe.sidtime(jd_ut1)
        swe.set_delta_t_userdef(swe.DELTAT_AUTOMATIC)
        results['pipeline-swiss-dT'] = swe.houses_ex2(jd_ut1, lat, lon, hsys, HOUSES_FLAGS)[:2]
        swiss_dt = swe.deltat(jd_ut1) * 86400.0
        gast_60 = float(erfa.gst06a(build.DJM0, jd_ut1 - build.DJM0, build.DJM0, jd_tt - build.DJM0 + 60.0 / 86400.0))

        models['gast_mas'][win].append(arcsec_diff(sid_hours * 15.0, gast / build.DEG) * 1000.0)
        models['armc_mas'][win].append(arcsec_diff(results['pipeline-arbiter-dT'][1][2], armc_deg) * 1000.0)
        models['true_obliquity_mas'][win].append(arcsec_diff(true_eps, eps_deg) * 1000.0)
        models['delta_t_s'][win].append(abs(swiss_dt - (jd_tt - jd_ut1) * 86400.0))
        models['swiss_sidtime_per_dt_s'][win].append(arcsec_diff(sid_hours_60 * 15.0, sid_hours * 15.0) / 60.0)
        models['erfa_gst06a_per_dt_s'][win].append(arcsec_diff(gast_60 / build.DEG, gast / build.DEG) / 60.0)

        kind_key = system if system else None
        for group, (cusps, ascmc) in results.items():
            worst_of_vector = 0.0
            for key, idx in key_pairs:
                if key == 'cusps':
                    d = max(arcsec_diff(a, b) for a, b in zip(v['expected']['cusps'], cusps))
                else:
                    d = arcsec_diff(v['expected'][key], ascmc[idx])
                add(group, v['kind'], kind_key or key, jd_ut1, d)
                worst_of_vector = max(worst_of_vector, d)
                if verbose:
                    print('%s %-20s %-24s %-10s |d| = %.3e arcsec' % (v['id'], group, v['kind'], kind_key or key, d),
                          file=sys.stderr)
            tally = verdicts[group].setdefault(v['kind'], {'in': [0, 0], 'out': [0, 0]})[win]
            tally[0] += 1
            tally[1] += worst_of_vector > 1.0

        if system == 'placidus':
            # Residual of the defining equation at each side's cusps 11, 12, 2, 3.
            s = build.Sky(ramc, eps, lat * build.DEG)
            arb = build.house_cusps('placidus', s)
            sw = results['geometry'][0]
            for m, idx in ((-2, 10), (-1, 11), (1, 1), (2, 2)):
                placidus['arbiter'].append(abs(build.placidus_equation(s, m, arb[idx], m < 0)) / build.ARCSEC)
                placidus['swiss'].append(abs(build.placidus_equation(s, m, sw[idx] * build.DEG, m < 0)) / build.ARCSEC)

    out = {
        'what': ('After-the-fact comparison of the L2 arbiter (arbiters/l2/build.py) with Swiss Ephemeris. '
                 'Statistics only: n, median and maximum |arbiter - Swiss| in arcsec on the circle; for cusps, '
                 'the per-vector maximum over the 12 cusps. The pipeline comparisons are also split into '
                 'instants inside and outside 1850-01-01..2050-01-01 UT1. No Swiss value is recorded.'),
        'vectors': {'path': build.OUTPUT, 'sha256': sha256_path(vec_path)},
        'swiss': {
            'pyswisseph': importlib.metadata.version('pyswisseph'),
            'swe_version': swe.version,
            'ephe_files': [{'name': n, 'sha256': sha256_path(os.path.join(ephe, n))}
                           for n in sorted(os.listdir(ephe)) if n.endswith('.se1')],
            'houses_flags': HOUSES_FLAGS,
            'hsys': {k: v.decode() for k, v in HSYS.items()},
            'angles_from_hsys': ANGLE_HSYS.decode(),
            'delta_t': ("geometry: not used (RAMC and obliquity are the arbiter's); pipeline-arbiter-dT and "
                        "models.gast/armc/true_obliquity: set_delta_t_userdef(jd_tt - jd_ut1); pipeline-swiss-dT "
                        "and models.delta_t_s: automatic (DELTAT_AUTOMATIC)"),
        },
        'comparisons': {},
        'placidus_condition': {
            'what': ('max |RA - RAMC - (90 + 30m + (1 - |m|/3) AD)| in arcsec of right ascension, over the 24 '
                     'intermediate cusps of the 6 Placidus vectors, evaluated with the arbiter\'s equation at '
                     'the arbiter\'s cusps and at Swiss\'s (geometry comparison) cusps'),
            'arbiter_max_arcsec': sig(max(placidus['arbiter'])),
            'swiss_max_arcsec': sig(max(placidus['swiss'])),
        },
        'vectors_over_1_arcsec': {
            'what': ('per comparison and kind: vectors in which any compared field differs by more than the 1" '
                     'tolerance, inside and outside 1850-01-01..2050-01-01 UT1 (the verdict Swiss would get if '
                     'these differences were its errors)'),
        },
        'models': {},
        'status': status,
    }
    for group, kinds in verdicts.items():
        out['vectors_over_1_arcsec'][group] = {
            kind: {'in_1850_2050': {'n': t['in'][0], 'over': t['in'][1]},
                   'outside': {'n': t['out'][0], 'over': t['out'][1]}} for kind, t in kinds.items()}
    for group, kinds in groups.items():
        block = {}
        for kind, keys in kinds.items():
            block[kind] = {}
            for key, slot in keys.items():
                entry = stats(slot['all'])
                if group != 'geometry':
                    entry['in_1850_2050'] = stats(slot['in'])
                    entry['outside'] = stats(slot['out'])
                block[kind][key] = entry
        out['comparisons'][group] = block
    units = {'gast_mas': 'mas', 'armc_mas': 'mas', 'true_obliquity_mas': 'mas', 'delta_t_s': 's',
             'swiss_sidtime_per_dt_s': 'arcsec_per_s', 'erfa_gst06a_per_dt_s': 'arcsec_per_s'}
    for k, slot in models.items():
        out['models'][k] = {'in_1850_2050': stats(slot['in'], units[k]), 'outside': stats(slot['out'], units[k])}

    text = json.dumps(out, indent=2, ensure_ascii=False) + '\n'
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('wrote %s' % os.path.relpath(OUT, ROOT), file=sys.stderr)


if __name__ == '__main__':
    main()
