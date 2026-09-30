"""The engine's nutation, equation of the equinoxes and sidereal time against
ERFA, from the records nutation-grid.mjs writes to standard input (eight
little-endian doubles each: TT and UT1 in days from J2000.0, dpsi and deps in
arcseconds, the mean and true obliquity in degrees, the equation of the
equinoxes in arcseconds, the apparent sidereal time in hours). Prints, as
JSON, the largest absolute difference of each comparison, in arcseconds, and
the TT instant where it falls; and, ERFA against itself on the same instants,
IAU 2000B (nut00b) against IAU 2006/2000A (nut06a).

    node nutation-grid.mjs <this python> [out.json]
"""
import json
import sys
from datetime import datetime, timedelta

import erfa
import numpy as np

AS = 180 / np.pi * 3600  # radians to arcseconds
J0 = 2451545.0
RECORD = np.dtype([(k, "<f8") for k in ("tt", "ut", "dpsi", "deps", "mobl", "tobl", "ee", "gast")])


def wrap(x):
    """An angle difference in radians, into (-pi, pi]."""
    return (x + np.pi) % (2 * np.pi) - np.pi


worst = {}


def track(name, diff, tt):
    a = np.abs(diff)
    i = int(np.argmax(a))
    if name not in worst or a[i] > worst[name][0]:
        worst[name] = (float(a[i]), float(tt[i]))


samples = 0
stream = sys.stdin.buffer
while True:
    data = stream.read(RECORD.itemsize * 65536)
    if not data:
        break
    r = np.frombuffer(data, dtype=RECORD)
    samples += len(r)
    tt, ut = r["tt"], r["ut"]
    dp, de = erfa.nut00b(J0, tt)
    eps = erfa.obl06(J0, tt)
    ee = erfa.ee00(J0, tt, eps, dp)
    om = erfa.faom03(tt / 36525.0)
    two = dp * np.cos(eps) + (2640.96e-6 * np.sin(om) + 63.52e-6 * np.sin(2 * om)) / AS
    gast = r["gast"] * np.pi / 12
    track("dpsi against nut00b", r["dpsi"] - dp * AS, tt)
    track("deps against nut00b", r["deps"] - de * AS, tt)
    track("mean obliquity against obl06", r["mobl"] * 3600 - eps * AS, tt)
    track("true obliquity against obl06 + nut00b deps", r["tobl"] * 3600 - (eps + de) * AS, tt)
    track("equation of the equinoxes against ee00 (obl06, nut00b)", r["ee"] - ee * AS, tt)
    track("equation of the equinoxes against dpsi cos epsA + the two complementary terms kept", r["ee"] - two * AS, tt)
    track("sidereal time against gmst06 + ee00 (obl06, nut00b)", wrap(gast - (erfa.gmst06(J0, ut, J0, tt) + ee)) * AS, tt)
    track("sidereal time against gst06a", wrap(gast - erfa.gst06a(J0, ut, J0, tt)) * AS, tt)
    track("sidereal time against gst00b", wrap(gast - erfa.gst00b(J0, ut)) * AS, tt)
    a_dp, a_de = erfa.nut06a(J0, tt)
    track("ERFA: nut06a - nut00b, dpsi", (a_dp - dp) * AS, tt)
    track("ERFA: nut06a - nut00b, deps", (a_de - de) * AS, tt)
    track("ERFA: nut06a - nut00b, dpsi cos epsA", (a_dp - dp) * np.cos(eps) * AS, tt)


def when(days):
    instant = datetime(2000, 1, 1, 12) + timedelta(days=days)
    return instant.strftime("%Y-%m-%dT%H:%M TT")


print(json.dumps({
    "python": sys.version.split()[0],
    "pyerfa": erfa.__version__,
    "numpy": np.__version__,
    "samples": samples,
    "unit": "arcseconds; at: the TT instant of the largest difference",
    "largest": {name: {"arcsec": float(f"{v:.4g}"), "ttDays": round(t, 4), "at": when(t)} for name, (v, t) in worst.items()},
}, indent=1))
