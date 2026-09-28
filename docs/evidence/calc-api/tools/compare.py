#!/usr/bin/env python3
"""The comparison PREREGISTRATION.md fixes: the calc entry point against its
arbiters, NASA JPL Horizons (DE441, ICRF vectors, in ../horizons/) turned into
each frame with ERFA's IAU 2006/2000A models, and ERFA alone for the
frame-transform consistency checks.

    npm run build
    node docs/evidence/calc-api/tools/engine_values.mjs > engine.json
    python3 docs/evidence/calc-api/tools/compare.py engine.json

Writes ../results/summary.json (tools/report.py turns it into
../results/tables.md). Needs pyerfa and numpy; uses no code of the engine and
no Swiss Ephemeris.
"""
import hashlib
import json
import math
import os
import re
import sys

import erfa
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
HORIZONS = os.path.join(ROOT, 'horizons')
RESULTS = os.path.join(ROOT, 'results')
MJD0 = 2400000.5
AS = 180 * 3600 / math.pi  # arcseconds per radian
STEP = 0.0001
FRAMES = ['ecliptic-true-of-date', 'ecliptic-mean-of-date', 'ecliptic-j2000', 'ecliptic-icrs',
          'equatorial-true-of-date', 'equatorial-mean-of-date', 'equatorial-j2000', 'equatorial-icrs']
NAIF = {'Sun': '10', 'Moon': '301', 'Mercury': '199', 'Venus': '299', 'Earth': '399', 'Mars': '4',
        'Jupiter': '5', 'Saturn': '6', 'Uranus': '7', 'Neptune': '8', 'Pluto': '9'}
KIND = {'geo': 'geocentric', 'helio': 'heliocentric', 'bary': 'barycentric', 'topo1': 'topocentric',
        'topo2': 'topocentric'}
FILE_CORRECTION = {'geometric': 'NONE', 'astrometric': 'LT', 'apparent': 'LTS'}
OUTPUT_TYPE = {'NONE': 'GEOMETRIC cartesian states', 'LT': 'LT CORRECTED cartesian states',
               'LTS': 'LT+S CORRECTED cartesian states'}
CENTER_NAME = {'geo': ('Earth (399)', 'BODY CENTER'), 'helio': ('Sun (10)', 'BODY CENTER'),
               'bary': ('Solar System Barycenter (0)', 'BODY CENTER'),
               'topo1': ('Earth (399)', None), 'topo2': ('Earth (399)', None)}
SITES = {'topo1': (10.0, 45.0, 0.0), 'topo2': (-60.0, -35.0, 1.5)}
MEAN_LUNAR_INCLINATION = 5.1453964  # degrees, the engine's published constant (points.ts)

# --------------------------------------------------------------------------- Horizons


def banner(text, key):
    match = re.search(r'^' + re.escape(key) + r'\s*:\s*(.*?)\s*$', text, re.M)
    if not match:
        raise SystemExit(f'no "{key}" line')
    return match.group(1).split('{')[0].strip()


def horizons(center, correction, naif):
    """Rows of one request's VECTORS files (NAME.txt, and NAME.2.txt for the time-list entries Horizons
    dropped from the first), keyed by the TT Julian date to 6 decimals: position (and velocity)."""
    rows = {}
    for name in (f'{center}-{correction}-{naif}.txt', f'{center}-{correction}-{naif}.2.txt'):
        if os.path.exists(os.path.join(HORIZONS, name)):
            rows.update(vectors(name, center, correction, naif))
    return rows


def vectors(name, center, correction, naif):
    text = open(os.path.join(HORIZONS, name), encoding='utf-8').read()
    checks = [
        ('API VERSION', '1.2'),
        ('Output units', 'AU-D'),
        ('Output type', OUTPUT_TYPE[correction]),
        ('Reference frame', 'ICRF'),
        ('Center body name', CENTER_NAME[center][0]),
    ]
    if CENTER_NAME[center][1]:
        checks.append(('Center-site name', CENTER_NAME[center][1]))
    for key, value in checks:
        if banner(text, key) != value:
            raise SystemExit(f'{name}: banner "{key}" is {banner(text, key)!r}, expected {value!r}')
    if not banner(text, 'Target body name').endswith(f'({naif})'):
        raise SystemExit(f'{name}: target {banner(text, "Target body name")}')
    if 'source: DE441' not in re.search(r'^Target body name.*$', text, re.M).group(0):
        raise SystemExit(f'{name}: the target is not from DE441')
    if center in SITES:
        lon, lat, alt = SITES[center]
        geodetic = [float(x) for x in banner(text, 'Center geodetic').split(',')]
        if abs((geodetic[0] - lon) % 360.0) > 1e-9 or abs(geodetic[1] - lat) > 1e-9 or abs(geodetic[2] - alt) > 1e-9:
            raise SystemExit(f'{name}: site {geodetic}')
    rows = {}
    for line in text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip().splitlines():
        cells = [c.strip() for c in line.split(',')]
        values = [float(c) for c in cells[2:] if c]
        rows[round(float(cells[0]), 6)] = (np.array(values[:3]), np.array(values[3:6]) if len(values) >= 6 else None)
    return rows


MONTHS = {m: i + 1 for i, m in enumerate(('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'))}


def delta_t(instants):
    """Horizons's TDB - UT (seconds) at the corpus instants; its rows come in date order, by TT calendar date."""
    text = open(os.path.join(HORIZONS, 'deltat.txt'), encoding='utf-8').read()
    by_day = {}
    for line in text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip().splitlines():
        cells = [c.strip() for c in line.split(',') if c.strip()]
        y, mon, d, h, mi, sec = re.fullmatch(r'(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}\.\d{3})', cells[0]).groups()
        jd = sum(erfa.dtf2d('TT', int(y), MONTHS[mon], int(d), int(h), int(mi), float(sec)))
        by_day[round(jd, 6)] = float(cells[-1])
    return [by_day[jd] for jd in instants]

# --------------------------------------------------------------------------- frames (ERFA, IAU 2006/2000A)


def rx(angle):
    return erfa.rx(angle, np.identity(3))


EPS0 = erfa.obl06(2451545.0, 0.0)
RB = erfa.bp06(2451545.0, 0.0)[0]


def frame_matrix(frame, jd):
    d1, d2 = MJD0, jd - MJD0
    if frame == 'equatorial-icrs':
        return np.identity(3)
    if frame == 'equatorial-j2000':
        return RB
    if frame == 'ecliptic-icrs':
        return rx(EPS0)
    if frame == 'ecliptic-j2000':
        return rx(EPS0) @ RB
    if frame == 'equatorial-mean-of-date':
        return erfa.pmat06(d1, d2)
    if frame == 'equatorial-true-of-date':
        return erfa.pnm06a(d1, d2)
    if frame == 'ecliptic-mean-of-date':
        return rx(erfa.obl06(d1, d2)) @ erfa.pmat06(d1, d2)
    if frame == 'ecliptic-true-of-date':
        return rx(erfa.obl06(d1, d2) + erfa.nut06a(d1, d2)[1]) @ erfa.pnm06a(d1, d2)
    raise ValueError(frame)


def spherical(v):
    """Longitude (degrees, [0, 360)), latitude (degrees) and length."""
    r = float(np.linalg.norm(v))
    return math.degrees(math.atan2(v[1], v[0])) % 360.0, math.degrees(math.asin(v[2] / r)), r


def unit(lon, lat):
    lon, lat = math.radians(lon), math.radians(lat)
    return np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])


def angle(a, b):
    """Angle between two vectors, arcseconds."""
    return math.atan2(float(np.linalg.norm(np.cross(a, b))), float(np.dot(a, b))) * AS


def wrap(d):
    return (d + 180.0) % 360.0 - 180.0


def rates(r, v):
    """Longitude and latitude rates (degrees a day) and distance rate from a position and velocity."""
    x, y, z = r
    vx, vy, vz = v
    plane = x * x + y * y
    square = plane + z * z
    return (math.degrees((x * vy - y * vx) / plane),
            math.degrees((vz * plane - z * (x * vx + y * vy)) / (square * math.sqrt(plane))),
            float(np.dot(r, v)) / math.sqrt(square))


def arbiter(rows, frame, jd):
    """The arbiter at jd in frame: (lon, lat, dist) and (lon rate, lat rate, dist rate)."""
    here = rows[round(jd, 6)]
    m = frame_matrix(frame, jd)
    lon, lat, r = spherical(m @ here[0])
    before, after = rows.get(round(jd - STEP, 6)), rows.get(round(jd + STEP, 6))
    if before is not None and after is not None:
        lon0, lat0, r0 = spherical(frame_matrix(frame, jd - STEP) @ before[0])
        lon1, lat1, r1 = spherical(frame_matrix(frame, jd + STEP) @ after[0])
        return (lon, lat, r), (wrap(lon1 - lon0) / (2 * STEP), (lat1 - lat0) / (2 * STEP), (r1 - r0) / (2 * STEP))
    if here[1] is None:
        return (lon, lat, r), None
    rate = (frame_matrix(frame, jd + STEP) - frame_matrix(frame, jd - STEP)) / (2 * STEP)
    return (lon, lat, r), rates(m @ here[0], m @ here[1] + rate @ here[0])

# --------------------------------------------------------------------------- statistics


STATISTICS = ['n', 'median', 'p95', 'max']


def stats(values):
    """[n, median, 95th percentile (numpy, linear), maximum]."""
    values = np.array(values, dtype=float)
    return [int(values.size), float(np.median(values)), float(np.percentile(values, 95)), float(values.max())]


def up2(value):
    """Rounded up to two significant figures."""
    if value <= 0:
        return 0.0
    exponent = math.floor(math.log10(value)) - 1
    return float(f'{math.ceil(value / 10 ** exponent - 1e-9) * 10 ** exponent:.12g}')


RAW = {}  # (center kind, correction, body, frame) -> metric -> values, for the pooled statistics


def keep(key, name, values):
    RAW.setdefault(key, {}).setdefault(name, []).extend(values)


def compare_case(case, rows, instants, pool=True):
    """Engine against arbiter for one case, every frame."""
    out = []
    for frame in FRAMES:
        pos, dlon, dlat, ddist, dspeed, drate = [], [], [], [], [], []
        for k, jd in enumerate(instants):
            engine = case['frames'][frame][k]
            (lon, lat, r), rate = arbiter(rows, frame, jd)
            pos.append(angle(unit(engine['lon'], engine['lat']), unit(lon, lat)))
            dlon.append(abs(wrap(engine['lon'] - lon)) * math.cos(math.radians(lat)) * 3600)
            dlat.append(abs(engine['lat'] - lat) * 3600)
            if engine['dist'] is not None:
                ddist.append(abs(engine['dist'] - r) / r)
            speeds = engine['speeds']
            if rate is not None and speeds is not None:
                cos = math.cos(math.radians(lat))
                dspeed.append(math.hypot((speeds['lon'] - rate[0]) * cos, speeds['lat'] - rate[1]) * 3600)
                if speeds['dist'] is not None:
                    drate.append(abs(speeds['dist'] - rate[2]) / r)
        if pool:
            key = (KIND[case['center']], case['correction'], case['body'], frame)
            for name, values in (('position', pos), ('distance', ddist), ('speed', dspeed)):
                keep(key, name, values)
        entry = {'frame': frame, 'position': stats(pos), 'lonCosLat': stats(dlon), 'lat': stats(dlat)}
        if ddist:
            entry['distance'] = stats(ddist)
        if dspeed:
            entry['speed'] = stats(dspeed)
        if drate:
            entry['distanceRatePerDistance'] = stats(drate)
        out.append(entry)
    return out

# --------------------------------------------------------------------------- the lunar points


def node_of_state(r, v, jd):
    """Ascending node of the osculating geocentric orbit in the IAU 2006/2000A true ecliptic of date, degrees."""
    m = frame_matrix('ecliptic-true-of-date', jd)
    h = np.cross(m @ r, m @ v)
    return math.degrees(math.atan2(h[0], -h[1])) % 360.0


def mean_points(jd):
    """The mean node and the mean apogee (lon, lat), true equinox of date, from ERFA's fundamental arguments."""
    t = (jd - 2451545.0) / 36525.0
    dpsi = erfa.nut06a(MJD0, jd - MJD0)[0]
    node = erfa.faom03(t)
    u = erfa.faf03(t) - erfa.fal03(t) + math.pi
    i = math.radians(MEAN_LUNAR_INCLINATION)
    apogee_lon = node + math.atan2(math.cos(i) * math.sin(u), math.cos(u)) + dpsi
    return (math.degrees(node + dpsi) % 360.0,
            (math.degrees(apogee_lon) % 360.0, math.degrees(math.asin(math.sin(i) * math.sin(u)))))


def point_reference(body, jd, moon_rows):
    """The arbiter's direction for a lunar point, in the true ecliptic of date, as (lon, lat)."""
    if body in ('North Node', 'South Node'):
        r, v = moon_rows[round(jd, 6)]
        lon = node_of_state(r, v, jd)
        return ((lon + 180.0) % 360.0 if body == 'South Node' else lon), 0.0
    node, apogee = mean_points(jd)
    if body == 'Mean Node':
        return node, 0.0
    if body == 'Mean South Node':
        return (node + 180.0) % 360.0, 0.0
    return apogee


def compare_point(case, instants, moon_rows):
    out = []
    for frame in FRAMES:
        pos, speed = [], []
        for k, jd in enumerate(instants):
            engine = case['frames'][frame][k]
            lon, lat = point_reference(case['body'], jd, moon_rows)
            ecliptic = frame_matrix('ecliptic-true-of-date', jd)
            reference = frame_matrix(frame, jd) @ ecliptic.T @ unit(lon, lat)
            pos.append(angle(unit(engine['lon'], engine['lat']), reference))
            if case['body'] not in ('North Node', 'South Node') and frame == 'ecliptic-true-of-date':
                lon0, lat0 = point_reference(case['body'], jd - STEP, moon_rows)
                lon1, lat1 = point_reference(case['body'], jd + STEP, moon_rows)
                cos = math.cos(math.radians(lat))
                speed.append(math.hypot((engine['speeds']['lon'] - wrap(lon1 - lon0) / (2 * STEP)) * cos,
                                        engine['speeds']['lat'] - (lat1 - lat0) / (2 * STEP)) * 3600)
        entry = {'frame': frame, 'position': stats(pos)}
        if speed:
            entry['speed'] = stats(speed)
        out.append(entry)
    return out

# --------------------------------------------------------------------------- consistency checks


def consistency(data):
    """C1 to C10 of PREREGISTRATION.md: the engine's frames against ERFA's turns of its own output."""
    instants, tilts = data['instants'], data['tilts']
    bodies = [c for c in data['cases'] if c['center'] == 'geo' and c['correction'] == 'apparent' and c['body'] in NAIF]
    node = next(c for c in data['cases'] if c['body'] == 'North Node')
    direction = lambda row: unit(row['lon'], row['lat'])
    checks = {name: [] for name in ('C1', 'C1dist', 'C2', 'C3', 'C4', 'C5a', 'C5b', 'C6', 'C7', 'C8', 'C9', 'C10')}
    for case in bodies:
        f = case['frames']
        for k in range(len(instants)):
            jd_tt = f['equatorial-j2000'][k]['jdTt']
            d1, d2 = MJD0, jd_tt - MJD0
            dpsi, deps = erfa.nut06a(d1, d2)
            obl = erfa.obl06(d1, d2)
            rb, rp, _ = erfa.bp06(d1, d2)
            for frame in FRAMES:
                row = f[frame][k]
                xyz = np.array(row['xyz'])
                checks['C1'].append(angle(xyz, direction(row)))
                checks['C1dist'].append(abs(float(np.linalg.norm(xyz)) - row['dist']) / row['dist'])
            j2000 = direction(f['equatorial-j2000'][k])
            checks['C2'].append(angle(direction(f['equatorial-icrs'][k]), rb.T @ j2000))
            checks['C3'].append(angle(direction(f['equatorial-mean-of-date'][k]), rp @ j2000))
            checks['C4'].append(angle(direction(f['equatorial-true-of-date'][k]),
                                      erfa.numat(obl, dpsi, deps) @ direction(f['equatorial-mean-of-date'][k])))
            true_ecliptic = direction(f['ecliptic-true-of-date'][k])
            checks['C5a'].append(angle(direction(f['equatorial-true-of-date'][k]), rx(obl + deps).T @ true_ecliptic))
            checks['C5b'].append(angle(direction(f['equatorial-true-of-date'][k]),
                                       rx(math.radians(tilts[k]['tobl'])).T @ true_ecliptic))
            checks['C6'].append(angle(direction(f['equatorial-mean-of-date'][k]),
                                      rx(obl).T @ direction(f['ecliptic-mean-of-date'][k])))
            checks['C7'].append(angle(j2000, rx(EPS0).T @ direction(f['ecliptic-j2000'][k])))
            checks['C8'].append(angle(direction(f['equatorial-icrs'][k]), rx(EPS0).T @ direction(f['ecliptic-icrs'][k])))
            checks['C9'].append(angle(direction(f['equatorial-true-of-date'][k]), erfa.pnm06a(d1, d2) @ rb.T @ j2000))
    for k in range(len(instants)):
        row = node['frames']['equatorial-true-of-date'][k]
        d1, d2 = MJD0, row['jdTt'] - MJD0
        obl, deps = erfa.obl06(d1, d2), erfa.nut06a(d1, d2)[1]
        ecliptic = node['frames']['ecliptic-true-of-date'][k]
        checks['C10'].append(angle(direction(row), rx(obl + deps).T @ direction(ecliptic)))
    tolerance = {'C1': 1e-6, 'C1dist': 1e-12, 'C2': 1e-5, 'C3': 1e-4, 'C4': 5e-3, 'C5a': 5e-3, 'C5b': 1e-6,
                 'C6': 1e-6, 'C7': 1e-6, 'C8': 1e-6, 'C9': 5e-3, 'C10': 5e-3}
    return [{'check': name, 'unit': 'relative' if name == 'C1dist' else 'arcsec', 'tolerance': tolerance[name],
             'n': len(values), 'median': float(np.median(values)), 'max': float(max(values)),
             'verdict': 'PASS' if max(values) <= tolerance[name] else 'FAIL'}
            for name, values in checks.items()]

# --------------------------------------------------------------------------- main


def dumps(summary):
    """One top-level field per line, and one element per line for the long lists."""
    compact = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False)
    lines = []
    for key, value in summary.items():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            body = ',\n'.join('  ' + compact(v) for v in value)
            lines.append(f'{json.dumps(key)}: [\n{body}\n ]')
        elif isinstance(value, dict) and key in ('pooled', 'bounds', 'inputs'):
            inner = []
            for k, v in value.items():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    inner.append(f'  {json.dumps(k)}: [\n' + ',\n'.join('   ' + compact(x) for x in v) + '\n  ]')
                else:
                    inner.append(f'  {json.dumps(k)}: {compact(v)}')
            lines.append(f'{json.dumps(key)}: {{\n' + ',\n'.join(inner) + '\n }')
        else:
            lines.append(f'{json.dumps(key)}: {compact(value)}')
    return '{\n ' + ',\n '.join(lines) + '\n}\n'


def trim(value):
    """Statistics to six significant figures; the bounds are already rounded up and are left alone."""
    if isinstance(value, float):
        return float(f'{value:.6g}')
    if isinstance(value, dict):
        return {k: (v if k in ('bounds', 'instants', 'tolerance', 'statistics') else trim(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [trim(v) for v in value]
    return value


def main():
    data = json.load(open(sys.argv[1]))
    phi = (math.sqrt(5) - 1) / 2
    instants = [round(2378496.5 + 146097 * ((0.5 + k * phi) % 1.0), 6) for k in range(32)]
    if data['instants'] != instants:
        raise SystemExit('the engine was run on other instants')
    if [round(x, 4) for x in data['horizonsDeltaT']] != [round(x, 4) for x in delta_t(instants)]:
        raise SystemExit('the topocentric ΔT pins are not Horizons\'s')
    results, bounds = [], {}
    for case in data['cases']:
        body, center, correction = case['body'], case['center'], case['correction']
        if body in ('North Node', 'South Node', 'Mean Node', 'Mean South Node', 'Black Moon Lilith'):
            continue
        arbiters = [FILE_CORRECTION[correction]]
        if center == 'bary' and correction == 'apparent':
            arbiters = ['LT']  # the barycentre does not move: apparent is astrometric
        if center == 'geo' and body == 'Moon' and correction == 'apparent':
            arbiters = ['LTS', 'NONE']  # the engine's convention: the series at the instant
        for which in arbiters:
            rows = horizons(center, which, NAIF[body])
            results.append({'center': center, 'correction': correction, 'body': body, 'arbiter': which,
                            'frames': compare_case(case, rows, instants, pool=which != 'NONE' or correction == 'geometric')})
    moon_rows = horizons('geo', 'NONE', '301')
    for case in data['cases']:
        if case['body'] in ('North Node', 'South Node', 'Mean Node', 'Mean South Node', 'Black Moon Lilith'):
            results.append({'center': 'geo', 'correction': 'apparent', 'body': case['body'],
                            'arbiter': 'osculating node of Horizons NONE 301' if 'h Node' in case['body'] and 'Mean' not in case['body']
                            else 'ERFA fundamental arguments', 'frames': compare_point(case, instants, moon_rows)})
    # The bounds rule: largest over every instant and frame, rounded up to two significant figures,
    # the preregistered arbiter only (for the geocentric apparent Moon, Horizons's LT+S).
    center_name = {'geo': 'geocentric', 'helio': 'heliocentric', 'bary': 'barycentric',
                   'topo1': 'topocentric', 'topo2': 'topocentric'}
    for result in results:
        if result['body'] == 'Moon' and result['center'] == 'geo' and result['arbiter'] == 'NONE' and result['correction'] == 'apparent':
            continue
        key = f"{center_name[result['center']]}/{result['correction']}/{result['body']}"
        worst = [max(f['position'][3] for f in result['frames']),
                 max((f['distance'][3] for f in result['frames'] if 'distance' in f), default=None),
                 max((f['speed'][3] for f in result['frames'] if 'speed' in f), default=None)]
        previous = bounds.get(key, [0.0, None, None])
        bounds[key] = [max(previous[0], worst[0]),
                       None if worst[1] is None and previous[1] is None else max(x for x in (previous[1], worst[1]) if x is not None),
                       None if worst[2] is None and previous[2] is None else max(x for x in (previous[2], worst[2]) if x is not None)]
    rounded = {key: [up2(v[0]), None if v[1] is None else up2(v[1]), None if v[2] is None else up2(v[2])]
               for key, v in sorted(bounds.items())}
    pooled = {'byFrame': [], 'byBody': []}
    groups = sorted({(k[0], k[1]) for k in RAW})
    for kind, correction in groups:
        for frame in FRAMES:
            metrics = {}
            for (k0, k1, _, f), values in RAW.items():
                if (k0, k1, f) == (kind, correction, frame):
                    for name, v in values.items():
                        metrics.setdefault(name, []).extend(v)
            pooled['byFrame'].append({'center': kind, 'correction': correction, 'frame': frame,
                                      **{name: stats(v) for name, v in metrics.items() if v}})
        for body in sorted({k[2] for k in RAW if (k[0], k[1]) == (kind, correction)}):
            metrics = {}
            for (k0, k1, b, _), values in RAW.items():
                if (k0, k1, b) == (kind, correction, body):
                    for name, v in values.items():
                        metrics.setdefault(name, []).extend(v)
            pooled['byBody'].append({'center': kind, 'correction': correction, 'body': body,
                                     **{name: stats(v) for name, v in metrics.items() if v}})
    moon = np.array(data['moonLightTime'])
    summary = {
        'preregistration': 'docs/evidence/calc-api/PREREGISTRATION.md',
        'engine': data['engine'],
        'arbiter': {'horizons': 'NASA JPL Horizons API 1.2, DE441, VECTORS in ICRF (../horizons/, requests.jsonl)',
                    'erfa': f'pyerfa {erfa.__version__} (ERFA {erfa.version.erfa_version}), numpy {np.__version__}, '
                            f'Python {sys.version.split()[0]}; IAU 2006/2000A frames'},
        'instants': instants,
        'consistency': consistency(data),
        'pooled': pooled,
        'horizons': results,
        'bounds': rounded,
        'richardson': data['richardson'],
        'moonLightTimeArcsec': {'median': float(np.median(moon)), 'min': float(moon.min()), 'max': float(moon.max())},
        'inputs': {name: hashlib.sha256(open(os.path.join(HORIZONS, name), 'rb').read()).hexdigest()
                   for name in sorted(os.listdir(HORIZONS)) if name.endswith('.txt')},
    }
    summary['statistics'] = STATISTICS
    os.makedirs(RESULTS, exist_ok=True)
    with open(os.path.join(RESULTS, 'summary.json'), 'w') as f:
        f.write(dumps(trim(summary)))
    print(json.dumps(summary['consistency'], indent=1))


if __name__ == '__main__':
    main()
