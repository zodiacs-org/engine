#!/usr/bin/env python3
"""calc() on the shipped DE440 pack (passages.json) against JPL Horizons (horizons.json) at every passage of a
planet behind the Sun from 1800 to 2200, and four reductions of NAIF's de440.bsp against Horizons at the same
instants, which say what Horizons does with the Sun's light deflection behind the disc.

    python3 compare.py de440.bsp passages.json horizons.json OUT.json

Two differences from Horizons at each instant, arcseconds:
- "fromHorizons": the angle between calc()'s direction and Horizons's in the true equator and equinox of date
  (RA and Dec, QUANTITIES 2). Horizons gives these on its IAU 1976/1980 frame with its EOP corrections, which is
  not the engine's IAU 2006/2000B, so this angle holds the two frames' difference, up to a few tenths of an
  arcsecond in the 19th century (conformance/arbiters/l1/README.md).
- "relativeToTheSun": the angle between the planet's offset from the Sun, calc()'s and Horizons's, each as the
  difference of the two unit vectors in its own frame. A rotation between the frames moves the planet and the
  Sun alike and leaves the offset changed by at most the rotation times the separation (under 0.002 arcseconds
  for a rotation of 1 arcsecond at 0.3 degrees): what is left is the planets' places relative to the Sun's.

And "fromTheKernel": the angle between calc()'s direction and the first reduction below (the kernel with the
pack's convention), both in the true equator and equinox of date (ERFA's IAU 2006/2000A for the kernel's), as the
dense sweep measures.

Zones by calc()'s apparent separation s from the Sun's centre and the Sun's radius r = asin(695,700 km / d):
"inside" s < r - 3", "limb" |s - r| <= 3" (where calc() quotes DE440_AT_LIMB), "outside" s > r + 3".

The kernel's reductions (jplephem, light time by iteration, erfa.ld, erfa.ab, erfa.pnm06a), each compared with
Horizons the same two ways:
- "behind-disc-none": the deflection outside the disc only (what the pack does from 1.1.0-rc.12),
- "ldsun": erfa.ldsun's limiter everywhere (ERFA's own),
- "limiter-1e-14": the limiter the pack used through 1.1.0-rc.11,
- "no-deflection": none at all.
Needs pyerfa, numpy, jplephem.
"""
import json, math, sys
import numpy as np, erfa
from jplephem.spk import SPK

AU = 149597870.7
C = 299792.458 * 86400 / AU
AS = 180 * 3600 / math.pi
SUN_RADIUS_KM = 695700.0
CHAINS = {'Sun': [(0, 10)], 'Earth': [(0, 3), (3, 399)], 'Mercury': [(0, 1), (1, 199)], 'Venus': [(0, 2), (2, 299)],
          'Mars': [(0, 4)], 'Jupiter': [(0, 5)], 'Saturn': [(0, 6)], 'Uranus': [(0, 7)], 'Neptune': [(0, 8)], 'Pluto': [(0, 9)]}
VARIANTS = ['behind-disc-none', 'ldsun', 'limiter-1e-14', 'no-deflection']


def main(kernel_path, passages_path, horizons_path, out_path):
    spk = SPK.open(kernel_path)
    def state(name, t):
        p = np.zeros(3); v = np.zeros(3)
        for a, b in CHAINS[name]:
            x, y = spk[a, b].compute_and_differentiate(2400000.5, t - 2400000.5)
            p += x; v += y
        return p / AU, v / AU

    def apparent(body, jd):
        t = jd + erfa.dtdb(2400000.5, jd - 2400000.5, 0, 0, 0, 0) / 86400
        e, ev = state('Earth', t)
        s, _ = state('Sun', t)
        lt = 0.0
        for _ in range(20):
            b, _ = state(body, t - lt)
            nlt = np.linalg.norm(b - e) / C
            if abs(nlt - lt) < 1e-14: lt = nlt; break
            lt = nlt
        b, _ = state(body, t - lt)
        d = b - e; length = np.linalg.norm(d); p = d / length
        vv = ev / C; bm1 = math.sqrt(1 - float(vv @ vv))
        eh = e - s; em = np.linalg.norm(eh)
        out = {}
        if body == 'Sun':
            ps = erfa.ab(p, vv, em, bm1)
            return {k: ps for k in VARIANTS}
        sun_then, _ = state('Sun', t - lt)
        q = b - sun_then; q /= np.linalg.norm(q)
        sun_dir, _ = state('Sun', t - np.linalg.norm(s - e) / C)
        sun_dir = sun_dir - e; dsun = np.linalg.norm(sun_dir)
        apart = math.atan2(np.linalg.norm(np.cross(p, sun_dir / dsun)), float(p @ sun_dir / dsun))
        behind = length > dsun and apart < math.asin(SUN_RADIUS_KM / AU / dsun)
        for name in VARIANTS:
            if name == 'no-deflection' or (name == 'behind-disc-none' and behind):
                bent = p
            else:
                dlim = 1e-14 if name == 'limiter-1e-14' else 1e-6 / max(em * em, 1.0)
                bent = erfa.ld(1.0, p, q, eh / em, em, dlim)
            out[name] = erfa.ab(bent, vv, em, bm1)
        return out

    def unit_radec(ra, dec):
        ra, dec = math.radians(ra), math.radians(dec)
        return np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])

    def ang(a, b):
        return math.atan2(np.linalg.norm(np.cross(a, b)), float(a @ b)) * AS

    doc = json.load(open(passages_path)); hz = json.load(open(horizons_path))['places']
    rows = []
    for r in doc['rows']:
        key = f"{r['jdTt']:.6f}"
        hb, hs = hz[r['body']][key], hz['Sun'][key]
        Hb, Hs = unit_radec(hb['ra'], hb['dec']), unit_radec(hs['ra'], hs['dec'])
        Eb, Es = unit_radec(r['equ']['lon'], r['equ']['lat']), unit_radec(r['equ']['sunLon'], r['equ']['sunLat'])
        sep, rad = r['separationDeg'] * 3600, r['radiusDeg'] * 3600
        zone = 'inside' if sep < rad - 3 else 'limb' if abs(sep - rad) <= 3 else 'outside'
        row = {'passage': r['passage'], 'body': r['body'], 'f': r['f'], 'jdTt': r['jdTt'], 'zone': zone,
               'separationArcsec': round(sep, 3), 'sunRadiusArcsec': round(rad, 3), 'bound': r['bound'],
               'engine': {'fromHorizons': ang(Eb, Hb), 'relativeToTheSun': np.linalg.norm((Eb - Es) - (Hb - Hs)) * AS}}
        N = erfa.pnm06a(2400000.5, r['jdTt'] - 2400000.5)
        kb, ks = apparent(r['body'], r['jdTt']), apparent('Sun', r['jdTt'])
        for name in VARIANTS:
            vb = N @ kb[name]; vs = N @ ks[name]
            vb /= np.linalg.norm(vb); vs /= np.linalg.norm(vs)
            row[name] = {'fromHorizons': ang(vb, Hb), 'relativeToTheSun': np.linalg.norm((vb - vs) - (Hb - Hs)) * AS}
            if name == 'behind-disc-none':
                # calc() against this reduction of the kernel, the same convention, both in the IAU 2006 frame of date.
                row['engine']['fromTheKernel'] = ang(Eb, vb)
        rows.append(row)

    def worst(selected, who, what):
        if not selected: return None
        best = max(selected, key=lambda x: x[who][what])
        return {'max': round(best[who][what], 6), 'body': best['body'], 'jdTt': best['jdTt'], 'separationArcsec': best['separationArcsec']}

    summary = {}
    for body in sorted({r['body'] for r in rows}) + ['all']:
        mine = [r for r in rows if body == 'all' or r['body'] == body]
        entry = {'passages': len({r['passage'] for r in mine}),
                 'passagesBehindTheDisc': sum(1 for p in doc['passages'] if (body == 'all' or p['body'] == body) and p['behindTheDisc'])}
        for zone in ('inside', 'limb', 'outside'):
            z = [r for r in mine if r['zone'] == zone]
            entry[zone] = {'n': len(z), **{who: {what: worst(z, who, what) for what in ('relativeToTheSun', 'fromHorizons')}
                                           for who in ['engine'] + VARIANTS}}
            entry[zone]['engine']['fromTheKernel'] = worst(z, 'engine', 'fromTheKernel')
            entry[zone]['largestBoundQuoted'] = max((r['bound']['value'] for r in z), default=None)
        summary[body] = entry
    out = {'what': __doc__.split('\n\n')[0], 'engine': doc['engine'], 'kernel': kernel_path.split('/')[-1],
           'software': {'pyerfa': erfa.__version__, 'numpy': np.__version__},
           'horizonsQueries': len(json.load(open(horizons_path))['queries']), 'summary': summary, 'rows': rows}
    json.dump(out, open(out_path, 'w'), indent=None, separators=(',', ':'))
    for body, e in summary.items():
        print(body, e['passages'], 'passages,', e['passagesBehindTheDisc'], 'behind the disc;',
              ' '.join(f"{z}: n {e[z]['n']} kernel {e[z]['engine']['fromTheKernel'] and e[z]['engine']['fromTheKernel']['max']} engine rel {e[z]['engine']['relativeToTheSun'] and e[z]['engine']['relativeToTheSun']['max']} abs {e[z]['engine']['fromHorizons'] and e[z]['engine']['fromHorizons']['max']} ldsun rel {e[z]['ldsun']['relativeToTheSun'] and e[z]['ldsun']['relativeToTheSun']['max']}" for z in ('inside', 'limb', 'outside')))


if __name__ == '__main__':
    main(*sys.argv[1:5])
