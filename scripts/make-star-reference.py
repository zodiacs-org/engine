#!/usr/bin/env python3
"""Write src/fixtures/stars-erfa.json, the fixed-star test reference (development only).

The reference is computed by ERFA (pyerfa), independently of the engine and of
Ephemera's code: eraAtci13 (IAU 2006/2000A, ERFA's own Earth ephemeris
eraEpv00) gives the apparent CIRS place, the equation of the origins turns it
to the true equinox, and the true obliquity (eraObl06 plus eraNut06a)
turns it to the true ecliptic of date. Input is the catalogue in
src/stars-data.ts. No Swiss Ephemeris output is used.

    python3 -m venv /tmp/erfa && /tmp/erfa/bin/pip install pyerfa numpy
    /tmp/erfa/bin/python scripts/make-star-reference.py
"""
import json
import math
import re

import erfa

DATES = [2415020.0, 2451545.0, 2461406.5, 2488070.0]  # TT: 1900.0, J2000.0, 2027-01-01, 2100.0
rows = re.findall(r'^  \[(.*)\],$', open("src/stars-data.ts").read(), re.M)
cases = []
for line in rows:
    parts = json.loads("[" + line + "]")
    name, _, _, _, ra, dec, pmra, pmdec, px, rv = parts
    pr = pmra / 1000 / 3600 * math.pi / 180 / math.cos(dec)
    pd = pmdec / 1000 / 3600 * math.pi / 180
    for jd in DATES:
        ri, di, eo = erfa.atci13(ra, dec, pr, pd, px / 1000, rv if px > 0 else 0.0, jd, 0.0)
        a = erfa.anp(ri - eo)
        dpsi, deps = erfa.nut06a(jd, 0.0)
        eps = erfa.obl06(jd, 0.0) + deps
        x, y, z = math.cos(di) * math.cos(a), math.cos(di) * math.sin(a), math.sin(di)
        ye = math.cos(eps) * y + math.sin(eps) * z
        ze = -math.sin(eps) * y + math.cos(eps) * z
        lon = math.degrees(math.atan2(ye, x)) % 360.0
        lat = math.degrees(math.atan2(ze, math.hypot(x, ye)))
        cases.append([name, jd, round(lon, 9), round(lat, 9)])
json.dump({"source": "ERFA " + erfa.__version__ + " via pyerfa: atci13, nut06a, obl06; apparent, true ecliptic of date; dates are JD TT (TDB taken equal to TT)",
           "cases": cases}, open("src/fixtures/stars-erfa.json", "w"), separators=(",", ":"))
print(len(cases))
