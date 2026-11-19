"""Breaker, item 1: calc()'s apparent geocentric places and rates from the installed 1.1.0-rc.11 package
(calc-sample.mjs) against a reduction of NAIF's de440.bsp written for this check: jplephem for the
states, light time by iteration, the Sun's light deflection (erfa.ld; limiter chosen below), stellar
aberration (erfa.ab), and ERFA's IAU 2006/2000A frames. Rates are central differences of this reference
(step 0.001 day). Not the sweep's code.

  python calc_check.py de440.bsp calc-sample.json out.json
"""
import json, sys, math
import numpy as np, erfa
from jplephem.spk import SPK

AU_KM = 149597870.7
C_AUD = 299792.458 * 86400 / AU_KM
SRS = 1.97412574336e-8  # Schwarzschild radius of the Sun, au (ERFA)
kernel = SPK.open(sys.argv[1])
sample = json.load(open(sys.argv[2]))
SEG = {(s.center, s.target): s for s in kernel.segments}

def bary(code, t):
    """Barycentric position (au) and velocity (au/day) of a NAIF code at TDB JD t."""
    chain = {10: [(0, 10)], 399: [(0, 3), (3, 399)], 301: [(0, 3), (3, 301)], 199: [(0, 1), (1, 199)],
             299: [(0, 2), (2, 299)], 4: [(0, 4)], 5: [(0, 5)], 6: [(0, 6)], 7: [(0, 7)], 8: [(0, 8)], 9: [(0, 9)]}[code]
    p = np.zeros(3); v = np.zeros(3)
    for key in chain:
        a, b = SEG[key].compute_and_differentiate(t)
        p += a; v += b
    return p / AU_KM, v / AU_KM

CODE = {'Sun': 10, 'Moon': 301, 'Mercury': 199, 'Venus': 299, 'Mars': 4, 'Jupiter': 5, 'Saturn': 6,
        'Uranus': 7, 'Neptune': 8, 'Pluto': 9}

def tdb_of(tt):
    g = math.radians(357.53 + 0.9856003 * (tt - 2451545.0))
    return tt + (0.001657 * math.sin(g) + 0.000014 * math.sin(2 * g)) / 86400

def apparent(body, tt, limiter):
    """Geocentric apparent vector (BCRS axes, au): light time, deflection, aberration."""
    t = tdb_of(tt)
    e, ev = bary(399, t)
    s, _ = bary(10, t)
    lt = 0.0
    for _ in range(6):
        b, _ = bary(CODE[body], t - lt)
        d = b - e
        lt = np.linalg.norm(d) / C_AUD
    dist = np.linalg.norm(d)
    p = d / dist
    sep = None
    if body != 'Sun':
        sun_then, _ = bary(10, t - lt)
        q = b - sun_then; q /= np.linalg.norm(q)
        eh = e - s; em = np.linalg.norm(eh); eh = eh / em
        sep = math.degrees(math.acos(max(-1, min(1, float(np.dot(p, -eh))))))
        if limiter == 'erfa':
            dlim = 1e-6 / max(em * em, 1.0)
        elif limiter == 'none':
            dlim = 1e-14
        else:
            dlim = None
        if dlim is not None:
            p = erfa.ld(1.0, p, q, eh, em, dlim)
    else:
        eh = e - s; em = np.linalg.norm(eh)
    vv = ev / C_AUD
    bm1 = math.sqrt(1 - float(np.dot(vv, vv)))
    p = erfa.ab(p, vv, em, bm1)
    return p * dist, sep

def frames(tt):
    d1, d2 = 2400000.5, tt - 2400000.5
    rnpb = erfa.pnm06a(d1, d2)                 # GCRS -> true equator and equinox of date
    rbp = erfa.pmat06(d1, d2)                  # GCRS -> mean of date (bias and precession)
    gamb, phib, psib, epsa = erfa.pfw06(d1, d2)
    dpsi, deps = erfa.nut06a(d1, d2)
    rb = erfa.bp06(d1, d2)[0]                  # frame bias: GCRS -> mean J2000.0
    eps0 = math.radians(84381.406 / 3600)
    rx = lambda a: erfa.rx(a, np.eye(3))
    return {
        'ecliptic-true-of-date': rx(epsa + deps) @ rnpb,
        'ecliptic-mean-of-date': rx(epsa) @ rbp,
        'ecliptic-j2000': rx(eps0) @ rb,
        'ecliptic-icrs': rx(eps0),
        'equatorial-true-of-date': rnpb,
        'equatorial-mean-of-date': rbp,
        'equatorial-j2000': rb,
        'equatorial-icrs': np.eye(3),
    }

def sph(v):
    r = np.linalg.norm(v)
    return math.degrees(math.atan2(v[1], v[0])) % 360, math.degrees(math.asin(v[2] / r)), r

def wrap(a):
    return (a + 180) % 360 - 180

H = 0.001
cache = {}
def ref(body, tt, frame, limiter):
    key = (body, tt, limiter)
    if key not in cache:
        out = {}
        for k, t in (('0', tt), ('-', tt - H), ('+', tt + H)):
            v, sep = apparent(body, t, limiter)
            fr = frames(t)
            out[k] = ({name: sph(m @ v) for name, m in fr.items()}, sep)
        cache[key] = out
    c = cache[key]
    lon, lat, r = c['0'][0][frame]
    lon0, lat0, r0 = c['-'][0][frame]; lon1, lat1, r1 = c['+'][0][frame]
    return lon, lat, r, wrap(lon1 - lon0) / (2 * H), (lat1 - lat0) / (2 * H), (r1 - r0) / (2 * H), c['0'][1]

def angle(l1, b1, l2, b2):
    a = [math.cos(math.radians(b1)) * math.cos(math.radians(l1)), math.cos(math.radians(b1)) * math.sin(math.radians(l1)), math.sin(math.radians(b1))]
    b = [math.cos(math.radians(b2)) * math.cos(math.radians(l2)), math.cos(math.radians(b2)) * math.sin(math.radians(l2)), math.sin(math.radians(b2))]
    cr = np.linalg.norm(np.cross(a, b))
    return math.degrees(math.atan2(cr, float(np.dot(a, b)))) * 3600

result = {}
for limiter in ('erfa', 'none', 'no-deflection'):
    table = {}
    near = []
    for jd, body, frame, lon, lat, dist, slon, slat, sdist in sample['rows']:
        rl, rb_, rr, rsl, rsb, rsr, sep = ref(body, jd, frame, limiter)
        row = table.setdefault(frame, {}).setdefault(body, {'angle': [0, None], 'lon': [0, None], 'lat': [0, None], 'dist': [0, None], 'lonRate': [0, None], 'latRate': [0, None], 'distRate': [0, None], 'n': 0})
        row['n'] += 1
        vals = {'angle': angle(lon, lat, rl, rb_), 'lon': abs(wrap(lon - rl)) * 3600, 'lat': abs(lat - rb_) * 3600, 'dist': abs(dist / rr - 1),
                'lonRate': abs(slon - rsl) * 3600, 'latRate': abs(slat - rsb) * 3600, 'distRate': abs(sdist - rsr)}
        for k, v in vals.items():
            if v > row[k][0]:
                row[k] = [v, jd]
        if frame == 'ecliptic-true-of-date' and sep is not None and sep < 1.0:
            near.append({'body': body, 'jdTt': jd, 'sunSeparationDeg': sep, 'angleArcsec': vals['angle'], 'lonRateArcsecPerDay': vals['lonRate']})
    result[limiter] = {'frames': table, 'withinOneDegreeOfTheSun': near}

def worst(limiter, field):
    best = (0, None, None, None)
    for frame, bodies in result[limiter]['frames'].items():
        for body, row in bodies.items():
            if row[field][0] > best[0]:
                best = (row[field][0], body, frame, row[field][1])
    return best

summary = {lim: {f: worst(lim, f) for f in ('angle', 'lon', 'lat', 'dist', 'lonRate', 'latRate', 'distRate')} for lim in result}
perframe = {lim: {frame: {f: max((row[f][0], body) for body, row in bodies.items()) for f in ('angle', 'lonRate', 'latRate')} for frame, bodies in result[lim]['frames'].items()} for lim in result}
json.dump({'kernel': sys.argv[1].split('/')[-1], 'n': sample['n'], 'stepDays': H, 'units': {'angle,lon,lat': 'arcsec', 'dist': 'relative', 'lonRate,latRate': 'arcsec/day', 'distRate': 'au/day'},
           'worstOverall': summary, 'worstPerFrame': perframe, 'detail': result}, open(sys.argv[3], 'w'), indent=1)
print(json.dumps({'worstOverall': summary, 'worstPerFrame': perframe['erfa']}, indent=1))
for lim in result:
    print(lim, 'within 1 deg of the Sun:', sorted(result[lim]['withinOneDegreeOfTheSun'], key=lambda x: x['sunSeparationDeg'])[:6])
