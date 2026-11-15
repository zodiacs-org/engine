#!/usr/bin/env python3
"""The dense sweep's run on the shipped DE440 pack (engine_sweep.mjs --ephemeris de440), read instant by
instant near the Sun: where the pack's apparent place differs from the kernel's, and why.

    python3 pack_near_sun.py KERNEL ENGINE_DIR OUT.json

ENGINE_DIR holds the eight eras' engine-<year>.bin and .bin.json that engine_sweep.mjs wrote. For the
apparent places of the Sun, the Moon and Mercury to Pluto in the true ecliptic and equinox of date, it
forms the kernel's apparent place twice, with the Sun's light deflection of erfa.ld (sweep.py's geocentric):
once with erfa.ldsun's limiter, 1e-6 / max(em^2, 1), which tapers the deflection to zero within about
0.081 degrees of the Sun's centre, and once with the limiter src/de440/reduce.ts uses, 1e-14, which keeps
the same form down to the centre. It reports, by body, the largest angle and longitude difference from
each, the largest rate difference (the arbiter's rate a central difference over 0.0001 day, as sweep.py's),
split at 0.1 degrees from the Sun's centre (the apparent direction of the Sun, LT+S, from the kernel), and
the instant and the distance from the Sun of each largest. Needs sweep.py beside it in
docs/evidence/de440-sweep-20261111/tools/, pyerfa, numpy and jplephem.
"""
import json
import os
import sys

import erfa
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', '..', 'de440-sweep-20261111', 'tools')))
import sweep  # noqa: E402

ENGINE_LIMIT = 1e-14
SPLIT_DEGREES = 0.1
FRAME = 'ecliptic-true-of-date'


def apparent(kernel, body, jd, engine_limit):
    """sweep.geocentric's APPARENT, with erfa.ldsun's limiter or the engine's (neither bends the Sun's own light)."""
    if not engine_limit or body == 'Sun':
        return sweep.geocentric(kernel, body, jd, deflection=True)['APPARENT']
    t = sweep.tdb(jd)
    earth, earth_v = kernel.state(sweep.EARTH, t)
    tau = np.zeros_like(jd)
    for _ in range(20):
        emitted = kernel.position(sweep.TARGETS[body], t - tau)
        new_tau = sweep.norm(emitted - earth) / sweep.C
        if float(np.max(np.abs(new_tau - tau))) < 1e-14:
            tau = new_tau
            break
        tau = new_tau
    emitted = kernel.position(sweep.TARGETS[body], t - tau)
    lt = emitted - earth
    length = sweep.norm(lt)
    p = lt / length[:, None]
    sun_now = kernel.position(sweep.SUN, t)
    v = earth_v / sweep.C
    s = sweep.norm(earth - sun_now)
    bm1 = np.sqrt(1.0 - np.einsum('ni,ni->n', v, v))
    back = np.clip(np.einsum('ni,ni->n', sun_now - earth, p) / sweep.C, 0.0, tau)
    sun = kernel.position(sweep.SUN, t - back)
    q = emitted - sun
    q = q / sweep.norm(q)[:, None]
    e = earth - sun
    em = sweep.norm(e)
    e = e / em[:, None]
    bent = erfa.ld(1.0, p, q, e, em, np.full_like(em, ENGINE_LIMIT))
    return erfa.ab(bent, v, s, bm1) * length[:, None]


def top(values, mask, jd, sep):
    if not mask.any():
        return None
    i = int(np.flatnonzero(mask)[np.argmax(values[mask])])
    return {'max': float(f'{values[i]:.6g}'), 'atJdTt': float(jd[i]), 'fromSunDegrees': float(f'{sep[i]:.6g}'), 'n': int(mask.sum())}


def main():
    kernel_path, engine_dir, out_path = sys.argv[1:4]
    kernel = sweep.Kernel(kernel_path)
    by_body = {body: {} for body in sweep.BODIES}
    meta_seen = None
    for year in range(1800, 2200, 50):
        path = os.path.join(engine_dir, f'engine-{year}.bin')
        meta = json.load(open(path + '.json'))
        if meta.get('ephemeris') != 'de440':
            raise SystemExit(f'{path}: not a run on the pack')
        if sweep.sha256(path) != meta['valuesSha256']:
            raise SystemExit(f'{path}: not the values the engine wrote')
        meta_seen = meta_seen or meta
        n = meta['count']
        jd = sweep.FIRST_JD + meta['startIndex'] + np.arange(n, dtype=float)
        values = np.fromfile(path, dtype='<f8').reshape(len(meta['cases']), len(meta['frames']), n, 5)
        f = meta['frames'].index(FRAME)
        matrices = {k: sweep.frame_matrices(x)[FRAME] for k, x in (('here', jd), ('before', jd - sweep.STEP), ('after', jd + sweep.STEP))}
        sun_dir = sweep.turn(matrices['here'], sweep.geocentric(kernel, 'Sun', jd)['LTS'])
        for body in sweep.BODIES:
            engine = values[meta['cases'].index({'correction': 'apparent', 'body': body}), f]
            e_lon, e_lat, _, e_lon_rate, e_lat_rate = (engine[:, k] for k in range(5))
            here_vec = sweep.turn(matrices['here'], apparent(kernel, body, jd, False))
            sep = sweep.angle(here_vec, sun_dir) / 3600.0
            near = sep < SPLIT_DEGREES
            for label, limit in (('erfaLdsunLimiter', False), ('engineLimiter', True)):
                lon, lat, _ = sweep.spherical(sweep.turn(matrices['here'], apparent(kernel, body, jd, limit)))
                lon0, lat0, _ = sweep.spherical(sweep.turn(matrices['before'], apparent(kernel, body, jd - sweep.STEP, limit)))
                lon1, lat1, _ = sweep.spherical(sweep.turn(matrices['after'], apparent(kernel, body, jd + sweep.STEP, limit)))
                cos = np.cos(np.radians(lat))
                position = sweep.angle(sweep.unit(e_lon, e_lat), sweep.unit(lon, lat))
                longitude = np.abs(sweep.wrap(e_lon - lon)) * 3600
                rate = np.hypot((e_lon_rate - sweep.wrap(lon1 - lon0) / (2 * sweep.STEP)) * cos, e_lat_rate - (lat1 - lat0) / (2 * sweep.STEP)) * 3600
                for metric, data in (('position', position), ('longitude', longitude), ('rate', rate)):
                    for zone, mask in (('farFromSun', ~near), ('nearSun', near)):
                        found = top(data, mask, jd, sep)
                        zones = by_body[body].setdefault(label, {}).setdefault(metric, {})
                        slot = zones.get(zone)
                        count = (slot['n'] if slot else 0) + int(mask.sum())
                        if found and (slot is None or found['max'] > slot['max']):
                            zones[zone] = found
                        if zone in zones:
                            zones[zone]['n'] = count
        print(f'era {year}: done', flush=True)
    result = {
        'what': __doc__.strip().split('\n\n')[0],
        'engine': meta_seen['engine'], 'ephemeris': 'de440', 'distSha256': meta_seen['distSha256'], 'node': meta_seen['node'],
        'kernel': {'file': 'de440.bsp', 'sha256': sweep.KERNEL_SHA256}, 'software': sweep.software(),
        'corpus': {'n': sweep.TOTAL, 'firstJdTt': sweep.FIRST_JD, 'lastJdTt': sweep.FIRST_JD + sweep.TOTAL - 1, 'frame': FRAME},
        'splitDegrees': SPLIT_DEGREES, 'units': {'position': 'arcsec', 'longitude': 'arcsec', 'rate': 'arcsec/day'},
        'byBody': by_body,
    }
    with open(out_path, 'w') as f:
        f.write(json.dumps(result, indent=1) + '\n')


if __name__ == '__main__':
    main()
