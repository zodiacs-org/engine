#!/usr/bin/env python3
"""Where JPL Horizons stops bending a planet's light at the Sun's limb: at five limb crossings, Horizons's apparent
RA and Dec every 0.6 s over 6 s (horizons_span.py), each compared with a reduction of NAIF's de440.bsp with and
without the deflection (compare.py's); the instant Horizons changes from one to the other, and there the
planet's light-time-corrected geometric separation from the Sun (the Sun at its own light time) as a fraction of
asin(695,700 km / d), the radius the engine's rule uses (src/de440/reduce.ts). A fraction under 1 means
Horizons's edge is inside the engine's, by (1 - fraction) times the Sun's radius.

    HORIZONS_CACHE=DIR python3 limb.py de440.bsp > limb.txt
"""
import math, os, sys
import numpy as np, erfa
from jplephem.spk import SPK
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from horizons_span import fetch

AU = 149597870.7
C = 299792.458 * 86400 / AU
AS = 180 * 3600 / math.pi
CHAINS = {'Sun': [(0, 10)], 'Earth': [(0, 3), (3, 399)], 'Mercury': [(0, 1), (1, 199)], 'Jupiter': [(0, 5)], 'Uranus': [(0, 7)]}
NAIF = {'Mercury': 199, 'Jupiter': 5, 'Uranus': 7}
spk = SPK.open(sys.argv[1])


def pos(name, t):
    return sum(spk[a, b].compute(2400000.5, t - 2400000.5) for a, b in CHAINS[name]) / AU


def vel(name, t):
    return sum(spk[a, b].compute_and_differentiate(2400000.5, t - 2400000.5)[1] for a, b in CHAINS[name]) / AU


def at(body, jd):
    t = jd + erfa.dtdb(2400000.5, jd - 2400000.5, 0, 0, 0, 0) / 86400
    e, ev, s = pos('Earth', t), vel('Earth', t), pos('Sun', t)
    lt = 0.0
    for _ in range(20):
        b = pos(body, t - lt); lt = np.linalg.norm(b - e) / C
    p = (b - e) / np.linalg.norm(b - e)
    sun = pos('Sun', t - np.linalg.norm(s - e) / C) - e
    d = np.linalg.norm(sun)
    ratio = math.atan2(np.linalg.norm(np.cross(p, sun / d)), float(p @ sun / d)) / math.asin(695700 / AU / d)
    q = b - pos('Sun', t - lt); q /= np.linalg.norm(q)
    eh = e - s; em = np.linalg.norm(eh)
    vv = ev / C; bm1 = math.sqrt(1 - float(vv @ vv))
    N = erfa.pnm06a(2400000.5, jd - 2400000.5)
    bent = erfa.ab(erfa.ld(1.0, p, q, eh / em, em, 1e-6 / max(em * em, 1.0)), vv, em, bm1)
    straight = erfa.ab(p, vv, em, bm1)
    return N @ bent, N @ straight, ratio, d * AU


def unit(ra, dec):
    ra, dec = math.radians(ra), math.radians(dec)
    return np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])


def ang(a, b):
    return math.atan2(np.linalg.norm(np.cross(a, b)), float(a @ b)) * AS


CROSSINGS = (('Mercury', 2434871.243148, 2434871.243217), ('Mercury', 2434871.677459, 2434871.677528),
             ('Uranus', 2462291.891376, 2462291.891445), ('Jupiter', 2463232.476753, 2463232.476823),
             ('Jupiter', 2463233.164600, 2463233.164669))
print('body, the two Horizons instants (TT) between which it changes, how, the fraction there, and Horizons\'s edge'
      ' inside the engine\'s, arcseconds; then each response\'s SHA-256')
for body, a, b in CROSSINGS:
    rows, digest = fetch(NAIF[body], a, b, '10')
    prev = None
    for jd, ra, dec in rows:
        bent, straight, ratio, d = at(body, jd)
        h = unit(ra, dec)
        side = 'bent' if ang(bent, h) < ang(straight, h) else 'straight'
        if prev and side != prev[0]:
            radius = math.asin(695700 / d) * AS
            lo, hi = sorted((prev[2], ratio))
            print(f'{body:8} {prev[1]:.6f}..{jd:.6f} {prev[0]}->{side} fraction {lo:.7f}..{hi:.7f}'
                  f' edge inside by {(1 - hi) * radius:.3f}..{(1 - lo) * radius:.3f}" (radius {radius:.2f}")')
        prev = (side, jd, ratio)
    print(f'         response {digest}')
