#!/usr/bin/env python3
"""Check the L1 arbiter against an independent reduction from DE440s. This is a check, not the arbiter.

For every vector in vectors/L1-positions.json, the apparent geocentric position in the IAU 2006/2000A
true ecliptic and true equinox of date is computed from the DE440s kernel:

  1. TDB from the vector's TT at the geocentre (erfa.dtdb);
  2. the geocentre's barycentric position and velocity (kernel 0->3 plus 3->399);
  3. light-time iteration for the target: the Sun 10, the Moon 3->301, Mercury 1->199, Venus 2->299,
     and Mars to Pluto as the system barycentres 4 to 9, as in the vectors;
  4. gravitational deflection by the Sun (erfa.ld, finite-distance form, with the Sun where the light
     passed closest to it);
  5. annual aberration from the geocentre's barycentric velocity (erfa.ab);
  6. erfa.pnm06a, then R1(obl06 + the nutation in obliquity of erfa.nut06a) to the true ecliptic of date.

Each result is compared with the vector's expected value. It also measures how far each position moves
between the vector's jd_tt and the TLIST value Horizons was sent (jd_tt to 8 decimals). It reads the
vectors, sources/horizons-24/corpus-tt.json (for the instants' names) and the kernel, and none of
build.py's code.

    python3 conformance/arbiters/l1/validate.py path/to/de440s.bsp

Writes arbiters/l1/validation.json (statistics only, no positions), then checks that the arbiter's
uncertainty text quotes the result; it exits with status 1 if it does not. Needs pyerfa, numpy, jplephem.
"""
import hashlib
import json
import math
import os
import platform
import statistics
import sys

import erfa
import jplephem
import numpy as np
from jplephem.spk import SPK

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))  # conformance/
VECTORS = os.path.join(ROOT, 'vectors', 'L1-positions.json')
CORPUS = os.path.join(ROOT, 'sources', 'horizons-24', 'corpus-tt.json')
OUT = os.path.join(HERE, 'validation.json')
KERNEL_SHA256 = 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2'
KERNEL_URL = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp'
LIMIT_MAS = 50.0

C = 299792.458          # km/s
AU = 149597870.7        # km
DAY = 86400.0           # s
MJD0 = 2400000.5

EARTH = ((0, 3), (3, 399))
SUN = ((0, 10),)
TARGETS = {  # the target's barycentric position as a chain of kernel segments
    'Sun': SUN,
    'Moon': ((0, 3), (3, 301)),
    'Mercury': ((0, 1), (1, 199)),
    'Venus': ((0, 2), (2, 299)),
    'Mars': ((0, 4),),
    'Jupiter': ((0, 5),),
    'Saturn': ((0, 6),),
    'Uranus': ((0, 7),),
    'Neptune': ((0, 8),),
    'Pluto': ((0, 9),),
}


class Kernel:
    def __init__(self, path):
        self.spk = SPK.open(path)

    def position(self, chain, t1, t2):
        return sum(self.spk[a, b].compute(t1, t2) for a, b in chain)

    def state(self, chain, t1, t2):
        pv = [self.spk[a, b].compute_and_differentiate(t1, t2) for a, b in chain]
        return sum(p for p, _ in pv), sum(v for _, v in pv) / DAY  # km, km/s


def apparent(kernel, body, jd_tt):
    """(lon, lat) in degrees, IAU 2006/2000A true ecliptic and equinox of date, from DE440s."""
    d1, d2 = MJD0, jd_tt - MJD0                       # TT, as two parts
    t1, t2 = d1, d2 + erfa.dtdb(d1, d2, 0.0, 0.0, 0.0, 0.0) / DAY  # TDB at the geocentre (u = v = 0)
    earth, earth_v = kernel.state(EARTH, t1, t2)
    chain = TARGETS[body]
    tau = 0.0
    for _ in range(20):
        target = kernel.position(chain, t1, t2 - tau)
        new_tau = np.linalg.norm(target - earth) / C / DAY
        if abs(new_tau - tau) < 1e-14:
            break
        tau = new_tau
    else:
        raise SystemExit(f'{body} {jd_tt}: light-time did not converge')
    target = kernel.position(chain, t1, t2 - tau)
    geo = target - earth
    p = geo / np.linalg.norm(geo)
    sun_now = kernel.position(SUN, t1, t2)
    if body != 'Sun':
        # The Sun where the light passed closest to it, between emission and reception.
        back = min(max(float(np.dot(sun_now - earth, p)) / C / DAY, 0.0), tau)
        sun = kernel.position(SUN, t1, t2 - back)
        q = target - sun
        q = q / np.linalg.norm(q)
        e = earth - sun
        em = np.linalg.norm(e) / AU
        e = e / np.linalg.norm(e)
        p = erfa.ld(1.0, p, q, e, em, 1e-6 / max(em * em, 1.0))
    v = earth_v / C
    p = erfa.ab(p, v, np.linalg.norm(earth - sun_now) / AU, math.sqrt(1.0 - float(np.dot(v, v))))
    eps = erfa.obl06(d1, d2) + erfa.nut06a(d1, d2)[1]
    ecliptic = erfa.rxr(erfa.rx(eps, np.identity(3)), erfa.pnm06a(d1, d2))
    lon, lat = erfa.c2s(erfa.rxp(ecliptic, p))
    return math.degrees(erfa.anp(lon)), math.degrees(lat)


def dlon_mas(a, b):
    return ((a - b + 540.0) % 360.0 - 180.0) * 3.6e6


def stats(rows):
    """rows: [(label, value in mas)] -> median and largest absolute value, and where."""
    worst = max(rows, key=lambda row: abs(row[1]))
    return {
        'medianAbs': round(statistics.median(abs(v) for _, v in rows), 3),
        'maxAbs': round(abs(worst[1]), 3),
        'maxAt': worst[0],
    }


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def up(x):
    """x rounded up to 0.01, for a bound ('at most', 'within')."""
    return f'{math.ceil(x * 100 - 1e-9) / 100:.2f}'


def frame_sentence(others_lon_max, others_lat_max, spread):
    """The sentence the arbiter's frame-model disclosure quotes: the model's acceptance rests on this check."""
    return (
        'In this suite the model\'s acceptance rests on validate.py\'s independent reduction from DE440s, not on '
        'Swiss: for the nine bodies other than the Moon it differs from the expected values by at most '
        f'{up(others_lon_max)} mas in longitude and {up(others_lat_max)} mas in latitude, and at each instant their '
        f'longitude differences agree to within {up(spread)} mas, so what the model leaves is a rotation common to '
        'all bodies.'
    )


def summary_sentence(median_lon, lat_max, spread, others_max, others_at, moon_max, moon_at, tlist):
    """The sentence the arbiter's uncertainty text quotes; bounds are rounded up, the median to nearest."""
    return (
        'Independent check: an apparent-place reduction from DE440s (arbiters/l1/validate.py with jplephem and '
        'pyerfa: light-time iteration, deflection by the Sun, annual aberration, pnm06a and the true obliquity; '
        f'kernel de440s.bsp, sha256 {KERNEL_SHA256}), with Mars to Pluto as the system barycentres 4 to 9 as in '
        f'the vectors, differs from the 240 expected values by a median of {median_lon:.2f} mas in longitude and '
        f'at most {up(lat_max)} mas in latitude. For the nine bodies other than the Moon the longitude differences '
        f'agree at each instant to within {up(spread)} mas, so what is left is a rotation common to all of them, the '
        f'frame model\'s remainder, at most {up(others_max)} mas ({others_at}); the Moon differs by up to '
        f'{up(moon_max)} mas ({moon_at}). Evaluating at the TLIST value Horizons was sent (jd_tt to 8 decimals of a '
        f'day) instead of at jd_tt moves no position by more than {up(tlist)} mas. Per-body statistics are in '
        'arbiters/l1/validation.json.'
    )


def main():
    if len(sys.argv) != 2:
        raise SystemExit('usage: validate.py path/to/de440s.bsp')
    path = sys.argv[1]
    digest = sha256(path)
    if digest != KERNEL_SHA256:
        raise SystemExit(f'{path}: sha256 {digest}, expected {KERNEL_SHA256}')
    kernel = Kernel(path)
    with open(VECTORS, encoding='utf-8') as f:
        doc = json.load(f)
    with open(CORPUS, encoding='utf-8') as f:
        cases = json.load(f)['cases']
    by_jd = {case['jdTt']: case['id'] for case in cases}
    dates = {case['id']: case['utc'][:10] for case in cases}
    arbiter_ids = {vector['arbiter'] for vector in doc['vectors']}
    if len(arbiter_ids) != 1:
        raise SystemExit(f'expected one arbiter, found {sorted(arbiter_ids)}')
    arbiter_id = arbiter_ids.pop()

    diffs = {body: {'lon': [], 'lat': []} for body in TARGETS}
    moved = {body: [] for body in TARGETS}
    for vector in doc['vectors']:
        body, jd_tt = vector['input']['body'], vector['input']['jd_tt']
        instant = by_jd[jd_tt]
        lon, lat = apparent(kernel, body, jd_tt)
        diffs[body]['lon'].append((instant, dlon_mas(lon, vector['expected']['lon'])))
        diffs[body]['lat'].append((instant, (lat - vector['expected']['lat']) * 3.6e6))
        # How far the position moves between jd_tt and the TLIST value Horizons evaluated.
        lon_t, lat_t = apparent(kernel, body, float(f'{jd_tt:.8f}'))
        moved[body].append(math.hypot(dlon_mas(lon_t, lon) * math.cos(math.radians(lat)), (lat_t - lat) * 3.6e6))

    per_body = {body: {'n': len(d['lon']), 'lon': stats(d['lon']), 'lat': stats(d['lat'])} for body, d in diffs.items()}

    def pooled(bodies):
        rows = {key: [(f'{body} {row[0]}', row[1]) for body in bodies for row in diffs[body][key]]
                for key in ('lon', 'lat')}
        return {'n': len(rows['lon']), 'lon': stats(rows['lon']), 'lat': stats(rows['lat'])}, rows

    overall, everything = pooled(list(TARGETS))
    others, nine_rows = pooled([body for body in TARGETS if body != 'Moon'])
    over = [f'{name}: {key} {value:+.3f} mas' for key in ('lon', 'lat') for name, value in everything[key]
            if abs(value) > LIMIT_MAS]
    # At each instant: the longitude difference shared by the nine bodies other than the Moon, and its spread.
    per_instant, spreads = [], []
    for i, case in enumerate(cases):
        nine = [diffs[body]['lon'][i][1] for body in TARGETS if body != 'Moon']
        spreads.append(max(nine) - min(nine))
        per_instant.append({
            'id': case['id'],
            'meanOfNineMas': round(statistics.mean(nine), 3),
            'spreadOfNineMas': round(spreads[-1], 3),
            'moonMas': round(diffs['Moon']['lon'][i][1], 3),
        })
    others_worst = max(nine_rows['lon'], key=lambda row: abs(row[1]))
    moon_worst = max(diffs['Moon']['lon'], key=lambda row: abs(row[1]))
    sentence = summary_sentence(
        median_lon=statistics.median(abs(v) for _, v in everything['lon']),
        lat_max=max(abs(v) for _, v in everything['lat']),
        spread=max(spreads),
        others_max=abs(others_worst[1]), others_at=dates[others_worst[0].split()[1]],
        moon_max=abs(moon_worst[1]), moon_at=dates[moon_worst[0]],
        tlist=max(max(values) for values in moved.values()),
    )
    acceptance = frame_sentence(
        others_lon_max=abs(others_worst[1]),
        others_lat_max=max(abs(v) for _, v in nine_rows['lat']),
        spread=max(spreads),
    )
    result = {
        'what': 'Independent check of the L1 arbiter (not the arbiter): apparent geocentric positions in the IAU '
                '2006/2000A true ecliptic and equinox of date reduced from DE440s, minus the vectors\' expected values',
        'vectors': {'path': 'vectors/L1-positions.json', 'sha256': sha256(VECTORS), 'n': len(doc['vectors']),
                    'arbiter': arbiter_id},
        'kernel': {'file': os.path.basename(path), 'sha256': digest, 'url': KERNEL_URL},
        'software': {
            'python': platform.python_version(), 'numpy': np.__version__, 'pyerfa': erfa.__version__,
            'erfa': erfa.version.erfa_version, 'jplephem': jplephem.__version__,
        },
        'reduction': 'TDB = TT + erfa.dtdb at the geocentre; geocentre 0->3 + 3->399 (position and velocity); '
                     'light-time iterated to 1e-14 day; Sun deflection by erfa.ld (bm = 1, finite-distance q, the Sun '
                     'at the light\'s closest approach, dlim = 1e-6/max(em^2, 1)); annual aberration by erfa.ab from the '
                     'geocentre\'s barycentric velocity and its distance from the Sun; erfa.pnm06a and '
                     'R1(erfa.obl06 + nut06a deps) at TT; erfa.c2s',
        'targets': {body: '+'.join(f'{a}->{b}' for a, b in chain) for body, chain in TARGETS.items()},
        'comparedWith': 'each vector\'s expected value; Mars to Pluto are system barycentres on both sides '
                        '(kernel targets 4 to 9, Horizons NAIF 4 to 9)',
        'units': 'milliarcseconds; lon is the longitude difference taken on the circle, lat the latitude '
                 'difference, both DE440s minus the expected value; medianAbs and maxAbs are of the absolute difference',
        'perBody': per_body,
        'overall': overall,
        'overallWithoutMoon': others,
        'limitMas': LIMIT_MAS,
        'overLimit': over,
        'perInstant': {
            'what': 'longitude differences at each instant: the mean and the spread (largest minus smallest) of the '
                    'nine bodies other than the Moon, which is the frame model\'s remainder when the spread is small, '
                    'and the Moon\'s, in mas',
            'instants': per_instant,
        },
        'tlistInstant': {
            'what': 'Horizons was sent each jd_tt to 8 decimals of a day (at most 0.43 ms away); largest angular '
                    'motion of the DE440s position between jd_tt and that value, in mas',
            'maxMasPerBody': {body: round(max(values), 4) for body, values in moved.items()},
        },
        'frameAcceptance': acceptance,
        'summary': sentence,
    }
    text = json.dumps(result, indent=2, ensure_ascii=True) + '\n'
    with open(OUT, 'w', encoding='ascii', newline='\n') as f:
        f.write(text)

    print(f'wrote {os.path.relpath(OUT, ROOT)}, sha256 {hashlib.sha256(text.encode("ascii")).hexdigest()}')
    for body, row in per_body.items():
        print(f"{body:8s} lon median {row['lon']['medianAbs']:7.3f} max {row['lon']['maxAbs']:7.3f} ({row['lon']['maxAt']})"
              f"   lat median {row['lat']['medianAbs']:7.3f} max {row['lat']['maxAbs']:7.3f} ({row['lat']['maxAt']})"
              f"   TLIST motion max {max(moved[body]):.4f} mas")
    print(f"all      lon median {overall['lon']['medianAbs']:.3f} max {overall['lon']['maxAbs']:.3f} ({overall['lon']['maxAt']})"
          f"   lat median {overall['lat']['medianAbs']:.3f} max {overall['lat']['maxAbs']:.3f} ({overall['lat']['maxAt']})")
    print(f'nine bodies other than the Moon: at most {others["lon"]["maxAbs"]:.3f} mas in longitude, '
          f'common to all nine at each instant to within {max(spreads):.3f} mas')
    if over:
        print(f'over {LIMIT_MAS} mas:', *over, sep='\n  ')
    uncertainty = doc['arbiters'][arbiter_id]['uncertainty']
    missing = [(name, text) for name, text in (('FRAME_ACCEPTANCE', acceptance), ('VALIDATION', sentence))
               if text not in uncertainty]
    for name, text in missing:
        print(f'The arbiter\'s uncertainty text does not quote this result. Set build.py\'s {name} to:\n{text}')
    if missing:
        sys.exit(1)
    print('the arbiter\'s uncertainty text quotes this result (FRAME_ACCEPTANCE and VALIDATION)')
    if over:
        sys.exit(1)


if __name__ == '__main__':
    main()
