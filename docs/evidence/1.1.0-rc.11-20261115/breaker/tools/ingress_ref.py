"""Breaker, item 7: the Sun's ingress into 240 deg of the true ecliptic of date in November 2026 from NAIF's de440.bsp,
by this check's own reduction (calc_check.py's: light time, aberration, IAU 2006/2000A), as UTC with TT - UTC = 69.184 s.
  python ingress_ref.py de440.bsp"""
import sys, math, datetime
sys.argv = [sys.argv[0], sys.argv[1], '/dev/null', '/dev/null']
import importlib.util, json, io, contextlib
src = open(__file__.replace('ingress_ref.py', 'calc_check.py')).read().split("result = {}")[0].replace("sample = json.load(open(sys.argv[2]))", "sample = {}")
exec(src)
def lon(tt):
    v, _ = apparent('Sun', tt, 'erfa')
    return sph(frames(tt)['ecliptic-true-of-date'] @ v)[0]
a, b = 2461366.5, 2461368.5
for _ in range(60):
    m = (a + b) / 2
    if lon(m) < 240: a = m
    else: b = m
tt = (a + b) / 2
utc = datetime.datetime(2000, 1, 1, 12) + datetime.timedelta(days=tt - 2451545.0, seconds=-69.184)
print(json.dumps({'jdTt': tt, 'utc': utc.isoformat() + 'Z', 'ttMinusUtcSeconds': 69.184}))
