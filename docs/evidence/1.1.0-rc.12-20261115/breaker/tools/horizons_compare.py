"""Breaker rc.12, item 0 (B2): the installed package's calc() (engine-near-sun.mjs) against JPL Horizons
(horizons_fetch.py) at passages of a planet near the Sun, and four reductions of NAIF's de440.bsp against
Horizons at the same instants, to see which rule Horizons follows behind the Sun's disc.

Horizons's apparent RA and Dec are on its own frame of date (IAU 1976/1980 with corrections where it has
Earth orientation data), up to half an arcsecond from the engine's IAU 2006/2000 frame, so two measures that a
rotation of the frame leaves alone or nearly alone are used:
  sep   the planet's angle from the Sun's centre, engine minus Horizons. A rotation does not change it, and
        the Sun's deflection is along it, so it holds the whole of a deflection applied in one and not the other.
  rel   the planet's offset from the Sun on the tangent plane at the Sun (east, north), engine minus
        Horizons, its length. A rotation of e arcseconds about the line of sight changes it by e times the
        offset in radians (under 0.005 arcsecond here).
and for the record `abs`, the plain angle between the engine's and Horizons's RA and Dec.
Classes, by the engine's own decision: inside (behind the disc and more than 3 arcseconds from the limb),
limb (calc() quotes 1.8), outside. Kernel rules: disc (erfa.ld with erfa.ldsun's limiter, none behind the
disc), ldsun (erfa's limiter only), full (limiter 1e-14, the rc.11 formula), none (no deflection).
  python horizons_compare.py de440.bsp horizons.json engine.json out.json"""
import json, sys, math
import numpy as np, erfa
from jplephem.spk import SPK
AU = 149597870.7; C = 299792.458 * 86400 / AU; R_SUN = 695700.0 / AU; AS = 180 / math.pi * 3600
k = SPK.open(sys.argv[1]); SEG = {(s.center, s.target): s for s in k.segments}
CHAIN = {'Sun': [(0, 10)], 'Earth': [(0, 3), (3, 399)], 'Mercury': [(0, 1), (1, 199)], 'Venus': [(0, 2), (2, 299)],
         'Mars': [(0, 4)], 'Jupiter': [(0, 5)], 'Saturn': [(0, 6)], 'Uranus': [(0, 7)], 'Neptune': [(0, 8)], 'Pluto': [(0, 9)]}
def state(name, t):
    p = np.zeros(3); v = np.zeros(3)
    for key in CHAIN[name]:
        a, b = SEG[key].compute_and_differentiate(t); p += a; v += b
    return p / AU, v / AU
def place(body, tt, rule):
    t = tt + erfa.dtdb(2451545.0, tt - 2451545.0, 0.0, 0.0, 0.0, 0.0) / 86400
    e, ev = state('Earth', t); lt = 0.0
    for _ in range(8):
        b, _ = state(body, t - lt); d = b - e; lt = np.linalg.norm(d) / C
    dist = np.linalg.norm(d); p = d / dist
    s_now, _ = state('Sun', t); eh = e - s_now; em = np.linalg.norm(eh); eh /= em
    if body != 'Sun':
        sd = s_now - e
        for _ in range(3):
            s_ret, _ = state('Sun', t - np.linalg.norm(sd) / C); sd = s_ret - e
        ds = np.linalg.norm(sd); su = sd / ds
        behind = dist > ds and math.atan2(np.linalg.norm(np.cross(p, su)), float(p @ su)) < math.asin(R_SUN / ds)
        if rule != 'none' and not (rule == 'disc' and behind):
            s_emit, _ = state('Sun', t - lt); q = b - s_emit; q /= np.linalg.norm(q)
            p = erfa.ld(1.0, p, q, eh, em, 1e-14 if rule == 'full' else 1e-6 / max(em * em, 1.0))
    v = ev / C
    p = erfa.ab(p, v, em, math.sqrt(1 - float(v @ v)))
    x = erfa.pnm06a(2400000.5, tt - 2400000.5) @ p
    return math.degrees(math.atan2(x[1], x[0])) % 360, math.degrees(math.asin(x[2]))
def unit(ra, dec):
    a, d = math.radians(ra), math.radians(dec); return np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])
def ang(a, b): return math.atan2(np.linalg.norm(np.cross(a, b)), float(a @ b)) * AS
def offset(p, s):
    """Tangent-plane offset (east, north), arcseconds, of direction p from direction s."""
    east = np.cross([0, 0, 1.0], s); east /= np.linalg.norm(east); north = np.cross(s, east); c = float(p @ s)
    return np.array([float(p @ east) / c, float(p @ north) / c]) * AS
H = json.load(open(sys.argv[2])); E = json.load(open(sys.argv[3]))
assert len(H) == len(E['groups'])
RULES = ('disc', 'ldsun', 'full', 'none'); rows = []
for h, g in zip(H, E['groups']):
    assert h['body'] == g['body'] and len(h['planet']) == len(g['rows'])
    for hp, hs, r in zip(h['planet'], h['sun'], g['rows']):
        assert abs(hp['jdTt'] - r['jdTt']) < 2e-7 and abs(hs['jdTt'] - r['jdTt']) < 2e-7
        P, S = unit(hp['ra'], hp['dec']), unit(hs['ra'], hs['dec']); p, s = unit(r['ra'], r['dec']), unit(r['sunRa'], r['sunDec'])
        radius = math.asin(R_SUN / r['sunDist']) * AS
        cls = 'limb' if r['boundEcliptic'][0] == 1.8 else ('inside' if r['behindDisc'] else 'outside')
        row = {'set': h['set'], 'body': h['body'], 'jdTt': r['jdTt'], 'class': cls, 'behindDisc': r['behindDisc'], 'horizonsSepArcsec': ang(P, S), 'sunRadiusArcsec': radius, 'horizonsSotFlag': hp['sotFlag'],
               'bound': r['boundEcliptic'], 'engine': {'sep': ang(p, s) - ang(P, S), 'rel': float(np.linalg.norm(offset(p, s) - offset(P, S))), 'abs': ang(p, P), 'sunAbs': ang(s, S)}}
        ks = unit(*place('Sun', r['jdTt'], 'none'))
        for rule in RULES:
            kp = unit(*place(h['body'], r['jdTt'], rule))
            row[rule] = {'sep': ang(kp, ks) - ang(P, S), 'rel': float(np.linalg.norm(offset(kp, ks) - offset(P, S))), 'engineFromKernel': ang(kp, p)}
        rows.append(row)
def worst(sel, who, f):
    c = [r for r in rows if sel(r)]
    if not c: return None
    w = max(c, key=lambda r: abs(r[who][f])); return {'max': abs(w[who][f]), 'body': w['body'], 'jdTt': w['jdTt'], 'horizonsSepArcsec': round(w['horizonsSepArcsec'], 3)}
summary = {}
for sset in ('named', 'behind', 'miss', 'front', 'all'):
    for cls in ('inside', 'limb', 'outside'):
        sel = lambda r: (sset == 'all' or r['set'] == sset) and r['class'] == cls
        n = sum(1 for r in rows if sel(r))
        if not n: continue
        summary.setdefault(sset, {})[cls] = {'n': n, 'engine': {f: worst(sel, 'engine', f) for f in ('sep', 'rel', 'abs', 'sunAbs')},
            **{rule: {f: worst(sel, rule, f) for f in ('sep', 'rel', 'engineFromKernel')} for rule in RULES},
            'largestBoundQuoted': max(r['bound'][0] for r in rows if sel(r)), 'engineRelOverQuotedBound': sum(1 for r in rows if sel(r) and r['engine']['rel'] > r['bound'][0]),
            'engineSepOverQuotedBound': sum(1 for r in rows if sel(r) and abs(r['engine']['sep']) > r['bound'][0])}
perbody = {b: {cls: {'n': sum(1 for r in rows if r['body'] == b and r['class'] == cls), 'engineSep': (worst(lambda r: r['body'] == b and r['class'] == cls, 'engine', 'sep') or {}).get('max'),
           'ldsunSep': (worst(lambda r: r['body'] == b and r['class'] == cls, 'ldsun', 'sep') or {}).get('max'), 'fullSep': (worst(lambda r: r['body'] == b and r['class'] == cls, 'full', 'sep') or {}).get('max')} for cls in ('inside', 'limb', 'outside')} for b in CHAIN if b not in ('Sun', 'Earth')}
# Horizons's own side of the limb against the engine's: instants where the two disagree
sides = [{'body': r['body'], 'jdTt': r['jdTt'], 'engineBehindDisc': r['behindDisc'], 'engineSepMinusHorizons': r['engine']['sep'], 'limbMinusHorizonsSepArcsec': r['sunRadiusArcsec'] - r['horizonsSepArcsec'], 'bound': r['bound']} for r in rows if abs(r['engine']['sep']) > 0.1]
json.dump({'engine': E['engine'], 'kernel': 'de440.bsp', 'groups': len(H), 'instants': len(rows), 'horizonsResponses': 2 * len(H), 'summary': summary, 'perBody': perbody, 'engineMoreThanTenthArcsecFromHorizonsInSeparation': sides, 'rows': rows}, open(sys.argv[4], 'w'))
print(json.dumps({'instants': len(rows), 'summary': {k2: {c: {'n': v['n'], 'engine sep': v['engine']['sep']['max'], 'engine rel': v['engine']['rel']['max'], 'engine abs': v['engine']['abs']['max'], 'disc sep': v['disc']['sep']['max'], 'ldsun sep': v['ldsun']['sep']['max'], 'full sep': v['full']['sep']['max'], 'none sep': v['none']['sep']['max'], 'engine-kernel(disc)': v['disc']['engineFromKernel']['max'], 'bound': v['largestBoundQuoted'], 'rel>bound': v['engineRelOverQuotedBound'], 'sep>bound': v['engineSepOverQuotedBound']} for c, v in s.items()} for k2, s in summary.items()}}, indent=1))
print('per body', json.dumps(perbody)); print('engine > 0.1 arcsec from Horizons in separation:', json.dumps(sides, indent=0)[:3000])
