"""Breaker rc.12, item 1: calc()'s apparent geocentric places and rates from the installed 1.1.0-rc.12 package
(calc-sample.mjs) against a reduction of NAIF's de440.bsp written for this review (not the sweep's sweep.py,
not the builder's compare.py): jplephem for the states; TDB from TT by erfa.dtdb; light time by iteration;
the Sun's light deflection by erfa.ld with erfa.ldsun's limiter (1e-6 / max(em^2, 1)); annual aberration by
erfa.ab; ERFA's IAU 2006/2000A bias, precession and nutation for the frames. Three rules for a planet behind
the Sun's disc are carried: "disc" (no deflection where the planet is farther than the Sun and its
light-time direction is within asin(695700 km / d) of the Sun's, the Sun at its own light time), "ldsun"
(erfa's limiter only) and "none" (no deflection anywhere). Rates are central differences of the reference
(step 0.001 day) on the middle instant's side of the disc.
  python kernel_check.py de440.bsp calc-sample.json out.json"""
import json, sys, math
import numpy as np, erfa
from jplephem.spk import SPK
AU = 149597870.7; C = 299792.458 * 86400 / AU; R_SUN = 695700.0 / AU
k = SPK.open(sys.argv[1]); SEG = {(s.center, s.target): s for s in k.segments}
CHAIN = {'Sun': [(0, 10)], 'Earth': [(0, 3), (3, 399)], 'Moon': [(0, 3), (3, 301)], 'Mercury': [(0, 1), (1, 199)], 'Venus': [(0, 2), (2, 299)],
         'Mars': [(0, 4)], 'Jupiter': [(0, 5)], 'Saturn': [(0, 6)], 'Uranus': [(0, 7)], 'Neptune': [(0, 8)], 'Pluto': [(0, 9)]}
def state(name, t):
    p = np.zeros(3); v = np.zeros(3)
    for key in CHAIN[name]:
        a, b = SEG[key].compute_and_differentiate(t); p += a; v += b
    return p / AU, v / AU
def tdb(tt):
    return tt + erfa.dtdb(2451545.0, tt - 2451545.0, 0.0, 0.0, 0.0, 0.0) / 86400
def place(body, tt, rule, side=None):
    """Apparent direction times the light-path distance (BCRS axes, au), and whether behind the disc."""
    t = tdb(tt); e, ev = state('Earth', t); lt = 0.0
    for _ in range(8):
        b, _ = state(body, t - lt); d = b - e; lt = np.linalg.norm(d) / C
    dist = np.linalg.norm(d); p = d / dist
    s_now, _ = state('Sun', t); eh = e - s_now; em = np.linalg.norm(eh); eh /= em
    behind = False
    if body != 'Sun':
        sd = s_now - e
        for _ in range(3):
            s_ret, _ = state('Sun', t - np.linalg.norm(sd) / C); sd = s_ret - e
        ds = np.linalg.norm(sd); su = sd / ds
        apart = math.atan2(np.linalg.norm(np.cross(p, su)), float(p @ su))
        behind = dist > ds and apart < math.asin(R_SUN / ds)
        use = behind if side is None else side
        if rule != 'none' and not (rule == 'disc' and use):
            s_emit, _ = state('Sun', t - lt); q = b - s_emit; q /= np.linalg.norm(q)
            p = erfa.ld(1.0, p, q, eh, em, 1e-6 / max(em * em, 1.0))
    v = ev / C
    p = erfa.ab(p, v, em, math.sqrt(1 - float(v @ v)))
    return p * dist, behind
def frames(tt):
    d1, d2 = 2400000.5, tt - 2400000.5
    rnpb = erfa.pnm06a(d1, d2); rbp = erfa.pmat06(d1, d2); rb = erfa.bp06(d1, d2)[0]
    epsa = erfa.obl06(d1, d2); dpsi, deps = erfa.nut06a(d1, d2); eps0 = math.radians(84381.406 / 3600)
    rx = lambda a: erfa.rx(a, np.eye(3))
    return {'ecliptic-true-of-date': rx(epsa + deps) @ rnpb, 'ecliptic-mean-of-date': rx(epsa) @ rbp, 'ecliptic-j2000': rx(eps0) @ rb, 'ecliptic-icrs': rx(eps0),
            'equatorial-true-of-date': rnpb, 'equatorial-mean-of-date': rbp, 'equatorial-j2000': rb, 'equatorial-icrs': np.eye(3)}
def sph(v):
    r = np.linalg.norm(v); return math.degrees(math.atan2(v[1], v[0])) % 360, math.degrees(math.asin(v[2] / r)), r
wrap = lambda a: (a + 180) % 360 - 180
def angle(l1, b1, l2, b2):
    u = lambda l, b: np.array([math.cos(math.radians(b)) * math.cos(math.radians(l)), math.cos(math.radians(b)) * math.sin(math.radians(l)), math.sin(math.radians(b))])
    a, b = u(l1, b1), u(l2, b2); return math.degrees(math.atan2(np.linalg.norm(np.cross(a, b)), float(a @ b))) * 3600
H = 0.001; cache = {}
def ref(body, tt, rule):
    key = (body, tt, rule)
    if key not in cache:
        v0, behind = place(body, tt, rule); out = {'behind': behind}
        for name, t, v in (('0', tt, v0), ('-', tt - H, place(body, tt - H, rule, behind)[0]), ('+', tt + H, place(body, tt + H, rule, behind)[0])):
            out[name] = {f: sph(m @ v) for f, m in frames(t).items()}
        cache[key] = out
    return cache[key]
sample = json.load(open(sys.argv[2])); FIELDS = ('angle', 'dist', 'lonRate', 'latRate', 'distRate')
res = {}
for rule in ('disc', 'ldsun', 'none'):
    for jd, body, frame, lon, lat, dist, slon, slat, sdist, sset, bound, label in sample['rows']:
        c = ref(body, jd, rule); l, b, r = c['0'][frame]; l0, b0, r0 = c['-'][frame]; l1, b1, r1 = c['+'][frame]
        vals = {'angle': angle(lon, lat, l, b), 'dist': abs(dist / r - 1), 'lonRate': abs(slon - wrap(l1 - l0) / (2 * H)) * 3600,
                'latRate': abs(slat - (b1 - b0) / (2 * H)) * 3600, 'distRate': abs(sdist - (r1 - r0) / (2 * H))}
        grp = 'Moon' if body == 'Moon' else 'Sun and planets'
        row = res.setdefault(rule, {}).setdefault(sset, {}).setdefault(frame, {}).setdefault(grp, {f: [0, None, None] for f in FIELDS} | {'n': 0, 'overQuotedBound': 0, 'behindDisc': 0})
        row['n'] += 1; row['behindDisc'] += int(c['behind'])
        if bound is not None and vals['angle'] > bound: row['overQuotedBound'] += 1
        for f in FIELDS:
            if vals[f] > row[f][0]: row[f] = [vals[f], body, jd]
flat = {rule: {sset: {grp: {f: max((fr[grp][f][0], fr[grp][f][1], name, fr[grp][f][2]) for name, fr in frs.items() if grp in fr) for f in FIELDS} |
        {'overQuotedBound': sum(fr[grp]['overQuotedBound'] for fr in frs.values() if grp in fr), 'rows': sum(fr[grp]['n'] for fr in frs.values() if grp in fr), 'behindDisc': sum(fr[grp]['behindDisc'] for fr in frs.values() if grp in fr)}
        for grp in ('Moon', 'Sun and planets') if any(grp in fr for fr in frs.values())} for sset, frs in sets.items()} for rule, sets in res.items()}
json.dump({'kernel': 'de440.bsp', 'n': sample['n'], 'insideDisc': sample['insideDisc'], 'stepDays': H, 'units': {'angle': 'arcsec', 'dist': 'relative', 'lonRate,latRate': 'arcsec/day', 'distRate': 'au/day'}, 'worst': flat, 'perFrame': res}, open(sys.argv[3], 'w'), indent=1)
print(json.dumps(flat['disc'], indent=1)); print('ldsun inside-disc', json.dumps(flat['ldsun'].get('inside-disc'))); print('none inside-disc', json.dumps(flat['none'].get('inside-disc')))
