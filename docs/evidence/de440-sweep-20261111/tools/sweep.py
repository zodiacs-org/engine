#!/usr/bin/env python3
"""The dense DE440 sweep that ../PLAN.md fixes: the calc entry point against
NAIF's de440.bsp at every daily instant from 1800 to 2200, geocentric, in all
eight frames.

It is the reduction of ../../calc-api/tools/compare.py with one substitution:
where that comparison reads Horizons's ICRF vectors (DE441; geometric, light
time, light time and stellar aberration) from committed responses at 32
instants, this one forms the same three vectors from the kernel itself. The
frames (ERFA, IAU 2006/2000A), the differences that are measured, the true
node's reference and the bounds rule are that comparison's, vectorised.

    python3 sweep.py selfcheck KERNEL OUT.json
    python3 sweep.py shard KERNEL ENGINE.bin OUT.json
    python3 sweep.py merge OUT_DIR SELFCHECK.json SHARD.json...

Needs pyerfa, numpy and jplephem (the versions the workflow pins). It uses no
code of the engine and no Swiss Ephemeris. The kernel is read, never copied.
"""
import hashlib
import json
import math
import os
import platform
import sys

import erfa
import jplephem
import numpy as np
from jplephem.spk import SPK

HERE = os.path.dirname(os.path.abspath(__file__))
EVIDENCE = os.path.normpath(os.path.join(HERE, '..'))
REPOSITORY = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
CALC_API = os.path.join(REPOSITORY, 'docs', 'evidence', 'calc-api')
ORACLES = os.path.join(REPOSITORY, 'docs', 'evidence', 'de440-20261110', 'oracles')

KERNEL_URL = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp'
KERNEL_SHA256 = 'a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5'
ORACLE_SHA256 = {
    'erfa-places.json': '7d56d6ea938cd90df04a5b902f3ff3fddd5d3535efc886d2dac1fd9dc58831cd',
    'erfa-nodes.json': 'f8091b4dff24507486af2bfeee56af55f389671db5c96ecf3a9f788408db7213',
}

MJD0 = 2400000.5
AS = 180 * 3600 / math.pi      # arcseconds per radian
AU = 149597870.7               # km
DAY = 86400.0                  # s
C = 299792.458 * DAY / AU      # au a day
STEP = 0.0001                  # day, the arbiter's rates (compare.py's)
FIRST_JD = 2378497.0           # 1800-01-01 12:00 TT
TOTAL = 146097
J2000_MS = 946728000000        # 2000-01-01T12:00:00 as milliseconds from 1970
FRAMES = ['ecliptic-true-of-date', 'ecliptic-mean-of-date', 'ecliptic-j2000', 'ecliptic-icrs',
          'equatorial-true-of-date', 'equatorial-mean-of-date', 'equatorial-j2000', 'equatorial-icrs']
BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
POINTS = ['North Node', 'South Node']
CORRECTIONS = ['geometric', 'astrometric', 'apparent']
ARBITER = {'geometric': 'NONE', 'astrometric': 'LT', 'apparent': 'LTS'}
NAIF = {'Sun': '10', 'Moon': '301', 'Mercury': '199', 'Venus': '299', 'Mars': '4', 'Jupiter': '5',
        'Saturn': '6', 'Uranus': '7', 'Neptune': '8', 'Pluto': '9'}
# The gates of ../PLAN.md, fixed before the first run.
ORACLE_GATE_ARCSEC = 0.01
HORIZONS_GATE_ARCSEC = 0.05
STATISTICS = ['n', 'median', 'p95', 'max']

# --------------------------------------------------------------------------- the kernel

EARTH = ((0, 3), (3, 399))
SUN = ((0, 10),)
TARGETS = {  # each target's barycentric position as a chain of kernel segments, as conformance/arbiters/l1/validate.py
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


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 22), b''):
            digest.update(chunk)
    return digest.hexdigest()


class Kernel:
    """de440.bsp through jplephem: positions in au, velocities in au a day, rows of three."""

    def __init__(self, path):
        digest = sha256(path)
        if digest != KERNEL_SHA256:
            raise SystemExit(f'{path}: sha256 {digest}, expected {KERNEL_SHA256}')
        self.bytes = os.path.getsize(path)
        self.spk = SPK.open(path)

    def position(self, chain, t2):
        return sum(self.spk[a, b].compute(MJD0, t2) for a, b in chain).T / AU

    def state(self, chain, t2):
        pv = [self.spk[a, b].compute_and_differentiate(MJD0, t2) for a, b in chain]
        return sum(p for p, _ in pv).T / AU, sum(v for _, v in pv).T / AU


def norm(v):
    return np.sqrt(np.einsum('ni,ni->n', v, v))


def tdb(jd):
    """TDB as days from MJD0 for TT Julian dates, at the geocentre (erfa.dtdb, as validate.py)."""
    d2 = jd - MJD0
    return d2 + erfa.dtdb(MJD0, d2, 0.0, 0.0, 0.0, 0.0) / DAY


def geocentric(kernel, body, jd, deflection=False):
    """The three vectors Horizons's VEC_CORR gives, formed from the kernel at TT Julian dates jd:
    NONE (geometric), LT (the target where its light left, by iteration) and LTS (the LT direction with
    the stellar aberration of the geocentre's barycentric velocity, erfa.ab; its length the light path).
    NONE comes with the geometric velocity. With deflection, also the apparent direction with the Sun's
    light deflection applied before the aberration (erfa.ld, as validate.py), a unit vector."""
    t = tdb(jd)
    earth, earth_v = kernel.state(EARTH, t)
    target, target_v = kernel.state(TARGETS[body], t)
    out = {'NONE': target - earth, 'NONE_V': target_v - earth_v}
    tau = np.zeros_like(jd)
    for _ in range(20):
        emitted = kernel.position(TARGETS[body], t - tau)
        new_tau = norm(emitted - earth) / C
        change = float(np.max(np.abs(new_tau - tau)))
        tau = new_tau
        if change < 1e-14:
            break
    else:
        raise SystemExit(f'{body}: light-time did not converge')
    emitted = kernel.position(TARGETS[body], t - tau)
    lt = emitted - earth
    length = norm(lt)
    p = lt / length[:, None]
    sun_now = kernel.position(SUN, t)
    v = earth_v / C
    s = norm(earth - sun_now)
    bm1 = np.sqrt(1.0 - np.einsum('ni,ni->n', v, v))
    out['LT'] = lt
    out['LTS'] = erfa.ab(p, v, s, bm1) * length[:, None]
    if deflection:
        bent = p
        if body != 'Sun':
            # The Sun where the light passed closest to it, between emission and reception.
            back = np.clip(np.einsum('ni,ni->n', sun_now - earth, p) / C, 0.0, tau)
            sun = kernel.position(SUN, t - back)
            q = emitted - sun
            q = q / norm(q)[:, None]
            e = earth - sun
            em = norm(e)
            e = e / em[:, None]
            bent = erfa.ld(1.0, p, q, e, em, 1e-6 / np.maximum(em * em, 1.0))
        out['APPARENT'] = erfa.ab(bent, v, s, bm1)
    return out

# --------------------------------------------------------------------------- frames (ERFA, IAU 2006/2000A)


EPS0 = erfa.obl06(2451545.0, 0.0)
RB = erfa.bp06(2451545.0, 0.0)[0]
IDENTITY = np.identity(3)


def rx(angle):
    return erfa.rx(angle, np.broadcast_to(IDENTITY, np.shape(angle) + (3, 3)).copy())


def frame_matrices(jd):
    """compare.py's frame_matrix for every frame, at each of the TT Julian dates jd."""
    d2 = jd - MJD0
    n = jd.shape[0]
    pmat = erfa.pmat06(MJD0, d2)
    pnm = erfa.pnm06a(MJD0, d2)
    obl = erfa.obl06(MJD0, d2)
    deps = erfa.nut06a(MJD0, d2)[1]
    fixed = lambda m: np.broadcast_to(m, (n, 3, 3))
    return {
        'equatorial-icrs': fixed(IDENTITY),
        'equatorial-j2000': fixed(RB),
        'ecliptic-icrs': fixed(erfa.rx(EPS0, IDENTITY.copy())),
        'ecliptic-j2000': fixed(erfa.rx(EPS0, IDENTITY.copy()) @ RB),
        'equatorial-mean-of-date': pmat,
        'equatorial-true-of-date': pnm,
        'ecliptic-mean-of-date': rx(obl) @ pmat,
        'ecliptic-true-of-date': rx(obl + deps) @ pnm,
    }


def turn(m, v):
    return np.einsum('nij,nj->ni', m, v)


def spherical(v):
    """Longitude (degrees, [0, 360)), latitude (degrees) and length."""
    r = norm(v)
    return np.degrees(np.arctan2(v[:, 1], v[:, 0])) % 360.0, np.degrees(np.arcsin(v[:, 2] / r)), r


def unit(lon, lat):
    lon, lat = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=1)


def angle(a, b):
    """Angle between two vectors, arcseconds."""
    return np.arctan2(norm(np.cross(a, b)), np.einsum('ni,ni->n', a, b)) * AS


def wrap(d):
    return (d + 180.0) % 360.0 - 180.0


def node_of_state(ecliptic_of_date, r, v):
    """compare.py's node_of_state: the ascending node of the osculating geocentric orbit in the IAU
    2006/2000A true ecliptic of date, degrees, from the Moon's geometric position and velocity in the ICRF."""
    h = np.cross(turn(ecliptic_of_date, r), turn(ecliptic_of_date, v))
    return np.degrees(np.arctan2(h[:, 0], -h[:, 1])) % 360.0

# --------------------------------------------------------------------------- statistics


def stats(values, jd=None):
    """[n, median, 95th percentile (numpy, linear), maximum], and with jd the date of the maximum."""
    worst = int(np.argmax(values))
    out = [int(values.size), float(np.median(values)), float(np.percentile(values, 95)), float(values[worst])]
    return out if jd is None else {'stats': out, 'maxAtJdTt': float(jd[worst])}


def up2(value):
    """Rounded up to two significant figures (compare.py's)."""
    if value <= 0:
        return 0.0
    exponent = math.floor(math.log10(value)) - 1
    return float(f'{math.ceil(value / 10 ** exponent - 1e-9) * 10 ** exponent:.12g}')


def six(value):
    """Statistics to six significant figures, as compare.py's trim; dates are left alone."""
    if isinstance(value, float):
        return float(f'{value:.6g}')
    if isinstance(value, dict):
        return {k: (v if k in ('maxAtJdTt', 'firstJdTt', 'lastJdTt', 'jdTt', 'gateArcsec') else six(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [six(v) for v in value]
    return value


def software():
    return {'python': platform.python_version(), 'numpy': np.__version__, 'pyerfa': erfa.__version__,
            'erfa': erfa.version.erfa_version, 'jplephem': jplephem.__version__}

# --------------------------------------------------------------------------- the self-checks


def horizons_rows(correction, naif):
    """Horizons's committed geocentric vectors (../../calc-api/horizons/), by TT Julian date to 6 decimals."""
    rows = {}
    for name in (f'geo-{correction}-{naif}.txt', f'geo-{correction}-{naif}.2.txt'):
        path = os.path.join(CALC_API, 'horizons', name)
        if not os.path.exists(path):
            continue
        text = open(path, encoding='utf-8').read()
        for line in text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip().splitlines():
            cells = [c.strip() for c in line.split(',')]
            rows[round(float(cells[0]), 6)] = np.array([float(c) for c in cells[2:5]])
    return rows


def selfcheck(kernel_path, out_path):
    """S1 and S2 of ../PLAN.md: is the arbiter formed here the one the repository already trusts?"""
    kernel = Kernel(kernel_path)
    for name, digest in ORACLE_SHA256.items():
        if sha256(os.path.join(ORACLES, name)) != digest:
            raise SystemExit(f'{name} is not the committed oracle')

    # S1: the full apparent place (deflection, aberration, IAU 2006/2000A true ecliptic of date) and the
    # osculating node against the ERFA chain's, at its 200 instants.
    places = json.load(open(os.path.join(ORACLES, 'erfa-places.json')))['rows']
    s1 = {}
    for body in BODIES:
        rows = [row for row in places if row['body'] == body]
        jd = np.array([2451545.0 + (row['ttMs'] - J2000_MS) / 86400000.0 for row in rows])
        apparent = geocentric(kernel, body, jd, deflection=True)['APPARENT']
        lon, lat, _ = spherical(turn(frame_matrices(jd)['ecliptic-true-of-date'], apparent))
        reference = unit(np.array([float(row['lon']) for row in rows]), np.array([float(row['lat']) for row in rows]))
        s1[body] = {'n': len(rows), 'maxArcsec': float(np.max(angle(unit(lon, lat), reference)))}
    nodes = json.load(open(os.path.join(ORACLES, 'erfa-nodes.json')))['rows']
    jd = np.array([2451545.0 + (row['ttMs'] - J2000_MS) / 86400000.0 for row in nodes])
    moon = geocentric(kernel, 'Moon', jd)
    node = node_of_state(frame_matrices(jd)['ecliptic-true-of-date'], moon['NONE'], moon['NONE_V'])
    s1['North Node'] = {'n': len(nodes), 'maxArcsec': float(np.max(np.abs(wrap(node - np.array([float(row['northNodeLon']) for row in nodes])))) * 3600)}

    # S2: the three vectors formed here against Horizons's (DE441) at the 32 instants of the preregistered corpus.
    phi = (math.sqrt(5) - 1) / 2
    instants = np.array([round(2378496.5 + 146097 * ((0.5 + k * phi) % 1.0), 6) for k in range(32)])
    s2 = {}
    for body in BODIES:
        mine = geocentric(kernel, body, instants)
        s2[body] = {}
        for correction in ('NONE', 'LT', 'LTS'):
            rows = horizons_rows(correction, NAIF[body])
            theirs = np.array([rows[round(float(jd), 6)] for jd in instants])
            s2[body][correction] = {'n': int(instants.size), 'maxArcsec': float(np.max(angle(mine[correction], theirs))),
                                    'maxRelativeDistance': float(np.max(np.abs(norm(mine[correction]) - norm(theirs)) / norm(theirs)))}

    worst1 = max(entry['maxArcsec'] for entry in s1.values())
    worst2 = max(entry['maxArcsec'] for by in s2.values() for entry in by.values())
    result = six({
        'kernel': {'file': 'de440.bsp', 'url': KERNEL_URL, 'sha256': KERNEL_SHA256, 'bytes': kernel.bytes},
        'software': software(),
        'S1': {'what': 'apparent places with deflection, and the osculating node, formed here from the kernel, against the '
                       'ERFA chain\'s oracles (docs/evidence/de440-20261110/oracles/), angle between directions; the node as a longitude difference',
               'gateArcsec': ORACLE_GATE_ARCSEC, 'maxArcsec': worst1, 'verdict': 'PASS' if worst1 <= ORACLE_GATE_ARCSEC else 'FAIL', 'byBody': s1},
        'S2': {'what': 'geocentric ICRF vectors formed here from the kernel (DE440) against Horizons\'s committed vectors (DE441, '
                       'docs/evidence/calc-api/horizons/) at the 32 instants of docs/evidence/calc-api/PREREGISTRATION.md',
               'gateArcsec': HORIZONS_GATE_ARCSEC, 'maxArcsec': worst2, 'verdict': 'PASS' if worst2 <= HORIZONS_GATE_ARCSEC else 'FAIL', 'byBody': s2},
    })
    with open(out_path, 'w') as f:
        f.write(json.dumps(result, indent=1) + '\n')
    print(json.dumps(result, indent=1))
    if result['S1']['verdict'] != 'PASS' or result['S2']['verdict'] != 'PASS':
        raise SystemExit('a self-check failed: the sweep does not run on an arbiter that fails its gates')

# --------------------------------------------------------------------------- one era


def arbiter_coordinates(kernel, body, jd, matrices, which):
    """(lon, lat, dist) of the arbiter vector `which` in every frame."""
    vectors = geocentric(kernel, body, jd)
    return {name: {frame: spherical(turn(matrices[frame], vectors[name])) for frame in FRAMES} for name in which}


def shard(kernel_path, engine_path, out_path):
    kernel = Kernel(kernel_path)
    meta = json.load(open(engine_path + '.json'))
    if meta['frames'] != FRAMES:
        raise SystemExit('the engine was run on other frames')
    expected = [{'correction': c, 'body': b} for c in CORRECTIONS for b in BODIES] + [{'correction': 'apparent', 'body': b} for b in POINTS]
    if meta['cases'] != expected:
        raise SystemExit('the engine was run on other cases')
    if sha256(engine_path) != meta['valuesSha256']:
        raise SystemExit('the engine values are not the ones the engine wrote')
    n = meta['count']
    jd = FIRST_JD + meta['startIndex'] + np.arange(n, dtype=float)
    if jd[0] != meta['firstJdTt']:
        raise SystemExit('the instants do not start where the engine started')
    values = np.fromfile(engine_path, dtype='<f8').reshape(len(expected), len(FRAMES), n, 5)
    here, before, after = frame_matrices(jd), frame_matrices(jd - STEP), frame_matrices(jd + STEP)

    cases, moon_state = [], None
    for body in BODIES:
        names = ['NONE', 'LT', 'LTS']
        vectors = geocentric(kernel, body, jd, deflection=True)
        earlier, later = geocentric(kernel, body, jd - STEP), geocentric(kernel, body, jd + STEP)
        if body == 'Moon':
            moon_state = (vectors['NONE'], vectors['NONE_V'])
        for correction in CORRECTIONS:
            engine = values[expected.index({'correction': correction, 'body': body})]
            # The engine's apparent Moon is its series at the instant: compared with LT+S (the bound's
            # arbiter) and with NONE, as compare.py does.
            for which in ([ARBITER[correction], 'NONE'] if (body, correction) == ('Moon', 'apparent') else [ARBITER[correction]]):
                frames = []
                for f, frame in enumerate(FRAMES):
                    lon, lat, r = spherical(turn(here[frame], vectors[which]))
                    lon0, lat0, _ = spherical(turn(before[frame], earlier[which]))
                    lon1, lat1, _ = spherical(turn(after[frame], later[which]))
                    e_lon, e_lat, e_dist, e_lon_rate, e_lat_rate = (engine[f, :, k] for k in range(5))
                    cos = np.cos(np.radians(lat))
                    difference = np.abs(wrap(e_lon - lon)) * 3600
                    entry = {'frame': frame,
                             'position': stats(angle(unit(e_lon, e_lat), unit(lon, lat)), jd),
                             'lon': stats(difference, jd),
                             'lonCosLat': stats(difference * cos),
                             'lat': stats(np.abs(e_lat - lat) * 3600),
                             'distance': stats(np.abs(e_dist - r) / r),
                             'speed': stats(np.hypot((e_lon_rate - wrap(lon1 - lon0) / (2 * STEP)) * cos,
                                                     e_lat_rate - (lat1 - lat0) / (2 * STEP)) * 3600)}
                    frames.append(entry)
                case = {'correction': correction, 'body': body, 'arbiter': which, 'frames': frames}
                if correction == 'apparent' and which == 'LTS':
                    # Not part of the bounds rule: the same place with the Sun's light deflection, which
                    # the engine's apparent leaves out, in the true ecliptic of date.
                    lon, lat, _ = spherical(turn(here['ecliptic-true-of-date'], vectors['APPARENT']))
                    case['withDeflection'] = {'frame': 'ecliptic-true-of-date',
                                              'position': stats(angle(unit(engine[0, :, 0], engine[0, :, 1]), unit(lon, lat)), jd),
                                              'lon': stats(np.abs(wrap(engine[0, :, 0] - lon)) * 3600, jd)}
                cases.append(case)

    ecliptic = here['ecliptic-true-of-date']
    node = node_of_state(ecliptic, *moon_state)
    for body in POINTS:
        engine = values[expected.index({'correction': 'apparent', 'body': body})]
        lon = (node + 180.0) % 360.0 if body == 'South Node' else node
        of_date = unit(lon, np.zeros(n))
        frames = []
        for f, frame in enumerate(FRAMES):
            reference = turn(here[frame], np.einsum('nji,nj->ni', ecliptic, of_date))
            entry = {'frame': frame, 'position': stats(angle(unit(engine[f, :, 0], engine[f, :, 1]), reference), jd)}
            if frame == 'ecliptic-true-of-date':
                entry['lon'] = stats(np.abs(wrap(engine[f, :, 0] - lon)) * 3600, jd)
            frames.append(entry)
        cases.append({'correction': 'apparent', 'body': body, 'arbiter': 'osculating node of the kernel\'s geometric Moon', 'frames': frames})

    result = six({
        'era': {'fromYear': meta['fromYear'], 'toYear': meta['toYear'], 'firstJdTt': float(jd[0]), 'lastJdTt': float(jd[-1]), 'n': n,
                'startIndex': meta['startIndex']},
        'engine': meta['engine'], 'distSha256': meta['distSha256'], 'node': meta['node'], 'engineValuesSha256': meta['valuesSha256'],
        'kernel': {'file': 'de440.bsp', 'url': KERNEL_URL, 'sha256': KERNEL_SHA256, 'bytes': kernel.bytes},
        'software': software(),
        'statistics': STATISTICS,
        'cases': cases,
    })
    with open(out_path, 'w') as f:
        f.write(json.dumps(result, separators=(',', ':')) + '\n')
    print(f"era {meta['fromYear']} to {meta['toYear']}: {n} instants, JD {jd[0]} to {jd[-1]} TT")
    print(table(maxima_by_frame([result]), 'largest angular difference, arcseconds, apparent'))

# --------------------------------------------------------------------------- all eras


def worst(entries):
    """The entry with the largest maximum among {'stats', 'maxAtJdTt'} entries, as [n, max, date]."""
    top = max(entries, key=lambda entry: entry['stats'][3])
    return {'n': sum(entry['stats'][0] for entry in entries), 'max': top['stats'][3], 'maxAtJdTt': top['maxAtJdTt']}


def case_key(case):
    return (case['correction'], case['body'], case['arbiter'])


def maxima_by_frame(shards, correction='apparent'):
    """body -> frame -> largest position difference, the bound's arbiter only."""
    out = {}
    for doc in shards:
        for case in doc['cases']:
            if case['correction'] != correction or (case['body'] == 'Moon' and correction == 'apparent' and case['arbiter'] == 'NONE'):
                continue
            row = out.setdefault(case['body'], {})
            for entry in case['frames']:
                row[entry['frame']] = max(row.get(entry['frame'], 0.0), entry['position']['stats'][3])
    return out


SHORT = {'ecliptic-true-of-date': 'ecl true', 'ecliptic-mean-of-date': 'ecl mean', 'ecliptic-j2000': 'ecl J2000',
         'ecliptic-icrs': 'ecl ICRS', 'equatorial-true-of-date': 'equ true', 'equatorial-mean-of-date': 'equ mean',
         'equatorial-j2000': 'equ J2000', 'equatorial-icrs': 'equ ICRS'}


def table(by_body, title):
    lines = [title, f"{'body':<11}" + ''.join(f'{SHORT[frame]:>11}' for frame in FRAMES) + f"{'all':>11}"]
    for body, row in by_body.items():
        lines.append(f'{body:<11}' + ''.join(f'{row[frame]:>11.3f}' for frame in FRAMES) + f'{max(row.values()):>11.3f}')
    return '\n'.join(lines)


def dumps(summary):
    """One top-level field a line, one case a line (compare.py's layout)."""
    compact = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False)
    lines = []
    for key, value in summary.items():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            lines.append(f'{json.dumps(key)}: [\n' + ',\n'.join('  ' + compact(v) for v in value) + '\n ]')
        elif isinstance(value, dict) and key in ('bounds', 'selfChecks', 'longitudes'):
            lines.append(f'{json.dumps(key)}: {{\n' + ',\n'.join(f'  {json.dumps(k)}: {compact(v)}' for k, v in value.items()) + '\n }')
        else:
            lines.append(f'{json.dumps(key)}: {compact(value)}')
    return '{\n ' + ',\n '.join(lines) + '\n}\n'


def merge(out_dir, selfcheck_path, shard_paths):
    shards = sorted((json.load(open(path)) for path in shard_paths), key=lambda doc: doc['era']['startIndex'])
    first = shards[0]
    at = 0
    for doc in shards:
        if doc['era']['startIndex'] != at:
            raise SystemExit('the eras do not join')
        at += doc['era']['n']
        for field in ('engine', 'distSha256', 'kernel', 'software', 'node'):
            if doc[field] != first[field]:
                raise SystemExit(f'the eras were not run on one {field}')
    if at != TOTAL:
        raise SystemExit(f'{at} instants, not {TOTAL}')
    instants = [FIRST_JD + i for i in range(TOTAL)]

    cases = []
    for index, case in enumerate(first['cases']):
        parts = [doc['cases'][index] for doc in shards]
        if any(case_key(part) != case_key(case) for part in parts):
            raise SystemExit('the eras do not hold the same cases')
        frames = []
        for f, frame in enumerate(FRAMES):
            entry = {'frame': frame}
            for metric in case['frames'][f]:
                if metric == 'frame':
                    continue
                values = [part['frames'][f][metric] for part in parts]
                if isinstance(values[0], dict):
                    entry[metric] = worst(values)
                else:
                    entry[metric] = {'n': sum(v[0] for v in values), 'max': max(v[3] for v in values)}
            frames.append(entry)
        merged = {'correction': case['correction'], 'body': case['body'], 'arbiter': case['arbiter'], 'frames': frames,
                  'eras': [{'fromYear': doc['era']['fromYear'], 'toYear': doc['era']['toYear'],
                            'position': [max(part['frames'][f]['position']['stats'][k] for f in range(len(FRAMES))) for k in (1, 2, 3)]}
                           for doc, part in zip(shards, parts)]}
        if 'withDeflection' in case:
            merged['withDeflection'] = {'frame': 'ecliptic-true-of-date',
                                        'position': worst([part['withDeflection']['position'] for part in parts]),
                                        'lon': worst([part['withDeflection']['lon'] for part in parts])}
        cases.append(merged)

    # The bounds rule of docs/evidence/calc-api/PREREGISTRATION.md: the largest over every instant and
    # frame, rounded up to two significant figures; the geocentric apparent Moon against LT+S only.
    bounds = {}
    for case in cases:
        if case['body'] == 'Moon' and case['correction'] == 'apparent' and case['arbiter'] == 'NONE':
            continue
        top = lambda metric: max((f[metric]['max'] for f in case['frames'] if metric in f), default=None)
        row = [top('position'), top('distance'), top('speed')]
        bounds[f"geocentric/{case['correction']}/{case['body']}"] = [None if x is None else up2(x) for x in row]
    bounds = dict(sorted(bounds.items()))

    # The ecliptic longitude of date, apparent: what a zodiac position is.
    longitudes = {}
    for case in cases:
        if case['correction'] == 'apparent' and not (case['body'] == 'Moon' and case['arbiter'] == 'NONE'):
            entry = dict(case['frames'][0]['lon'])
            if 'withDeflection' in case:
                entry['withDeflection'] = case['withDeflection']['lon']
            longitudes[case['body']] = entry

    run = {key: os.environ.get(name) for key, name in (('repository', 'GITHUB_REPOSITORY'), ('workflow', 'GITHUB_WORKFLOW'),
                                                       ('runId', 'GITHUB_RUN_ID'), ('runAttempt', 'GITHUB_RUN_ATTEMPT'),
                                                       ('commit', 'SWEEP_COMMIT'), ('event', 'GITHUB_EVENT_NAME'))}
    summary = {
        'plan': 'docs/evidence/de440-sweep-20261111/PLAN.md',
        'engine': first['engine'],
        'build': {'distSha256': first['distSha256'], 'node': first['node'], 'commit': run['commit']},
        'arbiter': {'kernel': first['kernel'],
                    'reduction': 'geocentric ICRF vectors from the kernel through jplephem (geometric; light time by iteration; light time '
                                 'and the stellar aberration of erfa.ab), turned into each frame with ERFA\'s IAU 2006/2000A models as '
                                 'docs/evidence/calc-api/tools/compare.py does',
                    'software': first['software']},
        'run': run,
        'corpus': {'n': TOTAL, 'firstJdTt': instants[0], 'lastJdTt': instants[-1], 'step': '1 day',
                   'what': 'noon TT of every day from 1800-01-01 to 2199-12-31', 'center': 'geocentric',
                   'eras': [doc['era'] for doc in shards]},
        'instants': instants,
        'selfChecks': json.load(open(selfcheck_path)),
        'de440': cases,
        'longitudes': longitudes,
        'bounds': bounds,
        'statistics': {'frames': 'n, max and the TT Julian date of the max over all instants', 'eras': 'median, 95th percentile '
                       '(numpy, linear) and max of the era, each the largest of the eight frames\''},
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'summary.json'), 'w') as f:
        f.write(dumps(summary))
    with open(os.path.join(out_dir, 'tables.md'), 'w') as f:
        f.write(tables(summary))
    print(table(maxima_by_frame(shards), f'largest angular difference from DE440 over {TOTAL} instants, arcseconds, geocentric apparent'))
    print()
    print('ecliptic longitude of date, apparent, largest difference in arcseconds:')
    for body, entry in longitudes.items():
        print(f"{body:<11}{entry['max']:>9.3f}  at JD {entry['maxAtJdTt']} TT")
    print()
    print('bounds by the preregistered rule: ' + json.dumps(bounds))


def calendar(jd):
    y, m, d, _ = erfa.jd2cal(jd, 0.0)
    return f'{y:04d}-{m:02d}-{d:02d}'


def tables(summary):
    cases = summary['de440']
    corpus = summary['corpus']
    lines = ['# The dense DE440 sweep: tables', '',
             f"Written by `tools/sweep.py merge` from the eras' results. Engine {summary['engine']['name']} "
             f"{summary['engine']['version']} (commit `{summary['build']['commit']}`), against `de440.bsp` "
             f"(SHA-256 `{summary['arbiter']['kernel']['sha256']}`), at {corpus['n']:,} instants: {corpus['what']} "
             f"(JD {corpus['firstJdTt']} to {corpus['lastJdTt']} TT). Workflow run {summary['run']['runId']}, "
             f"attempt {summary['run']['runAttempt']}. All figures are arcseconds unless a column says otherwise, and "
             'are not rounded up; the bounds in `summary.json` are.', '']
    lines += ['## Ecliptic longitude of date, apparent', '',
              'The difference of the longitudes themselves (not times the cosine of the latitude), in the true '
              'ecliptic and equinox of date: what a zodiac position is.', '',
              '| body | largest difference | on (TT) | with light deflection in the reference |', '| --- | ---: | --- | ---: |']
    for body, entry in summary['longitudes'].items():
        bent = f"{entry['withDeflection']['max']:.3f}" if 'withDeflection' in entry else ''
        lines.append(f"| {body} | {entry['max']:.3f} | {calendar(entry['maxAtJdTt'])} | {bent} |")
    for correction in CORRECTIONS:
        lines += ['', f'## Largest angular difference by frame, {correction}', '',
                  '| body | arbiter | ' + ' | '.join(SHORT[frame] for frame in FRAMES) + ' | all frames | on (TT) |',
                  '| --- | --- | ' + ' | '.join('---:' for _ in FRAMES) + ' | ---: | --- |']
        for case in cases:
            if case['correction'] != correction:
                continue
            top = max(case['frames'], key=lambda f: f['position']['max'])['position']
            arbiter = case['arbiter'] if case['arbiter'] in ('NONE', 'LT', 'LTS') else 'node'
            lines.append(f"| {case['body']} | {arbiter} | " + ' | '.join(f"{f['position']['max']:.3f}" for f in case['frames'])
                         + f" | {top['max']:.3f} | {calendar(top['maxAtJdTt'])} |")
        lines += ['', f'## Distance and rate, {correction}', '',
                  '| body | arbiter | largest relative distance difference | largest angular-rate difference, arcseconds a day |',
                  '| --- | --- | ---: | ---: |']
        for case in cases:
            if case['correction'] != correction or 'distance' not in case['frames'][0]:
                continue
            lines.append(f"| {case['body']} | {case['arbiter']} | {max(f['distance']['max'] for f in case['frames']):.3g} | "
                         f"{max(f['speed']['max'] for f in case['frames']):.3g} |")
    eras = corpus['eras']
    lines += ['', '## By era, apparent', '',
              'Each cell: median / 95th percentile / largest angular difference of the era, each the largest of the eight frames\'.', '',
              '| body | ' + ' | '.join(f"{era['fromYear']} to {era['toYear'] - 1}" for era in eras) + ' |',
              '| --- | ' + ' | '.join('---:' for _ in eras) + ' |']
    for case in cases:
        if case['correction'] != 'apparent' or (case['body'] == 'Moon' and case['arbiter'] == 'NONE'):
            continue
        lines.append(f"| {case['body']} | " + ' | '.join(' / '.join(f'{x:.2f}' for x in era['position']) for era in case['eras']) + ' |')
    return '\n'.join(lines) + '\n'


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    if command == 'selfcheck' and len(sys.argv) == 4:
        selfcheck(sys.argv[2], sys.argv[3])
    elif command == 'shard' and len(sys.argv) == 5:
        shard(sys.argv[2], sys.argv[3], sys.argv[4])
    elif command == 'merge' and len(sys.argv) >= 5:
        merge(sys.argv[2], sys.argv[3], sys.argv[4:])
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
