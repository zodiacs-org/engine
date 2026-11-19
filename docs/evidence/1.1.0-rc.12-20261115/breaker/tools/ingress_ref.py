"""Breaker rc.12, item 7: the reference instant of the Sun's apparent geocentric longitude reaching 240 degrees
in the IAU 2006/2000A true ecliptic of date on 2026-11-22, from NAIF's de440.bsp by this review's reduction
(light time, erfa.ab; the Sun has no deflection), bisected in TT; UTC = TT - 69.184 s (TAI - UTC = 37 s).
  python ingress_ref.py de440.bsp out.json"""
import json, sys, math, datetime
import numpy as np, erfa
from jplephem.spk import SPK
AU = 149597870.7; C = 299792.458 * 86400 / AU
k = SPK.open(sys.argv[1]); SEG = {(s.center, s.target): s for s in k.segments}
def st(chain, t):
    p = np.zeros(3); v = np.zeros(3)
    for key in chain:
        a, b = SEG[key].compute_and_differentiate(t); p += a; v += b
    return p / AU, v / AU
def lon(tt):
    t = tt + erfa.dtdb(2451545.0, tt - 2451545.0, 0, 0, 0, 0) / 86400
    e, ev = st([(0, 3), (3, 399)], t); lt = 0
    for _ in range(8):
        s, _ = st([(0, 10)], t - lt); d = s - e; lt = np.linalg.norm(d) / C
    v = ev / C; p = erfa.ab(d / np.linalg.norm(d), v, np.linalg.norm(d), math.sqrt(1 - float(v @ v)))
    d1, d2 = 2400000.5, tt - 2400000.5
    dpsi, deps = erfa.nut06a(d1, d2); m = erfa.rx(erfa.obl06(d1, d2) + deps, np.eye(3)) @ erfa.pnm06a(d1, d2)
    x = m @ p; return math.degrees(math.atan2(x[1], x[0])) % 360
BASE = 2461366.5  # 2026-11-22 00:00 TT; the bisection runs on days past it (a double near 2.46e6 days resolves 40 microseconds)
a, b = 0.0, 1.0
assert lon(BASE + a) < 240 < lon(BASE + b)
for _ in range(40):
    m = (a + b) / 2
    if lon(BASE + m) < 240: a = m
    else: b = m
tt = BASE + (a + b) / 2; utc_s = (a + b) / 2 * 86400 - 69.184
out = {'jdTt': tt, 'utc': '2026-11-22T%02d:%02d:%06.3fZ' % (utc_s // 3600, utc_s % 3600 // 60, utc_s % 60), 'ttMinusUtcSeconds': 69.184, 'utcSecondsOfDay': utc_s, 'longitudeRateArcsecPerSecond': (lon(BASE + b + 0.01) - lon(BASE + a - 0.01)) / 0.02 / 86400 * 3600}
json.dump(out, open(sys.argv[2], 'w')); print(out)
